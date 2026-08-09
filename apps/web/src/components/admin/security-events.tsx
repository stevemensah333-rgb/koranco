"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { PageHeader } from "@/components/ui/page-header";
import {
  listSecurityEvents,
  type SecurityEvent,
} from "@/lib/api/administration";

function formatEventDetails(details: Record<string, unknown> | null) {
  if (!details) return "—";
  const type = details.export_type;
  if (type) {
    const rows =
      typeof details.row_count === "number"
        ? ` · ${details.row_count} rows`
        : "";
    return `Export ${type}${rows}`;
  }
  return "—";
}

export function SecurityEventsAdmin() {
  const [events, setEvents] = useState<SecurityEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    listSecurityEvents()
      .then((r) => setEvents(r.items))
      .catch(() => setFailed(true));
  }, []);
  return (
    <>
      <PageHeader
        title="Security events"
        description="Authentication and account-administration history. Initial retention policy is at least 12 months."
      />
      {failed ? (
        <Alert title="Events unavailable" tone="error">
          Security events could not be loaded.
        </Alert>
      ) : null}
      <section className="content-section">
        {!events && !failed ? (
          <LoadingIndicator label="Loading security events…" />
        ) : events?.length === 0 ? (
          <EmptyState
            description="No security events are recorded."
            heading="No security events"
          />
        ) : events ? (
          <div
            aria-label="Security event history"
            className="table-scroll"
            role="region"
            tabIndex={0}
          >
            <table className="data-table">
              <caption className="sr-only">Security event history</caption>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Actor</th>
                  <th>Subject</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{new Date(event.occurred_at).toLocaleString()}</td>
                    <td>{event.event_type.replaceAll("_", " ")}</td>
                    <td>{event.actor_user_id ?? "System"}</td>
                    <td>{event.subject_user_id ?? "—"}</td>
                    <td>{formatEventDetails(event.details)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}
