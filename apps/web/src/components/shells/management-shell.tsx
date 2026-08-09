import type { ReactNode } from "react";

import { ApplicationIdentity } from "./application-identity";
import type { ManagementNavItem } from "./management-navigation";

type ManagementShellProps = {
  children: ReactNode;
  navigation: ManagementNavItem[];
  preview?: boolean;
  utility?: ReactNode;
};

function ManagementNavigation({
  navigation,
}: Pick<ManagementShellProps, "navigation">) {
  return (
    <nav aria-label="Primary navigation">
      {navigation.map((item) => (
        <a
          aria-current={item.current ? "page" : undefined}
          className="management-nav-link"
          href={item.href}
          key={item.href}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export function ManagementShell({
  children,
  navigation,
  preview = false,
  utility,
}: ManagementShellProps) {
  const content = preview ? (
    <div className="management-content">{children}</div>
  ) : (
    <main className="management-content" id="main-content" tabIndex={-1}>
      {children}
    </main>
  );

  return (
    <div className="management-shell">
      {!preview ? (
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
      ) : null}
      <header className="management-brandbar">
        <ApplicationIdentity />
        {utility}
      </header>
      <div className="management-mobile-nav">
        <ManagementNavigation navigation={navigation} />
      </div>
      <div className="management-layout">
        <aside className="management-sidebar">
          <ManagementNavigation navigation={navigation} />
        </aside>
        {content}
      </div>
    </div>
  );
}
