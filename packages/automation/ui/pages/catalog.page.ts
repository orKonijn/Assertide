import type { Locator, Page } from '@playwright/test';

import { CatalogSelectors as S } from '../types/catalog.selectors';
import { Routes } from '../types/routes';
import { workflow } from '../utils/allure.utils';
export class CatalogPage {
  public readonly selectedCount;
  public readonly startButtons;
  public readonly heading;
  public readonly cases;
  public readonly quarantined;
  public constructor(public readonly page: Page) {
    this.selectedCount = page.getByText(/^[0-9]+ tests selected$/);
    this.startButtons = page.getByRole('button', {
      name: S.start,
      exact: true,
    });
    this.heading = page.getByRole('heading', { name: S.heading, exact: true });
    this.cases = page.locator(S.cases);
    this.quarantined = page.getByLabel(S.quarantined);
  }
  public sortBy(value: string): Promise<string[]> {
    return this.page.getByLabel(S.sort, { exact: true }).selectOption(value);
  }
  public goToPage(number: number): Promise<void> {
    return this.page.getByRole('button', { name: S.page(number), exact: true }).click();
  }
  public deselectAll(): Promise<void> {
    return this.page.getByRole('button', { name: S.deselectAll, exact: true }).click();
  }
  public selectAll(): Promise<void> {
    return this.page.getByRole('button', { name: S.selectAll, exact: true }).click();
  }
  public goto(): Promise<void> {
    return workflow('Open test explorer', async () => {
      await this.page.goto(Routes.explorer);
    });
  }
  public selection(id: string): Locator {
    return this.page.getByLabel(S.select(id), { exact: true });
  }
  public editButton(id: string): Locator {
    return this.page.getByRole('button', { name: S.edit(id), exact: true });
  }
  public editMetadata(id: string): Promise<void> {
    return workflow('Edit catalog metadata', async () => {
      await this.search(id);
      await this.editButton(id).click();
    });
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
        await this.search(id);
        await this.selection(id).check();
      }
      await this.search('');
    });
  }
  public selectEnvironment(name: string): Promise<string[]> {
    return this.page.getByLabel(S.environment, { exact: true }).selectOption({ label: name });
  }
  public startExecution(): Promise<void> {
    return workflow('Start selected execution', () =>
      this.page.getByRole('button', { name: S.start, exact: true }).first().click(),
    );
  }
}
