import { test } from "../ui/fixtures/base.fixture";
import { DiagnosticProbePage } from "../ui/pages/diagnostic-probe.page";
const secret = "synthetic-canary-should-never-appear";
test.describe("Failure reporting contract", () => {
  let probe: DiagnosticProbePage;
  test.beforeEach(async ({ page }) => {
    probe = new DiagnosticProbePage(page);
    await probe.open(secret);
  });
  test("records masked failure evidence without credential values", async () => {
    await probe.fail(secret);
  });
});
