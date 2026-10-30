import type { Locator, Response } from '@playwright/test';
import type { Page } from '@playwright/test';

import { CatalogSelectors as S } from '../types/catalog.selectors';
import { Routes } from '../types/routes';
import { workflow } from '../utils/allure.utils';
export class CatalogPage {
  public readonly heading;
  public readonly cases;
  public readonly quarantined;
  public constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: S.heading, exact: true });
    this.cases = page.getByRole('checkbox');
    this.quarantined = page.getByLabel(S.quarantined);
  }
  public goto(): Promise<Response | null> {
    return workflow('Open test explorer', () => this.page.goto(Routes.explorer));
  }
  public selection(id: string): Locator {
    return this.page.getByLabel(S.select(id), { exact: true });
  }
  public editButton(id: string): Locator {
    return this.page.getByRole('button', { name: S.edit(id), exact: true });
  }
  public editMetadata(id: string): Promise<void> {
    return workflow('Edit catalog metadata', () => this.editButton(id).click());
  }
  public updateMetadata(input: {
    module: string;
    owner: string;
    quarantined: boolean;
    enabled: boolean;
  }): Promise<void> {
    return workflow('Save catalog execution policy', async () => {
      await this.page.getByLabel(S.module, { exact: true }).fill(input.module);
      await this.page.getByLabel(S.owner, { exact: true }).fill(input.owner);
      await this.quarantined.setChecked(input.quarantined);
      await this.page.getByLabel(S.enabled, { exact: true }).setChecked(input.enabled);
      await this.page.getByRole('button', { name: S.save, exact: true }).click();
    });
  }
  public search(value: string): Promise<void> {
    return workflow('Search catalog', () => this.page.getByLabel(S.search).fill(value));
  }
  public select(ids: readonly string[]): Promise<void> {
    return workflow('Select catalog cases', async () => {
      for (const id of ids) {
        await this.selection(id).check();
      }
    });
  }
  public selectEnvironment(name: string): Promise<string[]> {
    return this.page.getByLabel(S.environment, { exact: true }).selectOption({ label: name });
  }
  public startExecution(): Promise<void> {
    return workflow('Start selected execution', () =>
      this.page.getByRole('button', { name: S.start, exact: true }).click(),
    );
  }
}
