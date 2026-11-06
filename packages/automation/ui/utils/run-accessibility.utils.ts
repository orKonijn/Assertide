import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';

/** Record rule summaries only: no DOM, selectors, page text, URLs or form values. */
export async function captureRunAccessibility(
  page: Page,
  info: TestInfo,
  sensitive: boolean,
): Promise<void> {
  if (process.env['RUN_ACCESSIBILITY'] !== 'true') {
    return;
  }
  let reason: 'page-unavailable' | 'sensitive' | 'target-not-approved' | 'scan-failed' | undefined;
  if (sensitive) {
    reason = 'sensitive';
  } else if (page.isClosed()) {
    reason = 'page-unavailable';
  } else {
    try {
      if (new URL(page.url()).origin !== 'http://127.0.0.1:4013') {
        reason = 'target-not-approved';
      }
    } catch {
      reason = 'target-not-approved';
    }
  }
  if (!reason) {
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze(),
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(
            () => reject(new Error('Accessibility scan deadline exceeded')),
            5000,
          );
        }),
      ]);
      await info.attach('accessibility-checkpoint.json', {
        contentType: 'application/json',
        body: JSON.stringify({
          version: 1,
          state: 'final',
          status: 'checked',
          engine: result.testEngine.version,
          viewport: page.viewportSize(),
          violations: result.violations.slice(0, 100).map((item) => ({
            id: item.id,
            impact: item.impact ?? null,
            description: item.description,
            helpUrl: item.helpUrl,
            nodes: item.nodes.length,
          })),
          reviewRules: result.incomplete.slice(0, 100).map((item) => ({
            id: item.id,
            impact: item.impact ?? null,
            description: item.description,
            helpUrl: item.helpUrl,
            nodes: item.nodes.length,
          })),
          incomplete: result.incomplete.length,
          truncated: result.violations.length > 100 || result.incomplete.length > 100,
        }),
      });
      return;
    } catch {
      reason = 'scan-failed';
    } finally {
      clearTimeout(deadline);
    }
  }
  await info.attach('accessibility-checkpoint.json', {
    contentType: 'application/json',
    body: JSON.stringify({
      version: 1,
      state: 'final',
      status: 'unavailable',
      engine: 'unavailable',
      viewport: page.viewportSize(),
      reason,
      violations: [],
      incomplete: 0,
      truncated: false,
    }),
  });
}
