# Production readiness

This document consolidates the operational-reliability posture for running
Koranco in production: monitoring, logging, audit vs. logging, environment
separation, secret management, deployment ownership, data retention, and the
lost-device procedure. It intentionally does **not** select a hosting provider,
a monitoring SaaS, or a secret manager; those remain open decisions.

## Audit vs logging vs security events

These are three separate concerns and must not be collapsed into one table or
system:

- **Operational audit** (`operational_audit_events`): accountable farm-record
  changes (create/submit/correct/discard) with actor, action, entity, time,
  request ID, and bounded before/after snapshots. Append-only at the PostgreSQL
  layer; retained with the records it explains.
- **Security events** (`security_events`): authentication, access, and
  sensitive events such as logins, account administration, and CSV exports.
  Retained at least 12 months currently.
- **Application logs** (structured JSON, see below): troubleshooting and
  operations only. They are not a system of record and are not the source for
  audit or security assertions.

## Health / readiness

The existing endpoints are correct and are left unchanged:

- `GET /api/v1/health` returns `{"status":"ok"}` when the API process is alive.
- `GET /api/v1/readiness` performs a real `SELECT 1` against PostgreSQL and
  returns `ready`, or `503` when the database is unavailable.

These are non-sensitive: no credentials, database URL, stack trace, table names,
or sensitive configuration are exposed. Health success with readiness failure
means the database is unreachable (see [incident response](incident-response.md)).

## Structured logging

Backend logging is already structured JSON with a correlation request ID and
per-request metadata (`method`, `path`, `status_code`, `duration_ms`), emitted
by the request-ID middleware. Sync operations record bounded result metadata in
their processed-operation tables for diagnosis.

Logging must not include passwords, session tokens, CSRF tokens, raw secrets, or
unnecessary Worker personal data. Audit and security events contain no such
values. No logging SaaS provider is integrated yet.

## Monitoring recommendations

The following should eventually be monitored (provider/choice unresolved; no
Sentry/Datadog/etc. selected):

- application exceptions;
- 5xx rate;
- database connectivity;
- backup failure;
- migration failure;
- sync failure trends;
- storage/disk/provider alerts;
- uptime/basic availability.

Backup failure in particular must be observable (a failed backup job should
alert). These are recommendations to configure with whatever monitoring the
eventual hosting environment provides; none is implemented here.

## Environment separation

Supported application environments: `development`, `test`, and `production`.

- Production configuration must be provided explicitly; the app refuses to start
  without a real `KORANCO_ENVIRONMENT` and `KORANCO_DATABASE_URL`.
- API docs (`/docs`, `/openapi.json`) are disabled in production
  (`expose_api_docs` is false when `environment == "production"`).
- CORS accepts only configured origins and rejects wildcard configuration.
- `NEXT_PUBLIC_API_ORIGIN` is the browser-visible API origin only and never
  contains credentials.
- Secure cookies are enabled in production.

Do not let production configuration silently fall back to development
credentials/defaults. No staging infrastructure is created in this phase; a
staging environment is recommended before the production pilot. See
[local development](../development/local-development.md) for the development
environment.

## Secret management

- `.env` and `.env.*` are Git-ignored; only `.env.example` is committed, with
  safe example values.
- No real credentials are committed.
- `NEXT_PUBLIC_*` values contain no secrets.
- No secrets live in Docker images or committed config.
- Backup credentials are supplied via the environment at runtime (never in the
  scripts or committed config).

No cloud secret manager is selected yet.

## Deployment ownership

Production infrastructure should be owned by Koranco or an account formally
controlled for Koranco, avoiding permanent dependency on any individual's
personal Vercel account, personal database account, personal email, personal
GitHub secrets, or personal domain ownership. Handover requirements are
documented in [handover principles](handover-principles.md).

## Data retention

No automatic deletion of business records is introduced. Current provisional
retention: operational records retained unless Koranco establishes policy;
operational audit retained with the records it explains; security events at
least 12 months; sync-processed-operation records at current documented
retention; backups provisional 30 days. See
[backup-and-recovery](backup-and-recovery.md). Automatic pruning requires
explicit Koranco approval.

## Lost device

Offline data in browser storage can be lost with the device. For a lost/stolen
device:

1. Disable/revoke the user's sessions where connectivity allows.
2. Revoke/disable the account if appropriate (after confirming authority).
3. Recognize that unsynced device-local records may be unrecoverable; do not
   pretend a remote wipe exists (there is no MDM/remote wipe).
4. Review audit and security events for the account.
5. Issue a replacement device and re-establish the workflow.

See [incident response](incident-response.md#h-lost-field-device).
