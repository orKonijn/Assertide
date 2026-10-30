import { mkdir, writeFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type * as axe from 'axe-core';
export async function violations(page: Page): Promise<
  {
    id: string;
    impact: axe.ImpactValue | undefined;
    description: string;
    nodes: { target: axe.UnlabelledFrameSelector; summary: string | undefined }[];
  }[]
> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return result.violations.map((item) => ({
    id: item.id,
    impact: item.impact,
    description: item.description,
    nodes: item.nodes.map((node) => ({
      target: node.target,
      summary: node.failureSummary,
    })),
  }));
}
export async function saveAccessibilityEvidence(evidence: unknown): Promise<void> {
  await mkdir('../../.local/verification', { recursive: true });
  await writeFile(
    '../../.local/verification/accessibility.json',
    JSON.stringify(evidence, null, 2),
  );
}
