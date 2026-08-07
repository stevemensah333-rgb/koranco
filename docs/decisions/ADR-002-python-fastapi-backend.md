# ADR-002: Python and FastAPI backend

- Status: Accepted
- Date: 2026-08-07

## Context

The system needs a clear API boundary, server-side validation and authorization, reliable PostgreSQL persistence, migration tooling, generated API documentation, and a maintainable testing ecosystem.

## Decision

Use Python with FastAPI for the backend, Pydantic for API data validation and serialization, SQLAlchemy 2 for persistence, Alembic for schema migrations, and PostgreSQL as the database.

## Rationale

This stack provides clear frontend/backend separation, readable application code, a mature Pydantic/OpenAPI ecosystem, and established SQLAlchemy/PostgreSQL tooling. Python also permits natural integration with legitimate future data or ML workloads if they are validated and approved.

Python was not selected because it inherently makes this application faster. Correctness, database design, query behavior, deployment, and measured bottlenecks determine performance. Possible future AI/ML work does not justify introducing it into the initial product.

## Consequences

- Runtime and dependency versions must be pinned during scaffolding.
- API schemas and SQLAlchemy persistence models remain separate.
- Engineers must prevent blocking or expensive work from degrading request handling and address it only when concrete workloads require another execution model.
- Future data/ML integration remains optional and subject to product approval.

