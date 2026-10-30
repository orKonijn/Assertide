import { test, expect } from "./fixtures";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
test.use({ screenshot: "off", trace: "off" });
test("saved environment resolves a write-only credential during execution", async ({
  page,
}) => {
  const credentials = z
    .object({ password: z.string() })
    .parse(JSON.parse(await readFile("../../.local/credentials.json", "utf8")));
  await page.goto("/settings");
  const suffix = randomUUID().slice(0, 8);
  const name = `Lab credential ${suffix}`;
  await page.getByLabel("Credential name", { exact: true }).fill(name);
  await page
    .getByLabel("Credential value", { exact: true })
    .fill(credentials.password);
  await page
    .getByRole("button", { name: "Save credential version", exact: true })
    .click();
  await expect(
    page.getByLabel("Credential value", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("status").filter({ hasText: "Credential version saved." }),
  ).toHaveText("Credential version saved. Its value cannot be read back.");
  await page
    .getByLabel("Environment ID", { exact: true })
    .fill(`policy-${suffix}`);
  await page
    .getByLabel("Environment name", { exact: true })
    .fill(`QA policy ${suffix}`);
  await page
    .getByLabel("Lab password reference")
    .selectOption({ label: `${name} · version 1` });
  await page
    .getByRole("button", { name: "Save environment", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Environment saved." }),
  ).toHaveText("Environment saved. Future launches use this policy.");
  await page.locator("app-environments").screenshot({
    path: "../../docs/changelog/assets/unreleased/environments.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("app-environments").screenshot({
    path: "../../docs/changelog/assets/unreleased/environments-mobile.png",
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/explorer");
  await page.getByLabel("Select LAB-001", { exact: true }).check();
  await page
    .getByLabel("Environment", { exact: true })
    .selectOption({ label: `QA policy ${suffix}` });
  await page
    .getByRole("button", { name: "Start execution", exact: true })
    .click();
  await expect(page).toHaveURL(/\/runs\//);
  await expect(
    page.getByText("completed", { exact: true }).first(),
  ).toBeVisible({ timeout: 25000 });
  const runId = page.url().split("/").at(-1);
  const run = await (await page.request.get(`/v1/runs/${runId}`)).json();
  expect(run.results[0].status).toBe("passed");
  expect(run.environment.passwordRef.version).toBe(1);
  expect(JSON.stringify(run)).not.toContain(credentials.password);
});
