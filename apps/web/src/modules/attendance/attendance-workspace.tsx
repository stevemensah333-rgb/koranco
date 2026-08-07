"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FieldShell } from "@/components/shells/field-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { TextInput } from "@/components/ui/inputs";
import { getCurrentSession, type AuthenticatedUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import type { Worker } from "@/modules/workers/api";
import {
  activeWorkersForRoster,
  attendanceAudit,
  correctAttendance,
  discardAttendance,
  getAttendance,
  type AttendanceEntry,
  type AttendanceSession,
  type AttendanceStatus,
  type DraftEntry,
} from "./api";
import {
  cacheServerDraft,
  cachedWorkers,
  cacheWorkers,
  ownerDraft,
  queueSubmission,
  saveLocalDraft,
  validOfflineLease,
  type LocalDraftState,
} from "./offline/db";
import { syncAttendance } from "./offline/sync";

type RosterItem = {
  worker_id: string;
  worker_code: string;
  worker_name: string;
  worker_active: boolean;
  included: boolean;
  attendance_status: AttendanceStatus | null;
  time_in: string;
  time_out: string;
  entry_id?: string;
  version?: number;
  corrected_at?: string | null;
};
const fromEntry = (entry: AttendanceEntry): RosterItem => ({
  worker_id: entry.worker_id,
  worker_code: entry.worker_code,
  worker_name: entry.worker_name,
  worker_active: entry.worker_active,
  included: true,
  attendance_status: entry.attendance_status,
  time_in: entry.time_in?.slice(0, 5) ?? "",
  time_out: entry.time_out?.slice(0, 5) ?? "",
  entry_id: entry.id,
  version: entry.version,
  corrected_at: entry.corrected_at,
});
const fromWorker = (worker: Worker): RosterItem => ({
  worker_id: worker.id,
  worker_code: worker.worker_code,
  worker_name: worker.full_name,
  worker_active: true,
  included: false,
  attendance_status: null,
  time_in: "",
  time_out: "",
});

export function AttendanceWorkspace({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [correcting, setCorrecting] = useState<RosterItem | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [localState, setLocalState] = useState<LocalDraftState>("editing");
  useEffect(() => {
    if (!dirty) return;
    const warnAboutUnsavedDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnAboutUnsavedDraft);
    return () =>
      window.removeEventListener("beforeunload", warnAboutUnsavedDraft);
  }, [dirty]);
  useEffect(() => {
    async function load() {
      try {
        const [current, attendance, workers] = await Promise.all([
          getCurrentSession(),
          getAttendance(sessionId),
          activeWorkersForRoster(),
        ]);
        if (!current.permissions.includes("attendance.read")) {
          setError("You do not have permission to access attendance.");
          return;
        }
        await Promise.all([
          cacheWorkers(current.id, workers),
          cacheServerDraft(current.id, attendance),
        ]);
        setUser(current);
        setSession(attendance);
        const existing = new Map(
          attendance.entries.map((entry) => [
            entry.worker_id,
            fromEntry(entry),
          ]),
        );
        setRoster([
          ...existing.values(),
          ...workers
            .filter((worker) => !existing.has(worker.id))
            .map(fromWorker),
        ]);
        setLocalState(attendance.status === "submitted" ? "synced" : "editing");
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) {
          setError("You do not have permission to access attendance.");
          return;
        }
        const lease = await validOfflineLease();
        const local = lease ? await ownerDraft(lease.ownerId, sessionId) : null;
        if (!lease || !local) {
          setError("Attendance is not available offline on this device.");
          return;
        }
        const workers = await cachedWorkers(lease.ownerId);
        const entryByWorker = new Map(
          local.entries.map((entry) => [entry.worker_id, entry]),
        );
        setUser({
          id: lease.ownerId,
          login_identifier: "offline",
          display_name: lease.displayName,
          permissions: ["attendance.read", "attendance.record"],
          role: "supervisor",
          password_change_required: false,
        });
        setSession({
          id: local.id,
          attendance_date: local.attendanceDate,
          status: "draft",
          version: local.baseServerVersion ?? 1,
          created_by: lease.ownerId,
          created_by_name: lease.displayName,
          created_at: local.createdAt,
          updated_at: local.updatedAt,
          submitted_by: null,
          submitted_by_name: null,
          submitted_at: null,
          present_count: 0,
          absent_count: 0,
          unmarked_count: 0,
          entries: [],
        });
        setRoster(
          workers.map((worker) => {
            const entry = entryByWorker.get(worker.id);
            return {
              worker_id: worker.id,
              worker_code: worker.worker_code,
              worker_name: worker.full_name,
              worker_active: worker.active,
              included: Boolean(entry),
              attendance_status: entry?.attendance_status ?? null,
              time_in: entry?.time_in?.slice(0, 5) ?? "",
              time_out: entry?.time_out?.slice(0, 5) ?? "",
            };
          }),
        );
        setLocalState(local.state);
        setSuccess(
          local.lastMessage ?? "Offline copy opened from this device.",
        );
      }
    }
    void load();
  }, [sessionId]);
  const included = roster.filter((item) => item.included);
  const present = included.filter(
    (item) => item.attendance_status === "present",
  ).length;
  const absent = included.filter(
    (item) => item.attendance_status === "absent",
  ).length;
  const unmarked = included.length - present - absent;
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return roster.filter(
      (item) =>
        !term ||
        item.worker_code.toLocaleLowerCase().includes(term) ||
        item.worker_name.toLocaleLowerCase().includes(term),
    );
  }, [roster, search]);
  function change(id: string, patch: Partial<RosterItem>) {
    setRoster((items) =>
      items.map((item) =>
        item.worker_id === id ? { ...item, ...patch } : item,
      ),
    );
    setDirty(true);
    setSuccess("");
  }
  function addAll() {
    setRoster((items) =>
      items.map((item) =>
        item.worker_active ? { ...item, included: true } : item,
      ),
    );
    setDirty(true);
  }
  function markAllPresent() {
    setRoster((items) =>
      items.map((item) =>
        item.included
          ? { ...item, attendance_status: "present" as const }
          : item,
      ),
    );
    setDirty(true);
  }
  async function save(): Promise<AttendanceSession | null> {
    if (!session || !user) return null;
    setSaving(true);
    setError("");
    const entries: DraftEntry[] = roster
      .filter((item) => item.included)
      .map((item) => ({
        worker_id: item.worker_id,
        attendance_status: item.attendance_status,
        time_in:
          item.attendance_status === "present" && item.time_in
            ? item.time_in
            : null,
        time_out:
          item.attendance_status === "present" && item.time_out
            ? item.time_out
            : null,
      }));
    try {
      await saveLocalDraft(user.id, session.id, entries);
      setDirty(false);
      setLocalState("editing");
      setSuccess("Saved on this device.");
      return session;
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? e.message
          : e instanceof Error
            ? e.message
            : "The draft could not be saved on this device.",
      );
      return null;
    } finally {
      setSaving(false);
    }
  }
  async function openReview() {
    const saved = dirty ? await save() : session;
    if (saved) setReview(true);
  }
  async function submit() {
    if (
      !session ||
      !user ||
      !window.confirm(
        `Submit attendance for ${session.attendance_date}? Submitted records require an explicit correction.`,
      )
    )
      return;
    setSaving(true);
    try {
      if (dirty && !(await save())) return;
      await queueSubmission(user.id, session.id);
      setLocalState("pending_submission");
      const outcome = await syncAttendance(user.id);
      if (outcome === "synced") {
        const submitted = await getAttendance(session.id);
        setSession(submitted);
        setRoster(submitted.entries.map(fromEntry));
        setLocalState("synced");
        setSuccess("Attendance submitted and confirmed by the server.");
      } else if (outcome === "waiting") {
        setSuccess("Saved on this device. Waiting to sync.");
      } else if (outcome === "authentication_required") {
        setError("Sign in as the same user to synchronize this attendance.");
      } else {
        setLocalState("needs_attention");
        setError("Attendance needs attention before it can be confirmed.");
      }
      setReview(false);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Attendance could not be submitted. Your draft is still available.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function syncNow() {
    if (!user) return;
    setSaving(true);
    const outcome = await syncAttendance(user.id);
    if (outcome === "synced") {
      const confirmed = await getAttendance(sessionId);
      setSession(confirmed);
      setRoster(confirmed.entries.map(fromEntry));
      setLocalState("synced");
      setSuccess("Attendance confirmed by the server.");
    } else if (outcome === "waiting")
      setSuccess("Still waiting for a reliable connection.");
    else if (outcome === "authentication_required")
      setError("Sign in as the same user to sync.");
    else
      setError(
        "Attendance needs attention. The device copy has been preserved.",
      );
    setSaving(false);
  }
  async function discard() {
    if (!session || !window.confirm("Discard this draft attendance session?"))
      return;
    await discardAttendance(session.id);
    router.push("/attendance");
  }
  async function correct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !correcting?.entry_id || !correcting.version) return;
    const data = new FormData(event.currentTarget);
    const reason = String(data.get("reason") ?? "").trim();
    if (reason.length < 3) {
      setError("A correction reason is required.");
      return;
    }
    if (!window.confirm(`Correct attendance for ${correcting.worker_name}?`))
      return;
    const replacementStatus = String(
      data.get("attendance_status"),
    ) as AttendanceStatus;
    try {
      const updated = await correctAttendance(session.id, correcting.entry_id, {
        expected_version: correcting.version,
        attendance_status: replacementStatus,
        time_in:
          replacementStatus === "present"
            ? String(data.get("time_in") ?? "") || null
            : null,
        time_out:
          replacementStatus === "present"
            ? String(data.get("time_out") ?? "") || null
            : null,
        reason,
      });
      setSession(updated);
      setRoster(updated.entries.map(fromEntry));
      setCorrecting(null);
      setSuccess("Attendance correction recorded.");
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "The correction could not be recorded.",
      );
    }
  }
  async function showHistory() {
    if (!session) return;
    const result = await attendanceAudit(session.id);
    setHistory(
      result.items.map(
        (item) =>
          `${item.action} by ${item.actor_display_name} · ${new Date(item.occurred_at).toLocaleString()}${item.reason ? ` · ${item.reason}` : ""}`,
      ),
    );
  }
  if (!user || !session)
    return (
      <main className="auth-loading">
        {error ? (
          <Alert title="Attendance unavailable" tone="error">
            {error}
          </Alert>
        ) : (
          <LoadingIndicator label="Loading attendance roster…" />
        )}
      </main>
    );
  const status = (
    <span className="field-counts">
      {localState === "synced"
        ? "Online · Synced"
        : localState === "needs_attention"
          ? "Needs attention"
          : localState === "syncing"
            ? "Syncing"
            : localState === "pending_submission"
              ? "Waiting to sync"
              : "Saved on device"}
      {" · "}
      {present} present · {absent} absent · {unmarked} unmarked
    </span>
  );
  if (
    localState === "pending_submission" ||
    localState === "syncing" ||
    localState === "needs_attention"
  )
    return (
      <FieldShell
        context={`Attendance · ${session.attendance_date}`}
        status={status}
        actions={
          <Button disabled={saving} onClick={() => void syncNow()}>
            {saving ? "Syncing…" : "Sync now"}
          </Button>
        }
      >
        <h1 className="field-title">Attendance saved on this device</h1>
        <Alert
          title={
            localState === "needs_attention"
              ? "Needs attention"
              : "Waiting to sync"
          }
          tone={localState === "needs_attention" ? "error" : "info"}
        >
          {error ||
            success ||
            "This attendance is not yet confirmed by the server."}
        </Alert>
        <p>
          Keep this browser data on the device and synchronize when a reliable
          connection is available.
        </p>
        <div className="attendance-summary">
          <strong>{present} Present</strong>
          <strong>{absent} Absent</strong>
        </div>
      </FieldShell>
    );
  if (session.status === "submitted")
    return (
      <FieldShell
        context={`Submitted attendance · ${session.attendance_date}`}
        status={status}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => router.push("/attendance")}
            >
              Back to sessions
            </Button>
            <Button variant="secondary" onClick={() => void showHistory()}>
              View history
            </Button>
          </>
        }
      >
        <h1 className="field-title">Submitted attendance</h1>
        {success ? (
          <Alert title="Completed" tone="success">
            {success}
          </Alert>
        ) : null}
        {error ? (
          <Alert title="Action not completed" tone="error">
            {error}
          </Alert>
        ) : null}
        <p>
          Recorded by {session.created_by_name}. Submitted by{" "}
          {session.submitted_by_name} at{" "}
          {session.submitted_at
            ? new Date(session.submitted_at).toLocaleString()
            : "—"}
          .
        </p>
        <div className="attendance-summary">
          <strong>{present} Present</strong>
          <strong>{absent} Absent</strong>
        </div>
        <div className="attendance-roster">
          {roster.map((item) => (
            <article className="attendance-row" key={item.worker_id}>
              <div>
                <strong>{item.worker_code}</strong>
                <span>{item.worker_name}</span>
                {item.corrected_at ? <small>Corrected</small> : null}
              </div>
              <div>
                <strong>{item.attendance_status}</strong>
                {item.time_in || item.time_out ? (
                  <small>
                    {item.time_in || "—"}–{item.time_out || "—"}
                  </small>
                ) : null}
              </div>
              <Button variant="secondary" onClick={() => setCorrecting(item)}>
                Correct attendance
              </Button>
            </article>
          ))}
        </div>
        {correcting ? (
          <section className="content-section">
            <h2 className="section-heading">
              Correct attendance — {correcting.worker_name}
            </h2>
            <form className="attendance-correction" onSubmit={correct}>
              <label>
                Replacement status
                <select
                  className="text-input"
                  name="attendance_status"
                  defaultValue={correcting.attendance_status ?? "present"}
                >
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                </select>
              </label>
              <label>
                Time in
                <TextInput
                  type="time"
                  name="time_in"
                  defaultValue={correcting.time_in}
                />
              </label>
              <label>
                Time out
                <TextInput
                  type="time"
                  name="time_out"
                  defaultValue={correcting.time_out}
                />
              </label>
              <label>
                Reason
                <TextInput name="reason" />
              </label>
              <Button type="submit">Record correction</Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCorrecting(null)}
              >
                Cancel
              </Button>
            </form>
          </section>
        ) : null}
        {history.length ? (
          <section className="content-section">
            <h2 className="section-heading">Attendance history</h2>
            {history.map((item, index) => (
              <p key={`${index}-${item}`}>{item}</p>
            ))}
          </section>
        ) : null}
      </FieldShell>
    );
  if (review)
    return (
      <FieldShell
        context={`Review attendance · ${session.attendance_date}`}
        status={status}
        actions={
          <>
            <Button variant="secondary" onClick={() => setReview(false)}>
              Back to roster
            </Button>
            <Button
              disabled={saving || included.length === 0 || unmarked > 0}
              onClick={() => void submit()}
            >
              {saving ? "Submitting…" : "Submit attendance"}
            </Button>
          </>
        }
      >
        <h1 className="field-title">Review attendance</h1>
        {error ? (
          <Alert title="Submission not completed" tone="error">
            {error}
          </Alert>
        ) : null}
        {included.length === 0 ? (
          <Alert title="Empty roster" tone="error">
            Add at least one Worker before submission.
          </Alert>
        ) : null}
        {unmarked > 0 ? (
          <Alert title="Roster incomplete" tone="error">
            Mark every included Worker Present or Absent before submission.
          </Alert>
        ) : null}
        <div className="attendance-summary">
          <strong>{included.length} rostered</strong>
          <strong>{present} Present</strong>
          <strong>{absent} Absent</strong>
          <strong>{unmarked} Unmarked</strong>
        </div>
        {included.map((item) => (
          <p key={item.worker_id}>
            <strong>{item.worker_code}</strong> — {item.worker_name}:{" "}
            {item.attendance_status ?? "Unmarked"}
          </p>
        ))}
      </FieldShell>
    );
  return (
    <FieldShell
      context={`Draft attendance · ${session.attendance_date}`}
      status={status}
      actions={
        <>
          <Button variant="secondary" onClick={() => void discard()}>
            Discard draft
          </Button>
          <Button
            variant="secondary"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : dirty ? "Save draft" : "Draft saved"}
          </Button>
          <Button onClick={() => void openReview()}>Review</Button>
        </>
      }
    >
      <h1 className="field-title">Record attendance</h1>
      {success ? (
        <Alert title="Saved" tone="success">
          {success}
        </Alert>
      ) : null}
      {error ? (
        <Alert title="Action not completed" tone="error">
          {error}
        </Alert>
      ) : null}
      <div className="attendance-tools">
        <TextInput
          aria-label="Search roster"
          placeholder="Search worker code or name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="secondary" onClick={addAll}>
          Add all active workers
        </Button>
        <Button
          variant="secondary"
          disabled={included.length === 0}
          onClick={markAllPresent}
        >
          Mark all present
        </Button>
      </div>
      {roster.filter((item) => item.worker_active).length === 0 ? (
        <Alert title="No active Workers" tone="info">
          Add active Workers to the Worker Register before recording attendance.
        </Alert>
      ) : null}
      <div className="attendance-roster">
        {visible.map((item) => (
          <article
            className={`attendance-row${item.included ? " attendance-row-included" : ""}`}
            key={item.worker_id}
          >
            <label className="attendance-include">
              <input
                type="checkbox"
                checked={item.included}
                onChange={(e) =>
                  change(item.worker_id, { included: e.target.checked })
                }
              />
              <span>
                <strong>{item.worker_code}</strong>
                {item.worker_name}
              </span>
            </label>
            {item.included ? (
              <>
                <div
                  className="attendance-status-controls"
                  role="group"
                  aria-label={`Attendance for ${item.worker_name}`}
                >
                  <Button
                    variant={
                      item.attendance_status === "present"
                        ? "primary"
                        : "secondary"
                    }
                    onClick={() =>
                      change(item.worker_id, { attendance_status: "present" })
                    }
                  >
                    Present
                  </Button>
                  <Button
                    variant={
                      item.attendance_status === "absent"
                        ? "danger"
                        : "secondary"
                    }
                    onClick={() =>
                      change(item.worker_id, {
                        attendance_status: "absent",
                        time_in: "",
                        time_out: "",
                      })
                    }
                  >
                    Absent
                  </Button>
                </div>
                {item.attendance_status === "present" ? (
                  <div className="attendance-times">
                    <label>
                      In
                      <input
                        type="time"
                        value={item.time_in}
                        onChange={(e) =>
                          change(item.worker_id, { time_in: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Out
                      <input
                        type="time"
                        value={item.time_out}
                        onChange={(e) =>
                          change(item.worker_id, { time_out: e.target.value })
                        }
                      />
                    </label>
                  </div>
                ) : null}
              </>
            ) : null}
          </article>
        ))}
      </div>
    </FieldShell>
  );
}
