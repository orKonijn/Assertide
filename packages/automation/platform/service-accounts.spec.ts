import { ServiceAccountsPage } from '../ui/pages/service-accounts.page';
import { uniqueName } from '../ui/utils/test-data.utils';
import { expect, test } from './fixtures';
test.use({ sensitive: true, screenshot: 'off', trace: 'off', video: 'off' });
test.describe('CI credential lifecycle', () => {
  let accounts: ServiceAccountsPage;
  test.beforeEach(async ({ page }) => {
    accounts = new ServiceAccountsPage(page);
    await accounts.goto();
  });
  test('administrator creates, rotates and revokes a CI credential', async ({
    api,
    diagnostics,
  }) => {
    const name = uniqueName('Pipeline');
    const token = await accounts.create(name);
    diagnostics.secrets.push(token);
    expect(await api.tokenStatus(token)).toBe(200);
    const rotated = await accounts.rotate(name);
    diagnostics.secrets.push(rotated);
    expect(await api.tokenStatus(token)).toBe(401);
    expect(await api.tokenStatus(rotated)).toBe(200);
    expect(await accounts.revoke(name)).toBe(200);
    await expect(accounts.card(name)).toContainText('Revoked');
    await expect(accounts.revokeButton(name)).toBeDisabled();
    expect(await api.tokenStatus(rotated)).toBe(401);
  });
});
