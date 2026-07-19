import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { QueueItem } from '@soc/shared';
import { api } from '../api';

function statusBadge(item: QueueItem) {
  if (item.latest_escalation?.status === 'pending') {
    return <span className="badge badge-pending">Needs Review</span>;
  }
  if (item.latest_agent_run?.decision === 'auto_executed') {
    return <span className="badge badge-auto">Auto Executed</span>;
  }
  if (item.status === 'escalated') {
    return <span className="badge badge-escalated">Escalated</span>;
  }
  if (item.status === 'completed') {
    return <span className="badge badge-completed">Completed</span>;
  }
  if (item.status === 'failed') {
    return <span className="badge badge-failed">Failed</span>;
  }
  return <span className="badge badge-processing">{item.status}</span>;
}

function decisionSummary(item: QueueItem): string {
  if (item.latest_escalation?.status === 'pending') {
    return `${item.latest_escalation.action_type} on order ${item.latest_escalation.order_id ?? 'N/A'} — ${item.latest_escalation.reason}`;
  }
  if (item.latest_agent_run?.decision === 'auto_executed') {
    return item.outcome || 'Action executed automatically';
  }
  if (item.latest_agent_run?.decision === 'escalated') {
    return item.latest_escalation?.agent_reasoning || item.outcome || 'Escalated to human reviewer';
  }
  return item.outcome || item.latest_agent_run?.reasoning_summary || '—';
}

export default function QueuePage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const data = await api.getQueue();
      setQueue(data);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue');
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Support Queue</h2>
        <span className="polling-indicator">
          {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()} · polling every 3s` : 'Loading…'}
        </span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Customer</th>
              <th>Request</th>
              <th>Agent Decision</th>
              <th>Status</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((item) => (
              <tr
                key={item.id}
                className={item.latest_escalation?.status === 'pending' ? 'row-clickable' : ''}
                onClick={() => {
                  if (item.latest_escalation?.status === 'pending') {
                    navigate(`/escalations/${item.latest_escalation.id}`);
                  }
                }}
              >
                <td>#{item.id}</td>
                <td>{item.customer_email}</td>
                <td style={{ maxWidth: 280 }}>{item.message}</td>
                <td style={{ maxWidth: 320 }}>{decisionSummary(item)}</td>
                <td>{statusBadge(item)}</td>
                <td className="meta">{new Date(item.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {queue.length === 0 && (
              <tr>
                <td colSpan={6} className="meta">No support requests yet. Submit one from New Request.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
