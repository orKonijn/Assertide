import { test, expect, type Page } from "@playwright/test";
async function login(
  page: Page,
  user = "standard_user",
  password = "secret_sauce",
) {
  await page.goto("/");
  await page.getByTestId("username").fill(user);
  await page.getByTestId("password").fill(password);
  await page.getByTestId("login-button").click();
}
async function addBackpack(page: Page) {
  await page.getByTestId("add-to-cart-sauce-labs-backpack").click();
  await page.locator(".shopping_cart_link").click();
  await expect(page).toHaveURL(/cart.html$/);
  await expect(page.getByTestId("checkout")).toBeVisible();
}
async function customer(page: Page) {
  await page.getByTestId("firstName").fill("Ada");
  await page.getByTestId("lastName").fill("Test");
  await page.getByTestId("postalCode").fill("10001");
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("finish")).toBeVisible();
}
test("UI-001 Valid login unlocks catalog", async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/inventory.html$/);
  await expect(page.locator(".inventory_item")).toHaveCount(6);
});
test("UI-002 Locked user cannot enter", async ({ page }) => {
  await login(page, "locked_out_user");
  await expect(page.getByTestId("error")).toContainText("locked out");
  await expect(page).not.toHaveURL(/inventory.html/);
});
test("UI-003 Invalid password is rejected", async ({ page }) => {
  await login(page, "standard_user", "wrong-password");
  await expect(page.getByTestId("error")).toBeVisible();
  await expect(page).not.toHaveURL(/inventory.html/);
});
test("UI-004 Required login input", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("login-button").click();
  await expect(page.getByTestId("error")).toContainText("Username is required");
  await page.getByTestId("username").fill("standard_user");
  await page.getByTestId("login-button").click();
  await expect(page.getByTestId("error")).toContainText("Password is required");
});
test("UI-005 Checkout completes", async ({ page }) => {
  await login(page);
  await addBackpack(page);
  await expect(page.locator(".inventory_item_name")).toHaveText(
    "Sauce Labs Backpack",
  );
  await page.getByTestId("checkout").click();
  await customer(page);
  await page.getByTestId("finish").click();
  await expect(page.locator(".complete-header")).toHaveText(
    "Thank you for your order!",
  );
  await expect(page.locator(".shopping_cart_badge")).toHaveCount(0);
});
test("UI-006 Cart removal preserves remaining items", async ({ page }) => {
  await login(page);
  await page.getByTestId("add-to-cart-sauce-labs-backpack").click();
  await page.getByTestId("add-to-cart-sauce-labs-bike-light").click();
  await page.locator(".shopping_cart_link").click();
  await page.getByTestId("remove-sauce-labs-backpack").click();
  await expect(page.locator(".inventory_item_name")).toHaveText(
    "Sauce Labs Bike Light",
  );
  await expect(page.locator(".shopping_cart_badge")).toHaveText("1");
});
test("UI-007 Price sort is numeric", async ({ page }) => {
  await login(page);
  await page.getByTestId("product-sort-container").selectOption("lohi");
  const prices = (
    await page.locator(".inventory_item_price").allTextContents()
  ).map((value) => Number(value.replace("$", "")));
  expect(prices).toHaveLength(6);
  expect(prices).toEqual([...prices].sort((a, b) => a - b));
});
test("UI-008 Checkout rejects missing customer data", async ({ page }) => {
  await login(page);
  await addBackpack(page);
  await page.getByTestId("checkout").click();
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("error")).toContainText(
    "First Name is required",
  );
  await page.getByTestId("firstName").fill("Ada");
  await page.getByTestId("lastName").fill("Test");
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("error")).toContainText(
    "Postal Code is required",
  );
  await expect(page.locator(".shopping_cart_badge")).toHaveText("1");
});
test("UI-009 Logout clears session", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Open Menu" }).click();
  await page.getByTestId("logout-sidebar-link").click();
  await page.goto("/inventory.html");
  await expect(page.getByTestId("login-button")).toBeVisible();
});
test("UI-010 Cancel checkout preserves cart", async ({ page }) => {
  await login(page);
  await addBackpack(page);
  await page.getByTestId("checkout").click();
  await page.getByTestId("cancel").click();
  await expect(page.locator(".inventory_item_name")).toHaveText(
    "Sauce Labs Backpack",
  );
});
test("UI-011 Product detail matches catalog", async ({ page }) => {
  await login(page);
  const item = page
    .locator(".inventory_item")
    .filter({ hasText: "Sauce Labs Backpack" });
  const price = await item.locator(".inventory_item_price").textContent();
  await item.getByText("Sauce Labs Backpack", { exact: true }).click();
  await expect(page.locator(".inventory_details_name")).toHaveText(
    "Sauce Labs Backpack",
  );
  await expect(page.locator(".inventory_details_price")).toHaveText(
    price ?? "",
  );
});
test("UI-012 Checkout total arithmetic", async ({ page }) => {
  await login(page);
  await page.getByTestId("add-to-cart-sauce-labs-backpack").click();
  await page.getByTestId("add-to-cart-sauce-labs-bike-light").click();
  await page.locator(".shopping_cart_link").click();
  await page.getByTestId("checkout").click();
  await customer(page);
  const cents = (text: string) =>
    Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100);
  const prices = (
    await page.locator(".inventory_item_price").allTextContents()
  ).map(cents);
  const subtotal = cents(
    await page.locator(".summary_subtotal_label").innerText(),
  );
  const tax = cents(await page.locator(".summary_tax_label").innerText());
  const total = cents(await page.locator(".summary_total_label").innerText());
  expect(subtotal).toBe(prices.reduce((a, b) => a + b, 0));
  expect(total).toBe(subtotal + tax);
});
