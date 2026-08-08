import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

const password = "a long example password";

async function login(page: Page, user = "supervisor.a") {
  await page.goto("/login");
  await page.getByLabel("Login identifier").fill(user);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function authorizationCookie(context: BrowserContext) {
  return (await context.cookies())
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

test("supervisor can record a harvest and view submitted detail", async ({
  context,
  page,
}) => {
  await login(page, "supervisor.a");

  await page.goto("/harvest/new");
  await expect(
    page.getByRole("heading", { name: "Record harvest" }),
  ).toBeVisible();

  await page.getByLabel("Search by code or name").fill("E2E-BLOCK");
  await expect(page.getByRole("button", { name: /E2E-BLOCK/ })).toBeVisible();
  await page.getByRole("button", { name: /E2E-BLOCK/ }).click();

  await page.getByLabel("Quantity").fill("12");
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit harvest" }).click();

  await expect(
    page.getByRole("heading", { name: "Submitted harvest" }),
  ).toBeVisible();
  await expect(page.locator("ol.audit-list li")).toHaveCount(2);

  const cookie = await authorizationCookie(context);
  const response = await page.request.get(
    "http://127.0.0.1:8100/api/v1/harvest-records?status=submitted",
    { headers: { Cookie: cookie } },
  );
  expect(response.status()).toBe(200);
  expect((await response.json()).total).toBeGreaterThan(0);
});

test("offline Harvest queues on the device and confirms after reconnect", async ({
  context,
  page,
}) => {
  await login(page, "supervisor.a");
  await page.goto("/harvest");
  await page
    .getByRole("button", { name: "Prepare FarmUnits for offline use" })
    .click();
  await expect(page.getByText(/FarmUnits refreshed/)).toBeVisible();

  await page.getByRole("link", { name: "Record harvest" }).click();
  await expect(page).toHaveURL(/\/harvest\/[0-9a-f-]+$/);
  await page.getByLabel("Search by code or name").fill("E2E-BLOCK");
  await page.getByRole("button", { name: /E2E-BLOCK/ }).click();
  await page.getByLabel("Quantity").fill("21");

  await context.setOffline(true);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved on this device.")).toBeVisible();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit harvest" }).click();
  await expect(
    page.getByRole("heading", { name: "Harvest saved on this device" }),
  ).toBeVisible();
  await expect(page.getByText(/Waiting to sync/).first()).toBeVisible();

  await context.setOffline(false);
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(
    page.getByRole("heading", { name: "Submitted harvest" }),
  ).toBeVisible();
  await expect(page.locator("ol.audit-list li")).toHaveCount(2);
});

test("lost Harvest sync response retries without duplicate submission", async ({
  page,
}) => {
  await login(page, "supervisor.a");
  await page.goto("/harvest/new");
  await page.getByLabel("Search by code or name").fill("E2E-BLOCK");
  await page.getByRole("button", { name: /E2E-BLOCK/ }).click();
  await page.getByLabel("Quantity").fill("22");
  await page.getByRole("button", { name: "Review" }).click();

  let first = true;
  await page.route("**/harvest-records/sync", async (route) => {
    if (!first) return route.continue();
    first = false;
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    await route.abort("connectionreset");
  });
  await page.getByRole("button", { name: "Submit harvest" }).click();
  await expect(
    page.getByRole("heading", { name: "Harvest saved on this device" }),
  ).toBeVisible();

  await page.unroute("**/harvest-records/sync");
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(
    page.getByRole("heading", { name: "Submitted harvest" }),
  ).toBeVisible();
  await expect(page.locator("ol.audit-list li")).toHaveCount(2);
});

test("manager can correct a submitted harvest and see correction history", async ({
  page,
}) => {
  await login(page, "manager.a");

  await page.goto("/harvest/new");
  await page.getByLabel("Search by code or name").fill("E2E-BLOCK");
  await expect(page.getByRole("button", { name: /E2E-BLOCK/ })).toBeVisible();
  await page.getByRole("button", { name: /E2E-BLOCK/ }).click();

  await page.getByLabel("Quantity").fill("8");
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit harvest" }).click();

  await expect(
    page.getByRole("heading", { name: "Submitted harvest" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Correct record" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Correct record" }).click();
  await page.getByLabel("Quantity").fill("10");
  await page.getByLabel("Correction reason").fill("Update quantity");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Confirm correction" }).click();

  await expect(page.getByText("Harvest correction recorded.")).toBeVisible();
  await expect(page.getByText(/corrected/)).toBeVisible();
  await expect(page.getByLabel("Quantity")).toHaveValue("10.000");
  await expect(page.getByText(/Update quantity/)).toBeVisible();
});

test("worker application user is denied Harvest access", async ({
  context,
  page,
}) => {
  await login(page, "worker.a");
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Harvest" })).toHaveCount(0);

  await page.goto("/harvest");
  await expect(
    page.getByText(/You do not have permission to access Harvest/),
  ).toBeVisible();

  const cookie = await authorizationCookie(context);
  const response = await page.request.get(
    "http://127.0.0.1:8100/api/v1/harvest-records",
    {
      headers: { Cookie: cookie },
    },
  );
  expect(response.status()).toBe(403);
});
