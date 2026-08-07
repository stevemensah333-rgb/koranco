"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { PageHeader } from "@/components/ui/page-header";
import {
  listSecurityEvents,
  type SecurityEvent,
} from "@/lib/api/administration";

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
          <p>No security events are recorded.</p>
        ) : events ? (
          <div className="table-scroll" tabIndex={0}>
            <table className="data-table">
              <caption className="sr-only">Security event history</caption>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Actor</th>
                  <th>Subject</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{new Date(event.occurred_at).toLocaleString()}</td>
                    <td>{event.event_type.replaceAll("_", " ")}</td>
                    <td>{event.actor_user_id ?? "System"}</td>
                    <td>{event.subject_user_id ?? "—"}</td>
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
