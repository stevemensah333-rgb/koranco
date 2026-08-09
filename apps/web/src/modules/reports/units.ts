import type { HarvestUnit } from "./api";

/**
 * Presentation helpers for Harvest units and report quantities.
 *
 * Harvest units are a constrained set and are NEVER combined: each unit keeps
 * its own total, series, and chart. These helpers only format one unit at a
 * time and take the unit explicitly so a value is never shown without its unit.
 */

const UNIT_LONG_LABEL: Record<HarvestUnit, string> = {
  fruit_count: "Fruit count",
  kilograms: "Kilograms",
};

const UNIT_SHORT_LABEL: Record<HarvestUnit, string> = {
  fruit_count: "fruit",
  kilograms: "kg",
};

export const HARVEST_UNITS: readonly HarvestUnit[] = [
  "fruit_count",
  "kilograms",
];

export function isHarvestUnit(value: string): value is HarvestUnit {
  return value === "fruit_count" || value === "kilograms";
}

export function harvestUnitLabel(unit: HarvestUnit): string {
  return UNIT_LONG_LABEL[unit];
}

export function harvestUnitShortLabel(unit: HarvestUnit): string {
  return UNIT_SHORT_LABEL[unit];
}

/** "12450.000" / "840.500" -> "12,450" / "840.5" with a 3-decimal cap. */
export function formatQuantity(value: string | number): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3,
  }).format(numeric);
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-08-05" -> "Aug 5". Deterministic; never uses local timezones. */
export function formatShortDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return isoDate;
  return `${MONTHS[month - 1]} ${day}`;
}

/** Increment an ISO date by whole days (no timezone involvement). */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
