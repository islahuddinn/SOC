import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type EscalationDetail } from '../api';

export default function EscalationPage() {
  const { id } = useParams<{ id: string }>();
  const escalationId = Number(id);
  const [detail, setDetail] = useState<EscalationDetail | null>(null);
  const [reviewer, setReviewer] = useState('reviewer-1');
  const [rejectReason, setRejectReason] = useState('');
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getEscalation(escalationId);
      setDetail(data);
      setError(null);

      if (data.escalation.status !== 'pending') {
        setActionResult({
          type: 'info',
          message: `Escalation is ${data.escalation.status}${data.escalation.approved_by ? ` by ${data.escalation.approved_by}` : ''}.`,
        });
      }
    } catch (err) {
      setError('Failed to load escalation');
    }
  }, [escalationId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, [load]);

  const isPending = detail?.escalation.status === 'pending';

  async function handleApprove() {
    setLoading(true);
    setActionResult(null);
    try {
      const result = await api.approveEscalation(escalationId, reviewer);
      if (result.success) {
        setActionResult({ type: 'success', message: result.message });
      } else {
        setActionResult({ type: 'error', message: result.message });
      }
      await load();
    } catch (err: unknown) {
      const e = err as { message?: string; status?: number };
      setActionResult({
        type: 'error',
        message: e.message || 'Approval failed — escalation may have been handled by another reviewer.',
      });
      await load();
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      setActionResult({ type: 'error', message: 'Please provide a rejection reason.' });
      return;
    }
    setLoading(true);
    setActionResult(null);
    try {
      const result = await api.rejectEscalation(escalationId, reviewer, rejectReason);
      setActionResult({
        type: result.success ? 'success' : 'error',
        message: result.message,
      });
      await load();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setActionResult({ type: 'error', message: e.message || 'Rejection failed.' });
      await load();
    } finally {
      setLoading(false);
    }
  }

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!detail) return <div className="card">Loading escalation…</div>;

  const { escalation, supportRequest, order, orderItems, toolCalls, agentRuns } = detail;

  return (
    <div>
      <h2>Escalation Review #{escalation.id}</h2>

      {actionResult && (
        <div className={`alert alert-${actionResult.type === 'success' ? 'success' : actionResult.type === 'error' ? 'error' : 'info'}`}>
          {actionResult.message}
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <h3>Customer Request</h3>
          <p><strong>From:</strong> {supportRequest.customer_email}</p>
          <p><strong>Message:</strong> {supportRequest.message}</p>
          <p className="meta">Request #{supportRequest.id} · {new Date(supportRequest.created_at).toLocaleString()}</p>
        </div>

        <div className="card">
          <h3>Proposed Action</h3>
          <p><strong>Type:</strong> {escalation.action_type.toUpperCase()}</p>
          {escalation.order_id && <p><strong>Order:</strong> #{escalation.order_id}</p>}
          {escalation.proposed_amount != null && (
            <p><strong>Amount:</strong> ${Number(escalation.proposed_amount).toFixed(2)}</p>
          )}
          <p><strong>Reason:</strong> {escalation.reason}</p>
          <p><strong>Status:</strong> <span className={`badge badge-${escalation.status === 'pending' ? 'pending' : 'completed'}`}>{escalation.status}</span></p>
          {escalation.execution_error && (
            <p className="alert alert-error" style={{ marginTop: '0.5rem' }}>{escalation.execution_error}</p>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Agent Reasoning</h3>
        <p>{escalation.agent_reasoning}</p>
        {agentRuns.map((run) => (
          <div key={run.id} className="meta">
            Run #{run.id} · {run.decision} · {run.reasoning_summary?.slice(0, 200)}
          </div>
        ))}
      </div>

      {order && (
        <div className="card">
          <h3>Order Information</h3>
          <p><strong>Customer:</strong> {order.customer_name} ({order.customer_email})</p>
          <p><strong>Status:</strong> {order.status}</p>
          <p><strong>Total:</strong> ${Number(order.total_amount).toFixed(2)}</p>
          <p><strong>Refunded:</strong> ${Number(order.refunded_amount).toFixed(2)}</p>
          <p><strong>Remaining refundable:</strong> ${(Number(order.total_amount) - Number(order.refunded_amount)).toFixed(2)}</p>
          {order.shipped_at && <p><strong>Shipped:</strong> {new Date(order.shipped_at).toLocaleString()}</p>}
          <table style={{ marginTop: '0.75rem' }}>
            <thead>
              <tr><th>Product</th><th>Qty</th><th>Price</th></tr>
            </thead>
            <tbody>
              {orderItems.map((item, i) => (
                <tr key={i}>
                  <td>{item.product_name}</td>
                  <td>{item.quantity}</td>
                  <td>${Number(item.unit_price).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3>Tool Call Trace</h3>
        {toolCalls.length === 0 && <p className="meta">No tool calls recorded.</p>}
        {toolCalls.map((tc) => (
          <div key={tc.id} className="tool-call">
            <strong>{tc.tool_name}</strong>
            <pre>{JSON.stringify(tc.arguments, null, 2)}</pre>
            <pre>{JSON.stringify(tc.result, null, 2)}</pre>
          </div>
        ))}
      </div>

      {isPending && (
        <div className="card">
          <h3>Reviewer Action</h3>
          <div className="form-group">
            <label>Reviewer ID (use different IDs in two browser sessions to test concurrency)</label>
            <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
          </div>
          <div className="actions">
            <button className="btn btn-primary" onClick={handleApprove} disabled={loading}>
              Approve & Execute
            </button>
          </div>
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label>Rejection reason</label>
            <textarea rows={2} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </div>
          <button className="btn btn-danger" onClick={handleReject} disabled={loading}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
