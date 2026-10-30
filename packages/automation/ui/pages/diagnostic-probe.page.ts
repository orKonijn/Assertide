import type { Page } from "@playwright/test";
import { registerSecret, workflow } from "../utils/allure.utils";
const Selectors = { token: "New CI token" } as const;
export class DiagnosticProbePage {
  constructor(readonly page: Page) {}
  async open(secret: string) {
    registerSecret(secret);
    await this.page.goto("data:text/html,<label>New CI token<input></label>");
    await this.page.getByLabel(Selectors.token, { exact: true }).fill(secret);
  }
  fail(secret: string) {
    return workflow("Inspect protected diagnostic boundary", async () => {
      throw new Error(`Synthetic failure ${secret}`);
    });
  }
}
