import { test, expect } from "./fixtures";

import { randomUUID } from "node:crypto";

// Never capture a failure screenshot while a one-time credential may be displayed.
test.use({ screenshot: "off", trace: "off" });
test("administrator creates, rotates and revokes a CI credential", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings$/);
  const name = `Pipeline ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Account name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Create CI credential", exact: true })
    .click();
  const token = await page
    .getByLabel("New CI token", { exact: true })
    .inputValue();
  await page.getByRole("button", { name: "Hide token", exact: true }).click();
  const endpoint = "/v1/runs?projectId=00000000-0000-4000-8000-000000000010";
  expect(
    (
      await page.request.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(200);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: `Rotate ${name}`, exact: true })
    .click();
  const rotated = await page
    .getByLabel("New CI token", { exact: true })
    .inputValue();
  await page.getByRole("button", { name: "Hide token", exact: true }).click();
  expect(
    (
      await page.request.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await page.request.get(endpoint, {
        headers: { Authorization: `Bearer ${rotated}` },
      })
    ).status(),
  ).toBe(200);
  page.once("dialog", (dialog) => dialog.accept());
  const revoked = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/revoke"),
  );
  await page
    .getByRole("button", { name: `Revoke ${name}`, exact: true })
    .click();
  expect((await revoked).status()).toBe(200);
  await expect(
    page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name, exact: true }) })
      .getByText(/Revoked/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Revoke ${name}`, exact: true }),
  ).toBeDisabled();
  expect(
    (
      await page.request.get(endpoint, {
        headers: { Authorization: `Bearer ${rotated}` },
      })
    ).status(),
  ).toBe(401);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: "../../docs/changelog/assets/unreleased/ci-credentials.png",
    fullPage: true,
  });
});
