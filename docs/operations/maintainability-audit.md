# Maintainability, Complexity, and Handover Audit

- Date: 2026-08-09
- Scope: read-only audit of the entire repository (backend, frontend, migrations,
  tests, CI, scripts, docs, ADRs). **No product code was modified.**
- Assumed maintainer: a competent engineer who knows Python/FastAPI/SQLAlchemy/
  PostgreSQL and React/Next.js/TypeScript, who has **no** access to the original
  team, AI prompts, or conversation history.

> **Resolution status (2026-08-09).** The targeted simplification phase acted on
> the findings below. The audit text is preserved as the original assessment;
> resolved items are:
>
> - **Resolved** — E-1 (canonical `DatabaseSession` in `db/session.py`), E-3
>   (`LifecycleRequest`/`change_status` moved to schemas/services), E-5
>   (`validate_entry_times` extracted), E-6 (`require_farm_unit` split into two
>   named functions), E-9 (`buildExportUrl` merged into `downloadCsv`), E-2/E-10
>   (cross-reference + ownership comments added to the four sync modules and
>   `offline/db.ts`), E-11 (draft-replace semantics documented in
>   `docs/product/attendance.md`), F (login timing-equalization and mid-request
>   commit comments), L-1 (`ApiStatus`/`getApiHealth` removed), L-2
>   (`APP_VERSION` removed), L-4 (single `ManagementNavItem` type), M-2
>   (`docs/development/common-change-recipes.md`), M-3 (workspace ownership
>   comments), M-7 (backend test helpers consolidated into
>   `tests/helpers.py`), and the advisory-lock key comments.
> - **Deliberately unchanged** — the two sync engines (E-2), the dual-domain
>   Dexie module (E-10), the repeated frontend session gate (E-8), the four
>   audit endpoints (E-4), and the route/service duplicate submit guard (E-7);
>   see section O. The processed-operation retention policy (M-9) remains an
>   open Koranco item. CI gates for `alembic check` and the restore drill
>   (M-1) still require the GitHub App `workflows` permission.

> The original Koranco proposal document does **not** exist in the repository.
> Product intent must be reconstructed from `README.md`, `docs/product/*`,
> `docs/design/*`, and the ADRs. This is a documentation gap (K, 3).

---

## A. Executive maintainability assessment

The repository is in unusually good shape for handover by AI-assisted development
standards. It has:

- a disciplined modular-monolith layout (`identity`, `workers`,
  `farm_structure`, `attendance`, `harvest`, `operational_audit`, `reports`,
  `db`, `common`, `config`) with visible dependency rules;
- one narrow, centralized authorization model (permissions enum +
  role mapping + backend dependency), no scattered role checks;
- a small error model (one `ErrorResponse` shape, two exception types);
- consistent DB-first integrity: check constraints, optimistic versions,
  row locks, advisory-lock idempotency, append-only audit;
- an unusually complete documentation set (12 ADRs, architecture/product/
  operations/design docs, runbooks);
- a working CI pipeline (format, lint, typecheck, tests, migrations against
  PostgreSQL 17, production build, Playwright E2E).

The dominant maintainability costs are **duplication chosen deliberately but
not signposted in code** (Attendance vs. Harvest sync engines, frontend outbox
engines, per-domain audit endpoints, per-test-file helpers) and **a few large
files** (700+ line React workspaces, a 579-line offline DB module). None of
these are blockers; each is either already documented in an ADR or should be
documented rather than refactored prematurely. There is no meaningful
"accidental abstraction" problem: the codebase largely avoids generic
frameworks, factories, and interface indirection. The most useful near-term
handover work is documentation (change recipes, sync-duplication pointers,
field-add and permission-add runbooks) and two CI gates that are documented but
not enforced.

Overall rating: **HANDOVER-CAPABLE WITH DOCUMENTED WEAKNESSES** (see P).

---

## B. Bus-factor assessment

| Task for a new engineer | Rating | Why |
| --- | --- | --- |
| Clone, install, start locally | GREEN | README + `docs/development/local-development.md`; pinned Node 24/pnpm/uv; lockfiles; compose DB. Requires Docker + Node 24 + Python 3.13. |
| Run all tests | GREEN | CI runs them on every push/PR (`apps/web` + `apps/api` + E2E). Local commands documented. |
| Understand the architecture | GREEN | `docs/architecture/overview.md`, `domain-boundaries.md`, 12 ADRs, design docs. |
| Deploy to staging | AMBER | `docs/operations/staging-deployment.md` + `render.yaml` blueprint exist, but contain placeholder URLs ("Replace with actual staging Vercel frontend URL") and no production provider is selected; Vercel/Render accounts are not in the repo. |
| Restore the database | AMBER | Runbook + tested scripts + drill exist (`docs/operations/backup-and-recovery.md`, `scripts/backup-restore-drill.sh`); the drill is **not** wired into CI, so nothing enforces it stays working. |
| Diagnose a sync failure | AMBER | Excellent protocol docs (`offline-sync.md`, `harvest-offline-sync.md`, ADR-008/009, `incident-response.md` §F), but requires understanding three artifacts (lease/outbox on device, `*_sync_operations` tables, advisory-lock idempotency); no code comments point between the two near-identical sync engines. |
| Add a field to a domain | AMBER | The codebase pattern is highly consistent (model → migration → schema → service → response → frontend type → UI → tests), but no recipe documents the full chain; a field spans ~8 files and the delete/re-insert draft semantics are easy to trip on. |
| Add a new permission | AMBER | 4 required touch points (enum, role map, model check-constraint, migration) with migration `0009` as the template; no runbook. |
| Create a migration safely | AMBER | Documented procedure (`docs/operations/database-migrations.md`) is excellent, but the `alembic check` drift gate and restore drill are not in CI (GitHub App permission gap, documented); a new engineer must remember to run them manually. |

---

## C. Complexity hotspots

Ranked by expected cost to a new engineer:

1. **Offline synchronization** (backend `attendance/sync.py` + `harvest/sync.py`;
   frontend `attendance/offline/*` + `harvest/offline/*`). Inherently complex
   (idempotency, ownership, conflicts, retries) and **well documented**. The
   complexity is mostly essential; the duplication between the two domains is
   deliberate but not signposted in code (see E-2, H).
2. **Field workspaces** (`attendance-workspace.tsx` 768 lines,
   `harvest-workspace.tsx` 713 lines). Each is one component mixing online CRUD,
   offline draft state, sync triggers, corrections, audit history, and review
   UI. The state count (~18 `useState` values in AttendanceWorkspace) makes
   "add one field" risky.
3. **The dual-domain offline DB module** (`attendance/offline/db.ts`, 579 lines)
   holding both Attendance and Harvest stores/helpers, with Harvest's sync
   engine importing it from the Attendance module.
4. **Permission model touch points** — safe, but 4-file changes per new
   permission with no recipe.
5. **Draft-save semantics** — Attendance `update_draft` deletes and re-inserts
   every entry on each save (entry UUIDs, `created_at`, and versions churn);
   correct today, surprising tomorrow (see I-3).

---

## D. Essential complexity that should NOT be simplified

The following look heavy but are load-bearing. Do not refactor them away:

- **Session/CSRF double-token scheme** (`identity/security.py`, `cookies.py`,
  `dependencies.py`): hash-only token storage, constant-time compare, trusted
  Origin checks, cookie-pair return to the client. Required for the
  Vercel/Render cross-host cookie constraint (documented in
  `docs/architecture/authentication.md`).
- **Login rate limiting + dummy-password timing equalization**
  (`identity/service.py::authenticate`): the `except ValueError` normalization
  fallback and `verify_dummy_password` exist so invalid identifiers and wrong
  passwords are indistinguishable. Add a comment, never remove.
- **Advisory-lock idempotency + processed-operation tables**
  (`attendance/sync.py`, `harvest/sync.py`, migrations 0006/0008): without
  them, response-loss retries and concurrent devices create duplicate facts.
- **Roster fingerprint partial-unique index** (ADR-007): the conservative
  duplicate guard whose business boundary is still unresolved.
- **Row-lock idempotent submission + optimistic versions** in both domains.
- **DB constraints** (status/unit/quantity/submission-state checks, FK RESTRICT,
  time ordering, whole-fruit-count).
- **Append-only audit + security events with JSONB details** and the
  formula-injection-safe CSV exporter.
- **Manager-invariant advisory lock and recent-auth re-entry**
  (`identity/administration.py`).
- **Offline lease, owner isolation, no-last-write-wins** and the
  service-worker update gate.
- **Migration discipline** (immutable applied migrations, forward fixes).

---

## E. Accidental complexity candidates

### E-1. Duplicate `DatabaseSession` alias — LOW
- Files: `apps/api/src/koranco/api.py:12` and
  `apps/api/src/koranco/identity/dependencies.py:30`.
- Pattern: identical `Annotated[Session, Depends(get_db_session)]` defined twice;
  most route modules import from `identity.dependencies`, `api.py` has its own
  copy for `readiness`.
- Cognitive load: a maintainer may not notice there are two spellings of the
  same alias; adding a session-scoped dependency in one place silently misses
  the other.
- Recommendation: make one canonical definition (e.g., `db/session.py`) and
  import it everywhere. Trivial, low-risk simplification.

### E-2. Attendance vs Harvest sync engine duplication — LOW/MEDIUM (deliberate)
- Files: `attendance/sync.py` and `harvest/sync.py` (both ~250–300 lines);
  frontend `attendance/offline/sync.ts` (105 lines) and
  `harvest/offline/sync.ts` (148 lines).
- Pattern: near-identical skeletons — `_same_snapshot`, `_response_from_stored`,
  `_store_result`, advisory lock, replay/cross-actor/version/conflict branches,
  and (frontend) 401/403/temporary-failure → state mapping.
- Why it increases cognitive load: a change to one engine must be mirrored in
  the other by hand; nothing in the code points at the sibling.
- Verdict: **keep both engines** — ADR-008/009 explicitly and correctly rejected
  a generic sync framework, and a third offline domain is not confirmed.
  Recommendation: add a short comment at the top of each sync module saying
  "deliberate per-domain copy of the attendance/harvest sync protocol (ADR-008/
  ADR-009); keep in lockstep; do not generalize without a new ADR." Optionally
  extract only the *transport* helpers (advisory lock + stored-result replay)
  into one shared function — but that is a refactor, not a handover blocker.

### E-3. Duplicated `LifecycleRequest` + `change_status` helper — LOW
- Files: `workers/routes.py:119` and `farm_structure/routes.py:138`.
- Pattern: identical `LifecycleRequest` model and a `change_status` helper
  defined in the route module instead of the service layer.
- Cognitive load: business-ish helper living in the HTTP layer; two copies.
- Recommendation: move each to its domain service (or a tiny shared schema
  module). Low risk; do not treat as urgent.

### E-4. Four nearly identical audit-list endpoints — LOW/MEDIUM
- Files: `workers/routes.py`, `farm_structure/routes.py`,
  `attendance/routes.py`, `harvest/routes.py` (each `/{id}/audit`).
- Pattern: same `select(OperationalAuditEvent, display_name).join(...).order_by`
  + `audit_response` mapping.
- Recommendation: a single `audit_history_for_entity(db, entity_type, entity_id)`
  helper in `operational_audit` would remove ~4 copies; defensible either way.
  Document the alternative: per-domain endpoints keep permission granularity
  visible.

### E-5. `CorrectEntryRequest` reuses a validator by constructing a dummy object — LOW/MEDIUM
- File: `attendance/schemas.py` (~line 40).
- Pattern: `DraftEntryRequest(worker_id=uuid.uuid4(), ...)` inside a
  `model_validator` purely to reuse the time-validation logic.
- Cognitive load: constructing a throwaway Pydantic model with a random UUID is
  clever-but-obscure; a maintainer may "fix" it by deleting the line and losing
  validation.
- Recommendation: extract a module-level `validate_times(status, time_in,
  time_out)` function used by both models. Small, safe.

### E-6. `require_farm_unit(..., operational: bool)` — LOW
- File: `harvest/service.py`.
- Pattern: one function whose behavior changes on a bare boolean; call sites
  read `operational=False` / `operational=True` without context.
- Recommendation: two named functions (`require_farm_unit_exists`,
  `require_operational_farm_unit`) or keyword-only use; purely a readability
  fix.

### E-7. Route-level early-return duplicates service-level idempotency — LOW
- Files: `attendance/routes.py` (`if attendance.status == "submitted"` before
  `submit_session`) and `harvest/routes.py`; the same guard exists inside the
  services (`submit_session`/`submit_record`).
- Pattern: duplicate "already submitted" short-circuit.
- Verdict: harmless and arguably useful (avoids the nested-transaction path);
  keep, or delete the route-level copy — do not delete the service copy, which
  is what offline sync relies on.

### E-8. Frontend: repeated `getCurrentSession()` + `permissions.includes` gate — LOW
- Files: every management page/module shell
  (`admin-shell`, `attendance-workspace`, `harvest-workspace`, `reports-*`,
  `authenticated-home`, `login-form`'s post-login, `users-admin`).
- Pattern: ~10 copies of "fetch session, check permission, render deny state".
- Verdict: explicit and testable; a `useSession()` hook would remove
  duplication but adds an abstraction. Leave alone unless a third consumer
  appears; do not introduce a permission framework.

### E-9. `buildExportUrl` returns a URL that is then POSTed to — LOW
- File: `apps/web/src/modules/reports/api.ts` (`buildExportUrl` +
  `downloadCsv`).
- Pattern: export endpoints are `POST` with query-string filters, but the
  frontend builds a GET-style URL and passes it to `fetch(..., {method:
  "POST"})`.
- Cognitive load: a maintainer may "fix" the fetch to GET and break CSRF/audit
  expectations.
- Recommendation: rename to `buildExportPath` (or document the POST intent on
  `downloadCsv`).

### E-10. `offline/db.ts` is a dual-domain module — MEDIUM
- File: `apps/web/src/modules/attendance/offline/db.ts` (579 lines).
- Pattern: Attendance stores *and* Harvest stores and helpers in the Attendance
  module; `harvest/offline/sync.ts` imports `offlineDb` from
  `@/modules/attendance/offline/db`.
- Cognitive load: cross-domain import (Harvest depends on Attendance's offline
  module); the shared Dexie database name `koranco-attendance-offline` is
  historical.
- Verdict: the single Dexie DB and its name are deliberate (documented in
  `harvest-offline-sync.md` §9 — a rename is a destructive copy-migration).
  Recommendation: leave the DB alone; optionally relocate the shared DB module
  to a neutral path (e.g., `modules/offline/db.ts`) with a comment. Refactor,
  not handover blocker.

### E-11. Draft-save replace semantics — MEDIUM (documentation)
- File: `attendance/service.py::update_draft`.
- Pattern: on every draft save the service deletes all entries and re-inserts
  them (`delete(...)` + `attendance.entries = []` + append loop). Entry UUIDs,
  `created_at`, and `version` therefore churn across saves; only the submitted
  state is stable.
- Verdict: correct today (submitted data is never mutated this way) and
  simpler than a diff/upsert. The behavior is **not documented**; a future
  engineer may "optimize" it into per-entry updates and break the
  fingerprint/audit expectations.
- Recommendation: document the replace-semantics decision in `docs/product/
  attendance.md` (or a code comment) before anyone touches it.

---

## F. Backend findings

- **Layering is consistent and simple**: `routes.py` (HTTP + auth) → `service.py`
  (domain rules + audit) → SQLAlchemy models; `schemas.py` (Pydantic) separate
  from models. Good.
- **Services raise `HTTPException` directly** (`service.py` files across
  domains). This couples domain logic to the HTTP layer and prevents clean
  reuse outside requests (the backup drill calls services directly and would
  see HTTPExceptions on invalid input). Acceptable in a monolith; recommend a
  one-paragraph note in `docs/architecture/api-conventions.md` rather than an
  exception-refactor.
- **Error model is small and consistent**: `common/errors.py` (one
  `ErrorResponse`), two custom exceptions (`AuthenticationFailed`,
  `LoginRateLimited`). No archaeology needed. Keep.
- **Login normalization fallback** (`identity/service.py::authenticate`):
  deliberate anti-enumeration timing equalization; add a comment.
- **`require_authenticated_user` commits mid-request** (disabled-account path,
  `identity/dependencies.py`): subtle but correct; worth a comment.
- **`api.py` vs `identity/dependencies.py` duplicate `DatabaseSession`** — see
  E-1.
- **Reports layer** (`reports/*`): small, typed, DB-aggregated, unit-strict;
  documented in ADR-010/012. No findings.
- **`common/request_id.py` / `logging.py`**: minimal and standard. `logging.
  basicConfig(force=True)` at import is fine for this scale; note that it
  reconfigures the root logger (a future engineer adding library logging should
  know).
- **Duplicated date-range guard** (`date_to < date_from`) in attendance list,
  harvest list, and reports `_report_date_range`: trivial, acceptable.

## G. Frontend findings

- **Giant workspaces** — HIGH maintainability cost: `attendance-workspace.tsx`
  (768 lines) and `harvest-workspace.tsx` (713 lines) each combine online CRUD,
  offline draft/lease/sync, correction, audit history, search, and review UI in
  one component with ~15–18 pieces of local state. Adding a field touches many
  of them. **Do not refactor now** (field workflows are genuinely stateful and
  well-tested); instead, document a state inventory (see M-3) and treat a
  staged split as future work with E2E coverage preserved.
- **Repeated session-gate pattern** — E-8.
- **Dual-domain `offline/db.ts`** — E-10.
- **Frontend sync engines duplicate state mapping** — E-2.
- **No prop-drilling or context soup**: data flows are local and explicit.
  Good.
- **API clients are thin and consistent** (`apiRequest` + `csrfHeaders`);
  per-domain `api.ts` modules. Good.
- **`ApiStatus` component and `getApiHealth` are unused** (only their own
  tests reference them) — dead code candidate, L-1.
- **`APP_VERSION = "0.2.0"`** exported from `offline/db.ts`, never imported,
  and disagrees with `package.json` (0.1.0) — L-2.
- **Login has a hidden IndexedDB side effect**: `preserveOfflineAuthorization`
  writes the offline lease on every `login()`/`getCurrentSession()` (in
  `lib/api/auth.ts`). Correct, but a new engineer tracing login may not expect
  an IndexedDB write; add a comment.

## H. Offline-sync findings

- The complexity here is **inherent** (durable capture, idempotency, ownership,
  conflicts, no-last-write-wins, update gate) and **thoroughly documented**
  (ADR-008, ADR-009, `offline-sync.md`, `harvest-offline-sync.md`,
  `incident-response.md` §F, field-test checklists). Do not simplify.
- State vocabularies are clear and shared: draft states
  (`editing | pending_submission | syncing | synced | needs_attention`) and
  outbox states (`pending | syncing | needs_attention`), plus result values
  (`applied | already_applied | conflict | rejected`). Naming is consistent
  between frontend and backend. Good.
- The **only** recommendation is signposting: add cross-reference comments
  between `attendance/sync.py` ↔ `harvest/sync.py` and
  `attendance/offline/sync.ts` ↔ `harvest/offline/sync.ts`, and a comment in
  `offline/db.ts` explaining why Harvest lives in the Attendance-named module
  (historical DB name, ADR-009 §9).
- One operational gap is documented but real: processed-operation tables have
  **no retention policy** and are never pruned (`attendance_sync_operations`,
  `harvest_sync_operations`). ADR-008 consequence, still open with Koranco.
  Flag as HIGH operational item to resolve before production scale (it is
  listed in `unresolved-requirements.md`).
- `incident-response.md` §F covers sync backlogs; good.

## I. Database / migration findings

- Models are conventional SQLAlchemy 2 `Mapped`/`mapped_column`, with
  constraints expressed declaratively and mirrored in migrations. A normal
  SQLAlchemy developer will find this idiomatic.
- `alembic/env.py` imports every model with `# noqa: F401` (standard), and
  uses `compare_type=True`. `0002` has the documented model-metadata
  reconciliation for unique artifacts (`database-migrations.md`). Fine.
- Migration 0009 (permission backfill + check-constraint rebuild) is the
  template for adding permissions — worth a recipe doc (K-4).
- Draft-replace semantics in Attendance — E-11.
- Two custom advisory-lock keys are bare magic numbers
  (`MANAGER_INVARIANT_LOCK = 4_891_317`, `HIERARCHY_LOCK = 7_120_041`) with no
  derivation comment. Harmless, but a one-line comment ("arbitrary constant,
  only needs to be unique") would prevent a well-meaning "cleanup".
- `SessionFactory.begin()` per request = one transaction boundary; explicit
  `db.commit()` inside `require_authenticated_user` and the login failure path
  is the only mid-request commit. Subtle but correct; comment it (F).
- `TRUNCATE`-based test cleanup and schema-drop in `conftest.py` are
  deliberate (audit tables reject UPDATE/DELETE). Good, but the
  `except Exception: print("Bypassing...")` wrappers can mask a broken local DB
  (J-3).

## J. Test-suite findings

- Coverage is strong and risk-appropriate: DB-backed integration tests per
  domain, dedicated sync tests per §5 outcome, RTL/fake-IndexedDB frontend
  tests, Playwright E2E with a disposable `koranco_e2e` DB whose seed refuses
  other databases, plus a backup/restore drill.
- **Helper duplication** — the same `add_user`, `client_for`,
  `submit_attendance`, `submit_harvest` fixtures are re-declared in
  `test_attendance.py`, `test_harvest.py`, `test_harvest_sync*.py`,
  `test_master_data.py`, `test_administration.py`, `test_reports.py` (at least
  9 definitions). MEDIUM: move to `conftest.py` fixtures — pure consolidation,
  no coverage change.
- **`test_harvest_sync.py` + `test_harvest_sync_more.py`** — the "_more"
  suffix signals bolted-on growth; cosmetic merge, not a defect.
- **`conftest.py` swallows migration/setup errors with a print** — if the local
  PostgreSQL is unreachable, tests fail loudly later, but the message is
  misleading. LOW: convert to a clear error.
- Frontend tests mock module boundaries cleanly (`vi.mock` per module) and are
  behavior-focused; the reports suites deliberately assert unit-separation
  invariants. No brittle snapshot tests. Good.
- **Tests are not coupled to implementation internals** beyond the standard
  RTL queries; the `series.test.ts` data-mapping tests are implementation-level
  but they guard the unit-separation invariant and are worth keeping.

## K. Documentation gaps

1. **Original product proposal missing** — intent must be reconstructed from
   docs; the docs are good enough today, but the gap should be acknowledged in
   `handover-principles.md`.
2. **No "add a permission" recipe** — 4 touch points (enum, role map, model
   check constraint, migration like 0009). MEDIUM.
3. **No "add a field to a domain" recipe** — the consistent 8-file chain is
   unstated. MEDIUM.
4. **Sync-engine duplication intent lives only in ADRs** — add code comments.
   LOW.
5. **Draft-replace semantics undocumented** — E-11. MEDIUM.
6. **Login timing-equalization and the mid-request commit are uncommented**
   — LOW.
7. **CI gaps are documented** (`alembic check` + restore drill not in CI due
   to GitHub App permissions) — but a new engineer must read
   `database-migrations.md` to know. Keep the doc; consider a `make check`
   note. MEDIUM.
8. **`docs/operations/offline-attendance-field-test.md` (22 lines) is far
   thinner than its Harvest sibling (126 lines)** — LOW.
9. **`docs/architecture/domain-boundaries.md`** still says boundaries "remain
   subject to Koranco validation" while most are implemented — mildly stale
   framing. LOW.
10. Environment variables are well covered: `.env.example` files, settings
    validation, `staging-deployment.md` matrix. GREEN.
11. Audit/security-event semantics, backup/restore, incident recovery,
    manager recovery: all documented. GREEN.

## L. Dead / stale code

1. **`apps/web/src/components/api-status.tsx` + `getApiHealth`
   (`lib/api/client.ts`) + `api-status.test.tsx`** — no page imports
   `ApiStatus`; the component and its test are the only consumers of
   `getApiHealth`. Keep-if-demo, otherwise delete (LOW).
2. **`APP_VERSION = "0.2.0"` in `attendance/offline/db.ts`** — exported,
   never imported; diverges from `package.json` version. Remove or wire into
   the service-worker gate (LOW).
3. **`render.yaml` placeholder values** ("Replace with actual staging Vercel
   frontend URL") — intentional staging template, not dead; flag so nobody
   deploys it verbatim (LOW).
4. **Duplicated type `ManagementNavItem`** in `management-shell.tsx` and
   `management-navigation.ts` (E-1 style, LOW).
5. No stale TODOs/FIXMEs were found (only intentional placeholder text).
6. No obsolete feature flags found.
7. `docs/product/unresolved-requirements.md` correctly lists open items; no
   doc describes code that no longer exists, with one exception: the removed
   report CSS classes (`report-summary`, `report-stats`, `report-note`,
   `export-actions`) are gone from code — verify no external references before
   treating this as done (none were found).

## M. Risk-ranked recommendations

| # | Severity | Finding | Action |
| --- | --- | --- | --- |
| M-1 | HIGH | `alembic check` drift gate + backup/restore drill absent from CI | Add both CI jobs (blocked on GitHub App `workflows` permission — request it). Until then, keep the manual pre-release checklist in `database-migrations.md`. |
| M-2 | HIGH | No documented recipes for "add a permission" and "add a field to a domain" | Write a short `docs/development/common-change-recipes.md` with the 4-point and 8-point chains (0009 migration as the template). |
| M-3 | HIGH | 700+ line workspace components | Do **not** refactor now. Document the state inventory + handler map at the top of each workspace file (or in `docs/product/*`), and gate any future split on the existing E2E suites. |
| M-4 | MEDIUM | Draft-save replace semantics undocumented | One paragraph in `docs/product/attendance.md` + a comment in `update_draft`. |
| M-5 | MEDIUM | Sync-engine duplication un-signposted | Top-of-file comments in all four sync modules pointing at the sibling and ADR-008/009. No generalization. |
| M-6 | MEDIUM | Dual-domain `offline/db.ts` + cross-domain import | Comment explaining the historical DB name; optional neutral relocation later. |
| M-7 | MEDIUM | Test helper duplication across backend test files | Consolidate into `conftest.py` fixtures (no coverage change). |
| M-8 | MEDIUM | `CorrectEntryRequest` dummy-object validator reuse | Extract shared `validate_times`. |
| M-9 | MEDIUM | Processed-operation tables have no retention policy | Keep as an explicit Koranco open item; add a monitoring note so growth is visible before it matters. |
| M-10 | LOW | Duplicate `DatabaseSession` alias; duplicate `LifecycleRequest`/`change_status`; duplicate `ManagementNavItem`; four audit endpoints | Consolidate opportunistically (E-1, E-3, E-4). |
| M-11 | LOW | Dead code: `ApiStatus`/`getApiHealth`, `APP_VERSION` | Delete or wire in. |
| M-12 | LOW | Misc comments: login timing equalization, mid-request commit, advisory-lock keys, `buildExportUrl` POST semantics, `require_farm_unit` boolean, route/service duplicate submit guard | Add comments or small renames as listed in E/F. |

## N. Proposed simplification sequence

Nothing in this sequence is required for handover safety; each step is
independent and low-risk:

1. **Comments first** (M-5, M-6, M-4, F-login): zero behavior change, biggest
   comprehension win per hour.
2. **Recipes doc** (M-2) and restore/`alembic check` CI gates (M-1) — the two
   highest-leverage handover artifacts.
3. **Consolidate test fixtures** (M-7).
4. **Small safe deduplications**: canonical `DatabaseSession` (E-1),
   `validate_times` extraction (M-8), `LifecycleRequest` → services (E-3),
   audit-history helper (E-4), rename `buildExportUrl` (E-9).
5. **Dead-code removal** (M-11).
6. **Workspace split** — only later, documented first (M-3), with E2E
   coverage as the safety net.

## O. Areas explicitly recommended to leave alone

- The two sync engines and their tables (do not generalize into a sync
  framework — ADR-008/009).
- The shared Dexie database name `koranco-attendance-offline` (rename is a
  destructive migration).
- The permission/role model and every DB constraint protecting confirmed
  invariants.
- The login/CSRF/session scheme and timing equalization.
- The fingerprint duplicate guard and the unresolved one-session-per-day
  boundary.
- The audit/security-event separation.
- The reporting unit-separation invariants (ADR-010/012).
- The single-transaction-per-request session pattern.
- The service-layer `HTTPException` pattern (monolith-appropriate; document,
  don't refactor).

## P. Handover readiness rating

**GREEN-AMBER (ready for handover with documented weaknesses).**

A competent new engineer can clone, run, test, understand, deploy-to-staging,
restore, and modify this system from the repository alone — the documentation
set is a genuine strength and the CI pipeline works. The items that prevent a
clean GREEN are: the two missing CI gates (drift check, restore drill), the
absence of "add a permission/field" recipes, the un-signposted Attendance/
Harvest sync duplication, and the large workspace components. All four are
fixable with documentation and CI work rather than risky refactoring, and none
requires contacting the original team today.
