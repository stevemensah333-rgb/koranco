import type { ReactNode } from "react";

import type { StatusTone } from "./status-badge";

type AlertProps = {
  children: ReactNode;
  title: string;
  tone?: Exclude<StatusTone, "neutral">;
};

export function Alert({ children, title, tone = "info" }: AlertProps) {
  return (
    <div
      className={`alert alert-${tone}`}
      role={tone === "error" ? "alert" : undefined}
    >
      <div className="alert-body">
        <p className="alert-title">{title}</p>
        <div className="alert-message">{children}</div>
      </div>
    </div>
  );
}
