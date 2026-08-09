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
import { BarChart } from "./components/bar-chart";
import { ChartFrame } from "./components/chart-frame";
import {
  PresetButtons,
  rangeEndingToday,
  ReportToolbar,
} from "./components/report-toolbar";
import { ReportSection } from "./components/report-section";
import { SummaryStrip } from "./components/summary-strip";
import { ReportsNav } from "./reports-nav";
import { attendanceChartData } from "./series";
import { formatCount } from "./units";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

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
  const attendanceSeries = data
    ? attendanceChartData(data.by_date, data.date_from, data.date_to)
    : [];
  const hasChartData = attendanceSeries.some(
    (row) => row.values.present > 0 || row.values.absent > 0,
  );

  return (
    <ManagementShell
      navigation={managementNavigation(user, "/reports/attendance")}
    >
      <PageHeader
        title="Attendance report"
        description="Submitted Attendance sessions with Present, Absent, and roster counts for an inclusive date range."
      />
      {error ? (
        <Alert title="Report unavailable" tone="error">
          {error}
        </Alert>
      ) : null}
      {user ? (
        <>
          <ReportsNav current="attendance" />
          <ReportToolbar
            periodLabel={
              data
                ? `Period ${data.date_from} – ${data.date_to} · inclusive, submitted sessions only`
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
                  {exporting ? "Exporting…" : "Export attendance CSV"}
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
            <PresetButtons
              onSelect={(days) => {
                const range = rangeEndingToday(days, todayUtc());
                setDateFrom(range.from);
                setDateTo(range.to);
              }}
            />
          </ReportToolbar>

          {data === null ? (
            <LoadingIndicator label="Loading attendance report…" />
          ) : (
            <>
              <ReportSection
                description="All counts derive from submitted sessions only; each session contributes its own roster."
                title="Totals"
              >
                <SummaryStrip
                  groups={[
                    {
                      title: "Attendance",
                      cells: [
                        {
                          label: "Sessions",
                          value: formatCount(data.submitted_session_count),
                        },
                        {
                          label: "Present",
                          value: formatCount(data.present_count),
                          context: `of ${formatCount(data.roster_count)} roster`,
                        },
                        {
                          label: "Absent",
                          value: formatCount(data.absent_count),
                        },
                        {
                          label: "Roster",
                          value: formatCount(data.roster_count),
                        },
                      ],
                    },
                  ]}
                />
              </ReportSection>

              <ChartFrame
                description="Present and absent workers per operational date across the selected range."
                empty={!hasChartData}
                emptyMessage="No submitted Attendance sessions match this range. The trend appears here after sessions are recorded and submitted."
                legend={[
                  { className: "bar-present", label: "Present" },
                  { className: "bar-absent", label: "Absent" },
                ]}
                meta={
                  data.date_from === data.date_to
                    ? data.date_from
                    : `${data.date_from} – ${data.date_to}`
                }
                title="Attendance over time"
              >
                <BarChart
                  data={attendanceSeries}
                  description="Present and absent workers per operational date across the selected range."
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

              <ReportSection
                description="Every session that produced the totals above, with its own roster and drill-down to the source record."
                title="Sessions"
              >
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
              </ReportSection>
            </>
          )}
        </>
      ) : null}
    </ManagementShell>
  );
}
