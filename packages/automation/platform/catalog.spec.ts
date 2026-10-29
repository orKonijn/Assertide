import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
test("maintainer metadata controls future selection and survives reload", async ({
  page,
}) => {
  const credentials = z
    .object({ password: z.string() })
    .parse(JSON.parse(await readFile("../../.local/credentials.json", "utf8")));
  await page.goto("/projects");
  await page.getByRole("link", { name: "Continue with SSO" }).click();
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const name = `Catalog ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Project name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.getByLabel("Active project").selectOption({ label: name });
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/explorer");
  await page.getByRole("button", { name: "Edit LAB-014", exact: true }).click();
  await page.getByLabel("Module", { exact: true }).fill("API performance");
  await page.getByLabel("Test owner", { exact: true }).fill("Performance team");
  await page
    .getByLabel("Enabled for future selections", { exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Save test metadata", exact: true })
    .click();
  await expect(
    page.getByLabel("Select LAB-014", { exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByLabel("Select LAB-014", { exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Search tests").fill("API performance");
  await expect(
    page.getByRole("button", { name: "Edit LAB-014", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Select LAB-001", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Edit LAB-014", exact: true }).click();
  await page.screenshot({
    path: "../../docs/changelog/assets/unreleased/catalog-metadata.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "../../docs/changelog/assets/unreleased/catalog-metadata-mobile.png",
    fullPage: true,
  });
});
