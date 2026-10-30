import type { Locator, Response } from '@playwright/test';
import type { Page } from '@playwright/test';

import { Routes } from '../types/routes';
import { SuitesSelectors as S } from '../types/suites.selectors';
import { workflow } from '../utils/allure.utils';
export class SuitesPage {
  public readonly owner;
  public constructor(private readonly page: Page) {
    this.owner = page.getByLabel(S.owner, { exact: true });
  }
  public goto(): Promise<Response | null> {
    return workflow('Open test suites', () => this.page.goto(Routes.suites));
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
      await this.page.getByLabel(S.name, { exact: true }).fill(input.name);
      await this.page.getByLabel(S.description, { exact: true }).fill(input.description);
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
}
