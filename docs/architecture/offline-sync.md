# Offline field synchronization

## Implemented policy

Offline capability applies to Attendance capture and new Harvest draft capture
through first submission. PostgreSQL remains authoritative. Submitted-record
corrections, administration, Worker/Farm Structure changes, audit browsing, and
reporting require an authenticated online connection.

## Authorization and ownership

Successful server validation stores a non-secret 12-hour lease containing only
the application-user ID, display name, domain permission flags, validation time,
and expiry. It contains no cookie, password, verifier, CSRF value, or reusable
token. Expiry preserves existing work but blocks new local saves and submissions;
synchronization always requires online authentication.

Every cached reference row, local draft, and operation carries its creator's
application-user ID. Queries are owner-filtered. The server binds each operation
to the authenticated actor on first ingestion and rejects cross-actor replay.
Logging out warns when either domain has unsynchronized work, preserves the work,
and suspends that user's lease. Another account cannot view, edit, or synchronize
it.

## IndexedDB schema version 2

The existing `koranco-attendance-offline` database keeps its historical name to
avoid a destructive copy migration.

Version 1 Attendance stores remain unchanged:

- `workers`: owner-qualified Worker reference cache;
- `drafts`: owner-scoped Attendance snapshots;
- `outbox`: coarse `submit_snapshot` operations;
- `leases`: owner and authorization lease metadata.

Version 2 additively introduces:

- `harvestFarmUnits`: owner-qualified active FarmUnit reference cache;
- `harvestDrafts`: client-generated Harvest UUID, complete values, base server
  version where applicable, local state, timestamps, and bounded message;
- `harvestOutbox`: stable `submit_harvest_snapshot` operations with retry and
  attention state.

A tested v1-to-v2 upgrade preserves existing Attendance data. Local states are
`editing`, `pending_submission`, `syncing`, `synced`, and `needs_attention`.
Outbox states are `pending`, `syncing`, and `needs_attention`.

## Domain protocols

### Attendance

`POST /api/v1/attendance-sessions/sync` accepts one complete Attendance snapshot
with a stable operation UUID and target session UUID. Exact replays reconcile as
already applied. A materially different submitted target, stale draft, inactive
Worker, different owner, or equivalent-population competing session conflicts;
nothing is silently merged or overwritten.

### Harvest

`POST /api/v1/harvest-records/sync` accepts one complete Harvest snapshot with:

- stable operation and client-generated HarvestRecord UUIDs;
- payload version and optional base server version;
- operational date and FarmUnit UUID;
- decimal quantity, provisional unit, and optional bounded note.

Operation UUID provides transport idempotency. HarvestRecord UUID provides
record equivalence; FarmUnit plus date is deliberately not a duplicate key
because multiple legitimate harvest events may share both. The API fully
revalidates FarmUnit activity/specificity, quantity, unit, note, actor, and
version before invoking the normal Harvest domain submission path.

Both endpoints return `applied`, `already_applied`, `conflict`, or `rejected`.
HTTP 401 leaves work pending for same-user authentication. Permission revocation,
unsupported payloads, stale or changed records, inactive/ambiguous FarmUnits,
and other semantic conflicts preserve the payload in `needs_attention`. There
is no last-write-wins behavior.

Processed results are durable in separate Attendance and Harvest PostgreSQL
tables under unique operation IDs. The server serializes concurrent identical
operations. Official audit events occur only on server acceptance and retain the
authenticated human actor. A generic command bus or synchronization framework is
intentionally not introduced.

## Reference preparation and connectivity

Users explicitly prepare reference data while connected: active Workers for
Attendance and active FarmUnits for Harvest. Each owner-scoped cache is replaced
transactionally and the UI reports refresh time. Cached status is not treated as
authoritative; the API revalidates references during synchronization.

Separate domain sync engines run on explicit “Sync now,” connectivity
restoration, and visibility restoration. A combined status surface reports
pending counts. Network and timeout failures return operations to pending
without data loss; retries are event- or user-driven rather than aggressively
polled.

## Service worker and updates

The service worker caches only same-origin static assets and Attendance/Harvest
field routes needed to reopen field capture. It never caches API responses,
cookies, administration pages, security events, or arbitrary cross-origin
responses.

Updates do not call `skipWaiting` automatically. Activation is held while either
domain has local operations, including needs-attention work. Payload and local
schema versions are explicit; unsupported work is preserved rather than
silently discarded.

## Security and recovery limits

IndexedDB is readable by JavaScript executing in the application origin, so XSS
prevention, dependency review, deployment hardening, device access control, and
minimal cached data matter. Browser storage is not encrypted by this application
and is not a backup.

Storage clearing, eviction, private browsing, device loss, browser uninstall,
or physical access can lose or expose unsynchronized records. Training must
prioritize prompt synchronization. No automated Manager takeover of another
user's stranded queue exists.

See [ADR-008](../decisions/ADR-008-attendance-offline-synchronization.md),
[ADR-009](../decisions/ADR-009-harvest-offline-synchronization.md), the detailed
[Harvest protocol](harvest-offline-sync.md), and the physical-device field-test
checklists for [Attendance](../operations/offline-attendance-field-test.md) and
[Harvest](../operations/offline-harvest-field-test.md).

## Remaining Koranco operational decisions

- Approved shared-device practice, screen-lock expectations, and custody.
- Recovery authority for a disabled user's stranded work.
- Supported phone/browser matrix and acceptable disconnected duration.
- Final local and processed-operation retention periods.
- Whether installations need a managed device identifier.
- Incident response for device loss and browser-storage clearing.
