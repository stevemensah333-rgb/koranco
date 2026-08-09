"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ManagementShell } from "@/components/shells/management-shell";
import { managementNavigation } from "@/components/shells/management-navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/inputs";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentSession, type AuthenticatedUser } from "@/lib/api/auth";
import {
  cacheFarmUnits,
  cachedFarmUnits,
  ownerHarvestDrafts,
  recordOfflineLease,
  validOfflineLease,
  type LocalHarvestDraft,
} from "@/modules/attendance/offline/db";
import { activeFarmUnitsForOffline } from "@/modules/farm-structure/api";
import { listHarvest, type HarvestRecord } from "./api";

const unitLabel = (unit: string) =>
  unit === "fruit_count" ? "Fruit count" : "Kilograms";

function localStatus(item: LocalHarvestDraft) {
  if (item.state === "synced") return "Server confirmed";
  if (item.state === "needs_attention") return "Needs attention";
  if (item.state === "pending_submission" || item.state === "syncing")
    return "Waiting to sync";
  return "Saved on this device";
}

export function HarvestList() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [verifiedOnline, setVerifiedOnline] = useState(false);
  const [items, setItems] = useState<HarvestRecord[] | null>(null);
  const [localItems, setLocalItems] = useState<LocalHarvestDraft[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [unit, setUnit] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [preparedAt, setPreparedAt] = useState<string | null>(null);

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
    const local = ownerHarvestDrafts(user.id);
    const remote = verifiedOnline
      ? listHarvest({ status, unit, dateFrom, dateTo })
      : Promise.resolve({ items: [] as HarvestRecord[] });
    Promise.all([remote, local])
      .then(([result, drafts]) => {
        if (!active) return;
        setItems(result.items);
        setLocalItems(drafts);
      })
      .catch(async () => {
        if (!active) return;
        setItems([]);
        setLocalItems(await ownerHarvestDrafts(user.id));
        setError(
          "Official Harvest records could not be loaded. Device drafts remain available.",
        );
      });
    return () => {
      active = false;
    };
  }, [user, verifiedOnline, status, unit, dateFrom, dateTo]);

  async function prepareFarmUnits() {
    if (!user) return;
    setPreparing(true);
    try {
      const units = await activeFarmUnitsForOffline();
      const fetchedAt = await cacheFarmUnits(user.id, units);
      setPreparedAt(fetchedAt);
      setError("");
    } catch {
      const cached = await cachedFarmUnits(user.id);
      setError(
        cached.length
          ? "FarmUnits could not be refreshed. The existing device copy remains available."
          : "FarmUnit preparation requires a working connection.",
      );
    } finally {
      setPreparing(false);
    }
  }

  const nav = managementNavigation(user, "/harvest");
  if (!user && !error)
    return (
      <main className="auth-loading">
        <LoadingIndicator label="Checking Harvest access…" />
      </main>
    );

  return (
    <ManagementShell navigation={nav} user={user}>
      <PageHeader
        title="Harvest"
        description="Capture Harvest in the field and inspect server-confirmed quantities by operational FarmUnit."
        actions={
          user?.permissions.includes("harvest.record") ? (
            <Link className="button button-primary" href="/harvest/new">
              Record harvest
            </Link>
          ) : undefined
        }
      />
      {error ? (
        <Alert title="Harvest unavailable" tone="error">
          {error}
        </Alert>
      ) : null}
      {user?.permissions.includes("harvest.record") ? (
        <section className="content-section">
          <h2 className="section-heading">Prepare for field capture</h2>
          <p>
            Refresh active FarmUnits while connected before taking this device
            into a low-connectivity area.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={preparing}
            onClick={() => void prepareFarmUnits()}
          >
            {preparing ? "Preparing…" : "Prepare FarmUnits for offline use"}
          </Button>
          {preparedAt ? (
            <p>FarmUnits refreshed {new Date(preparedAt).toLocaleString()}.</p>
          ) : null}
        </section>
      ) : null}
      {user ? (
        <>
          <section className="content-section">
            <h2 className="section-heading">On this device</h2>
            {localItems.length ? (
              <div className="device-record-list">
                {localItems.map((item) => (
                  <p key={item.id}>
                    <Link href={`/harvest/${item.id}`}>
                      {item.harvestDate} · {item.quantity || "No quantity"}{" "}
                      {item.unit ? unitLabel(item.unit) : ""}
                    </Link>
                    {" · "}
                    {localStatus(item)}
                  </p>
                ))}
              </div>
            ) : (
              <p>No Harvest is saved on this device for this user.</p>
            )}
          </section>
          <section className="content-section">
            <h2 className="section-heading">Official records</h2>
            <div className="register-filters">
              <label>
                Status
                <select
                  className="text-input"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="">All</option>
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                </select>
              </label>
              <label>
                Unit
                <select
                  className="text-input"
                  value={unit}
                  onChange={(event) => setUnit(event.target.value)}
                >
                  <option value="">All</option>
                  <option value="fruit_count">Fruit count</option>
                  <option value="kilograms">Kilograms</option>
                </select>
              </label>
              <label>
                From
                <TextInput
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </label>
              <label>
                To
                <TextInput
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </label>
            </div>
            {items === null ? (
              <LoadingIndicator label="Loading Harvest records…" />
            ) : items.length === 0 ? (
              <p>
                No server-confirmed Harvest records match the current filters.
              </p>
            ) : (
              <div className="table-scroll" tabIndex={0}>
                <table className="data-table">
                  <caption className="sr-only">Harvest records</caption>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>FarmUnit</th>
                      <th>Quantity</th>
                      <th>Status</th>
                      <th>Recorded by</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.harvest_date}</td>
                        <td>
                          <strong>{item.farm_unit_code}</strong>
                          <br />
                          <span className="muted-text">
                            {item.farm_unit_name} · {item.farm_unit_type}
                          </span>
                        </td>
                        <td className="numeric">
                          {item.quantity} {unitLabel(item.unit)}
                        </td>
                        <td>{item.status}</td>
                        <td>
                          {item.submitted_by_name ?? item.created_by_name}
                        </td>
                        <td>
                          <Link href={`/harvest/${item.id}`}>
                            {item.status === "draft" ? "Resume" : "View"}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </ManagementShell>
  );
}
