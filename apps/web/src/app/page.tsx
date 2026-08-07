import { ApiStatus } from "@/components/api-status";
import { ManagementShell } from "@/components/shells/management-shell";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

const navigation = [{ current: true, href: "/", label: "System status" }];

export default function Home() {
  return (
    <ManagementShell
      navigation={navigation}
      utility={<StatusBadge>Foundation phase</StatusBadge>}
    >
      <PageHeader
        description="The technical and visual foundation is running. Operational workflows will be added only after Koranco validates their requirements."
        title="System status"
      />
      <section className="content-section" aria-labelledby="api-status-heading">
        <h2 className="section-heading" id="api-status-heading">
          API connection
        </h2>
        <ApiStatus />
      </section>
      <section className="content-section" aria-label="Implementation status">
        <Alert title="No operational modules are active" tone="info">
          This page confirms the application foundation only. It contains no
          farm records or management reporting.
        </Alert>
      </section>
    </ManagementShell>
  );
}
