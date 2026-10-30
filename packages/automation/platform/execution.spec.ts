import { test, expect } from "./fixtures";
import { CatalogPage } from "../ui/pages/catalog.page";
import { ExecutionPage } from "../ui/pages/execution.page";
import { ApiWorkspacePage } from "../ui/pages/api-workspace.page";
import { TestData as D, Timeouts } from "../ui/types/test-data";
import { ApiRoutes } from "../ui/types/routes";
import { downloadText } from "../ui/utils/file.utils";
import { localPassword } from "../ui/utils/credentials.utils";
import { viewport, fitsViewport } from "../ui/utils/viewport.utils";
import { screenshot } from "../ui/utils/allure.utils";
test.describe("Execution and evidence", () => {
  test.setTimeout(90000);
  let execution: ExecutionPage;
  test.beforeEach(({ page }) => {
    execution = new ExecutionPage(page);
  });
  test("selected API and browser cases complete with immutable source evidence", async ({
    page,
    api,
  }) => {
    const catalog = new CatalogPage(page);
    await catalog.goto();
    await catalog.select([...D.apiIds, D.login, D.checkout, D.product]);
    const started = Date.now();
    await catalog.startExecution();
    await expect(page).toHaveURL(/\/runs\/[a-f0-9-]+$/);
    await expect(execution.status).toHaveText("completed", {
      timeout: Timeouts.execution,
    });
    console.log(
      JSON.stringify({
        verification: "18-case-execution",
        runtime: process.env["WORKER_RUNTIME"] ?? "local",
        elapsedMs: Date.now() - started,
      }),
    );
    const run = await api.run(execution.id());
    expect(run.results).toHaveLength(18);
    expect(run.results.every((result) => result.status === "passed")).toBe(
      true,
    );
    expect(run.source.revision).toMatch(/^[a-f0-9]{64}$/);
    await expect(execution.outcome(D.lifecycle, "passed")).toBeVisible();
  });
  test("attempt screenshot opens, scales on mobile and restores keyboard focus", async ({
    page,
    api,
  }) => {
    const run = await api.completed([D.product]);
    await execution.goto(run.id);
    await execution.openResult(`${D.product}:chromium`);
    await execution.openScreenshot();
    await expect(execution.screenshotDialog).toBeVisible();
    await expect.poll(() => execution.screenshotWidth()).toBeGreaterThan(0);
    await screenshot(page, "attempt-screenshot", execution.screenshotDialog);
    await viewport(page, "mobile");
    expect(await fitsViewport(page)).toBe(true);
    await execution.closeScreenshot();
    await expect(execution.screenshotDialog).not.toBeVisible();
    await expect(execution.screenshotButton).toBeFocused();
  });
  test("reviewed rerun preserves lineage and selected source revision", async ({
    page,
    api,
  }) => {
    const parent = await api.completed([D.lifecycle]);
    await execution.goto(parent.id);
    const original = page.url();
    await execution.openResult(D.lifecycle);
    await execution.reviewRerun(D.lifecycle);
    await expect(execution.rerunDialog).toContainText(D.lifecycle);
    await expect(page).toHaveURL(original);
    await expect(execution.startRerunButton).toBeEnabled();
    await execution.startRerun();
    await expect(page).not.toHaveURL(original);
    const child = await api.waitForCompletion(execution.id());
    expect(child.parentRunId).toBe(parent.id);
    expect(child.selection.testIds).toEqual([D.lifecycle]);
    expect(child.source.revision).toBe(parent.source.revision);
    expect(child.artifacts.length).toBeGreaterThan(0);
    const evidence = await api.get(
      ApiRoutes.artifact(child.id, child.artifacts[0]!.id),
    );
    expect(evidence).toMatchObject({
      request: { method: "POST", path: "orders" },
      response: { status: 201 },
    });
  });
  test("API workspace inspects and downloads redacted exchange evidence", async ({
    page,
    api,
    diagnostics,
  }) => {
    const run = await api.completed([D.lifecycle]);
    const workspace = new ApiWorkspacePage(page);
    const password = await localPassword();
    diagnostics.secrets.push(password);
    await workspace.goto();
    await expect(workspace.heading).toBeVisible();
    await workspace.selectExecution(run.id);
    await workspace.openExchange(D.lifecycle);
    await expect(workspace.evidence).toContainText('"method": "POST"');
    expect(
      (await workspace.evidence.innerText()).includes(password),
      "visible evidence excludes credentials",
    ).toBe(false);
    const downloaded = await downloadText(await workspace.download());
    expect(downloaded.includes(password), "download excludes credentials").toBe(
      false,
    );
    expect(JSON.parse(downloaded).request.method).toBe("POST");
    await workspace.inspectPointer("/response/body/quantity");
    await expect(workspace.selectedValue).toHaveText("2");
    await viewport(page, "mobile");
    expect(await fitsViewport(page)).toBe(true);
  });
});
