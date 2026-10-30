import type { Response } from '@playwright/test';
import { expect, type Page } from '@playwright/test';

import { StoreData as D, StoreSelectors as S } from '../types/store.selectors';
import { registerSecret, screenshot, workflow } from '../utils/allure.utils';
import { moneyInCents } from '../utils/test-data.utils';
export class StorePage {
  public readonly error;
  public readonly items;
  public readonly itemNames;
  public readonly badge;
  public readonly completion;
  public readonly detailName;
  public readonly detailPrice;
  public readonly prices;
  public readonly quantity;
  public readonly loginButton;
  public constructor(private readonly page: Page) {
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
  public goto(): Promise<Response | null> {
    return workflow('Open storefront sign-in', () => this.page.goto(D.routes.login));
  }
  public login(user: string = D.standard, password: string = D.password): Promise<void> {
    return workflow('Sign in to controlled storefront', async () => {
      await this.page.getByTestId(S.username).fill(user);
      registerSecret(password);
      await this.page.getByTestId(S.password).fill(password);
      await this.loginButton.click();
    });
  }
  public submitLogin(): Promise<void> {
    return workflow('Submit required login fields', () => this.loginButton.click());
  }
  public enterUsername(user: string): Promise<void> {
    return this.page.getByTestId(S.username).fill(user);
  }
  public addProduct(slug: string): Promise<void> {
    return workflow('Add product to cart', () => this.page.getByTestId(S.addId(slug)).click());
  }
  public openCart(): Promise<void> {
    return workflow('Open shopping cart', async () => {
      await this.page.locator(S.cart).click();
      await this.page.waitForURL(/cart.html$/);
      await this.page.getByTestId(S.checkout).waitFor({ state: 'visible' });
    });
  }
  public removeProduct(slug: string): Promise<void> {
    return workflow('Remove product from cart', () =>
      this.page.getByTestId(S.removeId(slug)).click(),
    );
  }
  public checkout(): Promise<void> {
    return workflow('Begin checkout', () => this.page.getByTestId(S.checkout).click());
  }
  public enterCustomer(customer: {
    firstName: string;
    lastName: string;
    postalCode: string;
  }): Promise<void> {
    return workflow('Enter checkout customer details', async () => {
      for (const field of [S.firstName, S.lastName, S.postalCode] as const) {
        // The controlled storefront rerenders the form after each input event.
        let entered = '';
        for (const character of customer[field]) {
          await this.page.getByTestId(field).press('End');
          await this.page.getByTestId(field).pressSequentially(character);
          entered += character;
          await expect(this.page.getByTestId(field)).toHaveValue(entered);
        }
      }
    });
  }
  public continueCheckout(): Promise<void> {
    return workflow('Review checkout order', () => this.page.getByTestId(S.continue).click());
  }
  public finish(): Promise<void> {
    return workflow('Complete purchase', () => this.page.getByTestId(S.finish).click());
  }
  public cancelCheckout(): Promise<void> {
    return workflow('Cancel checkout', () => this.page.getByTestId(S.cancel).click());
  }
  public sortByPrice(): Promise<string[]> {
    return workflow('Sort products by ascending price', () =>
      this.page.getByTestId(S.sort).selectOption(D.priceAscending),
    );
  }
  public async priceValues(): Promise<number[]> {
    return (await this.prices.allTextContents()).map(moneyInCents);
  }
  public logout(): Promise<void> {
    return workflow('Sign out of storefront', async () => {
      await this.page.getByRole('button', { name: S.menu }).click();
      await this.page.getByTestId(S.logout).click();
    });
  }
  public revisitInventory(): Promise<Response | null> {
    return this.page.goto(D.routes.inventory);
  }
  public productPrice(name: string): Promise<string | null> {
    return this.items.filter({ hasText: name }).locator(S.price).textContent();
  }
  public openProduct(name: string): Promise<void> {
    return workflow('Inspect product details', () =>
      this.items.filter({ hasText: name }).getByText(name, { exact: true }).click(),
    );
  }
  public addDetailedProduct(): Promise<void> {
    return workflow('Add inspected product to cart', () =>
      this.page.getByRole('button', { name: S.add, exact: true }).click(),
    );
  }
  public async totals(): Promise<{
    prices: number[];
    subtotal: number;
    tax: number;
    total: number;
  }> {
    await this.page.locator(S.subtotal).waitFor({ state: 'visible' });
    return {
      prices: await this.priceValues(),
      subtotal: moneyInCents(await this.page.locator(S.subtotal).innerText()),
      tax: moneyInCents(await this.page.locator(S.tax).innerText()),
      total: moneyInCents(await this.page.locator(S.total).innerText()),
    };
  }
  public attachCart(): Promise<void> {
    return screenshot(this.page, 'screenshot');
  }
}
