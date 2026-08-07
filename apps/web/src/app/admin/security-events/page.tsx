import { AdminShell } from "@/components/admin/admin-shell";
import { SecurityEventsAdmin } from "@/components/admin/security-events";
export default function SecurityEventsPage() {
  return (
    <AdminShell current="events">
      <SecurityEventsAdmin />
    </AdminShell>
  );
}
