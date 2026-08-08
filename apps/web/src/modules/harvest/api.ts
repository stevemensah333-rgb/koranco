import { csrfHeaders } from "@/lib/api/auth";
import { apiRequest } from "@/lib/api/client";
import type { AuditEvent } from "@/modules/workers/api";

export type HarvestUnit = "fruit_count" | "kilograms";
export type HarvestRecord = {
  id: string;
  harvest_date: string;
  farm_unit_id: string;
  farm_unit_code: string;
  farm_unit_name: string;
  farm_unit_type: "field" | "block";
  farm_unit_active: boolean;
  quantity: string;
  unit: HarvestUnit;
  notes: string | null;
  status: "draft" | "submitted";
  version: number;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  submitted_by: string | null;
  submitted_by_name: string | null;
  submitted_at: string | null;
};
export type HarvestValues = {
  harvest_date: string;
  farm_unit_id: string;
  quantity: string;
  unit: HarvestUnit;
  notes: string | null;
};

export function listHarvest(
  filters: {
    status?: string;
    unit?: string;
    farmUnitId?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {},
) {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.unit) query.set("unit", filters.unit);
  if (filters.farmUnitId) query.set("farm_unit_id", filters.farmUnitId);
  if (filters.dateFrom) query.set("date_from", filters.dateFrom);
  if (filters.dateTo) query.set("date_to", filters.dateTo);
  return apiRequest<{
    items: HarvestRecord[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/v1/harvest-records?${query}`);
}
export const getHarvest = (id: string) =>
  apiRequest<HarvestRecord>(`/api/v1/harvest-records/${id}`);
export const createHarvest = (values: HarvestValues) =>
  apiRequest<HarvestRecord>("/api/v1/harvest-records", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify(values),
  });
export const updateHarvest = (record: HarvestRecord, values: HarvestValues) =>
  apiRequest<HarvestRecord>(`/api/v1/harvest-records/${record.id}/draft`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify({ ...values, expected_version: record.version }),
  });
export const submitHarvest = (id: string) =>
  apiRequest<HarvestRecord>(`/api/v1/harvest-records/${id}/submit`, {
    method: "POST",
    headers: csrfHeaders(),
  });
export const correctHarvest = (
  record: HarvestRecord,
  values: HarvestValues,
  reason: string,
) =>
  apiRequest<HarvestRecord>(`/api/v1/harvest-records/${record.id}/correct`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify({
      ...values,
      expected_version: record.version,
      reason,
      confirmed: true,
    }),
  });
export const harvestAudit = (id: string) =>
  apiRequest<{ items: AuditEvent[]; total: number }>(
    `/api/v1/harvest-records/${id}/audit`,
  );
