import { AdminShell } from "@/components/admin/admin-shell";
import { UsersAdmin } from "@/components/admin/users-admin";
export default function UsersPage() {
  return (
    <AdminShell current="users">
      <UsersAdmin />
    </AdminShell>
  );
}
