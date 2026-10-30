import { test, expect } from "./fixtures";
import { EnvironmentsPage } from "../ui/pages/environments.page";
import { CatalogPage } from "../ui/pages/catalog.page";
import { ExecutionPage } from "../ui/pages/execution.page";
import { localPassword } from "../ui/utils/credentials.utils";
import { uniqueName, uniqueId } from "../ui/utils/test-data.utils";
import { viewport, fitsViewport } from "../ui/utils/viewport.utils";
import { TestData as D } from "../ui/types/test-data";
test.use({ sensitive: true, screenshot: "off", trace: "off", video: "off" });
test.describe("Environment credential references", () => {
  let environments: EnvironmentsPage;
  let catalog: CatalogPage;
  let execution: ExecutionPage;
  test.beforeEach(async ({ page }) => {
    environments = new EnvironmentsPage(page);
    catalog = new CatalogPage(page);
    execution = new ExecutionPage(page);
    await environments.goto();
  });
  test("saved policy resolves a write-only credential during execution", async ({
    page,
    api,
    diagnostics,
  }) => {
    const password = await localPassword();
    diagnostics.secrets.push(password);
    const credential = uniqueName("Lab credential");
    const policy = uniqueName("QA policy");
    await environments.saveCredential(credential, password);
    await expect(environments.credentialValue).toHaveValue("");
    await expect(environments.credentialStatus).toHaveText(
      "Credential version saved. Its value cannot be read back.",
    );
    await environments.savePolicy(uniqueId("policy"), policy, credential);
    await expect(environments.environmentStatus).toHaveText(
      "Environment saved. Future launches use this policy.",
    );
    await viewport(page, "mobile");
    expect(await fitsViewport(page)).toBe(true);
    await viewport(page, "desktop");
    await catalog.goto();
    await catalog.select([D.lifecycle]);
    await catalog.selectEnvironment(policy);
    await catalog.startExecution();
    await expect(page).toHaveURL(/\/runs\//);
    const run = await api.waitForCompletion(execution.id());
    expect(run.results[0]!.status).toBe("passed");
    expect(run.environment.passwordRef.version).toBe(1);
    expect(
      JSON.stringify(run).includes(password),
      "execution must not disclose a credential",
    ).toBe(false);
  });
});
