"use client";

import { useEffect, useState } from "react";

import { getApiHealth } from "@/lib/api/client";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { StatusBadge } from "@/components/ui/status-badge";

type Status = "loading" | "available" | "unavailable";

export function ApiStatus() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    const controller = new AbortController();
    getApiHealth(controller.signal)
      .then(() => setStatus("available"))
      .catch(() => {
        if (!controller.signal.aborted) setStatus("unavailable");
      });
    return () => controller.abort();
  }, []);

  if (status === "loading")
    return <LoadingIndicator label="Checking API availability…" />;

  return status === "available" ? (
    <StatusBadge tone="success">API available</StatusBadge>
  ) : (
    <StatusBadge tone="error">
      API unavailable. Check that the local API is running.
    </StatusBadge>
  );
}
