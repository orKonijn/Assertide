import { expect, type Page } from "@playwright/test";
import { StoreSelectors as S, StoreData as D } from "../types/store.selectors";
import { workflow, registerSecret, screenshot } from "../utils/allure.utils";
import { moneyInCents } from "../utils/test-data.utils";
export class StorePage {
  readonly error;
  readonly items;
  readonly itemNames;
  readonly badge;
  readonly completion;
  readonly detailName;
  readonly detailPrice;
  readonly prices;
  readonly quantity;
  readonly loginButton;
  constructor(readonly page: Page) {
    this.error = page.getByTestId(S.error);
    this.items = page.locator(S.items);
    this.itemNames = page.locator(S.itemName);
    this.badge = page.locator(S.badge);
    this.completion = page.locator(S.complete);
    this.detailName = page.locator(S.detailName);
    this.detailPrice = page.locator(S.detailPrice);
    this.prices = page.locator(S.price);
    this.quantity = page.locator(S.quantity);
    this.loginButton = page.getByTestId(S.login);
  }
  goto() {
    return workflow("Open storefront sign-in", () =>
      this.page.goto(D.routes.login),
    );
  }
  login(user: string = D.standard, password: string = D.password) {
    return workflow("Sign in to controlled storefront", async () => {
      await this.page.getByTestId(S.username).fill(user);
      registerSecret(password);
      await this.page.getByTestId(S.password).fill(password);
      await this.loginButton.click();
    });
  }
  submitLogin() {
    return workflow("Submit required login fields", () =>
      this.loginButton.click(),
    );
  }
  enterUsername(user: string) {
    return this.page.getByTestId(S.username).fill(user);
  }
  addProduct(slug: string) {
    return workflow("Add product to cart", () =>
      this.page.getByTestId(S.addId(slug)).click(),
    );
  }
  openCart() {
    return workflow("Open shopping cart", async () => {
      await this.page.locator(S.cart).click();
      await this.page.waitForURL(/cart.html$/);
      await this.page.getByTestId(S.checkout).waitFor({ state: "visible" });
    });
  }
  removeProduct(slug: string) {
    return workflow("Remove product from cart", () =>
      this.page.getByTestId(S.removeId(slug)).click(),
    );
  }
  checkout() {
    return workflow("Begin checkout", () =>
      this.page.getByTestId(S.checkout).click(),
    );
  }
  enterCustomer(customer: {
    firstName: string;
    lastName: string;
    postalCode: string;
  }) {
    return workflow("Enter checkout customer details", async () => {
      for (const field of [S.firstName, S.lastName, S.postalCode] as const) {
        // The controlled storefront rerenders the form after each input event.
        let entered = "";
        for (const character of customer[field]) {
          await this.page.getByTestId(field).press("End");
          await this.page.getByTestId(field).pressSequentially(character);
          entered += character;
          await expect(this.page.getByTestId(field)).toHaveValue(entered);
        }
      }
    });
  }
  continueCheckout() {
    return workflow("Review checkout order", () =>
      this.page.getByTestId(S.continue).click(),
    );
  }
  finish() {
    return workflow("Complete purchase", () =>
      this.page.getByTestId(S.finish).click(),
    );
  }
  cancelCheckout() {
    return workflow("Cancel checkout", () =>
      this.page.getByTestId(S.cancel).click(),
    );
  }
  sortByPrice() {
    return workflow("Sort products by ascending price", () =>
      this.page.getByTestId(S.sort).selectOption(D.priceAscending),
    );
  }
  async priceValues() {
    return (await this.prices.allTextContents()).map(moneyInCents);
  }
  logout() {
    return workflow("Sign out of storefront", async () => {
      await this.page.getByRole("button", { name: S.menu }).click();
      await this.page.getByTestId(S.logout).click();
    });
  }
  revisitInventory() {
    return this.page.goto(D.routes.inventory);
  }
  productPrice(name: string) {
    return this.items.filter({ hasText: name }).locator(S.price).textContent();
  }
  openProduct(name: string) {
    return workflow("Inspect product details", () =>
      this.items
        .filter({ hasText: name })
        .getByText(name, { exact: true })
        .click(),
    );
  }
  addDetailedProduct() {
    return workflow("Add inspected product to cart", () =>
      this.page.getByRole("button", { name: S.add, exact: true }).click(),
    );
  }
  async totals() {
    await this.page.locator(S.subtotal).waitFor({ state: "visible" });
    return {
      prices: await this.priceValues(),
      subtotal: moneyInCents(await this.page.locator(S.subtotal).innerText()),
      tax: moneyInCents(await this.page.locator(S.tax).innerText()),
      total: moneyInCents(await this.page.locator(S.total).innerText()),
    };
  }
  attachCart() {
    return screenshot(this.page, "screenshot");
  }
}
