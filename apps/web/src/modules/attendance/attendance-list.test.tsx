import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AttendanceList } from "./attendance-list";
const push = vi.fn();
const session = vi.fn();
const list = vi.fn();
const create = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api/auth", () => ({ getCurrentSession: () => session() }));
vi.mock("@/modules/attendance/api", () => ({
  listAttendance: (...a: unknown[]) => list(...a),
  activeWorkersForRoster: vi.fn(),
}));
vi.mock("@/modules/attendance/offline/db", () => ({
  cacheWorkers: vi.fn(),
  cachedWorkers: vi.fn().mockResolvedValue([]),
  createLocalDraft: (...a: unknown[]) => create(...a),
  ownerDrafts: vi.fn().mockResolvedValue([]),
  validOfflineLease: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({
    id: "u1",
    display_name: "Supervisor",
    login_identifier: "supervisor",
    role: "supervisor",
    password_change_required: false,
    permissions: ["attendance.read", "attendance.record", "workers.read"],
  });
  list.mockResolvedValue({
    items: [
      {
        id: "s1",
        attendance_date: "2026-08-07",
        status: "draft",
        created_by_name: "Supervisor",
        submitted_by_name: null,
        submitted_at: null,
        entry_count: 12,
      },
    ],
    total: 1,
  });
  create.mockResolvedValue({ id: "new" });
});
it("lists sessions and starts an explicit dated draft", async () => {
  render(<AttendanceList />);
  expect(
    await screen.findByRole("table", { name: "Attendance sessions" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Start draft" }));
  await waitFor(() => expect(create).toHaveBeenCalled());
  expect(push).toHaveBeenCalledWith("/attendance/new");
});
it("is available to a read-only attendance user without start action", async () => {
  session.mockResolvedValue({
    id: "u1",
    display_name: "Supervisor",
    login_identifier: "supervisor",
    role: "supervisor",
    password_change_required: false,
    permissions: ["attendance.read"],
  });
  render(<AttendanceList />);
  await screen.findByRole("table", { name: "Attendance sessions" });
  expect(
    screen.queryByRole("button", { name: "Start draft" }),
  ).not.toBeInTheDocument();
});
