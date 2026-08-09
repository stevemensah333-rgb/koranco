import type {
  AttendanceDateTotal,
  HarvestDateUnitTotal,
  HarvestFarmUnitTotal,
  HarvestUnit,
} from "./api";

/**
 * Pure data mapping between the authoritative reporting API and the chart
 * layer. No client-side aggregation ever happens here: every value comes from
 * a backend row that PostgreSQL already grouped. Harvest mapping is the
 * unit-separation boundary — one unit is plotted per chart and incompatible
 * units can never share a series.
 */

/** One grouped vertical-bar column. `values` are keyed by series key. */
export type ChartDatum = {
  label: string;
  fullLabel: string;
  values: Record<string, number>;
};

export type HorizontalBar = {
  label: string;
  context: string;
  value: number;
};

/** Present/absent per operational date, oldest first. */
export function attendanceChartData(
  byDate: AttendanceDateTotal[],
  windowStart?: string,
  windowEnd?: string,
): ChartDatum[] {
  const rows = byDate
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      label: row.date,
      fullLabel: row.date,
      values: {
        present: row.present_count,
        absent: row.absent_count,
      },
    }));
  return fillDateWindow(rows, ["present", "absent"], windowStart, windowEnd);
}

/** Which units actually have data in a harvest date series. */
export function harvestUnitsInSeries(
  byDate: HarvestDateUnitTotal[],
): HarvestUnit[] {
  const units = new Set<HarvestUnit>();
  for (const row of byDate) units.add(row.unit);
  return [...units].sort((a, b) => a.localeCompare(b));
}

/**
 * One unit's quantity per date, oldest first. The `unit` argument is
 * mandatory: a chart is always plotted for exactly one unit.
 */
export function harvestChartData(
  byDate: HarvestDateUnitTotal[],
  unit: HarvestUnit,
  windowStart?: string,
  windowEnd?: string,
): ChartDatum[] {
  const rows = byDate
    .filter((row) => row.unit === unit)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      label: row.date,
      fullLabel: row.date,
      values: { quantity: Number(row.quantity) },
    }));
  return fillDateWindow(rows, ["quantity"], windowStart, windowEnd);
}

/**
 * Fill gaps with zero rows only inside a bounded window (the overview's fixed
 * window, or a compact user-selected range). Very long ranges are plotted
 * with data days only so a wide period never renders hundreds of empty bars.
 */
function fillDateWindow(
  rows: ChartDatum[],
  keys: readonly string[],
  windowStart?: string,
  windowEnd?: string,
): ChartDatum[] {
  if (!windowStart || !windowEnd) return rows;
  const width = dayWidth(windowStart, windowEnd);
  if (width < 1 || width > 62) return rows;
  const byDate = new Map(rows.map((row) => [row.label, row]));
  const zeros = Object.fromEntries(keys.map((key) => [key, 0]));
  const filled: ChartDatum[] = [];
  let cursor = windowStart;
  for (let i = 0; i <= width; i += 1) {
    filled.push(
      byDate.get(cursor) ?? {
        label: cursor,
        fullLabel: cursor,
        values: { ...zeros },
      },
    );
    cursor = nextDay(cursor);
  }
  return filled;
}

function dayWidth(start: string, end: string): number {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const a = Date.UTC(sy, sm - 1, sd);
  const b = Date.UTC(ey, em - 1, ed);
  return Math.round((b - a) / 86_400_000);
}

function nextDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Per-FarmUnit comparison for one unit, largest first. Only exact FarmUnit
 * totals participate (Field-inclusive-of-Blocks aggregation is a Koranco
 * business question and is never invented here).
 */
export function harvestFarmUnitComparison(
  byFarmUnit: HarvestFarmUnitTotal[],
  unit: HarvestUnit,
): HorizontalBar[] {
  return byFarmUnit
    .flatMap((group) =>
      group.by_unit
        .filter((total) => total.unit === unit)
        .map((total) => ({
          label: group.farm_unit_code,
          context: `${group.record_count} record${group.record_count === 1 ? "" : "s"} · ${group.farm_unit_name}`,
          value: Number(total.quantity),
        })),
    )
    .sort((a, b) => b.value - a.value);
}
