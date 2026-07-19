-- Support Operations Console schema
-- Concurrency and guardrails enforced at DB level where possible

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_email VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  refunded_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  shipped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT refunded_not_exceed_total CHECK (refunded_amount <= total_amount)
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0)
);

CREATE TABLE IF NOT EXISTS support_requests (
  id SERIAL PRIMARY KEY,
  customer_email VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processing', 'completed', 'escalated', 'failed')),
  outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id SERIAL PRIMARY KEY,
  support_request_id INTEGER NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
  model VARCHAR(100) NOT NULL,
  reasoning_summary TEXT,
  decision VARCHAR(50) NOT NULL
    CHECK (decision IN ('auto_executed', 'escalated', 'no_action', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tool_calls (
  id SERIAL PRIMARY KEY,
  agent_run_id INTEGER NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  tool_name VARCHAR(100) NOT NULL,
  arguments JSONB NOT NULL DEFAULT '{}',
  result JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS escalations (
  id SERIAL PRIMARY KEY,
  support_request_id INTEGER NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
  agent_run_id INTEGER NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('refund', 'cancel', 'replacement')),
  order_id INTEGER REFERENCES orders(id),
  proposed_amount NUMERIC(12, 2),
  reason TEXT NOT NULL,
  agent_reasoning TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  rejection_reason TEXT,
  approved_by VARCHAR(255),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  execution_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refunds (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  escalation_id INTEGER REFERENCES escalations(id),
  support_request_id INTEGER REFERENCES support_requests(id),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate concurrent refunds: only one pending refund per order at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_refund_per_order
  ON refunds (order_id)
  WHERE status = 'pending';

-- Prevent duplicate concurrent approvals: only one pending escalation per order+action
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_escalation
  ON escalations (order_id, action_type)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_support_requests_status ON support_requests(status);
CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(status);
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
