import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateAnalytics } from "../src/analytics.ts";

test("analytics keeps API browserless, honors denominators and uses recorded request latency", () => {
  const runs = [
    {
      startedAt: "2026-10-29T10:00:00Z",
      endedAt: "2026-10-29T10:00:10Z",
      results: [
        { id: "LAB-001", status: "passed", attempts: [{ status: "passed" }] },
        {
          id: "UI-001:chromium",
          browser: "chromium",
          status: "passed",
          attempts: [{ status: "failed" }, { status: "passed" }],
        },
        {
          id: "UI-002:firefox",
          browser: "firefox",
          status: "failed",
          attempts: [{ status: "failed" }],
        },
        { id: "UI-003:chromium", browser: "chromium", status: "skipped" },
        {
          id: "UI-004:chromium",
          browser: "chromium",
          status: "failed",
          expectedFailure: true,
        },
      ],
      artifacts: [10, 20, 30, 40].map((durationMs) => ({
        exchange: { durationMs },
      })),
    },
  ];
  const all = calculateAnalytics(runs);
  assert.equal(all.executed, 3);
  assert.equal(all.finalPassRate, 2 / 3);
  assert.equal(all.firstAttemptPassRate, 1 / 3);
  assert.equal(all.recoveredFlakyRate, 1 / 3);
  assert.equal(all.apiLatency.p95Ms, 40);
  assert.equal(all.duration.averageMs, 10000);
  assert.deepEqual(all.failures, [{ caseId: "UI-002", count: 1 }]);
  assert.equal(calculateAnalytics(runs, "api").executed, 1);
  assert.equal(calculateAnalytics(runs, "chromium").executed, 1);
  assert.equal(calculateAnalytics(runs, "chromium").apiLatency.samples, 0);
  assert.equal(calculateAnalytics([]).finalPassRate, null);
});
