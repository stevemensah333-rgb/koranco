import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OverviewContent } from "./overview-content";

const getOverview = vi.fn();
vi.mock("@/modules/reports/api", () => ({
  getOverview: (...a: unknown[]) => getOverview(...a),
  downloadCsv: vi.fn(),
}));

const data = {
  date: "2026-08-08",
  attendance: {
    submitted_sessions: 3,
    present_count: 41,
    absent_count: 5,
    roster_count: 46,
  },
  harvest: {
    submitted_records: 3,
    by_unit: [
      { unit: "fruit_count", record_count: 2, quantity: "12450.000" },
      { unit: "kilograms", record_count: 1, quantity: "840.500" },
    ],
  },
  attendance_by_date: [
    {
      date: "2026-08-08",
      submitted_sessions: 3,
      present_count: 41,
      absent_count: 5,
      roster_count: 46,
    },
    {
      date: "2026-08-07",
      submitted_sessions: 1,
      present_count: 12,
      absent_count: 1,
      roster_count: 13,
    },
  ],
  harvest_by_date: [
    {
      date: "2026-08-08",
      unit: "fruit_count",
      record_count: 2,
      quantity: "12450.000",
    },
    {
      date: "2026-08-08",
      unit: "kilograms",
      record_count: 1,
      quantity: "840.500",
    },
    {
      date: "2026-08-07",
      unit: "fruit_count",
      record_count: 1,
      quantity: "200.000",
    },
  ],
  harvest_by_farm_unit: [
    {
      farm_unit_id: "f1",
      farm_unit_code: "BLOCK-1",
      farm_unit_name: "Block One",
      farm_unit_type: "block",
      record_count: 2,
      by_unit: [
        { unit: "fruit_count", record_count: 2, quantity: "12450.000" },
        { unit: "kilograms", record_count: 1, quantity: "500.000" },
      ],
    },
    {
      farm_unit_id: "f2",
      farm_unit_code: "FIELD-2",
      farm_unit_name: "Field Two",
      farm_unit_type: "field",
      record_count: 1,
      by_unit: [{ unit: "kilograms", record_count: 1, quantity: "340.500" }],
    },
  ],
  recent_attendance: [
    {
      id: "s1",
      attendance_date: "2026-08-08",
      submitted_by_name: "Supervisor",
      submitted_at: "2026-08-08T09:00:00",
      present_count: 41,
      absent_count: 5,
      roster_count: 46,
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
  getOverview.mockResolvedValue(data);
});

describe("OverviewContent", () => {
  it("shows the today summary with harvest units kept separate", async () => {
    render(
      <OverviewContent
        canExport={false}
        showDateFilter={false}
        showExports={false}
      />,
    );
    expect(await screen.findByText("Today · 2026-08-08")).toBeInTheDocument();
    // Values appear in the summary and again in the charts' accessible tables.
    expect(screen.getAllByText("41").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12,450").length).toBeGreaterThan(0);
    expect(screen.getAllByText("840.5").length).toBeGreaterThan(0);
    // Fruit and kg are independent totals; no combined number is possible.
    expect(screen.queryByText("13,290.5")).not.toBeInTheDocument();
    expect(screen.queryByText("13290.500")).not.toBeInTheDocument();
  });

  it("keeps the harvest trend and FarmUnit comparison on one selected unit", async () => {
    render(
      <OverviewContent
        canExport={false}
        showDateFilter={false}
        showExports={false}
      />,
    );
    await screen.findByText("Today · 2026-08-08");
    // Fruit chart is the default (first unit present).
    const unitSelect = screen.getByLabelText("Harvest unit");
    expect(unitSelect).toHaveValue("fruit_count");
    expect(
      screen.getByRole("list", { name: "Harvest by FarmUnit" }),
    ).toBeInTheDocument();
    // Switch to kilograms: the comparison now shows kg-only totals.
    fireEvent.change(unitSelect, { target: { value: "kilograms" } });
    await waitFor(() => expect(unitSelect).toHaveValue("kilograms"));
  });

  it("renders drill-down links to source records", async () => {
    render(
      <OverviewContent
        canExport={false}
        showDateFilter={false}
        showExports={false}
      />,
    );
    await screen.findByText("Today · 2026-08-08");
    const viewLinks = screen.getAllByRole("link", { name: "View" });
    expect(
      viewLinks.some((link) => link.getAttribute("href") === "/attendance/s1"),
    ).toBe(true);
    expect(
      viewLinks.some((link) => link.getAttribute("href") === "/harvest/r1"),
    ).toBe(true);
  });

  it("shows export buttons only when canExport is granted", async () => {
    const { rerender } = render(
      <OverviewContent canExport={false} showDateFilter showExports />,
    );
    await screen.findByText("Today · 2026-08-08");
    expect(
      screen.queryByRole("button", { name: "Export attendance CSV" }),
    ).not.toBeInTheDocument();
    rerender(<OverviewContent canExport showDateFilter showExports />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Export attendance CSV" }),
      ).toBeInTheDocument(),
    );
  });

  it("hides the date filter when the host page does not show one", async () => {
    render(
      <OverviewContent
        canExport={false}
        showDateFilter={false}
        showExports={false}
      />,
    );
    await screen.findByText("Today · 2026-08-08");
    expect(screen.queryByLabelText("Operational date")).not.toBeInTheDocument();
  });

  it("renders an intentional zero-data state", async () => {
    getOverview.mockResolvedValue({
      date: "2026-08-08",
      attendance: {
        submitted_sessions: 0,
        present_count: 0,
        absent_count: 0,
        roster_count: 0,
      },
      harvest: { submitted_records: 0, by_unit: [] },
      attendance_by_date: [],
      harvest_by_date: [],
      harvest_by_farm_unit: [],
      recent_attendance: [],
      recent_harvest: [],
    });
    render(
      <OverviewContent
        canExport={false}
        showDateFilter={false}
        showExports={false}
      />,
    );
    expect(
      await screen.findByText(
        /The trend appears here after sessions are recorded/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No submitted Harvest in the last 14 days/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No submitted Attendance sessions are recorded yet."),
    ).toBeInTheDocument();
  });

  it("shows an error state when the API fails", async () => {
    getOverview.mockRejectedValue(new Error("boom"));
    render(
      <OverviewContent
        canExport={false}
        showDateFilter={false}
        showExports={false}
      />,
    );
    expect(
      await screen.findByText("The operational overview could not be loaded."),
    ).toBeInTheDocument();
  });
});
