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
import {
  buildExportUrl,
  downloadCsv,
  getOverview,
  type OverviewResponse,
} from "./api";
import { ReportsNav } from "./reports-nav";

const unitLabel = (unit: string) => (unit === "fruit_count" ? "fruit" : "kg");

export function ReportsOverview() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState("");
  const [date, setDate] = useState("");
  const [exporting, setExporting] = useState<"attendance" | "harvest" | null>(
    null,
  );

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
      getOverview({ date: date || undefined })
        .then((result) => {
          setData(result);
          setError("");
        })
        .catch(() => {
          setData(null);
          setError("The operational overview could not be loaded.");
        });
    }
  }, [user, date]);

  async function handleExport(kind: "attendance" | "harvest") {
    if (!user) return;
    setExporting(kind);
    try {
      await downloadCsv(buildExportUrl(kind, { dateFrom: date || undefined }));
    } catch {
      setError(
        "The export could not be completed. Check permissions and try again.",
      );
    } finally {
      setExporting(null);
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
    <ManagementShell navigation={managementNavigation(user, "/reports")}>
      <PageHeader
        title="Reports"
        description="Operational overview of confirmed Attendance and Harvest recorded in PostgreSQL."
      />
      {error ? (
        <Alert title="Reports unavailable" tone="error">
          {error}
        </Alert>
      ) : null}
      {user ? (
        <>
          <ReportsNav current="overview" />
          <section className="content-section">
            <div className="register-filters">
              <label>
                Operational date
                <TextInput
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              {canExport ? (
                <div className="export-actions">
                  <button
                    className="button button-secondary"
                    disabled={exporting === "attendance"}
                    onClick={() => handleExport("attendance")}
                    type="button"
                  >
                    {exporting === "attendance"
                      ? "Exporting…"
                      : "Export attendance CSV"}
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={exporting === "harvest"}
                    onClick={() => handleExport("harvest")}
                    type="button"
                  >
                    {exporting === "harvest"
                      ? "Exporting…"
                      : "Export harvest CSV"}
                  </button>
                </div>
              ) : null}
            </div>

            {data === null ? (
              <LoadingIndicator label="Loading operational overview…" />
            ) : (
              <>
                <section
                  className="report-summary"
                  aria-labelledby="today-heading"
                >
                  <h2 className="section-heading" id="today-heading">
                    Today · {data.date}
                  </h2>
                  <div className="report-summary-grid">
                    <section
                      className="report-group"
                      aria-label="Attendance today"
                    >
                      <h3 className="report-group-title">Attendance</h3>
                      <dl className="report-stats">
                        <div>
                          <dt>Submitted sessions</dt>
                          <dd>{data.attendance.submitted_sessions}</dd>
                        </div>
                        <div>
                          <dt>Present</dt>
                          <dd>{data.attendance.present_count}</dd>
                        </div>
                        <div>
                          <dt>Absent</dt>
                          <dd>{data.attendance.absent_count}</dd>
                        </div>
                        <div>
                          <dt>Roster</dt>
                          <dd>{data.attendance.roster_count}</dd>
                        </div>
                      </dl>
                    </section>
                    <section
                      className="report-group"
                      aria-label="Harvest today"
                    >
                      <h3 className="report-group-title">Harvest</h3>
                      <dl className="report-stats">
                        <div>
                          <dt>Submitted records</dt>
                          <dd>{data.harvest.submitted_records}</dd>
                        </div>
                        {data.harvest.by_unit.length === 0 ? (
                          <p className="muted-text">No harvest recorded.</p>
                        ) : (
                          data.harvest.by_unit.map((unit) => (
                            <div key={unit.unit}>
                              <dt>
                                {unitLabel(unit.unit)} · {unit.record_count}{" "}
                                record{unit.record_count === 1 ? "" : "s"}
                              </dt>
                              <dd>{unit.quantity}</dd>
                            </div>
                          ))
                        )}
                      </dl>
                    </section>
                  </div>
                </section>

                <section
                  className="content-section"
                  aria-labelledby="recent-att-heading"
                >
                  <h2 className="section-heading" id="recent-att-heading">
                    Recent attendance
                  </h2>
                  {data.recent_attendance.length === 0 ? (
                    <p>No submitted Attendance sessions are recorded yet.</p>
                  ) : (
                    <div className="table-scroll" tabIndex={0}>
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
                              <td className="numeric">
                                {session.present_count}
                              </td>
                              <td className="numeric">
                                {session.absent_count}
                              </td>
                              <td className="numeric">
                                {session.roster_count}
                              </td>
                              <td>
                                <Link href={`/attendance/${session.id}`}>
                                  View
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section
                  className="content-section"
                  aria-labelledby="recent-harv-heading"
                >
                  <h2 className="section-heading" id="recent-harv-heading">
                    Recent harvest
                  </h2>
                  {data.recent_harvest.length === 0 ? (
                    <p>No submitted Harvest records are recorded yet.</p>
                  ) : (
                    <div className="table-scroll" tabIndex={0}>
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
