"use client";

import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { OverviewContent } from "./overview-content";

type ManagementOverviewProps = {
  apiStatus: "loading" | "available" | "unavailable";
};

/**
 * The authenticated home for reporting-capable users. Replaces the bare
 * "System status" screen with the management overview; the technical API
 * connection status is preserved as a subordinate footnote rather than the
 * whole page. The management shell is provided by the caller.
 */
export function ManagementOverview({ apiStatus }: ManagementOverviewProps) {
  return (
    <>
      <PageHeader
        actions={
          <Link
            className="button button-secondary button-compact"
            href="/reports"
          >
            Open Reports
          </Link>
        }
        description="What is happening on the farm today, from submitted Attendance and Harvest records in the authoritative database."
        title="Overview"
      />
      <OverviewContent
        canExport={false}
        showDateFilter={false}
        showExports={false}
      />
      <section className="system-status-line" aria-label="System status">
        {apiStatus === "available" ? (
          <StatusBadge tone="success">API connection confirmed</StatusBadge>
        ) : null}
        {apiStatus === "unavailable" ? (
          <StatusBadge tone="error">Protected service unavailable</StatusBadge>
        ) : null}
        <p>
          Reporting is online-only and reflects confirmed records at query time;
          unsynchronized field work is excluded until the API confirms it.
        </p>
      </section>
    </>
  );
}
