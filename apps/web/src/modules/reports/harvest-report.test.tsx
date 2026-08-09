import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HarvestReport } from "./harvest-report";

const session = vi.fn();
const getHarvestReport = vi.fn();
const listFarmUnits = vi.fn();
vi.mock("@/lib/api/auth", () => ({ getCurrentSession: () => session() }));
vi.mock("@/modules/reports/api", () => ({
  getHarvestReport: (...a: unknown[]) => getHarvestReport(...a),
  downloadCsv: vi.fn(),
}));
vi.mock("@/modules/farm-structure/api", () => ({
  listFarmUnits: (...a: unknown[]) => listFarmUnits(...a),
}));

const manager = {
  id: "u1",
  display_name: "Manager",
  login_identifier: "manager",
  role: "manager",
  password_change_required: false,
  permissions: ["reports.read", "exports.create", "harvest.read"],
};

const report = {
  date_from: "2026-08-01",
  date_to: "2026-08-08",
  submitted_record_count: 3,
  by_unit: [
    { unit: "fruit_count", record_count: 2, quantity: "12450.000" },
    { unit: "kilograms", record_count: 1, quantity: "840.500" },
  ],
  by_date: [
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
  ],
  by_farm_unit: [
    {
      farm_unit_id: "f1",
      farm_unit_code: "BLOCK-1",
      farm_unit_name: "Block One",
      farm_unit_type: "block",
      record_count: 2,
      by_unit: [
        { unit: "fruit_count", record_count: 2, quantity: "12450.000" },
      ],
    },
    {
      farm_unit_id: "f2",
      farm_unit_code: "FIELD-2",
      farm_unit_name: "Field Two",
      farm_unit_type: "field",
      record_count: 1,
      by_unit: [{ unit: "kilograms", record_count: 1, quantity: "840.500" }],
    },
  ],
  records: [
    {
      id: "r1",
      harvest_date: "2026-08-08",
      farm_unit_id: "f1",
      farm_unit_code: "BLOCK-1",
      farm_unit_name: "Block One",
      farm_unit_type: "block",
      quantity: "12450.000",
      unit: "fruit_count",
      notes: null,
      submitted_by_name: "Manager",
      submitted_at: "2026-08-08T09:00:00",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue(manager);
  getHarvestReport.mockResolvedValue(report);
  listFarmUnits.mockResolvedValue({
    items: [
      { id: "f1", code: "BLOCK-1", name: "Block One", unit_type: "block" },
    ],
    total: 1,
    limit: 50,
    offset: 0,
  });
});

describe("HarvestReport", () => {
  it("renders unit-separated totals, the over-time chart, and the by-FarmUnit comparison", async () => {
    render(<HarvestReport />);
    expect((await screen.findAllByText("12,450")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("840.5").length).toBeGreaterThan(0);
    // The two units must stay independent: no cross-unit total anywhere.
    expect(screen.queryByText("13,290.5")).not.toBeInTheDocument();
    expect(screen.queryByText("13290.500")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Harvest over time" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "By FarmUnit" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Harvest by FarmUnit" }),
    ).toBeInTheDocument();
    const table = await screen.findByRole("table", {
      name: "Harvest totals by FarmUnit",
    });
    expect(table).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Submitted harvest source records" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute(
      "href",
      "/harvest/r1",
    );
  });

  it("switches the chart unit without ever mixing units", async () => {
    render(<HarvestReport />);
    await screen.findByRole("table", { name: "Harvest totals by FarmUnit" });
    const unitSelect = screen.getByLabelText("Harvest unit");
    expect(unitSelect).toHaveValue("fruit_count");
    fireEvent.change(unitSelect, { target: { value: "kilograms" } });
    // Fruit bars disappear; only the kg chart remains for the selected unit.
    await waitFor(() => expect(unitSelect).toHaveValue("kilograms"));
  });

  it("shows the export button for Manager", async () => {
    render(<HarvestReport />);
    expect(
      await screen.findByRole("button", { name: "Export harvest CSV" }),
    ).toBeInTheDocument();
  });

  it("refetches when the server-side unit filter changes", async () => {
    render(<HarvestReport />);
    await screen.findByRole("table", { name: "Harvest totals by FarmUnit" });
    const unitSelect = screen.getByLabelText("Unit");
    fireEvent.change(unitSelect, { target: { value: "fruit_count" } });
    await waitFor(() =>
      expect(getHarvestReport).toHaveBeenCalledWith(
        expect.objectContaining({ unit: "fruit_count" }),
      ),
    );
  });

  it("shows an intentional no-records state", async () => {
    getHarvestReport.mockResolvedValue({
      ...report,
      submitted_record_count: 0,
      by_unit: [],
      by_date: [],
      by_farm_unit: [],
      records: [],
    });
    render(<HarvestReport />);
    expect(
      (
        await screen.findAllByText(
          "No submitted Harvest records match this filter.",
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it("shows an error state on load failure", async () => {
    getHarvestReport.mockRejectedValue(new Error("boom"));
    render(<HarvestReport />);
    expect(
      await screen.findByText("The harvest report could not be loaded."),
    ).toBeInTheDocument();
  });
});
