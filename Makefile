.PHONY: setup infra-up infra-down migrate dev-api dev-web format lint typecheck test e2e build check

PNPM ?= corepack pnpm
UV ?= uv

setup:
	cd apps/api && $(UV) sync --locked --all-groups
	cd apps/web && $(PNPM) install --frozen-lockfile

infra-up:
	docker compose up -d db

infra-down:
	docker compose down

migrate:
	cd apps/api && $(UV) run alembic upgrade head

dev-api:
	cd apps/api && $(UV) run uvicorn koranco.main:app --reload --no-access-log

dev-web:
	cd apps/web && $(PNPM) dev

format:
	cd apps/api && $(UV) run ruff format .
	cd apps/web && $(PNPM) format

lint:
	cd apps/api && $(UV) run ruff check .
	cd apps/web && $(PNPM) lint

typecheck:
	cd apps/api && $(UV) run mypy src tests
	cd apps/web && $(PNPM) typecheck

test:
	cd apps/api && $(UV) run pytest
	cd apps/web && $(PNPM) test

e2e:
	cd apps/web && $(PNPM) e2e

build:
	cd apps/web && $(PNPM) build

check:
	cd apps/api && $(UV) run ruff format --check .
	cd apps/web && $(PNPM) format:check
	$(MAKE) lint
	$(MAKE) typecheck
	$(MAKE) test
	$(MAKE) build
