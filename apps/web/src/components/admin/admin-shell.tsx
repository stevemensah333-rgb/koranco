"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ManagementShell } from "@/components/shells/management-shell";
import { managementNavigation } from "@/components/shells/management-navigation";
import { Alert } from "@/components/ui/alert";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { getCurrentSession, type AuthenticatedUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

export function AdminShell({
  children,
  current,
}: {
  children: ReactNode;
  current: "users" | "events";
}) {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    getCurrentSession()
      .then((value) => {
        if (!value.permissions.includes("users.read")) setDenied(true);
        else setUser(value);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401)
          router.replace("/login");
        else setDenied(true);
      });
  }, [router]);
  if (denied)
    return (
      <main className="auth-loading">
        <Alert title="Access denied" tone="error">
          You do not have permission to use administration.
        </Alert>
      </main>
    );
  if (!user)
    return (
      <main className="auth-loading">
        <LoadingIndicator label="Checking administration access…" />
      </main>
    );
  return (
    <ManagementShell
      navigation={managementNavigation(
        user,
        current === "users" ? "/admin/users" : "/admin/security-events",
      )}
    >
      {children}
    </ManagementShell>
  );
}
