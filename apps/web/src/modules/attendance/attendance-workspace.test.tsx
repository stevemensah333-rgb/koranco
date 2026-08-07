import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceWorkspace } from "./attendance-workspace";
import { ApiError } from "@/lib/api/client";

const push = vi.fn();
const currentSession = vi.fn();
const getAttendance = vi.fn();
const activeWorkers = vi.fn();
const saveDraft = vi.fn();
const submitAttendance = vi.fn();
const correctAttendance = vi.fn();
const attendanceAudit = vi.fn();
const discardAttendance = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api/auth", () => ({
  getCurrentSession: () => currentSession(),
}));
vi.mock("@/modules/attendance/api", () => ({
  getAttendance: (...a: unknown[]) => getAttendance(...a),
  activeWorkersForRoster: () => activeWorkers(),
  saveAttendanceDraft: (...a: unknown[]) => saveDraft(...a),
  submitAttendance: (...a: unknown[]) => submitAttendance(...a),
  correctAttendance: (...a: unknown[]) => correctAttendance(...a),
  attendanceAudit: (...a: unknown[]) => attendanceAudit(...a),
  discardAttendance: (...a: unknown[]) => discardAttendance(...a),
}));
vi.mock("@/modules/attendance/offline/db", () => ({
  cacheServerDraft: vi.fn(),
  cacheWorkers: vi.fn(),
  cachedWorkers: vi.fn(),
  ownerDraft: vi.fn(),
  queueSubmission: vi.fn(),
  saveLocalDraft: (...a: unknown[]) => saveDraft(...a),
  validOfflineLease: vi.fn(),
}));
vi.mock("@/modules/attendance/offline/sync", () => ({
  syncAttendance: async () => {
    await submitAttendance();
    getAttendance.mockResolvedValue(submitted);
    return "synced";
  },
}));

const user = {
  id: "u1",
  display_name: "Supervisor",
  login_identifier: "supervisor",
  role: "supervisor",
  password_change_required: false,
  permissions: ["attendance.read", "attendance.record", "attendance.correct"],
};
const workers = [
  { id: "w1", worker_code: "KOR-1", full_name: "Ama Worker", status: "active" },
  {
    id: "w2",
    worker_code: "KOR-2",
    full_name: "Kojo Worker",
    status: "active",
  },
];
const draft = {
  id: "s1",
  attendance_date: "2026-08-07",
  status: "draft",
  version: 1,
  created_by: "u1",
  created_by_name: "Supervisor",
  created_at: "2026-08-07T08:00:00Z",
  updated_at: "2026-08-07T08:00:00Z",
  submitted_by: null,
  submitted_by_name: null,
  submitted_at: null,
  present_count: 0,
  absent_count: 0,
  unmarked_count: 0,
  entries: [],
};
const submitted = {
  ...draft,
  status: "submitted",
  version: 3,
  submitted_by: "u1",
  submitted_by_name: "Supervisor",
  submitted_at: "2026-08-07T09:00:00Z",
  present_count: 1,
  entries: [
    {
      id: "e1",
      worker_id: "w1",
      worker_code: "KOR-1",
      worker_name: "Ama Worker",
      worker_active: true,
      attendance_status: "present",
      time_in: "08:00:00",
      time_out: null,
      version: 1,
      corrected_at: null,
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  window.confirm = vi.fn(() => true);
  currentSession.mockResolvedValue(user);
  getAttendance.mockResolvedValue(draft);
  activeWorkers.mockResolvedValue(workers);
  saveDraft.mockResolvedValue({ ...draft, version: 2 });
  attendanceAudit.mockResolvedValue({ items: [], total: 0 });
});

describe("AttendanceWorkspace draft roster", () => {
  it("renders workers with no automatic Present state and accessible controls", async () => {
    render(<AttendanceWorkspace sessionId="s1" />);
    expect(await screen.findByText("Ama Worker")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Present" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add all active workers" }),
    ).toBeInTheDocument();
  });
  it("explicitly marks all present, updates counts, and permits an exception", async () => {
    render(<AttendanceWorkspace sessionId="s1" />);
    await screen.findByText("Ama Worker");
    fireEvent.click(
      screen.getByRole("button", { name: "Add all active workers" }),
    );
    expect(
      screen.getByText(/0 present · 0 absent · 2 unmarked/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark all present" }));
    expect(
      screen.getByText(/2 present · 0 absent · 0 unmarked/),
    ).toBeInTheDocument();
    const group = screen.getByRole("group", {
      name: "Attendance for Kojo Worker",
    });
    fireEvent.click(within(group).getByRole("button", { name: "Absent" }));
    expect(
      screen.getByText(/1 present · 1 absent · 0 unmarked/),
    ).toBeInTheDocument();
  });
  it("searches roster and shows no-active-worker recovery", async () => {
    render(<AttendanceWorkspace sessionId="s1" />);
    await screen.findByText("Ama Worker");
    fireEvent.change(screen.getByLabelText("Search roster"), {
      target: { value: "KOR-2" },
    });
    expect(screen.queryByText("Ama Worker")).not.toBeInTheDocument();
    expect(screen.getByText("Kojo Worker")).toBeInTheDocument();
    activeWorkers.mockResolvedValue([]);
    render(<AttendanceWorkspace sessionId="another" />);
    expect(await screen.findByText("No active Workers")).toBeInTheDocument();
  });
  it("saves the roster as one batch before review", async () => {
    render(<AttendanceWorkspace sessionId="s1" />);
    await screen.findByText("Ama Worker");
    fireEvent.click(
      screen.getByRole("button", { name: "Add all active workers" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark all present" }));
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
    expect(saveDraft.mock.calls[0][2]).toHaveLength(2);
    expect(await screen.findByText("Review attendance")).toBeInTheDocument();
  });
});

describe("AttendanceWorkspace submission and correction", () => {
  it("confirms submission and communicates loading", async () => {
    getAttendance.mockResolvedValue({
      ...draft,
      entries: submitted.entries,
      present_count: 1,
    });
    activeWorkers.mockResolvedValue([]);
    let resolve: (value: unknown) => void = () => undefined;
    submitAttendance.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<AttendanceWorkspace sessionId="s1" />);
    await screen.findByText("Ama Worker");
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit attendance" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Submitting…" })).toBeDisabled();
    resolve(submitted);
    expect(
      await screen.findByText(
        "Attendance submitted and confirmed by the server.",
      ),
    ).toBeInTheDocument();
  });
  it("preserves review work and reports submission failure", async () => {
    getAttendance.mockResolvedValue({
      ...draft,
      entries: submitted.entries,
      present_count: 1,
    });
    activeWorkers.mockResolvedValue([]);
    submitAttendance.mockRejectedValue(new ApiError("Session changed", 409));
    render(<AttendanceWorkspace sessionId="s1" />);
    await screen.findByText("Ama Worker");
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit attendance" }));
    expect(await screen.findByText("Session changed")).toBeInTheDocument();
    expect(
      screen.getByText("Attendance saved on this device"),
    ).toBeInTheDocument();
  });
  it("shows submitted detail and requires a correction reason", async () => {
    getAttendance.mockResolvedValue(submitted);
    activeWorkers.mockResolvedValue([]);
    render(<AttendanceWorkspace sessionId="s1" />);
    expect(await screen.findByText("Submitted attendance")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Correct attendance" }));
    fireEvent.click(screen.getByRole("button", { name: "Record correction" }));
    expect(
      await screen.findByText("A correction reason is required."),
    ).toBeInTheDocument();
    expect(correctAttendance).not.toHaveBeenCalled();
  });
  it("denies the Worker application role", async () => {
    currentSession.mockResolvedValue({ permissions: ["system.status.read"] });
    render(<AttendanceWorkspace sessionId="s1" />);
    expect(
      await screen.findByText(
        "You do not have permission to access attendance.",
      ),
    ).toBeInTheDocument();
  });
});
