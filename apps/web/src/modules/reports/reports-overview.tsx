"use client";

import { useEffect, useState } from "react";

import { ManagementShell } from "@/components/shells/management-shell";
import { managementNavigation } from "@/components/shells/management-navigation";
import { Alert } from "@/components/ui/alert";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentSession, type AuthenticatedUser } from "@/lib/api/auth";
import { OverviewContent } from "./overview-content";
import { ReportsNav } from "./reports-nav";

export function ReportsOverview() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [error, setError] = useState("");

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

  if (!user && !error)
    return (
      <main className="auth-loading">
        <LoadingIndicator label="Checking reports access…" />
      </main>
    );

  const canExport = user?.permissions.includes("exports.create") ?? false;

  return (
    <ManagementShell navigation={managementNavigation(user, "/reports")}>
      <PageHeader
        title="Reports"
        description="Cross-domain operational understanding of confirmed Attendance and Harvest recorded in PostgreSQL."
      />
      {error ? (
        <Alert title="Reports unavailable" tone="error">
          {error}
        </Alert>
      ) : null}
      {user ? (
        <>
          <ReportsNav current="overview" />
          <OverviewContent canExport={canExport} showDateFilter showExports />
        </>
      ) : null}
    </ManagementShell>
  );
}
