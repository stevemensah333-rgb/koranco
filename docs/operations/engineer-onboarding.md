# Engineer Onboarding

A practical path for a new engineer (or IT contractor) taking over Koranco.
Work through the checklist against a real checkout; the goal is a working
local system plus enough orientation to make a small safe change. Nothing here
is ceremonial — each item ends with a checkable result.

Prerequisites: Node.js 24 LTS + pnpm (Corepack), Python 3.13 + uv, Docker with
Compose, and ~30 minutes of uninterrupted network for dependency installs.

## Day 1 — clone, run, test, understand

1. **Clone and inspect**
   ```sh
   git clone <repository-url> koranco && cd koranco
   cat README.md
   cat docs/operations/technical-handover.md
   ```
   Result: you know what the system does, its roles, and what is out of scope.

2. **Local configuration**
   ```sh
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env.local
   ```
   Result: both example files exist and are readable.

3. **Install dependencies**
   ```sh
   cd apps/api && uv sync --locked --all-groups
   cd ../web && corepack enable && pnpm install --frozen-lockfile
   ```
   Result: `uv sync` and `pnpm install` complete without errors.

4. **Start the database and migrate**
   ```sh
   docker compose up -d db
   cd apps/api && uv run alembic upgrade head
   uv run alembic current          # should report 0009_reporting_permissions
   ```
   Result: migrations apply and `alembic current` shows head.

5. **Run the stack**
   ```sh
   cd apps/api && uv run uvicorn koranco.main:app --reload --no-access-log
   # second terminal:
   cd apps/web && pnpm dev
   ```
   Result: `http://localhost:3000/login` loads; `http://localhost:8000/api/v1/readiness`
   returns `ready`.

6. **Create the first Manager and sign in**
   ```sh
   cd apps/api
   uv run python -m koranco.identity.bootstrap \
     --login <login> --display-name "<Name>" --confirm-bootstrap
   ```
   Result: you can sign in at `/login` and reach the Overview/System status.

7. **Run the test suites**
   ```sh
   cd apps/api && uv run pytest
   cd ../web && pnpm test
   cd ../web && pnpm exec playwright install chromium-headless-shell && pnpm e2e
   ```
   Result: backend tests pass (PostgreSQL-backed), Vitest passes, and the
   Playwright suite passes against the isolated `koranco_e2e` database.

8. **Understand the architecture**
   - Read `docs/architecture/overview.md` and `docs/decisions/ADR-001.md`.
   - Trace the repository map in `docs/operations/technical-handover.md` §3.
   - Result: you can point at the file that implements any of: auth, Workers,
     FarmUnits, Attendance, Harvest, Reports, offline sync.

## Day 2 — trace, change, migrate, deploy

1. **Trace one request end to end**
   Pick a small flow (e.g. list Workers, submit a Harvest draft) and follow:
   frontend `modules/<domain>/api.ts` → FastAPI route `routes.py` →
   permission dependency → `service.py` → SQLAlchemy model → PostgreSQL.
   Result: you can explain where authorization, validation, and audit happen.

2. **Make a small safe change**
   Use `docs/development/common-change-recipes.md` — e.g. add a field to the
   Worker register (model → migration → schema → service → frontend type → UI →
   test) or extend a report filter. Run the relevant tests.
   Result: a working change with tests, formatted and type-checked:
   `uv run ruff check . && uv run mypy src tests && pnpm lint && pnpm typecheck`.

3. **Write a migration**
   ```sh
   cd apps/api
   uv run alembic revision --autogenerate -m "your change"
   # review the generated file, then:
   uv run alembic upgrade head
   uv run alembic check             # no drift
   ```
   Result: `alembic check` reports no new operations; you understand the
   "never rewrite applied migrations" rule in `docs/operations/database-migrations.md`.

4. **Run the full check suite**
   ```sh
   make check
   ```
   Result: format, lint, typecheck, tests, and the production build all pass.

5. **Deploy to staging (or review the runbook)**
   Read `docs/operations/staging-deployment.md` and `docs/operations/technical-handover.md` §9.
   If you have staging access: merge a PR, confirm Render's `alembic upgrade head`
   pre-deploy step, wait for the API `/api/v1/readiness`, then promote the
   Vercel frontend and run the staging smoke tests in the runbook.
   Result: you can name the three pieces (Vercel, Render API, Render PostgreSQL),
   their environment variables, and the first-Manager bootstrap step.

6. **Practice recovery**
   Run the restore drill:
   ```sh
   make drill
   ```
   Result: the backup/restore round trip verifies successfully. Read
   `docs/operations/backup-and-recovery.md` and `docs/operations/manager-recovery.md`
   so you know what to do if the database or all Managers are lost.

## Done when

- [ ] You can run the full stack locally and all suites pass.
- [ ] You can trace any request from UI to database.
- [ ] You have made and tested one small change.
- [ ] You can create and apply a migration with a clean `alembic check`.
- [ ] You understand the offline sync model (see
      `docs/operations/offline-synchronization-guide.md`).
- [ ] You know who to escalate to and what the
      [support arrangement](support-arrangement-template.md) covers.
