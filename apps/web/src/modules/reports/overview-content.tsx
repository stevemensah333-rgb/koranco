"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { TextInput } from "@/components/ui/inputs";
import {
  downloadCsv,
  getOverview,
  type HarvestUnit,
  type OverviewResponse,
} from "./api";
import { ChartFrame } from "./components/chart-frame";
import { ReportToolbar } from "./components/report-toolbar";
import { ReportSection } from "./components/report-section";
import { SummaryStrip } from "./components/summary-strip";
import { HarvestBars } from "./components/harvest-bars";
import { BarChart } from "./components/bar-chart";
import {
  attendanceChartData,
  harvestChartData,
  harvestFarmUnitComparison,
  harvestUnitsInSeries,
} from "./series";
import {
  addDays,
  formatCount,
  formatQuantity,
  harvestUnitLabel,
  harvestUnitShortLabel,
} from "./units";

export const OVERVIEW_SERIES_DAYS = 14;

type OverviewContentProps = {
  canExport: boolean;
  showDateFilter: boolean;
  showExports: boolean;
};

/**
 * The cross-domain operational overview: what is happening today, Attendance
 * and Harvest trends over a bounded window, exact FarmUnit Harvest totals, and
 * recent submitted operations with drill-down. Every number comes from the
 * overview endpoint; the backend is authoritative for all aggregation.
 */
export function OverviewContent({
  canExport,
  showDateFilter,
  showExports,
}: OverviewContentProps) {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState("");
  const [date, setDate] = useState("");
  const [harvestUnit, setHarvestUnit] = useState<HarvestUnit | "">("");
  const [exporting, setExporting] = useState<"attendance" | "harvest" | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    getOverview({ date: date || undefined, days: OVERVIEW_SERIES_DAYS })
      .then((result) => {
        if (!active) return;
        setData(result);
        setError("");
      })
      .catch(() => {
        if (!active) return;
        setData(null);
        setError("The operational overview could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [date]);

  const units = useMemo(
    () => (data ? harvestUnitsInSeries(data.harvest_by_date) : []),
    [data],
  );
  const selectedUnit: HarvestUnit | null =
    harvestUnit !== "" && units.includes(harvestUnit)
      ? harvestUnit
      : (units[0] ?? null);

  async function handleExport(kind: "attendance" | "harvest") {
    setExporting(kind);
    try {
      await downloadCsv(kind, { dateFrom: date || undefined });
    } catch {
      setError(
        "The export could not be completed. Check permissions and try again.",
      );
    } finally {
      setExporting(null);
    }
  }

  if (data === null && error === "") {
    return <LoadingIndicator label="Loading operational overview…" />;
  }

  const windowEnd = data?.date ?? "";
  const windowStart = windowEnd
    ? addDays(windowEnd, -(OVERVIEW_SERIES_DAYS - 1))
    : undefined;

  const attendanceSeries = data
    ? attendanceChartData(data.attendance_by_date, windowStart, windowEnd)
    : [];
  const harvestSeries =
    data && selectedUnit
      ? harvestChartData(
          data.harvest_by_date,
          selectedUnit,
          windowStart,
          windowEnd,
        )
      : [];
  const hasAttendanceData = attendanceSeries.some(
    (row) => row.values.present > 0 || row.values.absent > 0,
  );
  const hasHarvestData = harvestSeries.some((row) => row.values.quantity > 0);
  const farmUnitComparison =
    data && selectedUnit
      ? harvestFarmUnitComparison(data.harvest_by_farm_unit, selectedUnit)
      : [];

  return (
    <div className="overview-content">
      {error ? (
        <Alert title="Overview unavailable" tone="error">
          {error}
        </Alert>
      ) : null}

      {showDateFilter || showExports ? (
        <ReportToolbar
          periodLabel={
            data
              ? `Showing ${data.date}${date ? "" : " · server today"}`
              : "Operational date"
          }
          actions={
            showExports && canExport ? (
              <>
                <button
                  className="button button-secondary button-compact"
                  disabled={exporting === "attendance"}
                  onClick={() => handleExport("attendance")}
                  type="button"
                >
                  {exporting === "attendance"
                    ? "Exporting…"
                    : "Export attendance CSV"}
                </button>
                <button
                  className="button button-secondary button-compact"
                  disabled={exporting === "harvest"}
                  onClick={() => handleExport("harvest")}
                  type="button"
                >
                  {exporting === "harvest"
                    ? "Exporting…"
                    : "Export harvest CSV"}
                </button>
              </>
            ) : undefined
          }
        >
          {showDateFilter ? (
            <label className="filter-field">
              <span className="filter-field-label">Operational date</span>
              <TextInput
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          ) : null}
        </ReportToolbar>
      ) : null}

      {data ? (
        <>
          <ReportSection
            description="Confirmed Attendance and Harvest submitted on this operational date."
            title={`Today · ${data.date}`}
          >
            <SummaryStrip
              groups={[
                {
                  title: "Attendance",
                  cells: [
                    {
                      label: "Sessions",
                      value: formatCount(data.attendance.submitted_sessions),
                    },
                    {
                      label: "Present",
                      value: formatCount(data.attendance.present_count),
                      context: `of ${formatCount(data.attendance.roster_count)} roster`,
                    },
                    {
                      label: "Absent",
                      value: formatCount(data.attendance.absent_count),
                    },
                    {
                      label: "Roster",
                      value: formatCount(data.attendance.roster_count),
                    },
                  ],
                },
                {
                  title: "Harvest",
                  cells:
                    data.harvest.by_unit.length === 0
                      ? [
                          {
                            label: "Submitted records",
                            value: "0",
                            context: "no submitted Harvest recorded",
                          },
                        ]
                      : data.harvest.by_unit.map((unit) => ({
                          label: harvestUnitLabel(unit.unit),
                          value: formatQuantity(unit.quantity),
                          context: `${formatCount(unit.record_count)} record${unit.record_count === 1 ? "" : "s"}`,
                        })),
                },
              ]}
            />
          </ReportSection>

          <div className="report-chart-grid">
            <ChartFrame
              description="Present and absent workers per operational date, from submitted Attendance sessions."
              empty={!hasAttendanceData}
              emptyMessage="No submitted Attendance in the last 14 days. The trend appears here after sessions are recorded and submitted."
              legend={[
                { className: "bar-present", label: "Present" },
                { className: "bar-absent", label: "Absent" },
              ]}
              meta={`Last ${OVERVIEW_SERIES_DAYS} days`}
              title="Attendance over time"
            >
              <BarChart
                data={attendanceSeries}
                description="Present and absent workers per operational date, from submitted Attendance sessions."
                formatValue={formatCount}
                series={[
                  {
                    className: "bar-present",
                    key: "present",
                    label: "Present",
                  },
                  { className: "bar-absent", key: "absent", label: "Absent" },
                ]}
                stacked
              />
            </ChartFrame>

            <ChartFrame
              actions={
                units.length > 0 && selectedUnit ? (
                  <label className="chart-select">
                    <span className="sr-only">Harvest unit</span>
                    <select
                      className="select-input select-input-compact"
                      value={selectedUnit}
                      onChange={(e) =>
                        setHarvestUnit(e.target.value as HarvestUnit)
                      }
                    >
                      {units.map((unit) => (
                        <option key={unit} value={unit}>
                          {harvestUnitLabel(unit)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : undefined
              }
              description={`Submitted ${selectedUnit ? harvestUnitShortLabel(selectedUnit) : "harvest"} quantity per operational date. One unit per chart; incompatible units are never combined.`}
              empty={!hasHarvestData}
              emptyMessage={
                selectedUnit
                  ? `No ${harvestUnitShortLabel(selectedUnit)} harvest recorded in the last ${OVERVIEW_SERIES_DAYS} days. The trend appears here after records are submitted.`
                  : "No submitted Harvest in the last 14 days. The trend appears here after records are submitted."
              }
              meta={`Last ${OVERVIEW_SERIES_DAYS} days${
                selectedUnit ? ` · ${harvestUnitShortLabel(selectedUnit)}` : ""
              }`}
              title="Harvest over time"
            >
              {selectedUnit ? (
                <BarChart
                  data={harvestSeries}
                  description={`Submitted ${harvestUnitShortLabel(selectedUnit)} quantity per operational date.`}
                  formatValue={(value) =>
                    `${formatQuantity(value)} ${harvestUnitShortLabel(selectedUnit)}`
                  }
                  series={[
                    {
                      className: "bar-harvest",
                      key: "quantity",
                      label: harvestUnitShortLabel(selectedUnit),
                    },
                  ]}
                />
              ) : null}
            </ChartFrame>
          </div>

          <ReportSection
            description="Exact FarmUnit totals for the selected unit on this operational date. Field-inclusive-of-Blocks totals are a Koranco business question and are not reported."
            meta={`${harvestUnitLabel(selectedUnit ?? "fruit_count")} · ${data.date}`}
            title="Harvest by FarmUnit"
          >
            {farmUnitComparison.length === 0 ? (
              <p className="muted-text">
                No submitted{" "}
                {selectedUnit ? harvestUnitShortLabel(selectedUnit) : "harvest"}{" "}
                recorded on this date.
              </p>
            ) : (
              <HarvestBars
                comparison={farmUnitComparison}
                unit={selectedUnit ?? "fruit_count"}
              />
            )}
          </ReportSection>

          <div className="overview-recent">
            <ReportSection
              description="Most recently submitted Attendance sessions with their own rosters."
              title="Recent attendance"
            >
              {data.recent_attendance.length === 0 ? (
                <p>No submitted Attendance sessions are recorded yet.</p>
              ) : (
                <div
                  aria-label="Recent submitted attendance sessions"
                  className="table-scroll"
                  role="region"
                  tabIndex={0}
                >
                  <table className="data-table">
                    <caption className="sr-only">
                      Recent submitted attendance sessions
                    </caption>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Responsible</th>
                        <th className="numeric">Present</th>
                        <th className="numeric">Absent</th>
                        <th className="numeric">Roster</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_attendance.map((session) => (
                        <tr key={session.id}>
                          <td>{session.attendance_date}</td>
                          <td>{session.submitted_by_name ?? "—"}</td>
                          <td className="numeric">{session.present_count}</td>
                          <td className="numeric">{session.absent_count}</td>
                          <td className="numeric">{session.roster_count}</td>
                          <td>
                            <Link href={`/attendance/${session.id}`}>View</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ReportSection>

            <ReportSection
              description="Most recently submitted Harvest records, each with its own unit."
              title="Recent harvest"
            >
              {data.recent_harvest.length === 0 ? (
                <p>No submitted Harvest records are recorded yet.</p>
              ) : (
                <div
                  aria-label="Recent submitted harvest records"
                  className="table-scroll"
                  role="region"
                  tabIndex={0}
                >
                  <table className="data-table">
                    <caption className="sr-only">
                      Recent submitted harvest records
                    </caption>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>FarmUnit</th>
                        <th className="numeric">Quantity</th>
                        <th>Unit</th>
                        <th>Responsible</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_harvest.map((record) => (
                        <tr key={record.id}>
                          <td>{record.harvest_date}</td>
                          <td>
                            <strong>{record.farm_unit_code}</strong>{" "}
                            <span className="muted-text">
                              {record.farm_unit_name}
                            </span>
                          </td>
                          <td className="numeric">
                            {formatQuantity(record.quantity)}
                          </td>
                          <td>{harvestUnitShortLabel(record.unit)}</td>
                          <td>{record.submitted_by_name ?? "—"}</td>
                          <td>
                            <Link href={`/harvest/${record.id}`}>View</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ReportSection>
          </div>
        </>
      ) : null}
    </div>
  );
}
