import type { BrowserContext } from '@playwright/test';

import { NavigationComponent } from '../components/navigation.component';
import { LoginPage } from '../pages/login.page';
import type { Project } from '../types/platform';
import { TestData } from '../types/test-data';
import { localPassword } from '../utils/credentials.utils';
import { PlatformApi } from '../utils/platform-api.utils';
import { uniqueName } from '../utils/test-data.utils';
import { expect, test as base } from './base.fixture';
type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;
export const test = base.extend<
  { api: PlatformApi; isolatedProject: Project },
  { adminState: StorageState }
>({
  adminState: [
    async ({ browser }, use) => {
      const context = await browser.newContext({
        baseURL: TestData.origin,
        storageState: { cookies: [], origins: [] },
      });
      try {
        const page = await context.newPage();
        await new LoginPage(page).login(await localPassword());
        await expect(new NavigationComponent(page).heading).toHaveText('Quality at a glance');
        await use(await context.storageState());
      } finally {
        await context.close();
      }
    },
    { scope: 'worker' },
  ],
  storageState: async ({ adminState }, use) => use(adminState),
  api: async ({ page }, use) => use(new PlatformApi(page.request)),
  isolatedProject: async ({ api }, use) =>
    use(await api.createProject(uniqueName('UI regression'))),
});
export { expect };
