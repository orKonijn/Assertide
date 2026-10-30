import type { Page } from '@playwright/test';

import { registerSecret, workflow } from '../utils/allure.utils';
const Selectors = { token: 'New CI token' } as const;
export class DiagnosticProbePage {
  public constructor(private readonly page: Page) {}
  public async open(secret: string): Promise<void> {
    registerSecret(secret);
    await this.page.goto('data:text/html,<label>New CI token<input></label>');
    await this.page.getByLabel(Selectors.token, { exact: true }).fill(secret);
  }
  public fail(secret: string): Promise<never> {
    return workflow('Inspect protected diagnostic boundary', async () => {
      throw new Error(`Synthetic failure ${secret}`);
    });
  }
  public verify(): Promise<void> {
    return workflow('Verify protected diagnostic page', async () => {
      await this.page.getByLabel(Selectors.token, { exact: true }).waitFor();
    });
  }
}
