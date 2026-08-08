# Management reporting and operational overview

## Purpose

Reporting answers real operational questions from data the system already
captures: what Attendance was recorded, which FarmUnits produced Harvest, what
happened over a selected period, and which source records produced a displayed
total. It is not a generic SaaS dashboard, an analytics engine, or a forecasting
or productivity tool.

Reporting is **online-only**. It reflects the authoritative PostgreSQL state at
query time. Pending browser-local offline mutations (ADR-008, ADR-009) are not
official reporting data until they are synchronized and confirmed by the API.

## Access

Centralized permissions gate every endpoint; the backend enforces them and the
frontend only shows what the session already grants.

| Role      | `reports.read` | `exports.create` |
| --------- | :------------: | :--------------: |
| Manager   | yes            | yes              |
| Supervisor| yes            | no               |
| Worker    | no             | no               |

`reports.read` grants the Overview, Attendance report, and Harvest report.
`exports.create` (Manager-only) grants CSV export.

## Date semantics

- Attendance and Harvest each carry an explicit **operational date**
  (`attendance_date`, `harvest_date`). All report grouping uses these explicit
  dates; it is never derived from browser-local timestamps.
- Date ranges are **inclusive** on both ends: `date_from <= op_date <= date_to`.
- "Today" on the Overview defaults to the server's UTC calendar date (Ghana is
  UTC/GMT with no daylight saving) and can be overridden with an explicit
  `date` parameter. The operational-day boundary and timezone are otherwise
  unresolved and not assumed.
- Server timestamps (`submitted_at`, `occurred_at`) remain appropriate only for
  audit/event chronology, not for operational grouping.

## Metric definitions

### Overview (`GET /api/v1/reports/overview`)

For the selected operational `date` (default: server today):

- **Attendance.submitted_sessions** = number of distinct
  `attendance_sessions` whose `status = 'submitted'` and whose
  `attendance_date` equals the selected date.
- **Attendance.present_count** = number of `attendance_entries` whose current
  `attendance_status = 'present'`, whose parent `attendance_session` is
  `submitted`, on the selected date.
- **Attendance.absent_count** = same, with `attendance_status = 'absent'`.
- **Attendance.roster_count** = number of `attendance_entries` in those
  submitted sessions on the selected date (the roster those sessions contain).
- **Harvest.submitted_records** = number of `harvest_records` whose
  `status = 'submitted'` on the selected date.
- **Harvest.by_unit** = for each unit independently, `record_count` and
  `SUM(quantity)` over the submitted records on the selected date, grouped by
  unit. Units are never combined.
- **Recent activity** = the most recently submitted Attendance sessions and
  Harvest records (newest first), bounded, regardless of date, with the
  operational context (date, responsible user, counts, FarmUnit, quantity/unit).

### Attendance report (`GET /api/v1/reports/attendance`)

For an inclusive `date_from`..`date_to` range, over submitted sessions only:

- **submitted_session_count** = `COUNT(DISTINCT attendance_session)` matching.
- **present_count** = `COUNT` of entries with `attendance_status = 'present'`.
- **absent_count** = `COUNT` of entries with `attendance_status = 'absent'`.
- **roster_count** = `COUNT` of entries in the matching submitted sessions.
- **sessions** = one row per submitted session with its own
  `present_count`, `absent_count`, `roster_count` (its roster), plus the
  responsible recorder (`recorded_by_name`) and submitter (`submitted_by_name`),
  and the session id for drill-down.

A session-specific ratio is reported only against that session's own roster
(its `roster_count`). No farm-wide attendance rate is invented.

### Harvest report (`GET /api/v1/reports/harvest`)

For an inclusive `date_from`..`date_to` range, over submitted records,
optionally filtered by `farm_unit_id` and/or `unit`:

- **submitted_record_count** = `COUNT` of matching submitted records.
- **by_unit** = `SUM(quantity)` and `record_count` grouped independently by
  unit. Incompatible units are never added together. Example — 12,450 fruit
  and 840.5 kg remain two independent totals; **13,290.5 total Harvest is never
  reported**.
- **by_farm_unit** = per-FarmUnit `record_count` and per-unit `by_unit` totals,
  with the FarmUnit code/name/type.
- **records** = the matching submitted source records (bounded) with
  identifiers for drill-down.

### FarmUnit behavior

Harvest attaches to exactly one `FarmUnit`. The `farm_unit_id` filter and the
by-FarmUnit breakdown match records whose FarmUnit is **exactly** the selected
unit. No parent/child hierarchy aggregation is performed (see
[FarmUnit aggregation boundary in ADR-010](../decisions/ADR-010-management-reporting.md)):
records may attach directly to a Field or to a child Block, so Field-inclusive-
of-Blocks totals are ambiguous and remain an open Koranco question rather than
an invented business rule.

## Source traceability

Every summary returns the identifiers and a bounded list of the source records
that produced it:

- Attendance summary → the `AttendanceSession` ids (drill-down to
  `/attendance/{id}`).
- Harvest summary → the `HarvestRecord` ids (drill-down to `/harvest/{id}`).

No opaque aggregate numbers are shown without a path to the underlying records.

## CSV exports

Manager-only (`exports.create`). Endpoints:

- `GET /api/v1/reports/exports/attendance`
- `GET /api/v1/reports/exports/harvest`

Exports:

- respect the same reporting filters (`date_from`, `date_to`, and for harvest
  `farm_unit_id`, `unit`);
- have stable columns;
- are UTF-8 encoded and correctly CSV-escaped (quotes, commas, newlines);
- include explicit operational dates and the Harvest unit;
- are bounded (default and maximum 10,000 rows);
- enforce authorization on the backend;
- record a `security_events` entry (`export_created`) with the actor, export
  type, timestamp, row count, and filters — never the file contents.

Spreadsheet formula injection is neutralized: any text value beginning with
`=`, `+`, `-`, or `@` is prefixed with a single quote so it is treated as
literal text, not an expression.

### Attendance CSV columns

`session_id, attendance_date, worker_code, worker_name, attendance_status, time_in, time_out, recorded_by, submitted_by, submitted_at`

### Harvest CSV columns

`record_id, harvest_date, farm_unit_code, farm_unit_name, farm_unit_type, quantity, unit, recorded_by, submitted_by, submitted_at, notes`

## Excluded analytics

The following are intentionally excluded from this phase and were not
requested: inventory, payroll, crop lifecycle management, full batch/export
traceability, AI/ML, forecasting, productivity or performance scoring,
speculative analytics, a data warehouse, generic analytics engines, materialized
views or summary tables without a demonstrated need, unit conversion, and
cross-unit totals. No chart library is added because tables answer the confirmed
questions directly.
