import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { z } from "zod";
test("SSO authenticates and opens the real catalog", async ({ page }) => {
  // This journey builds two container runs and rebuilds a report; individual
  // phase assertions retain their own bounded readiness checks.
  test.setTimeout(90000);
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
  await expect(page.getByRole("checkbox")).toHaveCount(27);
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
  for (let number = 1; number <= 15; number++) {
    await page
      .getByRole("checkbox", {
        name: `Select LAB-${String(number).padStart(3, "0")}`,
        exact: true,
      })
      .check();
  }
  await page
    .getByRole("checkbox", { name: "Select UI-001", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select UI-005", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select UI-011", exact: true })
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
  expect(before.results).toHaveLength(18);
  await page.getByText("UI-011:chromium · passed", { exact: false }).click();
  await page
    .getByRole("button", { name: "View screenshot", exact: true })
    .click();
  const screenshotDialog = page.getByRole("dialog", {
    name: "Attempt screenshot",
    exact: true,
  });
  await expect(screenshotDialog).toBeVisible();
  await expect
    .poll(() =>
      screenshotDialog
        .locator("img")
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await screenshotDialog.screenshot({
    path: "../../docs/changelog/assets/unreleased/screenshot-viewer.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshotDialog.screenshot({
    path: "../../docs/changelog/assets/unreleased/screenshot-viewer-mobile.png",
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press("Escape");
  await expect(screenshotDialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "View screenshot", exact: true }),
  ).toBeFocused();
  expect(
    before.results.every(
      (result: { status: string }) => result.status === "passed",
    ),
  ).toBe(true);
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
  expect(after.source.revision).toMatch(/^[a-f0-9]{64}$/);
  await page.getByText("LAB-001 · passed", { exact: false }).click();
  await page
    .getByRole("checkbox", { name: "Select LAB-001 for rerun", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Rerun checked tests", exact: true })
    .click();
  await expect(page).not.toHaveURL(runUrl);
  await expect(page).toHaveURL(/\/runs\/[a-f0-9-]+$/);
  await expect(page.getByRole("status")).toHaveText("completed", {
    timeout: 20000,
  });
  const child = await (
    await page.request.get(
      new URL(page.url()).pathname.replace("/runs/", "/v1/runs/"),
    )
  ).json();
  expect(child.parentRunId).toBe(before.id);
  expect(child.selection.testIds).toEqual(["LAB-001"]);
  expect(child.source.revision).toBe(before.source.revision);
  expect(child.artifacts.length).toBeGreaterThan(0);
  const evidence = await page.request.get(
    `/v1/runs/${child.id}/artifacts/${child.artifacts[0].id}`,
  );
  expect(evidence.status()).toBe(200);
  expect(await evidence.json()).toMatchObject({
    request: { method: "POST", path: "orders" },
    response: { status: 201 },
  });
  await page.getByRole("link", { name: "API workspace", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "API workspace", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Execution", { exact: true }).selectOption(child.id);
  await page
    .getByRole("button", { name: /LAB-001 · attempt 1 · api-exchange.json/ })
    .first()
    .click();
  await expect(page.getByLabel("Recorded request and response")).toContainText(
    '"method": "POST"',
  );
  await expect(
    page.getByLabel("Recorded request and response"),
  ).not.toContainText(credentials.password);
  const evidenceDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download redacted JSON", exact: true })
    .click();
  const evidenceDownload = await evidenceDownloadPromise;
  const downloadedEvidence = await readFile(
    (await evidenceDownload.path())!,
    "utf8",
  );
  expect(downloadedEvidence).not.toContain(credentials.password);
  expect(JSON.parse(downloadedEvidence).request.method).toBe("POST");
  await page.screenshot({
    path: "../../docs/changelog/assets/unreleased/api-evidence.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../../docs/changelog/assets/unreleased/api-evidence-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Continue with SSO" }),
  ).toBeVisible();
  expect((await report.request.get(report.url())).status()).toBe(403);
  expect(errors).toEqual([]);
});
