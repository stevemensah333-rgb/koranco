import { csrfHeaders } from "@/lib/api/auth";
import { apiRequest } from "@/lib/api/client";
import type { AuditEvent } from "@/modules/workers/api";

export type FarmUnit = {
  id: string;
  code: string;
  name: string;
  unit_type: "field" | "block";
  parent_id: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};
export const listFarmUnits = (search = "", status = "", unitType = "") => {
  const query = new URLSearchParams();
  if (search) query.set("search", search);
  if (status) query.set("status", status);
  if (unitType) query.set("unit_type", unitType);
  return apiRequest<{
    items: FarmUnit[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/v1/farm-units?${query.toString()}`);
};

export async function activeFarmUnitsForOffline(): Promise<FarmUnit[]> {
  const units: FarmUnit[] = [];
  let offset = 0;
  do {
    const page = await apiRequest<{
      items: FarmUnit[];
      total: number;
      limit: number;
      offset: number;
    }>(`/api/v1/farm-units?status=active&limit=100&offset=${offset}`);
    units.push(...page.items);
    offset += page.items.length;
    if (units.length >= page.total || page.items.length === 0) break;
  } while (true);
  return units;
}
export const saveFarmUnit = (
  unit: FarmUnit | null,
  payload: {
    code: string;
    name: string;
    unit_type: string;
    parent_id: string | null;
  },
) =>
  apiRequest<FarmUnit>(
    unit ? `/api/v1/farm-units/${unit.id}` : "/api/v1/farm-units",
    {
      method: unit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify(payload),
    },
  );
export const setFarmUnitStatus = (unit: FarmUnit) =>
  apiRequest<FarmUnit>(
    `/api/v1/farm-units/${unit.id}/${unit.status === "active" ? "deactivate" : "reactivate"}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify({}),
    },
  );
export const farmUnitAudit = (id: string) =>
  apiRequest<{ items: AuditEvent[]; total: number }>(
    `/api/v1/farm-units/${id}/audit`,
  );
