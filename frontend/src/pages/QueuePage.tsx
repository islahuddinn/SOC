import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { usePolling } from '../hooks/usePolling';
import { decisionSummary, formatDate, queueStatusLabel } from '../utils/display';

export default function QueuePage() {
  const navigate = useNavigate();
  const fetcher = useCallback(() => api.getQueue(), []);
  const { data: queue, error, lastUpdated } = usePolling(fetcher, { intervalMs: 3000 });

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Support Queue</h2>
          <p className="meta">All incoming requests with agent decisions</p>
        </div>
        {lastUpdated && <span className="polling-indicator">Updated {lastUpdated.toLocaleTimeString()}</span>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card table-card">
        <div className="table-scroll">
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
              {(queue ?? []).map((item) => {
                const status = queueStatusLabel(item);
                const clickable = item.latest_escalation?.status === 'pending';
                return (
                  <tr
                    key={item.id}
                    className={clickable ? 'row-clickable' : ''}
                    onClick={() => {
                      if (clickable && item.latest_escalation) {
                        navigate(`/escalations/${item.latest_escalation.id}`);
                      } else {
                        navigate(`/requests/${item.id}`);
                      }
                    }}
                  >
                    <td>#{item.id}</td>
                    <td>{item.customer_email}</td>
                    <td className="truncate">{item.message}</td>
                    <td className="truncate">{decisionSummary(item)}</td>
                    <td><span className={`badge ${status.className}`}>{status.label}</span></td>
                    <td className="meta">{formatDate(item.created_at)}</td>
                  </tr>
                );
              })}
              {queue?.length === 0 && (
                <tr><td colSpan={6} className="meta">No support requests yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mobile-cards">
        {(queue ?? []).map((item) => {
          const status = queueStatusLabel(item);
          return (
            <div
              key={item.id}
              className="card mobile-card"
              onClick={() => navigate(item.latest_escalation?.status === 'pending'
                ? `/escalations/${item.latest_escalation!.id}`
                : `/requests/${item.id}`)}
            >
              <div className="mobile-card-header">
                <strong>#{item.id}</strong>
                <span className={`badge ${status.className}`}>{status.label}</span>
              </div>
              <p className="meta">{item.customer_email}</p>
              <p>{item.message}</p>
              <p className="meta">{decisionSummary(item)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
