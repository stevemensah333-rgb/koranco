import type { ReactNode } from "react";

import { ApplicationIdentity } from "./application-identity";

type FieldShellProps = {
  actions?: ReactNode;
  children: ReactNode;
  context: string;
  preview?: boolean;
  status?: ReactNode;
};

export function FieldShell({
  actions,
  children,
  context,
  preview = false,
  status,
}: FieldShellProps) {
  const content = preview ? (
    <div className="field-content">{children}</div>
  ) : (
    <main className="field-content">{children}</main>
  );

  return (
    <div className="field-shell">
      <header className="field-header">
        <div className="field-header-row">
          <ApplicationIdentity compact />
          {status}
        </div>
        <p className="field-context">{context}</p>
      </header>
      {content}
      {actions ? <footer className="field-actions">{actions}</footer> : null}
    </div>
  );
}
