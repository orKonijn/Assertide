import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { randomUUID } from "node:crypto";
test("application routes pass automated WCAG checks in light/dark desktop and mobile states", async ({
  page,
}) => {
  test.setTimeout(180000);
  const evidence: {
    route: string;
    theme: string;
    width: number;
    violations: unknown[];
  }[] = [];
  const inspect = async (route: string, theme: string, width: number) => {
    await expect(page.locator("h1")).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const failures = result.violations.map((item) => ({
      id: item.id,
      impact: item.impact,
      description: item.description,
      nodes: item.nodes.map((node) => ({
        target: node.target,
        summary: node.failureSummary,
      })),
    }));
    evidence.push({ route, theme, width, violations: failures });
    expect.soft(failures, `${route} ${theme} ${width}px`).toEqual([]);
    expect
      .soft(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${route} horizontal overflow`,
      )
      .toBe(true);
  };
  await page.goto("/");
  await inspect("login", "light", 1280);
  const credentials = z
    .object({ password: z.string() })
    .parse(JSON.parse(await readFile("../../.local/credentials.json", "utf8")));
  await page.getByRole("link", { name: "Continue with SSO" }).click();
  await inspect("SSO sign in", "light", 1280);
  await page.setViewportSize({ width: 390, height: 844 });
  await inspect("SSO sign in", "light", 390);
  await page.screenshot({
    path: "../../docs/changelog/assets/unreleased/local-sign-in-mobile.png",
  });
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:4200/");
  const project = "00000000-0000-4000-8000-000000000010";
  const catalog = await (
    await page.request.get(`/v1/projects/${project}/catalog`)
  ).json();
  const response = await page.request.post(`/v1/projects/${project}/runs`, {
    headers: {
      Origin: "http://127.0.0.1:4200",
      "Idempotency-Key": randomUUID(),
    },
    data: {
      catalogRevision: catalog.revision,
      selection: {
        testIds: catalog.items
          .filter((item: { enabled: boolean }) => item.enabled)
          .map((item: { id: string }) => item.id),
      },
      environmentId: "local-lab",
      browserProjects: ["chromium"],
      workers: 1,
      retries: 0,
      headed: false,
      video: "off",
    },
  });
  expect(response.status()).toBe(202);
  const created = await response.json();
  await page.goto(`/runs/${created.id}`);
  await expect(page.getByRole("status").first()).toHaveText(
    /queued|running|provisioning/,
  );
  await inspect("Live monitor", "light", 1280);
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/v1/runs/${created.id}`)).json()).phase,
      { timeout: 60000 },
    )
    .toBe("completed");
  const completed = await (
    await page.request.get(`/v1/runs/${created.id}`)
  ).json();
  const routes = [
    "/",
    "/projects",
    "/suites",
    "/explorer",
    "/runs",
    "/reports",
    "/api",
    "/settings",
    `/runs/${completed.id}?result=${encodeURIComponent(completed.results[0].id)}`,
  ];
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      localStorage.setItem("assertide-theme", value);
      document.documentElement.dataset["theme"] = value;
    }, theme);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of routes) {
        await page.goto(route);
        await inspect(route, theme, width);
        if (route === "/explorer") {
          await page
            .getByRole("checkbox", { name: "Select UI-001", exact: true })
            .check();
          await inspect("Run configuration", theme, width);
        }
      }
    }
  }
  await mkdir("../../.local/verification", { recursive: true });
  await writeFile(
    "../../.local/verification/accessibility.json",
    JSON.stringify(evidence, null, 2),
  );
});
test("keyboard skip link, mobile menu escape and reduced motion remain usable", async ({
  page,
}) => {
  const credentials = z
    .object({ password: z.string() })
    .parse(JSON.parse(await readFile("../../.local/credentials.json", "utf8")));
  await page.goto("/explorer");
  await page.getByRole("link", { name: "Continue with SSO" }).click();
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/explorer$/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Test explorer", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#content")).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  const dialog = page.getByRole("dialog", { name: "Workspace navigation" });
  await expect(
    dialog.getByRole("button", { name: "Close menu", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Close menu", exact: true }),
  ).toBeFocused();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: "../../docs/changelog/assets/unreleased/mobile-navigation.png",
  });
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector("button")!).transitionDuration,
    ),
  ).toBe("0s");
});
