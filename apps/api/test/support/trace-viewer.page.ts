import type { Page } from "@playwright/test";
const TraceSelectors = {
  start: "Start",
  complete: "Complete",
  actions: "Actions",
  click: "Click",
  body: "body",
} as const;
export class TraceFixturePage {
  readonly complete;
  constructor(readonly page: Page) {
    this.complete = page.getByRole("button", {
      name: TraceSelectors.complete,
      exact: true,
    });
  }
  goto(origin: string) {
    return this.page.goto(`${origin}/fixture`);
  }
  start() {
    return this.page
      .getByRole("button", { name: TraceSelectors.start, exact: true })
      .click();
  }
}
export class TraceViewerPage {
  readonly actions;
  readonly recordedClick;
  constructor(readonly page: Page) {
    this.actions = page.getByText(TraceSelectors.actions, { exact: true });
    this.recordedClick = page
      .getByText(TraceSelectors.click, { exact: true })
      .first();
  }
  goto(origin: string, run: string, artifact: string) {
    return this.page.goto(`${origin}/v1/runs/${run}/traces/${artifact}`);
  }
  async containsCompletedSnapshot() {
    const texts = await Promise.all(
      this.page
        .frames()
        .filter((frame) => frame !== this.page.mainFrame())
        .map((frame) =>
          frame
            .locator(TraceSelectors.body)
            .innerText()
            .catch(() => ""),
        ),
    );
    return texts.some((text) => text.includes(TraceSelectors.complete));
  }
}
