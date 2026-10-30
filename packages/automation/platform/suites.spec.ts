import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";

test("saved suite metadata and membership survive editing and reload", async ({
  page,
}) => {
  const credentials = z
    .object({ password: z.string() })
    .parse(JSON.parse(await readFile("../../.local/credentials.json", "utf8")));
  await page.goto("/");
  await page.getByRole("link", { name: "Continue with SSO" }).click();
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: "Test suites", exact: true }).click();
  const name = `Regression ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Saved contract checks");
  await page.getByLabel("Owner", { exact: true }).fill("Quality team");
  await page.getByLabel("Tags (comma separated)").fill("regression, api");
  await page
    .getByRole("checkbox", {
      name: "LAB-001 Persistent order lifecycle",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Save suite", exact: true }).click();
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  await expect(page.getByLabel("Owner", { exact: true })).toHaveValue(
    "Quality team",
  );
  await page
    .getByLabel("Description", { exact: true })
    .fill("Updated contract checks");
  await page
    .getByRole("checkbox", {
      name: "LAB-002 Missing authentication",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Save suite", exact: true }).click();
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(card).toContainText("2 tests · revision 2");
  await expect(page.locator(".toast")).toContainText("Changes saved.");
  await page.getByText(/Notification history \(2\)/).click();
  await expect(page.locator("app-notifications details")).toContainText(
    "Changes saved.",
  );
  await page
    .locator("app-notifications")
    .screenshot({
      path: "../../docs/changelog/assets/unreleased/notifications.png",
    });
  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 7000 });
  await expect(page.locator("app-notifications details")).toContainText(
    "Changes saved.",
  );
  await page.reload();
  await expect(card).toContainText("Updated contract checks");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: "../../docs/changelog/assets/unreleased/suite-editing.png",
    fullPage: true,
  });
});
