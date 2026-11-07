import type { Locator, Response } from '@playwright/test';
import type { Page } from '@playwright/test';

import { Routes } from '../types/routes';
import { SuitesSelectors as S } from '../types/suites.selectors';
import { workflow } from '../utils/allure.utils';
export class SuitesPage {
  public readonly owner;
  public readonly environment;
  public readonly unavailable;
  public constructor(private readonly page: Page) {
    this.owner = page.getByLabel(S.owner, { exact: true });
    this.environment = page.getByLabel(S.environment, { exact: true });
    this.unavailable = page.getByRole('status').filter({ hasText: S.unavailable });
  }
  public goto(): Promise<Response | null> {
    return workflow('Open test suites', () => this.page.goto(Routes.suites));
  }
  public openBuilder(): Promise<void> {
    return this.page.getByRole('button', { name: S.create, exact: true }).click();
  }
  public showSelectedOnly(): Promise<void> {
    return this.page.getByLabel(S.selectedOnly, { exact: true }).check();
  }
  public showAllTests(): Promise<void> {
    return this.page.getByRole('button', { name: S.showAll, exact: true }).click();
  }
  public selectMatchingTests(): Promise<void> {
    return this.page.getByRole('button', { name: S.matching, exact: true }).click();
  }
  public emptySelection(): Locator {
    return this.dialog().getByText(S.emptySelection, { exact: true });
  }
  public async createWithType(kind: string): Promise<void> {
    await this.page.getByRole('button', { name: S.create, exact: true }).click();
    await this.page.getByLabel(S.kind, { exact: true }).selectOption(kind);
    await this.page.getByRole('button', { name: S.matching, exact: true }).click();
  }
  public dialog(): Locator {
    return this.page.getByRole('dialog', { name: S.dialog });
  }
  public async filterLayout(): Promise<{
    searchTop: number;
    typeTop: number;
    searchHeight: number;
    typeHeight: number;
    panelHeight: number;
  }> {
    const search = await this.page.getByLabel(S.search, { exact: true }).boundingBox();
    const kind = await this.page.getByLabel(S.kind, { exact: true }).boundingBox();
    const panel = await this.page.locator(S.membership).boundingBox();
    if (!search || !kind || !panel) {
      throw new Error('Suite filters are not visible');
    }
    return {
      searchTop: search.y,
      typeTop: kind.y,
      searchHeight: search.height,
      typeHeight: kind.height,
      panelHeight: panel.height,
    };
  }
  public removeReviewedMember(id: string): Promise<void> {
    return this.membership(id).click();
  }
  public requestError(): Locator {
    return this.dialog().getByRole('alert');
  }
  public async reviewSelected(): Promise<void> {
    await this.page.getByLabel(S.selectedOnly, { exact: true }).check();
    await this.page.getByLabel(S.pageSize, { exact: true }).selectOption('8');
  }
  public heading(name: string): Locator {
    return this.page.getByRole('heading', { name, exact: true });
  }
  public card(name: string): Locator {
    return this.page.getByRole(S.article).filter({ has: this.heading(name) });
  }
  public membership(id: string): Locator {
    return this.page.getByRole('checkbox', { name: new RegExp(`^${id} `) });
  }
  public edit(name: string): Promise<void> {
    return workflow('Edit saved suite', () =>
      this.page.getByRole('button', { name: S.edit(name), exact: true }).click(),
    );
  }
  public fillDetails(input: {
    name: string;
    description: string;
    owner: string;
    tags: string;
  }): Promise<void> {
    return workflow('Enter suite details', async () => {
      if (!(await this.page.getByRole('dialog', { name: S.dialog }).isVisible())) {
        await this.page.getByRole('button', { name: S.create, exact: true }).click();
      }
      await this.page.getByLabel(S.name, { exact: true }).fill(input.name);
      await this.page.getByLabel(S.description, { exact: true }).fill(input.description);
      const options = this.page.locator(S.options);
      if (!(await options.evaluate((element) => element.hasAttribute('open')))) {
        await options.locator('summary').click();
      }
      await this.owner.fill(input.owner);
      await this.page.getByLabel(S.tags).fill(input.tags);
    });
  }
  public setMember(id: string, selected: boolean): Promise<void> {
    return workflow(`${selected ? 'Add' : 'Remove'} suite member ${id}`, () =>
      this.membership(id).setChecked(selected),
    );
  }
  public updateDescription(description: string): Promise<void> {
    return this.page.getByLabel(S.description, { exact: true }).fill(description);
  }
  public save(): Promise<void> {
    return workflow('Save suite', () =>
      this.page.getByRole('button', { name: S.save, exact: true }).click(),
    );
  }
  public run(name: string): Promise<void> {
    return workflow('Run saved suite', () =>
      this.card(name).getByRole('button', { name: S.run, exact: true }).click(),
    );
  }
  public runButton(name: string): Locator {
    return this.card(name).getByRole('button', { name: S.run, exact: true });
  }
  public selectEnvironment(id: string): Promise<string[]> {
    return this.environment.selectOption(id);
  }
}
