import { randomUUID } from 'node:crypto';

import { expect, test } from '../ui/fixtures/base.fixture';
import { RegistrationPage } from '../ui/pages/registration.page';
import { localPassword } from '../ui/utils/credentials.utils';

test.describe('Verified personal registration', () => {
  test.use({ storageState: { cookies: [], origins: [] }, sensitive: true });
  let registration: RegistrationPage;
  test.beforeEach(async ({ page }) => {
    registration = new RegistrationPage(page);
    await registration.goto();
  });
  test('verification provisions one isolated workspace and a reused verification link is rejected', async ({
    page,
  }) => {
    const email = `registration-${randomUUID()}@example.test`;
    await registration.keyboardOpenProvider();
    await registration.submit('Synthetic registrant', email, await localPassword());
    await expect(registration.pending).toBeVisible();
    expect((await page.request.get('http://127.0.0.1:4200/v1/me')).status()).toBe(401);
    expect(await registration.rejectedMailboxStatus()).toBe(403);
    await registration.verify();
    await expect(registration.welcome).toBeVisible();
    expect(await registration.reusedLinkStatus()).toBe(400);
    const identity = await (await page.request.get('/v1/me')).json();
    expect(identity.personalWorkspace).toBe(true);
    expect(identity.role).toBe('administrator');
    expect(identity.projectIds).toHaveLength(1);
    expect(
      (
        await page.request.post('/v1/onboarding', {
          headers: { Origin: 'https://untrusted.invalid' },
          data: { complete: true },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post('/v1/onboarding', {
          headers: { Origin: 'http://127.0.0.1:4200' },
          data: { complete: 'yes' },
        })
      ).status(),
    ).toBe(422);
    expect(
      (
        await page.request.get('/v1/projects/00000000-0000-4000-8000-000000000010/catalog')
      ).status(),
    ).toBe(404);
    await registration.dashboard();
    expect((await (await page.request.get('/v1/me')).json()).onboardingComplete).toBe(true);
    await page.request.post('/auth/logout', {
      headers: { Origin: 'http://127.0.0.1:4200' },
      data: {},
    });
    await registration.goto();
    await registration.openProvider();
    await registration.submit('Duplicate attempt', email, await localPassword());
    await expect.poll(async () => (await page.request.get('/v1/me')).status()).toBe(200);
    const again = await (await page.request.get('/v1/me')).json();
    expect(again.subject).toBe(identity.subject);
    expect(again.projectIds).toEqual(identity.projectIds);
  });
  test('invalid fixture email is actionable and cannot create application access', async ({
    page,
  }) => {
    await registration.openProvider();
    await registration.submit(
      'Synthetic registrant',
      'not-real@example.invalid',
      await localPassword(),
    );
    await expect(registration.alert).toContainText('synthetic .test email');
    expect((await page.request.get('http://127.0.0.1:4200/v1/me')).status()).toBe(401);
  });
  test('verification resend has a cooldown', async () => {
    await registration.openProvider();
    await registration.submit(
      'Synthetic cooldown',
      `cooldown-${randomUUID()}@example.test`,
      await localPassword(),
    );
    await expect(registration.pending).toBeVisible();
    await registration.resend();
    await expect(registration.alert).toContainText('Wait 60 seconds');
  });
});
