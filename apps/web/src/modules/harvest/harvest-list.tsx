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
import { listHarvest, type HarvestRecord } from "./api";

const unitLabel = (unit: string) =>
  unit === "fruit_count" ? "Fruit count" : "Kilograms";

export function HarvestList() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [items, setItems] = useState<HarvestRecord[] | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [unit, setUnit] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  useEffect(() => {
    getCurrentSession()
      .then((current) => {
        if (!current.permissions.includes("harvest.read"))
          setError("You do not have permission to access Harvest.");
        else setUser(current);
      })
      .catch(() =>
        setError(
          "Your session could not be verified. Harvest requires an online connection.",
        ),
      );
  }, []);
  useEffect(() => {
    if (user) {
      listHarvest({ status, unit, dateFrom, dateTo })
        .then((result) => {
          setItems(result.items);
          setError("");
        })
        .catch(() => {
          setItems([]);
          setError(
            "Harvest records could not be loaded. Check the connection and try again.",
          );
        });
    }
  }, [user, status, unit, dateFrom, dateTo]);
  const nav = managementNavigation(user, "/harvest");
  if (!user && !error)
    return (
      <main className="auth-loading">
        <LoadingIndicator label="Checking Harvest access…" />
      </main>
    );
  return (
    <ManagementShell navigation={nav}>
      <PageHeader
        title="Harvest"
        description="Record and inspect official harvest quantities by operational FarmUnit."
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
      {user ? (
        <section className="content-section">
          <h2 className="section-heading">Records</h2>
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
              Unit
              <select
                className="text-input"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
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
          {items === null ? (
            <LoadingIndicator label="Loading harvest records…" />
          ) : items.length === 0 ? (
            <p>No harvest records match the current filters.</p>
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
                      <td>{item.submitted_by_name ?? item.created_by_name}</td>
                      <td>
                        <a href={`/harvest/${item.id}`}>
                          {item.status === "draft" ? "Resume" : "View"}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </ManagementShell>
  );
}
