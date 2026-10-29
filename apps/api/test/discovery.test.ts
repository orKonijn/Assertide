import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDiscovery } from "../src/discovery.ts";
import { PlatformService } from "../src/platform.ts";
import { testDatabase } from "./database.ts";

test("discovery folds browser projects by stable identity and rejects conflicting IDs", () => {
  const item = {
    title: "UI-001 Login",
    file: "login.spec.ts",
    line: 1,
    tests: [{ projectName: "chromium" }],
  };
  const result = parseDiscovery({
    suites: [
      { specs: [item, { ...item, tests: [{ projectName: "firefox" }] }] },
    ],
  });
  assert.deepEqual(result[0]?.projects, ["chromium", "firefox"]);
  assert.throws(
    () => parseDiscovery({ suites: [{ specs: [item, { ...item, line: 9 }] }] }),
    /Duplicate/,
  );
  assert.throws(
    () => parseDiscovery({ suites: [], errors: [{ message: "Syntax error" }] }),
    /Discovery reported errors/,
  );
});

test("failed discovery preserves the last successfully activated catalog", async () => {
  const db = await testDatabase();
  try {
    const original = new PlatformService(db);
    await original.initialize();
    assert.equal(original.catalog.length, 27);
    assert.ok(original.catalog.every((item) => item.file && item.line > 0));
    const failed = new PlatformService(db, async () => {
      throw new Error("Fixture discovery failure");
    });
    await failed.initialize();
    assert.deepEqual(failed.catalog, original.catalog);
    assert.equal(failed.revision, original.revision);
    assert.match(failed.discoveryError ?? "", /previous successful catalog/);
  } finally {
    await db.close();
  }
});
