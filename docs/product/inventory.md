# Inventory and farm input management

> **Status: Design only (2026-08-09).** This document designs the domain. No
> inventory product code, schema, or permissions have been implemented. Every
> item marked **[CONFIRM]** requires a decision from an accountable Koranco
> stakeholder before implementation. See the
> [questionnaire](inventory-requirements-questionnaire.md).

## Purpose

Replace fragmented manual records of farm inputs with centralized, attributable,
correctable stock records that management can report on. This is **farm-input
inventory** — fertilizer, agrochemicals, planting materials, PPE, packaging,
tools, fuel, and consumables **only to the extent Koranco actually stocks and
tracks them**. It is not a retail warehouse, procurement system, accounting
ledger, or generic ERP.

This document deliberately distinguishes three things:

- **Proposal-supported** — implied by the original Koranco proposal (input
  usage recorded manually today; fertilizer schedules and field activities;
  centralized records; management reporting; future maintainability/handover).
- **Recommended** — an architectural default the engineering team proposes,
  consistent with existing Koranco conventions.
- **[CONFIRM]** — a Koranco business decision that must not be guessed.

## Proposal-to-system gap analysis

The original proposal identifies inventory and farm-input management as a key
feature and observes that input usage is currently recorded manually across
fragmented records. The current system has no inventory domain; Harvest is
explicitly "not inventory."

| Dimension | What the proposal implies | Current system state | Gap |
| --- | --- | --- | --- |
| Operational problem | Input usage is manual and fragmented; records are hard to consolidate | No stock records exist | Need centralized, attributable stock movements |
| Information recorded today | Manual input usage / application records (paper, spreadsheets) | None digitized | Need receipt, issue, and adjustment capture; migrate only if a real source exists |
| Expected users | Operational and management staff | Manager / Supervisor / Worker roles exist | Worker accounts must not gain inventory access without a confirmed workflow |
| Relationship to FarmUnits | Inputs are used on fields/blocks (fertilizer schedules, field activities) | Generic `FarmUnit` exists | Issues may optionally attribute a FarmUnit; not required until confirmed |
| Relationship to field activities | Fertilizer schedules, planting, and field activities are mentioned | No Field Activities domain exists | Do not hard-couple Inventory to a module that does not exist |
| Management reporting | Centralized records should support management information | Reporting is online-only over submitted records | Add inventory reports derived from movements |
| Historical traceability | Centralized, retrievable records replace fragmentation | Append-only operational audit exists | Movements must be immutable; current balance must be reproducible from history |

The proposal does **not** specify item types, units, suppliers, costs, batch/
expiry tracking, reorder levels, multiple stores, approvals, or field/offline
capture. None of these are inferred as requirements.

## Users and permissions (proposed)

No new roles are introduced. Use the existing Manager, Supervisor, Worker roles
(ADR-005). These permissions are **proposed** until Koranco confirms who does
each action:

| Permission | Purpose | Manager | Supervisor | Worker |
| --- | --- | :---:| :---:| :---:|
| `inventory.read` | View items, balances, movements | yes | yes | no |
| `inventory.item.manage` | Create/update/archive item master data | yes | no | no |
| `inventory.receive` | Record stock entering the store | yes | proposed | no |
| `inventory.issue` | Record stock issued/used | yes | proposed | no |
| `inventory.adjust` | Record corrections/damage/expiry | yes | proposed no | no |
| `inventory.report.read` | Inventory reports | via `reports.read` | via `reports.read` | no |

Notes:

- **[CONFIRM]** whether Supervisors receive `receive` and `issue`, or only
  Managers perform store movements. The conservative default is: Supervisors
  may `read`, `receive`, and `issue`; **only Managers may `adjust`** because
  adjustments alter stock without a normal in/out event and need oversight.
- Movement audit is reached through the existing `operational_audit.read`
  (Manager-only today), **not** a new `inventory.audit.read` permission. We
  deliberately do not add a permission the existing audit surface already
  covers.
- Worker application accounts get **no** inventory permissions unless Koranco
  confirms a worker self-service usage workflow.
- Inventory reports reuse `reports.read` rather than a separate
  `inventory.report.read`, matching how Attendance and Harvest reports are
  gated. Add a separate permission only if inventory reports must have
  different access than other reports **[CONFIRM]**.

## Domain concepts (minimum)

- **InventoryItem** — a thing Koranco stocks. Code, name, category, unit of
  measure, active/inactive. The item's unit is fixed; no per-movement unit
  changes and no conversions.
- **StockMovement** — one append-only fact: a receipt, issue, or adjustment for
  one item on one date, with a signed quantity delta. This is the only source
  of truth for stock.
- **StockBalance** — derived: the sum of movement deltas per item. Never
  manually edited.

Deliberately **not** in the minimum model (each can be added later only with a
confirmed requirement):

- **StockLocation** / multiple stores — only if Koranco actually operates more
  than one store **[CONFIRM]**. A single implicit store is assumed until then.
- **Supplier** master data — a free-text supplier/reference on a receipt may
  suffice; a suppliers table is deferred **[CONFIRM]**.
- **Batch/Lot** — only if fertilizer/agrochemical traceability is genuinely
  needed **[CONFIRM]**.
- **Expiry date** — only for items where it is operationally meaningful
  **[CONFIRM]**.
- **Cost/valuation** — deferred; Inventory is quantity/control, not accounting.

## Stock movement model

Append-only movements. For any item:

```
current_balance = opening_balance
                + SUM(receipt deltas)
                - SUM(issue deltas)
                + SUM(adjustment deltas)
```

Each movement stores a signed `quantity_delta` (positive for receipts, negative
for issues, either sign for adjustments) and is **posted** on creation. The
movement history fully explains the current balance; historical movements are
never overwritten.

**Why not a mutable `quantity_on_hand` column as the source of truth:** it can
be edited silently, loses the explanation of how stock changed, makes
reconciliation and audit hard, and is vulnerable to concurrent writers. An
append-only ledger with a derived balance matches Koranco's existing
correctness/audit posture (Attendance and Harvest preserve history rather than
overwriting it).

**Cached balance:** do not add one in MVP. Balances are computed with
`SUM(quantity_delta) GROUP BY item_id`, which is trivially fast at Koranco's
expected scale with a B-tree index on `(item_id, occurred_on)`. If measured
scale later justifies a cached balance, it must be transactionally maintained
inside the same movement-insert transaction (never by a separate job) and
reconciled against the ledger; that decision would need its own ADR.

## Units of measure

Units are a **major Koranco decision [CONFIRM]**. Each InventoryItem has exactly
one official unit, chosen from a constrained set. Candidate units include `kg`,
`litres`, `bags`, `bottles`, `pieces`, `cartons`, and any farm-specific unit
Koranco actually uses.

Hard rules:

- No unit conversion. `1 bag = X kg` is **not** encoded unless Koranco defines an
  authoritative conversion in writing.
- Different units remain semantically separate and are never summed (the same
  invariant Harvest already applies to `fruit_count` vs `kilograms`).
- If Koranco buys by the bag but issues by the kg, that is a real-world
  repacking event that must be modeled explicitly (e.g. two items or a
  confirmed conversion) — never an implicit conversion.

## Receipts

Stock entering the store. Recommend **direct-posted receipts** (no draft
state) for the simplest auditable workflow: a receipt creates one posted
movement immediately. Drafts add lifecycle complexity without a clear
operational benefit for store receiving; revisit only if Koranco has a
multi-step goods-in inspection **[CONFIRM]**.

Recorded fields:

- movement date (operational date, explicit)
- item
- quantity and the item's unit
- optional free-text supplier name and invoice/reference **[CONFIRM whether needed]**
- optional batch/lot and expiry **[CONFIRM whether needed]**
- optional note
- responsible user (authenticated actor) and server timestamp

Receipt deltas are always positive. The item must be active.

## Issues / farm input usage

Stock leaving the store for farm use. This is likely the most important
workflow. An issue creates one posted movement with a negative delta.

Potential attribution:

- item, quantity, unit, date (always)
- optional `farm_unit_id` — which field/block received the input
- optional free-text activity reference (e.g. a fertilizer schedule or field
  activity name/id)
- responsible user and note

**Do not require FarmUnit or activity** until Koranco confirms its real
workflow. Keep both optional in MVP.

### Issue vs. actual application — a critical distinction

"Stock left the store" and "input was actually applied to the field" are **not
necessarily the same event**. Fertilizer may be issued today and applied over
several days, or partially returned. MVP records **issue from store** only.
Capturing actual application (rates, timing, completion) is a future Field
Activities / fertilization workflow and is explicitly out of scope. Koranco
must confirm whether they need both events or only issue-from-store.

Open workflow questions **[CONFIRM]**:

- Does a Supervisor record issue/usage in the field, or does a
  storekeeper/Manager record it at the store?
- Does issue require approval before it affects stock? (Conservative default:
  no approval; the act of recording a posted issue is the controlled event,
  gated by permission and audit.)

## Field activity relationship

There is no Field Activities domain today. Recommend **Option A: remain
independent initially**, with an optional FarmUnit on issues and an optional
free-text activity reference. Do not add a foreign key to a non-existent
activities table.

Tradeoffs:

- Independent now: simple, ships, no speculative coupling. Loses structured
  per-activity input analysis later.
- Direct integration later: richer reporting (input per activity/schedule) but
  requires the Field Activities domain to be designed on its own merits first.

When Field Activities exists, issues can add a nullable, explicitly designed
reference. The optional free-text field in MVP does not block that migration.

## Adjustments and corrections

Explicit adjustments correct stock without a normal in/out event: physical
count discrepancy, damaged stock, expired product, or data-entry correction.

An adjustment is itself a posted movement (delta may be positive or negative)
and requires:

- a constrained **reason** (e.g. `physical_count`, `damaged`, `expired`,
  `data_correction`)
- the authenticated actor
- server timestamp
- a required free-text explanation
- the resulting balance is recomputed from history

There is **no unrestricted quantity editing**.

For posted movements of any type:

- No hard delete and no in-place edit.
- A mistaken receipt/issue is corrected by a **reversal movement** (an
  adjustment that references the original movement) plus, if needed, a new
  correct movement. The original stays on the ledger.
- Item master data is **archived** (set inactive), never deleted, so historical
  movements remain reproducible.

## Negative stock

This needs a deliberate policy **[CONFIRM]**. Options: hard-prevent, allow with
warning, or allow only for specific roles.

**Recommended default: hard-prevent negative balances.** A movement is rejected
if it would drive an item's balance below zero. This keeps stock truthful and
matches a controlled store. It is enforced transactionally (see Concurrency).

Reasons a farm might want to allow negatives (stock entered late, retrospective
data entry during migration) are better handled by entering the back-dated
receipt first, not by permitting negative balances. If Koranco confirms a real
need, allowing negatives could become a per-item or role-gated policy, but that
adds complexity and is deferred.

Offline complicates negatives further (queued issues cannot see the latest
server balance), which is one more reason Inventory starts online-only.

## Concurrency and integrity

Two users can issue the same item simultaneously; the balance check and the
insert must be atomic. Use the existing modular-monolith tools — no distributed
machinery:

- One PostgreSQL transaction per movement.
- Serialize movements per item with a row lock: `SELECT ... FROM inventory_items
  WHERE id = :id FOR UPDATE`, then recompute balance and insert the movement.
  This prevents two concurrent issues from both passing a non-negative check.
- Use the database's `NUMERIC` type for quantities (no binary floating point),
  consistent with Harvest.
- A database check/trigger rejects a movement whose resulting balance would be
  negative (defense in depth behind the application lock).
- No client-supplied balance is ever trusted.
- Duplicate submission is handled at the transport/UI level (disable after
  submit, CSRF) and, if offline is ever added, with a stable operation UUID —
  but Inventory is online-only in MVP, so no idempotency table is needed now.

## Audit

Reuse the existing `operational_audit_events` foundation. Each movement records
actor, action (`received`/`issued`/`adjusted`/`reversed`), entity identity,
request ID, before/after state (including the resulting balance and, for
adjustments, reason/explanation), and server timestamp. Item create/update/
archive are also audited. Audit is append-only at the PostgreSQL layer and is
never used as an event store or stock ledger.

## Offline recommendation

**Recommend online-only Inventory in MVP.** Do not assume Inventory must be
offline. Receiving and issuing are store/office activities that normally have
connectivity, and offline stock movements create negative-balance and
reconciliation problems the Attendance/Harvest offline stack does not solve for
free. Viewing stock online is acceptable initially.

Offline Inventory would only be justified if Koranco confirms that Supervisors
record input usage in low-connectivity fields at the point of work. If so, it
is a **separate approved phase** that reuses the established offline patterns
(lease, owner isolation, operation UUID, processed-operation table) and must
answer how negative balances and stale balances are handled. It is not
implemented now.

## Reporting

Online-only reports derived from posted movements, consistent with ADR-010:

- **Current stock balance** — per item: item code/name/category/unit, current
  balance, last movement date.
- **Low-stock items** — only if item-specific reorder thresholds are confirmed;
  otherwise omitted.
- **Receipts by period** — date range, item, total received, count.
- **Issues/usage by period** — date range, item, total issued, count.
- **Usage by FarmUnit** — for issues that carry a FarmUnit; items/issues
  without one are reported as "unassigned," never force-attributed.
- **Adjustments** — list/report by reason and period.
- **Movement history** — bounded, filterable list per item with drill-down to
  each movement and its audit trail.

No reorder levels, "stock health scores," AI, or forecasts. Units are never
combined. Every aggregate traces to the source movement rows. CSV export, if
added, follows the existing Manager-only, audited export pattern.

## Low-stock alerts

Deferred unless Koranco already uses reorder thresholds. If confirmed later:
one per-item `reorder_level` in the item's own unit, and a deterministic report
filter (`balance <= reorder_level`). No AI, no predictive planning.

## Data import / migration

Only build migration if Koranco has a real, authoritative source (existing
stock book, Excel, supplier records, current opening balances). If opening
balances exist, seed them as explicit dated **opening-balance movements**
(receipts with an `opening_balance` reason) so the ledger is self-contained and
auditable. Do not build generic import infrastructure preemptively.

## Security and sensitive data

- Agrochemical names and usage are operational, not highly sensitive, but
  restrict access to authenticated inventory users.
- Supplier names/contacts and any cost data are more sensitive; collect them
  only if needed **[CONFIRM]** and keep them out of logs/exports by default.
- Do not collect financial data unnecessarily. Inventory is not payroll or
  accounting.
- Follow existing data-protection posture (Ghana Data Protection Act, 2012) and
  do not copy production inventory data into lower environments casually.

## Cost / valuation

Deferred. MVP tracks quantity and control only — no unit cost, purchase cost,
or stock valuation. If Koranco later needs valuation, design it explicitly
(cost method, currency, handling of adjustments/reversals) as a separate
approved phase. Do not let quantity control silently become an accounting system.

## MVP scope

- Item register: create, update, archive; code/name/category/unit/active status.
- Stock movements: direct-posted receipt, issue, adjustment, reversal.
- Optional FarmUnit and free-text activity reference on issues.
- Derived current balance and bounded movement history.
- Non-negative balance enforcement with per-item transaction locking.
- Proposed permissions (pending confirmation) mapped to existing roles.
- Operational audit for all movements and item lifecycle.
- Basic online reports: current balance, receipts/issues by period, usage by
  FarmUnit, adjustments.

## Deferred scope (each needs a confirmed requirement)

- Multiple stock locations / stores hierarchy.
- Supplier master data and purchase orders / procurement.
- Batch/lot and expiry tracking.
- Cost, valuation, and accounting integration.
- Automatic reorder thresholds and alerts.
- Offline Inventory capture.
- Structured Field Activities / fertilizer-schedule integration.
- Barcode/QR scanning.
- Predictive stock planning, AI/ML.
- Generic unit conversion.
- Approvals workflows.

Justification: none of these are stated in the proposal, several (cost,
procurement, multi-location, conversion) add significant complexity or risk
silently turning a quantity-control tool into an ERP, and the project's
maintainability rules require every abstraction to solve a demonstrated
problem.
