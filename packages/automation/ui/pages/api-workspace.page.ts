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
  public readonly environment;
  public readonly execution;
  public readonly older;
  public readonly unavailable;
  public constructor(private readonly page: Page) {
    this.exchanges = page.locator(S.exchanges);
    this.heading = page.getByRole('heading', { name: S.heading, exact: true });
    this.runButton = page.getByRole('button', { name: S.run, exact: true });
    this.evidence = page.getByLabel(S.evidence);
    this.selectedValue = page.getByLabel(S.value);
    this.environment = page.getByLabel(S.environment, { exact: true });
    this.execution = page.getByLabel(S.execution, { exact: true });
    this.older = page.getByRole('button', { name: S.older, exact: true });
    this.unavailable = page.getByRole('status').filter({ hasText: S.unavailable });
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
  public openFirstExchange(): Promise<void> {
    return this.exchanges.first().click();
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
      const disclosure = this.page.locator(S.pointerDisclosure);
      if (!(await disclosure.evaluate((element) => element.hasAttribute('open')))) {
        await disclosure.locator('summary').click();
      }
      await this.page.getByLabel(S.pointer, { exact: true }).fill(pointer);
      await this.page.getByRole('button', { name: S.inspect, exact: true }).click();
    });
  }
  public showCompleteExchange(): Promise<void> {
    return this.page.getByRole('button', { name: S.overview, exact: true }).click();
  }
  public selectEnvironment(id: string): Promise<string[]> {
    return this.environment.selectOption(id);
  }
  public executionOption(id: string): Locator {
    return this.execution.locator(`option[value="${id}"]`);
  }
  public loadOlder(): Promise<void> {
    return this.older.click();
  }
}
