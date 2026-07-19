import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { usePolling } from '../hooks/usePolling';
import { formatDate, queueStatusLabel } from '../utils/display';

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const requestId = Number(id);

  const fetcher = useCallback(() => api.getSupportRequest(requestId), [requestId]);
  const { data: detail, error, lastUpdated } = usePolling(fetcher, {
    intervalMs: 2000,
    enabled: !Number.isNaN(requestId),
  });

  if (Number.isNaN(requestId)) return <div className="alert alert-error">Invalid request ID</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!detail) return <div className="card">Loading request…</div>;

  const queueItem = {
    ...detail,
    latest_agent_run: detail.agent_runs.at(-1) ?? null,
    latest_escalation: detail.escalations.at(-1) ?? null,
  };
  const status = queueStatusLabel(queueItem);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Request #{detail.id}</h2>
          <p className="meta">{detail.customer_email} · {formatDate(detail.created_at)}</p>
        </div>
        {lastUpdated && <span className="polling-indicator">Live · {lastUpdated.toLocaleTimeString()}</span>}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Customer Message</h3>
          <p>{detail.message}</p>
          <p><span className={`badge ${status.className}`}>{status.label}</span></p>
          {detail.outcome && <p className="meta">Outcome: {detail.outcome}</p>}
        </div>
        <div className="card">
          <h3>Escalations</h3>
          {detail.escalations.length === 0 && <p className="meta">No escalations.</p>}
          {detail.escalations.map((e) => (
            <div key={e.id} className="list-item">
              <strong>{e.action_type}</strong> — {e.status}
              {e.status === 'pending' && (
                <Link className="btn btn-primary btn-sm" to={`/escalations/${e.id}`} style={{ marginLeft: '0.5rem' }}>
                  Review
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Agent Runs</h3>
        {detail.agent_runs.map((run) => (
          <div key={run.id} className="list-item">
            <strong>Run #{run.id}</strong> · {run.decision} · {run.model}
            <p className="meta">{run.reasoning_summary || 'No summary'}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Tool Call Trace</h3>
        {detail.tool_calls.map((tc) => (
          <div key={tc.id} className="tool-call">
            <strong>{tc.tool_name}</strong>
            <pre>{JSON.stringify(tc.arguments, null, 2)}</pre>
            <pre>{JSON.stringify(tc.result, null, 2)}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
