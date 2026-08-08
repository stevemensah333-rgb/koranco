import { publicConfig } from "@/lib/config/public";
import { csrfHeaders } from "@/lib/api/auth";
import { apiRequest } from "@/lib/api/client";

export type HarvestUnit = "fruit_count" | "kilograms";

export type HarvestUnitTotal = {
  unit: HarvestUnit;
  record_count: number;
  quantity: string;
};

export type OverviewAttendance = {
  submitted_sessions: number;
  present_count: number;
  absent_count: number;
  roster_count: number;
};

export type OverviewHarvest = {
  submitted_records: number;
  by_unit: HarvestUnitTotal[];
};

export type RecentAttendanceSession = {
  id: string;
  attendance_date: string;
  submitted_by_name: string | null;
  submitted_at: string | null;
  present_count: number;
  absent_count: number;
  roster_count: number;
};

export type RecentHarvestRecord = {
  id: string;
  harvest_date: string;
  farm_unit_id: string;
  farm_unit_code: string;
  farm_unit_name: string;
  quantity: string;
  unit: HarvestUnit;
  submitted_by_name: string | null;
  submitted_at: string | null;
};

export type OverviewResponse = {
  date: string;
  attendance: OverviewAttendance;
  harvest: OverviewHarvest;
  recent_attendance: RecentAttendanceSession[];
  recent_harvest: RecentHarvestRecord[];
};

export type AttendanceSessionReport = {
  id: string;
  attendance_date: string;
  submitted_at: string | null;
  submitted_by_id: string | null;
  submitted_by_name: string | null;
  recorded_by_name: string;
  present_count: number;
  absent_count: number;
  roster_count: number;
};

export type AttendanceReportResponse = {
  date_from: string;
  date_to: string;
  submitted_session_count: number;
  present_count: number;
  absent_count: number;
  roster_count: number;
  sessions: AttendanceSessionReport[];
};

export type HarvestFarmUnitTotal = {
  farm_unit_id: string;
  farm_unit_code: string;
  farm_unit_name: string;
  farm_unit_type: string;
  record_count: number;
  by_unit: HarvestUnitTotal[];
};

export type HarvestSourceRecord = {
  id: string;
  harvest_date: string;
  farm_unit_id: string;
  farm_unit_code: string;
  farm_unit_name: string;
  farm_unit_type: string;
  quantity: string;
  unit: HarvestUnit;
  notes: string | null;
  submitted_by_name: string | null;
  submitted_at: string | null;
};

export type HarvestReportResponse = {
  date_from: string;
  date_to: string;
  submitted_record_count: number;
  by_unit: HarvestUnitTotal[];
  by_farm_unit: HarvestFarmUnitTotal[];
  records: HarvestSourceRecord[];
};

export function getOverview(params: { date?: string; recent?: number } = {}) {
  const query = new URLSearchParams();
  if (params.date) query.set("date", params.date);
  if (params.recent) query.set("recent", String(params.recent));
  return apiRequest<OverviewResponse>(`/api/v1/reports/overview?${query}`);
}

export function getAttendanceReport(
  params: {
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  } = {},
) {
  const query = new URLSearchParams();
  if (params.dateFrom) query.set("date_from", params.dateFrom);
  if (params.dateTo) query.set("date_to", params.dateTo);
  if (params.limit) query.set("limit", String(params.limit));
  return apiRequest<AttendanceReportResponse>(
    `/api/v1/reports/attendance?${query}`,
  );
}

export function getHarvestReport(
  params: {
    dateFrom?: string;
    dateTo?: string;
    farmUnitId?: string;
    unit?: string;
    limit?: number;
  } = {},
) {
  const query = new URLSearchParams();
  if (params.dateFrom) query.set("date_from", params.dateFrom);
  if (params.dateTo) query.set("date_to", params.dateTo);
  if (params.farmUnitId) query.set("farm_unit_id", params.farmUnitId);
  if (params.unit) query.set("unit", params.unit);
  if (params.limit) query.set("limit", String(params.limit));
  return apiRequest<HarvestReportResponse>(`/api/v1/reports/harvest?${query}`);
}

export function buildExportUrl(
  kind: "attendance" | "harvest",
  params: {
    dateFrom?: string;
    dateTo?: string;
    farmUnitId?: string;
    unit?: string;
  },
) {
  const query = new URLSearchParams();
  if (params.dateFrom) query.set("date_from", params.dateFrom);
  if (params.dateTo) query.set("date_to", params.dateTo);
  if (kind === "harvest") {
    if (params.farmUnitId) query.set("farm_unit_id", params.farmUnitId);
    if (params.unit) query.set("unit", params.unit);
  }
  return `${publicConfig.apiOrigin}/api/v1/reports/exports/${kind}?${query}`;
}

export async function downloadCsv(path: string): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { ...csrfHeaders() },
  });
  if (!response.ok) {
    throw new Error("Export failed");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = path.split("/").pop() ?? "koranco-export.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
