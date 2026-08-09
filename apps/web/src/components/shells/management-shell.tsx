"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { AccountMenu } from "./account-menu";
import { ApplicationIdentity } from "./application-identity";
import type {
  ManagementNavItem,
  ManagementNavSection,
} from "./management-navigation";
import type { AuthenticatedUser } from "@/lib/api/auth";

/**
 * Split the already permission-filtered, flat navigation into an Operations
 * group and an Administration group. This never adds links the caller did not
 * include; it only separates the manager-only administration entries.
 */
function groupNavigation(items: ManagementNavItem[]): ManagementNavSection[] {
  const adminHrefs = new Set(["/admin/users", "/admin/security-events"]);
  const operations = items.filter((item) => !adminHrefs.has(item.href));
  const administration = items.filter((item) => adminHrefs.has(item.href));
  const sections: ManagementNavSection[] = [];
  if (operations.length > 0)
    sections.push({ label: "Operations", items: operations });
  if (administration.length > 0)
    sections.push({ label: "Administration", items: administration });
  return sections;
}

type ManagementShellProps = {
  children: ReactNode;
  navigation: ManagementNavItem[];
  /** When set, the shell renders the authenticated account menu. */
  user?: AuthenticatedUser | null;
  /**
   * Preview (design-system page) omits the skip link, landmark mains, and the
   * account menu so samples remain static and self-contained.
   */
  preview?: boolean;
  utility?: ReactNode;
};

function NavSection({
  section,
  onNavigate,
}: {
  section: ManagementNavSection;
  onNavigate?: () => void;
}) {
  const headingId = `nav-group-${section.label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section className="management-nav-group">
      <h2 className="management-nav-group-label" id={headingId}>
        {section.label}
      </h2>
      <ul className="management-nav-list" aria-labelledby={headingId}>
        {section.items.map((item) => (
          <li key={item.href}>
            <Link
              aria-current={item.current ? "page" : undefined}
              className="management-nav-link"
              href={item.href}
              onClick={onNavigate}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NavSections({
  sections,
  onNavigate,
}: {
  sections: ManagementNavSection[];
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Primary navigation">
      {sections.map((section) => (
        <NavSection
          key={section.label}
          onNavigate={onNavigate}
          section={section}
        />
      ))}
    </nav>
  );
}

function MobileNavigation({
  sections,
  open,
  onClose,
}: {
  sections: ManagementNavSection[];
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Lock background scroll while the drawer is open, without relying on an
  // effect that synchronously sets state.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div
      className={`mobile-nav-scrim${open ? " mobile-nav-scrim-open" : ""}`}
      hidden={!open}
    >
      <div
        className="mobile-nav-drawer"
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
      >
        <div className="mobile-nav-header">
          <ApplicationIdentity compact />
          <button
            aria-label="Close navigation"
            className="mobile-nav-close"
            onClick={onClose}
            type="button"
          >
            <svg aria-hidden="true" height="18" viewBox="0 0 16 16" width="18">
              <path
                d="M4 4l8 8M12 4l-8 8"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.7"
              />
            </svg>
          </button>
        </div>
        <div className="mobile-nav-sections">
          <NavSections sections={sections} onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}

export function ManagementShell({
  children,
  navigation,
  user,
  preview = false,
  utility,
}: ManagementShellProps) {
  // The shell is rendered by each page (not a persistent layout), so route
  // changes remount it and the drawer starts closed. Links inside the drawer
  // also close it via their onNavigate handler.
  const [mobileOpen, setMobileOpen] = useState(false);

  const sections = groupNavigation(navigation);

  const content = preview ? (
    <div className="management-content">{children}</div>
  ) : (
    <main className="management-content" id="main-content" tabIndex={-1}>
      {children}
    </main>
  );

  const account = utility ? utility : user ? <AccountMenu user={user} /> : null;

  return (
    <div className="management-shell">
      {!preview ? (
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
      ) : null}
      <header className="management-brandbar">
        <div className="management-brandbar-start">
          {!preview ? (
            <button
              aria-controls="mobile-nav"
              aria-expanded={mobileOpen}
              aria-label="Open navigation"
              className="management-menu-button"
              onClick={() => setMobileOpen(true)}
              type="button"
            >
              <svg
                aria-hidden="true"
                height="20"
                viewBox="0 0 20 20"
                width="20"
              >
                <path
                  d="M3 5h14M3 10h14M3 15h14"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.8"
                />
              </svg>
            </button>
          ) : null}
          <ApplicationIdentity asLink />
        </div>
        {preview ? null : (
          <div className="management-brandbar-end">{account}</div>
        )}
      </header>
      {!preview ? (
        <MobileNavigation
          sections={sections}
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
        />
      ) : null}
      <div className="management-layout">
        <aside aria-label="Sections" className="management-sidebar">
          <NavSections sections={sections} />
        </aside>
        {content}
      </div>
    </div>
  );
}
