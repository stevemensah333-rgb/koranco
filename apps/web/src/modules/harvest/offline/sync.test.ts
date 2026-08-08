import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentSession } from "@/lib/api/auth";
import {
  createLocalHarvestDraft,
  offlineDb,
  queueHarvestSubmission,
  recordOfflineLease,
  saveLocalHarvestDraft,
} from "@/modules/attendance/offline/db";
import { syncHarvest } from "./sync";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  login_identifier: "supervisor",
  display_name: "Supervisor",
  permissions: ["harvest.record"],
  role: "supervisor" as const,
  password_change_required: false,
};

async function hydrateAuthenticatedSession() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      jsonResponse({
        ...user,
        csrf_token: "test-csrf-token",
      }),
    ),
  );
  await getCurrentSession();
}

async function queuedHarvest() {
  await hydrateAuthenticatedSession();
  await recordOfflineLease(user);
  const draft = await createLocalHarvestDraft(user.id);
  await saveLocalHarvestDraft(user.id, draft.id, {
    harvestDate: "2026-08-08",
    farmUnitId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    quantity: "12",
    unit: "fruit_count",
    notes: null,
  });
  const operation = await queueHarvestSubmission(user.id, draft.id);
  return { draft, operation };
}

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Harvest synchronization", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("removes an applied operation and marks its draft server-confirmed", async () => {
    const { draft, operation } = await queuedHarvest();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          operation_id: operation.operationId,
          result: "applied",
          message: "Harvest synchronized and confirmed.",
          record: {
            id: draft.id,
            harvest_date: "2026-08-08",
            farm_unit_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            quantity: "12.000",
            unit: "fruit_count",
            notes: null,
            version: 2,
          },
        }),
      ),
    );

    expect(await syncHarvest(user.id)).toBe("synced");
    expect(await offlineDb.harvestOutbox.count()).toBe(0);
    expect((await offlineDb.harvestDrafts.get(draft.id))?.state).toBe("synced");
    expect(
      (await offlineDb.harvestDrafts.get(draft.id))?.baseServerVersion,
    ).toBe(2);
  });

  it("keeps work pending after a temporary connection failure", async () => {
    const { draft } = await queuedHarvest();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("network unavailable")),
    );

    expect(await syncHarvest(user.id)).toBe("waiting");
    expect(await offlineDb.harvestOutbox.count()).toBe(1);
    expect((await offlineDb.harvestDrafts.get(draft.id))?.state).toBe(
      "pending_submission",
    );
  });

  it("preserves rejected work in an explicit needs-attention state", async () => {
    const { draft, operation } = await queuedHarvest();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          operation_id: operation.operationId,
          result: "conflict",
          message: "The selected FarmUnit is inactive",
          record: null,
        }),
      ),
    );

    expect(await syncHarvest(user.id)).toBe("needs_attention");
    expect((await offlineDb.harvestOutbox.toArray())[0]?.state).toBe(
      "needs_attention",
    );
    expect((await offlineDb.harvestDrafts.get(draft.id))?.lastMessage).toBe(
      "The selected FarmUnit is inactive",
    );
  });

  it("requires the same authenticated user without discarding the queue", async () => {
    const { draft } = await queuedHarvest();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: { message: "Authentication required" } }, 401),
        ),
    );

    expect(await syncHarvest(user.id)).toBe("authentication_required");
    expect(await offlineDb.harvestOutbox.count()).toBe(1);
    expect((await offlineDb.harvestDrafts.get(draft.id))?.state).toBe(
      "pending_submission",
    );
  });
});
