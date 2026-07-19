import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import OpenAI from 'openai';
import { pool } from '../db/pool';
import { getOrderWithItems, getOrdersByEmail } from '../services/orderService';
import { validateRefund, validateCancellation, validateReplacement } from '../guardrails';
import { executeRefund, executeCancellation } from '../services/actionExecutor';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'lookup_order',
      description: 'Look up an order by ID. Returns order details and line items. Use to verify order exists before taking action.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'number', description: 'The order ID to look up' },
        },
        required: ['order_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_customer_orders',
      description: 'List all orders for the requesting customer email.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_refund',
      description: 'Request a refund for an order. May auto-execute or escalate based on guardrails and policy.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'number' },
          amount: { type: 'number', description: 'Refund amount in dollars' },
          reason: { type: 'string', description: 'Reason for the refund' },
        },
        required: ['order_id', 'amount', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_cancellation',
      description: 'Request cancellation of an order that has not shipped.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['order_id', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_replacement',
      description: 'Request a replacement for damaged or defective items. Always escalates to human review.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['order_id', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'escalate_to_human',
      description: 'Escalate the request to a human reviewer when you cannot resolve automatically or policy requires it.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Why human review is needed' },
          summary: { type: 'string', description: 'Summary of the situation for the reviewer' },
        },
        required: ['reason', 'summary'],
      },
    },
  },
];

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
  actionType: 'refund' | 'cancel' | 'replacement',
  orderId: number,
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
      message: `Escalated ${actionType} for order ${orderId} to human reviewer.`,
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
          ? data.items.map((i: { product_name: string; quantity: number; unit_price: number }) => ({ product: i.product_name, qty: i.quantity, price: i.unit_price }))
          : [],
        access_denied: !isOwner ? 'This order belongs to another customer.' : undefined,
      };
    }

    case 'list_customer_orders': {
      const orders = await getOrdersByEmail(ctx.customerEmail);
      return {
        orders: orders.map((o: { id: number; status: string; total_amount: number; refunded_amount: number; shipped_at: string | null }) => ({
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

      // Store policy: refunds always escalate
      const result = await createEscalation(
        ctx,
        'refund',
        orderId,
        reason,
        `Agent requested refund of $${amount.toFixed(2)}: ${reason}`,
        amount
      );
      return result;
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
        return createEscalation(
          ctx,
          'cancel',
          orderId,
          reason,
          `Agent requested cancellation: ${reason}`,
          null
        );
      }

      // Auto-execute safe unshipped cancellations
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

      return createEscalation(
        ctx,
        'replacement',
        orderId,
        reason,
        `Agent requested replacement: ${reason}`,
        null
      );
    }

    case 'escalate_to_human': {
      const result = await pool.query(
        `INSERT INTO escalations
         (support_request_id, agent_run_id, action_type, order_id, reason, agent_reasoning, status)
         VALUES ($1, $2, 'replacement', NULL, $3, $4, 'pending')
         RETURNING id`,
        [ctx.supportRequestId, ctx.agentRunId, String(args.reason), String(args.summary)]
      );

      await pool.query(
        `UPDATE support_requests SET status = 'escalated', outcome = $2, updated_at = NOW() WHERE id = $1`,
        [ctx.supportRequestId, String(args.summary)]
      );

      return {
        success: true,
        escalated: true,
        escalation_id: result.rows[0].id,
        message: String(args.summary),
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

const SYSTEM_PROMPT = `You are a support agent for an e-commerce store. Your job is to help customers with order issues.

IMPORTANT RULES:
1. Always look up order information before taking action.
2. Verify the order belongs to the customer (lookup_order shows is_owner).
3. Use the appropriate tool for refunds, cancellations, or replacements.
4. Refunds and replacements typically require human approval — use request_refund or request_replacement.
5. Cancellations can be auto-processed if the order hasn't shipped.
6. If unsure, blocked by guardrails, or the request is ambiguous, use escalate_to_human.
7. Never invent order IDs — always verify with lookup_order first.
8. Be concise in your reasoning.

Customer email is provided in context. Only act on orders belonging to this customer.`;

export interface AgentRunResult {
  agentRunId: number;
  decision: 'auto_executed' | 'escalated' | 'no_action' | 'failed';
  reasoningSummary: string;
  outcome: string;
}

export async function runAgentLoop(
  supportRequestId: number,
  customerEmail: string,
  message: string
): Promise<AgentRunResult> {
  await pool.query(
    `UPDATE support_requests SET status = 'processing', updated_at = NOW() WHERE id = $1`,
    [supportRequestId]
  );

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const runResult = await pool.query(
    `INSERT INTO agent_runs (support_request_id, model, decision) VALUES ($1, $2, 'no_action') RETURNING id`,
    [supportRequestId, model]
  );
  const agentRunId = Number(runResult.rows[0].id);

  const ctx: ToolContext = { supportRequestId, agentRunId, customerEmail };

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Customer email: ${customerEmail}\n\nCustomer message:\n${message}`,
    },
  ];

  let decision: AgentRunResult['decision'] = 'no_action';
  let reasoningSummary = '';
  let outcome = '';
  const maxIterations = 10;

  try {
    for (let i = 0; i < maxIterations; i++) {
      const response = await openai.chat.completions.create({
        model,
        messages,
        tools: AGENT_TOOLS,
        tool_choice: 'auto',
      });

      const choice = response.choices[0];
      if (!choice) break;

      const assistantMessage = choice.message;
      messages.push(assistantMessage);

      if (assistantMessage.content) {
        reasoningSummary = assistantMessage.content;
      }

      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        outcome = assistantMessage.content || 'Agent completed without further action.';
        break;
      }

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.type !== 'function') continue;

        const args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
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
