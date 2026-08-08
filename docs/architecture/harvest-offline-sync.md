# Harvest offline synchronization

> **Status: Implemented (2026-08-08).** This document specifies the shipped
> protocol accepted in
> [ADR-009](../decisions/ADR-009-harvest-offline-synchronization.md). The phased
> plan is retained as implementation history; current behavior is summarized in
> [offline field synchronization](offline-sync.md).

## Scope

Offline applies **only** to new HarvestRecord **draft capture and first submission**. Correction of submitted Harvest, Farm Structure administration, account administration, reporting, and audit browsing remain online-only. PostgreSQL remains authoritative; IndexedDB is local operational storage only, never a system of record. Local payloads are untrusted and fully re-validated by the API.

This design deliberately reuses the *primitives* proven for attendance (ADR-008) — the non-secret lease, owner isolation, connectivity detection, outbox state machine, service-worker update gate — while keeping Harvest's payload, validation, lifecycle, and conflict rules entirely Harvest-specific. It does **not** introduce a generic synchronization framework, a command bus, or a shared polymorphic operations table.

## 1. The synchronizable operation

A single operation is one complete submitted Harvest snapshot.

- `operation_type`: `submit_harvest_snapshot` (the only type in payload version 1).
- Payload carries everything needed to create-and-submit one HarvestRecord in one server transaction: harvest date, FarmUnit ID, quantity, unit, notes, plus transport identity fields.
- Draft creation and edits are **local only** and never enter the outbox. Enqueuing happens exactly once, on an explicit offline "Submit" of a valid draft.
- Each HarvestRecord is an independent small aggregate. A device may hold several offline harvests, each its own operation; they apply independently and in any order.

## 2. Identity and ownership

| Identifier | Generated | Purpose |
| --- | --- | --- |
| HarvestRecord UUID | Client, at draft creation | Stable aggregate ID; becomes `harvest_records.id` on first apply. Recognizes "same record" across replays. |
| Operation UUID | Client, at offline submit | Transport idempotency key; unique in `harvest_sync_operations`. |
| Authenticated actor | Server, from session | `created_by` / `submitted_by`; bound to the operation on first apply; replays must match. |
| Owner ID | Client, from session at capture | `ownerId` on every local row; all local queries owner-filtered. |

No credential, cookie, CSRF secret, verifier, or reusable token is stored offline. Capture is authorized solely by the non-secret 12-hour lease (§6). The server always attributes records to the authenticated session actor at sync time, never to a client-asserted identity.

The existing backend already accepts a client-supplied record ID: `create_draft(db, actor, values, request_id, record_id=...)`. The offline path reuses this rather than inventing a new creation function.

## 3. Idempotency

Enforced in PostgreSQL, keyed on the operation UUID:

1. Acquire a transaction-scoped advisory lock derived from the operation UUID (same technique as attendance) so concurrent identical operations serialize.
2. Look up `harvest_sync_operations` by `operation_id`.
   - Present + same actor → return stored `result` (`already_applied`). No new record, no new audit event.
   - Present + different actor → `rejected` (cross-actor replay).
   - Absent → proceed to apply, then insert the processed-operation row inside the same transaction.
3. Applying = `create_draft(..., record_id=<HarvestRecord UUID>)` then `submit_record(...)`, both existing domain functions. `submit_record` is itself row-lock idempotent (early-returns if already submitted), so a lost response that is retried yields exactly one submission transition and one `submitted` audit event.

The processed-operation row is a transport receipt independent of the record's later version. Correcting the record afterward does not change the receipt, so replays remain `already_applied`.

## 4. Equivalence (why not FarmUnit + date)

Multiple legitimate HarvestRecords may share the same FarmUnit and date (`docs/product/harvest.md`). FarmUnit + date is therefore **never** used as an equivalence or uniqueness key. Equivalence resolves by identity, in order:

1. **Exact operation already applied?** — `harvest_sync_operations` by operation UUID (see §3).
2. **Same client-created record?** — `harvest_records` by HarvestRecord UUID (primary key). A lost response followed by a *new* operation UUID for the same record UUID is still recognized as the same aggregate and reconciled to server truth.
3. **Different legitimate record sharing date/FarmUnit?** — operation UUID unknown **and** record UUID absent ⇒ brand-new record; create and submit. A pre-existing submitted record on the same FarmUnit/date is not a conflict and is never overwritten or merged.

No content fingerprint is introduced for Harvest (attendance's date+population fingerprint is domain-specific and does not transfer), because no Harvest duplicate rule is confirmed. Adding one would invent a Koranco business rule.

## 5. Conflict outcomes

Terminal results: `applied`, `already_applied`, `conflict`, `rejected`. Never last-write-wins. `applied`/`already_applied` clear the local operation and mark the draft `synced`; `conflict`/`rejected` move it to `needs_attention` and preserve local data; auth expiry keeps it `pending`.

| Case | Detection | Result |
| --- | --- | --- |
| New valid record | op UUID unknown, record UUID absent, valid, FarmUnit active | `applied` |
| Response-loss replay (this op) | op UUID present, same actor | `already_applied` |
| Record already submitted by a prior op | record UUID present + submitted, same actor | `already_applied` (reconcile) |
| Record exists in unexpected state | record UUID present, server version ≠ base | `conflict` |
| Stale base version | `base_server_version` ≠ current | `conflict` |
| FarmUnit inactive | `require_farm_unit(operational=True)` | `conflict` |
| Field with active child Blocks (ambiguous) | FarmUnit ambiguity rule | `conflict` |
| Unit not supported | unit ∉ approved set | `rejected` |
| Invalid quantity (≤0 / non-integer fruit_count) | Pydantic + DB checks | `rejected` |
| Account disabled | invalid session | HTTP 401 → stays `pending` |
| Permission revoked | authorization dependency | HTTP 403 → `rejected` category |
| Unsupported payload version | unknown `payload_version` | `rejected` (preserved, not migrated) |
| Cross-actor replay | op UUID present, actor differs | `rejected` |

## 6. Local schema (Dexie)

Extend the existing database `koranco-attendance-offline` from schema version 1 to version 2 by **adding** stores; attendance stores are untouched (see §9).

New/added stores:

- `harvestFarmUnits` — key `"{ownerId}:{farmUnitId}"`; fields `ownerId`, `id`, `code`, `name`, `unit_type`, `active`, `fetchedAt`. Indexes: `ownerId`, `[ownerId+active]`.
- `harvestDrafts` — key `id` (HarvestRecord UUID); fields `ownerId`, `harvestDate`, `farmUnitId`, `quantity` (string for decimal fidelity), `unit`, `notes`, `serverRecordId`, `baseServerVersion`, `state`, `payloadVersion`, `createdAt`, `updatedAt`, `lastMessage`. Indexes: `ownerId`, `[ownerId+state]`, `updatedAt`.
- `harvestOutbox` — key `operationId`; fields `ownerId`, `aggregateId` (HarvestRecord UUID), `operationType`, `state`, `payload`, `createdAt`, `attemptCount`, `lastErrorCategory`, `lastMessage`. Indexes: `ownerId`, `[ownerId+state]`, `aggregateId`.

Reused stores/concepts: `leases` (unchanged), owner-isolation convention, five draft states (`editing`/`pending_submission`/`syncing`/`synced`/`needs_attention`), three outbox states (`pending`/`syncing`/`needs_attention`), `payloadVersion`, `baseServerVersion`.

Quantity is stored as a string locally and sent as a string to preserve `NUMERIC(14,3)` fidelity; the server parses to `Decimal` and enforces DB checks.

## 7. Reuse boundary

Shared primitives (no Harvest logic inside them): the lease store/model, owner-isolation helpers, connectivity detection (real authenticated request, not `navigator.onLine`) and trigger points (Sync now / `online` / visibility), the outbox state-machine vocabulary and failure→state mapping, user/event-driven retry, the service-worker update gate, bounded diagnostics, and a combined sync-status surface.

Harvest-specific (never generalized): payload validation, quantity/unit semantics, FarmUnit validation, HarvestRecord lifecycle, conflict/equivalence rules, the `harvest_sync_operations` table, and the `/harvest-records/sync` endpoint and ingestion.

Rule of thumb: shared code holds transport/plumbing; each domain owns its meaning. Two small explicit engines beat one abstract engine with domain branches.

## 8. API and backend schema

Endpoint: `POST /api/v1/harvest-records/sync`, authorized by the existing `harvest.record` permission. Accepts exactly one `submit_harvest_snapshot` operation; validates it as untrusted input. HTTP 401 = auth required (pending); HTTP 403 = lacks permission (needs attention); semantic outcomes are HTTP 200 with explicit `result` (mirrors attendance so the client mapping is familiar).

Backend table (forward migration `0008_harvest_offline_sync`): `harvest_sync_operations` mirroring `attendance_sync_operations` — `operation_id` PK/unique, `actor_user_id` FK (RESTRICT), `harvest_record_id`, `payload_version`, `result` (checked), `result_message` (bounded), `request_id`, `created_at`, `processed_at`. Migration 0006 is **not** rewritten; `attendance_sync_operations` is **not** generalized. A shared processed-operation model is deferred until a third offline domain justifies it with evidence.

## 9. IndexedDB migration safety

- Same DB name `koranco-attendance-offline`; bump `LOCAL_SCHEMA_VERSION` 1 → 2.
- `this.version(2).stores({...})` repeats the v1 attendance stores verbatim and adds the three Harvest stores. Dexie preserves existing object stores on an additive upgrade, so attendance drafts, worker cache, attendance outbox, and leases survive with no transformation.
- The DB is intentionally **not** renamed (a rename would be a destructive copy-migration). A future ADR may rename to a neutral `koranco-field-offline` with a tested migration.

## 10. Application-update safety

- No automatic `skipWaiting`.
- The existing "any pending work?" gate is extended to consider **both** attendance and harvest outboxes. If either has pending (non-`needs_attention`) work, activation is held and the user is told to synchronize first.
- Schema version, app version, and Harvest payload version are explicit. Unsupported queued Harvest payloads are preserved in `needs_attention`, never destructively migrated.

## 11. Field UX expectations

Phone-first, high-contrast, large targets, minimal typing, explicit connectivity/sync state, obvious outcomes (per `docs/design/principles.md`). Offline submission is labelled "Saved on this device. Waiting to sync." and is never presented as official submission. `needs_attention` states show plain-language guidance (e.g., "The selected block is no longer active — reconnect and choose an active block") without discarding entered values. A combined indicator shows total pending across Attendance and Harvest.

## 12. Test plan (required before acceptance)

Backend PostgreSQL integration tests, one per §5 outcome, mirroring the attendance suite naming, e.g.:

- `test_harvest_sync_applies_and_replays_after_response_loss_and_audits_once`
- `test_harvest_sync_rejects_cross_actor_replay_and_unsupported_version`
- `test_harvest_sync_conflicts_on_stale_version_and_inactive_farm_unit`
- `test_harvest_sync_stops_for_disabled_account_or_removed_permission`

Frontend Vitest/RTL + fake-IndexedDB: owner-scoped draft/outbox queries, Dexie v1→v2 additive migration preserving attendance data, offline submit labeling, and `needs_attention` presentation.

Playwright (Chromium) against the isolated `koranco_e2e` database (global setup creates/resets only that DB; the Python seed refuses any other database):

1. Supervisor login → prepare FarmUnits → offline → create Harvest → reload → submit offline → reconnect → sync → exactly one submitted HarvestRecord + one audit event.
2. Server commits, response lost, retry → exactly one HarvestRecord and one audit event.
3. User A pending Harvest → logout → User B login → B cannot access/sync A's work.
4. FarmUnit deactivated while offline → reconnect → `needs_attention` (`conflict`), no silent data loss.
5. Attendance and Harvest both pending → shared sync status → both handled → update gate holds until both clear.

Physical-device checklist analogous to `docs/operations/offline-attendance-field-test.md` (a new `docs/operations/offline-harvest-field-test.md` in Phase 4), because desktop automation cannot reproduce OS eviction, custody, low-memory termination, or field conditions.

## 13. Completed implementation phases

Each phase ended with the applicable formatter, linter, type checker, tests, and build green (Ruff + Mypy strict for API; Prettier + ESLint + strict TS + Vitest for web), per `docs/development/testing-strategy.md`.

- **Phase 0 — Approval and confirmations (no code).** Koranco accepts ADR-009 and answers its open questions: is offline Harvest required and for which roles/blocks; are the two units confirmed; lease duration; retention for `harvest_sync_operations`; reconciliation authority for stranded queues; per-domain lease flag. Update ADR-009 status to Accepted or Rejected.
- **Phase 1 — Backend sync endpoint + processed-operation table.** Alembic `0008_harvest_offline_sync` (`harvest_sync_operations`). Harvest sync ingestion service reusing `create_draft(record_id=...)` + `submit_record`, advisory-lock idempotency, cross-actor rejection, explicit result mapping. `POST /api/v1/harvest-records/sync` with `harvest.record` authorization. Backend integration tests for every §5 outcome. Decide the `harvest_record_id` FK nullability question here.
- **Phase 2 — Dexie v2 + local Harvest store.** Additive v2 migration adding the three Harvest stores; owner-scoped helpers for FarmUnit cache, draft CRUD, outbox enqueue. Vitest/fake-IndexedDB tests including the migration-preserves-attendance case.
- **Phase 3 — Harvest sync engine + field UI.** Separate Harvest sync engine reusing shared connectivity/trigger/lease/status primitives; offline-capable Harvest capture UI (prepare FarmUnits, create/edit draft, submit offline, needs-attention handling); combined sync-status surface; extend the SW update gate to include Harvest pending work. Vitest component tests.
- **Phase 4 — E2E + field validation + docs flip.** Playwright scenarios 1–5. New `docs/operations/offline-harvest-field-test.md`. Flip the "not yet implemented" banners in this file, `offline-sync.md`, and `harvest.md` to reflect shipped behavior, and update ADR-009 consequences with anything learned. Reassess whether a shared processed-operation model is now justified (candidate ADR-010).

## 14. Risks and limits

- Browser storage is unencrypted and can be lost (clearing, eviction, private mode, uninstall, device loss). Training must prioritize prompt sync; no automated Manager takeover of a stranded queue exists (an unresolved Koranco decision).
- Client-side unit enforcement between preparations depends on the provisional unit set; if Koranco changes units, cached devices must re-prepare. Payload versioning protects against silently accepting stale shapes.
- Two engines and two tables add surface area; the alternative (a premature generic framework) was rejected as higher long-term cost and less auditable.
- Processed-operation growth needs a reviewed retention policy before production scale (shared open item with attendance).
