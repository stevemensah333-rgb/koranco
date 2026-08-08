"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ManagementShell } from "@/components/shells/management-shell";
import { managementNavigation } from "@/components/shells/management-navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { PageHeader } from "@/components/ui/page-header";
import { TextInput } from "@/components/ui/inputs";
import { getCurrentSession, type AuthenticatedUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import {
  activeWorkersForRoster,
  listAttendance,
  type AttendanceListItem,
} from "./api";
import {
  cacheWorkers,
  cachedWorkers,
  createLocalDraft,
  ownerDrafts,
  validOfflineLease,
  type LocalAttendanceDraft,
} from "./offline/db";

export function AttendanceList() {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [items, setItems] = useState<AttendanceListItem[] | null>(null);
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [localItems, setLocalItems] = useState<LocalAttendanceDraft[]>([]);
  const [rosterPreparedAt, setRosterPreparedAt] = useState<string | null>(null);
  useEffect(() => {
    getCurrentSession()
      .then((value) => {
        if (!value.permissions.includes("attendance.read"))
          setError("You do not have permission to access attendance.");
        else setUser(value);
      })
      .catch(async () => {
        const lease = await validOfflineLease();
        if (!lease) {
          setError(
            "Your session could not be verified and offline attendance is unavailable.",
          );
          return;
        }
        setUser({
          id: lease.ownerId,
          login_identifier: "offline",
          display_name: lease.displayName,
          permissions: ["attendance.read", "attendance.record"],
          role: "supervisor",
          password_change_required: false,
        });
      });
  }, []);
  useEffect(() => {
    if (user)
      Promise.all([
        listAttendance(status, dateFrom, dateTo),
        ownerDrafts(user.id),
      ])
        .then(([r, local]) => {
          setItems(r.items);
          setLocalItems(local);
        })
        .catch(async () => {
          setItems([]);
          setLocalItems(await ownerDrafts(user.id));
        });
  }, [user, status, dateFrom, dateTo]);
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const attendanceDate = String(
      new FormData(event.currentTarget).get("attendance_date") ?? "",
    );
    if (!attendanceDate) {
      setError("Choose an attendance date.");
      return;
    }
    setCreating(true);
    try {
      const created = await createLocalDraft(user!.id, attendanceDate);
      router.push(`/attendance/${created.id}`);
    } catch (e) {
      setCreating(false);
      setError(
        e instanceof ApiError && e.status === 403
          ? "You do not have permission to record attendance."
          : e instanceof Error
            ? e.message
            : "The attendance draft could not be started.",
      );
    }
  }
  async function prepareRoster() {
    if (!user) return;
    setCreating(true);
    try {
      const workers = await activeWorkersForRoster();
      const fetchedAt = await cacheWorkers(user.id, workers);
      setRosterPreparedAt(fetchedAt);
      setError("");
    } catch {
      const workers = await cachedWorkers(user.id);
      setError(
        workers.length
          ? "Roster could not be refreshed. The existing device copy remains available."
          : "Roster preparation requires a working connection.",
      );
    } finally {
      setCreating(false);
    }
  }
  const nav = managementNavigation(user, "/attendance");
  if (!user && !error)
    return (
      <main className="auth-loading">
        <LoadingIndicator label="Checking attendance access…" />
      </main>
    );
  return (
    <ManagementShell navigation={nav}>
      <PageHeader
        title="Attendance"
        description="Start, resume, and inspect online supervisor-led roster attendance."
      />
      {error ? (
        <Alert title="Attendance unavailable" tone="error">
          {error}
        </Alert>
      ) : null}
      {user?.permissions.includes("attendance.record") ? (
        <section className="content-section">
          <h2 className="section-heading">Start attendance</h2>
          <p>Prepare the Worker roster while connected before field use.</p>
          <Button
            type="button"
            variant="secondary"
            disabled={creating}
            onClick={() => void prepareRoster()}
          >
            Prepare roster for offline use
          </Button>
          {rosterPreparedAt ? (
            <p>
              Roster refreshed {new Date(rosterPreparedAt).toLocaleString()}.
            </p>
          ) : null}
          <form className="inline-action-form" onSubmit={start}>
            <label>
              Attendance date
              <TextInput
                type="date"
                name="attendance_date"
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <Button type="submit" disabled={creating}>
              {creating ? "Starting…" : "Start draft"}
            </Button>
          </form>
        </section>
      ) : null}
      <section className="content-section">
        <h2 className="section-heading">On this device</h2>
        {localItems.length ? (
          localItems.map((item) => (
            <p key={item.id}>
              <a href={`/attendance/${item.id}`}>{item.attendanceDate}</a>
              {" · "}
              {item.state === "synced"
                ? "Server confirmed"
                : item.state === "needs_attention"
                  ? "Needs attention"
                  : item.state === "pending_submission" ||
                      item.state === "syncing"
                    ? "Waiting to sync"
                    : "Saved on this device"}
            </p>
          ))
        ) : (
          <p>No attendance is saved on this device for this user.</p>
        )}
      </section>
      <section className="content-section">
        <h2 className="section-heading">Sessions</h2>
        <div className="register-filters">
          <label>
            Status
            <select
              className="text-input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
            </select>
          </label>
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
        </div>
        {items === null && !error ? (
          <LoadingIndicator label="Loading attendance sessions…" />
        ) : items?.length === 0 ? (
          <p>No attendance sessions match the current filters.</p>
        ) : items ? (
          <div className="table-scroll" tabIndex={0}>
            <table className="data-table">
              <caption className="sr-only">Attendance sessions</caption>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Recorded by</th>
                  <th>Roster</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.attendance_date}</td>
                    <td>{item.status}</td>
                    <td>{item.submitted_by_name ?? item.created_by_name}</td>
                    <td>{item.entry_count}</td>
                    <td>
                      <a href={`/attendance/${item.id}`}>
                        {item.status === "draft" ? "Resume" : "View"}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </ManagementShell>
  );
}
