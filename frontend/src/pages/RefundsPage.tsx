import { useCallback } from 'react';
import { api } from '../api';
import { usePolling } from '../hooks/usePolling';
import { formatDate, formatMoney } from '../utils/display';

export default function RefundsPage() {
  const fetcher = useCallback(() => api.getRefunds(), []);
  const { data: refunds, error, lastUpdated } = usePolling(fetcher, { intervalMs: 3000 });

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Refunds Ledger</h2>
          <p className="meta">Verify concurrency safety — at most one completed refund per concurrent attempt</p>
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
                <th>Order</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Order Total</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {(refunds ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>#{r.order_id}</td>
                  <td>{r.customer_email}</td>
                  <td>{formatMoney(r.amount)}</td>
                  <td>{formatMoney(r.order_total)}</td>
                  <td><span className={`badge badge-${r.status === 'completed' ? 'completed' : 'pending'}`}>{r.status}</span></td>
                  <td className="meta">{formatDate(r.created_at)}</td>
                </tr>
              ))}
              {refunds?.length === 0 && (
                <tr><td colSpan={7} className="meta">No refunds yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
