export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export type SupportRequestStatus =
  | 'received'
  | 'processing'
  | 'completed'
  | 'escalated'
  | 'failed';

export type EscalationStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

export type ActionType = 'refund' | 'cancel' | 'replacement' | 'general';

export type RefundStatus = 'pending' | 'completed' | 'failed';

export type LlmProviderName = 'openai' | 'groq';

export interface Order {
  id: number;
  customer_email: string;
  customer_name: string;
  status: OrderStatus;
  total_amount: number;
  refunded_amount: number;
  shipped_at: string | null;
  created_at: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
}

export interface SupportRequest {
  id: number;
  customer_email: string;
  message: string;
  status: SupportRequestStatus;
  outcome: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentRun {
  id: number;
  support_request_id: number;
  model: string;
  reasoning_summary: string | null;
  decision: 'auto_executed' | 'escalated' | 'no_action' | 'failed';
  created_at: string;
}

export interface ToolCallRecord {
  id: number;
  agent_run_id: number;
  tool_name: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown>;
  created_at: string;
}

export interface Escalation {
  id: number;
  support_request_id: number;
  agent_run_id: number;
  action_type: ActionType;
  order_id: number | null;
  proposed_amount: number | null;
  reason: string;
  agent_reasoning: string;
  status: EscalationStatus;
  rejection_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  executed_at: string | null;
  execution_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Refund {
  id: number;
  order_id: number;
  escalation_id: number | null;
  support_request_id: number | null;
  amount: number;
  status: RefundStatus;
  created_at: string;
}

export interface RefundRecord {
  id: number;
  order_id: number;
  amount: number;
  status: RefundStatus;
  customer_email: string;
  order_total: number;
  created_at: string;
}

export interface SupportRequestDetail extends SupportRequest {
  agent_runs: AgentRun[];
  tool_calls: ToolCallRecord[];
  escalations: Escalation[];
}

export interface QueueItem extends SupportRequest {
  latest_agent_run: AgentRun | null;
  latest_escalation: Escalation | null;
}

export interface EscalationDetail {
  escalation: Escalation;
  supportRequest: SupportRequestDetail;
  agentRuns: AgentRun[];
  toolCalls: ToolCallRecord[];
  order: Order | null;
  orderItems: OrderItem[];
}

export interface DashboardStats {
  total_requests: number;
  escalated: number;
  processing: number;
  pending_reviews: number;
  completed_refunds: number;
  auto_executed: number;
}

export interface AppConfig {
  llm: {
    provider: LlmProviderName;
    model: string;
    configured: boolean;
  };
  providers: Array<{
    name: LlmProviderName;
    configured: boolean;
    model: string;
  }>;
}

export interface GuardrailResult {
  allowed: boolean;
  reason: string;
  requiresEscalation: boolean;
}

export interface CreateSupportRequestResponse {
  request: SupportRequest;
  processing: true;
}

export interface ApiError {
  error: string | Record<string, unknown>;
  message?: string;
}
