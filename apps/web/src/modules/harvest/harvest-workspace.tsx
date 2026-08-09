"use client";

/**
 * Harvest workspace: online draft/edit/submit/correct plus offline capture and
 * sync for one record. This component is intentionally large because it owns
 * one cohesive workflow with many small states; the offline behaviors live in
 * `modules/attendance/offline/db.ts` (shared stores) and `offline/sync.ts`,
 * and online API calls in `../api.ts`. Add a field here by following the
 * existing form-state -> `HarvestValues` -> API -> server-schema chain; the
 * same field must also be mapped in `offline/db.ts`
 * (cacheServerHarvestDraft / queueHarvestSubmission / the local draft type)
 * if it participates in offline capture.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { FieldShell } from "@/components/shells/field-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextArea, TextInput } from "@/components/ui/inputs";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { getCurrentSession, type AuthenticatedUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import {
  cachedFarmUnits,
  cacheServerHarvestDraft,
  createLocalHarvestDraft,
  ownerHarvestDraft,
  queueHarvestSubmission,
  recordOfflineLease,
  saveLocalHarvestDraft,
  validOfflineLease,
  type CachedFarmUnit,
  type LocalDraftState,
  type LocalHarvestDraft,
} from "@/modules/attendance/offline/db";
import { listFarmUnits, type FarmUnit } from "@/modules/farm-structure/api";
import type { AuditEvent } from "@/modules/workers/api";
import {
  correctHarvest,
  getHarvest,
  harvestAudit,
  type HarvestRecord,
  type HarvestUnit,
  type HarvestValues,
} from "./api";
import { syncHarvest } from "./offline/sync";

const today = () => new Date().toLocaleDateString("en-CA");
const unitLabel = (unit: HarvestUnit) =>
  unit === "fruit_count" ? "fruit" : "kg";
const errorMessage = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : "The harvest record could not be saved. Check the connection and try again.";

function cachedToFarmUnit(unit: CachedFarmUnit): FarmUnit {
  return {
    id: unit.id,
    code: unit.code,
    name: unit.name,
    unit_type: unit.unit_type,
    parent_id: null,
    status: unit.active ? "active" : "inactive",
    created_at: "",
    updated_at: "",
  };
}

function recordFarmUnit(record: HarvestRecord): FarmUnit {
  return {
    id: record.farm_unit_id,
    code: record.farm_unit_code,
    name: record.farm_unit_name,
    unit_type: record.farm_unit_type,
    status: record.farm_unit_active ? "active" : "inactive",
    parent_id: null,
    created_at: "",
    updated_at: "",
  };
}

export function HarvestWorkspace({ id }: { id: string }) {
  const router = useRouter();
  const localCreation = useRef<Promise<LocalHarvestDraft> | null>(null);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [verifiedOnline, setVerifiedOnline] = useState(false);
  const [localDraft, setLocalDraft] = useState<LocalHarvestDraft | null>(null);
  const [localState, setLocalState] = useState<LocalDraftState>("editing");
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

  function applyLocal(draft: LocalHarvestDraft, available: FarmUnit[] = units) {
    setLocalDraft(draft);
    setLocalState(draft.state);
    setDate(draft.harvestDate);
    setQuantity(draft.quantity);
    setUnit(draft.unit);
    setNotes(draft.notes ?? "");
    setFarmUnit(available.find((item) => item.id === draft.farmUnitId) ?? null);
  }

  function applyRecord(item: HarvestRecord) {
    setRecord(item);
    setDate(item.harvest_date);
    setFarmUnit(recordFarmUnit(item));
    setQuantity(item.quantity);
    setUnit(item.unit);
    setNotes(item.notes ?? "");
    setLocalState(item.status === "submitted" ? "synced" : "editing");
  }

  useEffect(() => {
    let active = true;
    getCurrentSession()
      .then(async (current) => {
        if (!active) return;
        if (!current.permissions.includes("harvest.read")) {
          setError("You do not have permission to access Harvest.");
          return;
        }
        await recordOfflineLease(current);
        if (!active) return;
        setVerifiedOnline(true);
        setUser(current);
      })
      .catch(async () => {
        const lease = await validOfflineLease(undefined, "harvest");
        if (!active) return;
        if (!lease) {
          setError(
            "Your session could not be verified and offline Harvest is unavailable.",
          );
          return;
        }
        setUser({
          id: lease.ownerId,
          login_identifier: "offline",
          display_name: lease.displayName,
          permissions: ["harvest.read", "harvest.record"],
          role: "supervisor",
          password_change_required: false,
        });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;

    async function load() {
      const cached = (await cachedFarmUnits(user!.id))
        .filter((item) => item.active)
        .map(cachedToFarmUnit);
      if (active) setUnits(cached);

      if (id === "new") {
        localCreation.current ??= createLocalHarvestDraft(user!.id);
        try {
          const created = await localCreation.current;
          if (!active) return;
          applyLocal(created, cached);
          router.replace(`/harvest/${created.id}`);
        } catch (caught) {
          if (active)
            setError(
              caught instanceof Error
                ? caught.message
                : "The Harvest draft could not be started.",
            );
        }
        return;
      }

      const local = await ownerHarvestDraft(user!.id, id);
      if (local && active) applyLocal(local, cached);

      if (!verifiedOnline) {
        if (!local && active)
          setError("This Harvest record is not available on this device.");
        return;
      }

      if (local?.state === "pending_submission" || local?.state === "syncing") {
        const outcome = await syncHarvest(user!.id);
        const refreshed = await ownerHarvestDraft(user!.id, id);
        if (refreshed && active) applyLocal(refreshed, cached);
        if (outcome !== "synced") return;
      }

      try {
        const item = await getHarvest(id);
        if (!active) return;
        applyRecord(item);
        const saved = await cacheServerHarvestDraft(user!.id, item);
        if (active) setLocalDraft(saved);
        if (item.status === "submitted") {
          const audit = await harvestAudit(item.id);
          if (active) setHistory(audit.items);
        }
      } catch (caught) {
        if (!local && active) setError(errorMessage(caught));
      }
    }

    void load();
    return () => {
      active = false;
    };
    // `units` is deliberately not a dependency: load establishes its own
    // owner-scoped cache snapshot and applyLocal receives that snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router, user, verifiedOnline]);

  useEffect(() => {
    if (!user || record?.status === "submitted") return;
    const handle = window.setTimeout(() => {
      if (!verifiedOnline) {
        void cachedFarmUnits(user.id).then((cached) => {
          const term = search.trim().toLocaleLowerCase();
          setUnits(
            cached
              .filter(
                (item) =>
                  item.active &&
                  (!term ||
                    item.code.toLocaleLowerCase().includes(term) ||
                    item.name.toLocaleLowerCase().includes(term)),
              )
              .map(cachedToFarmUnit),
          );
        });
        return;
      }
      listFarmUnits(search, "active")
        .then((result) => setUnits(result.items))
        .catch(async () => {
          const cached = await cachedFarmUnits(user.id);
          setUnits(cached.filter((item) => item.active).map(cachedToFarmUnit));
          if (!cached.length) setError("Active FarmUnits could not be loaded.");
        });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [search, user, record?.status, verifiedOnline]);

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
    if (!user || !localDraft) return null;
    const validation = validate();
    if (validation) {
      setError(validation);
      return null;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await saveLocalHarvestDraft(user.id, localDraft.id, {
        harvestDate: values.harvest_date,
        farmUnitId: values.farm_unit_id,
        quantity: values.quantity,
        unit: values.unit,
        notes: values.notes,
      });
      setLocalDraft(saved);
      setLocalState(saved.state);
      setSuccess("Saved on this device.");
      return saved;
    } catch (caught) {
      setError(errorMessage(caught));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function officialSubmit() {
    if (!user || !localDraft) return;
    setBusy(true);
    setError("");
    try {
      const saved = await saveLocalHarvestDraft(user.id, localDraft.id, {
        harvestDate: values.harvest_date,
        farmUnitId: values.farm_unit_id,
        quantity: values.quantity,
        unit: values.unit,
        notes: values.notes,
      });
      await queueHarvestSubmission(user.id, saved.id);
      setLocalState("pending_submission");
      const outcome = await syncHarvest(user.id);
      const refreshed = await ownerHarvestDraft(user.id, saved.id);
      if (refreshed) applyLocal(refreshed);
      setReviewing(false);

      if (outcome === "synced") {
        const submitted = await getHarvest(saved.id);
        applyRecord(submitted);
        setSuccess("Harvest submitted and confirmed by the server.");
        setHistory((await harvestAudit(submitted.id)).items);
      } else if (outcome === "waiting") {
        setSuccess("Saved on this device. Waiting to sync.");
      } else if (outcome === "authentication_required") {
        setError("Sign in as the same user to synchronize this Harvest.");
      } else {
        setLocalState("needs_attention");
        setError(
          refreshed?.lastMessage ??
            "Harvest needs attention before it can be confirmed.",
        );
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    if (!user || !localDraft) return;
    setBusy(true);
    setError("");
    const outcome = await syncHarvest(user.id);
    const refreshed = await ownerHarvestDraft(user.id, localDraft.id);
    if (refreshed) applyLocal(refreshed);
    if (outcome === "synced") {
      try {
        const submitted = await getHarvest(localDraft.id);
        applyRecord(submitted);
        setSuccess("Harvest confirmed by the server.");
        setHistory((await harvestAudit(submitted.id)).items);
      } catch (caught) {
        setError(errorMessage(caught));
      }
    } else if (outcome === "waiting") {
      setSuccess("Still waiting for a reliable connection.");
    } else if (outcome === "authentication_required") {
      setError("Sign in as the same user to synchronize this Harvest.");
    } else {
      setLocalState("needs_attention");
      setError(
        refreshed?.lastMessage ??
          "Harvest needs attention. The device copy has been preserved.",
      );
    }
    setBusy(false);
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
      applyRecord(corrected);
      setReason("");
      setCorrecting(false);
      setSuccess("Harvest correction recorded.");
      setHistory((await harvestAudit(corrected.id)).items);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!user || (!record && !localDraft))
    return (
      <main className="auth-loading">
        {error ? (
          <Alert title="Harvest unavailable" tone="error">
            {error}
          </Alert>
        ) : (
          <LoadingIndicator label="Loading Harvest record…" />
        )}
      </main>
    );

  const submitted = record?.status === "submitted";
  const pending =
    !submitted &&
    (localState === "pending_submission" ||
      localState === "syncing" ||
      localState === "needs_attention");

  if (pending && localDraft)
    return (
      <FieldShell
        context={`Harvest · ${date}`}
        status={
          localState === "needs_attention"
            ? "Needs attention"
            : "Waiting to sync"
        }
        actions={
          <Button disabled={busy} onClick={() => void syncNow()}>
            {busy ? "Syncing…" : "Sync now"}
          </Button>
        }
      >
        <h1 className="field-title">Harvest saved on this device</h1>
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
            localDraft.lastMessage ||
            "This Harvest is not yet confirmed by the server."}
        </Alert>
        <p>
          Keep this browser data on the device. Only the same authenticated user
          can synchronize it.
        </p>
        <dl className="record-summary">
          <dt>FarmUnit</dt>
          <dd>
            {farmUnit?.code ?? localDraft.farmUnitId} — {farmUnit?.name ?? ""}
          </dd>
          <dt>Quantity</dt>
          <dd>
            {quantity} {unitLabel(unit)}
          </dd>
        </dl>
      </FieldShell>
    );

  return (
    <FieldShell
      context={submitted ? "Submitted harvest" : "Harvest capture"}
      status={<Link href="/harvest">Harvest records</Link>}
      actions={
        !submitted ? (
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
      {!verifiedOnline && !submitted ? (
        <Alert title="Offline Harvest" tone="info">
          This draft is saved only on this device until it synchronizes.
        </Alert>
      ) : null}
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
      {submitted && record ? (
        <p>
          Recorded by {record.created_by_name}. Submitted by{" "}
          {record.submitted_by_name ?? "—"} at{" "}
          {record.submitted_at
            ? new Date(record.submitted_at).toLocaleString()
            : "—"}
          .
        </p>
      ) : null}
      <form className="harvest-form" onSubmit={correction}>
        <label>
          Harvest date
          <TextInput
            aria-label="Harvest date"
            type="date"
            value={date}
            disabled={submitted && !correcting}
            onChange={(event) => setDate(event.target.value)}
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
                onChange={(event) => setSearch(event.target.value)}
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
                <p>No prepared active FarmUnits match this search.</p>
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
              onChange={(event) => setQuantity(event.target.value)}
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
            onChange={(event) => setUnit(event.target.value as HarvestUnit)}
          >
            <option value="fruit_count">Fruit count</option>
            <option value="kilograms">Kilograms</option>
          </select>
        </label>
        <label>
          Operational note (optional)
          <TextArea
            maxLength={500}
            value={notes}
            disabled={submitted && !correcting}
            onChange={(event) => setNotes(event.target.value)}
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
                  onChange={(event) => setReason(event.target.value)}
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
