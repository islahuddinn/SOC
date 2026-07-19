import type {
  AgentRun,
  Escalation,
  Order,
  OrderItem,
  QueueItem,
  SupportRequest,
  SupportRequestDetail,
  ToolCallRecord,
} from '@soc/shared';
import { pool } from '../db/pool';
import { runAgentLoop } from '../agent/agentLoop';

function mapSupportRequest(row: Record<string, unknown>): SupportRequest {
  return {
    id: Number(row.id),
    customer_email: String(row.customer_email),
    message: String(row.message),
    status: row.status as SupportRequest['status'],
    outcome: row.outcome ? String(row.outcome) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapAgentRun(row: Record<string, unknown>): AgentRun {
  return {
    id: Number(row.id),
    support_request_id: Number(row.support_request_id),
    model: String(row.model),
    reasoning_summary: row.reasoning_summary ? String(row.reasoning_summary) : null,
    decision: row.decision as AgentRun['decision'],
    created_at: String(row.created_at),
  };
}

function mapEscalation(row: Record<string, unknown>): Escalation {
  return {
    id: Number(row.id),
    support_request_id: Number(row.support_request_id),
    agent_run_id: Number(row.agent_run_id),
    action_type: row.action_type as Escalation['action_type'],
    order_id: row.order_id != null ? Number(row.order_id) : null,
    proposed_amount: row.proposed_amount != null ? Number(row.proposed_amount) : null,
    reason: String(row.reason),
    agent_reasoning: String(row.agent_reasoning),
    status: row.status as Escalation['status'],
    rejection_reason: row.rejection_reason ? String(row.rejection_reason) : null,
    approved_by: row.approved_by ? String(row.approved_by) : null,
    approved_at: row.approved_at ? String(row.approved_at) : null,
    executed_at: row.executed_at ? String(row.executed_at) : null,
    execution_error: row.execution_error ? String(row.execution_error) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function createSupportRequest(
  customerEmail: string,
  message: string
): Promise<{ request: SupportRequest; agentResult: Awaited<ReturnType<typeof runAgentLoop>> }> {
  const result = await pool.query(
    `INSERT INTO support_requests (customer_email, message) VALUES ($1, $2) RETURNING *`,
    [customerEmail, message]
  );
  const request = mapSupportRequest(result.rows[0]);
  const agentResult = await runAgentLoop(request.id, customerEmail, message);
  const updated = await pool.query('SELECT * FROM support_requests WHERE id = $1', [request.id]);
  return { request: mapSupportRequest(updated.rows[0]), agentResult };
}

export async function getQueue(): Promise<QueueItem[]> {
  const result = await pool.query(`
    SELECT sr.*,
      ar.id as ar_id, ar.model as ar_model, ar.reasoning_summary as ar_reasoning,
      ar.decision as ar_decision, ar.created_at as ar_created_at,
      e.id as e_id, e.action_type as e_action_type, e.order_id as e_order_id,
      e.proposed_amount as e_proposed_amount, e.reason as e_reason,
      e.agent_reasoning as e_agent_reasoning, e.status as e_status,
      e.rejection_reason as e_rejection_reason, e.approved_by as e_approved_by,
      e.approved_at as e_approved_at, e.executed_at as e_executed_at,
      e.execution_error as e_execution_error, e.created_at as e_created_at,
      e.updated_at as e_updated_at, e.support_request_id as e_support_request_id,
      e.agent_run_id as e_agent_run_id
    FROM support_requests sr
    LEFT JOIN LATERAL (
      SELECT * FROM agent_runs WHERE support_request_id = sr.id ORDER BY created_at DESC LIMIT 1
    ) ar ON true
    LEFT JOIN LATERAL (
      SELECT * FROM escalations WHERE support_request_id = sr.id ORDER BY created_at DESC LIMIT 1
    ) e ON true
    ORDER BY sr.created_at DESC
  `);

  return result.rows.map((row) => {
    const request = mapSupportRequest(row);
    const latest_agent_run: AgentRun | null = row.ar_id
      ? {
          id: Number(row.ar_id),
          support_request_id: request.id,
          model: String(row.ar_model),
          reasoning_summary: row.ar_reasoning ? String(row.ar_reasoning) : null,
          decision: row.ar_decision as AgentRun['decision'],
          created_at: String(row.ar_created_at),
        }
      : null;

    const latest_escalation: Escalation | null = row.e_id
      ? mapEscalation({
          id: row.e_id,
          support_request_id: row.e_support_request_id,
          agent_run_id: row.e_agent_run_id,
          action_type: row.e_action_type,
          order_id: row.e_order_id,
          proposed_amount: row.e_proposed_amount,
          reason: row.e_reason,
          agent_reasoning: row.e_agent_reasoning,
          status: row.e_status,
          rejection_reason: row.e_rejection_reason,
          approved_by: row.e_approved_by,
          approved_at: row.e_approved_at,
          executed_at: row.e_executed_at,
          execution_error: row.e_execution_error,
          created_at: row.e_created_at,
          updated_at: row.e_updated_at,
        })
      : null;

    return { ...request, latest_agent_run, latest_escalation };
  });
}

export async function getSupportRequestDetail(id: number): Promise<SupportRequestDetail | null> {
  const srResult = await pool.query('SELECT * FROM support_requests WHERE id = $1', [id]);
  if (srResult.rows.length === 0) return null;

  const request = mapSupportRequest(srResult.rows[0]);

  const runsResult = await pool.query(
    'SELECT * FROM agent_runs WHERE support_request_id = $1 ORDER BY created_at',
    [id]
  );
  const agent_runs = runsResult.rows.map(mapAgentRun);

  const toolsResult = await pool.query(
    `SELECT tc.* FROM tool_calls tc
     JOIN agent_runs ar ON tc.agent_run_id = ar.id
     WHERE ar.support_request_id = $1
     ORDER BY tc.created_at`,
    [id]
  );
  const tool_calls: ToolCallRecord[] = toolsResult.rows.map((row) => ({
    id: Number(row.id),
    agent_run_id: Number(row.agent_run_id),
    tool_name: String(row.tool_name),
    arguments: row.arguments as Record<string, unknown>,
    result: row.result as Record<string, unknown>,
    created_at: String(row.created_at),
  }));

  const escResult = await pool.query(
    'SELECT * FROM escalations WHERE support_request_id = $1 ORDER BY created_at',
    [id]
  );
  const escalations = escResult.rows.map(mapEscalation);

  return { ...request, agent_runs, tool_calls, escalations };
}

export async function getEscalationDetail(id: number): Promise<{
  escalation: Escalation;
  supportRequest: SupportRequest;
  agentRuns: AgentRun[];
  toolCalls: ToolCallRecord[];
  order: Order | null;
  orderItems: OrderItem[];
} | null> {
  const escResult = await pool.query('SELECT * FROM escalations WHERE id = $1', [id]);
  if (escResult.rows.length === 0) return null;

  const escalation = mapEscalation(escResult.rows[0]);
  const detail = await getSupportRequestDetail(escalation.support_request_id);
  if (!detail) return null;

  let order: Order | null = null;
  let orderItems: OrderItem[] = [];

  if (escalation.order_id != null && escalation.order_id > 0) {
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [escalation.order_id]);
    if (orderResult.rows.length > 0) {
      const row = orderResult.rows[0];
      order = {
        id: Number(row.id),
        customer_email: String(row.customer_email),
        customer_name: String(row.customer_name),
        status: row.status,
        total_amount: Number(row.total_amount),
        refunded_amount: Number(row.refunded_amount),
        shipped_at: row.shipped_at ? String(row.shipped_at) : null,
        created_at: String(row.created_at),
      };

      const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [escalation.order_id]);
      orderItems = itemsResult.rows.map((r) => ({
        id: Number(r.id),
        order_id: Number(r.order_id),
        product_name: String(r.product_name),
        quantity: Number(r.quantity),
        unit_price: Number(r.unit_price),
      }));
    }
  }

  return {
    escalation,
    supportRequest: detail,
    agentRuns: detail.agent_runs,
    toolCalls: detail.tool_calls,
    order,
    orderItems,
  };
}

export async function getPendingEscalations(): Promise<Escalation[]> {
  const result = await pool.query(
    `SELECT * FROM escalations WHERE status = 'pending' ORDER BY created_at ASC`
  );
  return result.rows.map(mapEscalation);
}

export async function getRefunds(): Promise<unknown[]> {
  const result = await pool.query(`
    SELECT r.*, o.customer_email, o.total_amount as order_total
    FROM refunds r
    JOIN orders o ON r.order_id = o.id
    ORDER BY r.created_at DESC
  `);
  return result.rows;
}
