# ADR-013: Inventory stock-movement model (append-only ledger)

- Status: Proposed
- Date: 2026-08-09

## Context

The original Koranco proposal identifies inventory and farm-input management as
a key feature and notes that input usage is recorded manually across fragmented
records. No inventory domain exists today; Harvest is explicitly "not
inventory." Koranco needs centralized, attributable, correctable records of
inputs received and issued, with management reporting — without building a
retail warehouse, procurement system, or accounting ledger.

The inventory design must fit the existing system: a Python/FastAPI modular
monolith on one authoritative PostgreSQL database, fixed roles with centralized
permissions (ADR-005), append-only operational audit, draft/submitted or
append-only correction patterns in Attendance and Harvest, and strict
maintainability rules that reject generic frameworks and speculative
abstractions (AGENTS.md).

Many inventory designs use a mutable `quantity_on_hand` column on the item row
that is incremented and decremented as stock changes. This ADR considers that
approach against Koranco's confirmed correctness, auditability, and
traceability priorities.

## Decision

Model stock as an **append-only movement ledger** with a **derived balance**.

1. **One `stock_movements` row per posted event.** Each movement belongs to one
   item, has an operational date, a signed `quantity_delta`, a constrained type
   (`receipt`, `issue`, `adjustment`, `reversal`), the authenticated actor, a
   server timestamp, and (where required) a reason. Receipts are positive;
   issues are negative; adjustments and reversals carry an explicit signed
   delta.

2. **Balance is derived, never stored as the source of truth.**
   `current_balance = COALESCE(SUM(quantity_delta), 0)`. The movement history
   fully explains every balance. No endpoint accepts a client-supplied balance.

3. **Movements are immutable once posted.** There is no edit or hard delete of
   posted movements. A mistake is corrected by posting a `reversal` (referencing
   the original) and, if needed, a new correct movement. Both remain on the
   ledger and both are audited. Item master data is archived, not deleted.

4. **Units are fixed per item and never converted.** Each item has one
   constrained unit; quantities in different units are never summed. No
   `1 bag = X kg` conversion exists unless Koranco defines one authoritatively.

5. **Integrity is enforced in one transaction with a per-item row lock.** Each
   movement transaction locks the item row (`SELECT ... FOR UPDATE`), recomputes
   the balance, validates the delta, rejects a negative result under the
   proposed hard-prevent policy, inserts the movement, and appends an
   operational audit event. The row lock serializes concurrent movements for one
   item without distributed machinery. A database trigger can re-validate the
   non-negative invariant as defense in depth.

6. **Audit reuses the existing `operational_audit_events` foundation.** Each
   movement records actor, action, entity identity, request id, before/after
   state (including old and resulting balance), and reason/explanation. The
   audit table is a history of actions; it is not replayed as an event store and
   is not itself the stock ledger.

7. **No cached balance table in MVP.** Balances are computed by `SUM ... GROUP
   BY item_id`, which is adequate for Koranco's expected scale with a B-tree on
   `(item_id, occurred_on)`. A materialized/cached balance may be added later
   only with measured evidence and its own ADR; it must be updated inside the
   same movement transaction and reconcile to the ledger.

## Why mutable `quantity_on_hand` is rejected as the sole source of truth

A mutable on-hand column is simple to read but conflicts with confirmed
priorities:

- **Loss of explanation.** It shows how much is on hand but not why; each
  change needs a separately maintained history to be auditable, which
  reintroduces a ledger by another path.
- **Silent overwrite risk.** A bug, concurrent write, or unrestricted edit can
  change stock without an attributable reason. History must be preserved, not
  overwritten (data-integrity principles; Attendance/Harvest correction model).
- **Concurrency.** Correct increment/decrement still requires locking or atomic
  updates; deriving balance from immutable rows gives the same protection with a
  clearer audit trail.
- **Reproducibility.** Historical reports must be reproducible. An append-only
  ledger lets any past balance be reconstructed; a mutated column does not
  without extra snapshot machinery.

The mutable column is acceptable only as a **derived cache**, never as
authoritative truth — and even that is deferred until scale justifies it.

## Consequences

- The current balance and full movement history are always consistent and
  auditable; any balance can be traced to the exact movements that produced it.
- Corrections preserve the original fact, matching Attendance and Harvest.
- Concurrent issues for one item are serialized by a row lock; no Redis, queues,
  or distributed transactions are introduced.
- Negative balances are prevented transactionally by default (pending Koranco
  confirmation of the negative-stock policy).
- No unit conversion, multi-location hierarchy, supplier master, batch/expiry,
  or cost/valuation is introduced; each remains deferred until Koranco confirms
  a requirement.
- Reporting computes aggregates directly from `stock_movements` in PostgreSQL,
  consistent with ADR-010.
- Offline Inventory is not supported by this model; if later approved it must
  address stale/negative balances and add a per-domain idempotency table under a
  separate decision.
- This ADR is **Proposed**. It must not be treated as accepted or implemented
  until reviewed and the open Koranco decisions (units, who receives/issues,
  negative-stock policy, FarmUnit attribution, approval requirements) are
  confirmed.
