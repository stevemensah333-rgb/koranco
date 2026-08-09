"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ManagementShell } from "@/components/shells/management-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { PageHeader } from "@/components/ui/page-header";
import { TextInput } from "@/components/ui/inputs";
import { getCurrentSession, type AuthenticatedUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { domainNavigation } from "@/modules/workers/worker-register";
import type { AuditEvent } from "@/modules/workers/api";
import {
  farmUnitAudit,
  listFarmUnits,
  saveFarmUnit,
  setFarmUnitStatus,
  type FarmUnit,
} from "./api";

export function FarmStructureRegister() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [units, setUnits] = useState<FarmUnit[] | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [editing, setEditing] = useState<FarmUnit | null | undefined>(
    undefined,
  );
  const [history, setHistory] = useState<{
    unit: FarmUnit;
    items: AuditEvent[];
  } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const canEdit = Boolean(user?.permissions.includes("farm_structure.create"));
  const load = () =>
    listFarmUnits(search, status, type)
      .then((r) => setUnits(r.items))
      .catch((e: unknown) =>
        setError(
          e instanceof ApiError && e.status === 403
            ? "You do not have permission to view farm structure."
            : "Farm structure could not be loaded.",
        ),
      );
  useEffect(() => {
    getCurrentSession()
      .then(setUser)
      .catch(() => setError("Your session could not be verified."));
  }, []);
  useEffect(() => {
    if (user)
      void listFarmUnits(search, status, type)
        .then((result) => setUnits(result.items))
        .catch((requestError: unknown) =>
          setError(
            requestError instanceof ApiError && requestError.status === 403
              ? "You do not have permission to view farm structure."
              : "Farm structure could not be loaded.",
          ),
        );
  }, [user, search, status, type]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      code: String(data.get("code") ?? "").trim(),
      name: String(data.get("name") ?? "").trim(),
      unit_type: String(data.get("unit_type") ?? "field"),
      parent_id: String(data.get("parent_id") ?? "") || null,
    };
    if (!payload.code || !payload.name) {
      setError("Code and name are required.");
      return;
    }
    try {
      await saveFarmUnit(editing ?? null, payload);
      setEditing(undefined);
      setMessage(editing ? "Farm unit updated." : "Farm unit added.");
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? "A farm unit with this code already exists."
          : e instanceof ApiError && e.status === 422
            ? "The selected parent unit is unavailable or would create an invalid hierarchy."
            : "The farm unit could not be saved. Your entries have been preserved.",
      );
    }
  }
  async function lifecycle(unit: FarmUnit) {
    if (
      !window.confirm(
        `${unit.status === "active" ? "Deactivate" : "Reactivate"} ${unit.name}?`,
      )
    )
      return;
    try {
      await setFarmUnitStatus(unit);
      setMessage(
        unit.status === "active"
          ? "Farm unit deactivated."
          : "Farm unit reactivated.",
      );
      await load();
    } catch {
      setError("The farm unit status could not be changed.");
    }
  }
  const parentName = (id: string | null) =>
    id
      ? (units?.find((item) => item.id === id)?.name ?? "Unknown parent")
      : "—";
  if (!user && !error)
    return (
      <main className="auth-loading">
        <LoadingIndicator label="Checking farm-structure access…" />
      </main>
    );
  return (
    <ManagementShell navigation={domainNavigation("farm", user)} user={user}>
      <PageHeader
        title="Farm structure"
        description="A minimal register of field and block units. Parent relationships are optional until Koranco confirms the final hierarchy."
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
            Type
            <select
              className="text-input"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">All</option>
              <option value="field">Field</option>
              <option value="block">Block</option>
            </select>
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
              Add farm unit
            </Button>
          ) : null}
        </form>
      </section>
      {canEdit && editing !== undefined ? (
        <section className="content-section">
          <h2 className="section-heading">
            {editing ? "Edit farm unit" : "Add farm unit"}
          </h2>
          <form className="admin-form-grid" onSubmit={submit}>
            <label>
              Code
              <TextInput name="code" defaultValue={editing?.code} autoFocus />
            </label>
            <label>
              Name
              <TextInput name="name" defaultValue={editing?.name} />
            </label>
            <label>
              Type
              <select
                className="text-input"
                name="unit_type"
                defaultValue={editing?.unit_type ?? "field"}
              >
                <option value="field">Field</option>
                <option value="block">Block</option>
              </select>
            </label>
            <label>
              Parent (optional)
              <select
                className="text-input"
                name="parent_id"
                defaultValue={editing?.parent_id ?? ""}
              >
                <option value="">No parent</option>
                {units
                  ?.filter(
                    (item) =>
                      item.id !== editing?.id && item.status === "active",
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} — {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <Button type="submit">Save farm unit</Button>
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
        {units === null && !error ? (
          <LoadingIndicator label="Loading farm structure…" />
        ) : units?.length === 0 ? (
          <p>
            {search || status || type
              ? "No farm units match the current search and filters."
              : "No farm units have been added."}
          </p>
        ) : units ? (
          <div className="table-scroll" tabIndex={0}>
            <table className="data-table">
              <caption className="sr-only">Farm structure register</caption>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Parent</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {units.map((unit) => (
                  <tr key={unit.id}>
                    <td>{unit.code}</td>
                    <td>
                      {unit.parent_id ? "↳ " : ""}
                      {unit.name}
                    </td>
                    <td>{unit.unit_type}</td>
                    <td>{parentName(unit.parent_id)}</td>
                    <td>{unit.status}</td>
                    <td>
                      <div className="table-actions">
                        {canEdit ? (
                          <>
                            <Button
                              variant="secondary"
                              onClick={() => setEditing(unit)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant={
                                unit.status === "active"
                                  ? "danger"
                                  : "secondary"
                              }
                              onClick={() => void lifecycle(unit)}
                            >
                              {unit.status === "active"
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
                              void farmUnitAudit(unit.id).then((r) =>
                                setHistory({ unit, items: r.items }),
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
          <h2 className="section-heading">History for {history.unit.code}</h2>
          {history.items.map((item) => (
            <p key={item.id}>
              <strong>{item.action}</strong> · by {item.actor_display_name} ·{" "}
              {new Date(item.occurred_at).toLocaleString()}
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
