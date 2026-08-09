import { useId, type ReactNode } from "react";

export type ChartLegendItem = {
  className: string;
  label: string;
};

type ChartFrameProps = {
  actions?: ReactNode;
  children?: ReactNode;
  description: string;
  empty?: boolean;
  emptyMessage?: string;
  legend?: ChartLegendItem[];
  meta?: string;
  title: string;
};

const DEFAULT_EMPTY_MESSAGE =
  "No records in this period. The visualization appears here once records are submitted.";

/**
 * A bounded chart surface. Handles the empty visualization state as a
 * first-class message inside the frame instead of rendering a meaningless
 * empty axis. `description` doubles as an accessible description of the
 * visualization region.
 */
export function ChartFrame({
  actions,
  children,
  description,
  empty = false,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  legend,
  meta,
  title,
}: ChartFrameProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="chart-frame"
    >
      <header className="chart-frame-header">
        <div>
          <h2 className="chart-frame-title" id={titleId}>
            {title}
          </h2>
          {meta ? <p className="chart-frame-meta">{meta}</p> : null}
        </div>
        {actions ? <div className="chart-frame-actions">{actions}</div> : null}
      </header>
      <p className="chart-frame-description" id={descriptionId}>
        {description}
      </p>
      {legend && legend.length > 0 ? (
        <ul className="chart-legend" aria-label="Chart legend">
          {legend.map((item) => (
            <li className="chart-legend-item" key={item.label}>
              <span
                aria-hidden="true"
                className={`chart-legend-swatch ${item.className}`}
              />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="chart-frame-body">
        {empty ? (
          <div className="chart-empty" role="note">
            {emptyMessage}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
