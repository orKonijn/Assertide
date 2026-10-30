import { expect, test } from '../ui/fixtures/base.fixture';
import { StorePage } from '../ui/pages/store.page';
import { StoreData as D } from '../ui/types/store.selectors';
import { baskets, products } from '../ui/types/store-regression.data';
import { workflow } from '../ui/utils/allure.utils';

test.describe('Advanced storefront journeys', () => {
  let store: StorePage;
  test.beforeEach(async ({ page }) => {
    store = new StorePage(page);
    await store.goto();
  });
  async function add(indexes: readonly number[]): Promise<void> {
    for (const index of indexes) {
      await store.addProduct(products[index]!.slug);
    }
  }
  async function review(indexes: readonly number[]): Promise<void> {
    await store.openCart();
    await store.verifyCart(indexes.map((i) => products[i]!.name));
    await store.checkout();
    await store.enterCustomer(D.customer);
    await store.continueCheckout();
    await workflow('Verify item prices, rounded tax and grand total', async () => {
      const totals = await store.totals();
      const subtotal = indexes.reduce((sum, i) => sum + products[i]!.cents, 0);
      expect(totals.prices.sort((a, b) => a - b)).toEqual(
        indexes.map((i) => products[i]!.cents).sort((a, b) => a - b),
      );
      expect(totals.subtotal).toBe(subtotal);
      expect(totals.tax).toBe(Math.round(subtotal * 0.08));
      expect(totals.total).toBe(subtotal + Math.round(subtotal * 0.08));
    });
  }
  for (const [index, product] of products.entries()) {
    test(`UI-${String(13 + index).padStart(3, '0')} ${product.name} stays consistent across detail reload and cart removal`, async () => {
      await store.login();
      const price = await store.productPrice(product.name);
      await store.openProduct(product.name);
      await expect(store.detailName).toHaveText(product.name);
      await expect(store.detailPrice).toHaveText(price!);
      await store.addDetailedProduct();
      await store.reload();
      await expect(store.badge).toHaveText('1');
      await store.openCart();
      await store.verifyCart([product.name]);
      await expect(store.prices).toHaveText(price!);
      await store.removeProduct(product.slug);
      await store.reload();
      await store.verifyCart([]);
    });
  }
  for (const [index, mode] of ['az', 'za', 'lohi', 'hilo'].entries()) {
    test(`UI-${String(19 + index).padStart(3, '0')} ${mode} sorting preserves selected products and their prices`, async () => {
      await store.login();
      await add([0, 5]);
      await store.sort(mode);
      await workflow('Verify catalog ordering and preserved selection', async () => {
        if (mode === 'az' || mode === 'za') {
          const expected = products.map((p) => p.name).sort();
          if (mode === 'za') {
            expected.reverse();
          }
          await expect(store.itemNames).toHaveText(expected);
        } else {
          const expected = products
            .map((p) => p.cents)
            .sort((a, b) => (mode === 'lohi' ? a - b : b - a));
          expect(await store.priceValues()).toEqual(expected);
        }
        await expect(store.badge).toHaveText('2');
      });
      await store.openCart();
      await store.verifyCart([products[0].name, products[5].name]);
      await store.continueShopping();
      await store.reload();
      await store.openCart();
      await store.verifyCart([products[0].name, products[5].name]);
    });
  }
  for (const [index, basket] of baskets.entries()) {
    test(`UI-${String(23 + index).padStart(3, '0')} ${basket.name} reconciles through checkout and clears after purchase`, async () => {
      await store.login();
      await add(basket.indexes);
      await store.reload();
      await review(basket.indexes);
      await store.finish();
      await expect(store.completion).toHaveText('Thank you for your order!');
      await expect(store.badge).toHaveCount(0);
      await store.backHome();
      await store.openCart();
      await store.verifyCart([]);
    });
  }
  const removals = [[0], [5], [0, 2, 4], [0, 1, 2], [3, 4, 5], [0, 1, 2, 3, 4, 5]];
  for (const [index, removed] of removals.entries()) {
    test(`UI-${String(29 + index).padStart(3, '0')} Remove product positions ${removed.join('-')} then restore a persisted full basket`, async () => {
      await store.login();
      await add([0, 1, 2, 3, 4, 5]);
      await store.openCart();
      for (const i of removed) {
        await store.removeProduct(products[i]!.slug);
      }
      const remaining = products.filter((_, i) => !removed.includes(i)).map((p) => p.name);
      await store.verifyCart(remaining);
      await store.reload();
      await store.verifyCart(remaining);
      await store.continueShopping();
      await add(removed);
      await store.openCart();
      await store.verifyCart(products.map((p) => p.name));
    });
  }
  const incomplete = [
    { name: 'all fields blank', firstName: '', lastName: '', postalCode: '', error: 'First Name' },
    { name: 'only first name', firstName: 'Ada', lastName: '', postalCode: '', error: 'Last Name' },
    {
      name: 'missing postal code',
      firstName: 'Ada',
      lastName: 'Test',
      postalCode: '',
      error: 'Postal Code',
    },
    {
      name: 'missing first name',
      firstName: '',
      lastName: 'Test',
      postalCode: '10001',
      error: 'First Name',
    },
    {
      name: 'missing last name',
      firstName: 'Ada',
      lastName: '',
      postalCode: '10001',
      error: 'Last Name',
    },
    {
      name: 'postal code without names',
      firstName: '',
      lastName: '',
      postalCode: '10001',
      error: 'First Name',
    },
  ];
  for (const [index, customer] of incomplete.entries()) {
    test(`UI-${String(35 + index).padStart(3, '0')} Checkout recovers from ${customer.name} without losing the basket`, async () => {
      await store.login();
      await add([0, 4]);
      await store.openCart();
      await store.checkout();
      await store.enterCustomer(customer);
      await store.continueCheckout();
      await expect(store.error).toContainText(`${customer.error} is required`);
      await expect(store.badge).toHaveText('2');
      await store.cancelCheckout();
      await store.verifyCart([products[0].name, products[4].name]);
      await store.checkout();
      await store.enterCustomer(D.customer);
      await store.continueCheckout();
      await store.finish();
      await expect(store.completion).toBeVisible();
      await expect(store.badge).toHaveCount(0);
    });
  }
  test('UI-041 Invalid-password recovery supports a complete purchase', async () => {
    await store.login(D.standard, D.invalidPassword);
    await expect(store.error).toBeVisible();
    await store.login();
    await add([0, 2]);
    await review([0, 2]);
    await store.finish();
    await expect(store.completion).toBeVisible();
  });
  test('UI-042 Locked-user rejection does not prevent a standard session and persisted cart', async () => {
    await store.login(D.locked);
    await expect(store.error).toContainText('locked out');
    await store.login();
    await add([4]);
    await store.reload();
    await store.openCart();
    await store.verifyCart([products[4].name]);
  });
  test('UI-043 Anonymous inventory navigation is denied before valid login restores access', async () => {
    await store.revisitInventory();
    await expect(store.loginButton).toBeVisible();
    await expect(store.error).toBeVisible();
    await store.login();
    await expect(store.items).toHaveCount(6);
    await add([1]);
    await store.openCart();
    await store.verifyCart([products[1].name]);
  });
  test('UI-044 Logout revokes protected navigation and a fresh login restores shopping', async () => {
    await store.login();
    await add([0]);
    await store.logout();
    await store.revisitInventory();
    await expect(store.loginButton).toBeVisible();
    await store.login();
    await expect(store.items).toHaveCount(6);
    await store.openCart();
    await store.verifyCart([products[0].name]);
  });
  test('UI-045 Session and multi-product basket survive a full document reload', async () => {
    await store.login();
    await add([0, 3, 5]);
    await store.reload();
    await expect(store.items).toHaveCount(6);
    await review([0, 3, 5]);
    await store.finish();
    await expect(store.completion).toBeVisible();
  });
  test('UI-046 Keyboard submission recovers from missing credentials then supports cart edits', async () => {
    await store.enterUsername(D.standard);
    await store.submitLoginByKeyboard();
    await expect(store.error).toContainText('Password is required');
    await store.login();
    await add([0, 2]);
    await store.openCart();
    await store.removeProduct(products[0].slug);
    await store.verifyCart([products[2].name]);
  });
  test('UI-047 Cancel order review then change basket and recalculate totals', async () => {
    await store.login();
    await add([0, 4]);
    await review([0, 4]);
    await store.cancelCheckout();
    await store.removeProduct(products[0].slug);
    await add([5]);
    await review([4, 5]);
    await store.finish();
    await expect(store.completion).toBeVisible();
  });
  test('UI-048 Cancel customer entry then remove an item before restarting checkout', async () => {
    await store.login();
    await add([1, 2]);
    await store.openCart();
    await store.checkout();
    await store.enterCustomer({ ...D.customer, postalCode: '' });
    await store.cancelCheckout();
    await store.removeProduct(products[1].slug);
    await store.continueShopping();
    await review([2]);
    await store.finish();
    await expect(store.completion).toBeVisible();
  });
  test('UI-049 Consecutive purchases never carry over the previous basket', async () => {
    await store.login();
    await add([0, 1]);
    await review([0, 1]);
    await store.finish();
    await store.backHome();
    await add([4, 5]);
    await review([4, 5]);
    await store.finish();
    await expect(store.completion).toBeVisible();
    await expect(store.badge).toHaveCount(0);
  });
  test('UI-050 Detail removal updates catalog selection and persisted cart', async () => {
    await store.login();
    await add([0, 4]);
    await store.openProduct(products[4].name);
    await store.removeDetailedProduct();
    await store.backToProducts();
    await store.reload();
    await store.openCart();
    await store.verifyCart([products[0].name]);
  });
  test('UI-051 Cart detail navigation does not duplicate an already selected product', async () => {
    await store.login();
    await add([4]);
    await store.openCart();
    await store.openCartProduct(products[4].name);
    await expect(store.detailName).toHaveText(products[4].name);
    await store.reload();
    await expect(store.badge).toHaveText('1');
    await store.openCart();
    await store.verifyCart([products[4].name]);
  });
  test('UI-052 Repeated sorting keeps selection stable across all sort directions', async () => {
    await store.login();
    await add([1, 3]);
    for (const mode of ['hilo', 'za', 'lohi', 'az']) {
      await store.sort(mode);
      await expect(store.badge).toHaveText('2');
    }
    await store.openCart();
    await store.verifyCart([products[1].name, products[3].name]);
    await store.continueShopping();
    await review([1, 3]);
  });
  test('UI-053 Emptying a basket and continuing shopping starts a clean checkout', async () => {
    await store.login();
    await add([0, 2]);
    await store.openCart();
    await store.removeProduct(products[0].slug);
    await store.removeProduct(products[2].slug);
    await store.verifyCart([]);
    await store.reload();
    await store.verifyCart([]);
    await store.continueShopping();
    await add([5]);
    await review([5]);
  });
  test('UI-054 Catalog add-remove-add cycles persist exactly one unit', async () => {
    await store.login();
    await add([4]);
    await store.removeProduct(products[4].slug);
    await expect(store.badge).toHaveCount(0);
    await add([4]);
    await store.reload();
    await store.openCart();
    await store.verifyCart([products[4].name]);
    await store.continueShopping();
    await review([4]);
  });
  for (const [index, width] of [320, 390, 768, 1280].entries()) {
    test(`UI-${String(55 + index).padStart(3, '0')} ${width}px viewport supports sorted catalog through multi-item checkout`, async () => {
      await store.resize(width, 900);
      await store.login();
      await store.sort('hilo');
      await add([0, 5]);
      await review([0, 5]);
      await store.finish();
      await expect(store.completion).toBeVisible();
      await expect(store.badge).toHaveCount(0);
      await store.backHome();
      await expect(store.items).toHaveCount(6);
    });
  }
  for (const [index, stage] of ['cart', 'customer', 'review', 'complete'].entries()) {
    test(`UI-${String(59 + index).padStart(3, '0')} Reload at ${stage} preserves the correct purchase state`, async () => {
      await store.login();
      await add([0, 4]);
      await store.openCart();
      if (stage !== 'cart') {
        await store.checkout();
      }
      if (stage === 'review' || stage === 'complete') {
        await store.enterCustomer(D.customer);
        await store.continueCheckout();
      }
      if (stage === 'complete') {
        await store.finish();
      }
      await store.reload();
      if (stage === 'cart') {
        await store.verifyCart([products[0].name, products[4].name]);
        await store.checkout();
      }
      if (stage === 'cart' || stage === 'customer') {
        await store.enterCustomer(D.customer);
        await store.continueCheckout();
      }
      if (stage !== 'complete') {
        await store.verifyTitle('Checkout: Overview');
        await store.verifyCart([products[0].name, products[4].name]);
        await store.finish();
      }
      await expect(store.completion).toBeVisible();
      await expect(store.badge).toHaveCount(0);
      await store.backHome();
      await store.openCart();
      await store.verifyCart([]);
    });
  }
});
