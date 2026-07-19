# Support Operations Console — Architecture

## Overview

This system is a full-stack Support Operations Console for an e-commerce store. Customers submit support requests; an **agentic AI backend** (OpenAI tool-calling loop) interprets the request, reads order data via tools, and either **auto-executes safe actions** or **escalates to human reviewers**. Guardrails and concurrency controls are enforced in **application code and PostgreSQL**, not via prompts alone.

```
Customer Request → Agent Loop (LLM + Tools) → Guardrails → Auto-execute OR Escalation
                                                              ↓
                                                    Human Reviewer (UI)
                                                              ↓
                                                    Approve → Guarded Execution
```

---

## Agent Boundary

### Autonomous (no human approval)

| Action | Conditions |
|--------|------------|
| Order lookup | Read-only; always allowed for verified customer |
| Order cancellation | Order not shipped, not already cancelled, customer owns order |

Cancellations are auto-executed in `agentLoop.ts` → `executeCancellation()` after `validateCancellation()` passes and `requiresEscalation` is false.

### Requires human approval

| Action | Reason |
|--------|--------|
| Refunds | Store policy: incorrect refund is worse than over-escalation (`validateRefund` sets `requiresEscalation: true`) |
| Replacements | Always escalated (`validateReplacement`) |
| Ambiguous / blocked requests | Agent calls `escalate_to_human` |

### How the boundary is enforced in code

1. **Tool handlers** (`backend/src/agent/agentLoop.ts`): `request_refund` always calls `createEscalation()` — it never calls `executeRefund()` directly.
2. **Guardrails** (`backend/src/guardrails/index.ts`): Pure functions return `requiresEscalation: true/false`. Refunds always require escalation regardless of LLM intent.
3. **Execution gate** (`backend/src/services/actionExecutor.ts`): `executeRefund()` and `executeCancellation()` are only reachable from `executeApprovedEscalation()` (human approve) or the cancellation auto-path. Guardrails are **re-validated at execution time**.
4. **Escalation status machine**: Actions with financial impact require `status = 'approved'` via `UPDATE ... WHERE status = 'pending'` before execution.

The LLM cannot bypass this by prompt injection — even if it hallucinates tool results, execution paths do not trust model output for money movement.

---

## Tool Design

Tools are defined as OpenAI function schemas in `AGENT_TOOLS` and dispatched in `executeTool()`.

| Tool | Purpose | Mutates state? |
|------|---------|----------------|
| `lookup_order` | Fetch order + items; redacts data if wrong customer | No |
| `list_customer_orders` | List orders for requester email | No |
| `request_refund` | Validate + create escalation | Creates escalation only |
| `request_cancellation` | Validate + auto-cancel or escalate | May cancel |
| `request_replacement` | Validate + escalate | Creates escalation |
| `escalate_to_human` | Generic escalation | Creates escalation |

### Why this design

- **Read/write separation**: Lookup tools are safe to call freely; write tools go through guardrails.
- **Structured data exposure**: Tools return JSON summaries, not raw SQL rows — reducing token noise and preventing the model from inferring fields we don't intend to expose (e.g. other customers' PII is redacted in `lookup_order`).
- **Audit trail**: Every tool invocation is persisted to `tool_calls` with arguments and results before the agent continues.
- **No hardcoded sequences**: The agent loop in `runAgentLoop()` iterates until the model stops calling tools — the LLM decides order and selection of tools.

---

## Failure Handling

| Scenario | Handling |
|----------|----------|
| **Hallucinated order ID** | `lookup_order` returns `{ found: false }`; `validateOrderAccess` blocks actions with explicit reason |
| **Refund > payment** | `validateRefund` checks `amount > remaining refundable`; `executeRefund` re-checks after `SELECT FOR UPDATE` |
| **Already refunded order** | Guardrail rejects when `refunded_amount >= total_amount` |
| **Cancel shipped order** | `validateCancellation` rejects when status ∈ `{shipped, delivered}` |
| **Someone else's order** | Email comparison in `validateOrderAccess`; lookup redacts non-owner data |
| **Duplicate concurrent refund** | Unique partial index `idx_unique_pending_refund_per_order` + transaction with row lock |
| **Duplicate concurrent approval** | `UPDATE escalations SET status='approved' WHERE status='pending'` — second update returns 0 rows → 409 to UI |
| **Agent / LLM failure** | Caught in `runAgentLoop`; persisted as `decision: 'failed'` with error message |

---

## Concurrency Safety (Database Level)

### Double refund protection

```sql
CREATE UNIQUE INDEX idx_unique_pending_refund_per_order
  ON refunds (order_id) WHERE status = 'pending';
```

In `executeRefund()`:
1. `BEGIN`
2. `SELECT * FROM orders WHERE id = $1 FOR UPDATE` — serializes concurrent refund attempts
3. Re-run guardrails
4. `INSERT INTO refunds ... status = 'pending'` — second concurrent insert hits unique index (error `23505`)
5. Update `orders.refunded_amount`, mark refund completed, `COMMIT`

### Double approval protection

```sql
UPDATE escalations SET status = 'approved' ...
WHERE id = $1 AND status = 'pending'
RETURNING *;
```

Only one reviewer wins. The frontend polls every 2s and surfaces 409 responses so the second reviewer sees updated state.

---

## Traceability

Every request is reconstructable from PostgreSQL:

| Table | Contents |
|-------|----------|
| `support_requests` | Customer message, final status, outcome |
| `agent_runs` | Model, decision, reasoning summary |
| `tool_calls` | Tool name, arguments JSON, result JSON |
| `escalations` | Proposed action, agent reasoning, approval/rejection, execution result |
| `refunds` | Amount, status, linkage to escalation/request |

---

## Build vs Buy (Production Recommendations)

| Concern | This assessment | Production at scale |
|---------|-----------------|---------------------|
| Agent framework | Direct OpenAI SDK loop | LangGraph, Temporal workflows, or vendor agent platform |
| Job queue | Synchronous processing | SQS / Redis / BullMQ for request ingestion |
| Database | Single PostgreSQL | RDS + read replicas; connection pooling (PgBouncer) |
| Observability | DB audit tables | OpenTelemetry, structured logs, Datadog/Honeycomb |
| Auth | None (demo) | SSO for reviewers, customer identity verification |
| Deployment | Docker + Render/Railway | Kubernetes or managed PaaS with CI/CD |
| LLM | OpenAI gpt-4o-mini | Model routing, fallbacks, cost controls |

**What we built**: A minimal but complete agent loop, guardrail module, and reviewer UI — enough to demonstrate system properties (boundary, concurrency, traceability) without operational overhead.

**What we'd adopt**: Managed Postgres, queue-based agent workers, proper auth, and observability from day one in production.

---

## Significant Design Decisions

### 1. Guardrails as pure functions + re-validation at execution

**Alternatives considered**:
- Prompt-only policies ("never refund more than paid")
- Guardrails only in tool handlers (no re-check on approve)

**Rejected because**: Prompts are not enforcement. Tool-handler-only checks miss the approve path where a human (or race) could trigger stale actions.

**Choice**: `guardrails/index.ts` exports testable pure functions called from tools AND `executeRefund`/`executeCancellation`. Single source of truth.

### 2. Escalation-first for all refunds

**Alternatives considered**:
- Auto-refund small amounts under $X
- Full LLM discretion

**Rejected because**: The brief states incorrect refunds are significantly worse than over-escalation. Auto-refund introduces financial risk for marginal speed gains.

**Choice**: `validateRefund` always returns `requiresEscalation: true`. Refunds only execute after human approval.

### 3. PostgreSQL constraints for concurrency (not app-level locks)

**Alternatives considered**:
- In-memory mutex (fails across processes)
- "Check then insert" without unique index (race window)

**Rejected because**: Reviewers explicitly test concurrent requests and inspect the refunds table. Timing assumptions fail under load.

**Choice**: `FOR UPDATE` row locks + partial unique index on pending refunds + conditional `UPDATE` for escalation approval.

---

## Key Source Files (for debrief)

| Concern | File |
|---------|------|
| Agent loop | `backend/src/agent/agentLoop.ts` |
| Guardrails | `backend/src/guardrails/index.ts` |
| Refund execution + concurrency | `backend/src/services/actionExecutor.ts` |
| DB constraints | `backend/src/db/schema.sql` |
| Reviewer approve/reject | `backend/src/routes/api.ts` |
| Frontend escalation review | `frontend/src/pages/EscalationPage.tsx` |
