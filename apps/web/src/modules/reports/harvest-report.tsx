"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { ManagementShell } from "@/components/shells/management-shell";
import { managementNavigation } from "@/components/shells/management-navigation";
import { Alert } from "@/components/ui/alert";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { PageHeader } from "@/components/ui/page-header";
import { TextInput } from "@/components/ui/inputs";
import { getCurrentSession, type AuthenticatedUser } from "@/lib/api/auth";
import { listFarmUnits, type FarmUnit } from "@/modules/farm-structure/api";
import {
  downloadCsv,
  getHarvestReport,
  type HarvestReportResponse,
  type HarvestUnit,
} from "./api";
import { BarChart } from "./components/bar-chart";
import { ChartFrame } from "./components/chart-frame";
import { HarvestBars } from "./components/harvest-bars";
import {
  PresetButtons,
  rangeEndingToday,
  ReportToolbar,
} from "./components/report-toolbar";
import { ReportSection } from "./components/report-section";
import { SummaryStrip } from "./components/summary-strip";
import { ReportsNav } from "./reports-nav";
import { harvestChartData, harvestFarmUnitComparison } from "./series";
import {
  formatCount,
  formatQuantity,
  harvestUnitLabel,
  harvestUnitShortLabel,
  HARVEST_UNITS,
} from "./units";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function HarvestReport() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [farmUnits, setFarmUnits] = useState<FarmUnit[]>([]);
  const [data, setData] = useState<HarvestReportResponse | null>(null);
  const [error, setError] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [farmUnitId, setFarmUnitId] = useState("");
  const [unit, setUnit] = useState("");
  const [chartUnit, setChartUnit] = useState<HarvestUnit | "">("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getCurrentSession()
      .then((current) => {
        if (!current.permissions.includes("reports.read"))
          setError("You do not have permission to view reports.");
        else setUser(current);
      })
      .catch(() =>
        setError(
          "Your session could not be verified. Reports require an online connection.",
        ),
      );
  }, []);

  useEffect(() => {
    if (user) {
      listFarmUnits("", "active", "")
        .then((result) => setFarmUnits(result.items))
        .catch(() => setFarmUnits([]));
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      getHarvestReport({ dateFrom, dateTo, farmUnitId, unit })
        .then((result) => {
          setData(result);
          setError("");
        })
        .catch(() => {
          setData(null);
          setError("The harvest report could not be loaded.");
        });
    }
  }, [user, dateFrom, dateTo, farmUnitId, unit]);

  const unitsInResults = useMemo(
    () => data?.by_unit.map((group) => group.unit) ?? [],
    [data],
  );
  const selectedChartUnit: HarvestUnit | null =
    chartUnit !== "" && unitsInResults.includes(chartUnit)
      ? chartUnit
      : (unitsInResults[0] ?? null);

  const harvestSeries =
    data && selectedChartUnit
      ? harvestChartData(
          data.by_date,
          selectedChartUnit,
          data.date_from,
          data.date_to,
        )
      : [];
  const hasChartData = harvestSeries.some((row) => row.values.quantity > 0);
  const farmComparison =
    data && selectedChartUnit
      ? harvestFarmUnitComparison(data.by_farm_unit, selectedChartUnit)
      : [];

  async function handleExport() {
    if (!user) return;
    setExporting(true);
    try {
      await downloadCsv("harvest", {
        dateFrom,
        dateTo,
        farmUnitId,
        unit,
      });
    } catch {
      setError(
        "The export could not be completed. Check permissions and try again.",
      );
    } finally {
      setExporting(false);
    }
  }

  if (!user && !error)
    return (
      <main className="auth-loading">
        <LoadingIndicator label="Checking reports access…" />
      </main>
    );

  const canExport = user?.permissions.includes("exports.create") ?? false;

  return (
    <ManagementShell
      navigation={managementNavigation(user, "/reports/harvest")}
      user={user}
    >
      <PageHeader
        title="Harvest report"
        description="Submitted Harvest quantities grouped by exact FarmUnit, keeping incompatible units permanently separate."
      />
      {error ? (
        <Alert title="Report unavailable" tone="error">
          {error}
        </Alert>
      ) : null}
      {user ? (
        <>
          <ReportsNav current="harvest" />
          <ReportToolbar
            periodLabel={
              data
                ? `Period ${data.date_from} – ${data.date_to} · inclusive, submitted records only`
                : "Set a date range"
            }
            actions={
              canExport ? (
                <button
                  className="button button-secondary button-compact"
                  disabled={exporting}
                  onClick={handleExport}
                  type="button"
                >
                  {exporting ? "Exporting…" : "Export harvest CSV"}
                </button>
              ) : undefined
            }
          >
            <label className="filter-field">
              <span className="filter-field-label">From</span>
              <TextInput
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </label>
            <label className="filter-field">
              <span className="filter-field-label">To</span>
              <TextInput
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </label>
            <label className="filter-field">
              <span className="filter-field-label">FarmUnit</span>
              <select
                className="text-input"
                value={farmUnitId}
                onChange={(e) => setFarmUnitId(e.target.value)}
              >
                <option value="">All</option>
                {farmUnits.map((unitItem) => (
                  <option key={unitItem.id} value={unitItem.id}>
                    {unitItem.code} · {unitItem.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-field-label">Unit</span>
              <select
                className="text-input"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              >
                <option value="">All</option>
                {HARVEST_UNITS.map((unitOption) => (
                  <option key={unitOption} value={unitOption}>
                    {harvestUnitLabel(unitOption)}
                  </option>
                ))}
              </select>
            </label>
            <PresetButtons
              onSelect={(days) => {
                const range = rangeEndingToday(days, todayUtc());
                setDateFrom(range.from);
                setDateTo(range.to);
              }}
            />
          </ReportToolbar>

          {data === null ? (
            <LoadingIndicator label="Loading harvest report…" />
          ) : (
            <>
              <ReportSection
                description="Quantities are grouped independently by unit. Fruit and kilograms are never added together."
                title="Totals by unit"
              >
                <SummaryStrip
                  groups={[
                    {
                      title: "Harvest",
                      cells:
                        data.by_unit.length === 0
                          ? [
                              {
                                label: "Submitted records",
                                value: "0",
                                context:
                                  "no submitted Harvest matches the filter",
                              },
                            ]
                          : data.by_unit.map((group) => ({
                              label: harvestUnitLabel(group.unit),
                              value: formatQuantity(group.quantity),
                              context: `${formatCount(group.record_count)} record${group.record_count === 1 ? "" : "s"}`,
                            })),
                    },
                  ]}
                />
              </ReportSection>

              <ChartFrame
                actions={
                  unitsInResults.length > 1 && selectedChartUnit ? (
                    <label className="chart-select">
                      <span className="sr-only">Harvest unit</span>
                      <select
                        className="select-input select-input-compact"
                        value={selectedChartUnit}
                        onChange={(e) =>
                          setChartUnit(e.target.value as HarvestUnit)
                        }
                      >
                        {unitsInResults.map((unitOption) => (
                          <option key={unitOption} value={unitOption}>
                            {harvestUnitLabel(unitOption)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : undefined
                }
                description={`Submitted ${selectedChartUnit ? harvestUnitShortLabel(selectedChartUnit) : "harvest"} quantity per operational date. One unit per chart; incompatible units are never combined.`}
                empty={!hasChartData}
                emptyMessage={
                  selectedChartUnit
                    ? `No ${harvestUnitShortLabel(selectedChartUnit)} harvest recorded in this period. The trend appears here after records are submitted.`
                    : "No submitted Harvest records match this filter."
                }
                meta={`${data.date_from} – ${data.date_to}${
                  selectedChartUnit
                    ? ` · ${harvestUnitShortLabel(selectedChartUnit)}`
                    : ""
                }`}
                title="Harvest over time"
              >
                {selectedChartUnit ? (
                  <BarChart
                    data={harvestSeries}
                    description={`Submitted ${harvestUnitShortLabel(selectedChartUnit)} quantity per operational date.`}
                    formatValue={(value) =>
                      `${formatQuantity(value)} ${harvestUnitShortLabel(selectedChartUnit)}`
                    }
                    series={[
                      {
                        className: "bar-harvest",
                        key: "quantity",
                        label: harvestUnitShortLabel(selectedChartUnit),
                      },
                    ]}
                  />
                ) : null}
              </ChartFrame>

              <ReportSection
                description="Exact FarmUnit totals for the selected unit. Field-inclusive-of-Blocks totals are a Koranco business question and are not reported."
                headingLevel={3}
                meta={
                  selectedChartUnit
                    ? harvestUnitLabel(selectedChartUnit)
                    : undefined
                }
                title="By FarmUnit"
              >
                {farmComparison.length > 0 ? (
                  <HarvestBars
                    comparison={farmComparison}
                    unit={selectedChartUnit ?? "fruit_count"}
                  />
                ) : (
                  <p>No submitted Harvest records match this filter.</p>
                )}
                {data.by_farm_unit.length === 0 ? null : (
                  <div className="table-scroll" tabIndex={0}>
                    <table className="data-table">
                      <caption className="sr-only">
                        Harvest totals by FarmUnit
                      </caption>
                      <thead>
                        <tr>
                          <th>FarmUnit</th>
                          <th className="numeric">Records</th>
                          <th>Quantities</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.by_farm_unit.map((group) => (
                          <tr key={group.farm_unit_id}>
                            <td>
                              <strong>{group.farm_unit_code}</strong>{" "}
                              <span className="muted-text">
                                {group.farm_unit_name} · {group.farm_unit_type}
                              </span>
                            </td>
                            <td className="numeric">{group.record_count}</td>
                            <td>
                              {group.by_unit
                                .map(
                                  (unitTotal) =>
                                    `${formatQuantity(unitTotal.quantity)} ${harvestUnitShortLabel(unitTotal.unit)}`,
                                )
                                .join(" · ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ReportSection>

              <ReportSection
                description="The source records behind the totals, with drill-down to each submitted Harvest record."
                headingLevel={3}
                title="Source records"
              >
                {data.records.length === 0 ? (
                  <p>No submitted Harvest records match this filter.</p>
                ) : (
                  <div className="table-scroll" tabIndex={0}>
                    <table className="data-table">
                      <caption className="sr-only">
                        Submitted harvest source records
                      </caption>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>FarmUnit</th>
                          <th className="numeric">Quantity</th>
                          <th>Unit</th>
                          <th>Submitted by</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.records.map((record) => (
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
            </>
          )}
        </>
      ) : null}
    </ManagementShell>
  );
}
