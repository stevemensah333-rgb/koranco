import { describe, expect, it } from "vitest";

import type {
  AttendanceDateTotal,
  HarvestDateUnitTotal,
  HarvestFarmUnitTotal,
} from "./api";
import {
  attendanceChartData,
  harvestChartData,
  harvestFarmUnitComparison,
  harvestUnitsInSeries,
} from "./series";

describe("attendanceChartData", () => {
  it("maps submitted attendance totals to present/absent per date, oldest first", () => {
    const input: AttendanceDateTotal[] = [
      {
        date: "2026-08-08",
        submitted_sessions: 2,
        present_count: 14,
        absent_count: 3,
        roster_count: 17,
      },
      {
        date: "2026-08-07",
        submitted_sessions: 1,
        present_count: 10,
        absent_count: 2,
        roster_count: 12,
      },
    ];
    expect(attendanceChartData(input)).toEqual([
      {
        label: "2026-08-07",
        fullLabel: "2026-08-07",
        values: { present: 10, absent: 2 },
      },
      {
        label: "2026-08-08",
        fullLabel: "2026-08-08",
        values: { present: 14, absent: 3 },
      },
    ]);
  });

  it("fills a bounded window with explicit zero days", () => {
    const input: AttendanceDateTotal[] = [
      {
        date: "2026-08-06",
        submitted_sessions: 1,
        present_count: 5,
        absent_count: 1,
        roster_count: 6,
      },
    ];
    const rows = attendanceChartData(input, "2026-08-05", "2026-08-08");
    expect(rows.map((row) => row.label)).toEqual([
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
    ]);
    expect(rows[0].values).toEqual({ present: 0, absent: 0 });
    expect(rows[1].values).toEqual({ present: 5, absent: 1 });
  });

  it("returns an empty list for no data and does not fabricate rows outside the window", () => {
    expect(attendanceChartData([])).toEqual([]);
    expect(
      attendanceChartData(
        [
          {
            date: "2026-08-01",
            submitted_sessions: 1,
            present_count: 1,
            absent_count: 0,
            roster_count: 1,
          },
        ],
        "2026-08-10",
        "2026-08-12",
      ).map((row) => row.values),
    ).toEqual([
      { present: 0, absent: 0 },
      { present: 0, absent: 0 },
      { present: 0, absent: 0 },
    ]);
  });
});

describe("harvestChartData (unit separation)", () => {
  const input: HarvestDateUnitTotal[] = [
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
  ];

  it("plots only the requested unit; the other unit never appears in the series", () => {
    const fruit = harvestChartData(input, "fruit_count");
    expect(fruit).toEqual([
      {
        label: "2026-08-07",
        fullLabel: "2026-08-07",
        values: { quantity: 200 },
      },
      {
        label: "2026-08-08",
        fullLabel: "2026-08-08",
        values: { quantity: 12450 },
      },
    ]);
    expect(harvestChartData(input, "kilograms")).toEqual([
      {
        label: "2026-08-08",
        fullLabel: "2026-08-08",
        values: { quantity: 840.5 },
      },
    ]);
  });

  it("never produces a cross-unit total: 12450 fruit + 840.5 kg has no combined row", () => {
    const fruit = harvestChartData(input, "fruit_count");
    const kilograms = harvestChartData(input, "kilograms");
    const combined = [...fruit, ...kilograms];
    expect(combined.some((row) => row.values.quantity === 12450 + 840.5)).toBe(
      false,
    );
    expect(combined.some((row) => row.values.quantity === 13290.5)).toBe(false);
  });

  it("enumerates the units actually present in the series", () => {
    expect(harvestUnitsInSeries(input)).toEqual(["fruit_count", "kilograms"]);
    expect(harvestUnitsInSeries([])).toEqual([]);
  });

  it("handles a single data point", () => {
    const single: HarvestDateUnitTotal[] = [
      {
        date: "2026-08-08",
        unit: "fruit_count",
        record_count: 1,
        quantity: "5.000",
      },
    ];
    expect(harvestChartData(single, "fruit_count")).toEqual([
      { label: "2026-08-08", fullLabel: "2026-08-08", values: { quantity: 5 } },
    ]);
  });
});

describe("harvestFarmUnitComparison", () => {
  const byFarmUnit: HarvestFarmUnitTotal[] = [
    {
      farm_unit_id: "f1",
      farm_unit_code: "BLOCK-1",
      farm_unit_name: "Block One",
      farm_unit_type: "block",
      record_count: 2,
      by_unit: [
        { unit: "fruit_count", record_count: 2, quantity: "12450.000" },
        { unit: "kilograms", record_count: 1, quantity: "100.000" },
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
  ];

  it("compares exact FarmUnits for one unit only, largest first", () => {
    const fruit = harvestFarmUnitComparison(byFarmUnit, "fruit_count");
    expect(fruit).toEqual([
      {
        label: "BLOCK-1",
        context: "2 records · Block One",
        value: 12450,
      },
    ]);
    const kilograms = harvestFarmUnitComparison(byFarmUnit, "kilograms");
    expect(kilograms.map((row) => [row.label, row.value])).toEqual([
      ["FIELD-2", 840.5],
      ["BLOCK-1", 100],
    ]);
  });

  it("returns nothing for a unit a FarmUnit does not produce", () => {
    expect(harvestFarmUnitComparison([], "fruit_count")).toEqual([]);
  });
});
