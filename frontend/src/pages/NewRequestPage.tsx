import { useState } from 'react';
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
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.createSupportRequest(email, message);
      const agent = data.agentResult as { decision?: string; outcome?: string };
      setResult(`Request #${data.request.id} created. Agent decision: ${agent.decision}. ${agent.outcome || ''}`);
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>Submit Support Request</h2>
      <p className="meta">The AI agent will process this request using a tool-calling loop. Refunds and replacements escalate to human review.</p>

      {result && <div className="alert alert-success">{result}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <h3>Example Requests</h3>
        {EXAMPLES.map((ex, i) => (
          <button
            key={i}
            type="button"
            className="btn btn-secondary"
            style={{ display: 'block', width: '100%', marginBottom: '0.5rem', textAlign: 'left' }}
            onClick={() => { setEmail(ex.email); setMessage(ex.message); }}
          >
            <strong>{ex.email}</strong>: {ex.message}
          </button>
        ))}
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
          {loading ? 'Agent processing…' : 'Submit Request'}
        </button>
      </form>
    </div>
  );
}
