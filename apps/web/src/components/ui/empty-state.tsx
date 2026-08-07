import { useId, type ReactNode } from "react";

type EmptyStateProps = {
  action?: ReactNode;
  description: string;
  heading: string;
};

export function EmptyState({ action, description, heading }: EmptyStateProps) {
  const headingId = useId();

  return (
    <section className="empty-state" aria-labelledby={headingId}>
      <h2 id={headingId}>{heading}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}
