# Repository guidance

## Project

Koranco Farms Digital Farm Management System is a real production-oriented AIL engagement for real operational users and data. It is not a hackathon, demo SaaS product, or generic CRUD dashboard. Optimize for engineers who can maintain the repository without the original team or AI tools.

## Scope

Initial scope: authentication and authorization; worker and field/block registers; attendance; harvest; offline field capture and synchronization; controlled corrections; audit history; operational reporting; management overview; exports; administration; and backup/recovery support.

Deferred: inventory, payroll, full crop lifecycle management, complete export/batch traceability, generic AI assistants, ML forecasting, computer vision, robotic inspection, and sucker-counting automation. Introduce AI/ML only after Koranco validates a problem, adequate data exists, measurable value is expected, and the feature enters approved scope. Python is not permission to add AI.

## Technical direction

- Web: Next.js, React, TypeScript, responsive PWA, Tailwind CSS, and IndexedDB/Dexie for approved offline workflows.
- API: Python, FastAPI, Pydantic, SQLAlchemy 2, and Alembic.
- Data: one authoritative PostgreSQL database.
- Tests: Pytest; Vitest/React Testing Library where appropriate; Playwright for critical workflows.
- Architecture: modular monolith with one frontend and one backend.

Prioritize: correctness, data integrity, security, reliability, maintainability, auditability, offline reliability, accessibility and operational usability, performance, then visual polish. Performance never justifies compromising correctness or maintainability without evidence.

## Architecture and data

- Organize backend code by business domain. Separate HTTP concerns from explicit domain/application logic.
- SQLAlchemy models are not API schemas. Enforce confirmed invariants in PostgreSQL where appropriate. Use Alembic for every schema change.
- Avoid premature abstractions and generic repository/service frameworks. Do not introduce microservices, Kafka, Celery, Redis, Kubernetes, or separate AI services without demonstrated requirements.
- Distinguish authenticated application users from farm workers.
- Operational records need traceable authorship and timestamps. Do not silently remove history; destructive operations and important corrections require explicit justification and auditability.
- Do not collect worker personal data merely because other HR systems do.

## Authorization, offline, and security

- Enforce least-privilege authorization in the backend. Frontend hiding is not security. Centralize deliberate permissions and confirmed roles; never invent Koranco permissions.
- Offline applies only to explicitly supported workflows. IndexedDB is not authoritative. Offline operations must be durable, retry-safe, duplicate-safe, and visibly synchronized. Do not rely only on `navigator.onLine` or silently overwrite conflicts.
- Never commit secrets. Validate untrusted input server-side and use established authentication mechanisms, not custom cryptography.
- Minimize sensitive data. Keep secrets out of logs and audit events. Do not casually copy production data into development.

## UX and testing

Avoid generic AI/SaaS styling: decorative gradients, excessive glassmorphism or whitespace, huge rounded cards or marketing headings, emoji interfaces, random metrics, and grids of equally weighted cards.

Field UI is phone-first with high contrast, large targets, minimal typing, clear connectivity/sync state, and obvious outcomes. Management UI should favor useful density, strong tables, filters, hierarchy, and reporting. Deliberately handle loading, empty, validation, success, authorization failure, server/network failure, relevant offline state, and recovery.

Test new behavior in proportion to risk. Critical workflows need integration/E2E coverage; bugs should receive practical regression tests. Before completion, run applicable formatting, linting, type checking, tests, and builds.

## Requirements, dependencies, and handover

For an unknown business requirement: check project documentation, record it as unresolved if still unknown, avoid dependent schema/rules, and surface the dependency to a human. Never silently decide a Koranco workflow.

Before adding a dependency, identify the requirement and prefer mature, maintained libraries over duplicating platform capability. Do not add one merely to save a few lines.

Update documentation when architecture changes and use ADRs for significant decisions, not trivial details. Assume future maintainers have only this repository, its documentation, and standard engineering knowledge—not this conversation, the original team, Codex, or undocumented context.

