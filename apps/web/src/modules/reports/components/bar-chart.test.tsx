import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BarChart, type BarDatum, type BarSeries } from "./bar-chart";

const series: BarSeries[] = [
  { className: "bar-present", key: "present", label: "Present" },
  { className: "bar-absent", key: "absent", label: "Absent" },
];

const data: BarDatum[] = [
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
];

describe("BarChart", () => {
  it("renders the values as an accessible table, never only as bars", () => {
    render(
      <BarChart
        data={data}
        description="Present and absent workers per operational date."
        series={series}
        stacked
      />,
    );
    const table = screen.getByRole("table", {
      name: "Present and absent workers per operational date.",
    });
    expect(table).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Present" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Absent" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "14" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "3" })).toBeInTheDocument();
  });

  it("exposes every column to the keyboard with a meaningful label", () => {
    render(
      <BarChart
        data={data}
        description="Attendance per day."
        series={series}
        stacked
      />,
    );
    const columns = screen.getAllByRole("button", { name: /2026-08-0/ });
    expect(columns).toHaveLength(2);
    expect(columns[0]).toHaveAccessibleName("2026-08-07: Present 10, Absent 2");
    expect(columns[1]).toHaveAccessibleName("2026-08-08: Present 14, Absent 3");
  });

  it("reveals the tooltip when a column receives focus", () => {
    render(
      <BarChart
        data={data}
        description="Attendance per day."
        series={series}
        stacked
      />,
    );
    const column = screen.getAllByRole("button", { name: /2026-08-08/ })[0];
    fireEvent.focus(column);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("2026-08-08");
    expect(tooltip).toHaveTextContent("Present 14");
    expect(tooltip).toHaveTextContent("Absent 3");
  });

  it("handles a single data point without distortion", () => {
    render(
      <BarChart
        data={[
          {
            label: "2026-08-08",
            fullLabel: "2026-08-08",
            values: { quantity: 14 },
          },
        ]}
        description="One day."
        series={[{ className: "bar-harvest", key: "quantity", label: "kg" }]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "2026-08-08: kg 14" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "14" })).toBeInTheDocument();
  });
});
