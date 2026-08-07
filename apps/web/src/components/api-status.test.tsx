import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiStatus } from "./api-status";

afterEach(() => vi.unstubAllGlobals());

describe("ApiStatus", () => {
  it("shows loading and then API availability", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"status":"ok"}')),
    );
    render(<ApiStatus />);

    expect(screen.getByText("Checking API availability…")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("API available")).toBeInTheDocument(),
    );
  });

  it("shows an actionable unavailable state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("failure", { status: 503 })),
    );
    render(<ApiStatus />);

    await waitFor(() =>
      expect(
        screen.getByText(
          "API unavailable. Check that the local API is running.",
        ),
      ).toBeInTheDocument(),
    );
  });
});
