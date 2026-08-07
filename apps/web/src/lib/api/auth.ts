import { apiRequest } from "./client";

export type AuthenticatedUser = {
  id: string;
  login_identifier: string;
  display_name: string;
  permissions: string[];
  role: "manager" | "supervisor" | "worker";
  password_change_required: boolean;
};

function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const prefix = "koranco_csrf=";
  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
}

export function csrfHeaders(): Record<string, string> {
  return { "X-CSRF-Token": readCsrfToken() };
}

export function login(
  loginIdentifier: string,
  password: string,
): Promise<AuthenticatedUser> {
  return apiRequest("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login_identifier: loginIdentifier, password }),
  });
}

export function getCurrentSession(
  signal?: AbortSignal,
): Promise<AuthenticatedUser> {
  return apiRequest("/api/v1/auth/session", { signal });
}

export function logout(): Promise<void> {
  return apiRequest("/api/v1/auth/logout", {
    method: "POST",
    headers: csrfHeaders(),
  });
}

export function getProtectedSystemStatus(
  signal?: AbortSignal,
): Promise<{ status: string }> {
  return apiRequest("/api/v1/system/status", { signal });
}

export function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  return apiRequest("/api/v1/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}
