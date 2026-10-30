import type { Download, Locator, Response } from '@playwright/test';
import type { Page } from '@playwright/test';

import { ApiWorkspaceSelectors as S } from '../types/api-workspace.selectors';
import { Routes } from '../types/routes';
import { workflow } from '../utils/allure.utils';
export class ApiWorkspacePage {
  public readonly exchanges;
  public readonly heading;
  public readonly runButton;
  public readonly evidence;
  public readonly selectedValue;
  public constructor(private readonly page: Page) {
    this.exchanges = page.locator(S.exchanges);
    this.heading = page.getByRole('heading', { name: S.heading, exact: true });
    this.runButton = page.getByRole('button', { name: S.run, exact: true });
    this.evidence = page.getByLabel(S.evidence);
    this.selectedValue = page.getByLabel(S.value);
  }
  public goToExchangePage(number: number): Promise<void> {
    return this.page.getByRole('button', { name: S.page(number), exact: true }).click();
  }
  public goto(): Promise<Response | null> {
    return workflow('Open API evidence workspace', () => this.page.goto(Routes.api));
  }
  public executableCount(count: number): Locator {
    return this.page.getByText(S.executable(count), { exact: false });
  }
  public runSuite(): Promise<void> {
    return workflow('Run enabled API cases', () => this.runButton.click());
  }
  public selectExecution(id: string): Promise<string[]> {
    return workflow('Select recorded execution', () =>
      this.page.getByLabel(S.execution, { exact: true }).selectOption(id),
    );
  }
  public openExchange(id: string): Promise<void> {
    return workflow('Inspect recorded exchange', () =>
      this.page
        .getByRole('button', {
          name: new RegExp(`${id} .*attempt 1 .*api-exchange.json`),
        })
        .first()
        .click(),
    );
  }
  public async download(): Promise<Download> {
    return workflow('Download redacted exchange JSON', async () => {
      const download = this.page.waitForEvent('download');
      await this.page.getByRole('button', { name: S.download, exact: true }).click();
      return download;
    });
  }
  public inspectPointer(pointer: string): Promise<void> {
    return workflow('Inspect JSON pointer', async () => {
      await this.page.getByLabel(S.pointer, { exact: true }).fill(pointer);
      await this.page.getByRole('button', { name: S.inspect, exact: true }).click();
    });
  }
}
