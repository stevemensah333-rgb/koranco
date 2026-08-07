import { publicConfig } from "@/lib/config/public";

type HealthResponse = { status: "ok" };

export async function getApiHealth(
  signal?: AbortSignal,
): Promise<HealthResponse> {
  const response = await fetch(`${publicConfig.apiOrigin}/api/v1/health`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok)
    throw new Error(`API health request failed with status ${response.status}`);
  return (await response.json()) as HealthResponse;
}
