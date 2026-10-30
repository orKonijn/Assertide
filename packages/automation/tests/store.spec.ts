import { test, expect } from "../ui/fixtures/base.fixture";
import { StorePage } from "../ui/pages/store.page";
import { StoreData as D } from "../ui/types/store.selectors";

test.describe("Controlled storefront", () => {
  let store: StorePage;
  test.beforeEach(async ({ page }) => {
    store = new StorePage(page);
    await store.goto();
  });
  test.describe("Authentication", () => {
    test("UI-001 Valid login unlocks catalog", async ({ page }) => {
      await store.login();
      await expect(page).toHaveURL(/inventory.html$/);
      await expect(store.items).toHaveCount(6);
    });
    test("UI-002 Locked user cannot enter", async ({ page }) => {
      await store.login(D.locked);
      await expect(store.error).toContainText("locked out");
      await expect(page).not.toHaveURL(/inventory.html/);
    });
    test("UI-003 Invalid password is rejected", async ({ page }) => {
      await store.login(D.standard, D.invalidPassword);
      await expect(store.error).toBeVisible();
      await expect(page).not.toHaveURL(/inventory.html/);
    });
    test("UI-004 Required login input", async () => {
      await store.submitLogin();
      await expect(store.error).toContainText("Username is required");
      await store.enterUsername(D.standard);
      await store.submitLogin();
      await expect(store.error).toContainText("Password is required");
    });
    test("UI-009 Logout clears session", async () => {
      await store.login();
      await store.logout();
      await store.revisitInventory();
      await expect(store.loginButton).toBeVisible();
    });
  });
  test.describe("Cart and checkout", () => {
    test.beforeEach(async () => {
      await store.login();
    });
    test("UI-005 Checkout completes", async () => {
      await store.addProduct(D.backpack.slug);
      await store.openCart();
      await expect(store.itemNames).toHaveText(D.backpack.name);
      await store.checkout();
      await store.enterCustomer(D.customer);
      await store.continueCheckout();
      await store.finish();
      await expect(store.completion).toHaveText("Thank you for your order!");
      await expect(store.badge).toHaveCount(0);
    });
    test("UI-006 Cart removal preserves remaining items", async () => {
      await store.addProduct(D.backpack.slug);
      await store.addProduct(D.light.slug);
      await store.openCart();
      await store.removeProduct(D.backpack.slug);
      await expect(store.itemNames).toHaveText(D.light.name);
      await expect(store.badge).toHaveText("1");
    });
    test("UI-007 Price sort is numeric", async () => {
      await store.sortByPrice();
      const prices = await store.priceValues();
      expect(prices).toHaveLength(6);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
    });
    test("UI-008 Checkout rejects missing customer data", async () => {
      await store.addProduct(D.backpack.slug);
      await store.openCart();
      await store.checkout();
      await store.continueCheckout();
      await expect(store.error).toContainText("First Name is required");
      await store.enterCustomer({ ...D.customer, postalCode: "" });
      await store.continueCheckout();
      await expect(store.error).toContainText("Postal Code is required");
      await expect(store.badge).toHaveText("1");
    });
    test("UI-010 Cancel checkout preserves cart", async () => {
      await store.addProduct(D.backpack.slug);
      await store.openCart();
      await store.checkout();
      await store.cancelCheckout();
      await expect(store.itemNames).toHaveText(D.backpack.name);
    });
    test("UI-011 Product detail matches catalog", async () => {
      const price = await store.productPrice(D.backpack.name);
      await store.openProduct(D.backpack.name);
      await expect(store.detailName).toHaveText(D.backpack.name);
      await expect(store.detailPrice).toHaveText(price ?? "");
      await store.addDetailedProduct();
      await store.openCart();
      await expect(store.itemNames).toHaveText(D.backpack.name);
      await expect(store.prices).toHaveText(price ?? "");
      await expect(store.quantity).toHaveText("1");
      await store.attachCart();
    });
    test("UI-012 Checkout total arithmetic", async () => {
      await store.addProduct(D.backpack.slug);
      await store.addProduct(D.light.slug);
      await store.openCart();
      await store.checkout();
      await store.enterCustomer(D.customer);
      await store.continueCheckout();
      const totals = await store.totals();
      expect(totals.subtotal).toBe(totals.prices.reduce((a, b) => a + b, 0));
      expect(totals.total).toBe(totals.subtotal + totals.tax);
    });
  });
});
