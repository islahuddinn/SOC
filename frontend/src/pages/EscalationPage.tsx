import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiClientError, api } from '../api';
import { usePolling } from '../hooks/usePolling';
import { formatMoney } from '../utils/display';

export default function EscalationPage() {
  const { id } = useParams<{ id: string }>();
  const escalationId = Number(id);
  const [reviewer, setReviewer] = useState('reviewer-1');
  const [rejectReason, setRejectReason] = useState('');
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetcher = useCallback(() => api.getEscalation(escalationId), [escalationId]);
  const { data: detail, error, lastUpdated, refresh } = usePolling(fetcher, {
    intervalMs: 2000,
    enabled: !Number.isNaN(escalationId),
  });

  const isPending = detail?.escalation.status === 'pending';

  async function handleApprove() {
    setLoading(true);
    setActionResult(null);
    try {
      const result = await api.approveEscalation(escalationId, reviewer);
      setActionResult({
        type: result.success ? 'success' : 'error',
        message: result.message,
      });
    } catch (err) {
      const msg = err instanceof ApiClientError
        ? (err.data as { message?: string })?.message || err.message
        : 'Approval failed — another reviewer may have acted first.';
      setActionResult({ type: 'error', message: msg });
    } finally {
      setLoading(false);
      await refresh();
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
      setActionResult({ type: result.success ? 'success' : 'error', message: result.message });
    } catch (err) {
      setActionResult({ type: 'error', message: err instanceof Error ? err.message : 'Rejection failed.' });
    } finally {
      setLoading(false);
      await refresh();
    }
  }

  if (Number.isNaN(escalationId)) return <div className="alert alert-error">Invalid escalation ID</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!detail) return <div className="card">Loading escalation…</div>;

  const { escalation, supportRequest, order, orderItems, toolCalls, agentRuns } = detail;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Escalation Review #{escalation.id}</h2>
          <p className="meta">
            Request <Link to={`/requests/${supportRequest.id}`}>#{supportRequest.id}</Link>
          </p>
        </div>
        {lastUpdated && <span className="polling-indicator">Live · {lastUpdated.toLocaleTimeString()}</span>}
      </div>

      {actionResult && (
        <div className={`alert alert-${actionResult.type === 'success' ? 'success' : actionResult.type === 'error' ? 'error' : 'info'}`}>
          {actionResult.message}
        </div>
      )}

      {!isPending && (
        <div className="alert alert-info">
          Status: <strong>{escalation.status}</strong>
          {escalation.approved_by && ` · by ${escalation.approved_by}`}
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <h3>Customer Request</h3>
          <p><strong>From:</strong> {supportRequest.customer_email}</p>
          <p><strong>Message:</strong> {supportRequest.message}</p>
        </div>
        <div className="card">
          <h3>Proposed Action</h3>
          <p><strong>Type:</strong> {escalation.action_type.toUpperCase()}</p>
          {escalation.order_id && <p><strong>Order:</strong> #{escalation.order_id}</p>}
          {escalation.proposed_amount != null && (
            <p><strong>Amount:</strong> {formatMoney(escalation.proposed_amount)}</p>
          )}
          <p><strong>Reason:</strong> {escalation.reason}</p>
          {escalation.execution_error && (
            <p className="alert alert-error">{escalation.execution_error}</p>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Agent Reasoning</h3>
        <p>{escalation.agent_reasoning}</p>
        {agentRuns.map((run) => (
          <p key={run.id} className="meta">Run #{run.id} · {run.decision} · {run.model}</p>
        ))}
      </div>

      {order && (
        <div className="card">
          <h3>Order Information</h3>
          <p><strong>Customer:</strong> {order.customer_name} ({order.customer_email})</p>
          <p><strong>Status:</strong> {order.status}</p>
          <p><strong>Total:</strong> {formatMoney(order.total_amount)}</p>
          <p><strong>Refunded:</strong> {formatMoney(order.refunded_amount)}</p>
          <p><strong>Remaining refundable:</strong> {formatMoney(order.total_amount - order.refunded_amount)}</p>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Product</th><th>Qty</th><th>Price</th></tr></thead>
              <tbody>
                {orderItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product_name}</td>
                    <td>{item.quantity}</td>
                    <td>{formatMoney(item.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Tool Call Trace</h3>
        {toolCalls.map((tc) => (
          <div key={tc.id} className="tool-call">
            <strong>{tc.tool_name}</strong>
            <pre>{JSON.stringify(tc.arguments, null, 2)}</pre>
            <pre>{JSON.stringify(tc.result, null, 2)}</pre>
          </div>
        ))}
      </div>

      {isPending && (
        <div className="card review-actions">
          <h3>Reviewer Action</h3>
          <div className="form-group">
            <label>Reviewer ID (use different IDs in two sessions to test concurrency)</label>
            <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
          </div>
          <div className="actions actions-wrap">
            <button className="btn btn-primary" onClick={handleApprove} disabled={loading}>
              Approve & Execute
            </button>
          </div>
          <div className="form-group">
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
