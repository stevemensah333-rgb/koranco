# ADR-012: Management reporting visualization layer

- Status: Accepted
- Date: 2026-08-09

## Context

ADR-010 delivered the reporting API and a compact management UI. Koranco then
authorized a management-UI and reporting-visualization phase: the authenticated
home becomes a management overview, and the Overview / Attendance / Harvest
reports add restrained data visualization. The product must stay a serious
agricultural operations tool — no generic SaaS dashboard styling, no fabricated
metrics, and no forcing charts into operational workflows.

ADR-010 explicitly chose **not** to add a chart library ("No chart library is
added because tables answer the confirmed questions directly"). That clause was
correct for the 010 phase. This phase adds the missing answers — trends over
operational dates and exact-FarmUnit comparisons — while keeping the decision
to avoid a chart dependency.

## Decision

1. **A small, dependency-free visualization layer.** Charts are hand-rendered
   HTML/CSS components (`BarChart`, `ChartFrame`, `HarvestBars`, summary strip)
   under `apps/web/src/modules/reports/components`. No chart library is
   introduced. The required shapes (grouped/stacked vertical bars, a horizontal
   FarmUnit comparison, sparse/zero/single-point data) are simple enough that a
   dependency would add weight without capability. If Koranco later needs
   complex charts, ADR-010's preference for the smallest justified dependency
   should be revisited with evidence.

2. **Date-series aggregation is added to the reporting API, computed in
   PostgreSQL.** The visualization layer must not aggregate data client-side
   (ADR-010 rule 4). Therefore:
   - `GET /reports/attendance` now returns `by_date`: per-operational-date
     `submitted_sessions`, `present_count`, `absent_count`, `roster_count`.
   - `GET /reports/harvest` now returns `by_date`: per-(date, unit) rows
     (`date`, `unit`, `record_count`, `quantity`). Grouping by `(date, unit)`
     means a day with both fruit and kg yields two independent rows — a mixed
     unit can never be drawn as one bar.
   - `GET /reports/overview` gains an optional `days` window (1–60, default 14)
     returning `attendance_by_date` and `harvest_by_date` ending at the
     selected operational date, plus `harvest_by_farm_unit` for that date
     (exact FarmUnit totals, identical semantics to the Harvest report).

3. **Unit separation is a visualization invariant.** Each Harvest chart plots
   exactly one unit at a time. The unit is carried through `units.ts` /
   `series.ts` so a chart cannot even express a cross-unit total. Where more
   than one unit exists, a unit selector switches the chart; the summary strip
   shows each unit's own total and record count. `840.5 kg + 12,450 fruit`
   remains two independent numbers everywhere.

4. **FarmUnit comparison is exact-only.** `harvest_by_farm_unit` matches each
   FarmUnit's own records. Field-inclusive-of-Blocks aggregation remains an
   open Koranco business question (ADR-010) and is not invented in the UI.

5. **Charts are supplemental to tables.** Every aggregate retains its source
   records: the attendance sessions table and the harvest source-records table
   remain, with drill-down links. A manager can always move from a total to the
   contributing records.

6. **First-class empty/loading/error states.** An empty visualization region
   shows a restrained message explaining what will appear once operational
   records are submitted, instead of meaningless axes. Loading stays subtle and
   accessible; API failure produces an explicit alert.

7. **Accessibility of visualization.** Each chart renders a hidden data table
   (dates and values) so the numbers are never only graphical; columns are
   keyboard-reachable buttons with meaningful labels and a tooltip; legends
   distinguish series by texture as well as color; reduced-motion preferences
   are respected (charts are static, no animation).

8. **Permissions are unchanged.** `reports.read` and `exports.create` still
   gate every endpoint and button. The new overview surfaces render only for
   sessions the backend already grants; no role-name checks are added.

## Consequences

- The management overview and reports answer "what happened over time" and
  "which FarmUnit produced what" from authoritative PostgreSQL aggregation.
- No new runtime dependency, no charting bundle weight.
- The reporting API grows three small additive response fields; existing
  consumers are unaffected.
- Frontend-only visual changes never re-aggregate data; the backend remains
  the only place totals are computed.
- ADR-010 remains accepted; ADR-012 supersedes only its "no chart library"
  clause in the specific sense documented above.
