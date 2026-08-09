import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthenticatedHome } from "./authenticated-home";

const session = vi.fn();
const systemStatus = vi.fn();
const getOverview = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/lib/api/auth", () => ({
  getCurrentSession: () => session(),
  getProtectedSystemStatus: () => systemStatus(),
  changeOwnPassword: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("@/modules/reports/api", () => ({
  getOverview: (...a: unknown[]) => getOverview(...a),
  downloadCsv: vi.fn(),
}));

const manager = {
  id: "u1",
  display_name: "Manager",
  login_identifier: "manager",
  role: "manager",
  password_change_required: false,
  permissions: ["reports.read", "exports.create", "system.status.read"],
};
const worker = {
  id: "u2",
  display_name: "Worker",
  login_identifier: "worker",
  role: "worker",
  password_change_required: false,
  permissions: ["system.status.read"],
};

const overviewData = {
  date: "2026-08-08",
  attendance: {
    submitted_sessions: 0,
    present_count: 0,
    absent_count: 0,
    roster_count: 0,
  },
  harvest: { submitted_records: 0, by_unit: [] },
  attendance_by_date: [],
  harvest_by_date: [],
  harvest_by_farm_unit: [],
  recent_attendance: [],
  recent_harvest: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  systemStatus.mockResolvedValue({ status: "foundation" });
  getOverview.mockResolvedValue(overviewData);
});

describe("authenticated home (management overview vs system status)", () => {
  it("shows the management overview to users with reports.read", async () => {
    session.mockResolvedValue(manager);
    render(<AuthenticatedHome />);
    expect(
      await screen.findByRole("heading", { name: "Overview" }),
    ).toBeInTheDocument();
    // The persistent sidebar marks the Overview entry as current. The phone
    // drawer is hidden until opened, so only the visible link is matched.
    const overviewLink = screen.getByRole("link", { name: "Overview" });
    expect(overviewLink.getAttribute("aria-current")).toBe("page");
    expect(await screen.findByText("Today · 2026-08-08")).toBeInTheDocument();
    // The technical system status is subordinate, not the page itself.
    expect(screen.getByLabelText("System status")).toBeInTheDocument();
    expect(screen.getByText("API connection confirmed")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "System status" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the System status page for users without reports.read", async () => {
    session.mockResolvedValue(worker);
    render(<AuthenticatedHome />);
    expect(
      await screen.findByRole("heading", { name: "System status" }),
    ).toBeInTheDocument();
    const statusLink = screen.getByRole("link", { name: "System status" });
    expect(statusLink.getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Protected API connection")).toBeInTheDocument();
    expect(screen.getByText("Access confirmed")).toBeInTheDocument();
    // No reporting data is requested for this user.
    expect(getOverview).not.toHaveBeenCalled();
  });
});
