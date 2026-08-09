"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { ApiError } from "@/lib/api/client";
import { logout, type AuthenticatedUser } from "@/lib/api/auth";

/**
 * Account affordance for the authenticated application shell. It is deliberately
 * separate from operational navigation (the same separation Canvas draws
 * between Account and course/operational areas). It shows the signed-in
 * identity and keeps Sign out reachable from every page. It does not invent
 * profile or settings screens that do not exist.
 */
export function AccountMenu({ user }: { user: AuthenticatedUser }) {
  const router = useRouter();
  const menuId = useId();
  const buttonId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node))
        setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleSignOut() {
    if (pending) return;
    setError("");

    try {
      const { hasPendingForOwner } =
        await import("@/modules/attendance/offline/db");
      if (
        (await hasPendingForOwner(user.id)) &&
        !window.confirm(
          "Unsynced Attendance or Harvest will remain on this device and cannot be synchronized by another account. Sign out anyway?",
        )
      )
        return;
    } catch {
      setError(
        "Sign-out was not attempted because this device could not check for unsynced work. Try again.",
      );
      return;
    }

    setPending(true);
    const signedOutUserId = user.id;
    try {
      await logout();
      router.replace("/login");
      void import("@/modules/attendance/offline/db")
        .then(({ suspendOfflineLease }) => suspendOfflineLease(signedOutUserId))
        .catch(() => undefined);
    } catch (signOutError) {
      setError(
        signOutError instanceof ApiError && signOutError.status === 403
          ? "The server rejected the sign-out security check. Your session is still active. Refresh the page and try again."
          : "Koranco could not sign you out. Your session is still active. Check your connection and try again.",
      );
      setPending(false);
    }
  }

  const displayName = user.display_name?.trim() || "Account";
  const roleName = roleLabel(user.role);
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        className="account-trigger"
        disabled={pending}
        id={buttonId}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span aria-hidden="true" className="account-avatar">
          {initials || "?"}
        </span>
        <span className="account-names">
          <span className="account-display-name">{displayName}</span>
          <span className="account-role">{roleName}</span>
        </span>
        <svg
          aria-hidden="true"
          className={`account-caret${open ? " account-caret-open" : ""}`}
          height="12"
          viewBox="0 0 12 12"
          width="12"
        >
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
      </button>
      {error ? (
        <p className="account-error" role="alert">
          {error}
        </p>
      ) : null}
      {open ? (
        <div
          aria-labelledby={buttonId}
          className="account-popover"
          id={menuId}
          role="menu"
        >
          <div className="account-popover-identity">
            <span className="account-popover-name">{displayName}</span>
            <span className="account-popover-meta">
              {roleName}
              {user.login_identifier ? ` · ${user.login_identifier}` : ""}
            </span>
          </div>
          <div className="account-popover-divider" />
          <button
            className="account-signout"
            disabled={pending}
            onClick={() => void handleSignOut()}
            role="menuitem"
            type="button"
          >
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function roleLabel(role: AuthenticatedUser["role"]): string {
  if (role === "manager") return "Manager";
  if (role === "supervisor") return "Supervisor";
  return "Worker";
}
