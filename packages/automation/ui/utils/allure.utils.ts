import { test, type Page, type Locator, type TestInfo } from "@playwright/test";
import * as allure from "allure-js-commons";
const knownSecrets = new Set<string>();
export function registerSecret(secret: string) {
  if (secret) knownSecrets.add(secret);
}
export function resetSecrets() {
  knownSecrets.clear();
}
export const workflow = <T>(name: string, action: () => Promise<T>) =>
  test.step(name, async () => {
    try {
      return await action();
    } catch (error) {
      if (error instanceof Error) {
        error.message = redact(error.message);
        if (error.stack) error.stack = redact(error.stack);
      }
      throw error;
    }
  });
export function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "[unavailable]";
  }
}
export function redact(value: string, secrets: readonly string[] = []) {
  let result = value
    .replace(/Bearer\s+\S+/gi, "[REDACTED TOKEN]")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[REDACTED TOKEN]")
    .replace(
      /(password|token|secret|cookie|authorization)["'\s]*[:=][^,;\n]+/gi,
      "$1=[REDACTED]",
    );
  for (const secret of [...knownSecrets, ...secrets])
    if (secret) result = result.split(secret).join("[REDACTED]");
  return result.slice(0, 8000);
}
export async function metadata(info: TestInfo, browser: string) {
  const feature = info.titlePath[1] ?? "Assertide";
  await allure.epic("Assertide quality assurance");
  await allure.feature(feature);
  await allure.story(info.titlePath.at(-2) ?? feature);
  await allure.suite(feature);
  await allure.owner("QA Automation");
  await allure.severity(
    /authentication|execution|checkout/i.test(feature) ? "critical" : "normal",
  );
  await allure.tags("regression", browser);
  const id = /^(?:UI|WEB)-\d+/.exec(info.title)?.[0];
  await allure.testCaseId(
    id ?? info.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  );
  await allure.description(
    `Goal: ${info.title.replace(/^(UI|WEB)-\d+ /, "")}. Preconditions: a fresh browser context and the suite's isolated fixture data. Expected outcome: the visible behavior and recorded evidence satisfy the assertions below.`,
  );
  await allure.parameter("Browser", browser);
}
export async function screenshot(page: Page, name: string, target?: Locator) {
  const mask = [
    page.locator("input, textarea"),
    page.getByLabel("New CI token", { exact: true }),
  ];
  const body = await (target ?? page).screenshot({ mask });
  await test.info().attach(name, { body, contentType: "image/png" });
}
export async function failureContext(
  page: Page,
  info: TestInfo,
  errors: string[],
  secrets: string[],
) {
  if (info.status === info.expectedStatus) return;
  for (const error of info.errors) {
    if (error.message) error.message = redact(error.message, secrets);
    if (error.stack) error.stack = redact(error.stack, secrets);
  }

  await info.attach("failure-context.json", {
    body: JSON.stringify(
      {
        url: safeUrl(page.url()),
        browser: info.project.use.browserName ?? "chromium",
        consoleErrors: errors.map((value) => redact(value, secrets)),
        retry: info.retry,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  if (!page.isClosed())
    await screenshot(page, "failure-state.png").catch(() => {});
}
