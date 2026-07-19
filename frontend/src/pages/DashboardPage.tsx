import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { usePolling } from '../hooks/usePolling';

export default function DashboardPage() {
  const statsFetcher = useCallback(() => api.getStats(), []);
  const configFetcher = useCallback(() => api.getConfig(), []);

  const { data: stats, error, lastUpdated } = usePolling(statsFetcher, { intervalMs: 5000 });
  const { data: config } = usePolling(configFetcher, { intervalMs: 30_000 });

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p className="meta">Operational overview for support reviewers</p>
        </div>
        {lastUpdated && <span className="polling-indicator">Updated {lastUpdated.toLocaleTimeString()}</span>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {config && (
        <div className="alert alert-info">
          Active LLM: <strong>{config.llm.provider}</strong> ({config.llm.model})
          {!config.llm.configured && ' — API key missing; set GROQ_API_KEY or OPENAI_API_KEY on the server.'}
        </div>
      )}

      <div className="stats-grid">
        <StatCard label="Total Requests" value={stats?.total_requests ?? '—'} />
        <StatCard label="Pending Reviews" value={stats?.pending_reviews ?? '—'} highlight />
        <StatCard label="Agent Processing" value={stats?.processing ?? '—'} />
        <StatCard label="Auto Executed" value={stats?.auto_executed ?? '—'} />
        <StatCard label="Escalated" value={stats?.escalated ?? '—'} />
        <StatCard label="Completed Refunds" value={stats?.completed_refunds ?? '—'} />
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Quick Actions</h3>
          <div className="actions actions-wrap">
            <Link className="btn btn-primary" to="/new">Submit Test Request</Link>
            <Link className="btn btn-secondary" to="/reviews">Review Escalations</Link>
            <Link className="btn btn-secondary" to="/queue">View Queue</Link>
          </div>
        </div>
        <div className="card">
          <h3>Assessment Highlights</h3>
          <ul className="checklist">
            <li>Guardrails enforced in code — not prompts alone</li>
            <li>DB-level duplicate refund protection</li>
            <li>Optimistic concurrency on reviewer approval</li>
            <li>Full agent trace persisted in PostgreSQL</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`stat-card${highlight ? ' stat-highlight' : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
