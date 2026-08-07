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
  if (!response.ok) throw new ApiError("API request failed", response.status);
  if (response.status === 204) return undefined as ResponseBody;
  return (await response.json()) as ResponseBody;
}

export async function getApiHealth(
  signal?: AbortSignal,
): Promise<{ status: "ok" }> {
  return apiRequest("/api/v1/health", { signal });
}
