import { ApiError, apiRequest } from "./client";

export type AuthenticatedUser = {
  id: string;
  login_identifier: string;
  display_name: string;
  permissions: string[];
  role: "manager" | "supervisor" | "worker";
  password_change_required: boolean;
};

type AuthenticatedSessionResponse = AuthenticatedUser & {
  csrf_token: string;
};

type ClientSession = AuthenticatedUser | null | undefined;
type ClientSessionListener = (user: AuthenticatedUser | null) => void;

const LOGOUT_TIMEOUT_MS = 30_000;
const sessionListeners = new Set<ClientSessionListener>();
let clientSession: ClientSession;
let csrfToken = "";

function updateAuthenticatedClientSession(
  response: AuthenticatedSessionResponse,
): AuthenticatedUser {
  const { csrf_token, ...user } = response;
  csrfToken = csrf_token;
  clientSession = user;
  sessionListeners.forEach((listener) => listener(user));
  return user;
}

export function clearAuthenticatedClientSession(): void {
  csrfToken = "";
  clientSession = null;
  sessionListeners.forEach((listener) => listener(null));
}

export function getAuthenticatedClientSession(): ClientSession {
  return clientSession;
}

export function subscribeToClientSession(
  listener: ClientSessionListener,
): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

export function csrfHeaders(): Record<string, string> {
  if (!csrfToken) {
    throw new ApiError(
      "The security token for this session is unavailable. Verify the session and try again.",
      0,
    );
  }
  return { "X-CSRF-Token": csrfToken };
}

// Every successful server-side validation (login or session check) refreshes
// the non-secret offline lease in IndexedDB. The lease is what authorizes
// temporary same-user offline capture without storing any credential (see
// docs/architecture/offline-sync.md); it intentionally lives outside the
// authentication module's storage.
async function preserveOfflineAuthorization(user: AuthenticatedUser) {
  if (
    typeof window !== "undefined" &&
    (user.permissions.includes("attendance.record") ||
      user.permissions.includes("harvest.record"))
  ) {
    const { recordOfflineLease } =
      await import("@/modules/attendance/offline/db");
    await recordOfflineLease(user);
  }
  return user;
}

export async function login(
  loginIdentifier: string,
  password: string,
): Promise<AuthenticatedUser> {
  const response = await apiRequest<AuthenticatedSessionResponse>(
    "/api/v1/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login_identifier: loginIdentifier, password }),
    },
  );
  return preserveOfflineAuthorization(
    updateAuthenticatedClientSession(response),
  );
}

export async function getCurrentSession(
  signal?: AbortSignal,
): Promise<AuthenticatedUser> {
  try {
    const response = await apiRequest<AuthenticatedSessionResponse>(
      "/api/v1/auth/session",
      { signal },
    );
    return preserveOfflineAuthorization(
      updateAuthenticatedClientSession(response),
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearAuthenticatedClientSession();
    }
    throw error;
  }
}

export async function logout(): Promise<void> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    LOGOUT_TIMEOUT_MS,
  );
  try {
    await apiRequest<void>("/api/v1/auth/logout", {
      method: "POST",
      headers: csrfHeaders(),
      signal: controller.signal,
    });
    clearAuthenticatedClientSession();
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError" &&
      controller.signal.aborted
    ) {
      throw new ApiError("The sign-out request timed out. Try again.", 0);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export function getProtectedSystemStatus(
  signal?: AbortSignal,
): Promise<{ status: string }> {
  return apiRequest("/api/v1/system/status", { signal });
}

export function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  return apiRequest("/api/v1/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}
