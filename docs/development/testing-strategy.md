# Testing strategy

Testing effort follows operational risk. Tests should verify behavior and invariants at the lowest useful level while retaining integration and end-to-end evidence for critical workflows.

## Test layers

- **Backend unit tests:** domain calculations, policies, state transitions, and validation that do not require infrastructure.
- **Backend integration tests:** persistence, transactions, constraints, authorization, idempotency, audit behavior, and API/database interaction against PostgreSQL.
- **API contract tests:** important request, response, error, versioning, and generated-client assumptions where they add value.
- **Frontend unit/component tests:** user-visible behavior, validation, accessibility, state transitions, and offline/sync presentation using Vitest and React Testing Library where appropriate.
- **End-to-end tests:** Playwright coverage for critical authenticated workflows across the frontend, API, and database.
- **Exploratory and field testing:** real supported devices, sunlight/touch conditions, slow or unstable connectivity, and representative users. Automated tests do not replace this.

## High-risk coverage

Offline testing must exercise durable capture, refresh/restart, failed and interrupted requests, retries, duplicate submissions, operation ordering, concurrent devices, conflicts, expired authorization, stale reference data, storage failure, and application upgrades with pending work.

Authorization tests should demonstrate both allowed and denied behavior, including scoped data access, exports, corrections, audit access, and administration.

Migration testing should apply migrations from supported prior versions, verify data transformations and constraints, and test recovery plans for risky changes. Production migration rehearsal should use representative scale without casually copying sensitive production data.

## Regression and completion

Bugs should receive focused regression tests when practical. Test data must be clearly synthetic and must not imply unconfirmed Koranco rules.

Before considering work complete, run the applicable formatter, linter, static type checker, unit/integration tests, production build, and critical E2E tests. CI should enforce these checks once the applications exist; exact tooling belongs to the scaffolding phase.

