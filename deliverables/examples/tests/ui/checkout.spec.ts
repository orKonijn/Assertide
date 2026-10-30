import { test, expect } from '@playwright/test';
import * as allure from 'allure-js-commons';
import { LoginPage } from '../../pages/LoginPage';

test('UI-005 Checkout completes', { tag: ['@ui', '@smoke', '@e2e'] }, async ({ page, browserName }) => {
  await allure.allureId('UI-005');
  await allure.testCaseId('UI-005');
  await allure.epic('Quality sandbox');
  await allure.feature('Checkout');
  await allure.story('Checkout completes');
  await allure.owner('QA Platform');
  await allure.severity('critical');
  await allure.parameter('browser', browserName);
  await allure.parameter('environment', process.env.TEST_ENVIRONMENT ?? 'local');
  await test.step('Sign in as the standard demo user', async () => {
    await new LoginPage(page).signIn('standard_user', 'secret_sauce');
  });
  await test.step('Add backpack and check cart', async () => {
    await page.getByTestId('add-to-cart-sauce-labs-backpack').click();
    await page.locator('.shopping_cart_link').click();
    await expect(page.locator('.inventory_item_name')).toHaveText('Sauce Labs Backpack');
    await expect(page.locator('.cart_quantity')).toHaveText('1');
  });
  await test.step('Complete checkout with synthetic customer data', async () => {
    await page.getByTestId('checkout').click();
    await page.getByTestId('firstName').fill('Ada');
    await page.getByTestId('lastName').fill('Test');
    await page.getByTestId('postalCode').fill('10001');
    await page.getByTestId('continue').click();
    await expect(page.locator('.inventory_item_name')).toHaveText('Sauce Labs Backpack');
    await page.getByTestId('finish').click();
    await expect(page.locator('.complete-header')).toHaveText('Thank you for your order!');
    await expect(page.locator('.shopping_cart_badge')).toHaveCount(0);
  });
});
