import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { usePolling } from '../hooks/usePolling';
import { formatDate, formatMoney } from '../utils/display';

export default function PendingReviewsPage() {
  const fetcher = useCallback(() => api.getPendingEscalations(), []);
  const { data: escalations, error, lastUpdated } = usePolling(fetcher, { intervalMs: 2000 });

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Pending Reviews</h2>
          <p className="meta">Escalations awaiting human approval</p>
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
                <th>Action</th>
                <th>Order</th>
                <th>Amount</th>
                <th>Reason</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(escalations ?? []).map((e) => (
                <tr key={e.id}>
                  <td>#{e.id}</td>
                  <td><span className="badge badge-pending">{e.action_type}</span></td>
                  <td>{e.order_id ? `#${e.order_id}` : '—'}</td>
                  <td>{e.proposed_amount != null ? formatMoney(e.proposed_amount) : '—'}</td>
                  <td className="truncate">{e.reason}</td>
                  <td className="meta">{formatDate(e.created_at)}</td>
                  <td><Link className="btn btn-primary btn-sm" to={`/escalations/${e.id}`}>Review</Link></td>
                </tr>
              ))}
              {escalations?.length === 0 && (
                <tr><td colSpan={7} className="meta">No pending escalations — all caught up.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
