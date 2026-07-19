import type { QueueItem } from '@soc/shared';

export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'escalated': return 'badge-escalated';
    case 'completed': return 'badge-completed';
    case 'processing':
    case 'received': return 'badge-processing';
    case 'failed': return 'badge-failed';
    case 'pending': return 'badge-pending';
    default: return 'badge-processing';
  }
}

export function queueStatusLabel(item: QueueItem): { label: string; className: string } {
  if (item.latest_escalation?.status === 'pending') {
    return { label: 'Needs Review', className: 'badge-pending' };
  }
  if (item.latest_agent_run?.decision === 'auto_executed') {
    return { label: 'Auto Executed', className: 'badge-auto' };
  }
  if (item.status === 'escalated') {
    return { label: 'Escalated', className: 'badge-escalated' };
  }
  if (item.status === 'completed') {
    return { label: 'Completed', className: 'badge-completed' };
  }
  if (item.status === 'failed') {
    return { label: 'Failed', className: 'badge-failed' };
  }
  if (item.status === 'processing') {
    return { label: 'Agent Processing', className: 'badge-processing' };
  }
  return { label: item.status, className: statusBadgeClass(item.status) };
}

export function decisionSummary(item: QueueItem): string {
  if (item.latest_escalation?.status === 'pending') {
    return `${item.latest_escalation.action_type} on order ${item.latest_escalation.order_id ?? 'N/A'} — ${item.latest_escalation.reason}`;
  }
  if (item.latest_agent_run?.decision === 'auto_executed') {
    return item.outcome || 'Action executed automatically';
  }
  if (item.latest_agent_run?.decision === 'escalated') {
    return item.latest_escalation?.agent_reasoning || item.outcome || 'Escalated to human reviewer';
  }
  if (item.status === 'processing') {
    return 'Agent is analyzing the request…';
  }
  return item.outcome || item.latest_agent_run?.reasoning_summary || '—';
}

export function formatMoney(value: number): string {
  return `$${Number(value).toFixed(2)}`;
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}
