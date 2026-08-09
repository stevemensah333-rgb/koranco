# Technical Handover

The single entry point for an engineer or IT contractor taking over the
Koranco Farms Digital Farm Management System. It is written so the system can
be operated and maintained with only this repository — no ChatGPT, Codex, or
original-team context required.

Every section here summarizes or links a deeper document. Start here, then
follow the links. The companion documents for this handover are:

- [Engineer onboarding](engineer-onboarding.md) — Day-1/Day-2 checklist
- [Offline synchronization guide](offline-synchronization-guide.md) — maintainer guide
- [Troubleshooting](troubleshooting.md) — symptom → action
- [Handover checklist](handover-checklist.md) — organizational handover
- [Support arrangement template](support-arrangement-template.md) — editable support contract

---

## 1. System overview

Koranco Farms is a commercial pineapple producer and exporter in Ghana whose
operational records (worker attendance and harvest quantities) are still kept
partly on paper. Koranco is a production-oriented system that digitizes the
highest-priority operational workflows with trustworthy, attributable,
correctable records — it is not a generic dashboard or demo.

What the system does:

- **Registers**: application users (Manager/Supervisor/Worker roles), farm
  workers, and a generic FarmUnit hierarchy (fields and blocks).
- **Attendance**: Supervisor-led online rosters per operational date, with
  draft → submitted lifecycle, corrections, and audit history; offline capture
  and synchronization on field devices.
- **Harvest**: per-FarmUnit quantity records (fruit count or kilograms, kept
  strictly separate), draft → submitted lifecycle, corrections, audit history;
  offline capture and first submission.
- **Reporting**: a management overview plus Overview | Attendance | Harvest
  reports, Manager-only CSV export, all derived from submitted records.
- **Administration**: account management, security-event review, session
  revocation.

Roles (see [authentication](../architecture/authentication.md) and
[ADR-005](../decisions/ADR-005-fixed-roles-and-permissions.md)):

| Role | Can do |
| --- | --- |
| Manager | Everything: administration, users, security events, registers, attendance, harvest, reports, exports |
| Supervisor | Operational work: workers/farm units read-only, attendance record/correct, harvest record/correct, reports read (no export) |
| Worker | `system.status.read` only — application accounts exist only if Koranco later needs worker self-service |

Intentionally **not** implemented (see
[product scope](../product/product-scope.md) and
[unresolved requirements](../product/unresolved-requirements.md)): inventory,
payroll, crop lifecycle, full batch/export traceability, AI/ML, forecasting,
weather, irrigation, equipment telemetry, and unit conversion between harvest
units. Do not add these without Koranco confirmation.

## 2. Architecture

One Next.js frontend (PWA), one FastAPI backend, one PostgreSQL database —
a modular monolith (see [architecture overview](../architecture/overview.md)
and [ADR-001](../decisions/ADR-001-modular-monolith.md)).

```
Browser / PWA (Next.js, IndexedDB, service worker)
        │ HTTPS (credentials + cookies)
        ▼
Next.js on Vercel (apps/web) — management + field UI
        │ HTTPS JSON API (/api/v1)
        ▼
FastAPI on Render (apps/api) — validation, authorization, business rules
        │
        ▼
PostgreSQL 17 (Render managed) — authoritative data store
```

Key boundaries:

- **Authoritative data**: PostgreSQL. The API is the only writer. IndexedDB is
  local operational storage for approved offline workflows and is never a
  system of record; unsynchronized work is not official data.
- **Frontend**: Next.js App Router, React 19, TypeScript strict, Tailwind 4.
  Field and management experiences share one codebase. A narrowly scoped
  service worker caches only same-origin static assets and the field routes
  needed to reopen capture — never API responses or administrative pages.
- **Backend**: FastAPI modular monolith under `apps/api/src/koranco`,
  organized by business domain. SQLAlchemy 2 + Alembic. Pydantic schemas are
  separate from ORM models. One database transaction per request.
- **Offline**: two approved workflows (Attendance, Harvest) use a shared
  IndexedDB database with per-owner rows, a 12-hour non-secret lease, durable
  outboxes, and server-side transport idempotency. See the
  [offline guide](offline-synchronization-guide.md).

## 3. Repository map

```
koranco/
├── apps/
│   ├── web/                 Next.js frontend (PWA)
│   │   ├── src/app/         routes: /login / /attendance /harvest /workers
│   │   │                    /farm-structure /reports /admin/* /dev/design-system
│   │   ├── src/components/  shells (management/field), auth, admin, ui primitives
│   │   ├── src/modules/     per-domain UI + API clients (attendance, harvest,
│   │   │                    workers, farm-structure, reports)
│   │   ├── src/lib/         api client, auth session store, public config
│   │   ├── src/styles/      design tokens (globals.css)
│   │   └── e2e/             Playwright tests
│   └── api/                 FastAPI backend
│       ├── src/koranco/     domain modules (see below)
│       ├── alembic/         migrations (0001–0009)
│       └── tests/           pytest integration suite + helpers
├── docs/                    architecture, decisions (ADRs), design, product,
│                            development, operations
├── scripts/                 backup/restore tooling + drill
├── .github/workflows/ci.yml CI (frontend, backend, E2E)
├── Makefile                 setup / dev / check / e2e / backup / restore / drill
├── compose.yaml             local PostgreSQL 17
└── render.yaml              staging blueprint (Vercel frontend, Render API + DB)
```

Where to look for each capability:

| Capability | Backend | Frontend |
| --- | --- | --- |
| Authentication / sessions / permissions | `apps/api/src/koranco/identity/` | `apps/web/src/lib/api/auth.ts`, `components/auth/` |
| Workers | `apps/api/src/koranco/workers/` | `apps/web/src/modules/workers/` |
| FarmUnits | `apps/api/src/koranco/farm_structure/` | `apps/web/src/modules/farm-structure/` |
| Attendance | `apps/api/src/koranco/attendance/` | `apps/web/src/modules/attendance/` |
| Harvest | `apps/api/src/koranco/harvest/` | `apps/web/src/modules/harvest/` |
| Reports + exports | `apps/api/src/koranco/reports/` | `apps/web/src/modules/reports/` |
| Operational audit | `apps/api/src/koranco/operational_audit/` | via domain `.../audit` endpoints |
| Offline sync | `attendance/sync.py`, `harvest/sync.py` + `*_sync_operations` tables | `modules/attendance/offline/`, `modules/harvest/offline/` |
| HTTP plumbing | `common/` (request id, logging, errors), `db/`, `config/` | `apps/web/src/lib/api/client.ts` |

Each backend domain follows one pattern: `routes.py` (HTTP + authorization) →
`service.py` (business rules + audit) → SQLAlchemy models; `schemas.py` holds
Pydantic request/response models.

## 4. Local development

One happy path from clone to running system (details in
[local development](../development/local-development.md)):

1. **Requirements**: Node.js 24 LTS, pnpm (via Corepack), Python 3.13, uv,
   Docker with Compose (for local PostgreSQL 17).
2. Clone and prepare configuration:
   ```sh
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env.local
   ```
   The example values are development-only. `NEXT_PUBLIC_API_ORIGIN` is the
   browser-visible API origin and must never contain credentials.
3. Install dependencies exactly from lockfiles:
   ```sh
   cd apps/api && uv sync --locked --all-groups
   cd ../web && corepack enable && pnpm install --frozen-lockfile
   ```
4. Start PostgreSQL and run migrations:
   ```sh
   docker compose up -d db
   cd apps/api && uv run alembic upgrade head
   ```
5. Run the API and web app in two terminals:
   ```sh
   cd apps/api && uv run uvicorn koranco.main:app --reload --no-access-log
   cd apps/web && pnpm dev
   ```
   Web: `http://localhost:3000`; API docs: `http://localhost:8000/docs`
   (development/test only); health: `/api/v1/health`, readiness:
   `/api/v1/readiness`.
6. Create the first Manager (one-time, interactive password prompts):
   ```sh
   cd apps/api
   uv run python -m koranco.identity.bootstrap \
     --login <login-identifier> \
     --display-name "<Display Name>" \
     --confirm-bootstrap
   ```
7. Tests:
   ```sh
   cd apps/api && uv run pytest          # integration tests against PostgreSQL
   cd ../web && pnpm test                # Vitest
   cd ../web && pnpm exec playwright install chromium-headless-shell && pnpm e2e
   ```
   `make check` runs format/lint/typecheck/tests/build from the root.

## 5. Environment variables

Backend settings are validated at startup (`apps/api/src/koranco/config/settings.py`);
the frontend needs exactly one public variable.

| Variable | Component | Purpose | Secret? | Example |
| --- | --- | --- | --- | --- |
| `KORANCO_ENVIRONMENT` | API | `development` \| `test` \| `production`; controls docs exposure and Secure cookies | no | `production` |
| `KORANCO_DATABASE_URL` | API | PostgreSQL URL (psycopg driver); SQLite rejected | **yes** | `postgresql+psycopg://user:pass@host:5432/db` |
| `KORANCO_CORS_ORIGINS` | API | Credentialed CORS origins; wildcard rejected | no | `["https://app.example.com"]` |
| `KORANCO_CSRF_TRUSTED_ORIGINS` | API | Exact `Origin` values accepted for state changes; must be non-empty | no | `["https://app.example.com"]` |
| `KORANCO_LOG_LEVEL` | API | JSON log level | no | `INFO` |
| `KORANCO_SESSION_TTL_HOURS` | API | Session lifetime (1–168, default 12) | no | `12` |
| `KORANCO_LOGIN_FAILURE_LIMIT` | API | Failed attempts before rate limit (2–20, default 5) | no | `5` |
| `KORANCO_LOGIN_FAILURE_WINDOW_MINUTES` | API | Rate-limit window (1–60, default 15) | no | `15` |
| `KORANCO_COOKIE_SAMESITE` | API | Cookie SameSite policy; `none` requires production | no | `lax` / `none` |
| `NEXT_PUBLIC_API_ORIGIN` | Web | Browser-visible API origin | no | `https://api.example.com` |
| `PGHOST` `PGPORT` `PGUSER` `PGDATABASE` `PGPASSWORD` | backup/restore scripts | libpq connection (password via env or `.pgpass`, never argv) | **yes** (password) | — |
| `KORANCO_BACKUP_DIR` | backup | Backup destination directory | no | `/var/backups/koranco` |
| `KORANCO_BACKUP_RETENTION_DAYS` | backup | Rolling retention (default 30) | no | `30` |
| `KORANCO_BACKUP_GPG_RECIPIENT` | backup | If set, encrypt backups to this gpg recipient | no | `ops@example.com` |
| `KORANCO_RESTORE_TARGET_DATABASE` | restore | Target database name (required) | no | `koranco_prod` |
| `KORANCO_RESTORE_CONFIRM` | restore | Must be `yes` | no | `yes` |
| `KORANCO_RESTORE_REPLACE` | restore | `1` to drop/recreate a non-empty target | no | `1` |
| `KORANCO_RESTORE_RUN_VERIFY` | restore | `1` to run post-restore sanity checks | no | `1` |

See the staging matrix in [staging deployment](staging-deployment.md#7-environment-variable-matrix)
and the [backup and recovery](backup-and-recovery.md) runbook for the exact
staging values. Never commit `.env`/`.env.local`.

## 6. Database

- **Authoritative store**: PostgreSQL 17. All schema changes go through Alembic
  (`apps/api/alembic/versions/`). Models are in each domain's `models.py`;
  `alembic/env.py` imports every model.
- **Migration workflow**:
  ```sh
  cd apps/api
  uv run alembic current            # where the DB is
  uv run alembic revision --autogenerate -m "<change>"   # generate (review it!)
  uv run alembic upgrade head       # apply
  uv run alembic check              # compare models vs DB (drift gate)
  ```
- **Current head**: `0009_reporting_permissions` (the latest file in
  `alembic/versions/`; `alembic current` confirms it).
- **Rules** (see [database migrations](../operations/database-migrations.md)
  and [data integrity](../architecture/data-integrity.md)):
  - Never rewrite an already-applied migration; fix forward with a new one.
  - Review generated migrations; prefer backward-compatible expand/migrate/contract.
  - Back up and verify before risky migrations; rehearse on staging/test first.
  - Run `alembic check` after migrations; CI runs `alembic upgrade head` on a
    fresh PostgreSQL for every push.
- **Major tables** (by domain): `application_users`,
  `application_user_permissions`, `application_sessions`, `security_events`,
  `authentication_login_attempts` (identity); `workers`; `farm_units`;
  `attendance_sessions`, `attendance_entries`, `attendance_sync_operations`;
  `harvest_records`, `harvest_sync_operations`; `operational_audit_events`.
- Confirmed invariants are enforced with PostgreSQL check/unique constraints
  (statuses, units, positive quantities, submission-state pairs, the submitted
  Attendance roster fingerprint, FK `RESTRICT`). Do not weaken them.

## 7. Authentication and authorization

Full reference: [authentication](../architecture/authentication.md) and
[security](../architecture/security.md).

- **Sessions**: random session + CSRF tokens; only SHA-256 digests stored.
  Two cookies: `koranco_session` (HTTP-only) and `koranco_csrf`. 12-hour
  lifetime, revocable centrally, disabled accounts rejected/revoked on use.
- **CSRF/CORS**: state-changing requests need an exact trusted `Origin`
  (`KORANCO_CSRF_TRUSTED_ORIGINS`) and the CSRF token in `X-CSRF-Token`
  (constant-time compared against the session digest). SameSite adds defense,
  not sole protection.
- **Permissions**: fixed roles → centralized mapping in
  `identity/permissions.py`; backend dependencies (`require_permission`) are
  authoritative. Frontend permission checks are usability only.
- **Bootstrap**: `uv run python -m koranco.identity.bootstrap` creates the
  first Manager; refuses if any user exists; not a backdoor.
- **Password reset**: Manager-assisted reset via the admin UI revokes sessions
  and forces a password change. **Emergency recovery** (no Manager can log in):
  `docs/operations/manager-recovery.md` — a direct-operator command that
  reactivates the Manager, replaces the hash, revokes all sessions, and records
  `operator_manager_recovery`. It is not an HTTP endpoint.
- **Sensitive Manager actions** (create/disable/demote a Manager) require
  authentication within the last 15 minutes or re-entry of the current
  password; the final active Manager can never be disabled/demoted.

## 8. Offline synchronization

See the dedicated maintainer guide: [offline-synchronization-guide.md](offline-synchronization-guide.md).

## 9. Deployment (staging)

The approved staging architecture (full runbook:
[staging-deployment.md](staging-deployment.md), blueprint:
[`render.yaml`](../../render.yaml)):

- **Frontend**: Next.js on **Vercel** (`apps/web`), `NEXT_PUBLIC_API_ORIGIN`
  pointing at the Render API.
- **API**: FastAPI as a long-running **Render Web Service** (`apps/api`);
  `preDeployCommand: uv run alembic upgrade head`; `startCommand: uv run uvicorn
  koranco.main:app --host 0.0.0.0 --port $PORT`.
- **Database**: **Render PostgreSQL 17**; connection string via
  `KORANCO_DATABASE_URL` from the Render dashboard.
- **CORS/CSRF/cookies**: `KORANCO_CORS_ORIGINS` and
  `KORANCO_CSRF_TRUSTED_ORIGINS` must list the Vercel origin; because Vercel
  and Render are different hosts, `KORANCO_COOKIE_SAMESITE=none` is used over
  HTTPS (Secure cookies required) so the cross-site cookie pair works. The
  CSRF token is returned in the login/session response because a Vercel host
  cannot read a host-only cookie belonging to the Render host.

Deployment sequence: merge PR → CI green → Render applies migrations
(preDeployCommand) then starts the service → Vercel deploys the frontend →
verify `/api/v1/health` and `/api/v1/readiness` → run the staging validation
smoke tests in the runbook → create the first Manager via bootstrap in the
API runtime if not already done.

> The `render.yaml` blueprint contains placeholder URLs ("Replace with actual
> staging Vercel frontend URL"). Fill them in before first deploy.

## 10. Backup and restore

Full runbook: [backup-and-recovery.md](backup-and-recovery.md) and
[ADR-011](../decisions/ADR-011-production-operations-and-backup-strategy.md).
Tooling: `scripts/backup-postgres.sh`, `scripts/restore-postgres.sh`,
`scripts/backup-restore-drill.sh`.

- **Backup** (custom-format pg_dump, compressed, checksummed, 30-day rolling
  retention, optional gpg encryption):
  ```sh
  PGHOST=... PGPORT=5432 PGUSER=... PGDATABASE=koranco_prod \
  PGPASSWORD='...' KORANCO_BACKUP_DIR=/var/backups/koranco \
  ./scripts/backup-postgres.sh
  ```
- **Restore** (into a separate target; refuses the source DB; requires
  explicit confirmation):
  ```sh
  KORANCO_RESTORE_TARGET_DATABASE=koranco_restore \
  KORANCO_RESTORE_CONFIRM=yes \
  PGDATABASE=koranco_prod ./scripts/restore-postgres.sh <backup-file>
  ```
  Use `KORANCO_RESTORE_REPLACE=1` only to replace a non-empty target, and
  `KORANCO_RESTORE_RUN_VERIFY=1` for post-restore sanity checks.
- **Drill**: `make drill` (or `scripts/backup-restore-drill.sh`) creates two
  synthetic databases, seeds them, backs up, restores, and verifies
  invariants. Run it before any release; it refuses databases whose names look
  like production.
- **Safety warnings**: never point the drill at production; never restore over
  the source database; verify a backup exists and is readable before risky
  migrations; production provider-native backups are preferred once a managed
  provider is selected.

## 11. Release / update procedure

1. **Branch**: work on a feature branch from `main`.
2. **PR**: open a pull request; CI runs format, lint, typecheck, tests,
   migrations against a fresh PostgreSQL, production build, and Playwright E2E.
3. **Migration review**: any schema change is reviewed (see §6) — check locks,
   backfills, downgrade risk; run `alembic check` locally.
4. **Deploy**: merge; Render applies `alembic upgrade head` as its
   preDeployCommand, then starts the API; Vercel builds and promotes the
   frontend.
5. **Health/readiness**: confirm `/api/v1/health` = `ok` and
   `/api/v1/readiness` = `ready`, and that `alembic current` matches head.
6. **Smoke test**: sign in, run the staging validation runbook (registers,
   attendance, harvest, reports, offline sync), and confirm the version deployed
   is compatible with the schema.

For incidents, use [incident-response.md](incident-response.md). For common
operator issues, use [troubleshooting.md](troubleshooting.md).
