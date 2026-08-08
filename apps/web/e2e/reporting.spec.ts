import { expect, test } from "@playwright/test";
import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";

const password = "a long example password";
const api = "http://127.0.0.1:8100";

async function login(page: Page, user: string) {
  await page.goto("/login");
  await page.getByLabel("Login identifier").fill(user);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\//);
}

async function authorizationCookie(context: BrowserContext) {
  return (await context.cookies())
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

function authed(request: APIRequestContext, cookie: string) {
  return {
    get: (path: string) =>
      request.get(api + path, { headers: { Cookie: cookie } }),
    post: async (path: string, body?: object) => {
      const response = await request.post(api + path, {
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        data: body ?? {},
      });
      expect(response.status()).toBe(201);
      return response.json() as Promise<Record<string, never> & { id: string }>;
    },
    put: async (path: string, body: object) => {
      const response = await request.put(api + path, {
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        data: body,
      });
      expect(response.status()).toBe(200);
      return response.json() as Promise<
        Record<string, never> & { id: string; version: number }
      >;
    },
  };
}

/** Seed one submitted Harvest and one submitted Attendance for today. */
async function seedSubmittedRecords(
  context: BrowserContext,
  request: APIRequestContext,
) {
  const client = authed(request, await authorizationCookie(context));
  const today = new Date().toISOString().slice(0, 10);

  const units = await (await client.get("/farm-units?search=E2E-BLOCK")).json();
  const block = units.items[0];
  const workers = await (await client.get("/workers")).json();
  const workerId = workers.items[0].id;

  const harvest = await client.post("/harvest-records", {
    harvest_date: today,
    farm_unit_id: block.id,
    quantity: "12",
    unit: "fruit_count",
    notes: "Reporting E2E",
  });
  await client.post(`/harvest-records/${harvest.id}/submit`);

  const draft = await client.post("/attendance-sessions", {
    attendance_date: today,
  });
  await client.put(`/attendance-sessions/${draft.id}/draft`, {
    expected_version: draft.version,
    entries: [{ worker_id: workerId, attendance_status: "present" }],
  });
  await client.post(`/attendance-sessions/${draft.id}/submit`);
}

test("manager sees the operational overview with submitted records", async ({
  context,
  page,
}) => {
  await login(page, "manager.a");
  await seedSubmittedRecords(context, page.request);

  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(page.getByText(/Today/)).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Recent submitted harvest records" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Recent submitted attendance sessions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export attendance CSV" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export harvest CSV" }),
  ).toBeVisible();

  await page.goto("/reports/harvest");
  await expect(
    page.getByRole("table", { name: "Harvest totals by FarmUnit" }),
  ).toBeVisible();
  await expect(page.getByText("E2E-BLOCK")).toBeVisible();

  await page.goto("/reports/attendance");
  await expect(
    page.getByRole("table", {
      name: "Submitted attendance sessions in the selected range",
    }),
  ).toBeVisible();
});

test("supervisor can view reports but cannot export", async ({ page }) => {
  await login(page, "supervisor.a");
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export attendance CSV" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Export harvest CSV" }),
  ).toHaveCount(0);
});

test("worker is denied reports access", async ({ page }) => {
  await login(page, "worker.a");
  await page.goto("/reports");
  await expect(
    page.getByText("You do not have permission to view reports."),
  ).toBeVisible();
});
