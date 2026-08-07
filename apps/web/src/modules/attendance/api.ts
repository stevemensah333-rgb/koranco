import { csrfHeaders } from "@/lib/api/auth";
import { apiRequest } from "@/lib/api/client";
import type { AuditEvent } from "@/modules/workers/api";
import type { Worker } from "@/modules/workers/api";

export type AttendanceStatus = "present" | "absent";
export type AttendanceEntry = {
  id: string;
  worker_id: string;
  worker_code: string;
  worker_name: string;
  worker_active: boolean;
  attendance_status: AttendanceStatus | null;
  time_in: string | null;
  time_out: string | null;
  version: number;
  corrected_at: string | null;
};
export type AttendanceSession = {
  id: string;
  attendance_date: string;
  status: "draft" | "submitted";
  version: number;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  submitted_by: string | null;
  submitted_by_name: string | null;
  submitted_at: string | null;
  present_count: number;
  absent_count: number;
  unmarked_count: number;
  entries: AttendanceEntry[];
};
export type AttendanceListItem = {
  id: string;
  attendance_date: string;
  status: "draft" | "submitted";
  created_by_name: string;
  submitted_by_name: string | null;
  submitted_at: string | null;
  entry_count: number;
};
export type DraftEntry = {
  worker_id: string;
  attendance_status: AttendanceStatus | null;
  time_in: string | null;
  time_out: string | null;
};

export const listAttendance = (status = "", dateFrom = "", dateTo = "") => {
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (dateFrom) query.set("date_from", dateFrom);
  if (dateTo) query.set("date_to", dateTo);
  return apiRequest<{
    items: AttendanceListItem[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/v1/attendance-sessions?${query}`);
};
export const getAttendance = (id: string) =>
  apiRequest<AttendanceSession>(`/api/v1/attendance-sessions/${id}`);
export const createAttendance = (attendance_date: string) =>
  apiRequest<AttendanceSession>("/api/v1/attendance-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify({ attendance_date }),
  });
export const saveAttendanceDraft = (
  id: string,
  expected_version: number,
  entries: DraftEntry[],
) =>
  apiRequest<AttendanceSession>(`/api/v1/attendance-sessions/${id}/draft`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify({ expected_version, entries }),
  });
export const submitAttendance = (id: string) =>
  apiRequest<AttendanceSession>(`/api/v1/attendance-sessions/${id}/submit`, {
    method: "POST",
    headers: csrfHeaders(),
  });
export const discardAttendance = (id: string) =>
  apiRequest<void>(`/api/v1/attendance-sessions/${id}/discard`, {
    method: "POST",
    headers: csrfHeaders(),
  });
export const correctAttendance = (
  sessionId: string,
  entryId: string,
  payload: {
    expected_version: number;
    attendance_status: AttendanceStatus;
    time_in: string | null;
    time_out: string | null;
    reason: string;
  },
) =>
  apiRequest<AttendanceSession>(
    `/api/v1/attendance-sessions/${sessionId}/entries/${entryId}/correct`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify(payload),
    },
  );
export const attendanceAudit = (id: string) =>
  apiRequest<{ items: AuditEvent[]; total: number }>(
    `/api/v1/attendance-sessions/${id}/audit`,
  );

export async function activeWorkersForRoster(): Promise<Worker[]> {
  const workers: Worker[] = [];
  let offset = 0;
  do {
    const page = await apiRequest<{
      items: Worker[];
      total: number;
      limit: number;
      offset: number;
    }>(`/api/v1/workers?status=active&limit=100&offset=${offset}`);
    workers.push(...page.items);
    offset += page.items.length;
    if (workers.length >= page.total || page.items.length === 0) break;
  } while (true);
  return workers;
}
