import type { ReactNode } from "react";

import { addDays } from "../units";

type ReportToolbarProps = {
  actions?: ReactNode;
  children: ReactNode;
  periodLabel: string;
};

/**
 * A coherent reporting filter toolbar: labeled controls in one bordered strip
 * with the active reporting period stated explicitly, followed by optional
 * export actions. Filters stay compact and inline; no modal dialogs.
 */
export function ReportToolbar({
  actions,
  children,
  periodLabel,
}: ReportToolbarProps) {
  return (
    <div className="report-toolbar">
      <div className="report-toolbar-filters">{children}</div>
      <div className="report-toolbar-footer">
        <p className="report-toolbar-period">
          <span aria-hidden="true" className="report-toolbar-period-dot" />
          {periodLabel}
        </p>
        {actions ? (
          <div className="report-toolbar-actions">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

type PresetButtonsProps = {
  onSelect: (days: number) => void;
};

const PRESETS = [
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
] as const;

/**
 * Quick inclusive range presets ending today (server calendar date semantics
 * are the reporting API's; the frontend only picks whole-day ranges).
 */
export function PresetButtons({ onSelect }: PresetButtonsProps) {
  return (
    <div className="report-presets" aria-label="Quick date range">
      <span className="report-presets-label">Range</span>
      {PRESETS.map((preset) => (
        <button
          className="report-preset"
          key={preset.days}
          onClick={() => onSelect(preset.days)}
          type="button"
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

/** Inclusive from..to ending at `endDate`, spanning `days` whole days. */
export function rangeEndingToday(
  days: number,
  endDate: string,
): { from: string; to: string } {
  return { from: addDays(endDate, -(days - 1)), to: endDate };
}
