# ADR-010: Management reporting and operational overview

- Status: Accepted
- Date: 2026-08-08

## Context

The confirmed operational domains (Attendance, Harvest, Farm Structure, Worker register) capture authoritative data in PostgreSQL. Koranco now authorizes a reporting phase to answer operational questions such as "What attendance was recorded today?", "Which FarmUnits produced harvest?", "What happened over a selected historical period?", and "Which source records produced the displayed totals?".

The project has already rejected generic SaaS dashboards, AI/ML, forecasting, inventory, payroll, productivity scoring, and a data warehouse. Reporting must remain a restrained, auditable view over authoritative domain data — not a new analytics subsystem.

## Decision

Implement a narrow, typed reporting API and a compact management UI, deriving every metric from existing submitted Attendance and Harvest records. The authoritative database (PostgreSQL) performs all aggregation.

1. **Reporting is online-only.** Only server-confirmed `submitted` records participate. Pending browser-local offline mutations are not official reporting data until synchronized. Reporting writes nothing to IndexedDB and is not part of offline synchronization (ADR-008, ADR-009).
2. **No new report schema.** Reports reuse `attendance_sessions`, `attendance_entries`, `harvest_records`, and `farm_units`. No summary tables, materialized views, analytics database, or caching infrastructure is introduced unless a demonstrated need appears.
3. **Typed endpoints, no query language.** Narrow endpoints: `GET /reports/overview`, `GET /reports/attendance`, `GET /reports/harvest`, plus Manager-only CSV exports. No generic reporting/query DSL and no generic analytics engine.
4. **Database aggregation.** `COUNT`, `SUM`, and `GROUP BY` are executed in PostgreSQL. No client-side aggregation of full datasets.
5. **Units are never combined.** Harvest quantities are grouped independently by their constrained unit (`fruit_count`, `kilograms`). No unit conversion is introduced. Incompatible units always remain separate totals (e.g. 12,450 fruit and 840.5 kg are never summed).
6. **Centralized permissions.** Reporting is gated by `reports.read`; CSV exports by `exports.create`. Manager: both. Supervisor: `reports.read` only. Worker: neither. Backend permission dependencies are authoritative; no role-name checks are scattered through reporting code.
7. **Source traceability.** Every summary returns the source `AttendanceSession` / `HarvestRecord` identifiers and a bounded source-record list so managers can drill into the records that produced a total.
8. **Audited exports.** CSV export is Manager-only, bounded, UTF-8, respects the same filters, uses stable columns, and is recorded as a security event. Export audit stores the actor, export type, timestamp, and filters — never the exported file contents.

### Export audit mechanism

Exports are data-access events. We record them as **security events** (`SecurityEvent`), not operational domain audit events, and add a nullable JSONB `details` column to `security_events` (migration 0009). Rationale:

- Operational audit (`OperationalAuditEvent`) describes lifecycle transitions of a specific domain entity (create/submit/correct/discard). An export is not a mutation of a domain entity.
- Security events already form a Manager-only review surface (`/admin/security-events`) appropriate for reviewing who exported operational or personal data.
- `details` stores only the export type, row count, and filters — never file contents.

### FarmUnit aggregation boundary

`HarvestRecord` attaches to exactly one `FarmUnit`. When an active Field has active child Blocks, harvest must be recorded on a Block (see product docs and ADR-006); however, historical records may attach directly to a Field (e.g. before Blocks existed). Because the same population of records can therefore be split between direct-Field and child-Block rows, **hierarchy aggregation is not implemented**: the FarmUnit report filter matches records whose FarmUnit is exactly the selected unit, and the by-FarmUnit breakdown lists each unit's own records. Field-inclusive-of-Blocks aggregation is left as an open Koranco question rather than inventing a business rule that could double-count or omit records.

## Consequences

- Managers and Supervisors get a restrained operational overview; only Managers can export CSV.
- Reports reflect PostgreSQL state at query time; unsynced offline work is excluded by definition.
- Harvest unit semantics remain unchanged and never produce a single cross-unit total.
- A small, deliberate schema change (`security_events.details`) supports export auditing without a reporting schema.
- Date ranges are inclusive and use the explicit operational dates on Attendance and Harvest records; "today" defaults to the server's UTC calendar date (Ghana is UTC/GMT with no DST) and is overridable.
