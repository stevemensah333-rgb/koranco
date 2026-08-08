# ADR-009: Harvest offline synchronization

- Status: Proposed
- Date: 2026-08-08
- Supersedes (on acceptance): the "Harvest is online-only" delivery boundary in [ADR-007](ADR-007-online-attendance-integrity.md) context, `docs/product/harvest.md`, and `docs/architecture/offline-sync.md`.
- Depends on: [ADR-003](ADR-003-pwa-field-strategy.md), [ADR-006](ADR-006-generic-farm-unit-hierarchy.md), [ADR-008](ADR-008-attendance-offline-synchronization.md).

> **This ADR is a proposal, not an accepted decision.** It describes a change from the current, documented online-only Harvest behavior to an offline-capable Harvest capture workflow. No product code implements it. It must be reviewed and explicitly approved by an accountable Koranco decision owner before any implementation phase begins. Until then, Harvest remains online-only exactly as ADR-007-era documentation states.

## Context

Harvest is currently online-only by deliberate decision. `docs/product/harvest.md` states Harvest "writes nothing to IndexedDB, localStorage, the attendance outbox, or the attendance sync API," and `docs/architecture/offline-sync.md` states "Harvest is intentionally online-only" and that a future phase "must define Harvest-specific snapshot equality and conflict rules and must not put Harvest payloads into the attendance endpoint or copy a second synchronization engine."

Field harvesting happens in the same low-connectivity blocks where attendance is captured. If Koranco confirms that harvest quantities must be recorded at the point of work rather than transcribed later online, the online-only boundary becomes an operational gap. Attendance already proved a durable, owner-scoped, idempotent offline protocol (ADR-008). The question this ADR answers is *how* Harvest could adopt an equivalent protocol **without** copying the attendance engine, without last-write-wins, and without inventing unconfirmed Koranco business rules.

### What already exists and is proven (ADR-008)

- A narrowly scoped Dexie database `koranco-attendance-offline` (schema version 1) with `workers`, `drafts`, `outbox`, and `leases` stores, all owner-qualified.
- A non-secret 12-hour authorization **lease** (owner ID, display name, permission flag, validated/expiry timestamps) with **no** cookie, password, verifier, or reusable token.
- A durable **outbox** with a coarse `submit_snapshot` operation carrying a stable operation UUID and a stable aggregate UUID, with states `pending` / `syncing` / `needs_attention`.
- A push-first sync engine that decides reachability with a real authenticated API call, not `navigator.onLine`, and maps results to `applied` / `already_applied` / `conflict` / `rejected`.
- A backend `attendance_sync_operations` table (migration 0006) that permanently records actor, target, payload version, result, bounded message, request ID, and processing time, serialized by a PostgreSQL advisory transaction lock, with cross-actor replay rejected. Ingestion invokes the *existing* attendance domain functions.
- A service worker that caches only same-origin attendance routes/static assets, never API responses or admin data, and **holds new SW activation while any local operation is pending**.

### What is Harvest-specific and cannot be borrowed

- Harvest payload semantics: `NUMERIC(14,3)` quantity, the provisional `fruit_count` / `kilograms` unit set, whole-number rule for `fruit_count`, positive-quantity rule, 500-char note.
- FarmUnit specificity: active unit required at submit; an active Field with active child Blocks is ambiguous and must resolve to a Block (see [ADR-006](ADR-006-generic-farm-unit-hierarchy.md)).
- HarvestRecord lifecycle: draft/submitted, optimistic version, row-lock idempotent submission, submitted records not deletable, corrections online-only with reason + before/after audit.
- Harvest duplicate reality: **multiple legitimate HarvestRecords may share the same FarmUnit and date.** FarmUnit+date is therefore *not* a uniqueness or equivalence rule.

## Decision (proposed)

Adopt offline Harvest **capture** using the same *primitives* as attendance but a **Harvest-specific** local store, sync endpoint, ingestion path, and conflict rules. Do **not** build a generic synchronization framework or command bus, and do **not** route Harvest through the attendance endpoint.

1. **Synchronizable unit (see §A):** one complete submitted Harvest snapshot per operation (`submit_harvest_snapshot`), never one operation per keystroke or field edit. Draft edits stay local; only an explicit offline submission enters the outbox.

2. **Identity (see §B, C, D):** the client generates a stable `HarvestRecord` UUID (the aggregate ID, reused as the future server record ID) and a separate stable operation UUID. The authenticated human actor is bound to the operation on first ingestion. Idempotency is keyed on the operation UUID; **equivalence** (same client-created record vs. a new legitimate record) is keyed on the HarvestRecord UUID, never on FarmUnit+date.

3. **Conflict rules (see §E):** every terminal outcome is explicit — `applied`, `already_applied`, `conflict`, or `rejected` — and **never** last-write-wins. The server always re-validates the payload as untrusted and invokes the existing Harvest domain functions (`create_draft` with a client `record_id`, then `submit_record`).

4. **Local schema (see §F, J):** extend the **existing** Dexie database `koranco-attendance-offline` to schema version 2 by **adding** Harvest stores (`harvestFarmUnits`, `harvestDrafts`, `harvestOutbox`) and **reusing** the existing `leases` store. Attendance stores are untouched. Reuse owner isolation, payload/base version fields, and the `pending`/`syncing`/`needs_attention` outbox state machine.

5. **Backend schema (see §H):** add a **new, Harvest-specific** `harvest_sync_operations` table that mirrors the shape of `attendance_sync_operations`. Do **not** generalize or rewrite migration 0006, and do **not** create a shared polymorphic processed-operation table in this phase. A shared model is only justified if a *third* offline domain appears; ADR-010 could revisit it then with evidence.

6. **API (see §I):** add `POST /api/v1/harvest-records/sync`, a domain-specific endpoint accepting exactly one `submit_harvest_snapshot` operation. No generic command bus.

7. **Shared status, separate engines (see §G, K):** a small shared connectivity/sync-status surface reports combined pending counts for Attendance **and** Harvest, and the service-worker update gate blocks activation while **either** domain has pending work. The two sync engines and ingestion paths remain separate.

8. **Still online-only (see §L):** submitted-Harvest correction, Farm Structure administration, account administration, reporting, and audit browsing remain online-only and unchanged.

## A. What exactly is a synchronizable Harvest operation?

One operation = one **complete submitted Harvest snapshot**.

- Operation type: `submit_harvest_snapshot`.
- It carries the full record values (harvest date, FarmUnit ID, quantity, unit, notes) needed to create-and-submit a single HarvestRecord in one server transaction.
- Draft creation and draft edits are **local-only** and never enter the outbox. Only an explicit "Submit" on a valid draft enqueues exactly one operation for that HarvestRecord UUID.
- This matches attendance's coarse `submit_snapshot` choice and avoids per-field operations, ordering ambiguity, and partial application.

Because each HarvestRecord is a single small aggregate (unlike an attendance roster), a device with several offline harvests holds several independent operations, each with its own HarvestRecord UUID and operation UUID. They are independent and may apply in any order.

## B. How is identity handled?

- **Stable client-generated HarvestRecord UUID** — created when the local draft is created; becomes the server `harvest_records.id` on first apply (the existing `create_draft(..., record_id=...)` parameter already supports client-supplied IDs).
- **Stable operation UUID** — generated once when the draft is submitted offline; identifies the transport operation for idempotency.
- **Authenticated human actor** — never stored offline as a credential. On ingestion the server uses the authenticated session's user as `created_by`/`submitted_by` and binds that actor to the `harvest_sync_operations` row. Replays must come from the same actor.
- **Owner isolation** — every local FarmUnit cache row, Harvest draft, and outbox operation carries `ownerId` (the application-user ID). All local queries are owner-filtered, exactly as attendance does. Another account cannot see, edit, or sync a different owner's Harvest work.
- **No offline password authentication** — capture relies solely on the non-secret 12-hour lease. Expiry preserves local work but blocks new local saves/submissions and requires same-user online reauthentication to sync.

## C. What defines idempotency?

Idempotency is keyed on the **operation UUID**, enforced in PostgreSQL.

- `harvest_sync_operations.operation_id` is unique. Ingestion takes a PostgreSQL advisory transaction lock keyed on the operation UUID (mirroring attendance) so concurrent identical operations serialize.
- First successful ingestion: create the HarvestRecord with the client `record_id`, submit it, and persist the processed-operation row with `result = applied` and a bounded result snapshot — **exactly one** HarvestRecord and **exactly one** submission audit event.
- A replay after timeout/response loss (same actor, same operation UUID) finds the stored processed-operation row and returns `already_applied` with the stored result. It does **not** create a second record or a second audit event. This holds even if the record was later corrected, because the processed-operation row is the transport receipt, independent of the record's current version.
- The existing `submit_record` is already row-lock idempotent on the HarvestRecord (it early-returns if already submitted), giving defense in depth: even if two operation UUIDs somehow targeted the same record UUID, only one submission transition and audit event occurs.

## D. What defines equivalence?

**FarmUnit + date is explicitly NOT an equivalence or uniqueness rule** — `docs/product/harvest.md` confirms multiple legitimate harvest events may occur on the same FarmUnit/date. Equivalence is decided by identity, in this order:

1. **"Has this exact operation already applied?"** — look up `harvest_sync_operations` by operation UUID. If present and same actor → `already_applied`, return stored result. If present but different actor → `rejected` (cross-actor replay).
2. **"Is a server record the same client-created HarvestRecord?"** — look up `harvest_records` by the client HarvestRecord UUID (primary key). Same UUID = the same aggregate this device created; reconcile by state (see §E). This is how a lost response followed by a fresh operation UUID is still recognized as the same record.
3. **"Is this a different legitimate record that merely shares date/FarmUnit?"** — if the operation UUID is unknown **and** the HarvestRecord UUID does not exist server-side, it is a brand-new record. Create and submit it. A pre-existing submitted record on the same FarmUnit/date is **not** a conflict and is never overwritten or merged.

There is intentionally **no** content fingerprint uniqueness for Harvest (unlike attendance's date+population fingerprint), because Koranco has not confirmed any Harvest duplicate rule. Introducing one would invent a business rule; see `docs/product/unresolved-requirements.md`.

## E. What are the conflict rules?

No last-write-wins. Each case has one explicit outcome. `applied` and `already_applied` clear the local operation; `conflict` and `rejected` move it to `needs_attention` without deleting local data; auth expiry returns it to `pending`.

| Case | Server detects | Result | Local effect |
| --- | --- | --- | --- |
| New record, valid | operation UUID unknown, record UUID absent, payload valid, FarmUnit active | `applied` | outbox row cleared; draft → `synced` |
| Target already exists, unchanged (this operation) | operation UUID present, same actor | `already_applied` | cleared; draft → `synced` (response-loss replay) |
| Target record UUID exists, already submitted by a **prior** operation | record UUID present + submitted, operation UUID new but same actor | `already_applied` (reconcile to server truth) | cleared; draft → `synced` |
| Target record UUID exists in a **different** state than the snapshot expects (e.g. corrected server-side) | record UUID present, server version ≠ snapshot base | `conflict` | `needs_attention`; show server truth, no overwrite |
| Stale base version | snapshot `base_server_version` ≠ current | `conflict` | `needs_attention` |
| FarmUnit became inactive | `require_farm_unit(operational=True)` fails (HTTP 409 semantics) | `conflict` | `needs_attention`; user must re-select active unit online |
| FarmUnit is a Field with active child Blocks (ambiguous) | `require_farm_unit` ambiguity rule | `conflict` | `needs_attention` |
| Unit no longer supported | payload unit not in approved set | `rejected` | `needs_attention` |
| Invalid quantity (≤0, or non-integer `fruit_count`) | Pydantic + DB checks | `rejected` | `needs_attention` |
| Account disabled | session invalid | HTTP 401 | stays `pending`; requires same-user reauth |
| Permission revoked (`harvest.record` removed) | authorization dependency | HTTP 403 → `rejected` category | `needs_attention`; work preserved |
| Unsupported payload version | `payload_version` unknown to server | `rejected` | `needs_attention`; not destructively migrated |
| Response lost after commit | client retries; operation UUID now present | `already_applied` | cleared; exactly one record + one audit event |
| Same operation replayed by another actor | operation UUID present, actor differs | `rejected` (cross-actor) | `needs_attention` on the other device; original owner unaffected |

## F. How is local Harvest state represented?

Minimum Harvest-specific local schema (added to the existing Dexie DB; see §J). Attendance concepts are **reused**, not duplicated:

- **FarmUnit cache** `harvestFarmUnits`: `key = "{ownerId}:{farmUnitId}"`, `ownerId`, `id`, `code`, `name`, `unit_type`, `active`, `fetchedAt`. (Harvest needs FarmUnits, not Workers, so this is a genuinely new store — attendance's `workers` store is not reusable.)
- **Harvest draft** `harvestDrafts`: `id` (client HarvestRecord UUID), `ownerId`, `harvestDate`, `farmUnitId`, `quantity` (string, to preserve decimal fidelity), `unit`, `notes`, `serverRecordId` (nullable), `baseServerVersion` (nullable), `state` (`editing`/`pending_submission`/`syncing`/`synced`/`needs_attention`), `payloadVersion`, `createdAt`, `updatedAt`, `lastMessage`.
- **Outbox operation** `harvestOutbox`: `operationId`, `ownerId`, `aggregateId` (= HarvestRecord UUID), `operationType: "submit_harvest_snapshot"`, `state` (`pending`/`syncing`/`needs_attention`), `payload { operation_id, operation_type, harvest_record_id, payload_version, harvest_date, farm_unit_id, quantity, unit, notes, base_server_version }`, `createdAt`, `attemptCount`, `lastErrorCategory`, `lastMessage`.
- **Owner identity**: `ownerId` on every row (reused concept).
- **Payload version**: `payloadVersion` / `payload_version` (reused concept; starts at 1 for Harvest).
- **Base version**: `baseServerVersion` (reused concept).
- **Local sync state**: same five draft states and three outbox states as attendance (reused vocabulary, Harvest-specific rows).
- **Lease**: the existing `leases` store is reused unchanged; the Harvest gate additionally checks the lease's permission flag reflects `harvest.record`. (See §G open item on the lease's single boolean.)

## G. What existing offline infrastructure is genuinely reusable?

**Reusable (shared primitives, no Harvest logic inside them):**

- Authorization **lease** store and its 12-hour non-secret model (shared `leases` table).
- **Owner isolation** convention (owner-qualified keys, owner-filtered queries).
- **Connectivity state** — "attempt a real authenticated request" rather than `navigator.onLine`; the shared trigger points (Sync now, `online` event, visibility restore).
- **Outbox state machine** vocabulary (`pending`/`syncing`/`needs_attention`) and the failure→pending / auth-expiry→pending / semantic-failure→needs-attention mapping.
- **Retry behavior** — user/event-driven retries, no aggressive polling.
- **Service-worker update gating** — extend the existing pending-work check to also consider Harvest pending work (§K).
- **Diagnostics** — bounded `lastErrorCategory` / `lastMessage`, `attemptCount`.
- **Combined sync-status surface** — one field-shell indicator showing total pending across both domains.

**Must remain Harvest-specific (never pushed into shared code):**

- Payload validation (quantity/unit/notes/date rules).
- Quantity/unit semantics (`NUMERIC(14,3)`, `fruit_count` whole-number rule).
- FarmUnit validation (active + Field/Block ambiguity).
- HarvestRecord lifecycle (draft/submit/version/idempotent submit).
- Harvest conflict/equivalence rules (§D, §E).
- The `harvest_sync_operations` table and `/harvest-records/sync` endpoint.

This deliberately stops short of a generic sync framework. Shared code is limited to the lease, owner-isolation helpers, connectivity/trigger utilities, the SW gate, and the status surface. Two small explicit engines are cheaper to maintain than one abstract engine with domain branches.

## H. What backend schema changes would be needed?

**Chosen option: a new Harvest-specific `harvest_sync_operations` table.** Migration 0006 is **not** rewritten and `attendance_sync_operations` is **not** generalized in this phase.

New forward migration (proposed `0008_harvest_offline_sync`) adds:

- `harvest_sync_operations`: `operation_id` (PK, UUID), `actor_user_id` (FK → application_users, RESTRICT), `harvest_record_id` (UUID; the client aggregate ID, FK → harvest_records after apply, nullable until applied or use no FK and rely on application logic — decide in Phase 1), `payload_version` (int), `result` (check-constrained: `applied`/`already_applied`/`conflict`/`rejected`), `result_message` (bounded string), `request_id` (nullable), `created_at`, `processed_at`. Unique on `operation_id`.
- The Harvest permission set already exists (migration 0007); no new permissions are required. Offline reuses `harvest.read` / `harvest.record`.

Rationale for a separate table over generalization:

- Clarity and maintainability: each table's foreign keys and result semantics map to exactly one domain; no polymorphic `entity_type` discriminator or nullable cross-domain FKs.
- Non-destructive: no risky data migration of an already-applied processed-operation table.
- Aligned with domain-boundaries.md: "Attendance-specific ingestion remains beside the attendance domain." Harvest ingestion likewise sits beside Harvest.
- A shared `processed_operations` model should be introduced **only** with a third offline domain and real duplication evidence, via its own ADR and expand/migrate/contract migration.

## I. What API shape is recommended?

**`POST /api/v1/harvest-records/sync`** — a single domain-specific endpoint.

Request body (one operation):

```
{
  "operation_id": "<uuid>",
  "operation_type": "submit_harvest_snapshot",
  "harvest_record_id": "<uuid>",
  "payload_version": 1,
  "harvest_date": "YYYY-MM-DD",
  "farm_unit_id": "<uuid>",
  "quantity": "25.000",
  "unit": "fruit_count",
  "notes": null,
  "base_server_version": null
}
```

Response:

```
{
  "operation_id": "<uuid>",
  "result": "applied" | "already_applied" | "conflict" | "rejected",
  "message": "<bounded human-readable>",
  "record": <HarvestRecordResponse | null>
}
```

- Authorized by the existing `harvest.record` permission dependency (backend authoritative).
- HTTP 401 = authentication required (stays pending); HTTP 403 = lacks permission (needs attention). Semantic outcomes use HTTP 200 with an explicit `result`, matching the attendance contract so the client mapping is familiar.
- No generic command bus; the endpoint accepts exactly one operation type and validates it as untrusted input.

## J. How does IndexedDB migrate safely?

Attendance offline data **must survive**. Dexie migrates additively.

- Keep the same database name `koranco-attendance-offline`. Bump `LOCAL_SCHEMA_VERSION` 1 → 2.
- Add a `this.version(2).stores({...})` declaration that **repeats the version-1 attendance stores unchanged** and **adds** `harvestFarmUnits`, `harvestDrafts`, `harvestOutbox`. Do not redefine or drop `workers`, `drafts`, `outbox`, or `leases`.
- No data transformation of attendance rows; Dexie preserves existing object stores across an additive upgrade. Attendance drafts, worker cache, attendance outbox, and leases are untouched.
- (Naming note: the database keeps its historical `-attendance-` name to avoid a destructive rename/migration. A future ADR may rename to `koranco-field-offline` only with a tested copy-migration; this ADR deliberately does **not** rename.)

## K. How do app updates behave?

Pending Harvest work participates in the **same** update-safety rule as pending Attendance work.

- The service worker still avoids automatic `skipWaiting`.
- The page's "any pending work?" check is extended to consider **both** attendance outbox and harvest outbox. If **either** has pending (non-`needs_attention`) operations, activation is held and the user is told synchronization is required first.
- IndexedDB schema version, application version, and Harvest payload version are explicit. Unsupported queued Harvest payloads are preserved in `needs_attention`, never destructively migrated — identical to attendance policy.

## L. What remains online-only?

Explicitly unchanged and online-only:

- Submitted-Harvest **correction** (requires reason + expected version + confirmation; append-only audit).
- Farm Structure administration.
- Account administration.
- Reporting.
- Audit browsing.

Only **new draft capture and first submission** of a HarvestRecord move offline. Everything requiring authoritative reads, cross-record integrity, or elevated authority stays online.

## M. What browser E2E scenarios are required before acceptance?

Playwright (Chromium), against the isolated `koranco_e2e` database created/reset by the existing global setup (its seed refuses any other database). All required before this ADR's implementation is accepted:

1. **Happy path across reload/offline/submit/sync:** Supervisor login → prepare FarmUnits → go offline → create Harvest → reload (draft survives) → submit offline ("Waiting to sync") → reconnect → sync → **exactly one** submitted HarvestRecord and one submission audit event.
2. **Response-loss replay:** server commits, response is dropped, client retries the same operation UUID → **exactly one** HarvestRecord and **one** audit event (`already_applied`).
3. **Cross-user isolation:** User A has pending Harvest → logout (warned) → User B login → User B cannot view, edit, or sync A's Harvest work.
4. **FarmUnit deactivated while offline:** unit deactivated on server while device offline → reconnect → sync → `needs_attention` (`conflict`), **no silent data loss**, clear operator guidance.
5. **Both domains pending:** Attendance and Harvest both have pending work → shared sync-status indicator reflects both → both synchronize correctly → SW update gate holds until both are clear.

Plus, mirroring attendance testing discipline: backend PostgreSQL integration tests for each §E outcome (idempotent apply, cross-actor rejection, stale version, inactive FarmUnit, unsupported unit/version, disabled/revoked), focused React/IndexedDB tests for the Dexie v2 migration and owner-scoped queries, and a physical-device field-test checklist analogous to `docs/operations/offline-attendance-field-test.md`. Physical-device testing remains required because desktop automation cannot reproduce OS eviction, custody, low-memory termination, or field conditions.

## Consequences

- Field users can capture harvest at the point of work; offline submission means "saved on this device, waiting to sync," never official submission.
- PostgreSQL stays authoritative; every synced payload is fully re-validated; conflicts never use last-write-wins.
- Two small, explicit sync engines and two processed-operation tables increase surface area slightly but keep each domain's rules local and auditable, avoiding a premature generic framework.
- Offline Harvest data shares device-storage risks with attendance (clearing, eviction, private mode, device loss); training must prioritize prompt sync, and no automated Manager takeover of a stranded queue exists.
- Processed Harvest operations are not auto-pruned; a reviewed retention/reconciliation policy is required before production growth warrants cleanup (same open item as attendance).
- Requires human approval and several unresolved Koranco confirmations (below) before implementation.

## Open questions / dependencies for Koranco (do not infer)

- Is offline Harvest capture actually required, and in which blocks/roles? (If "no," keep online-only and archive this ADR as rejected.)
- Are the two units (`fruit_count`, `kilograms`) confirmed, since offline devices will cache and enforce the set client-side between preparations?
- Is the 12-hour lease appropriate for Harvest field sessions, or different from attendance?
- Retention for `harvest_sync_operations` and local confirmed copies.
- Reconciliation authority for a disabled user's stranded Harvest queue.
- Whether the lease should carry per-domain permission flags rather than a single attendance boolean (implementation detail flagged for Phase 1).
