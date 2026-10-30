import { test, expect } from "./fixtures";

import { randomUUID } from "node:crypto";

test("maintainer metadata controls future selection and survives reload", async ({
  page,
}) => {
  await page.goto("/projects");
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
    .getByLabel("Quarantine future results (exclude from headline metrics)")
    .check();
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
  await expect(
    page.getByLabel(
      "Quarantine future results (exclude from headline metrics)",
    ),
  ).toBeChecked();
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
