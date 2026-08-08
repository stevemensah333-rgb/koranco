# ADR-011: Production operations and backup strategy

- Status: Accepted
- Date: 2026-08-08

## Context

The Koranco system is production-oriented and the authoritative data lives in
PostgreSQL. Koranco now requires that production data can be backed up
automatically, restored reliably, monitored, migrated safely, diagnosed, and
handed over to future engineers. A backup strategy is not complete merely
because backups are configured: restoration must be documented and testable.

No managed hosting provider has been approved yet. The strategy must therefore
be portable and map cleanly onto a managed PostgreSQL provider later, without
committing to one now.

## Decision

### 1. Managed PostgreSQL native backups are the production preference

When a managed PostgreSQL provider is selected, its native automated backup,
point-in-time recovery, and retention become the primary production backup
mechanism. The repository must not build a custom backup product.

### 2. pg_dump / pg_restore are the portable recovery tooling

Until a provider is selected (and as a recovery fallback that works anywhere),
`pg_dump` (custom format, compressed, checksummed) and `pg_restore` are the
portable backup and restore tooling. Narrow wrapper scripts live under
`scripts/` and never embed credentials.

### 3. Initial provisional backup policy

Until Koranco or the hosting provider confirms stricter requirements:

- daily automated database backup;
- minimum 30-day rolling retention;
- documented restoration procedure;
- a restoration drill (backup/restore round trip) runnable in development/test
  and CI before a production pilot;
- backup failure must be observable (the backup job fails loudly and surfaces
  in monitoring);
- the production PostgreSQL database remains authoritative.

This is an initial project policy, **not** Koranco's formal retention policy.

### 4. No feature work in this phase

Backup, recovery, and production-operations work introduces no new farm product
features, no new offline domain, and no change to Attendance, Harvest,
reporting, Worker/FarmUnit, or the offline protocol unless a recovery test
reveals an actual operational correctness bug.

## Consequences

- Operators get a documented, testable restore path without depending on any
  hosting provider.
- When a provider is selected, its native backups supersede the scripted path
  for routine automation; the scripts remain as a portable recovery tool.
- The provisional RPO (up to 24 hours under daily backups) and RTO (same
  business day for the pilot, subject to hosting infrastructure) are explicit
  pilot targets, not guaranteed SLAs.
- Backup security, restore safety guards, and the restore drill are documented
  in [backup-and-recovery](../operations/backup-and-recovery.md).
