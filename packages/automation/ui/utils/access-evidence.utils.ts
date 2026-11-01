import type { Page } from '@playwright/test';

/** Explicit owner-requested capture only; ordinary regression never overwrites release evidence. */
export async function captureAccessEvidence(page: Page, name: string): Promise<void> {
  if (process.env['CAPTURE_ACCESS_EVIDENCE'] !== 'true') {
    return;
  }
  if (
    !/^(registration(?:-compact)?|guest(?:-overview|-workspace|-allure)?)-(390|1440)-(light|dark)$/.test(
      name,
    )
  ) {
    throw new Error('Invalid access evidence name');
  }
  await page.screenshot({
    path: `../../docs/changelog/assets/unreleased/${name}.png`,
    fullPage: true,
    mask: [page.locator('input,textarea')],
  });
}
