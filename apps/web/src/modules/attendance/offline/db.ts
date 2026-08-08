import Dexie, { type EntityTable } from "dexie";
import type { AuthenticatedUser } from "@/lib/api/auth";
import type { Worker } from "@/modules/workers/api";
import type { AttendanceSession, DraftEntry } from "@/modules/attendance/api";
import type { FarmUnit } from "@/modules/farm-structure/api";
import type { HarvestRecord, HarvestUnit } from "@/modules/harvest/api";

export const OFFLINE_LEASE_MS = 12 * 60 * 60 * 1000;
export const LOCAL_SCHEMA_VERSION = 2;
export const SYNC_PAYLOAD_VERSION = 1;
export const APP_VERSION = "0.2.0";
export const HARVEST_PAYLOAD_VERSION = 1;

export type CachedWorker = {
  key: string;
  ownerId: string;
  id: string;
  worker_code: string;
  full_name: string;
  active: boolean;
  fetchedAt: string;
};

export type LocalDraftState =
  "editing" | "pending_submission" | "syncing" | "synced" | "needs_attention";

export type LocalAttendanceDraft = {
  id: string;
  ownerId: string;
  attendanceDate: string;
  serverSessionId: string | null;
  baseServerVersion: number | null;
  entries: DraftEntry[];
  state: LocalDraftState;
  createdAt: string;
  updatedAt: string;
  payloadVersion: number;
  lastMessage: string | null;
};

export type OutboxOperation = {
  operationId: string;
  ownerId: string;
  aggregateId: string;
  sequence: number;
  operationType: "submit_snapshot";
  state: "pending" | "syncing" | "needs_attention";
  payload: {
    operation_id: string;
    operation_type: "submit_snapshot";
    target_session_id: string;
    payload_version: number;
    attendance_date: string;
    base_server_version: number | null;
    entries: DraftEntry[];
  };
  createdAt: string;
  attemptCount: number;
  lastErrorCategory: string | null;
  lastMessage: string | null;
};

export type OfflineLease = {
  ownerId: string;
  displayName: string;
  validatedAt: string;
  expiresAt: string;
  attendanceAllowed: boolean;
  harvestAllowed?: boolean;
};

export class FieldOfflineDatabase extends Dexie {
  workers!: EntityTable<CachedWorker, "key">;
  drafts!: EntityTable<LocalAttendanceDraft, "id">;
  outbox!: EntityTable<OutboxOperation, "operationId">;
  leases!: EntityTable<OfflineLease, "ownerId">;

  // Harvest-specific stores (added in schema version 2)
  harvestFarmUnits!: EntityTable<CachedFarmUnit, "key">;
  harvestDrafts!: EntityTable<LocalHarvestDraft, "id">;
  harvestOutbox!: EntityTable<HarvestOutboxOperation, "operationId">;

  constructor(name = "koranco-attendance-offline") {
    super(name);
    this.version(1).stores({
      workers: "key, ownerId, [ownerId+active]",
      drafts: "id, ownerId, [ownerId+state], updatedAt",
      outbox: "operationId, ownerId, [ownerId+state], [aggregateId+sequence]",
      leases: "ownerId, expiresAt",
    });
    this.version(LOCAL_SCHEMA_VERSION).stores({
      workers: "key, ownerId, [ownerId+active]",
      drafts: "id, ownerId, [ownerId+state], updatedAt",
      outbox: "operationId, ownerId, [ownerId+state], [aggregateId+sequence]",
      leases: "ownerId, expiresAt",
      harvestFarmUnits: "key, ownerId, id, [ownerId+fetchedAt]",
      harvestDrafts: "id, ownerId, [ownerId+state], updatedAt",
      harvestOutbox:
        "operationId, ownerId, [ownerId+state], [aggregateId+sequence]",
    });
  }
}

export const offlineDb = new FieldOfflineDatabase();
const nowIso = () => new Date().toISOString();

export async function recordOfflineLease(
  user: AuthenticatedUser,
): Promise<void> {
  const now = Date.now();
  await offlineDb.leases.put({
    ownerId: user.id,
    displayName: user.display_name,
    validatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + OFFLINE_LEASE_MS).toISOString(),
    attendanceAllowed: user.permissions.includes("attendance.record"),
    harvestAllowed: user.permissions.includes("harvest.record"),
  });
}

export async function validOfflineLease(
  ownerId?: string,
  domain: "attendance" | "harvest" = "attendance",
): Promise<OfflineLease | null> {
  const lease = ownerId
    ? await offlineDb.leases.get(ownerId)
    : await offlineDb.leases.orderBy("expiresAt").last();
  if (!lease || Date.parse(lease.expiresAt) <= Date.now()) return null;
  if (domain === "attendance" && !lease.attendanceAllowed) return null;
  if (domain === "harvest" && !lease.harvestAllowed) return null;
  return lease;
}

export async function suspendOfflineLease(ownerId: string): Promise<void> {
  const lease = await offlineDb.leases.get(ownerId);
  if (lease)
    await offlineDb.leases.put({
      ...lease,
      attendanceAllowed: false,
      harvestAllowed: false,
    });
}

export async function cacheWorkers(
  ownerId: string,
  workers: Worker[],
): Promise<string> {
  const fetchedAt = nowIso();
  await offlineDb.transaction("rw", offlineDb.workers, async () => {
    await offlineDb.workers.where("ownerId").equals(ownerId).delete();
    await offlineDb.workers.bulkPut(
      workers.map((worker) => ({
        key: `${ownerId}:${worker.id}`,
        ownerId,
        id: worker.id,
        worker_code: worker.worker_code,
        full_name: worker.full_name,
        active: worker.status === "active",
        fetchedAt,
      })),
    );
  });
  return fetchedAt;
}

export async function cachedWorkers(ownerId: string): Promise<CachedWorker[]> {
  return offlineDb.workers.where("ownerId").equals(ownerId).toArray();
}

export async function cacheServerDraft(
  ownerId: string,
  session: AttendanceSession,
): Promise<LocalAttendanceDraft> {
  const existing = await offlineDb.drafts.get(session.id);
  if (existing?.ownerId && existing.ownerId !== ownerId)
    throw new Error("Attendance belongs to another user");
  const now = nowIso();
  const local: LocalAttendanceDraft = {
    id: session.id,
    ownerId,
    attendanceDate: session.attendance_date,
    serverSessionId: session.id,
    baseServerVersion: session.version,
    entries: session.entries.map((entry) => ({
      worker_id: entry.worker_id,
      attendance_status: entry.attendance_status,
      time_in: entry.time_in,
      time_out: entry.time_out,
    })),
    state: session.status === "submitted" ? "synced" : "editing",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    payloadVersion: SYNC_PAYLOAD_VERSION,
    lastMessage: null,
  };
  await offlineDb.drafts.put(local);
  return local;
}

export async function createLocalDraft(
  ownerId: string,
  attendanceDate: string,
): Promise<LocalAttendanceDraft> {
  const lease = await validOfflineLease(ownerId);
  if (!lease) throw new Error("Offline attendance authorization has expired");
  const now = nowIso();
  const draft: LocalAttendanceDraft = {
    id: crypto.randomUUID(),
    ownerId,
    attendanceDate,
    serverSessionId: null,
    baseServerVersion: null,
    entries: [],
    state: "editing",
    createdAt: now,
    updatedAt: now,
    payloadVersion: SYNC_PAYLOAD_VERSION,
    lastMessage: null,
  };
  await offlineDb.drafts.add(draft);
  return draft;
}

export async function saveLocalDraft(
  ownerId: string,
  id: string,
  entries: DraftEntry[],
): Promise<LocalAttendanceDraft> {
  const lease = await validOfflineLease(ownerId);
  if (!lease) throw new Error("Offline attendance authorization has expired");
  const draft = await offlineDb.drafts.get(id);
  if (!draft || draft.ownerId !== ownerId)
    throw new Error("Attendance is not available for this user");
  if (draft.state !== "editing")
    throw new Error("Pending attendance cannot be casually edited");
  const updated = { ...draft, entries, updatedAt: nowIso(), lastMessage: null };
  await offlineDb.drafts.put(updated);
  return updated;
}

export async function queueSubmission(
  ownerId: string,
  id: string,
): Promise<OutboxOperation> {
  const lease = await validOfflineLease(ownerId);
  if (!lease) throw new Error("Offline attendance authorization has expired");
  return offlineDb.transaction(
    "rw",
    offlineDb.drafts,
    offlineDb.outbox,
    async () => {
      const draft = await offlineDb.drafts.get(id);
      if (!draft || draft.ownerId !== ownerId)
        throw new Error("Attendance is not available for this user");
      const existing = await offlineDb.outbox
        .where("aggregateId")
        .equals(id)
        .first();
      if (existing) return existing;
      const operationId = crypto.randomUUID();
      const operation: OutboxOperation = {
        operationId,
        ownerId,
        aggregateId: id,
        sequence: 1,
        operationType: "submit_snapshot",
        state: "pending",
        payload: {
          operation_id: operationId,
          operation_type: "submit_snapshot",
          target_session_id: id,
          payload_version: SYNC_PAYLOAD_VERSION,
          attendance_date: draft.attendanceDate,
          base_server_version: draft.baseServerVersion,
          entries: draft.entries,
        },
        createdAt: nowIso(),
        attemptCount: 0,
        lastErrorCategory: null,
        lastMessage: null,
      };
      await offlineDb.outbox.add(operation);
      await offlineDb.drafts.update(id, {
        state: "pending_submission",
        updatedAt: nowIso(),
        lastMessage: "Saved on this device. Waiting to sync.",
      });
      return operation;
    },
  );
}

export async function ownerDraft(ownerId: string, id: string) {
  const draft = await offlineDb.drafts.get(id);
  return draft?.ownerId === ownerId ? draft : null;
}

export async function ownerDrafts(ownerId: string) {
  return offlineDb.drafts
    .where("ownerId")
    .equals(ownerId)
    .reverse()
    .sortBy("updatedAt");
}

export async function pendingCount(ownerId: string) {
  return offlineDb.outbox
    .where("ownerId")
    .equals(ownerId)
    .filter((o) => o.state !== "needs_attention")
    .count();
}

export async function harvestPendingCount(ownerId: string) {
  return offlineDb.harvestOutbox
    .where("ownerId")
    .equals(ownerId)
    .filter((operation) => operation.state !== "needs_attention")
    .count();
}

export async function pendingCounts(ownerId: string) {
  const [attendance, harvest] = await Promise.all([
    pendingCount(ownerId),
    harvestPendingCount(ownerId),
  ]);
  return { attendance, harvest, total: attendance + harvest };
}

export async function hasPendingForOwner(ownerId: string) {
  const [attendance, harvest] = await Promise.all([
    offlineDb.outbox.where("ownerId").equals(ownerId).count(),
    offlineDb.harvestOutbox.where("ownerId").equals(ownerId).count(),
  ]);
  return attendance + harvest > 0;
}

export async function hasAnyPendingWork() {
  return (
    (await offlineDb.outbox.count()) > 0 ||
    (await offlineDb.harvestOutbox.count()) > 0
  );
}

// --------------------- Harvest offline stores and helpers ---------------------

export type CachedFarmUnit = {
  key: string;
  ownerId: string;
  id: string;
  code: string;
  name: string;
  unit_type: FarmUnit["unit_type"];
  active: boolean;
  fetchedAt: string;
};

export type LocalHarvestDraft = {
  id: string;
  ownerId: string;
  harvestDate: string;
  farmUnitId: string;
  quantity: string;
  unit: HarvestUnit;
  notes: string | null;
  serverRecordId: string | null;
  baseServerVersion: number | null;
  state: LocalDraftState;
  createdAt: string;
  updatedAt: string;
  payloadVersion: number;
  lastMessage: string | null;
};

export type HarvestOutboxOperation = {
  operationId: string;
  ownerId: string;
  aggregateId: string; // harvestRecord id
  sequence: number;
  operationType: "submit_harvest_snapshot";
  state: "pending" | "syncing" | "needs_attention";
  payload: {
    operation_id: string;
    operation_type: "submit_harvest_snapshot";
    harvest_record_id: string;
    payload_version: number;
    harvest_date: string;
    farm_unit_id: string;
    quantity: string;
    unit: HarvestUnit;
    notes: string | null;
    base_server_version: number | null;
  };
  createdAt: string;
  attemptCount: number;
  lastErrorCategory: string | null;
  lastMessage: string | null;
};

export async function cacheFarmUnits(
  ownerId: string,
  units: FarmUnit[],
): Promise<string> {
  const fetchedAt = nowIso();
  await offlineDb.transaction("rw", offlineDb.harvestFarmUnits, async () => {
    await offlineDb.harvestFarmUnits.where("ownerId").equals(ownerId).delete();
    await offlineDb.harvestFarmUnits.bulkPut(
      units.map((u) => ({
        key: `${ownerId}:${u.id}`,
        ownerId,
        id: u.id,
        code: u.code,
        name: u.name,
        unit_type: u.unit_type,
        active: u.status === "active",
        fetchedAt,
      })),
    );
  });
  return fetchedAt;
}

export async function cachedFarmUnits(
  ownerId: string,
): Promise<CachedFarmUnit[]> {
  return offlineDb.harvestFarmUnits.where("ownerId").equals(ownerId).toArray();
}

export async function cacheServerHarvestDraft(
  ownerId: string,
  record: HarvestRecord,
): Promise<LocalHarvestDraft> {
  const existing = await offlineDb.harvestDrafts.get(record.id);
  if (existing?.ownerId && existing.ownerId !== ownerId)
    throw new Error("Harvest belongs to another user");
  const now = nowIso();
  const local: LocalHarvestDraft = {
    id: record.id,
    ownerId,
    harvestDate: record.harvest_date,
    farmUnitId: record.farm_unit_id,
    quantity: String(record.quantity),
    unit: record.unit,
    notes: record.notes,
    serverRecordId: record.id,
    baseServerVersion: record.version,
    state: record.status === "submitted" ? "synced" : "editing",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    payloadVersion: HARVEST_PAYLOAD_VERSION,
    lastMessage: null,
  };
  await offlineDb.harvestDrafts.put(local);
  return local;
}

export async function createLocalHarvestDraft(
  ownerId: string,
): Promise<LocalHarvestDraft> {
  const lease = await validOfflineLease(ownerId, "harvest");
  if (!lease) throw new Error("Offline harvest authorization has expired");
  const now = nowIso();
  const draft: LocalHarvestDraft = {
    id: crypto.randomUUID(),
    ownerId,
    harvestDate: now.slice(0, 10),
    farmUnitId: "",
    quantity: "",
    unit: "fruit_count",
    notes: null,
    serverRecordId: null,
    baseServerVersion: null,
    state: "editing",
    createdAt: now,
    updatedAt: now,
    payloadVersion: HARVEST_PAYLOAD_VERSION,
    lastMessage: null,
  };
  await offlineDb.harvestDrafts.add(draft);
  return draft;
}

export type HarvestDraftValues = Pick<
  LocalHarvestDraft,
  "harvestDate" | "farmUnitId" | "quantity" | "unit" | "notes"
>;

export async function saveLocalHarvestDraft(
  ownerId: string,
  id: string,
  values: HarvestDraftValues,
): Promise<LocalHarvestDraft> {
  const lease = await validOfflineLease(ownerId, "harvest");
  if (!lease) throw new Error("Offline harvest authorization has expired");
  const draft = await offlineDb.harvestDrafts.get(id);
  if (!draft || draft.ownerId !== ownerId)
    throw new Error("Harvest is not available for this user");
  if (draft.state !== "editing")
    throw new Error("Pending harvest cannot be casually edited");
  const updated = {
    ...draft,
    ...values,
    updatedAt: nowIso(),
    lastMessage: null,
  };
  await offlineDb.harvestDrafts.put(updated);
  return updated;
}

export async function queueHarvestSubmission(
  ownerId: string,
  id: string,
): Promise<HarvestOutboxOperation> {
  const lease = await validOfflineLease(ownerId, "harvest");
  if (!lease) throw new Error("Offline harvest authorization has expired");
  return offlineDb.transaction(
    "rw",
    offlineDb.harvestDrafts,
    offlineDb.harvestOutbox,
    async () => {
      const draft = await offlineDb.harvestDrafts.get(id);
      if (!draft || draft.ownerId !== ownerId)
        throw new Error("Harvest is not available for this user");
      if (!draft.farmUnitId || !draft.quantity)
        throw new Error("Complete the Harvest record before submitting");
      const existing = await offlineDb.harvestOutbox
        .where("aggregateId")
        .equals(id)
        .filter((operation) => operation.ownerId === ownerId)
        .first();
      if (existing) return existing;
      const operationId = crypto.randomUUID();
      const operation: HarvestOutboxOperation = {
        operationId,
        ownerId,
        aggregateId: id,
        sequence: 1,
        operationType: "submit_harvest_snapshot",
        state: "pending",
        payload: {
          operation_id: operationId,
          operation_type: "submit_harvest_snapshot",
          harvest_record_id: id,
          payload_version: HARVEST_PAYLOAD_VERSION,
          harvest_date: draft.harvestDate,
          farm_unit_id: draft.farmUnitId,
          quantity: draft.quantity,
          unit: draft.unit,
          notes: draft.notes,
          base_server_version: draft.baseServerVersion,
        },
        createdAt: nowIso(),
        attemptCount: 0,
        lastErrorCategory: null,
        lastMessage: null,
      };
      await offlineDb.harvestOutbox.add(operation);
      await offlineDb.harvestDrafts.update(id, {
        state: "pending_submission",
        updatedAt: nowIso(),
        lastMessage: "Saved on this device. Waiting to sync.",
      });
      return operation;
    },
  );
}

export async function ownerHarvestDraft(ownerId: string, id: string) {
  const draft = await offlineDb.harvestDrafts.get(id);
  return draft?.ownerId === ownerId ? draft : null;
}

export async function ownerHarvestDrafts(ownerId: string) {
  return offlineDb.harvestDrafts
    .where("ownerId")
    .equals(ownerId)
    .reverse()
    .sortBy("updatedAt");
}
