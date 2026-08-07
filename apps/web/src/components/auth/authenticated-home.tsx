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
  logout,
} from "@/lib/api/auth";

const navigation = [{ current: true, href: "/", label: "System status" }];

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

  return (
    <ManagementShell
      navigation={navigation}
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
