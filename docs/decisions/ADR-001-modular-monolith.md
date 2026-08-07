# ADR-001: Modular monolith

- Status: Accepted
- Date: 2026-08-07

## Context

The initial product contains related operational domains that share authentication, authorization, transactional data, reporting, and audit needs. The product and operational team are at an early stage, and no requirement demonstrates a need for independently deployed services.

## Decision

Build one Next.js web frontend, one modular FastAPI backend, and one PostgreSQL database. Organize backend code around explicit business-domain modules within the single application.

## Consequences

- Development, deployment, transactions, observability, and handover remain comparatively simple.
- Domain boundaries still require deliberate ownership and dependency rules.
- Modules can collaborate within database transactions where correctness requires it.
- Independent scaling and deployment are not provided by default.
- A future service extraction requires measured operational, scaling, regulatory, or ownership justification and a new ADR.

