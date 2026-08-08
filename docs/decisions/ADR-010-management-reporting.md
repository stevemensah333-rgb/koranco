# ADR-010: Management Reporting and Operational Overview

- Status: Accepted
- Date: 2026-08-08
- Related: ADR-007, ADR-008, ADR-009

## Context

The initial product scope explicitly included "operational reporting and management overview" and "exports" as part of the first delivery. During the Offline Harvest (ADR-009) implementation phase, a temporary boundary instruction was in force to prevent scope creep. That phase is now complete from an implementation standpoint (with documented Playwright verification debt). The project owner has explicitly authorized the next planned phase: Management Reporting and Operational Overview.

## Decision

Implement a restrained, permission-controlled management reporting experience that answers operational questions using only data already captured by the implemented Attendance and Harvest domains.

Key architectural boundaries:

- All reporting reads **authoritative PostgreSQL data only**; never browser-local pending state.
- Reporting is **online-only**; no IndexedDB caching, no outbox involvement, no offline reporting workflow.
- Reporting does **not** alter Attendance or Harvest source-of-truth semantics, lifecycle rules, or correction processes.
- Incompatible Harvest units (`fruit_count` and `kilograms`) must **never** be combined or converted.
- Every summary metric must remain **traceable** to source operational records (drill-down to AttendanceSession / HarvestRecord).
- No generic analytics platform, data warehouse, or query engine is introduced.
- CSV exports are **Manager-only** (`exports.create` permission) and produce an auditable event.
- No AI/ML, forecasting, payroll, productivity scoring, yield-per-area metrics, or speculative analytics are authorized.
- Database aggregation (COUNT, SUM, GROUP BY) is preferred over client-side aggregation.
- No materialized views or summary tables are introduced without a demonstrated concrete need.
- Reporting permissions are added centrally (`reports.read`, `exports.create`) and enforced authoritatively (no role-name checks).
- Unresolved Koranco business questions (official unit set confirmation, exact metric definitions beyond existing domain semantics, etc.) remain documented as unresolved.

## Consequences

- Managers and Supervisors gain `reports.read`; only Managers receive `exports.create`.
- The reporting surface is deliberately narrow and explicit (overview + attendance + harvest endpoints).
- CSV exports are bounded, UTF-8, formula-injection safe, and audited.
- Empty/error states, unit separation, date-range semantics (operational date), and source traceability are first-class concerns.
- Phase 9 (Offline Harvest) browser verification debt remains documented separately and is not claimed as solved.
- Future expansion of reporting (new metrics, additional domains, materialized views) requires explicit approval and a new ADR when justified by real operational need.

This ADR records the transition from the temporary phase-boundary instruction to an authorized, bounded reporting implementation phase. All other deferred items (inventory, payroll, crop lifecycle, full traceability, AI/ML, etc.) remain prohibited unless separately authorized.