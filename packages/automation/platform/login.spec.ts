import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { z } from "zod";
test("SSO authenticates and opens the real catalog", async ({ page }) => {
  const credentials = z
    .object({ password: z.string() })
    .parse(JSON.parse(await readFile("../../.local/credentials.json", "utf8")));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("link", { name: "Continue with SSO" }).click();
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Quality at a glance" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Test explorer", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Select LAB-001", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(18);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: "../../docs/changelog/assets/unreleased/catalog-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dark theme" }).click();
  await page.screenshot({
    path: "../../docs/changelog/assets/unreleased/catalog-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Menu", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../../docs/changelog/assets/unreleased/catalog-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("checkbox", { name: "Select LAB-001", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select UI-001", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select UI-005", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Start execution", exact: true })
    .click();
  await expect(page).toHaveURL(/\/runs\/[a-f0-9-]+$/);
  await expect(page.getByRole("status")).toHaveText("completed", {
    timeout: 20_000,
  });
  await expect(
    page.getByText("LAB-001 · passed", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open report", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Open report", exact: true }).click();
  const report = await popupPromise;
  await expect(report).toHaveURL(/localhost:4012\/reports\//);
  await report.getByRole("button", { name: "Expand all", exact: true }).click();
  await expect(
    report
      .getByText("LAB-001 Persistent order lifecycle", { exact: false })
      .first(),
  ).toBeVisible();
  await report.screenshot({
    path: "../../docs/changelog/assets/unreleased/allure-report.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: "../../docs/changelog/assets/unreleased/execution-result.png",
    fullPage: true,
  });
  const runUrl = page.url();
  const endpoint = new URL(runUrl).pathname.replace("/runs/", "/v1/runs/");
  const before = await (await page.request.get(endpoint)).json();
  await page
    .getByRole("button", { name: "Rebuild report", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(endpoint)).json()).reportDirectory,
      { timeout: 20_000 },
    )
    .not.toBe(before.reportDirectory);
  await expect(
    page.getByRole("link", { name: "Open report", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  const after = await (await page.request.get(endpoint)).json();
  expect(after.results).toEqual(before.results);
  expect(after.reportDirectory).not.toBe(before.reportDirectory);
  expect(errors).toEqual([]);
});
