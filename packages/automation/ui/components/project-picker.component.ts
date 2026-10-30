import type { Page } from '@playwright/test';

import { ProjectPickerSelectors as S } from '../types/project-picker.selectors';
import { workflow } from '../utils/allure.utils';
export class ProjectPickerComponent {
  public readonly trigger;
  public readonly dialog;
  public readonly search;
  public readonly empty;
  public constructor(private readonly page: Page) {
    this.trigger = page.getByRole('button', { name: S.trigger, exact: true });
    this.dialog = page.getByRole('dialog', { name: S.dialog });
    this.search = this.dialog.getByRole('searchbox', { name: S.search });
    this.empty = this.dialog.getByText(new RegExp(S.empty));
  }
  public open(): Promise<void> {
    return workflow('Open project picker', () => this.trigger.click());
  }
  public clickOutside(): Promise<void> {
    return workflow('Dismiss picker from its backdrop', () => this.page.mouse.click(4, 4));
  }
  public async clickPadding(): Promise<void> {
    const box = await this.dialog.boundingBox();
    if (!box) {
      throw new Error('Project picker is not visible');
    }
    await this.page.mouse.click(box.x + 10, box.y + 10);
  }
  public async dragOutside(): Promise<void> {
    const box = await this.dialog.boundingBox();
    if (!box) {
      throw new Error('Project picker is not visible');
    }
    await this.page.mouse.move(box.x + 10, box.y + 10);
    await this.page.mouse.down();
    await this.page.mouse.move(4, 4);
    await this.page.mouse.up();
  }
  public searchFor(name: string): Promise<void> {
    return workflow('Search accessible projects', () => this.search.fill(name));
  }
  public choose(name: string): Promise<void> {
    return workflow('Choose project', () =>
      this.dialog.getByRole('button', { name, exact: true }).click(),
    );
  }
}
