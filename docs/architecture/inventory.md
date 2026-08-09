# Inventory architecture

> **Status: Design only (2026-08-09).** No inventory code is implemented. This
> document specifies how the domain would be built to match existing Koranco
> conventions. Business decisions marked **[CONFIRM]** are in the
> [questionnaire](../product/inventory-requirements-questionnaire.md).

## Module boundary

Inventory is a new domain module under `apps/api/src/koranco/inventory/`,
organized like the Harvest domain: `models.py`, `schemas.py`, `service.py`,
`routes.py`. It owns item master data and stock movements. It references
`farm_structure.FarmUnit` by a nullable foreign key (read-only relationship)
but never owns or mutates FarmUnits. It invokes the shared
`operational_audit` capability. It does not depend on Harvest, Attendance, or
Workers. Reporting reads inventory tables through deliberate query boundaries.

HTTP concerns stay in routes; confirmed business rules live in `service.py`;
SQLAlchemy models are not Pydantic schemas. This follows the existing modular
monolith and domain-boundaries guidance.

## Domain model

### `inventory_items`

Master data for one stocked thing.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `code` | `varchar`, unique, not null | Human-readable stable code; preserve Koranco's existing codes. Trimmed, case/format preserved (same rule as Worker codes). |
| `name` | `varchar`, not null | |
| `category` | `varchar` | Constrained set **[CONFIRM]** (e.g. fertilizer, agrochemical, planting_material, ppe, packaging, tools, fuel, consumable, other). Free-text only if Koranco cannot fix a list. |
| `unit` | `varchar`, not null | One constrained unit per item (see product doc). Never changes after movements exist. |
| `status` | `varchar`, not null, default `active` | `active` / `inactive` (archive, never delete). |
| `created_by`, `updated_by` | UUID → `application_users` | |
| `created_at`, `updated_at` | timestamptz | server default / onupdate |

Constraints/indexes:

- Unique `code`.
- `CHECK (status IN ('active','inactive'))`.
- `CHECK (unit IN (...))` — the confirmed unit set.
- Index on `(status, category)` for listing; item codes searched with
  case-insensitive prefix/contains if needed.

Lifecycle: Manager creates/updates/archives. Archiving sets `inactive`; it does
not delete or alter movements. An inactive item cannot receive new movements
(except, optionally, an adjusting reversal — **[CONFIRM]**); it remains on
historical reports.

### `stock_movements`

The append-only ledger. One row per posted stock event. This is the only source
of truth for quantities.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `item_id` | UUID → `inventory_items`, not null | |
| `movement_type` | `varchar`, not null | `receipt`, `issue`, `adjustment`, `reversal` |
| `occurred_on` | `date`, not null | Operational date (explicit, not derived from timestamps). |
| `quantity_delta` | `NUMERIC(14,3)`, not null | Signed: receipt positive, issue negative, adjustment either sign. |
| `farm_unit_id` | UUID → `farm_units`, nullable | Optional attribution on issues. `ON DELETE RESTRICT`. |
| `activity_ref` | `varchar`, nullable | Optional free-text future-activity reference (no FK). |
| `reason` | `varchar`, nullable | Required for `adjustment`/`reversal`; constrained reason code. |
| `supplier_name` | `varchar`, nullable | Receipts only; free-text until a supplier domain is justified. |
| `reference` | `varchar`, nullable | Invoice/delivery note number, etc. |
| `note` | `varchar(500)`, nullable | |
| `reverses_id` | UUID → `stock_movements`, nullable | Set on a reversal to the original movement. |
| `created_by` | UUID → `application_users`, not null | Authenticated actor. |
| `created_at` | timestamptz, server default | Authoritative chronology. |

Constraints/indexes:

- `CHECK (movement_type IN ('receipt','issue','adjustment','reversal'))`.
- Receipts: `quantity_delta > 0`; issues: `quantity_delta < 0`; adjustments/
  reversals: non-zero, either sign. Enforced with type-conditional CHECKs.
- `CHECK (reason IS NOT NULL)` for adjustment/reversal.
- `CHECK (farm_unit_id IS NULL OR movement_type IN ('issue','adjustment'))` —
  attribution is meaningful on issues (and their adjustments), not on generic
  receipts. **[CONFIRM]** if receipts should also carry a destination.
- `reverses_id` unique if used (a movement is reversed at most once), nullable.
- Index `(item_id, occurred_on)` for balance and period queries.
- Index `(farm_unit_id, occurred_on)` for usage-by-FarmUnit reports.
- Index `(movement_type, occurred_on)` for receipts/issues/adjustment reports.
- No `updated_at` — movements are immutable once posted.

**Resulting balance** is computed, not stored:

```sql
SELECT COALESCE(SUM(quantity_delta), 0)
FROM stock_movements
WHERE item_id = :item_id;
```

The non-negative rule is enforced in the same transaction that locks the item
row (see below). A `CHECK` cannot reference other rows, so integrity is a
transaction + (optionally) a database trigger that re-sums under the row lock;
the application lock is the primary guard, the trigger is defense in depth.

### Tables deliberately omitted

- `stock_locations` — single implicit store until multiple locations are
  confirmed.
- `suppliers` — free-text `supplier_name` until supplier management is
  justified.
- `batches`/`lots`/expiry columns — until traceability is confirmed.
- A `stock_balances` cache table — until measured scale requires it.
- Any generic ledger/line-item/repository framework.

## Stock movement transaction

Each receipt/issue/adjustment is one transaction:

1. `BEGIN`.
2. `SELECT id FROM inventory_items WHERE id = :item_id FOR UPDATE` — serializes
   all movements for that item (PostgreSQL row lock), the same pattern Farm
   Structure uses for hierarchy changes and Harvest uses for submission.
3. Verify item is active; validate type, signed delta, reason, references, and
   optional FarmUnit (active/unambiguous rules can mirror Harvest's FarmUnit
   check **if** FarmUnit attribution is confirmed).
4. Compute `new_balance = current_balance + delta`. Reject with 409 if
   `new_balance < 0` under the recommended hard-prevent policy.
5. Insert the movement.
6. Append an `operational_audit_events` row (actor, action, entity, before/after
   including old and new balance, reason/explanation, request id).
7. `COMMIT`.

Because the item row is locked for the transaction's duration, two concurrent
issues cannot both pass the balance check. No Redis, queue, or distributed lock
is needed.

### Correction of a posted movement

No edit/delete API. A correction posts a `reversal` movement referencing the
original (delta = negation of original), then optionally a new correct movement.
Both are normal ledger rows and both are audited. The original remains, so
historical reports are reproducible. This mirrors how submitted Attendance and
Harvest are corrected (append-only, reason + before/after) rather than mutated.

## API design

REST endpoints under `/api/v1`, consistent with Harvest/Attendance conventions.
All writes require CSRF and a permission dependency; reads require a permission
dependency. Pagination uses the standard `limit`/`offset` envelope.

### Items

- `GET /inventory/items` — list active (and optionally inactive) items; filter
  by category/status; search by code/name. Permission `inventory.read`.
- `POST /inventory/items` — create item. Permission `inventory.item.manage`.
- `PATCH /inventory/items/{id}` — update name/category/code; unit is immutable
  once movements exist. Permission `inventory.item.manage`. No generic
  unrestricted PATCH: only confirmed fields accepted.
- `POST /inventory/items/{id}/archive` — set inactive. Permission
  `inventory.item.manage`.

### Movements

- `POST /inventory/movements/receive` — body: item, occurred_on, quantity,
  optional supplier_name/reference/note. Creates a `receipt`. Permission
  `inventory.receive`. Returns 201 with the movement and resulting balance.
- `POST /inventory/movements/issue` — body: item, occurred_on, quantity,
  optional farm_unit_id, activity_ref, note. Creates an `issue` (negative
  delta). Permission `inventory.issue`. 409 if it would make balance negative.
- `POST /inventory/movements/adjust` — body: item, occurred_on, signed delta or
  a stated new balance (server computes delta), reason code, required
  explanation, optional farm_unit_id/note. Permission `inventory.adjust`
  (Manager-only by default).
- `POST /inventory/movements/{id}/reverse` — body: occurred_on, required
  explanation. Creates a `reversal`. Permission `inventory.adjust`.
- `GET /inventory/movements` — movement history; filters: item_id,
  movement_type, farm_unit_id, date_from/date_to; bounded pagination.
  Permission `inventory.read`.
- `GET /inventory/movements/{id}` — one movement with resulting balance and
  audit link. Permission `inventory.read`.
- `GET /inventory/movements/{id}/audit` — reuse the existing
  `operational_audit` query pattern (as Harvest does at
  `/harvest-records/{id}/audit`). Gated by `inventory.read` plus the existing
  operational-audit access model.

### Balances / reports

- `GET /inventory/balances` — current balance per item, with optional
  category/status filter and low-stock filter only if thresholds are confirmed.
  Permission `inventory.read` (and surfaced under `reports.read` in the
  reporting UI).
- `GET /reports/inventory` — period receipts/issues/adjustments and usage by
  FarmUnit, following ADR-010 response shapes and online-only rule. Permission
  `reports.read`.
- `GET /reports/exports/inventory` — optional Manager-only CSV, following the
  existing audited export pattern (`exports.create`, security event, no file
  contents logged). **[CONFIRM whether required].**

### Validation, errors, idempotency

- All quantities are `NUMERIC(14,3)`; whole-unit items use a CHECK where needed.
- Item units and movement types/reasons are constrained enums on the model and
  in Pydantic.
- Dates are explicit operational dates; date_to cannot precede date_from.
- Errors: 404 unknown item/movement, 409 inactive item / negative balance /
  already-reversed / unit-immutable, 422 invalid input. Distinct messages.
- Online-only means no operation-UUID idempotency table in MVP. Double-submit is
  prevented by standard UI/CSRF safeguards. If offline Inventory is later
  approved, it adds a per-domain processed-operation table exactly as
  ADR-008/ADR-009 did — not a shared generic framework.
- List responses use the standard `{items,total,limit,offset}` envelope.

## Frontend / UX direction

Management-first, following the design system (density, strong tables, filters,
no decorative dashboard cards, no emoji). A top-level **Inventory** section with:

- **Stock** — compact table: code, name, category, unit, current balance, last
  movement date; search by code/name; filter by category/status; row action to
  view movement history.
- **Movements** — filterable history (item, type, FarmUnit, date range) with
  drill-down to one movement and its audit trail.
- **Receive** — single deliberate form (item select, date, quantity, optional
  supplier/reference/note), clear confirmation showing the new balance.
- **Issue** — item, date, quantity, optional FarmUnit/activity, note; shows
  current balance and blocks issue if it would go negative; explicit confirm.
- **Adjust** — Manager-only; reason code + required explanation + delta/new
  balance, with a clear warning that this creates an auditable correction.

Forms are straightforward React forms/tables. No generic inventory engine, no
wizard framework. All write actions show clear loading/validation/success/error
states and respect permission-based visibility (backend remains authoritative).

**Field UX:** none in MVP. A phone-first issue-capture screen is only introduced
if Koranco confirms that Supervisors record input usage in the field and that
offline is required — at which point it becomes the separate approved offline
phase, using the existing PWA offline patterns.

## Maintainability

An engineer must be able to trace:

```
Receive stock → POST /inventory/movements/receive (routes.py)
  → service.receive_stock() (FOR UPDATE item, validate, insert movement, audit)
  → stock_movements row + operational_audit_events row
```

No repository layer, no event bus, no generic ledger abstraction, no factory, no
unit-conversion engine, no premature location hierarchy. Explicit domain service
functions, conventional SQLAlchemy 2 models, normal FastAPI routes. Non-obvious
behavior (why the item row is locked, why movements are immutable, why negatives
are prevented) is commented with its rationale. Schema changes ship through
Alembic with reviewed migrations.
