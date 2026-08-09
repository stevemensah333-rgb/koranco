import { formatQuantity } from "../units";
import type { HorizontalBar } from "../series";
import type { HarvestUnit } from "../api";

type HarvestBarsProps = {
  comparison: HorizontalBar[];
  unit: HarvestUnit;
};

/**
 * Compact horizontal comparison of exact FarmUnit totals for ONE harvest unit.
 * The unit is fixed per chart, so incompatible units are never drawn against
 * each other. Values remain the primary representation; bars are a visual aid.
 */
export function HarvestBars({ comparison, unit }: HarvestBarsProps) {
  const max = Math.max(1, ...comparison.map((row) => row.value));
  return (
    <ul className="harvest-bars" aria-label="Harvest by FarmUnit">
      {comparison.map((row) => (
        <li className="harvest-bar-row" key={row.label}>
          <span className="harvest-bar-label">
            <strong>{row.label}</strong>
            <small>{row.context}</small>
          </span>
          <span className="harvest-bar-track" aria-hidden="true">
            <span
              className="harvest-bar-fill"
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </span>
          <span className="harvest-bar-value numeric">
            {formatQuantity(row.value)}{" "}
            {unit === "fruit_count" ? "fruit" : "kg"}
          </span>
        </li>
      ))}
    </ul>
  );
}
