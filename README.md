# Koranco Farms Digital Farm Management System

Koranco is a production-oriented system for digitizing priority operations at Koranco Farms, a commercial pineapple producer and exporter in Ghana. It is intended for real operational users and data, not as a demonstration dashboard or generic SaaS product.

## Project status

The repository is in its foundation phase. Product implementation has not started, and no frontend, backend, or database application has been scaffolded. The current contents establish product boundaries, architectural direction, engineering principles, and unresolved requirements.

## Intended architecture

The system will be a modular monolith comprising:

- one responsive, offline-capable Next.js/React/TypeScript PWA;
- one Python/FastAPI backend using Pydantic, SQLAlchemy 2, and Alembic; and
- one PostgreSQL database as the authoritative data store.

The intended top-level application locations are `apps/web` and `apps/api`. They will be created when application scaffolding is approved. Critical end-to-end tests will live under `e2e`, and operational scripts will be added under `scripts` only when justified.

## Documentation

- [Product scope](docs/product/product-scope.md)
- [Unresolved requirements](docs/product/unresolved-requirements.md)
- [Architecture overview](docs/architecture/overview.md)
- [Domain boundaries](docs/architecture/domain-boundaries.md)
- [Offline synchronization principles](docs/architecture/offline-sync.md)
- [Security principles](docs/architecture/security.md)
- [Data integrity principles](docs/architecture/data-integrity.md)
- [Design principles](docs/design/principles.md)
- [Testing strategy](docs/development/testing-strategy.md)
- [Handover principles](docs/operations/handover-principles.md)
- [Architecture decisions](docs/decisions/)

Repository-wide engineering instructions are in [AGENTS.md](AGENTS.md).

Unknown Koranco workflows, fields, permissions, metrics, and policies must not be guessed. They remain documented as unresolved until validated with an accountable Koranco stakeholder.
