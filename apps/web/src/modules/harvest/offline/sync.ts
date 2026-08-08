import { csrfHeaders } from "@/lib/api/auth";
import { ApiError, apiRequest } from "@/lib/api/client";
import type { HarvestRecord } from "@/modules/harvest/api";
import {
  offlineDb,
  type HarvestOutboxOperation,
} from "@/modules/attendance/offline/db";

export type HarvestSyncOutcome =
  "synced" | "waiting" | "needs_attention" | "authentication_required";

type HarvestSyncResponse = {
  operation_id: string;
  result: "applied" | "already_applied" | "conflict" | "rejected";
  message: string;
  record: HarvestRecord | null;
};

function send(operation: HarvestOutboxOperation) {
  return apiRequest<HarvestSyncResponse>("/api/v1/harvest-records/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify(operation.payload),
  });
}

async function preserveForAttention(
  operation: HarvestOutboxOperation,
  category: string,
  message: string,
) {
  await offlineDb.transaction(
    "rw",
    offlineDb.harvestOutbox,
    offlineDb.harvestDrafts,
    async () => {
      await offlineDb.harvestOutbox.update(operation.operationId, {
        state: "needs_attention",
        lastErrorCategory: category,
        lastMessage: message,
      });
      await offlineDb.harvestDrafts.update(operation.aggregateId, {
        state: "needs_attention",
        updatedAt: new Date().toISOString(),
        lastMessage: message,
      });
    },
  );
}

export async function syncHarvest(
  ownerId: string,
): Promise<HarvestSyncOutcome> {
  const operations = await offlineDb.harvestOutbox
    .where("ownerId")
    .equals(ownerId)
    .filter(
      (operation) =>
        operation.state === "pending" || operation.state === "syncing",
    )
    .sortBy("createdAt");
  if (!operations.length) return "synced";

  for (const operation of operations) {
    await offlineDb.harvestOutbox.update(operation.operationId, {
      state: "syncing",
      attemptCount: operation.attemptCount + 1,
    });
    await offlineDb.harvestDrafts.update(operation.aggregateId, {
      state: "syncing",
    });

    try {
      const result = await send(operation);
      if (result.result === "applied" || result.result === "already_applied") {
        await offlineDb.transaction(
          "rw",
          offlineDb.harvestOutbox,
          offlineDb.harvestDrafts,
          async () => {
            await offlineDb.harvestOutbox.delete(operation.operationId);
            await offlineDb.harvestDrafts.update(operation.aggregateId, {
              state: "synced",
              serverRecordId: result.record?.id ?? operation.aggregateId,
              baseServerVersion: result.record?.version ?? null,
              harvestDate:
                result.record?.harvest_date ?? operation.payload.harvest_date,
              farmUnitId:
                result.record?.farm_unit_id ?? operation.payload.farm_unit_id,
              quantity: result.record?.quantity ?? operation.payload.quantity,
              unit: result.record?.unit ?? operation.payload.unit,
              notes: result.record?.notes ?? operation.payload.notes,
              updatedAt: new Date().toISOString(),
              lastMessage: "Harvest confirmed by the server.",
            });
          },
        );
        continue;
      }

      await preserveForAttention(operation, result.result, result.message);
      return "needs_attention";
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        const message = "Sign in as the same user to synchronize Harvest.";
        await offlineDb.harvestOutbox.update(operation.operationId, {
          state: "pending",
          lastErrorCategory: "authentication_required",
          lastMessage: message,
        });
        await offlineDb.harvestDrafts.update(operation.aggregateId, {
          state: "pending_submission",
          lastMessage: message,
        });
        return "authentication_required";
      }
      if (error instanceof ApiError && error.status === 403) {
        await preserveForAttention(
          operation,
          "authorization_revoked",
          "Harvest access is no longer available. Work remains on this device.",
        );
        return "needs_attention";
      }
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        await preserveForAttention(operation, "invalid_payload", error.message);
        return "needs_attention";
      }

      await offlineDb.harvestOutbox.update(operation.operationId, {
        state: "pending",
        lastErrorCategory: "temporary_connection",
        lastMessage: "Waiting for a reliable connection.",
      });
      await offlineDb.harvestDrafts.update(operation.aggregateId, {
        state: "pending_submission",
        lastMessage: "Saved on this device. Waiting to sync.",
      });
      return "waiting";
    }
  }

  return "synced";
}
