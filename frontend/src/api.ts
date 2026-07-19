import type {
  Escalation,
  QueueItem,
  SupportRequestDetail,
} from '@soc/shared';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw { status: res.status, ...data };
  }
  return data as T;
}

export const api = {
  getQueue: () => fetchJson<QueueItem[]>('/queue'),
  getSupportRequest: (id: number) => fetchJson<SupportRequestDetail>(`/support-requests/${id}`),
  getEscalation: (id: number) => fetchJson<EscalationDetail>(`/escalations/${id}`),
  getPendingEscalations: () => fetchJson<Escalation[]>('/escalations/pending'),
  createSupportRequest: (customer_email: string, message: string) =>
    fetchJson<{ request: QueueItem; agentResult: unknown }>('/support-requests', {
      method: 'POST',
      body: JSON.stringify({ customer_email, message }),
    }),
  approveEscalation: (id: number, reviewer: string) =>
    fetchJson<{ success: boolean; message: string; escalation?: Escalation }>(
      `/escalations/${id}/approve`,
      { method: 'POST', body: JSON.stringify({ reviewer }) }
    ),
  rejectEscalation: (id: number, reviewer: string, reason: string) =>
    fetchJson<{ success: boolean; message: string; escalation?: Escalation }>(
      `/escalations/${id}/reject`,
      { method: 'POST', body: JSON.stringify({ reviewer, reason }) }
    ),
  getRefunds: () => fetchJson<unknown[]>('/refunds'),
};

export interface EscalationDetail {
  escalation: Escalation;
  supportRequest: SupportRequestDetail;
  agentRuns: SupportRequestDetail['agent_runs'];
  toolCalls: SupportRequestDetail['tool_calls'];
  order: {
    id: number;
    customer_email: string;
    customer_name: string;
    status: string;
    total_amount: number;
    refunded_amount: number;
    shipped_at: string | null;
  } | null;
  orderItems: Array<{ product_name: string; quantity: number; unit_price: number }>;
}
