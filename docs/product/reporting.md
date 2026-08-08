# Management Reporting and Operational Overview

**Phase authorized by ADR-010 (2026-08-08)**

Reporting reads **only authoritative PostgreSQL data**. It is strictly online-only. No IndexedDB caching or offline reporting is implemented.

## Metric Definitions

### Overview – Today
- `attendance_sessions`: number of submitted `AttendanceSession` records for the current operational date.
- `present_count`: number of `AttendanceEntry` rows with status `present` belonging to submitted sessions on the current date.
- `absent_count`: number of `AttendanceEntry` rows with status `absent` belonging to submitted sessions on the current date.
- `harvest_records`: count of submitted `HarvestRecord` rows for the current operational date.
- `harvest_totals`: map of `unit` → `SUM(quantity)` for submitted HarvestRecords on the current date. Units are kept separate (`fruit_count`, `kilograms`).

### Recent Activity
- Recent submitted Attendance sessions and Harvest records (last 5 by submission time).
- Includes operational date, responsible user, FarmUnit (for Harvest), quantity/unit, and attendance counts.

### Attendance Report
- Sessions within a date range (inclusive).
- Per-session: date, Present count, Absent count, roster count, submitting user.
- No broad “farm attendance rate” is calculated unless the expected workforce population is explicitly known.

### Harvest Report
- Records within a date range, optionally filtered by FarmUnit and unit.
- Totals grouped by unit (never combined across units).
- Drill-down returns the source `HarvestRecord` rows.

## Date Semantics
- All filters and grouping use the explicit **operational date** stored on AttendanceSession / HarvestRecord.
- Server `submitted_at` / `created_at` timestamps are used only for recency ordering and audit.

## Authorization
- `reports.read` required for all report endpoints (Manager + Supervisor).
- `exports.create` required for CSV exports (Manager only).

## Exports (CSV)
- Manager-only.
- UTF-8, stable column names, formula-injection safe (values starting with `=`, `+`, `-`, `@` are prefixed with a single quote).
- Audit event recorded on export (actor, type, filters, timestamp).
- Bounded result sets.

## Exclusions (intentional)
- No AI/ML, forecasting, payroll, productivity, yield-per-area, or speculative metrics.
- No generic analytics engine.
- No materialized views or summary tables.
- No offline reporting.
- No combination of incompatible Harvest units.

All metrics are derived directly from existing Attendance and Harvest domain data. Unresolved Koranco questions (official unit set, exact workforce population, etc.) remain documented in `unresolved-requirements.md`.