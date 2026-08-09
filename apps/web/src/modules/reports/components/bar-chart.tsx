"use client";

import { useState, type ReactNode } from "react";

import { formatShortDate } from "../units";

export type BarSeries = {
  className: string;
  key: string;
  label: string;
};

export type BarDatum = {
  fullLabel: string;
  label: string;
  values: Record<string, number>;
};

type BarChartProps = {
  data: BarDatum[];
  description: string;
  formatValue?: (value: number) => string;
  height?: number;
  series: BarSeries[];
  stacked?: boolean;
};

const MAX_PLOT_HEIGHT = 220;
const MIN_PLOT_HEIGHT = 120;

/**
 * A lightweight, dependency-free vertical bar chart rendered with HTML/CSS.
 * Designed for engineered restraint: muted grid lines, explicit axis labels,
 * tabular values, a visible legend with non-color distinctions, keyboard
 * reachable columns with a meaningful tooltip, and a hidden data table so the
 * visualization is never the only representation of the numbers.
 */
export function BarChart({
  data,
  description,
  formatValue = (value) => new Intl.NumberFormat("en-US").format(value),
  height = 180,
  series,
  stacked = false,
}: BarChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const plotHeight = Math.min(
    MAX_PLOT_HEIGHT,
    Math.max(MIN_PLOT_HEIGHT, height),
  );
  const maxValue = Math.max(1, ...data.flatMap((d) => Object.values(d.values)));
  const maxTick = niceCeil(maxValue);
  const halfTick = maxTick / 2;
  const labelStep = Math.ceil(data.length / 10);

  return (
    <div className="bar-chart">
      <div className="bar-chart-plot-row">
        <div
          className="bar-chart-y-labels"
          aria-hidden="true"
          style={{ height: plotHeight }}
        >
          <span style={{ bottom: "0%" }}>0</span>
          <span style={{ bottom: "50%" }}>{formatValue(halfTick)}</span>
          <span style={{ bottom: "100%" }}>{formatValue(maxTick)}</span>
        </div>
        <div className="bar-chart-plot" style={{ height: plotHeight }}>
          <div className="bar-chart-grid" aria-hidden="true">
            <span style={{ bottom: "0%" }} />
            <span style={{ bottom: "50%" }} />
            <span style={{ bottom: "100%" }} />
          </div>
          <div className="bar-chart-columns">
            {data.map((datum, index) => {
              const labelVisible = index % labelStep === 0;
              return (
                <button
                  aria-label={`${datum.fullLabel}: ${series
                    .map(
                      (s) =>
                        `${s.label} ${formatValue(datum.values[s.key] ?? 0)}`,
                    )
                    .join(", ")}`}
                  className="bar-column"
                  key={datum.fullLabel}
                  onBlur={() => setActive(null)}
                  onFocus={() => setActive(index)}
                  onMouseEnter={() => setActive(index)}
                  onMouseLeave={() => setActive(null)}
                  type="button"
                >
                  <span
                    className="bar-column-bars"
                    style={{ height: plotHeight }}
                  >
                    {stacked
                      ? renderStackedBars(datum, series, maxTick, formatValue)
                      : renderGroupedBars(datum, series, maxTick, formatValue)}
                  </span>
                  <span
                    className={`bar-column-label ${labelVisible ? "" : "bar-label-hidden"}`}
                  >
                    {formatShortDate(datum.label)}
                  </span>
                </button>
              );
            })}
          </div>
          {active !== null && data[active] ? (
            <span className="bar-chart-readout" role="tooltip">
              <strong>{data[active].fullLabel}</strong>
              {series.map((s) => (
                <span className="bar-tooltip-row" key={s.key}>
                  <span
                    className={`bar-tooltip-swatch ${s.className}`}
                    aria-hidden="true"
                  />
                  {s.label} {formatValue(data[active].values[s.key] ?? 0)}
                </span>
              ))}
            </span>
          ) : null}
        </div>
      </div>
      <table className="sr-only">
        <caption>{description}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((datum) => (
            <tr key={datum.fullLabel}>
              <th scope="row">{datum.fullLabel}</th>
              {series.map((s) => (
                <td key={s.key}>{formatValue(datum.values[s.key] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderStackedBars(
  datum: BarDatum,
  series: BarSeries[],
  maxTick: number,
  formatValue: (value: number) => string,
) {
  let cumulative = 0;
  const bars: ReactNode[] = [];
  for (const s of series) {
    const value = datum.values[s.key] ?? 0;
    if (value > 0) {
      bars.push(
        <span
          aria-hidden="true"
          className={`bar bar-stacked ${s.className}`}
          key={s.key}
          style={{
            bottom: `${(cumulative / maxTick) * 100}%`,
            height: `${(value / maxTick) * 100}%`,
          }}
          title={`${s.label}: ${formatValue(value)}`}
        />,
      );
    }
    cumulative += value;
  }
  return <span className="bar-stack">{bars}</span>;
}

function renderGroupedBars(
  datum: BarDatum,
  series: BarSeries[],
  maxTick: number,
  formatValue: (value: number) => string,
) {
  return series.map((s) => {
    const value = datum.values[s.key] ?? 0;
    return (
      <span
        aria-hidden="true"
        className={`bar bar-grouped ${s.className}`}
        key={s.key}
        style={{ height: `${(value / maxTick) * 100}%` }}
        title={`${s.label}: ${formatValue(value)}`}
      />
    );
  });
}

/** Round up to a restrained 1/2/5×10^k tick so axis labels stay clean. */
function niceCeil(value: number): number {
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}
