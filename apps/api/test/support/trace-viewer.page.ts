import type { Page } from '@playwright/test';
import type { Response } from 'playwright';
const TraceSelectors = {
  start: 'Start',
  complete: 'Complete',
  actions: 'Actions',
  click: 'Click',
  body: 'body',
} as const;
export class TraceFixturePage {
  public readonly complete;
  public constructor(public readonly page: Page) {
    this.complete = page.getByRole('button', {
      name: TraceSelectors.complete,
      exact: true,
    });
  }
  public goto(origin: string): Promise<Response | null> {
    return this.page.goto(`${origin}/fixture`);
  }
  public start(): Promise<void> {
    return this.page.getByRole('button', { name: TraceSelectors.start, exact: true }).click();
  }
}
export class TraceViewerPage {
  public readonly actions;
  public readonly recordedClick;
  public constructor(public readonly page: Page) {
    this.actions = page.getByText(TraceSelectors.actions, { exact: true });
    this.recordedClick = page.getByText(TraceSelectors.click, { exact: true }).first();
  }
  public goto(origin: string, run: string, artifact: string): Promise<Response | null> {
    return this.page.goto(`${origin}/v1/runs/${run}/traces/${artifact}`);
  }
  public async containsCompletedSnapshot(): Promise<boolean> {
    const texts = await Promise.all(
      this.page
        .frames()
        .filter((frame) => frame !== this.page.mainFrame())
        .map((frame) =>
          frame
            .locator(TraceSelectors.body)
            .innerText()
            .catch(() => ''),
        ),
    );
    return texts.some((text) => text.includes(TraceSelectors.complete));
  }
}
