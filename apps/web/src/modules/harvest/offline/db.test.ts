import Dexie from "dexie";
import { describe, expect, it } from "vitest";

import {
  FieldOfflineDatabase,
  cacheFarmUnits,
  cachedFarmUnits,
  createLocalHarvestDraft,
  offlineDb,
  ownerHarvestDraft,
  ownerHarvestDrafts,
  queueHarvestSubmission,
  recordOfflineLease,
  saveLocalHarvestDraft,
  validOfflineLease,
} from "@/modules/attendance/offline/db";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  login_identifier: "supervisor",
  display_name: "Supervisor",
  permissions: ["attendance.record", "harvest.record"],
  role: "supervisor" as const,
  password_change_required: false,
};

const farmUnit = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  code: "BLK-1",
  name: "North Block",
  unit_type: "block" as const,
  parent_id: null,
  status: "active" as const,
  created_at: "",
  updated_at: "",
};

describe("Harvest offline database", () => {
  it("keeps FarmUnits and drafts owner-scoped and queues one stable operation", async () => {
    await recordOfflineLease(user);
    expect((await validOfflineLease(user.id, "harvest"))?.ownerId).toBe(
      user.id,
    );
    await cacheFarmUnits(user.id, [farmUnit]);
    expect(await cachedFarmUnits(user.id)).toHaveLength(1);

    const draft = await createLocalHarvestDraft(user.id);
    const saved = await saveLocalHarvestDraft(user.id, draft.id, {
      harvestDate: "2026-08-08",
      farmUnitId: farmUnit.id,
      quantity: "14",
      unit: "fruit_count",
      notes: "Device capture",
    });
    const first = await queueHarvestSubmission(user.id, saved.id);
    const replay = await queueHarvestSubmission(user.id, saved.id);

    expect(replay.operationId).toBe(first.operationId);
    expect(first.payload.harvest_record_id).toBe(saved.id);
    expect(first.payload.quantity).toBe("14");
    expect((await ownerHarvestDraft(user.id, saved.id))?.state).toBe(
      "pending_submission",
    );
    expect(
      await ownerHarvestDraft("22222222-2222-4222-8222-222222222222", saved.id),
    ).toBeNull();
    expect(await ownerHarvestDrafts(user.id)).toHaveLength(1);
    expect(await offlineDb.harvestOutbox.count()).toBe(1);
  });

  it("requires a domain-specific Harvest permission in the offline lease", async () => {
    await recordOfflineLease({
      ...user,
      permissions: ["attendance.record"],
    });

    expect(await validOfflineLease(user.id, "attendance")).not.toBeNull();
    expect(await validOfflineLease(user.id, "harvest")).toBeNull();
  });

  it("upgrades a v1 Attendance database without losing its records", async () => {
    const name = `koranco-upgrade-${crypto.randomUUID()}`;
    const versionOne = new Dexie(name);
    versionOne.version(1).stores({
      workers: "key, ownerId, [ownerId+active]",
      drafts: "id, ownerId, [ownerId+state], updatedAt",
      outbox: "operationId, ownerId, [ownerId+state], [aggregateId+sequence]",
      leases: "ownerId, expiresAt",
    });
    await versionOne.table("workers").put({
      key: `${user.id}:worker-1`,
      ownerId: user.id,
      id: "worker-1",
      worker_code: "KOR-1",
      full_name: "Existing Worker",
      active: true,
      fetchedAt: new Date().toISOString(),
    });
    versionOne.close();

    const upgraded = new FieldOfflineDatabase(name);
    await upgraded.open();
    expect(await upgraded.workers.count()).toBe(1);
    expect(await upgraded.harvestDrafts.count()).toBe(0);
    expect(upgraded.verno).toBe(2);
    upgraded.close();
    await Dexie.delete(name);
  });
});
