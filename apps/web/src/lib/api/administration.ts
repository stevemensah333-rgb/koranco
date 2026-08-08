import { apiRequest } from "./client";
import { csrfHeaders } from "./auth";

export type Role = "manager" | "supervisor" | "worker";
export type ApplicationUser = {
  id: string;
  login_identifier: string;
  display_name: string;
  role: Role;
  status: "active" | "disabled";
  password_change_required: boolean;
  created_at: string;
};
export type SecurityEvent = {
  id: string;
  event_type: string;
  actor_user_id: string | null;
  subject_user_id: string | null;
  details: Record<string, unknown> | null;
  occurred_at: string;
};

export const listUsers = () =>
  apiRequest<{ items: ApplicationUser[]; total: number }>(
    "/api/v1/admin/users",
  );
export const listSecurityEvents = () =>
  apiRequest<{ items: SecurityEvent[]; total: number }>(
    "/api/v1/admin/security-events",
  );
export const createUser = (payload: {
  login_identifier: string;
  display_name: string;
  role: Role;
  initial_password: string;
  current_password?: string;
}) =>
  apiRequest<ApplicationUser>("/api/v1/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify(payload),
  });
export const changeRole = (id: string, role: Role, current_password?: string) =>
  apiRequest<ApplicationUser>(`/api/v1/admin/users/${id}/role`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify({ role, current_password }),
  });
export const setUserStatus = (
  id: string,
  action: "disable" | "reactivate",
  current_password?: string,
) =>
  apiRequest<ApplicationUser>(`/api/v1/admin/users/${id}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify({ current_password }),
  });
export const resetUserPassword = (
  id: string,
  replacement_password: string,
  current_password?: string,
) =>
  apiRequest<void>(`/api/v1/admin/users/${id}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify({ replacement_password, current_password }),
  });
export const revokeUserSessions = (id: string) =>
  apiRequest<void>(`/api/v1/admin/users/${id}/sessions/revoke`, {
    method: "POST",
    headers: csrfHeaders(),
  });
