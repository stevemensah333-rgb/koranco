# Offline attendance synchronization

## Implemented policy

Offline capability applies only to attendance capture. PostgreSQL remains authoritative. Administration, Worker/Farm Structure management, audit browsing, corrections, harvest, and reporting require an authenticated online connection.

### Authorization and ownership

Successful server validation stores a non-secret attendance lease containing only application-user ID, display name, attendance permission presence, validation time, and expiry. The lease lasts at most 12 hours. It contains no cookie, password, verifier, CSRF value, or reusable token. Expiry preserves existing work but blocks new local saves/submissions; synchronization requires online authentication.

Every cached Worker, local draft, and operation carries the creator's application-user ID. Queries are owner-filtered. A replayed operation is also bound to its original server actor. Logging out leaves unsynced work intact after an explicit warning and suspends that user's offline lease; online reauthentication renews it. Another account cannot view, edit, or synchronize the preserved work.

### IndexedDB schema version 1

- `workers`: owner-qualified key, stable Worker UUID, current code/name/active state, refresh time.
- `drafts`: client UUID, owner, date, server ID/base version when known, complete entries, local state, schema/payload version, bounded status message, local timestamps.
- `outbox`: operation UUID, owner, aggregate UUID, explicit sequence, `submit_snapshot` type, versioned payload, retry/attention state and bounded diagnostics.
- `leases`: owner, display name, validation/expiry timestamps, attendance permission flag.

Local states are `editing`, `pending_submission`, `syncing`, `synced`, and `needs_attention`. Outbox states are `pending`, `syncing`, and `needs_attention`. Network/time-out/transient failure returns an operation to pending. Authentication expiry remains pending and requests same-user login. Permission revocation, unsupported payloads, and semantic conflicts require attention.

### Protocol version 1

`POST /api/v1/attendance-sessions/sync` accepts one coarse operation:

- stable operation UUID;
- `submit_snapshot` operation type;
- stable target/session UUID;
- payload version;
- explicit attendance date;
- nullable base server version;
- complete attendance entries.

Results are `applied`, `already_applied`, `conflict`, or `rejected`. HTTP 401 means authentication is required; HTTP 403 means the authenticated account lacks permission. PostgreSQL stores processed results under a unique operation ID. The server serializes concurrent identical operations, rejects cross-actor replay, and invokes the normal attendance create/update/submit functions. Official audit events occur only on server acceptance and retain the authenticated human actor.

A submitted target with the exact same date, Workers, statuses, and times reconciles as already applied. A material difference conflicts. A stale server draft, inactive Worker, different owner, or equivalent-population competing session is never overwritten or silently merged.

### Reference preparation and connectivity

An explicit preparation action fetches all active Workers in paginated API requests and transactionally replaces that user's cached roster. The UI displays the refresh time and does not imply freshness while disconnected. Server validation remains decisive if a cached Worker later becomes inactive.

Sync uses one request per submitted attendance snapshot. It runs on “Sync now,” connectivity restoration, and visibility restoration with no aggressive polling. Failed requests use user-driven/event-driven retries; a future measured need may add bounded timed backoff.

### Service worker and updates

The service worker caches only same-origin static assets and attendance routes needed to reload field capture. It does not cache API responses, cookies, administration pages, security events, or arbitrary cross-origin responses. Network-first attendance caching refreshes compatible resources while connected.

Updates do not call `skipWaiting` automatically. The page checks IndexedDB: without pending work it permits activation; with pending work it displays that synchronization is required first. IndexedDB schema, application version, and payload version are explicit. Unsupported queued payloads are preserved in needs-attention state rather than destructively migrated.

## Security and recovery limits

IndexedDB is readable by JavaScript executing in the application origin, so XSS prevention, dependency review, CSP/deployment hardening, device access control, and minimal cached personal data matter. Local payloads are untrusted and fully revalidated by the API. Browser storage is not encrypted by this application and should not be treated as a backup.

Storage clearing, eviction, private browsing, device loss, browser uninstall, or physical access can lose or expose unsynced records. Training must prioritize prompt synchronization. No automated Manager takeover of another user's stranded queue exists.

## Remaining Koranco operational decisions

- Approved shared-device practice, screen-lock expectations, and physical custody.
- Recovery/reconciliation authority for a disabled user's stranded work.
- Supported phone/browser matrix and acceptable disconnected duration after field trials.
- Processed-operation and local-confirmed-record retention periods.
- Whether installations need a managed device identifier.
- Incident response for device loss and browser-storage clearing.
