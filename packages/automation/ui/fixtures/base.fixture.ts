import { test as base, expect } from "@playwright/test";
import {
  metadata,
  failureContext,
  redact,
  resetSecrets,
} from "../utils/allure.utils";
export const test = base.extend<{
  diagnostics: { errors: string[]; secrets: string[] };
  sensitive: boolean;
}>({
  sensitive: [false, { option: true }],
  diagnostics: [
    async ({ page, browser, browserName, sensitive }, use, info) => {
      resetSecrets();
      const errors: string[] = [];
      const secrets: string[] = [];
      const consoleErrors: string[] = [];
      const capture = (value: string) => {
        if (consoleErrors.length < 20)
          consoleErrors.push(redact(value, secrets));
      };
      page.on("pageerror", (error) => {
        errors.push(redact(error.message, secrets));
      });
      page.on("console", (message) => {
        if (message.type() === "error") capture(message.text());
      });
      await metadata(info, `${browserName} ${browser.version()}`);
      await use({ errors, secrets });
      await failureContext(
        page,
        info,
        sensitive ? [] : [...errors, ...consoleErrors],
        secrets,
      );
    },
    { auto: true },
  ],
});
export { expect };
