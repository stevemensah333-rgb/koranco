"use client";

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
  listWorkers,
  saveWorker,
  setWorkerStatus,
  workerAudit,
  type AuditEvent,
  type Worker,
} from "./api";

export function WorkerRegister() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [workers, setWorkers] = useState<Worker[] | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Worker | null | undefined>(undefined);
  const [history, setHistory] = useState<{
    worker: Worker;
    items: AuditEvent[];
  } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const canEdit = Boolean(user?.permissions.includes("workers.create"));
  const load = () =>
    listWorkers(search, status)
      .then((r) => setWorkers(r.items))
      .catch((e: unknown) =>
        setError(
          e instanceof ApiError && e.status === 403
            ? "You do not have permission to view the worker register."
            : "The worker register could not be loaded.",
        ),
      );
  useEffect(() => {
    getCurrentSession()
      .then(setUser)
      .catch(() => setError("Your session could not be verified."));
  }, []);
  useEffect(() => {
    if (user)
      void listWorkers(search, status)
        .then((result) => setWorkers(result.items))
        .catch((requestError: unknown) =>
          setError(
            requestError instanceof ApiError && requestError.status === 403
              ? "You do not have permission to view the worker register."
              : "The worker register could not be loaded.",
          ),
        );
  }, [user, search, status]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      worker_code: String(data.get("worker_code") ?? "").trim(),
      full_name: String(data.get("full_name") ?? "").trim(),
    };
    if (!payload.worker_code || !payload.full_name) {
      setError("Worker code and full name are required.");
      return;
    }
    try {
      await saveWorker(editing ?? null, payload);
      setEditing(undefined);
      setMessage(editing ? "Worker updated." : "Worker added to the register.");
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? "A worker with this code already exists."
          : "The worker could not be saved. Your entries have been preserved.",
      );
    }
  }
  async function lifecycle(worker: Worker) {
    if (
      !window.confirm(
        `${worker.status === "active" ? "Deactivate" : "Reactivate"} ${worker.full_name}?`,
      )
    )
      return;
    try {
      await setWorkerStatus(worker);
      setMessage(
        worker.status === "active"
          ? "Worker deactivated."
          : "Worker reactivated.",
      );
      await load();
    } catch {
      setError("The worker status could not be changed.");
    }
  }
  if (!user && !error)
    return (
      <main className="auth-loading">
        <LoadingIndicator label="Checking worker-register access…" />
      </main>
    );
  return (
    <ManagementShell navigation={domainNavigation("workers", user)} user={user}>
      <PageHeader
        title="Worker register"
        description="Stable operational identities for later attendance and harvest. Application accounts are managed separately."
      />
      {message ? (
        <Alert title="Completed" tone="success">
          {message}
        </Alert>
      ) : null}
      {error ? (
        <Alert title="Action not completed" tone="error">
          {error}
        </Alert>
      ) : null}
      <section className="content-section">
        <form className="register-filters" onSubmit={(e) => e.preventDefault()}>
          <label>
            Search
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Code or name"
            />
          </label>
          <label>
            Status
            <select
              className="text-input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          {canEdit ? (
            <Button type="button" onClick={() => setEditing(null)}>
              Add worker
            </Button>
          ) : null}
        </form>
      </section>
      {canEdit && editing !== undefined ? (
        <section className="content-section">
          <h2 className="section-heading">
            {editing ? "Edit worker" : "Add worker"}
          </h2>
          <form className="admin-form-grid" onSubmit={submit}>
            <label>
              Worker code
              <TextInput
                name="worker_code"
                defaultValue={editing?.worker_code}
                autoFocus
              />
            </label>
            <label>
              Full name
              <TextInput name="full_name" defaultValue={editing?.full_name} />
            </label>
            <Button type="submit">Save worker</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditing(undefined)}
            >
              Cancel
            </Button>
          </form>
        </section>
      ) : null}
      <section className="content-section">
        {workers === null && !error ? (
          <LoadingIndicator label="Loading workers…" />
        ) : workers?.length === 0 ? (
          <p>
            {search || status
              ? "No workers match the current search and filter."
              : "No workers have been added to the register."}
          </p>
        ) : workers ? (
          <div className="table-scroll" tabIndex={0}>
            <table className="data-table">
              <caption className="sr-only">Worker register</caption>
              <thead>
                <tr>
                  <th>Worker code</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((worker) => (
                  <tr key={worker.id}>
                    <td>{worker.worker_code}</td>
                    <td>{worker.full_name}</td>
                    <td>{worker.status}</td>
                    <td>
                      <div className="table-actions">
                        {canEdit ? (
                          <>
                            <Button
                              variant="secondary"
                              onClick={() => setEditing(worker)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant={
                                worker.status === "active"
                                  ? "danger"
                                  : "secondary"
                              }
                              onClick={() => void lifecycle(worker)}
                            >
                              {worker.status === "active"
                                ? "Deactivate"
                                : "Reactivate"}
                            </Button>
                          </>
                        ) : null}
                        {user?.permissions.includes(
                          "operational_audit.read",
                        ) ? (
                          <Button
                            variant="secondary"
                            onClick={() =>
                              void workerAudit(worker.id).then((r) =>
                                setHistory({ worker, items: r.items }),
                              )
                            }
                          >
                            History
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      {history ? (
        <section className="content-section">
          <h2 className="section-heading">
            History for {history.worker.worker_code}
          </h2>
          {history.items.map((item) => (
            <p key={item.id}>
              <strong>{item.action}</strong> · by {item.actor_display_name} ·{" "}
              {new Date(item.occurred_at).toLocaleString()}
              {item.reason ? ` · ${item.reason}` : ""}
            </p>
          ))}
          <Button variant="secondary" onClick={() => setHistory(null)}>
            Close history
          </Button>
        </section>
      ) : null}
    </ManagementShell>
  );
}

export function domainNavigation(
  current: "workers" | "farm",
  user: AuthenticatedUser | null,
) {
  return managementNavigation(
    user,
    current === "workers" ? "/workers" : "/farm-structure",
  );
}
