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
      if (user === D.standard && password === D.password) {
        await this.page.waitForURL(/inventory.html$/);
        await expect(this.items).toHaveCount(6);
      } else {
        await expect(this.error).toBeVisible();
      }
    });
  }
  public submitLogin(): Promise<void> {
    return workflow('Submit required login fields', () => this.loginButton.click());
  }
  public enterUsername(user: string): Promise<void> {
    return workflow('Enter storefront username', () =>
      this.page.getByTestId(S.username).fill(user),
    );
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
    return workflow('Begin checkout', async () => {
      await this.page.getByTestId(S.checkout).click();
      await this.page.waitForURL(/checkout-step-one.html$/);
      await this.page.getByTestId(S.firstName).waitFor({ state: 'visible' });
    });
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
    return workflow('Complete purchase', async () => {
      await this.page.getByTestId(S.finish).click();
      await this.page.waitForURL(/checkout-complete.html$/);
      await expect(this.completion).toBeVisible();
    });
  }
  public cancelCheckout(): Promise<void> {
    return workflow('Cancel checkout', async () => {
      const customerStage = this.page.url().endsWith('/checkout-step-one.html');
      await this.page.getByTestId(S.cancel).click();
      await this.page.waitForURL(customerStage ? /cart.html$/ : /inventory.html$/);
      if (customerStage) {
        await this.page.getByTestId(S.checkout).waitFor({ state: 'visible' });
      } else {
        await expect(this.items).toHaveCount(6);
      }
    });
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
    return workflow('Revisit storefront inventory', () => this.page.goto(D.routes.inventory));
  }
  public productPrice(name: string): Promise<string | null> {
    return this.items.filter({ hasText: name }).locator(S.price).textContent();
  }
  public openProduct(name: string): Promise<void> {
    return workflow('Inspect product details', async () => {
      await this.items.filter({ hasText: name }).getByText(name, { exact: true }).click();
      await expect(this.detailName).toHaveText(name);
    });
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
  public reload(): Promise<Response | null> {
    return workflow('Reload and restore persisted storefront state', () => this.page.reload());
  }
  public visit(route: string): Promise<Response | null> {
    return workflow(`Navigate to ${route}`, () => this.page.goto(route));
  }
  public sort(mode: string): Promise<string[]> {
    return workflow(`Sort catalog by ${mode}`, () =>
      this.page.getByTestId(S.sort).selectOption(mode),
    );
  }
  public backToProducts(): Promise<void> {
    return workflow('Return from details to products', async () => {
      await this.page.getByTestId('back-to-products').click();
      await this.page.waitForURL(/inventory.html$/);
      await expect(this.items).toHaveCount(6);
    });
  }
  public continueShopping(): Promise<void> {
    return workflow('Continue shopping from cart', async () => {
      await this.page.getByTestId('continue-shopping').click();
      await this.page.waitForURL(/inventory.html$/);
      await expect(this.items).toHaveCount(6);
    });
  }
  public backHome(): Promise<void> {
    return workflow('Start shopping after completed purchase', async () => {
      await this.page.getByTestId('back-to-products').click();
      await this.page.waitForURL(/inventory.html$/);
      await expect(this.items).toHaveCount(6);
    });
  }
  public removeDetailedProduct(): Promise<void> {
    return workflow('Remove inspected product', () =>
      this.page.getByRole('button', { name: 'Remove', exact: true }).click(),
    );
  }
  public openCartProduct(name: string): Promise<void> {
    return workflow('Inspect a product from the cart', async () => {
      await this.itemNames.filter({ hasText: name }).click();
      await expect(this.detailName).toHaveText(name);
    });
  }
  public submitLoginByKeyboard(): Promise<void> {
    return workflow('Submit sign-in using keyboard', () =>
      this.page.getByTestId(S.password).press('Enter'),
    );
  }
  public resize(width: number, height: number): Promise<void> {
    return workflow(`Use ${width} by ${height} viewport`, () =>
      this.page.setViewportSize({ width, height }),
    );
  }
  public async verifyCart(names: readonly string[]): Promise<void> {
    await workflow('Verify cart contents, quantities and badge agree', async () => {
      await expect(this.itemNames).toHaveCount(names.length);
      expect((await this.itemNames.allTextContents()).sort()).toEqual([...names].sort());
      if (names.length) {
        await expect(this.badge).toHaveText(String(names.length));
        await expect(this.quantity).toHaveText(names.map(() => '1'));
      } else {
        await expect(this.badge).toHaveCount(0);
      }
    });
  }
  public async verifyTitle(title: string): Promise<void> {
    await workflow('Verify current storefront stage', () =>
      expect(this.page.locator('.title')).toHaveText(title),
    );
  }
}
