import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.ts";
import { PlatformService, localProjectId } from "../src/platform.ts";
import type { Principal } from "../src/identity.ts";

test("catalog metadata is scoped and versioned; disabling never rewrites frozen runs", async () => {
  const db = await testDatabase();
  const platform = new PlatformService(db);
  const principal: Principal = {
    subject: "maintainer",
    name: "Maintainer",
    role: "maintainer",
    organizationId: "00000000-0000-4000-8000-000000000001",
    projectIds: [localProjectId],
  };
  try {
    await platform.initialize();
    const config = {
      catalogRevision: platform.revision,
      selection: { testIds: ["LAB-001"] },
      environmentId: "local-lab",
      browserProjects: [],
      workers: 1,
      retries: 0,
      headed: false,
      video: "off",
    };
    const run = await platform.launch(
      principal,
      localProjectId,
      config,
      randomUUID(),
    );
    const metadata = {
      feature: "Payments",
      module: "Contracts",
      owner: "QA",
      priority: "P2",
      tags: ["critical"],
      enabled: false,
      quarantined: true,
    };
    await assert.rejects(
      platform.saveMetadata(
        { ...principal, role: "operator" },
        localProjectId,
        "LAB-001",
        metadata,
        '"0"',
      ),
      { status: 403 },
    );
    await platform.saveMetadata(
      principal,
      localProjectId,
      "LAB-001",
      metadata,
      '"0"',
    );
    await assert.rejects(
      platform.saveMetadata(
        principal,
        localProjectId,
        "LAB-001",
        metadata,
        '"0"',
      ),
      { status: 412 },
    );
    await assert.rejects(
      platform.launch(principal, localProjectId, config, randomUUID()),
      /disabled/,
    );
    const original = await platform.get(principal, String(run["id"]), "run");
    assert.equal(
      (original["metadata"] as { enabled: boolean }[])[0]?.enabled,
      true,
    );
    const current = (
      await platform.projectCatalog(principal, localProjectId)
    ).find((item) => item.id === "LAB-001");
    assert.equal(current?.enabled, false);
    assert.equal(current?.priority, "P2");
    assert.equal((current as Record<string, unknown>)["quarantined"], true);
    assert.notEqual(
      (original["metadata"] as Record<string, unknown>[])[0]?.["quarantined"],
      true,
    );
    const otherProject = randomUUID();
    const other = (
      await platform.projectCatalog(
        { ...principal, projectIds: [otherProject] },
        otherProject,
      )
    ).find((item) => item.id === "LAB-001");
    assert.equal(other?.enabled, true);
    await platform.saveMetadata(
      principal,
      localProjectId,
      "LAB-001",
      { ...metadata, enabled: true },
      '"1"',
    );
    const future = await platform.launch(
      principal,
      localProjectId,
      config,
      randomUUID(),
    );
    assert.equal(
      (future["metadata"] as { priority: string }[])[0]?.priority,
      "P2",
    );
  } finally {
    await db.close();
  }
});
