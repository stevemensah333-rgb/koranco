"use client";

import { useEffect, useState } from "react";
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
  buildExportUrl,
  downloadCsv,
  getHarvestReport,
  type HarvestReportResponse,
} from "./api";
import { ReportsNav } from "./reports-nav";

const unitLabel = (unit: string) => (unit === "fruit_count" ? "fruit" : "kg");

export function HarvestReport() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [farmUnits, setFarmUnits] = useState<FarmUnit[]>([]);
  const [data, setData] = useState<HarvestReportResponse | null>(null);
  const [error, setError] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [farmUnitId, setFarmUnitId] = useState("");
  const [unit, setUnit] = useState("");
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

  async function handleExport() {
    if (!user) return;
    setExporting(true);
    try {
      await downloadCsv(
        buildExportUrl("harvest", {
          dateFrom,
          dateTo,
          farmUnitId,
          unit,
        }),
      );
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
    >
      <PageHeader
        title="Harvest report"
        description="Submitted Harvest quantities grouped by FarmUnit, keeping incompatible units separate."
      />
      {error ? (
        <Alert title="Report unavailable" tone="error">
          {error}
        </Alert>
      ) : null}
      {user ? (
        <>
          <ReportsNav current="harvest" />
          <section className="content-section">
            <div className="register-filters">
              <label>
                From
                <TextInput
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </label>
              <label>
                To
                <TextInput
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </label>
              <label>
                FarmUnit
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
              <label>
                Unit
                <select
                  className="text-input"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                >
                  <option value="">All</option>
                  <option value="fruit_count">Fruit count</option>
                  <option value="kilograms">Kilograms</option>
                </select>
              </label>
              {canExport ? (
                <button
                  className="button button-secondary"
                  disabled={exporting}
                  onClick={handleExport}
                  type="button"
                >
                  {exporting ? "Exporting…" : "Export harvest CSV"}
                </button>
              ) : null}
            </div>

            {data === null ? (
              <LoadingIndicator label="Loading harvest report…" />
            ) : (
              <>
                <div className="report-note">
                  Date range {data.date_from} to {data.date_to} is inclusive and
                  limited to submitted records. {data.submitted_record_count}{" "}
                  record{data.submitted_record_count === 1 ? "" : "s"}.
                </div>
                <dl className="report-stats report-stats-inline">
                  {data.by_unit.length === 0 ? (
                    <div>
                      <dt>No harvest</dt>
                      <dd>0</dd>
                    </div>
                  ) : (
                    data.by_unit.map((group) => (
                      <div key={group.unit}>
                        <dt>
                          {unitLabel(group.unit)} · {group.record_count} record
                          {group.record_count === 1 ? "" : "s"}
                        </dt>
                        <dd>{group.quantity}</dd>
                      </div>
                    ))
                  )}
                </dl>

                <section aria-labelledby="by-farm-unit-heading">
                  <h3 className="section-heading" id="by-farm-unit-heading">
                    By FarmUnit
                  </h3>
                  {data.by_farm_unit.length === 0 ? (
                    <p>No submitted Harvest records match this filter.</p>
                  ) : (
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
                                  {group.farm_unit_name} ·{" "}
                                  {group.farm_unit_type}
                                </span>
                              </td>
                              <td className="numeric">{group.record_count}</td>
                              <td>
                                {group.by_unit
                                  .map(
                                    (u) => `${u.quantity} ${unitLabel(u.unit)}`,
                                  )
                                  .join(" · ")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section aria-labelledby="source-records-heading">
                  <h3 className="section-heading" id="source-records-heading">
                    Source records
                  </h3>
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
                              <td className="numeric">{record.quantity}</td>
                              <td>{unitLabel(record.unit)}</td>
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
                </section>
              </>
            )}
          </section>
        </>
      ) : null}
    </ManagementShell>
  );
}
