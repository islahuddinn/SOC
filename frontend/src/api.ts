import type {
  AppConfig,
  CreateSupportRequestResponse,
  DashboardStats,
  Escalation,
  EscalationDetail,
  Order,
  QueueItem,
  RefundRecord,
  SupportRequestDetail,
} from '@soc/shared';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiClientError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super(typeof data === 'object' && data !== null && 'message' in data
      ? String((data as { message: string }).message)
      : `Request failed (${status})`);
    this.status = status;
    this.data = data;
  }
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(`${API_BASE}${url}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...options,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiClientError(res.status, data);
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  getConfig: () => fetchJson<AppConfig>('/config'),
  getStats: () => fetchJson<DashboardStats>('/stats'),
  getOrders: () => fetchJson<Order[]>('/orders'),
  getQueue: () => fetchJson<QueueItem[]>('/queue'),
  getSupportRequest: (id: number) => fetchJson<SupportRequestDetail>(`/support-requests/${id}`),
  getEscalation: (id: number) => fetchJson<EscalationDetail>(`/escalations/${id}`),
  getPendingEscalations: () => fetchJson<Escalation[]>('/escalations/pending'),
  createSupportRequest: (customer_email: string, message: string) =>
    fetchJson<CreateSupportRequestResponse>('/support-requests', {
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
  getRefunds: () => fetchJson<RefundRecord[]>('/refunds'),
};
