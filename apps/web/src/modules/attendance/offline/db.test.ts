import { describe, expect, it } from "vitest";
import {
  cacheWorkers,
  cachedWorkers,
  createLocalDraft,
  offlineDb,
  ownerDraft,
  ownerDrafts,
  queueSubmission,
  recordOfflineLease,
  saveLocalDraft,
  suspendOfflineLease,
  validOfflineLease,
} from "./db";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  login_identifier: "supervisor",
  display_name: "Supervisor",
  permissions: ["attendance.record"],
  role: "supervisor" as const,
  password_change_required: false,
};

describe("attendance offline database", () => {
  it("creates the schema, records a bounded lease, and isolates owners", async () => {
    await recordOfflineLease(user);
    expect((await validOfflineLease(user.id))?.ownerId).toBe(user.id);
    const draft = await createLocalDraft(user.id, "2026-08-07");
    expect(await ownerDraft(user.id, draft.id)).not.toBeNull();
    expect(
      await ownerDraft("22222222-2222-4222-8222-222222222222", draft.id),
    ).toBeNull();
    expect(await ownerDrafts(user.id)).toHaveLength(1);
    await suspendOfflineLease(user.id);
    expect(await validOfflineLease(user.id)).toBeNull();
    expect(await ownerDraft(user.id, draft.id)).not.toBeNull();
  });

  it("persists a roster and one coarse ordered submission operation", async () => {
    await recordOfflineLease(user);
    const draft = await createLocalDraft(user.id, "2026-08-07");
    await saveLocalDraft(user.id, draft.id, [
      {
        worker_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        attendance_status: "present",
        time_in: "08:00",
        time_out: null,
      },
    ]);
    const first = await queueSubmission(user.id, draft.id);
    const replay = await queueSubmission(user.id, draft.id);
    expect(replay.operationId).toBe(first.operationId);
    expect(first.sequence).toBe(1);
    expect(first.payload.entries).toHaveLength(1);
    expect((await offlineDb.drafts.get(draft.id))?.state).toBe(
      "pending_submission",
    );
  });

  it("caches a 150 Worker roster in one preparation boundary", async () => {
    const workers = Array.from({ length: 150 }, (_, index) => ({
      id: crypto.randomUUID(),
      worker_code: `KOR-${index}`,
      full_name: `Worker ${index}`,
      status: "active" as const,
      created_at: "",
      updated_at: "",
    }));
    await cacheWorkers(user.id, workers);
    expect(await cachedWorkers(user.id)).toHaveLength(150);
  });
});
