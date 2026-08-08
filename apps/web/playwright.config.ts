import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command:
        "KORANCO_ENVIRONMENT=test KORANCO_DATABASE_URL=postgresql+psycopg://koranco_dev:koranco_dev@localhost:5432/koranco_e2e KORANCO_CORS_ORIGINS='[\"http://127.0.0.1:3100\"]' KORANCO_CSRF_TRUSTED_ORIGINS='[\"http://127.0.0.1:3100\"]' PYTHONPATH=src UV_CACHE_DIR=/tmp/koranco-uv-cache uv run uvicorn koranco.main:app --host 127.0.0.1 --port 8100 --no-access-log",
      cwd: "../api",
      url: "http://127.0.0.1:8100/api/v1/health",
      reuseExistingServer: false,
    },
    {
      command:
        "NEXT_PUBLIC_API_ORIGIN=http://127.0.0.1:8100 npm run build && NEXT_PUBLIC_API_ORIGIN=http://127.0.0.1:8100 npm run start -- --hostname 127.0.0.1 --port 3100",
      cwd: ".",
      url: "http://127.0.0.1:3100/login",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
