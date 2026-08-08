import { expect, test } from "@playwright/test";

const apiOrigin = "http://127.0.0.1:8100";

test("authenticated user can sign out and cannot reopen a protected page", async ({
  context,
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Login identifier").fill("supervisor.a");
  await page.getByLabel("Password").fill("a long example password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Supervisor.A")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(
    (await context.cookies(apiOrigin)).filter((cookie) =>
      ["koranco_session", "koranco_csrf"].includes(cookie.name),
    ),
  ).toHaveLength(0);

  const session = await page.request.get(`${apiOrigin}/api/v1/auth/session`);
  expect(session.status()).toBe(401);

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
