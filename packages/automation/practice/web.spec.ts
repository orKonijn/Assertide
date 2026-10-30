import { test, expect } from "@playwright/test";
const origin = "https://the-internet.herokuapp.com";
test.beforeEach(async ({ context }) => {
  let stopped = false;
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (stopped || url.origin !== origin) return route.abort();
    const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 });
    if ([403, 429].includes(response.status())) {
      stopped = true;
      await route.abort();
      throw new Error(`Public practice stopped: HTTP ${response.status()}`);
    }
    await route.fulfill({ response });
  });
});
test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: "wait" });
});
test("WEB-001 Dynamic loading waits for content", async ({ page }) => {
  await page.goto(`${origin}/dynamic_loading/1`);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator("#finish")).toHaveText("Hello World!", {
    timeout: 15000,
  });
  await expect(page.locator("#finish")).toBeVisible({ timeout: 15000 });
});
test("WEB-002 Checkbox state persists within page", async ({ page }) => {
  await page.goto(`${origin}/checkboxes`);
  const boxes = page.getByRole("checkbox");
  await boxes.nth(0).check();
  await boxes.nth(1).uncheck();
  await expect(boxes.nth(0)).toBeChecked();
  await expect(boxes.nth(1)).not.toBeChecked();
});
test("WEB-003 Dropdown selects requested option", async ({ page }) => {
  await page.goto(`${origin}/dropdown`);
  await page.getByRole("combobox").selectOption("2");
  await expect(page.getByRole("combobox")).toHaveValue("2");
  await expect(page.locator("option:checked")).toHaveText("Option 2");
});
test("WEB-004 Alert confirmation accepts and dismisses", async ({ page }) => {
  await page.goto(`${origin}/javascript_alerts`);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Click for JS Confirm", exact: true })
    .click();
  await expect(page.locator("#result")).toHaveText("You clicked: Cancel");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Click for JS Confirm", exact: true })
    .click();
  await expect(page.locator("#result")).toHaveText("You clicked: Ok");
});
test("WEB-005 New window isolation", async ({ page }) => {
  await page.goto(`${origin}/windows`);
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Click Here", exact: true }).click();
  const popup = await popupPromise;
  await expect(
    popup.getByRole("heading", { name: "New Window", exact: true }),
  ).toBeVisible();
  await popup.waitForLoadState("load");
  await popup.close();
  await expect(
    page.getByRole("heading", { name: "Opening a new window" }),
  ).toBeVisible();
});
test("WEB-006 Upload synthetic text file", async ({ page }) => {
  await page.goto(`${origin}/upload`);
  await page
    .locator("#file-upload")
    .setInputFiles({
      name: "hello.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Assertide test file!\n"),
    });
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.locator("#uploaded-files")).toHaveText("hello.txt");
});
test("WEB-007 Dynamic input enablement", async ({ page }) => {
  await page.goto(`${origin}/dynamic_controls`);
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  const input = page.locator("#input-example input");
  await expect(input).toBeEnabled({ timeout: 15000 });
  await input.fill("demo");
  await expect(input).toHaveValue("demo");
});
