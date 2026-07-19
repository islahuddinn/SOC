import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

interface RefundRow {
  id: number;
  order_id: number;
  amount: string;
  status: string;
  customer_email: string;
  order_total: string;
  created_at: string;
}

export default function RefundsPage() {
  const [refunds, setRefunds] = useState<RefundRow[]>([]);

  const load = useCallback(async () => {
    const data = await api.getRefunds();
    setRefunds(data as RefundRow[]);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div>
      <h2>Refunds Ledger</h2>
      <p className="meta">Inspect this table to verify concurrency safety — each order should have at most one successful concurrent refund.</p>
      <div className="card">
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
            {refunds.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>#{r.order_id}</td>
                <td>{r.customer_email}</td>
                <td>${Number(r.amount).toFixed(2)}</td>
                <td>${Number(r.order_total).toFixed(2)}</td>
                <td><span className={`badge badge-${r.status === 'completed' ? 'completed' : 'pending'}`}>{r.status}</span></td>
                <td className="meta">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {refunds.length === 0 && (
              <tr><td colSpan={7} className="meta">No refunds yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
