# Offline Synchronization — Maintainer Guide

This is the operator/maintainer-oriented view of offline capture and sync for
Attendance and Harvest. It explains **why** each mechanism exists and how the
pieces fit together. Protocol details and the full outcome table live in
[offline field synchronization](../architecture/offline-sync.md),
[harvest offline sync](../architecture/harvest-offline-sync.md), and
[ADR-008](../decisions/ADR-008-attendance-offline-synchronization.md) /
[ADR-009](../decisions/ADR-009-harvest-offline-synchronization.md).

## Why offline exists

Field work happens where connectivity is intermittent. The offline path lets a
Supervisor/Manager capture Attendance rosters and new Harvest records on a
phone, queue them locally, and submit them later — without ever treating the
device as the system of record. PostgreSQL remains authoritative; the API
fully re-validates every queued operation at sync time.

## The pieces and where they live

| Piece | Purpose | Location |
| --- | --- | --- |
| IndexedDB stores | Local capture/queue, per-owner rows | `apps/web/src/modules/attendance/offline/db.ts` (both domains, historical name) |
| Local states | `editing`, `pending_submission`, `syncing`, `synced`, `needs_attention` | draft rows |
| Outbox | Durable operation queue; states `pending`, `syncing`, `needs_attention` | `outbox` / `harvestOutbox` stores |
| Lease | 12-hour non-secret authorization for capture | `leases` store |
| Sync engines | Drive outbox → API → map outcome → state | `modules/attendance/offline/sync.ts`, `modules/harvest/offline/sync.ts` |
| Sync endpoints | Ingest one operation, idempotently | `POST /api/v1/attendance-sessions/sync`, `POST /api/v1/harvest-records/sync` |
| Processed-operation tables | Durable transport receipts | `attendance_sync_operations`, `harvest_sync_operations` |
| Service worker | Caches field routes; gates updates while work is pending | `apps/web/src/components/pwa-registrar.tsx` |

The two domains are **deliberately parallel but separate** — separate outboxes,
sync engines, endpoints, and tables, sharing only the lease, owner-isolation
convention, connectivity triggers, and the update gate. Do not generalize them
into a shared sync framework without a new ADR (a third offline domain is not
confirmed).

## Lease (why capture is possible offline)

On every successful login/session check, the API session's user and
permission flags are stored in IndexedDB as a non-secret lease
(`recordOfflineLease` in `lib/api/auth.ts`). It expires after 12 hours and is
**not** a credential: no password, token, or cookie is stored. The lease only
permits *capture*; *synchronization* always requires a live authenticated
session. Revoked permissions or a suspended lease block new local saves and
sync, and preserved work moves to `needs_attention`.

## Operation identity and idempotency

Each queued submission carries two stable UUIDs:

- **Operation UUID** — generated once at offline submit; the transport
  idempotency key. The server acquires a transaction-scoped advisory lock
  derived from it, then consults the processed-operation table:
  - row present + same actor → replay the stored result (`already_applied`);
  - row present + different actor → `rejected` (cross-actor replay);
  - row absent → apply inside the same transaction and store the receipt.
- **Aggregate UUID** — Attendance `target_session_id` / Harvest
  `harvest_record_id`. For Harvest this becomes the record's primary key, so a
  *new* operation for the same record after a lost response is still
  recognized (`already_applied`).

Consequences: response-loss retries, double-taps, and concurrent identical
operations produce exactly one business fact and one audit event. Nothing is
last-write-wins; conflicts preserve local data.

## Owner isolation

Every local row carries `ownerId`; every query is owner-filtered. The server
binds each operation to the authenticated actor on first ingestion and rejects
cross-actor replay. Logging out warns about pending work, preserves it, and
suspends that user's lease; another account cannot view, edit, or sync it.
(Separate device-level boundaries: the browser origin is the trust boundary —
see `docs/architecture/offline-sync.md` §Security.)

## State machine

```
                     ┌───────────────┐
  create / edit ───▶ │   editing     │
                     └───────┬───────┘
                             │  offline "Submit" (enqueues one outbox op)
                             ▼
   network down / 401 ──────► ┌──────────────────┐
  (stays queued, no data loss)│ pending_submission│
                             └───────┬──────────┘
                                     │ sync triggered:
                                     │  "Sync now" / browser online / visibility
                                     ▼
                             ┌───────────────┐
                             │   syncing     │   (outbox row: pending → syncing)
                             └───────┬───────┘
                                     │ server result
        ┌────────────────────────────┼──────────────────────────────┐
        ▼                            ▼                              ▼
  applied /                    conflict /                      HTTP 401
  already_applied              rejected / HTTP 403             (auth expired)
        │                            │                              │
        ▼                            ▼                              ▼
  ┌───────────────┐           ┌────────────────┐            back to
  │    synced     │           │ needs_attention │           pending_submission
  │ (outbox row   │           │ (data kept;     │           (same user must
  │  deleted)     │           │  user reviews)  │            sign in again)
  └───────────────┘           └────────────────┘
```

- **`applied` / `already_applied`** → outbox row deleted; draft marked
  `synced` with the server-confirmed values.
- **`conflict` / `rejected` / HTTP 403** → operation and draft marked
  `needs_attention`; the local payload is preserved with the server's message
  (e.g. "the selected block is no longer active"). Nothing is discarded or
  silently overwritten.
- **HTTP 401** → stays/pending so the same user can sign in and resume.
- **Network/timeout errors** → operation returns to `pending`, draft to
  `pending_submission`; retries are user/event-driven, not aggressive polling.

## Service-worker update gating

New service-worker activation is held while **either** domain has queued
(non-`needs_attention`) work, so an update never strands a half-migrated queue.
`needs_attention` work also blocks activation. Payload and local schema
versions are explicit; unsupported queued payloads are preserved in
`needs_attention`, never silently migrated or dropped.

## Retry and failure behavior in one table

| Situation | Result | Local effect |
| --- | --- | --- |
| Response lost after server commit | `already_applied` on retry | draft → `synced` |
| Double-tap / duplicate operation UUID | `already_applied` | draft → `synced` |
| New valid operation | `applied` | draft → `synced` |
| Stale base version / changed server draft | `conflict` | `needs_attention` |
| Inactive or ambiguous FarmUnit (Harvest) | `conflict` | `needs_attention` |
| Worker inactive (Attendance) / invalid payload | `rejected` | `needs_attention` |
| Unsupported payload version | `rejected` | `needs_attention` (preserved) |
| Cross-actor replay | `rejected` | `needs_attention` |
| Account disabled | HTTP 401 | stays `pending` |
| Permission revoked | HTTP 403 | `needs_attention` |
| Network/timeout | — | back to `pending` |

## Diagnosing a sync problem (quick path)

1. Device-side: check the combined pending indicator and the draft/outbox
   state (`needs_attention` shows the server message).
2. Server-side: look up the operation by UUID in
   `attendance_sync_operations` / `harvest_sync_operations`
   (`result_status`, `result_data`, `actor_user_id`, `processed_at`).
3. Check the user's lease (`leases` store) and whether the account is active
   and still holds `attendance.record` / `harvest.record`.
4. Follow [troubleshooting.md](troubleshooting.md) "user cannot sync" and
   [incident-response.md](incident-response.md) §F for backlogs.

## Operational limits to keep in mind

- Browser storage is unencrypted and can be lost (clear, eviction, uninstall,
  device loss); training must emphasize prompt synchronization.
- Processed-operation tables grow indefinitely — retention is an open Koranco
  decision; monitor growth before production scale.
- No automated Manager takeover of another user's stranded queue exists yet.
