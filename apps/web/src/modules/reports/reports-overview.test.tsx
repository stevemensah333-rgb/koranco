import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportsOverview } from "./reports-overview";

const session = vi.fn();
const getOverview = vi.fn();
const downloadCsv = vi.fn();
vi.mock("@/lib/api/auth", () => ({ getCurrentSession: () => session() }));
vi.mock("@/modules/reports/api", () => ({
  getOverview: (...a: unknown[]) => getOverview(...a),
  buildExportUrl: () => "http://api/api/v1/reports/exports/attendance",
  downloadCsv: (...a: unknown[]) => downloadCsv(...a),
}));

const manager = {
  id: "u1",
  display_name: "Manager",
  login_identifier: "manager",
  role: "manager",
  password_change_required: false,
  permissions: [
    "reports.read",
    "exports.create",
    "attendance.read",
    "harvest.read",
  ],
};
const supervisor = {
  ...manager,
  role: "supervisor",
  permissions: ["reports.read"],
};
const worker = { ...manager, role: "worker", permissions: [] };

const overviewData = {
  date: "2026-08-08",
  attendance: {
    submitted_sessions: 2,
    present_count: 14,
    absent_count: 3,
    roster_count: 17,
  },
  harvest: {
    submitted_records: 3,
    by_unit: [
      { unit: "fruit_count", record_count: 2, quantity: "12450.000" },
      { unit: "kilograms", record_count: 1, quantity: "840.500" },
    ],
  },
  recent_attendance: [
    {
      id: "s1",
      attendance_date: "2026-08-08",
      submitted_by_name: "Supervisor",
      submitted_at: "2026-08-08T09:00:00",
      present_count: 10,
      absent_count: 2,
      roster_count: 12,
    },
  ],
  recent_harvest: [
    {
      id: "r1",
      harvest_date: "2026-08-08",
      farm_unit_id: "f1",
      farm_unit_code: "BLOCK-1",
      farm_unit_name: "Block One",
      quantity: "12450.000",
      unit: "fruit_count",
      submitted_by_name: "Supervisor",
      submitted_at: "2026-08-08T09:00:00",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue(manager);
  getOverview.mockResolvedValue(overviewData);
});

describe("ReportsOverview", () => {
  it("renders loading then the Today summary and recent activity", async () => {
    render(<ReportsOverview />);
    expect(screen.getByText("Checking reports access…")).toBeInTheDocument();
    expect(await screen.findByText("Today · 2026-08-08")).toBeInTheDocument();
    expect(screen.getByText("Submitted sessions")).toBeInTheDocument();
    expect((await screen.findAllByText("12450.000")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("840.500")).length).toBeGreaterThan(0);
    expect(
      await screen.findByRole("table", {
        name: "Recent submitted attendance sessions",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Recent submitted harvest records" }),
    ).toBeInTheDocument();
    const viewLinks = screen.getAllByRole("link", { name: "View" });
    expect(
      viewLinks.some((link) => link.getAttribute("href") === "/attendance/s1"),
    ).toBe(true);
    expect(
      viewLinks.some((link) => link.getAttribute("href") === "/harvest/r1"),
    ).toBe(true);
  });

  it("shows export buttons to Managers with exports.create", async () => {
    render(<ReportsOverview />);
    expect(
      await screen.findByRole("button", { name: "Export attendance CSV" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Export harvest CSV" }),
    ).toBeInTheDocument();
  });

  it("hides export buttons from Supervisors without exports.create", async () => {
    session.mockResolvedValue(supervisor);
    render(<ReportsOverview />);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Export attendance CSV" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Export harvest CSV" }),
    ).not.toBeInTheDocument();
  });

  it("denies users without reports.read", async () => {
    session.mockResolvedValue(worker);
    render(<ReportsOverview />);
    expect(
      await screen.findByText("You do not have permission to view reports."),
    ).toBeInTheDocument();
  });

  it("shows a no-data state when there are no records", async () => {
    getOverview.mockResolvedValue({
      date: "2026-08-08",
      attendance: {
        submitted_sessions: 0,
        present_count: 0,
        absent_count: 0,
        roster_count: 0,
      },
      harvest: { submitted_records: 0, by_unit: [] },
      recent_attendance: [],
      recent_harvest: [],
    });
    render(<ReportsOverview />);
    expect(
      await screen.findByText(
        "No submitted Attendance sessions are recorded yet.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No submitted Harvest records are recorded yet."),
    ).toBeInTheDocument();
  });

  it("shows an error state when the overview fails to load", async () => {
    getOverview.mockRejectedValue(new Error("boom"));
    render(<ReportsOverview />);
    expect(
      await screen.findByText("The operational overview could not be loaded."),
    ).toBeInTheDocument();
  });

  it("triggers a download when an export button is pressed", async () => {
    render(<ReportsOverview />);
    const button = await screen.findByRole("button", {
      name: "Export harvest CSV",
    });
    fireEvent.click(button);
    await waitFor(() => expect(downloadCsv).toHaveBeenCalled());
  });
});
