import { describe, expect, it, vi } from "vitest";
import { getCurrentSession } from "@/lib/api/auth";
import {
  createLocalDraft,
  offlineDb,
  queueSubmission,
  recordOfflineLease,
  saveLocalDraft,
} from "./db";
import { syncAttendance } from "./sync";

const ownerId = "11111111-1111-4111-8111-111111111111";

async function hydrateAuthenticatedSession() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: ownerId,
          login_identifier: "supervisor",
          display_name: "Supervisor",
          permissions: ["attendance.record"],
          role: "supervisor",
          password_change_required: false,
          csrf_token: "test-csrf-token",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
  await getCurrentSession();
}

async function queuedOperation() {
  await hydrateAuthenticatedSession();
  await recordOfflineLease({
    id: ownerId,
    login_identifier: "supervisor",
    display_name: "Supervisor",
    permissions: ["attendance.record"],
    role: "supervisor",
    password_change_required: false,
  });
  const draft = await createLocalDraft(ownerId, "2026-08-07");
  await saveLocalDraft(ownerId, draft.id, [
    {
      worker_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      attendance_status: "present",
      time_in: null,
      time_out: null,
    },
  ]);
  const operation = await queueSubmission(ownerId, draft.id);
  return { draft, operation };
}

describe("attendance synchronization coordinator", () => {
  it("applies a queued snapshot and clears the durable operation", async () => {
    const { draft, operation } = await queuedOperation();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            operation_id: operation.operationId,
            result: "applied",
            message: "Confirmed",
            session: { id: draft.id, version: 3 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    expect(await syncAttendance(ownerId)).toBe("synced");
    expect(await offlineDb.outbox.count()).toBe(0);
    expect((await offlineDb.drafts.get(draft.id))?.state).toBe("synced");
  });

  it("returns transient failures to pending without losing the snapshot", async () => {
    const { draft } = await queuedOperation();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("network unavailable")),
    );
    expect(await syncAttendance(ownerId)).toBe("waiting");
    expect(await offlineDb.outbox.count()).toBe(1);
    expect((await offlineDb.drafts.get(draft.id))?.state).toBe(
      "pending_submission",
    );
  });

  it("distinguishes authentication from revoked authorization", async () => {
    await queuedOperation();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: "Authentication required" },
            request_id: "test",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    expect(await syncAttendance(ownerId)).toBe("authentication_required");
    const operation = (await offlineDb.outbox.toArray())[0];
    expect(operation.lastErrorCategory).toBe("authentication_required");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: "Permission denied" },
            request_id: "test",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    expect(await syncAttendance(ownerId)).toBe("needs_attention");
    expect((await offlineDb.outbox.toArray())[0].state).toBe("needs_attention");
  });
});
