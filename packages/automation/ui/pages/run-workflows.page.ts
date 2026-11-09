import type { Locator, Page } from '@playwright/test';
export class RunWorkflowsPage {
  public constructor(private readonly page: Page) {}
  public history(value: string): Promise<string[]> {
    return this.page.getByLabel('History filter', { exact: true }).selectOption(value);
  }
  public group(value: string): Promise<string[]> {
    return this.page.getByLabel('Group by', { exact: true }).selectOption(value);
  }
  public async saveView(name: string): Promise<void> {
    await this.openViews();
    await this.page.getByLabel('View name', { exact: true }).fill(name);
    await this.page.getByRole('button', { name: 'Save view', exact: true }).click();
  }
  public async restoreView(name: string): Promise<string[]> {
    await this.openViews();
    return this.page.getByLabel('Saved view', { exact: true }).selectOption(name);
  }
  public clearFilters(): Promise<void> {
    return this.page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  }
  public historyFilter(): Locator {
    return this.page.getByLabel('History filter', { exact: true });
  }
  public grouping(): Locator {
    return this.page.getByLabel('Group by', { exact: true });
  }
  public configuration(): Locator {
    return this.page.getByRole('dialog', { name: 'Configure execution', exact: true });
  }
  public closeConfiguration(): Promise<void> {
    return this.page.getByRole('button', { name: 'Close configuration', exact: true }).click();
  }
  public filter(label: string): Promise<void> {
    return this.page
      .getByRole('group', { name: 'Filter test results' })
      .getByRole('button', { name: new RegExp('^' + label + ' \\(') })
      .click();
  }
  public panel(): Locator {
    return this.page.getByRole('dialog', { name: 'Investigate test result' });
  }
  public closePanel(): Promise<void> {
    return this.panel().getByRole('button', { name: 'Close investigation' }).click();
  }
  public inspectApi(): Promise<void> {
    return this.panel().getByRole('button', { name: 'Inspect API exchange' }).first().click();
  }
  public comparison(): Locator {
    return this.page.locator('app-run-comparison');
  }
  public openComparison(): Promise<void> {
    return this.comparison().locator('summary').click();
  }
  public refreshWorkspace(): Promise<void> {
    return this.page.getByRole('button', { name: 'Refresh execution', exact: true }).click();
  }
  public async selectionClearsNotifications(): Promise<boolean> {
    const action = await this.page
      .locator('.selection-bar')
      .getByRole('button', { name: 'Run selected', exact: true })
      .boundingBox();
    const bell = await this.page
      .getByRole('button', { name: 'Notification history', exact: true })
      .boundingBox();
    if (!action || !bell) {
      return false;
    }
    return (
      action.x + action.width <= bell.x ||
      bell.x + bell.width <= action.x ||
      action.y + action.height <= bell.y ||
      bell.y + bell.height <= action.y
    );
  }
  private async openViews(): Promise<void> {
    const views = this.page.locator('details.view-options');
    if (!(await views.evaluate((element) => element.hasAttribute('open')))) {
      await views.locator('summary').click();
    }
  }
}
