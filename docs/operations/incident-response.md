# Incident response runbook

This runbook guides initial diagnosis and recovery for operational incidents. It
uses role placeholders (for example "duty operator", "Koranco operational
authority") because no named Koranco responders are known; Koranco should assign
named owners. Each section lists first checks, what **not** to do, ownership,
evidence to preserve, and a recovery path.

General principles:

- Preserve evidence and logs before making destructive changes.
- Never restore over production casually; restore into a separate database
  first (see [backup-and-recovery](backup-and-recovery.md)).
- Confirm the actor/authority and record the operator, authorization, time, and
  reason for any manual remediation.
- Audit/security/log are separate concerns (see [production readiness](production-readiness.md)).

## A. Application unavailable

**First checks**

- Is the API process alive? Check the process and `/api/v1/health`.
- Is the web app reachable and are static assets served?
- Is the database reachable? Check `/api/v1/readiness` (`SELECT 1`).
- Check recent application logs for exceptions or a crash loop.
- Check deployment/configuration status.

**Do not**

- Restart/rollback blindly without capturing the failure reason.

**Ownership**

- Duty operator; escalate to the Koranco operational authority if unresolved.

**Evidence to preserve**

- Application logs (request IDs, exceptions, stack traces), readiness/health
  results, deployment marker, time window.

**Recovery path**

- If readiness fails, resolve database connectivity (see B) before resuming.
- Restart the API; if it crashes, read the log and fix the root cause.
- Roll back to the last known-good build only after capturing evidence.

## B. Database unavailable

**First checks**

- Is PostgreSQL running? Check `pg_isready`, the container/service status.
- Is the volume/mount present and writable?
- Check resource usage (disk full, memory) and recent database logs.
- Confirm the database URL and credentials used by the API are correct.

**Do not**

- Overwrite or delete the data directory in an attempt to "fix" it.
- Point the app at a different database without recording the change.

**Ownership**

- Duty operator; escalate to the hosting provider/Koranco authority.

**Evidence to preserve**

- Database logs, `pg_isready` output, disk/resource state, timing.

**Recovery path**

- Resolve the cause (free disk, restart service, fix config).
- If data is lost/corrupt, follow the restore procedure into a separate database
  first, validate, then promote (see [backup-and-recovery](backup-and-recovery.md)).
- Confirm `/api/v1/readiness` returns `ready` and critical queries pass.

## C. Failed migration

**First checks**

- What migration was running? What is `alembic current`?
- Did it fail partway? Capture the exact error and the migration log.
- Is the application compatible with the current schema state?

**Do not**

- Blindly downgrade in production.
- Rewrite an already-applied migration to make it "work" later.

**Ownership**

- Duty operator; escalate to the engineer who reviewed the migration and to the
  Koranco authority for data-affecting decisions.

**Evidence to preserve**

- Alembic logs, the migration file and revision, before/after `alembic current`,
  backup confirmation.

**Recovery path**

- Review and fix the migration; apply a corrective forward migration.
- Confirm a verified backup exists before any corrective data migration.
- Verify `alembic current`, readiness, smoke test, and critical queries.

## D. Suspected data corruption

**First checks**

- What records are affected? Correlate with audit events and logs.
- Confirm whether the corruption is in PostgreSQL or in a client/export.
- Check recent migrations, bulk operations, and manual SQL.

**Do not**

- Delete or overwrite affected records without an authorized, audited decision.
- Restore over production without first validating in a separate database.

**Ownership**

- Koranco operational authority (data-affecting decisions).

**Evidence to preserve**

- Affected record IDs, audit events, request IDs, database logs, exports, and a
  timestamped snapshot (e.g. `pg_dump` of the affected database).

**Recovery path**

- Assess scope; use audit history to understand who/what changed records.
- If recovery is needed, restore into a separate database, validate critical
  records, then apply a controlled correction per domain rules.

## E. Backup failure

**First checks**

- What failed: `pg_dump`, encryption, transfer, or retention/prune?
- Is the failure intermittent or persistent? Check the backup log and exit code.

**Do not**

- Assume a previous successful backup is sufficient without confirming retention
  and integrity.
- Leave silent failures; ensure monitoring alerts on backup failure.

**Ownership**

- Duty operator; escalate to the Koranco authority if backups are missing.

**Evidence to preserve**

- Backup script output, exit codes, backup directory listing, checksums, timing.

**Recovery path**

- Fix the failure (disk space, permissions, credentials, gpg config).
- Run a manual backup and verify its checksum.
- If backups are at risk of exceeding retention or missing, address immediately
  and record the gap.

## F. Offline sync backlog / failures

**First checks**

- How many operations are pending per domain (Attendance/Harvest outbox)?
- What result states (`applied`, `already_applied`, `conflict`, `rejected`,
  `needs_attention`) are accumulating?
- Check the sync logs and `attendance_sync_operations` /
  `harvest_sync_operations` result messages.

**Do not**

- Manually edit outbox/operation rows.
- Clear local device outboxes to "fix" a backlog (data loss).

**Ownership**

- Duty operator; escalate to the Koranco authority for stranded/reconciliation
  decisions.

**Evidence to preserve**

- Pending counts, operation IDs, result statuses, request IDs, device identity,
  timestamps.

**Recovery path**

- Resolve the underlying cause (connectivity, permission revocation, conflicts).
- Guide operators to retry sync once connectivity is restored.
- Record stranded-queue reconciliation needs for a Manager decision (reconciliation
  authority remains unresolved; see ADR-008 / ADR-009).

## G. Compromised / disabled user

**First checks**

- Which account? Review security events for the account.
- Revoke active sessions (`/admin/users/{id}/sessions/revoke`).
- If compromised, disable the account after confirming authority.

**Do not**

- Use the compromised account's credentials.
- Share credentials or bypass the session-revocation flow.

**Ownership**

- Koranco operational authority (account/data decisions).

**Evidence to preserve**

- Security events, session activity, request IDs, time window.

**Recovery path**

- Revoke sessions; disable/rotate the account.
- Follow the password-reset/recovery procedures and require a password change.
- Review audit events authored by that account and report findings.

## H. Lost field device

**First checks**

- Can the account still authenticate? Revoke sessions where connectivity allows.
- Determine whether the account should be disabled and whether a lease should be
  suspended.
- Recognize that unsynced device-local records may be unrecoverable (see
  [lost device](production-readiness.md#lost-device)).

**Do not**

- Pretend remote wipe exists (there is no MDM/remote wipe).
- Reuse the device without a fresh sign-in and review.

**Ownership**

- Koranco operational authority; duty operator initiates.

**Evidence to preserve**

- Device identity, account, session activity, security events, last sync times.

**Recovery path**

- Revoke/disable the account; review audit/security events; issue a replacement
  device and re-establish the workflow. Document any unrecoverable local records.

## I. Accidental record correction

**First checks**

- Which record and what changed? Read the operational audit event for the
  correction (actor, before/after, reason).
- Is the correction actually wrong, or just unexpected?

**Do not**

- Blindly reverse the correction without an authorized, audited decision.
- Delete or overwrite history.

**Ownership**

- Koranco operational authority (record-correcting decisions).

**Evidence to preserve**

- The audit event (actor, reason, before/after), the record's current state.

**Recovery path**

- Use the documented correction workflow to restore the correct values with an
  explicit reason (this creates an auditable correction, preserving history).
- Confirm the corrected record and its reporting visibility.
