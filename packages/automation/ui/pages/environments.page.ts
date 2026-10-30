import type { Response } from '@playwright/test';
import type { Page } from '@playwright/test';

import { Routes } from '../types/routes';
import { SettingsSelectors as S } from '../types/settings.selectors';
import { registerSecret, workflow } from '../utils/allure.utils';
export class EnvironmentsPage {
  public readonly credentialValue;
  public readonly credentialStatus;
  public readonly environmentStatus;
  private readonly root;
  public constructor(private readonly page: Page) {
    this.credentialValue = page.getByLabel(S.credentialValue, { exact: true });
    this.credentialStatus = page.getByRole('status').filter({ hasText: S.credentialSaved });
    this.environmentStatus = page.getByRole('status').filter({ hasText: S.environmentSaved });
    this.root = page.locator(S.environmentRoot);
  }
  public goto(): Promise<Response | null> {
    return workflow('Open environment policies', () => this.page.goto(Routes.settings));
  }
  public saveCredential(name: string, value: string): Promise<void> {
    return workflow('Save write-only credential version', async () => {
      await this.page.getByLabel(S.credentialName, { exact: true }).fill(name);
      registerSecret(value);
      await this.credentialValue.fill(value);
      await this.page.getByRole('button', { name: S.saveCredential, exact: true }).click();
    });
  }
  public savePolicy(id: string, name: string, credential: string): Promise<void> {
    return workflow('Save environment credential reference', async () => {
      await this.page.getByLabel(S.environmentId, { exact: true }).fill(id);
      await this.page.getByLabel(S.environmentName, { exact: true }).fill(name);
      await this.page
        .getByLabel(S.passwordReference)
        .selectOption({ label: `${credential} · version 1` });
      await this.page.getByRole('button', { name: S.saveEnvironment, exact: true }).click();
    });
  }
}
