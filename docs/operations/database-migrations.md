# Database migration operations

This document covers safe, production-grade use of Alembic for schema changes in
the Koranco PostgreSQL database. It assumes the migration discipline already
documented in [data-integrity](../architecture/data-integrity.md): every schema
change goes through Alembic, generated migrations are reviewed, applied
migrations are never rewritten, and backward-compatible expand/migrate/contract
changes are preferred when deployments can overlap.

## Production migration procedure

1. **Review the migration.** Inspect the new revision: tables/columns added or
   changed, data backfills, constraints, indexes, and locks. Confirm the
   `down_revision` points at the current head.
2. **Back up before a risky migration.** Run the backup script (or confirm a
   provider-native backup) and verify the backup before applying a destructive
   or data-changing migration. Confirm backup availability, not just that a job
   was scheduled.
3. **Run against staging/test first.** Apply the migration to a representative
   staging or test copy and run smoke/verification checks before production.
4. **Apply the migration.**

   ```sh
   cd apps/api
   uv run alembic upgrade head
   ```

   Apply exactly the intended revision; do not chain unrelated changes.
5. **Verify the migration.**

   - `uv run alembic current` confirms the expected head.
   - `/api/v1/readiness` returns `ready`.
   - Smoke test key operations and run critical query checks.
   - Confirm the application version in deployment is compatible with the new
     schema.

## Rollback limitations and forward-fix philosophy

- **Do not assume every Alembic `downgrade` is safe in production.** Downgrades
  can drop data, run long, or leave the application incompatible. They are
  appropriate only after review and only in controlled environments.
- **Historical migrations are immutable.** Never rewrite an already-applied
  migration to disguise a later change. Fix a production issue with a new
  forward migration.
- **Forward-fix philosophy:** when a migration is defective, prefer writing a
  corrective forward migration over downgrading.

## Migration checklist

Before a production migration:

- [ ] Reviewed the generated migration.
- [ ] Inspected for destructive operations (drops, truncates, column type
      changes) and lock/table-rewrite risk.
- [ ] Applied and verified against a staging/test copy.
- [ ] Confirmed a verified backup is available.
- [ ] Confirmed application compatibility with the new schema.

After a migration:

- [ ] `uv run alembic current` matches the expected head.
- [ ] `/api/v1/readiness` returns `ready`.
- [ ] Smoke test passed.
- [ ] Critical query checks passed.
- [ ] Outcome recorded in the change/incident record.

## Schema drift check

`uv run alembic check` compares the SQLAlchemy model against the database
schema. Run it after migrations to detect drift.

SQLAlchemy metadata is aligned with the migration-created uniqueness artifacts
for `application_users.login_identifier` and
`harvest_sync_operations.operation_id`. The reconciliation changed model
metadata only because the deployed schema already enforced the intended
constraints; no risk-bearing schema migration was required.

`alembic check` is currently clean after upgrading a fresh PostgreSQL database.
A proposed schema operation must be resolved deliberately: add and review a
forward migration for an intended schema change, or align incorrect model
metadata with the existing authoritative migration history.

Do not interpret a clean `alembic current` as proof there is no drift;
`alembic check` is the separate comparison.

## CI

CI runs `uv run alembic upgrade head` against a fresh PostgreSQL 17 service
before the test suite. The documented `alembic check` gate and dedicated
`backup-restore-drill` job are not present in `.github/workflows/ci.yml`: the
current GitHub App lacks the `workflows` permission and GitHub rejected the push
that re-applied them. A maintainer with that permission should add both gates.
Until then, run `uv run alembic check` and the
[backup/restore drill](backup-and-recovery.md#restore-drill) before release.
