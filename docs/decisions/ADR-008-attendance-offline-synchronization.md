# ADR-008: Attendance offline synchronization

- Status: Accepted
- Date: 2026-08-07

## Context

Attendance must survive intermittent connectivity without weakening PostgreSQL authority, actor attribution, submission uniqueness, correction controls, or Worker validation. Field devices may be shared and the browser may lose storage. Ordinary CRUD retries do not provide a durable offline protocol.

## Decision

Use a versioned Dexie/IndexedDB database scoped to attendance. Store cached Worker references, owner-bound local drafts, a 12-hour non-secret authorization lease, and a durable outbox. A local submission is one `submit_snapshot` operation containing the complete roster, not one operation per tap or Worker. Its client UUID is both the future server session identifier and stable aggregate identifier; a separate UUID identifies the operation.

The API serializes each operation with a PostgreSQL advisory transaction lock and permanently records its actor, target, payload version, result category, bounded result, request ID, and processing time. Replays by the same actor return the stored result; another actor cannot claim it. Ingestion invokes the existing draft update and submission domain functions. Conflicts never use last-write-wins.

The application shell uses a narrowly scoped service worker. It caches same-origin attendance routes and static assets, never API responses or administration data. New service-worker activation is held while any local operation is pending. Synchronization is push-first and triggered explicitly, on browser connectivity restoration, or when the app becomes visible; actual authenticated API calls, not `navigator.onLine`, decide reachability.

## Consequences

- Local work is recoverable across ordinary refresh/restart but remains vulnerable to storage clearing, eviction, browser removal, private mode, and device loss.
- Offline submission means “saved on this device, waiting to sync,” never official submission.
- A full roster is sent in one request. Server validation can reject stale Workers, revoked authorization, stale versions, or duplicate/conflicting attendance without data deletion.
- Submitted corrections remain online-only.
- Processed-operation retention is not automatically pruned. A reviewed retention/reconciliation policy is required before production growth warrants cleanup.
- Physical privacy and administrative recovery of another user's stranded queue remain Koranco operational decisions.

