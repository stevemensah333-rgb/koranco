import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    env: { NEXT_PUBLIC_API_ORIGIN: "http://localhost:8000" },
    setupFiles: ["./src/test/setup.ts"],
  },
});
