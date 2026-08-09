import { useId, type ReactNode } from "react";

type ReportSectionProps = {
  actions?: ReactNode;
  children: ReactNode;
  description?: string;
  headingLevel?: 2 | 3;
  meta?: string;
  title: string;
};

/**
 * A bounded report block with a semantic heading, optional contextual
 * description/meta line, and optional header actions (for example an export
 * or a unit selector that belongs to the section).
 */
export function ReportSection({
  actions,
  children,
  description,
  headingLevel = 2,
  meta,
  title,
}: ReportSectionProps) {
  const headingId = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <section className="report-section" aria-labelledby={headingId}>
      <header className="report-section-header">
        <div>
          <Heading className="report-section-title" id={headingId}>
            {title}
          </Heading>
          {description ? (
            <p className="report-section-description">{description}</p>
          ) : null}
          {meta ? <p className="report-section-meta">{meta}</p> : null}
        </div>
        {actions ? (
          <div className="report-section-actions">{actions}</div>
        ) : null}
      </header>
      {children}
    </section>
  );
}
