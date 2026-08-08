"use client";

export function ReportsNav({
  current,
}: {
  current: "overview" | "attendance" | "harvest";
}) {
  const items = [
    { href: "/reports", label: "Overview", current: current === "overview" },
    {
      href: "/reports/attendance",
      label: "Attendance",
      current: current === "attendance",
    },
    {
      href: "/reports/harvest",
      label: "Harvest",
      current: current === "harvest",
    },
  ];
  return (
    <nav aria-label="Reports" className="report-tabs">
      {items.map((item) => (
        <a
          aria-current={item.current ? "page" : undefined}
          className="report-tab"
          href={item.href}
          key={item.href}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
