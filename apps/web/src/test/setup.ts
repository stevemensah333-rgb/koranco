import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { clearAuthenticatedClientSession } from "@/lib/api/auth";
import { offlineDb } from "@/modules/attendance/offline/db";

// The application shell uses Next navigation hooks (Link, useRouter). Most
// page tests do not exercise navigation directly, so provide a stable stub so
// the shell can render without each test file declaring its own mock. Tests
// that need to assert on navigation replace this with their own vi.mock.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
}));

// Sign-out confirms before discarding unsynced offline work; default to
// proceeding in unit tests. Individual tests can override as needed.
beforeEach(() => {
  window.confirm = vi.fn(() => true);
});

afterEach(async () => {
  cleanup();
  clearAuthenticatedClientSession();
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
