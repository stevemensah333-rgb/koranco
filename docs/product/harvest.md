# Online harvest recording

## Purpose and record meaning

A `HarvestRecord` captures one quantity of produce harvested from one FarmUnit on one explicit operational date. It replaces fragmented manual records with retrievable, attributable operational facts. It is not inventory, export traceability, sales, logistics, quality inspection, worker productivity, crop forecasting, or payroll.

The record has a client-compatible UUID, harvest date, FarmUnit, decimal quantity, constrained unit, optional 500-character operational note, lifecycle status, optimistic version, responsible application users, and server timestamps. It has no Worker, team, crew, crop, variety, planting-cycle, grade, load, batch, or destination relationship.

## FarmUnit rule

Harvest references the existing generic `FarmUnit` with one foreign key. Submission and correction require an active unit. When an active Field has active child Blocks, the Field is ambiguous and the user must select a Block. An active Field without active child Blocks and an active standalone Block are valid. No amount is copied to a parent; later reporting may aggregate descendants deliberately.

Deactivating a FarmUnit never invalidates an existing submitted record. It remains readable with the current FarmUnit identity and an inactive marker.

## Quantity and provisional units

The authoritative quantity is PostgreSQL `NUMERIC(14,3)`, never binary floating point. The allowed unit set is explicitly defined in code and database constraints:

- `fruit_count`: positive whole numbers only;
- `kilograms`: positive values with up to three decimal places.

These two units are provisional pending Koranco confirmation. There is no conversion, rounding, or cross-unit aggregation. Reports must keep units separate unless approved conversion rules are introduced.

## Lifecycle, submission, and corrections

A draft is editable and not official. Submission is an explicit transaction that revalidates the FarmUnit and changes the record to submitted using server time and authenticated-user attribution. A row lock makes repeated or concurrent submission of the same UUID idempotent; it creates one transition and one submission audit event. Multiple distinct records for the same date and FarmUnit are valid because they may represent legitimate harvest events.

Submitted records cannot be freely edited or deleted. Manager or Supervisor corrections require the complete replacement values, expected version, non-empty reason, and explicit confirmation. Date and FarmUnit may be corrected. The current row becomes current truth while append-only operational audit retains actor, server timestamp, reason, and before/after values. A stale version is rejected. Only drafts may be explicitly discarded.

## Authorization and current delivery boundary

Managers and Supervisors receive `harvest.read`, `harvest.record`, and
`harvest.correct`. Worker application accounts receive none. Backend permission
dependencies are authoritative.

New Harvest draft capture and first submission are available offline under
[ADR-009](../decisions/ADR-009-harvest-offline-synchronization.md). Submitted-
record correction remains online-only, along with Farm Structure and account
administration, reporting, and audit browsing.

## Offline capture

Users first prepare the active FarmUnit reference list while connected. New
drafts and complete values are then saved in owner-scoped IndexedDB storage.
Explicit submission creates one durable `submit_harvest_snapshot` operation with
a stable operation UUID and client-generated HarvestRecord UUID. “Saved on this
device. Waiting to sync.” never means official submission.

On reconnection, `POST /api/v1/harvest-records/sync` fully revalidates the actor,
permission, FarmUnit, quantity, unit, note, and version before invoking the
normal Harvest submission path. Operation UUID provides retry idempotency;
HarvestRecord UUID provides equivalence. FarmUnit plus date is never treated as
a duplicate key because multiple legitimate records may share both.

Outcomes are explicit: applied, already applied, conflict, or rejected. Response
loss can be retried without creating a second record or submission audit. Stale
server drafts, inactive or ambiguous FarmUnits, unsupported payloads, revoked
permission, and cross-actor replay preserve the local values in a needs-attention
state; nothing is silently overwritten or discarded.

The local database is additively upgraded from Attendance schema v1 to field
schema v2, preserving existing Attendance stores. Attendance and Harvest retain
separate outboxes, sync engines, API endpoints, and processed-operation tables
while sharing only the lease, owner-isolation, trigger, status, and service-
worker update-gate primitives. See the detailed
[offline protocol](../architecture/harvest-offline-sync.md) and
[physical-device checklist](../operations/offline-harvest-field-test.md).
