import { useCallback } from 'react';
import { api } from '../api';
import { usePolling } from '../hooks/usePolling';
import { formatDate, formatMoney, statusBadgeClass } from '../utils/display';

export default function OrdersPage() {
  const fetcher = useCallback(() => api.getOrders(), []);
  const { data: orders, error, lastUpdated } = usePolling(fetcher, { intervalMs: 10_000 });

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Orders</h2>
          <p className="meta">Seeded order catalog for testing guardrails</p>
        </div>
        {lastUpdated && <span className="polling-indicator">Updated {lastUpdated.toLocaleTimeString()}</span>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Total</th>
                <th>Refunded</th>
                <th>Remaining</th>
                <th>Shipped</th>
              </tr>
            </thead>
            <tbody>
              {(orders ?? []).map((o) => (
                <tr key={o.id}>
                  <td>#{o.id}</td>
                  <td>{o.customer_name}<br /><span className="meta">{o.customer_email}</span></td>
                  <td><span className={`badge ${statusBadgeClass(o.status)}`}>{o.status}</span></td>
                  <td>{formatMoney(o.total_amount)}</td>
                  <td>{formatMoney(o.refunded_amount)}</td>
                  <td>{formatMoney(o.total_amount - o.refunded_amount)}</td>
                  <td className="meta">{o.shipped_at ? formatDate(o.shipped_at) : 'Not shipped'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
