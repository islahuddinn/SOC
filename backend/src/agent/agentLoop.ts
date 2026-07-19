import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { pool } from '../db/pool';
import { getOrderWithItems, getOrdersByEmail } from '../services/orderService';
import { validateRefund, validateCancellation, validateReplacement } from '../guardrails';
import { executeCancellation } from '../services/actionExecutor';
import { createChatCompletion, getLlmConfig } from '../llm/provider';
import { AGENT_TOOLS, SYSTEM_PROMPT } from '../llm/tools';

interface ToolContext {
  supportRequestId: number;
  agentRunId: number;
  customerEmail: string;
}

async function recordToolCall(
  agentRunId: number,
  toolName: string,
  args: Record<string, unknown>,
  result: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `INSERT INTO tool_calls (agent_run_id, tool_name, arguments, result) VALUES ($1, $2, $3, $4)`,
    [agentRunId, toolName, JSON.stringify(args), JSON.stringify(result)]
  );
}

async function createEscalation(
  ctx: ToolContext,
  actionType: 'refund' | 'cancel' | 'replacement' | 'general',
  orderId: number | null,
  reason: string,
  agentReasoning: string,
  proposedAmount: number | null
): Promise<Record<string, unknown>> {
  try {
    const result = await pool.query(
      `INSERT INTO escalations
       (support_request_id, agent_run_id, action_type, order_id, proposed_amount, reason, agent_reasoning, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING id`,
      [ctx.supportRequestId, ctx.agentRunId, actionType, orderId, proposedAmount, reason, agentReasoning]
    );

    await pool.query(
      `UPDATE support_requests SET status = 'escalated', updated_at = NOW() WHERE id = $1`,
      [ctx.supportRequestId]
    );

    return {
      success: true,
      escalated: true,
      escalation_id: result.rows[0].id,
      message: `Escalated ${actionType}${orderId ? ` for order ${orderId}` : ''} to human reviewer.`,
    };
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '23505') {
      return {
        success: false,
        escalated: false,
        message: 'A pending escalation already exists for this order and action.',
      };
    }
    throw err;
  }
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<Record<string, unknown>> {
  switch (name) {
    case 'lookup_order': {
      const orderId = Number(args.order_id);
      const data = await getOrderWithItems(orderId);
      if (!data) {
        return { found: false, error: `Order ${orderId} not found.` };
      }
      const isOwner = data.order.customer_email.toLowerCase() === ctx.customerEmail.toLowerCase();
      return {
        found: true,
        is_owner: isOwner,
        order: {
          id: data.order.id,
          status: data.order.status,
          total_amount: data.order.total_amount,
          refunded_amount: data.order.refunded_amount,
          remaining_refundable: Number(data.order.total_amount) - Number(data.order.refunded_amount),
          shipped_at: data.order.shipped_at,
          customer_name: isOwner ? data.order.customer_name : '[redacted]',
        },
        items: isOwner
          ? data.items.map((i) => ({ product: i.product_name, qty: i.quantity, price: i.unit_price }))
          : [],
        access_denied: !isOwner ? 'This order belongs to another customer.' : undefined,
      };
    }

    case 'list_customer_orders': {
      const orders = await getOrdersByEmail(ctx.customerEmail);
      return {
        orders: orders.map((o) => ({
          id: o.id,
          status: o.status,
          total: o.total_amount,
          refunded: o.refunded_amount,
          shipped_at: o.shipped_at,
        })),
      };
    }

    case 'request_refund': {
      const orderId = Number(args.order_id);
      const amount = Number(args.amount);
      const reason = String(args.reason);
      const order = await getOrderWithItems(orderId);

      if (!order) {
        return { success: false, error: `Order ${orderId} not found.` };
      }

      const guardrail = validateRefund({
        order: order.order,
        amount,
        requesterEmail: ctx.customerEmail,
      });

      if (!guardrail.allowed) {
        return { success: false, blocked_by_guardrail: true, reason: guardrail.reason };
      }

      return createEscalation(
        ctx,
        'refund',
        orderId,
        reason,
        `Agent requested refund of $${amount.toFixed(2)}: ${reason}`,
        amount
      );
    }

    case 'request_cancellation': {
      const orderId = Number(args.order_id);
      const reason = String(args.reason);
      const data = await getOrderWithItems(orderId);

      if (!data) {
        return { success: false, error: `Order ${orderId} not found.` };
      }

      const guardrail = validateCancellation({
        order: data.order,
        requesterEmail: ctx.customerEmail,
      });

      if (!guardrail.allowed) {
        return { success: false, blocked_by_guardrail: true, reason: guardrail.reason };
      }

      if (guardrail.requiresEscalation) {
        return createEscalation(ctx, 'cancel', orderId, reason, `Agent requested cancellation: ${reason}`, null);
      }

      const execResult = await executeCancellation({
        orderId,
        requesterEmail: ctx.customerEmail,
      });

      if (execResult.success) {
        await pool.query(
          `UPDATE support_requests SET status = 'completed', outcome = $2, updated_at = NOW() WHERE id = $1`,
          [ctx.supportRequestId, execResult.message]
        );
      }

      return {
        success: execResult.success,
        auto_executed: execResult.success,
        message: execResult.message,
      };
    }

    case 'request_replacement': {
      const orderId = Number(args.order_id);
      const reason = String(args.reason);
      const order = await getOrderWithItems(orderId);

      const guardrail = validateReplacement({
        order: order?.order ?? null,
        orderId,
        requesterEmail: ctx.customerEmail,
      });

      if (!guardrail.allowed) {
        return { success: false, blocked_by_guardrail: true, reason: guardrail.reason };
      }

      return createEscalation(ctx, 'replacement', orderId, reason, `Agent requested replacement: ${reason}`, null);
    }

    case 'escalate_to_human': {
      return createEscalation(
        ctx,
        'general',
        null,
        String(args.reason),
        String(args.summary),
        null
      );
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export interface AgentRunResult {
  agentRunId: number;
  decision: 'auto_executed' | 'escalated' | 'no_action' | 'failed';
  reasoningSummary: string;
  outcome: string;
}

const MAX_AGENT_ITERATIONS = 10;

export async function runAgentLoop(
  supportRequestId: number,
  customerEmail: string,
  message: string
): Promise<AgentRunResult> {
  await pool.query(
    `UPDATE support_requests SET status = 'processing', updated_at = NOW() WHERE id = $1`,
    [supportRequestId]
  );

  const llmConfig = getLlmConfig();
  const modelLabel = `${llmConfig.provider}:${llmConfig.model}`;

  const runResult = await pool.query(
    `INSERT INTO agent_runs (support_request_id, model, decision) VALUES ($1, $2, 'no_action') RETURNING id`,
    [supportRequestId, modelLabel]
  );
  const agentRunId = Number(runResult.rows[0].id);
  const ctx: ToolContext = { supportRequestId, agentRunId, customerEmail };

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Customer email: ${customerEmail}\n\nCustomer message:\n${message}` },
  ];

  let decision: AgentRunResult['decision'] = 'no_action';
  let reasoningSummary = '';
  let outcome = '';

  try {
    for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
      const response = await createChatCompletion({
        model: llmConfig.model,
        messages,
        tools: AGENT_TOOLS,
      });

      const choice = response.choices[0];
      if (!choice) break;

      const assistantMessage = choice.message;
      messages.push({
        role: 'assistant',
        content: assistantMessage.content,
        tool_calls: assistantMessage.tool_calls?.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      });

      if (assistantMessage.content) {
        reasoningSummary = assistantMessage.content;
      }

      if (!assistantMessage.tool_calls?.length) {
        outcome = assistantMessage.content || 'Agent completed without further action.';
        break;
      }

      for (const toolCall of assistantMessage.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          args = {};
        }

        const result = await executeTool(toolCall.function.name, args, ctx);
        await recordToolCall(agentRunId, toolCall.function.name, args, result);

        if (result.auto_executed) {
          decision = 'auto_executed';
          outcome = String(result.message);
        } else if (result.escalated) {
          decision = 'escalated';
          outcome = String(result.message);
        } else if (result.blocked_by_guardrail) {
          outcome = `Guardrail blocked: ${result.reason}`;
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    const srStatus = await pool.query('SELECT status, outcome FROM support_requests WHERE id = $1', [supportRequestId]);
    if (srStatus.rows[0]?.status === 'escalated') {
      decision = 'escalated';
    } else if (srStatus.rows[0]?.status === 'completed') {
      decision = 'auto_executed';
    }

    if (srStatus.rows[0]?.outcome) {
      outcome = srStatus.rows[0].outcome;
    }

    await pool.query(
      `UPDATE agent_runs SET reasoning_summary = $2, decision = $3 WHERE id = $1`,
      [agentRunId, reasoningSummary, decision]
    );

    if (decision !== 'escalated' && decision !== 'auto_executed') {
      await pool.query(
        `UPDATE support_requests SET status = 'completed', outcome = $2, updated_at = NOW() WHERE id = $1 AND status = 'processing'`,
        [supportRequestId, outcome || 'No action taken.']
      );
    }

    return { agentRunId, decision, reasoningSummary, outcome };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown agent error';
    await pool.query(
      `UPDATE agent_runs SET reasoning_summary = $2, decision = 'failed' WHERE id = $1`,
      [agentRunId, errorMsg]
    );
    await pool.query(
      `UPDATE support_requests SET status = 'failed', outcome = $2, updated_at = NOW() WHERE id = $1`,
      [supportRequestId, errorMsg]
    );
    return { agentRunId, decision: 'failed', reasoningSummary: errorMsg, outcome: errorMsg };
  }
}

/** Process agent in background — avoids HTTP timeout on long LLM runs (Render 30s limit). */
export function scheduleAgentRun(supportRequestId: number, customerEmail: string, message: string): void {
  setImmediate(() => {
    runAgentLoop(supportRequestId, customerEmail, message).catch((err) => {
      console.error(`Background agent failed for request ${supportRequestId}:`, err);
    });
  });
}
