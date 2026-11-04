import type { Page } from '@playwright/test';

import { workflow } from '../utils/allure.utils';
export class WorkspaceGuidePage {
  public readonly link;
  public readonly title;
  public readonly steps;
  public readonly explorer;
  public constructor(private readonly page: Page) {
    this.link = page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Getting started', exact: true });
    this.title = page.getByRole('heading', { name: 'Getting started', exact: true });
    this.steps = page.getByRole('region', { name: 'Getting started steps' }).getByRole('article');
    this.explorer = page.getByRole('link', { name: 'Open test explorer', exact: false });
  }
  public open(): Promise<void> {
    return workflow('Open workspace guide from navigation', () => this.link.click());
  }
  public finish(): Promise<void> {
    return this.page.getByRole('button', { name: 'Go to dashboard', exact: true }).click();
  }
}
