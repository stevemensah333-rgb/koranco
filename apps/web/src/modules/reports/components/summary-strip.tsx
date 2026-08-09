export type SummaryCell = {
  context?: string;
  label: string;
  value: string;
};

export type SummaryGroup = {
  cells: SummaryCell[];
  title: string;
};

type SummaryStripProps = {
  groups: SummaryGroup[];
};

/**
 * A compact bordered statistics strip. Groups are separated by hairline rules,
 * cells by interior dividers — deliberately NOT oversized SaaS metric cards.
 * Numbers stay prominent but small, and every value carries a label and
 * optional context.
 */
export function SummaryStrip({ groups }: SummaryStripProps) {
  return (
    <div className="summary-strip">
      {groups.map((group) => (
        <section
          aria-label={group.title}
          className="summary-group"
          key={group.title}
        >
          <h2 className="summary-group-title">{group.title}</h2>
          <dl className="summary-cells">
            {group.cells.map((cell) => (
              <div className="summary-cell" key={cell.label}>
                <dt className="summary-cell-label">{cell.label}</dt>
                <dd className="summary-cell-value">{cell.value}</dd>
                {cell.context ? (
                  <span className="summary-cell-context">{cell.context}</span>
                ) : null}
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
