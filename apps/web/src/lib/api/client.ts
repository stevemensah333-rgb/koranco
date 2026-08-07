import { publicConfig } from "@/lib/config/public";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type ApiOptions = Omit<RequestInit, "credentials">;

export async function apiRequest<ResponseBody>(
  path: string,
  options: ApiOptions = {},
): Promise<ResponseBody> {
  const response = await fetch(`${publicConfig.apiOrigin}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...options.headers,
    },
  });
  if (!response.ok) {
    let message = "API request failed";
    try {
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      if (payload.error?.message) message = payload.error.message;
    } catch {
      // Keep the stable fallback when an intermediary returns a non-JSON error.
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as ResponseBody;
  return (await response.json()) as ResponseBody;
}

export async function getApiHealth(
  signal?: AbortSignal,
): Promise<{ status: "ok" }> {
  return apiRequest("/api/v1/health", { signal });
}
