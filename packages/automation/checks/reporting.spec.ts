import { expect, test } from '../ui/fixtures/base.fixture';
import { DiagnosticProbePage } from '../ui/pages/diagnostic-probe.page';
import { safeUrl } from '../ui/utils/allure.utils';
const secret = 'synthetic-canary-should-never-appear';
test.describe('Failure reporting contract', () => {
  let probe: DiagnosticProbePage;
  test.beforeEach(async ({ page }) => {
    probe = new DiagnosticProbePage(page);
    await probe.open(secret);
  });
  test('records masked failure evidence without credential values', async () => {
    await probe.fail(secret);
  });
  test('records a final screenshot for a successful browser test', async () => {
    expect(safeUrl(`https://identity.example.test/verify/${secret}?secret=hidden`)).toBe(
      'https://identity.example.test/verify/[REDACTED]',
    );
    expect(safeUrl(`https://identity.example.test/interaction/${secret}/mail`)).toBe(
      'https://identity.example.test/interaction/[REDACTED]',
    );
    await probe.verify();
    await probe.verify();
  });
  test.describe('Sensitive success', () => {
    test.use({ sensitive: true });
    test('does not automatically capture sensitive pages', async () => {
      await probe.verify();
    });
  });
});
