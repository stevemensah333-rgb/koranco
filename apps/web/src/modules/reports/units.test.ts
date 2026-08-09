import { describe, expect, it } from "vitest";

import {
  addDays,
  formatQuantity,
  formatShortDate,
  harvestUnitLabel,
  harvestUnitShortLabel,
} from "./units";

describe("formatQuantity", () => {
  it("groups thousands and trims trailing decimal zeros", () => {
    expect(formatQuantity("12450.000")).toBe("12,450");
    expect(formatQuantity("840.500")).toBe("840.5");
    expect(formatQuantity("50.000")).toBe("50");
    expect(formatQuantity("0.000")).toBe("0");
  });

  it("keeps up to three decimals", () => {
    expect(formatQuantity("1.250")).toBe("1.25");
    expect(formatQuantity("0.005")).toBe("0.005");
  });

  it("falls back to the raw value for unparsable input", () => {
    expect(formatQuantity("abc")).toBe("abc");
  });
});

describe("harvest unit labels", () => {
  it("labels units explicitly so a value is never shown without its unit", () => {
    expect(harvestUnitLabel("fruit_count")).toBe("Fruit count");
    expect(harvestUnitLabel("kilograms")).toBe("Kilograms");
    expect(harvestUnitShortLabel("fruit_count")).toBe("fruit");
    expect(harvestUnitShortLabel("kilograms")).toBe("kg");
  });
});

describe("date helpers", () => {
  it("formats ISO dates without timezone involvement", () => {
    expect(formatShortDate("2026-08-05")).toBe("Aug 5");
    expect(formatShortDate("2026-12-31")).toBe("Dec 31");
    expect(formatShortDate("not-a-date")).toBe("not-a-date");
  });

  it("adds whole days across month and year boundaries", () => {
    expect(addDays("2026-08-01", 13)).toBe("2026-08-14");
    expect(addDays("2026-08-08", -13)).toBe("2026-07-26");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});
