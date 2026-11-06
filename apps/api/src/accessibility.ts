import { z } from 'zod';

const ruleSummary = z
  .object({
    id: z.string().min(1).max(120),
    impact: z.enum(['minor', 'moderate', 'serious', 'critical']).nullable(),
    description: z.string().max(1000),
    helpUrl: z.url().refine((value) => value.startsWith('https://dequeuniversity.com/')),
    nodes: z.number().int().nonnegative(),
  })
  .strict();
export const accessibilityCheckpoint = z
  .object({
    version: z.literal(1),
    state: z.literal('final'),
    status: z.enum(['checked', 'unavailable']),
    engine: z.string().min(1).max(40),
    viewport: z
      .object({ width: z.number().int().positive(), height: z.number().int().positive() })
      .strict()
      .nullable(),
    reason: z
      .enum(['page-unavailable', 'sensitive', 'target-not-approved', 'scan-failed'])
      .optional(),
    violations: z.array(ruleSummary).max(100),
    reviewRules: z.array(ruleSummary).max(100).default([]),
    incomplete: z.number().int().nonnegative(),
    truncated: z.boolean(),
  })
  .strict()
  .refine(
    (value) =>
      value.status === 'checked'
        ? value.reason === undefined
        : value.reason !== undefined &&
          value.violations.length === 0 &&
          value.reviewRules.length === 0 &&
          value.incomplete === 0 &&
          !value.truncated,
    { message: 'Inconsistent accessibility checkpoint status' },
  );

export type AccessibilityCheckpoint = z.infer<typeof accessibilityCheckpoint>;
export interface AccessibilityCoverage {
  resultId: string;
  attempt: number | null;
  checkpoint: AccessibilityCheckpoint | null;
}

/** Review the last functional attempt only; an earlier successful scan cannot hide a missing retry. */
export function accessibilityCoverage(
  results: readonly { id: string; browser: string | null; attempts: readonly unknown[] }[],
  artifacts: readonly {
    resultId: string;
    attempt: number;
    unavailableReason?: string | undefined;
    accessibility?: AccessibilityCheckpoint | undefined;
  }[],
): AccessibilityCoverage[] {
  return results
    .filter((result) => result.browser !== null)
    .map((result) => {
      const attempt = result.attempts.length;
      const matching = artifacts.filter(
        (item) =>
          item.resultId === result.id &&
          item.attempt === attempt &&
          !item.unavailableReason &&
          item.accessibility,
      );
      return {
        resultId: result.id,
        attempt: attempt || null,
        checkpoint: matching.length === 1 ? matching[0]!.accessibility! : null,
      };
    });
}
