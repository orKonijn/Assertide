import type { Locator, Response } from '@playwright/test';
import type { Page } from '@playwright/test';

import { Routes } from '../types/routes';
import { SettingsSelectors as S } from '../types/settings.selectors';
import { workflow } from '../utils/allure.utils';
export class MembersPage {
  public constructor(private readonly page: Page) {}
  public goto(): Promise<Response | null> {
    return workflow('Open member administration', () => this.page.goto(Routes.settings));
  }
  public subject(value: string): Locator {
    return this.page.getByRole('cell', { name: value, exact: true });
  }
  public role(subject: string, role: string): Locator {
    return this.page
      .getByRole('row')
      .filter({ hasText: subject })
      .getByRole('cell', { name: role, exact: true });
  }
  public add(subject: string, name: string, project: string): Promise<void> {
    return workflow('Grant project membership', async () => {
      await this.page.getByLabel(S.memberSubject, { exact: true }).fill(subject);
      await this.page.getByLabel(S.memberName, { exact: true }).fill(name);
      await this.page.getByRole('checkbox', { name: project, exact: true }).check();
      await this.page.getByRole('button', { name: S.addMember, exact: true }).click();
    });
  }
  public setRole(name: string, role: string): Promise<void> {
    return workflow('Update member role', async () => {
      await this.page.getByRole('button', { name: S.edit(name), exact: true }).click();
      await this.page.getByLabel(S.memberRole).selectOption(role);
      await this.page.getByRole('button', { name: S.saveMember, exact: true }).click();
    });
  }
}
