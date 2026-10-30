import type { Locator, Response } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  PracticeData as D,
  PracticeRoutes as R,
  PracticeSelectors as S,
} from '../types/practice.selectors';
import { workflow } from '../utils/allure.utils';
export class PracticePage {
  public readonly finish;
  public readonly boxes;
  public readonly dropdown;
  public readonly selectedOption;
  public readonly result;
  public readonly heading;
  public readonly uploaded;
  public readonly input;
  public constructor(private readonly page: Page) {
    this.finish = page.locator(S.finish);
    this.boxes = page.getByRole(S.checkbox);
    this.dropdown = page.getByRole(S.dropdown);
    this.selectedOption = page.locator(S.selected);
    this.result = page.locator(S.result);
    this.heading = page.getByRole('heading', { name: S.windowHeading });
    this.uploaded = page.locator(S.uploaded);
    this.input = page.locator(S.input);
  }
  public goto(route: string): Promise<Response | null> {
    return workflow('Open manual practice exercise', () => this.page.goto(R.origin + route));
  }
  public startLoading(): Promise<void> {
    return workflow('Request dynamically loaded content', () =>
      this.page.getByRole('button', { name: S.start, exact: true }).click(),
    );
  }
  public async setCheckboxes(): Promise<void> {
    await this.boxes.nth(0).check();
    await this.boxes.nth(1).uncheck();
  }
  public selectOption(): Promise<string[]> {
    return this.dropdown.selectOption(D.option);
  }
  public confirm(accept: boolean): Promise<void> {
    return workflow(`${accept ? 'Accept' : 'Dismiss'} confirmation`, async () => {
      this.page.once('dialog', (dialog) => (accept ? dialog.accept() : dialog.dismiss()));
      await this.page.getByRole('button', { name: S.confirm, exact: true }).click();
    });
  }
  public async openWindow(): Promise<{ page: Page; heading: Locator }> {
    const popup = this.page.waitForEvent('popup');
    await this.page.getByRole('link', { name: S.openWindow, exact: true }).click();
    const page = await popup;
    return {
      page,
      heading: page.getByRole('heading', { name: S.newWindow, exact: true }),
    };
  }
  public upload(): Promise<void> {
    return workflow('Upload synthetic text fixture', async () => {
      await this.page.locator(S.upload).setInputFiles({
        name: D.fileName,
        mimeType: 'text/plain',
        buffer: Buffer.from(D.fileBody),
      });
      await this.page.getByRole('button', { name: S.uploadButton, exact: true }).click();
    });
  }
  public enable(): Promise<void> {
    return this.page.getByRole('button', { name: S.enable, exact: true }).click();
  }
  public enterText(): Promise<void> {
    return this.input.fill(D.input);
  }
}
