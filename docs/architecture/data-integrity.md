# Data integrity principles

PostgreSQL is the authoritative source for accepted operational records. Application validation improves feedback; database guarantees protect truth under concurrency, retries, defects, and multiple clients.

## Constraints and transactions

- Represent confirmed required relationships, uniqueness, valid ranges, and state invariants with database constraints where appropriate.
- Use transactions around operations that must succeed or fail as a unit.
- Choose transaction boundaries from business invariants, not controller or screen boundaries.
- Do not encode unconfirmed Koranco rules as constraints.

## Idempotency

Retryable and offline-created mutations require stable operation identifiers and durable server-side duplicate protection. A repeated request must not silently create a second business fact. Domain-level duplicate rules are separate from transport idempotency and remain subject to workflow confirmation.

## Time and authorship

- Use timezone-aware timestamps and establish a consistent storage convention before schema work.
- Preserve server-recorded time and, where operationally needed, separately preserve client-observed time.
- Do not trust device clocks as the only ordering or audit source.
- Attribute operational actions and later corrections to authenticated application users.
- Define operational dates and day boundaries with Koranco rather than deriving them implicitly.

## Corrections and history

Important operational facts must not be silently overwritten or deleted. Correction behavior belongs to each domain and must preserve the original fact, responsible actor, time, reason, and meaningful before/after state as required. Exact approval and correction workflows are unresolved.

Audit history complements rather than replaces a well-designed domain correction model. Routine application paths must not edit or delete audit records.

## Migration discipline

- Make every schema change through Alembic and review generated migrations.
- Test migrations against representative schemas and data volumes before production.
- Prefer backward-compatible expand/migrate/contract changes when deployments can overlap.
- Define data backfills, verification, failure handling, and rollback/recovery before risky changes.
- Take and verify an appropriate backup before destructive production migrations.
- Never rewrite an already-applied migration to disguise later changes.

