import { csrfHeaders } from "@/lib/api/auth";
import { apiRequest } from "@/lib/api/client";

export type Worker = {
  id: string;
  worker_code: string;
  full_name: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};
export type AuditEvent = {
  id: string;
  action: string;
  actor_user_id: string;
  actor_display_name: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  reason: string | null;
  occurred_at: string;
};
export const listWorkers = (search = "", status = "") => {
  const query = new URLSearchParams();
  if (search) query.set("search", search);
  if (status) query.set("status", status);
  return apiRequest<{
    items: Worker[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/v1/workers?${query.toString()}`);
};
export const saveWorker = (
  worker: Worker | null,
  payload: { worker_code: string; full_name: string },
) =>
  apiRequest<Worker>(
    worker ? `/api/v1/workers/${worker.id}` : "/api/v1/workers",
    {
      method: worker ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify(payload),
    },
  );
export const setWorkerStatus = (worker: Worker, reason = "") =>
  apiRequest<Worker>(
    `/api/v1/workers/${worker.id}/${worker.status === "active" ? "deactivate" : "reactivate"}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify({ reason: reason || null }),
    },
  );
export const workerAudit = (id: string) =>
  apiRequest<{ items: AuditEvent[]; total: number }>(
    `/api/v1/workers/${id}/audit`,
  );
