import type { AuthenticatedUser } from "@/lib/api/auth";

export type ManagementNavItem = {
  current?: boolean;
  href: string;
  label: string;
};

/**
 * Central management navigation. Every entry is gated by the permissions the
 * backend actually grants the authenticated user; frontend hiding is not
 * security, it only avoids presenting unusable links. Manager-only
 * administration stays at the end.
 */
export function managementNavigation(
  user: Pick<AuthenticatedUser, "permissions"> | null,
  current: string,
): ManagementNavItem[] {
  const can = (permission: string) =>
    user?.permissions.includes(permission) ?? false;
  const isCurrent = (path: string) =>
    current === path || current.startsWith(`${path}/`);

  const items: ManagementNavItem[] = [
    {
      href: "/",
      label: can("reports.read") ? "Overview" : "System status",
      current: current === "/",
    },
  ];
  if (can("reports.read"))
    items.push({
      href: "/reports",
      label: "Reports",
      current: isCurrent("/reports"),
    });
  if (can("attendance.read"))
    items.push({
      href: "/attendance",
      label: "Attendance",
      current: isCurrent("/attendance"),
    });
  if (can("harvest.read"))
    items.push({
      href: "/harvest",
      label: "Harvest",
      current: isCurrent("/harvest"),
    });
  if (can("workers.read"))
    items.push({
      href: "/workers",
      label: "Workers",
      current: current === "/workers",
    });
  if (can("farm_structure.read"))
    items.push({
      href: "/farm-structure",
      label: "Farm structure",
      current: current === "/farm-structure",
    });
  if (can("users.read")) {
    items.push({
      href: "/admin/users",
      label: "Users",
      current: current === "/admin/users",
    });
    items.push({
      href: "/admin/security-events",
      label: "Security events",
      current: current === "/admin/security-events",
    });
  }
  return items;
}
