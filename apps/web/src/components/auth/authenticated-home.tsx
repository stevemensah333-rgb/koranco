"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ManagementShell } from "@/components/shells/management-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiError } from "@/lib/api/client";
import {
  type AuthenticatedUser,
  getCurrentSession,
  getProtectedSystemStatus,
  changeOwnPassword,
  logout,
} from "@/lib/api/auth";

export function AuthenticatedHome() {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [status, setStatus] = useState<"loading" | "available" | "unavailable">(
    "loading",
  );
  const [logoutPending, setLogoutPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getCurrentSession(controller.signal)
      .then((currentUser) => {
        setUser(currentUser);
        if (currentUser.password_change_required) {
          setStatus("available");
          return { status: "password-change" };
        }
        return getProtectedSystemStatus(controller.signal);
      })
      .then(() => setStatus("available"))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login");
          return;
        }
        setStatus("unavailable");
      });
    return () => controller.abort();
  }, [router]);

  async function handleLogout() {
    setLogoutPending(true);
    try {
      await logout();
      router.replace("/login");
    } catch {
      setLogoutPending(false);
    }
  }

  if (!user) {
    return (
      <main className="auth-loading">
        {status === "unavailable" ? (
          <Alert title="Service unavailable" tone="error">
            The application could not verify your session. Check the API service
            and try again.
          </Alert>
        ) : (
          <LoadingIndicator label="Checking your session…" />
        )}
      </main>
    );
  }

  if (user.password_change_required) {
    return (
      <main className="auth-loading">
        <form
          className="login-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            try {
              await changeOwnPassword(
                String(data.get("current_password") ?? ""),
                String(data.get("new_password") ?? ""),
              );
              setUser({ ...user, password_change_required: false });
              setStatus("loading");
              await getProtectedSystemStatus();
              setStatus("available");
            } catch {
              setStatus("unavailable");
            }
          }}
        >
          <h1 className="section-heading">Choose a new password</h1>
          <p>
            Your temporary or reset credential must be replaced before
            continuing.
          </p>
          <label>
            Current password
            <input
              className="text-input"
              type="password"
              name="current_password"
              autoComplete="current-password"
            />
          </label>
          <label>
            New password
            <input
              className="text-input"
              type="password"
              name="new_password"
              autoComplete="new-password"
            />
          </label>
          {status === "unavailable" ? (
            <Alert title="Password not changed" tone="error">
              Check the current password and use at least 12 characters for the
              new password.
            </Alert>
          ) : null}
          <Button type="submit">Change password</Button>
        </form>
      </main>
    );
  }

  return (
    <ManagementShell
      navigation={[
        { current: true, href: "/", label: "System status" },
        ...(user.permissions.includes("workers.read")
          ? [{ href: "/workers", label: "Workers" }]
          : []),
        ...(user.permissions.includes("farm_structure.read")
          ? [{ href: "/farm-structure", label: "Farm structure" }]
          : []),
        ...(user.permissions.includes("users.read")
          ? [
              { href: "/admin/users", label: "Users" },
              { href: "/admin/security-events", label: "Security events" },
            ]
          : []),
      ]}
      utility={
        <div className="session-utility">
          <span className="session-identity">{user.display_name}</span>
          <Button
            disabled={logoutPending}
            onClick={handleLogout}
            variant="secondary"
          >
            {logoutPending ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      }
    >
      <PageHeader
        description="The authenticated technical foundation is running. Operational workflows will be added only after Koranco validates their requirements."
        title="System status"
      />
      <section className="content-section" aria-labelledby="api-status-heading">
        <h2 className="section-heading" id="api-status-heading">
          Protected API connection
        </h2>
        {status === "loading" ? (
          <LoadingIndicator label="Checking access…" />
        ) : null}
        {status === "available" ? (
          <StatusBadge tone="success">Access confirmed</StatusBadge>
        ) : null}
        {status === "unavailable" ? (
          <StatusBadge tone="error">Protected service unavailable</StatusBadge>
        ) : null}
      </section>
      <section className="content-section" aria-label="Implementation status">
        <Alert title="No operational modules are active" tone="info">
          This authenticated area contains no farm records or management
          reporting.
        </Alert>
      </section>
    </ManagementShell>
  );
}
