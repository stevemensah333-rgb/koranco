import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "./admin-shell";
import { UsersAdmin } from "./users-admin";
import { SecurityEventsAdmin } from "./security-events";

const replace = vi.fn();
const getCurrentSession = vi.fn();
const listUsers = vi.fn();
const createUser = vi.fn();
const listSecurityEvents = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/api/auth", () => ({
  getCurrentSession: (...args: unknown[]) => getCurrentSession(...args),
}));
vi.mock("@/lib/api/administration", () => ({
  listUsers: () => listUsers(),
  createUser: (...args: unknown[]) => createUser(...args),
  listSecurityEvents: () => listSecurityEvents(),
  changeRole: vi.fn(),
  setUserStatus: vi.fn(),
  resetUserPassword: vi.fn(),
  revokeUserSessions: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.confirm = vi.fn(() => true);
});

describe("administration authorization", () => {
  it("denies a user without administration permission", async () => {
    getCurrentSession.mockResolvedValue({
      permissions: ["system.status.read"],
    });
    render(
      <AdminShell current="users">
        <p>Secret administration</p>
      </AdminShell>,
    );
    expect(await screen.findByText("Access denied")).toBeInTheDocument();
    expect(screen.queryByText("Secret administration")).not.toBeInTheDocument();
  });
  it("shows administration navigation to a Manager", async () => {
    getCurrentSession.mockResolvedValue({ permissions: ["users.read"] });
    render(
      <AdminShell current="users">
        <p>Accounts content</p>
      </AdminShell>,
    );
    expect(await screen.findByText("Accounts content")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Security events" }).length,
    ).toBeGreaterThan(0);
  });
});

describe("users administration", () => {
  it("renders loading then an accessible compact user table", async () => {
    listUsers.mockResolvedValue({
      items: [
        {
          id: "1",
          display_name: "Ama Manager",
          login_identifier: "ama",
          role: "manager",
          status: "active",
          password_change_required: false,
          created_at: "2026-01-01",
        },
      ],
      total: 1,
    });
    render(<UsersAdmin />);
    expect(screen.getByText("Loading users…")).toBeInTheDocument();
    expect(
      await screen.findByRole("table", { name: "Application user accounts" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Role for Ama Manager")).toBeInTheDocument();
  });
  it("validates creation before calling the API", async () => {
    listUsers.mockResolvedValue({ items: [], total: 0 });
    render(<UsersAdmin />);
    await screen.findByText("No application users exist.");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText(/Enter a valid login/)).toBeInTheDocument();
    expect(createUser).not.toHaveBeenCalled();
  });
});

it("renders the security-event empty state", async () => {
  listSecurityEvents.mockResolvedValue({ items: [], total: 0 });
  render(<SecurityEventsAdmin />);
  expect(
    await screen.findByText("No security events are recorded."),
  ).toBeInTheDocument();
});
