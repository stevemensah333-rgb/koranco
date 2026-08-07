import type { ReactNode } from "react";

export type StatusTone = "neutral" | "success" | "warning" | "error" | "info";

type StatusBadgeProps = {
  children: ReactNode;
  pending?: boolean;
  tone?: StatusTone;
};

export function StatusBadge({
  children,
  pending = false,
  tone = "neutral",
}: StatusBadgeProps) {
  return (
    <span
      className={`status-badge status-${tone} ${pending ? "status-pending" : ""}`.trim()}
    >
      <span aria-hidden="true" className="status-marker" />
      {children}
    </span>
  );
}
