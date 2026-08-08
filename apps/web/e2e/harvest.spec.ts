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
  await expect(page.getByLabel("Quantity")).toHaveValue("10");
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
