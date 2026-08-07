# Local development

## Toolchain

Use Node.js 24 LTS with pnpm, Python 3.13 with uv, and PostgreSQL 17. Runtime markers and committed lockfiles make installations reproducible. The host's default runtime does not override the project version.

Create `apps/api/.env` and `apps/web/.env.local` from their adjacent `.env.example` files. These local files are ignored by Git. Backend settings are validated at startup and require an environment and PostgreSQL URL; SQLite is deliberately rejected. `NEXT_PUBLIC_API_ORIGIN` contains only the browser-visible API origin and must never contain credentials.

## Direct commands

```sh
# PostgreSQL
docker compose up -d db
docker compose ps

# API dependency installation and migration
cd apps/api
uv sync --locked --all-groups
uv run alembic upgrade head

# API development server
uv run uvicorn koranco.main:app --reload --no-access-log

# Web dependency installation and development server
cd ../web
pnpm install --frozen-lockfile
pnpm dev
```

Run checks in each application:

```sh
cd apps/api
uv run ruff format --check .
uv run ruff check .
uv run mypy src tests
uv run pytest

cd ../web
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Ruff is the sole Python formatter and linter. Mypy is the Python static type checker; strict mode is enabled to surface unsafe foundation changes early. Prettier formats frontend files, ESLint checks Next.js/React behavior, and TypeScript strict mode performs frontend type checking.

## Configuration behavior

Supported application environments are `development`, `test`, and `production`. API documentation is exposed in development/test and disabled in production. CORS accepts only configured origins and rejects wildcard configuration. Local defaults live only in the example files and Docker Compose configuration.

The readiness endpoint performs a real `SELECT 1` against PostgreSQL. If health succeeds but readiness fails, check the database container, local URL, credentials, and migration command. The health response intentionally contains no dependency or configuration details.

## Generated files

Do not commit `.env`, `.env.local`, virtual environments, `node_modules`, build output, caches, coverage output, or TypeScript incremental-build metadata. Commit both `uv.lock` and `pnpm-lock.yaml` whenever an intentional dependency change updates them.
