"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FieldShell } from "@/components/shells/field-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { TextInput } from "@/components/ui/inputs";
import { getCurrentSession, type AuthenticatedUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { listFarmUnits, type FarmUnit } from "@/modules/farm-structure/api";
import {
  correctHarvest,
  createHarvest,
  getHarvest,
  harvestAudit,
  submitHarvest,
  updateHarvest,
  type HarvestRecord,
  type HarvestUnit,
  type HarvestValues,
} from "./api";
import type { AuditEvent } from "@/modules/workers/api";

const today = () => new Date().toLocaleDateString("en-CA");
const unitLabel = (unit: HarvestUnit) =>
  unit === "fruit_count" ? "fruit" : "kg";
const errorMessage = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : "The harvest record could not be saved. Check the connection and try again.";

export function HarvestWorkspace({ id }: { id: string }) {
  const router = useRouter();
  const isNew = id === "new";
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [record, setRecord] = useState<HarvestRecord | null>(null);
  const [date, setDate] = useState(today());
  const [farmUnit, setFarmUnit] = useState<FarmUnit | null>(null);
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<HarvestUnit>("fruit_count");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [units, setUnits] = useState<FarmUnit[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<AuditEvent[]>([]);
  useEffect(() => {
    getCurrentSession()
      .then((current) => {
        if (!current.permissions.includes("harvest.read"))
          setError("You do not have permission to access Harvest.");
        else setUser(current);
      })
      .catch(() => setError("Harvest requires a verified online session."));
  }, []);
  useEffect(() => {
    if (!user || isNew) return;
    getHarvest(id)
      .then((item) => {
        setRecord(item);
        setDate(item.harvest_date);
        setFarmUnit({
          id: item.farm_unit_id,
          code: item.farm_unit_code,
          name: item.farm_unit_name,
          unit_type: item.farm_unit_type,
          status: item.farm_unit_active ? "active" : "inactive",
          parent_id: null,
          created_at: "",
          updated_at: "",
        });
        setQuantity(item.quantity);
        setUnit(item.unit);
        setNotes(item.notes ?? "");
        if (item.status === "submitted")
          harvestAudit(item.id).then((result) => setHistory(result.items));
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id, isNew, user]);
  useEffect(() => {
    if (!user || record?.status === "submitted") return;
    const handle = window.setTimeout(() => {
      listFarmUnits(search, "active")
        .then((result) => setUnits(result.items))
        .catch(() => setError("Active FarmUnits could not be loaded."));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [search, user, record?.status]);
  const values = useMemo<HarvestValues>(
    () => ({
      harvest_date: date,
      farm_unit_id: farmUnit?.id ?? "",
      quantity,
      unit,
      notes: notes.trim() || null,
    }),
    [date, farmUnit, quantity, unit, notes],
  );
  function validate() {
    if (!farmUnit) return "Choose a FarmUnit.";
    if (!quantity || Number(quantity) <= 0)
      return "Enter a quantity greater than zero.";
    if (unit === "fruit_count" && !/^\d+$/.test(quantity))
      return "Fruit count must be a whole number.";
    return "";
  }
  async function saveDraft() {
    const validation = validate();
    if (validation) {
      setError(validation);
      return null;
    }
    setBusy(true);
    setError("");
    try {
      const saved = record
        ? await updateHarvest(record, values)
        : await createHarvest(values);
      setRecord(saved);
      setSuccess("Draft saved online.");
      if (isNew) router.replace(`/harvest/${saved.id}`);
      return saved;
    } catch (e) {
      setError(errorMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function officialSubmit() {
    setBusy(true);
    setError("");
    try {
      const draft = record ?? (await createHarvest(values));
      const submitted = await submitHarvest(draft.id);
      setRecord(submitted);
      setReviewing(false);
      setSuccess("Harvest submitted successfully.");
      setHistory((await harvestAudit(submitted.id)).items);
      if (isNew) router.replace(`/harvest/${submitted.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function correction(event: FormEvent) {
    event.preventDefault();
    if (!record) return;
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    if (!reason.trim()) {
      setError("Enter a correction reason.");
      return;
    }
    if (
      !window.confirm("Apply this correction to the official harvest record?")
    )
      return;
    setBusy(true);
    try {
      const corrected = await correctHarvest(record, values, reason);
      setRecord(corrected);
      setReason("");
      setCorrecting(false);
      setSuccess("Harvest correction recorded.");
      setHistory((await harvestAudit(corrected.id)).items);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (!user && !error)
    return (
      <main className="auth-loading">
        <LoadingIndicator label="Checking Harvest access…" />
      </main>
    );
  const submitted = record?.status === "submitted";
  return (
    <FieldShell
      context={submitted ? "Submitted harvest" : "Harvest capture"}
      status={<Link href="/harvest">Harvest records</Link>}
      actions={
        !submitted && user ? (
          <div className="field-action-row">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void saveDraft()}
            >
              Save draft
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                const validation = validate();
                if (validation) setError(validation);
                else setReviewing(true);
              }}
            >
              Review
            </Button>
          </div>
        ) : undefined
      }
    >
      <h1 className="field-title">
        {submitted ? "Submitted harvest" : "Record harvest"}
      </h1>
      {error ? (
        <Alert title="Harvest not saved" tone="error">
          {error}
        </Alert>
      ) : null}
      {success ? (
        <Alert title="Harvest updated" tone="success">
          {success}
        </Alert>
      ) : null}
      {user ? (
        <form className="harvest-form" onSubmit={correction}>
          <label>
            Harvest date
            <TextInput
              aria-label="Harvest date"
              type="date"
              value={date}
              disabled={submitted && !correcting}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          {submitted && !correcting ? (
            <div>
              <span className="form-label">FarmUnit</span>
              <strong>
                {farmUnit?.code} — {farmUnit?.name}
              </strong>
              <small>
                {farmUnit?.unit_type}
                {farmUnit?.status === "inactive" ? " · now inactive" : ""}
              </small>
            </div>
          ) : (
            <fieldset>
              <legend>FarmUnit</legend>
              <label>
                Search by code or name
                <TextInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <div className="farm-unit-options" aria-label="Active FarmUnits">
                {units.length ? (
                  units.map((item) => (
                    <button
                      aria-pressed={farmUnit?.id === item.id}
                      className={
                        farmUnit?.id === item.id
                          ? "farm-unit-option selected"
                          : "farm-unit-option"
                      }
                      key={item.id}
                      type="button"
                      onClick={() => setFarmUnit(item)}
                    >
                      <strong>{item.code}</strong> — {item.name}
                      <small>{item.unit_type}</small>
                    </button>
                  ))
                ) : (
                  <p>No active FarmUnits match this search.</p>
                )}
              </div>
            </fieldset>
          )}
          <label>
            Quantity
            <div className="quantity-control">
              <TextInput
                aria-label="Quantity"
                inputMode={unit === "fruit_count" ? "numeric" : "decimal"}
                type="number"
                min="0"
                step={unit === "fruit_count" ? "1" : "0.001"}
                value={quantity}
                disabled={submitted && !correcting}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <strong>{unitLabel(unit)}</strong>
            </div>
          </label>
          <label>
            Unit
            <select
              aria-label="Unit"
              className="text-input"
              value={unit}
              disabled={submitted && !correcting}
              onChange={(e) => setUnit(e.target.value as HarvestUnit)}
            >
              <option value="fruit_count">Fruit count</option>
              <option value="kilograms">Kilograms</option>
            </select>
          </label>
          <label>
            Operational note (optional)
            <textarea
              className="text-input"
              maxLength={500}
              value={notes}
              disabled={submitted && !correcting}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {reviewing ? (
            <section className="harvest-review" aria-labelledby="review-title">
              <h2 id="review-title">Review before submission</h2>
              <dl>
                <dt>Harvest date</dt>
                <dd>{date}</dd>
                <dt>FarmUnit</dt>
                <dd>
                  {farmUnit?.code} — {farmUnit?.name}
                </dd>
                <dt>Quantity</dt>
                <dd>
                  {quantity} {unitLabel(unit)}
                </dd>
                <dt>Note</dt>
                <dd>{notes || "None"}</dd>
              </dl>
              <div className="field-action-row">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setReviewing(false)}
                >
                  Back to edit
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void officialSubmit()}
                >
                  {busy ? "Submitting…" : "Submit harvest"}
                </Button>
              </div>
            </section>
          ) : null}
          {submitted && user.permissions.includes("harvest.correct") ? (
            correcting ? (
              <section className="harvest-correction">
                <label>
                  Correction reason
                  <TextInput
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <div className="field-action-row">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setCorrecting(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy}>
                    Confirm correction
                  </Button>
                </div>
              </section>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCorrecting(true)}
              >
                Correct record
              </Button>
            )
          ) : null}
        </form>
      ) : null}
      {submitted ? (
        <section className="content-section">
          <h2 className="section-heading">History</h2>
          {history.length ? (
            <ol className="audit-list">
              {history.map((event) => (
                <li key={event.id}>
                  <strong>{event.action}</strong> by {event.actor_display_name}
                  <br />
                  <span className="muted-text">
                    {new Date(event.occurred_at).toLocaleString()}
                    {event.reason ? ` · ${event.reason}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p>No history is available.</p>
          )}
        </section>
      ) : null}
    </FieldShell>
  );
}
