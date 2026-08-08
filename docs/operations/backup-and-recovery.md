# Backup and recovery

## Purpose and ownership

This document defines the backup strategy, provisional retention policy,
restoration procedure, restore drill, and backup security for the Koranco
authoritative PostgreSQL database. It is owned operationally by Koranco (or a
hosting account formally controlled for Koranco); the implementation here is
portable tooling that does not depend on a hosting provider.

A backup strategy is not complete merely because backups are configured.
Restoration must be documented and actually tested on a defined schedule, with
the result recorded. Successful backup jobs alone do not demonstrate
recoverability (see also [handover principles](handover-principles.md)).

## Provider note

No managed PostgreSQL provider is selected yet. This strategy is deliberately
portable:

- **Preferred (production):** the selected managed PostgreSQL provider's native
  automated backups, point-in-time recovery, and retention.
- **Portable fallback (and pre-provider tooling):** `pg_dump` / `pg_restore`
  wrapper scripts in `scripts/` that work against any PostgreSQL.

See [ADR-011](../decisions/ADR-011-production-operations-and-backup-strategy.md).

## Provisional backup policy

Until Koranco or the hosting provider confirms stricter requirements, the
following initial project policy applies:

- **Automation:** a daily automated database backup.
- **Retention:** minimum 30-day rolling retention.
- **Encryption:** encrypted at rest where the selected infrastructure supports
  it; optional `gpg` encryption of each scripted backup (see below).
- **Failure domain:** where practical, store backups separately from the primary
  database (a different host, volume, or provider) so a database outage or
  volume loss does not destroy the backups.
- **Observability:** a failed backup must be observable (the job exits non-zero
  and surfaces in monitoring/alerting).
- **Authoritative store:** the production PostgreSQL database remains
  authoritative.
- **Restoration test:** a restoration drill must pass before a production pilot
  and be repeated on a defined schedule.

This is an **initial project policy**, not Koranco's formal retention policy,
and is subject to confirmation by Koranco and the hosting provider.

## RPO / RTO (provisional pilot targets)

These are provisional project targets, not guarantees, and they are
distinguished from actual provider capability and any future Koranco-approved
SLA:

- **RPO (Recovery Point Objective):** up to 24 hours under daily backups, unless
  the selected managed database provides better native point-in-time recovery.
- **RTO (Recovery Time Objective):** same-business-day restoration target for
  pilot operations, subject to hosting infrastructure and operator availability.

Do not claim guaranteed uptime or guaranteed recovery times. Update these
targets once Koranco approves an SLA and the hosting provider's capabilities are
known.

## Backup tooling

Two narrow scripts live in `scripts/`:

- `scripts/backup-postgres.sh` — creates a compressed, checksummed `pg_dump`
  (custom format) backup with rolling retention.
- `scripts/restore-postgres.sh` — restores a backup into an explicitly selected
  target database, refusing dangerous/ambiguous targets by default.
- `scripts/backup-restore-drill.sh` — reproducible restore drill (see below).

These scripts:

- fail loudly (`set -euo pipefail`) on any error;
- use environment configuration and never embed credentials (credentials come
  from `PGPASSWORD`, `PGHOST`, `PGPORT`, `PGUSER` or a libpq `.pgpass`);
- quote shell arguments safely;
- refuse dangerous, ambiguous restore targets;
- record metadata and a SHA-256 checksum next to each backup so integrity can
  be verified with `sha256sum -c`.

### Creating a backup

```sh
PGHOST=localhost PGPORT=5432 PGUSER=koranco PGDATABASE=koranco_prod \
PGPASSWORD='...' KORANCO_BACKUP_DIR=/var/backups/koranco \
KORANCO_BACKUP_RETENTION_DAYS=30 \
./scripts/backup-postgres.sh
```

Optional `KORANCO_BACKUP_GPG_RECIPIENT` encrypts each backup with `gpg`. If set
but `gpg` is unavailable, the script fails loudly rather than silently writing
unencrypted backups.

The production provider's native backup system, when selected, supersedes the
script for routine automation.

## Restoration procedure (runbook)

Prefer restoring into a separate database/environment first. Do not casually
restore over production.

### Prerequisites

1. Confirm the incident and the restore target with Koranco's operational
   authority; record the operator, authorization, time, and reason.
2. Identify which backup to restore (date/time, database) and confirm its
   SHA-256 checksum against the recorded metadata.
3. Confirm you have access to the target cluster and the target database does
   not hold data you cannot afford to lose (the script refuses to overwrite a
   non-empty database unless `KORANCO_RESTORE_REPLACE=1` is set explicitly).
4. Confirm migration state expectation (the backup already contains the schema
   at its migration head at backup time).

### Steps

1. **Create/select the restore target.** Create a fresh, empty database (or
   select an existing disposable one).
2. **Stop writes where necessary.** For a full restoration into a shared
   database, stop the application or restrict write access to prevent writes
   during and after the restore. For a disposable target, this is not needed.
3. **Restore PostgreSQL.**

   ```sh
   PGHOST=<target host> PGPORT=<target port> PGUSER=<target user> PGPASSWORD='...' \
   KORANCO_RESTORE_TARGET_DATABASE=koranco_restore KORANCO_RESTORE_CONFIRM=yes \
   PGDATABASE=koranco_prod \
   ./scripts/restore-postgres.sh /var/backups/koranco/koranco-<db>-<stamp>.dump
   ```

   The script refuses to run without `KORANCO_RESTORE_CONFIRM=yes`, refuses to
   restore into the source database, and refuses to overwrite a non-empty target
   unless `KORANCO_RESTORE_REPLACE=1` is explicitly set.

4. **Confirm migration state.** Run `alembic current` against the restored
   database and confirm it is at the expected head.
5. **Validate application connectivity.** Point the API at the restored
   database and check `/api/v1/readiness` returns `ready`.
6. **Validate critical records** (see [Restore verification](#restore-verification)).
7. **Post-restore checks:** confirm reporting still returns consistent values,
   exports work, and navigation/roles behave as expected.

### Rollback / abort

If the restored database is incorrect or validation fails:

- stop the application against the restore target;
- return to the previous database (if it was preserved) or restore the
  previously confirmed backup;
- record the outcome and the evidence in the incident record;
- do not leave a partially validated restored database serving traffic.

## Restore verification

A PostgreSQL command returning exit code 0 is not sufficient evidence of
successful recovery. After restoration, verify:

- row counts where useful;
- foreign keys are intact;
- migration head is correct (`alembic current`);
- authentication works (a known application user can authenticate and a known
  password verifies);
- roles/permissions are retained;
- Worker and FarmUnit history is retained;
- Attendance is retained (submitted sessions and entry statuses);
- Harvest is retained (submitted records, quantities, units);
- operational audit events are retained;
- security events are retained;
- sync-processed-operation records are retained where expected;
- reporting still returns consistent values (e.g. Attendance totals and Harvest
  totals, with incompatible units kept separate).

The restore drill automates the representative subset of these checks.

## Restore drill

`scripts/backup-restore-drill.sh` is a reproducible restoration drill for
development/test:

1. create/reset a source database and apply migrations;
2. seed representative synthetic data (application users, permissions, Workers,
   FarmUnits, submitted Attendance, submitted Harvest, operational audit events,
   a security event, and sync-processed-operation records);
3. create a backup;
4. create a fresh, empty restore database;
5. restore the backup;
6. verify migration head and representative records/invariants.

It uses only synthetic data and never touches real Koranco data. Run it before a
production pilot and repeat on a defined schedule. A `backup-restore-drill` CI
job is documented but not currently present because this GitHub App lacks the
`workflows` permission; a maintainer with that permission should add the job.
Until then, running and recording this drill is a manual release gate. Example:

```sh
PGHOST=localhost PGPORT=5432 PGUSER=koranco PGPASSWORD='...' \
KORANCO_BACKUP_DIR=/tmp/koranco-drill-backups \
./scripts/backup-restore-drill.sh
```

## Backup security

Backups contain sensitive operational and security data. Therefore:

- restrict access to backup storage to named operators (least privilege);
- use encryption at rest where the infrastructure supports it, and encrypt
  off-site copies;
- do not casually download backups to personal machines;
- do not use production backups as developer fixtures;
- restore only into controlled environments;
- destroy backups according to retention policy (rolling 30-day default);
- never copy production backups into local development machines as a default
  workflow.

## Data retention

No automatic deletion of business records is introduced by this phase. Current
provisional retention:

- **Operational records:** retained unless Koranco establishes policy.
- **Operational audit:** retained with the records it explains.
- **Security events:** at least 12 months currently.
- **Sync-processed-operation records:** the current documented retention
  applies (not auto-pruned; see ADR-008 / ADR-009).
- **Backups:** provisional 30-day rolling retention.

Automatic pruning of business or audit records is not enabled and requires
explicit Koranco approval.

## Failure observability

Backup failures must be observable. The scripted path fails loudly and writes
no partial backup silently; monitoring should alert on backup job failure (see
[production readiness](production-readiness.md) and [incident response](incident-response.md)).
