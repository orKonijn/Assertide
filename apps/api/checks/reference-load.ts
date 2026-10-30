import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import express from "express";
import { testDatabase } from "../test/database.ts";
import { IdentityService } from "../src/identity.ts";
import { PlatformService, mountPlatform } from "../src/platform.ts";
import { parseDiscovery } from "../src/discovery.ts";
import { claimExecution, renewLease } from "../src/scheduler.ts";
if (!process.env["TEST_DATABASE_URL"])
  throw new Error(
    "Reference load requires an isolated PostgreSQL test database",
  );
process.env["MAX_PROJECT_RUNS"] = "4";
process.env["MAX_ORGANIZATION_RUNS"] = "20";
process.env["MAX_ORGANIZATION_WORKERS"] = "20";
const db = await testDatabase();
const identity = new IdentityService(db, "http://127.0.0.1");
const service = new PlatformService(db);
await identity.initialize();
await service.initialize();
const organizationId = randomUUID();
const projects = Array.from({ length: 5 }, () => randomUUID());
const discovered = parseDiscovery({
  suites: [
    {
      specs: Array.from({ length: 10000 }, (_, index) => ({
        title: `LAB-${String(index + 1).padStart(3, "0")} Reference case ${index + 1}`,
        file: "reference.spec.ts",
        line: index + 1,
        tags: ["reference"],
        tests: [{ projectName: "api" }],
      })),
    },
  ],
});
service.catalog = discovered.map((item) => ({
  ...item,
  feature: "Reference load",
  kind: "api",
  priority: "P1",
  enabled: true,
}));
const tokens: string[] = [];
for (let index = 0; index < 50; index++) {
  const subject = `load-${index}`;
  await identity.provision({
    subject,
    name: subject,
    role: "operator",
    organizationId,
    projectIds: projects,
  });
  const token = randomBytes(32).toString("hex");
  tokens.push(token);
  await db.query(
    "INSERT INTO sessions(digest,subject,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [createHash("sha256").update(token).digest("hex"), subject],
  );
}
const now = new Date().toISOString();
const storedIds: string[] = [];
for (let batch = 0; batch < 10; batch++) {
  const records = Array.from({ length: 100 }, (_, offset) => {
    const id = randomUUID();
    storedIds.push(id);
    return {
      id,
      projectId: projects[(batch * 100 + offset) % 5],
      phase: "completed",
      createdAt: now,
      startedAt: now,
      endedAt: now,
      reportPhase: "expired",
      selection: { testIds: ["LAB-001"] },
      config: { workers: 1, browserProjects: [] },
      results: Array.from({ length: 100 }, (_, index) => ({
        id: `LAB-${String(index + 1).padStart(3, "0")}`,
        status: "passed",
        duration: 10,
        attempts: [{ status: "passed", duration: 10 }],
      })),
    };
  });
  await db.query(
    "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) SELECT entry->>'id',$1,(entry->>'projectId')::uuid,'run',entry FROM jsonb_array_elements($2::jsonb) entry",
    [organizationId, JSON.stringify(records)],
  );
}
const app = express();
app.use(express.json());
mountPlatform(app, service, identity);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const samples: Record<string, number[]> = {
  catalog: [],
  metadata: [],
  launch: [],
  heartbeat: [],
};
const runIds: string[] = [];
const request = async (
  index: number,
  category: string,
  url: string,
  body?: unknown,
) => {
  const start = performance.now();
  const response = await fetch(origin + url, {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: `assertide_session=${tokens[index]}`,
      Origin: "http://127.0.0.1",
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  assert.ok(response.ok, JSON.stringify(value));
  samples[category]!.push(performance.now() - start);
  return value;
};
try {
  // Fifty independent authenticated clients remain concurrent across rounds.
  for (let round = 0; round < 5; round++)
    await Promise.all(
      tokens.map(async (_, index) => {
        const project = projects[index % 5];
        await request(
          index,
          "catalog",
          `/v1/projects/${project}/catalog?query=Reference%20case%209999`,
        );
        await request(
          index,
          "metadata",
          `/v1/projects/${project}/runs?limit=10`,
        );
      }),
    );
  await Promise.all(
    tokens.map(async (_, index) => {
      const run = await request(
        index,
        "launch",
        `/v1/projects/${projects[index % 5]}/runs`,
        {
          catalogRevision: service.revision,
          selection: { testIds: ["LAB-001"] },
          environmentId: "local-lab",
          browserProjects: [],
          workers: 1,
          retries: 0,
          headed: false,
          video: "off",
        },
      );
      runIds.push(run.id);
    }),
  );
  const claimed = [];
  for (const id of runIds) {
    const run = await claimExecution(db, "reference-worker", id);
    if (run) claimed.push(run);
  }
  assert.equal(claimed.length, 20);
  for (let round = 0; round < 5; round++)
    await Promise.all(
      claimed.map(async (run) => {
        const start = performance.now();
        await renewLease(
          db,
          String(run["id"]),
          "reference-worker",
          Number(run["leaseEpoch"]),
        );
        samples["heartbeat"]!.push(performance.now() - start);
      }),
    );
  const p95 = (values: number[]) =>
    [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]!;
  const result = {
    recordedAt: new Date().toISOString(),
    clients: 50,
    catalogCases: 10000,
    resultInstances: 100000,
    projects: 5,
    activeWorkerLeases: 20,
    scope:
      "Control-plane HTTP and worker leases; browser workload and human usability excluded",
    p95Ms: Object.fromEntries(
      Object.entries(samples).map(([name, values]) => [
        name,
        Math.round(p95(values) * 100) / 100,
      ]),
    ),
    samples: Object.fromEntries(
      Object.entries(samples).map(([name, values]) => [name, values.length]),
    ),
  };
  const directory = fileURLToPath(
    new URL("../../../.local/verification/", import.meta.url),
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    directory + "reference-load.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  assert.ok(
    result.p95Ms["catalog"]! < 1000,
    "Catalog p95 must be below 1 second",
  );
  assert.ok(
    result.p95Ms["metadata"]! < 500,
    "Metadata p95 must be below 500ms",
  );
  assert.ok(
    result.p95Ms["launch"]! < 1000,
    "Launch p95 must be below 1 second",
  );
  assert.ok(
    result.p95Ms["heartbeat"]! < 2000,
    "Lease updates must be below 2 seconds",
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
}
