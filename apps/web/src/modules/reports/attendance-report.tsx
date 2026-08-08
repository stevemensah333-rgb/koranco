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
  getAttendanceReport,
  type AttendanceReportResponse,
} from "./api";
import { ReportsNav } from "./reports-nav";

export function AttendanceReport() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [data, setData] = useState<AttendanceReportResponse | null>(null);
  const [error, setError] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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
      getAttendanceReport({ dateFrom, dateTo })
        .then((result) => {
          setData(result);
          setError("");
        })
        .catch(() => {
          setData(null);
          setError("The attendance report could not be loaded.");
        });
    }
  }, [user, dateFrom, dateTo]);

  async function handleExport() {
    if (!user) return;
    setExporting(true);
    try {
      await downloadCsv(buildExportUrl("attendance", { dateFrom, dateTo }));
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
      navigation={managementNavigation(user, "/reports/attendance")}
    >
      <PageHeader
        title="Attendance report"
        description="Submitted Attendance sessions with the Present, Absent, and roster counts for a date range."
      />
      {error ? (
        <Alert title="Report unavailable" tone="error">
          {error}
        </Alert>
      ) : null}
      {user ? (
        <>
          <ReportsNav current="attendance" />
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
              {canExport ? (
                <button
                  className="button button-secondary"
                  disabled={exporting}
                  onClick={handleExport}
                  type="button"
                >
                  {exporting ? "Exporting…" : "Export attendance CSV"}
                </button>
              ) : null}
            </div>

            {data === null ? (
              <LoadingIndicator label="Loading attendance report…" />
            ) : (
              <>
                <div className="report-note">
                  Date range {data.date_from} to {data.date_to} is inclusive and
                  limited to submitted sessions.
                </div>
                <dl className="report-stats report-stats-inline">
                  <div>
                    <dt>Sessions</dt>
                    <dd>{data.submitted_session_count}</dd>
                  </div>
                  <div>
                    <dt>Present</dt>
                    <dd>{data.present_count}</dd>
                  </div>
                  <div>
                    <dt>Absent</dt>
                    <dd>{data.absent_count}</dd>
                  </div>
                  <div>
                    <dt>Roster</dt>
                    <dd>{data.roster_count}</dd>
                  </div>
                </dl>

                {data.sessions.length === 0 ? (
                  <p>No submitted Attendance sessions match this date range.</p>
                ) : (
                  <div className="table-scroll" tabIndex={0}>
                    <table className="data-table">
                      <caption className="sr-only">
                        Submitted attendance sessions in the selected range
                      </caption>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Recorded by</th>
                          <th>Submitted by</th>
                          <th className="numeric">Present</th>
                          <th className="numeric">Absent</th>
                          <th className="numeric">Roster</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.sessions.map((session) => (
                          <tr key={session.id}>
                            <td>{session.attendance_date}</td>
                            <td>{session.recorded_by_name}</td>
                            <td>{session.submitted_by_name ?? "—"}</td>
                            <td className="numeric">{session.present_count}</td>
                            <td className="numeric">{session.absent_count}</td>
                            <td className="numeric">{session.roster_count}</td>
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
              </>
            )}
          </section>
        </>
      ) : null}
    </ManagementShell>
  );
}
