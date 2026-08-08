import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearAuthenticatedClientSession,
  getAuthenticatedClientSession,
  getCurrentSession,
  login,
  logout,
} from "./auth";
import { ApiError } from "./client";

const sessionPayload = {
  id: "user-1",
  login_identifier: "operator",
  display_name: "Example Operator",
  permissions: ["system.status.read"],
  role: "supervisor",
  password_change_required: false,
  csrf_token: "csrf-from-api-response",
};

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("cross-origin auth client", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    clearAuthenticatedClientSession();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the response CSRF token and credentials for logout", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(sessionPayload))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await login("operator", "a long example password");
    await logout();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "http://localhost:8000/api/v1/auth/logout",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          Accept: "application/json",
          "X-CSRF-Token": "csrf-from-api-response",
        }),
      }),
    );
    expect(getAuthenticatedClientSession()).toBeNull();
  });

  it("hydrates cross-origin CSRF state when verifying an existing session", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(sessionPayload))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await getCurrentSession();
    await logout();

    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toEqual(
      expect.objectContaining({
        "X-CSRF-Token": "csrf-from-api-response",
      }),
    );
  });

  it("keeps authenticated client state when the server rejects logout", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(sessionPayload))
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "CSRF validation failed" } }, 403),
      );

    await login("operator", "a long example password");

    await expect(logout()).rejects.toEqual(
      new ApiError("CSRF validation failed", 403),
    );
    expect(getAuthenticatedClientSession()).toMatchObject({ id: "user-1" });
  });
});
