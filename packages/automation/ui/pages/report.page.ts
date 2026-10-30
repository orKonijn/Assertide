import type { Locator, Response } from '@playwright/test';
import type { Page } from '@playwright/test';

import { ReportsSelectors as S } from '../types/reports.selectors';
import { ApiRoutes } from '../types/routes';
import { TestData } from '../types/test-data';
import { workflow } from '../utils/allure.utils';
export class AllureReportPage {
  public readonly expandButton;
  public constructor(private readonly page: Page) {
    this.expandButton = page.getByRole('button', {
      name: S.expand,
      exact: true,
    });
  }
  public goto(id: string): Promise<Response | null> {
    return workflow('Open authorized Allure report', () =>
      this.page.goto(TestData.origin + ApiRoutes.report(id)),
    );
  }
  public expand(): Promise<void> {
    return workflow('Expand report scenarios', () => this.expandButton.click());
  }
  public testTitle(title: string): Locator {
    return this.page.getByText(title, { exact: false }).first();
  }
  public url(): string {
    return this.page.url();
  }
  public async openScreenshot(title: string): Promise<void> {
    await this.testTitle(title).click();
    await this.page.getByText(/^Attachments/).click();
    await this.page.getByText('final-state.png', { exact: false }).first().click();
  }
  public screenshotImage(): Locator {
    return this.page.locator('img').first();
  }
  public async openStepScreenshot(title: string, step: string): Promise<void> {
    await this.testTitle(title).click();
    await this.page.getByText(step, { exact: true }).click();
    await this.page.getByText('step-state.png', { exact: true }).last().click();
  }
  public async responseStatus(): Promise<number> {
    return (await this.page.request.get(this.page.url())).status();
  }
  public close(): Promise<void> {
    return this.page.close();
  }
}
