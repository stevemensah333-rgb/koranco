# Koranco Farms Digital Farm Management System

Koranco is a production-oriented system for digitizing priority operations at Koranco Farms, a commercial pineapple producer and exporter in Ghana. It is intended for real operational users and data, not as a demonstration dashboard or generic SaaS product.

## Project status

The repository contains the runnable technical foundation, visual system, application-managed authentication, confirmed role/account administration, Worker register, Farm Structure register, production-oriented online/offline attendance capture, online and offline Harvest, append-only operational audit foundation, an operational reporting and management overview phase (Overview, Attendance report, Harvest report, and Manager-only CSV export), and a Backup, Recovery, and Production Operations phase (provisional backup policy, portable `pg_dump`/`pg_restore` tooling, a restore drill, migration/incident/production-readiness runbooks, and CI backup-restore verification). Deferred workflows (inventory, payroll, full traceability, AI/ML) remain unstarted.

## Architecture

The system is a modular monolith comprising:

- one responsive Next.js/React/TypeScript frontend under `apps/web`;
- one Python/FastAPI backend under `apps/api`; and
- one PostgreSQL database as the authoritative data store.

See [the architecture overview](docs/architecture/overview.md) and [accepted decisions](docs/decisions/).

## Requirements

- Git
- Node.js 24 LTS and pnpm 11.20.0 (Corepack can supply the pinned pnpm version)
- Python 3.13 and uv 0.11.29 or a compatible later uv release
- Docker with Compose for local PostgreSQL 17

The `.node-version`, `.python-version`, package metadata, and lockfiles define project versions. Do not use npm, Yarn, Poetry, or Pipenv for project dependency management.

## Local setup

Clone the repository, then prepare local configuration:

```sh
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

The example database credentials are development-only. Never reuse them outside local development.

Install dependencies exactly from the lockfiles:

```sh
cd apps/api
uv sync --locked --all-groups

cd ../web
corepack enable
pnpm install --frozen-lockfile
```

From the repository root, start PostgreSQL and run the migration baseline:

```sh
docker compose up -d db
cd apps/api
uv run alembic upgrade head
```

Run the API and web application in separate terminals:

```sh
cd apps/api
uv run uvicorn koranco.main:app --reload --no-access-log
```

```sh
cd apps/web
pnpm dev
```

The web application is available at `http://localhost:3000`. The API health and readiness endpoints are at `http://localhost:8000/api/v1/health` and `/api/v1/readiness`. Interactive API documentation is available at `/docs` in development and test, and disabled in production.

Before the first login, create the one-time bootstrap Manager after migrations:

```sh
cd apps/api
uv run python -m koranco.identity.bootstrap \
  --login <login-identifier> \
  --display-name "<display name>" \
  --confirm-bootstrap
```

The password is prompted securely and is never supplied on the command line. The command refuses to run once any application user exists. See [authentication and authorization](docs/architecture/authentication.md).

## Quality checks

Run all checks from the repository root:

```sh
make check
```

Individual `make lint`, `make typecheck`, `make test`, and `make build` targets are also available. `make format` changes files; the other quality targets are non-destructive. See [local development](docs/development/local-development.md) for direct commands and troubleshooting.

Attendance browser E2E uses an isolated `koranco_e2e` database and Chromium:

```sh
cd apps/web
pnpm exec playwright install chromium-headless-shell
pnpm e2e
```

The guarded setup creates/resets only `koranco_e2e`; never point the E2E seeder at development or production data.

## Documentation

- [Product scope](docs/product/product-scope.md)
- [Online attendance](docs/product/attendance.md)
- [Reporting and operational overview](docs/product/reporting.md)
- [Unresolved requirements](docs/product/unresolved-requirements.md)
- [Architecture overview](docs/architecture/overview.md)
- [Domain boundaries](docs/architecture/domain-boundaries.md)
- [Offline synchronization principles](docs/architecture/offline-sync.md)
- [Physical-device offline attendance test](docs/operations/offline-attendance-field-test.md)
- [Physical-device offline Harvest test](docs/operations/offline-harvest-field-test.md)
- [Security principles](docs/architecture/security.md)
- [Authentication and authorization](docs/architecture/authentication.md)
- [Data integrity principles](docs/architecture/data-integrity.md)
- [Design principles](docs/design/principles.md)
- [Design system](docs/design/system.md)
- [Testing strategy](docs/development/testing-strategy.md)
- [Handover principles](docs/operations/handover-principles.md)
- [Backup and recovery](docs/operations/backup-and-recovery.md)
- [Database migration operations](docs/operations/database-migrations.md)
- [Incident response](docs/operations/incident-response.md)
- [Production readiness](docs/operations/production-readiness.md)

Repository-wide engineering instructions are in [AGENTS.md](AGENTS.md). Unknown Koranco workflows, fields, permissions, metrics, and policies must not be guessed; they remain documented as unresolved until validated with an accountable Koranco stakeholder.
