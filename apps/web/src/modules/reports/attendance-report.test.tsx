import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AttendanceReport } from "./attendance-report";

const session = vi.fn();
const getAttendanceReport = vi.fn();
vi.mock("@/lib/api/auth", () => ({ getCurrentSession: () => session() }));
vi.mock("@/modules/reports/api", () => ({
  getAttendanceReport: (...a: unknown[]) => getAttendanceReport(...a),
  buildExportUrl: () => "http://api/api/v1/reports/exports/attendance",
  downloadCsv: vi.fn(),
}));

const supervisor = {
  id: "u1",
  display_name: "Supervisor",
  login_identifier: "supervisor",
  role: "supervisor",
  password_change_required: false,
  permissions: ["reports.read", "attendance.read"],
};

const report = {
  date_from: "2026-08-01",
  date_to: "2026-08-08",
  submitted_session_count: 2,
  present_count: 14,
  absent_count: 3,
  roster_count: 17,
  by_date: [
    {
      date: "2026-08-08",
      submitted_sessions: 1,
      present_count: 10,
      absent_count: 2,
      roster_count: 12,
    },
    {
      date: "2026-08-01",
      submitted_sessions: 1,
      present_count: 4,
      absent_count: 1,
      roster_count: 5,
    },
  ],
  sessions: [
    {
      id: "s1",
      attendance_date: "2026-08-08",
      submitted_at: "2026-08-08T09:00:00",
      submitted_by_id: "u2",
      submitted_by_name: "Supervisor",
      recorded_by_name: "Manager",
      present_count: 10,
      absent_count: 2,
      roster_count: 12,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue(supervisor);
  getAttendanceReport.mockResolvedValue(report);
});

describe("AttendanceReport", () => {
  it("renders totals, the over-time chart, and the sessions table with drill-down", async () => {
    render(<AttendanceReport />);
    expect(
      await screen.findByText(
        "Period 2026-08-01 – 2026-08-08 · inclusive, submitted sessions only",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Attendance over time" }),
    ).toBeInTheDocument();
    const table = await screen.findByRole("table", {
      name: "Submitted attendance sessions in the selected range",
    });
    expect(table).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute(
      "href",
      "/attendance/s1",
    );
  });

  it("hides the export button without exports.create", async () => {
    render(<AttendanceReport />);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Export attendance CSV" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("refetches when a filter changes", async () => {
    render(<AttendanceReport />);
    await screen.findByRole("table", {
      name: "Submitted attendance sessions in the selected range",
    });
    const from = screen.getByLabelText("From");
    fireEvent.change(from, { target: { value: "2026-08-01" } });
    await waitFor(() => expect(getAttendanceReport).toHaveBeenCalledTimes(2));
  });

  it("applies a quick range preset to both date filters", async () => {
    render(<AttendanceReport />);
    await screen.findByRole("table", {
      name: "Submitted attendance sessions in the selected range",
    });
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() =>
      expect(getAttendanceReport).toHaveBeenCalledWith(
        expect.objectContaining({ dateFrom: expect.any(String) }),
      ),
    );
  });

  it("shows a no-records state for an empty range", async () => {
    getAttendanceReport.mockResolvedValue({
      ...report,
      submitted_session_count: 0,
      present_count: 0,
      absent_count: 0,
      roster_count: 0,
      by_date: [],
      sessions: [],
    });
    render(<AttendanceReport />);
    expect(
      await screen.findByText(
        "No submitted Attendance sessions match this date range.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The trend appears here after sessions are recorded/),
    ).toBeInTheDocument();
  });

  it("shows an error state on load failure", async () => {
    getAttendanceReport.mockRejectedValue(new Error("boom"));
    render(<AttendanceReport />);
    expect(
      await screen.findByText("The attendance report could not be loaded."),
    ).toBeInTheDocument();
  });
});
