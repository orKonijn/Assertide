import type { Locator, Response } from '@playwright/test';
import type { Page } from '@playwright/test';

import { ProjectsSelectors as S } from '../types/projects.selectors';
import { Routes } from '../types/routes';
import { workflow } from '../utils/allure.utils';
export class ProjectsPage {
  private readonly name;
  private readonly description;
  public constructor(private readonly page: Page) {
    this.name = page.getByLabel(S.name, { exact: true });
    this.description = page.getByLabel(S.description, { exact: true });
  }
  public goto(): Promise<Response | null> {
    return workflow('Open projects', () => this.page.goto(Routes.projects));
  }
  public heading(name: string): Locator {
    return this.page.getByRole('heading', { name, exact: true });
  }
  public card(name: string): Locator {
    return this.page.locator(S.section).filter({ has: this.heading(name) });
  }
  public create(name: string, description = ''): Promise<void> {
    return workflow('Create project', async () => {
      await this.name.fill(name);
      await this.description.fill(description);
      await this.page.getByRole('button', { name: S.create, exact: true }).click();
    });
  }
  public edit(name: string): Promise<void> {
    return workflow('Edit project', () =>
      this.page.getByRole('button', { name: S.edit(name), exact: true }).click(),
    );
  }
  public updateDescription(description: string): Promise<void> {
    return workflow('Save project description', async () => {
      await this.description.fill(description);
      await this.page.getByRole('button', { name: S.save, exact: true }).click();
    });
  }
}
