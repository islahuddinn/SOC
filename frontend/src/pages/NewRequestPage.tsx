import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const EXAMPLES = [
  { email: 'alice@example.com', message: 'I want a refund for order 1043.' },
  { email: 'bob@example.com', message: 'Cancel my order 1044, it has not shipped.' },
  { email: 'alice@example.com', message: 'Order 1043 arrived damaged, send a replacement.' },
  { email: 'carol@example.com', message: 'Cancel my order 1045 please.' },
  { email: 'alice@example.com', message: 'Refund order 1046 please.' },
];

export default function NewRequestPage() {
  const [email, setEmail] = useState('alice@example.com');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [requestId, setRequestId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!requestId) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const detail = await api.getSupportRequest(requestId);
        if (cancelled) return;
        setStatus(detail.status);
        if (detail.status === 'processing' || detail.status === 'received') {
          window.setTimeout(poll, 2000);
        }
      } catch {
        if (!cancelled) setError('Failed to poll request status');
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [requestId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRequestId(null);
    setStatus(null);

    try {
      const data = await api.createSupportRequest(email, message);
      setRequestId(data.request.id);
      setStatus(data.request.status);
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Submit Support Request</h2>
          <p className="meta">Agent processes asynchronously — no HTTP timeout on long LLM runs</p>
        </div>
      </div>

      {requestId && (
        <div className={`alert ${status === 'failed' ? 'alert-error' : status === 'processing' ? 'alert-info' : 'alert-success'}`}>
          Request #{requestId} — status: <strong>{status}</strong>
          {status === 'processing' && ' (agent working…)'}
          {status && status !== 'processing' && (
            <> · <Link to={`/requests/${requestId}`}>View full trace</Link></>
          )}
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <h3>Example Requests</h3>
        <div className="example-grid">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              type="button"
              className="example-btn"
              onClick={() => { setEmail(ex.email); setMessage(ex.message); }}
            >
              <strong>{ex.email}</strong>
              <span>{ex.message}</span>
            </button>
          ))}
        </div>
      </div>

      <form className="card" onSubmit={submit}>
        <div className="form-group">
          <label>Customer Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Message</label>
          <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} required />
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Submitting…' : 'Submit Request'}
        </button>
      </form>
    </div>
  );
}
