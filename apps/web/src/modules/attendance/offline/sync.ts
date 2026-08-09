/**
 * Attendance sync engine: drives the local outbox to the attendance sync
 * endpoint and maps outcomes (applied / already_applied / conflict / rejected,
 * HTTP 401/403/other) onto the local draft/outbox states.
 *
 * Deliberate per-domain copy of the Harvest engine in
 * `modules/harvest/offline/sync.ts` (ADR-008/ADR-009); keep the failure→state
 * mapping in lockstep. Do not generalize into a shared engine without a new
 * ADR.
 */
import { ApiError, apiRequest } from "@/lib/api/client";
import { csrfHeaders } from "@/lib/api/auth";
import type { AttendanceSession } from "@/modules/attendance/api";
import { offlineDb, type OutboxOperation } from "./db";

export type SyncOutcome =
  "synced" | "waiting" | "needs_attention" | "authentication_required";

async function send(operation: OutboxOperation) {
  return apiRequest<{
    operation_id: string;
    result: "applied" | "already_applied" | "conflict" | "rejected";
    message: string;
    session: AttendanceSession | null;
  }>("/api/v1/attendance-sessions/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify(operation.payload),
  });
}

export async function syncAttendance(ownerId: string): Promise<SyncOutcome> {
  const operations = await offlineDb.outbox
    .where("ownerId")
    .equals(ownerId)
    .filter((item) => item.state === "pending" || item.state === "syncing")
    .sortBy("sequence");
  if (!operations.length) return "synced";
  for (const operation of operations) {
    await offlineDb.outbox.update(operation.operationId, {
      state: "syncing",
      attemptCount: operation.attemptCount + 1,
    });
    await offlineDb.drafts.update(operation.aggregateId, { state: "syncing" });
    try {
      const result = await send(operation);
      if (result.result === "applied" || result.result === "already_applied") {
        await offlineDb.transaction(
          "rw",
          offlineDb.outbox,
          offlineDb.drafts,
          async () => {
            await offlineDb.outbox.delete(operation.operationId);
            await offlineDb.drafts.update(operation.aggregateId, {
              state: "synced",
              serverSessionId: result.session?.id ?? operation.aggregateId,
              baseServerVersion: result.session?.version ?? null,
              updatedAt: new Date().toISOString(),
              lastMessage: "Attendance confirmed by the server.",
            });
          },
        );
      } else {
        await offlineDb.outbox.update(operation.operationId, {
          state: "needs_attention",
          lastErrorCategory: result.result,
          lastMessage: result.message,
        });
        await offlineDb.drafts.update(operation.aggregateId, {
          state: "needs_attention",
          lastMessage: result.message,
        });
        return "needs_attention";
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await offlineDb.outbox.update(operation.operationId, {
          state: "pending",
          lastErrorCategory: "authentication_required",
          lastMessage: "Sign in as the same user to synchronize attendance.",
        });
        await offlineDb.drafts.update(operation.aggregateId, {
          state: "pending_submission",
          lastMessage: "Sign in as the same user to synchronize attendance.",
        });
        return "authentication_required";
      }
      if (error instanceof ApiError && error.status === 403) {
        await offlineDb.outbox.update(operation.operationId, {
          state: "needs_attention",
          lastErrorCategory: "authorization_revoked",
          lastMessage:
            "Attendance access is no longer available. Work remains on this device.",
        });
        await offlineDb.drafts.update(operation.aggregateId, {
          state: "needs_attention",
          lastMessage:
            "Attendance access is no longer available. Work remains on this device.",
        });
        return "needs_attention";
      }
      await offlineDb.outbox.update(operation.operationId, {
        state: "pending",
        lastErrorCategory: "temporary_connection",
        lastMessage: "Waiting for a reliable connection.",
      });
      await offlineDb.drafts.update(operation.aggregateId, {
        state: "pending_submission",
        lastMessage: "Saved on this device. Waiting to sync.",
      });
      return "waiting";
    }
  }
  return "synced";
}
