import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { offlineDb } from "@/modules/attendance/offline/db";

afterEach(async () => {
  cleanup();
  await Promise.all([
    offlineDb.workers.clear(),
    offlineDb.drafts.clear(),
    offlineDb.outbox.clear(),
    offlineDb.leases.clear(),
    offlineDb.harvestFarmUnits.clear(),
    offlineDb.harvestDrafts.clear(),
    offlineDb.harvestOutbox.clear(),
  ]);
});
