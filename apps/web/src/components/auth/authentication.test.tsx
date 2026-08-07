import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthenticatedHome } from "./authenticated-home";
import { LoginForm } from "./login-form";
import { ApiError } from "@/lib/api/client";

const replace = vi.fn();
const login = vi.fn();
const logout = vi.fn();
const getCurrentSession = vi.fn();
const getProtectedSystemStatus = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/api/auth", () => ({
  login: (...args: unknown[]) => login(...args),
  logout: () => logout(),
  getCurrentSession: (...args: unknown[]) => getCurrentSession(...args),
  getProtectedSystemStatus: (...args: unknown[]) =>
    getProtectedSystemStatus(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function submitLogin(
  loginIdentifier = "operator",
  password = "correct horse battery",
) {
  fireEvent.change(screen.getByLabelText(/Login identifier/), {
    target: { value: loginIdentifier },
  });
  fireEvent.change(screen.getByLabelText(/Password/), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("LoginForm", () => {
  it("uses labelled password-manager-compatible controls", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText(/Login identifier/)).toHaveAttribute(
      "autocomplete",
      "username",
    );
    expect(screen.getByLabelText(/Password/)).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(screen.getByLabelText(/Password/)).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("shows validation without submitting empty credentials", () => {
    render(<LoginForm />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      screen.getByText("Enter your login identifier and password."),
    ).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("shows loading and redirects after successful login", async () => {
    let resolveLogin: (value: unknown) => void = () => undefined;
    login.mockReturnValue(new Promise((resolve) => (resolveLogin = resolve)));
    render(<LoginForm />);
    submitLogin();

    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    resolveLogin({ id: "1" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("uses a generic invalid-credentials message", async () => {
    login.mockRejectedValue(new ApiError("failed", 401));
    render(<LoginForm />);
    submitLogin();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The login identifier or password is not valid",
    );
  });

  it("distinguishes service failure from invalid credentials", async () => {
    login.mockRejectedValue(new TypeError("network failed"));
    render(<LoginForm />);
    submitLogin();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The sign-in service could not be reached",
    );
  });
});

describe("AuthenticatedHome", () => {
  it("redirects an unauthenticated session to login", async () => {
    getCurrentSession.mockRejectedValue(new ApiError("unauthenticated", 401));
    render(<AuthenticatedHome />);

    expect(screen.getByText("Checking your session…")).toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("renders identity and logs out an authenticated user", async () => {
    getCurrentSession.mockResolvedValue({
      id: "1",
      login_identifier: "operator",
      display_name: "Example Operator",
      permissions: ["system.status.read"],
    });
    getProtectedSystemStatus.mockResolvedValue({ status: "foundation" });
    logout.mockResolvedValue(undefined);
    render(<AuthenticatedHome />);

    expect(await screen.findByText("Example Operator")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
