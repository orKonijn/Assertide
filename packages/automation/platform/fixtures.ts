import { test as base, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { z } from "zod";
type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// Keep the authenticated state in memory; never attach cookies or write them to Git.
// Login, logout and revocation tests deliberately use the base fixture instead.
export const test = base.extend<
  Record<never, never>,
  { adminState: StorageState }
>({
  adminState: [
    async ({ browser }, use) => {
      const credentials = z
        .object({ password: z.string() })
        .parse(
          JSON.parse(await readFile("../../.local/credentials.json", "utf8")),
        );
      const context = await browser.newContext({
        baseURL: "http://127.0.0.1:4200",
        storageState: { cookies: [], origins: [] },
      });
      try {
        const page = await context.newPage();
        await page.goto("/");
        await page.getByRole("link", { name: "Continue with SSO" }).click();
        await page
          .getByLabel("Password", { exact: true })
          .fill(credentials.password);
        await page
          .getByRole("button", { name: "Sign in", exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: "Quality at a glance" }),
        ).toBeVisible();
        await use(await context.storageState());
      } finally {
        await context.close();
      }
    },
    { scope: "worker" },
  ],
  storageState: async ({ adminState }, use) => use(adminState),
});
export { expect };
