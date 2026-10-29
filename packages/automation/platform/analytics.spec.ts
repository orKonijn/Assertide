import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { z } from "zod";

test("analytics filters persist in the URL and charts provide table alternatives", async ({
  page,
}) => {
  const credentials = z
    .object({ password: z.string() })
    .parse(JSON.parse(await readFile("../../.local/credentials.json", "utf8")));
  await page.goto("/");
  await page.getByRole("link", { name: "Continue with SSO" }).click();
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Quality at a glance" }),
  ).toBeVisible();
  await page
    .getByLabel("History window", { exact: true })
    .selectOption({ label: "30 days" });
  await page
    .getByLabel("Execution project", { exact: true })
    .selectOption("api");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(page).toHaveURL(/days=30&browser=api/);
  await expect(
    page.getByRole("heading", { name: "Last 30 days", exact: true }),
  ).toBeVisible();
  await page
    .getByText("Show chart data and denominators", { exact: true })
    .click();
  await expect(
    page.getByRole("columnheader", { name: "Date (UTC)", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: "../../docs/changelog/assets/unreleased/analytics-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../../docs/changelog/assets/unreleased/analytics-mobile.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByLabel("Execution project", { exact: true }),
  ).toHaveValue("api");
  await page.goto("/runs");
  await page.getByLabel("Phase", { exact: true }).selectOption("completed");
  await page.getByLabel("Browser or API", { exact: true }).selectOption("api");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(page).toHaveURL(/phase=completed&browser=api/);
  await expect(
    page.getByRole("columnheader", { name: "Created", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: "../../docs/changelog/assets/unreleased/history-filters.png",
    fullPage: true,
  });
});
