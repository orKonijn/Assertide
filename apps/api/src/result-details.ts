import { z } from "zod";
export function assertionValues(message: string) {
  const plain = message.replace(/\u001b\[[0-9;]*m/g, "");
  const expected =
    /^\s*Expected(?: (?:string|substring|pattern))?:\s*(.+)$/m.exec(plain)?.[1];
  const actual = /^\s*Received(?: string)?:\s*(.+)$/m.exec(plain)?.[1];
  return expected && actual
    ? { expected: expected.slice(0, 4000), actual: actual.slice(0, 4000) }
    : undefined;
}
export interface Step {
  title: string;
  category: string;
  duration: number;
  error?: string | undefined;
  steps: Step[];
}
export const stepSchema: z.ZodType<Step> = z.object({
  title: z.string(),
  category: z.string().default("test.step"),
  duration: z.number(),
  error: z.string().optional(),
  steps: z.lazy(() => z.array(stepSchema)).default([]),
});
export function classifyResult(
  status: string,
  error: string,
  runInfrastructure = false,
) {
  if (["canceled", "interrupted"].includes(status)) return "canceled";
  if (runInfrastructure || status === "broken") return "infrastructure";
  if (status === "passed" || status === "skipped") return "none";
  if (/unauthori[sz]ed|forbidden|\b401\b|\b403\b|authentication/i.test(error))
    return "authentication";
  if (status === "timedOut" || /timeout|timed out|ETIMEDOUT/i.test(error))
    return "timeout";
  if (/schema|contract|JSON pointer|invalid_type/i.test(error))
    return "contract";
  if (/expect\(|assertion|Expected:|toBe|toEqual/i.test(error))
    return "assertion";
  return "unknown";
}
