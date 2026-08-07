import { expect, test } from "@playwright/test";

const password = "a long example password";

async function login(
  page: import("@playwright/test").Page,
  user = "supervisor.a",
) {
  await page.goto("/login");
  await page.getByLabel("Login identifier").fill(user);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("offline attendance survives reload, queues, reconnects, and confirms once", async ({
  context,
  page,
}) => {
  await login(page);
  await page.goto("/attendance");
  await page
    .getByRole("button", { name: "Prepare roster for offline use" })
    .click();
  await expect(page.getByText(/Roster refreshed/)).toBeVisible();
  const offlineStorage = await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    const cacheNames = await caches.keys();
    const requests = (
      await Promise.all(
        cacheNames.map(async (name) => (await caches.open(name)).keys()),
      )
    )
      .flat()
      .map((request) => request.url);
    return {
      databases: databases.map((item) => item.name),
      cacheNames,
      requests,
    };
  });
  expect(offlineStorage.databases).toContain("koranco-attendance-offline");
  expect(offlineStorage.cacheNames).toContain("koranco-attendance-shell-v1");
  expect(
    offlineStorage.requests.some((url) => url.includes("/api/")),
  ).toBeFalsy();
  await page.getByRole("button", { name: "Start draft" }).click();
  await expect(page.getByText("E2E Worker 1")).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Add all active workers" }).click();
  await page.getByRole("button", { name: "Mark all present" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved on this device.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("E2E Worker 1")).toBeVisible();
  await page.getByRole("button", { name: "Review" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Submit attendance" }).click();
  await expect(page.getByText("Attendance saved on this device")).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(
    page.getByRole("heading", { name: "Submitted attendance" }),
  ).toBeVisible();
  const sessions = await page.request.get(
    "http://127.0.0.1:8100/api/v1/attendance-sessions",
    {
      headers: {
        Cookie: (await context.cookies())
          .map((c) => `${c.name}=${c.value}`)
          .join("; "),
      },
    },
  );
  expect((await sessions.json()).total).toBe(1);
});

test("pending work remains isolated when a different user signs in", async ({
  context,
  page,
}) => {
  await login(page);
  await page.goto("/attendance");
  await page
    .getByRole("button", { name: "Prepare roster for offline use" })
    .click();
  await page.getByRole("button", { name: "Start draft" }).click();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Add all active workers" }).click();
  await page.getByRole("button", { name: "Mark all present" }).click();
  await page.getByRole("button", { name: "Review" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Submit attendance" }).click();
  await page.route("**/attendance-sessions/sync", (route) =>
    route.abort("internetdisconnected"),
  );
  await context.setOffline(false);
  await page.goto("/");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.unroute("**/attendance-sessions/sync");
  await login(page, "supervisor.b");
  await page.goto("/attendance");
  await expect(
    page.getByText("No attendance is saved on this device for this user."),
  ).toBeVisible();
});

test("a lost sync response retries without a second official submission", async ({
  context,
  page,
}) => {
  await login(page);
  await page.goto("/attendance");
  await page
    .getByRole("button", { name: "Prepare roster for offline use" })
    .click();
  await page.getByLabel("Attendance date").fill("2026-08-09");
  await page.getByRole("button", { name: "Start draft" }).click();
  await page.getByRole("button", { name: "Add all active workers" }).click();
  await page.getByRole("button", { name: "Mark all present" }).click();
  await page.getByRole("button", { name: "Review" }).click();
  let first = true;
  await page.route("**/attendance-sessions/sync", async (route) => {
    if (!first) return route.continue();
    first = false;
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    await route.abort("connectionreset");
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Submit attendance" }).click();
  await expect(page.getByText("Attendance saved on this device")).toBeVisible();
  await page.unroute("**/attendance-sessions/sync");
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(
    page.getByRole("heading", { name: "Submitted attendance" }),
  ).toBeVisible();
  const events = await page.request.get(
    `http://127.0.0.1:8100/api/v1/attendance-sessions/${new URL(page.url()).pathname.split("/").pop()}/audit`,
    {
      headers: {
        Cookie: (await context.cookies())
          .map((c) => `${c.name}=${c.value}`)
          .join("; "),
      },
    },
  );
  const submittedEvents = (await events.json()).items.filter(
    (item: { action: string }) => item.action === "submitted",
  );
  expect(submittedEvents).toHaveLength(1);
});
