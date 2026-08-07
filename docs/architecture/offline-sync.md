# Offline synchronization principles

Offline support applies only to field workflows that Koranco explicitly confirms. Detailed protocols and conflict rules will be designed with those workflows, not speculated in advance.

## Principles

- Persist an offline operation locally before presenting it as safely captured.
- Use IndexedDB, accessed through Dexie, for local operational persistence when implemented.
- Maintain a durable mutation queue/outbox that survives navigation, refresh, and temporary application closure within browser guarantees.
- Give each logical operation a stable identifier so retries represent the same intent.
- Require server-side idempotency backed by durable database guarantees; UI debouncing is insufficient.
- Show users whether work is local, syncing, accepted, conflicted, or failed, with an actionable retry/recovery path.
- Do not treat `navigator.onLine` as proof that the API is reachable.
- Never silently overwrite a meaningful conflict or discard either version of operational information.
- Keep cached reference data sufficient and appropriately current for each approved offline workflow.
- Treat browser storage as fallible local operational storage, never as the authoritative database or a backup.
- Preserve the authenticated actor responsible for an offline operation when it reaches the server.
- Account for stale application versions and pending local operations during deployments.

## Questions deferred to workflow design

The mutation payloads, record versions, batching, retry schedule, reference-data refresh, conflict categories, retention of accepted operations, shared-device behavior, and authorization changes while offline remain unresolved. They require confirmed attendance and harvest semantics plus field testing on supported devices and connectivity.

Failure testing must include interrupted requests, duplicated submissions, reordered operations, application termination, storage loss/pressure, stale reference data, expired sessions, concurrent devices, and deployments with pending work.

