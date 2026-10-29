import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Express, Request, Response } from "express";
import type { SqlConnection } from "./database.ts";
import { IdentityService, type Principal } from "./identity.ts";
import {
  catalogRevision,
  prepareSource,
  sourceManifest,
  verifySource,
} from "./source.ts";

export const localProjectId = "00000000-0000-4000-8000-000000000010";
const localOrg = "00000000-0000-4000-8000-000000000001";
export const localCatalog = [
  ["LAB-001", "Persistent order lifecycle", "Orders"],
  ["LAB-002", "Missing authentication", "Authentication"],
  ["LAB-003", "Invalid and expired token", "Authentication"],
  ["LAB-004", "Viewer cannot create", "Authorization"],
  ["LAB-005", "Tenant separation", "Authorization"],
  ["LAB-006", "Quantity boundary validation", "Schema"],
  ["LAB-007", "Malformed JSON and media type", "Transport"],
  ["LAB-008", "Optimistic concurrency", "Orders"],
  ["LAB-009", "Idempotency deduplication", "Orders"],
  ["LAB-010", "Pagination has no overlap", "Orders"],
  ["LAB-011", "Rate-limit handling", "Resilience"],
  ["LAB-012", "Bounded timeout", "Resilience"],
  ["LAB-013", "Service failure diagnosis", "Resilience"],
  ["LAB-014", "Response-time budget", "Performance"],
  ["LAB-015", "Confirmed-order deletion protection", "Orders"],
  ["UI-001", "Valid login unlocks catalog", "Store authentication"],
  ["UI-002", "Locked user cannot enter", "Store authentication"],
  ["UI-003", "Invalid password is rejected", "Store authentication"],
  ["UI-004", "Required login input", "Store authentication"],
  ["UI-005", "Checkout completes", "Checkout"],
  ["UI-006", "Cart removal preserves remaining items", "Cart"],
  ["UI-007", "Price sort is numeric", "Catalog"],
  ["UI-008", "Checkout rejects missing customer data", "Checkout"],
  ["UI-009", "Logout clears session", "Store authentication"],
  ["UI-010", "Cancel checkout preserves cart", "Checkout"],
  ["UI-011", "Product detail matches catalog", "Catalog"],
  ["UI-012", "Checkout total arithmetic", "Checkout"],
].map(([id, title, feature]) => ({
  id,
  title,
  feature,
  kind: id?.startsWith("UI-") ? "ui" : "api",
  tags: ["smoke", id?.startsWith("UI-") ? "ui" : "api"],
  priority: "P0",
  enabled: true,
}));
interface Row extends Record<string, unknown> {
  body: Record<string, unknown>;
  version: number;
}
const suiteInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(2000).default(""),
    testIds: z.array(z.string()).max(10000),
    owner: z.string().max(120).default(""),
    tags: z.array(z.string().max(50)).max(20).default([]),
  })
  .strict();
const selectionInput = z
  .object({ testIds: z.array(z.string()).min(1).max(10000) })
  .strict();
const runInput = z
  .object({
    catalogRevision: z.string().min(1),
    selection: selectionInput,
    environmentId: z.literal("local-lab"),
    browserProjects: z.array(z.enum(["chromium", "firefox", "webkit"])).max(3),
    workers: z.number().int().min(1).max(4),
    retries: z.number().int().min(0).max(2),
    headed: z.literal(false),
    video: z.enum(["off", "retain-on-failure"]),
  })
  .strict();
export type RunInput = z.infer<typeof runInput>;
export interface RunRecord extends Record<string, unknown> {
  id: string;
  projectId: string;
  organizationId: string;
  createdBy: string;
  phase: string;
  createdAt: string;
  selection: { testIds: string[] };
  config: RunInput;
  reportPhase: string;
}
class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const roles = ["viewer", "operator", "maintainer", "administrator"];
export class PlatformService {
  constructor(readonly db: SqlConnection) {}
  async initialize() {
    await prepareSource();
    await this.db.query(
      "CREATE TABLE IF NOT EXISTS platform_documents (id text PRIMARY KEY, organization_id uuid NOT NULL, project_id uuid NOT NULL, kind text NOT NULL, version integer NOT NULL DEFAULT 1, body jsonb NOT NULL)",
    );
    await this.db.query(
      "CREATE INDEX IF NOT EXISTS platform_scope ON platform_documents(organization_id,project_id,kind,id)",
    );
    await this.db.query(
      "CREATE TABLE IF NOT EXISTS launch_keys (scope text PRIMARY KEY, payload text NOT NULL, run_id text NOT NULL)",
    );
    await this.db.query(
      "CREATE TABLE IF NOT EXISTS run_events (sequence bigserial PRIMARY KEY, run_id text NOT NULL, body jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now())",
    );
  }
  async seedLocal() {
    await this.db.query(
      "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1::text,$2,$1::uuid,$3,$4) ON CONFLICT DO NOTHING",
      [
        localProjectId,
        localOrg,
        "project",
        JSON.stringify({
          id: localProjectId,
          name: "Assertide Lab",
          description: "Controlled API contract sandbox",
          owner: "QA Platform",
          catalogRevision,
        }),
      ],
    );
  }
  authorize(principal: Principal, projectId: string, minimum = "viewer") {
    if (!principal.projectIds.includes(projectId))
      throw new ApiError(404, "Project not found");
    if (roles.indexOf(principal.role) < roles.indexOf(minimum))
      throw new ApiError(403, `${minimum} role required`);
  }
  async list(principal: Principal, projectId: string, kind: string) {
    this.authorize(principal, projectId);
    return (
      await this.db.query<Row>(
        "SELECT body,version FROM platform_documents WHERE organization_id=$1 AND project_id=$2 AND kind=$3 ORDER BY id LIMIT 200",
        [principal.organizationId, projectId, kind],
      )
    ).rows.map((row) => ({ ...row.body, version: row.version }));
  }
  async get(
    principal: Principal,
    id: string,
    kind: string,
  ): Promise<Record<string, unknown> & { version: number }> {
    const row = (
      await this.db.query<Row>(
        "SELECT body,version FROM platform_documents WHERE id=$1 AND organization_id=$2 AND kind=$3",
        [id, principal.organizationId, kind],
      )
    ).rows[0];
    if (!row) throw new ApiError(404, "Resource not found");
    const projectId = kind === "project" ? id : String(row.body["projectId"]);
    this.authorize(principal, projectId);
    return { ...row.body, version: row.version };
  }
  async audit(
    principal: Principal,
    projectId: string,
    action: string,
    resourceId: string,
  ) {
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1,$2,$3,$4,$5)",
      [
        id,
        principal.organizationId,
        projectId,
        "audit",
        JSON.stringify({
          id,
          projectId,
          actor: principal.subject,
          action,
          resourceId,
          occurredAt: new Date().toISOString(),
        }),
      ],
    );
  }
  async saveSuite(
    principal: Principal,
    projectId: string,
    input: unknown,
    id?: string,
    version?: string,
  ) {
    this.authorize(principal, projectId, "maintainer");
    const parsed = suiteInput.safeParse(input);
    if (!parsed.success) throw new ApiError(422, "Invalid suite fields");
    if (
      parsed.data.testIds.some(
        (testId) => !localCatalog.some((test) => test.id === testId),
      )
    )
      throw new ApiError(422, "Unknown test selection");
    const suiteId = id ?? randomUUID();
    const body = {
      ...parsed.data,
      testIds: [...new Set(parsed.data.testIds)],
      id: suiteId,
      projectId,
    };
    if (id) {
      const current = await this.get(principal, id, "suite");
      if (version !== `"${current.version}"`)
        throw new ApiError(412, "Suite changed; reload before saving");
      const updated = await this.db.query<Row>(
        "UPDATE platform_documents SET body=$1,version=version+1 WHERE id=$2 AND organization_id=$3 AND project_id=$4 AND version=$5 RETURNING body,version",
        [
          JSON.stringify(body),
          id,
          principal.organizationId,
          projectId,
          current.version,
        ],
      );
      if (!updated.rows[0])
        throw new ApiError(412, "Suite changed concurrently");
      await this.audit(principal, projectId, "suite.updated", suiteId);
      return { ...body, version: updated.rows[0].version };
    }
    await this.db.query(
      "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1,$2,$3,$4,$5)",
      [
        suiteId,
        principal.organizationId,
        projectId,
        "suite",
        JSON.stringify(body),
      ],
    );
    await this.audit(principal, projectId, "suite.created", suiteId);
    return { ...body, version: 1 };
  }
  async launch(
    principal: Principal,
    projectId: string,
    input: unknown,
    key: string | undefined,
    parentRunId?: string,
  ): Promise<Record<string, unknown> & { version: number }> {
    this.authorize(principal, projectId, "operator");
    const parsed = runInput.safeParse(input);
    if (!parsed.success || !key || key.length > 200)
      throw new ApiError(
        422,
        "Invalid execution policy, selection or idempotency key",
      );
    const config = {
      ...parsed.data,
      selection: {
        testIds: [...new Set(parsed.data.selection.testIds)].sort(),
      },
    };
    const hasUi = config.selection.testIds.some((id) => id.startsWith("UI-"));
    if (hasUi !== Boolean(config.browserProjects.length))
      throw new ApiError(
        422,
        "UI selections require a browser; API-only selections must not select browsers",
      );
    const payload = JSON.stringify({
      config,
      parentRunId: parentRunId ?? null,
    });
    const scope = `${principal.organizationId}:${principal.subject}:${projectId}:${key}`;
    const existing = (
      await this.db.query<{ payload: string; run_id: string }>(
        "SELECT payload,run_id FROM launch_keys WHERE scope=$1",
        [scope],
      )
    ).rows[0];
    if (existing) {
      if (existing.payload !== payload)
        throw new ApiError(
          409,
          "Idempotency key conflicts with previous request",
        );
      return this.get(principal, existing.run_id, "run");
    }
    let source: unknown = {
      revision: catalogRevision,
      manifest: sourceManifest,
    };
    let permittedIds = localCatalog.map((test) => test.id);
    if (parentRunId) {
      const parent = await this.get(principal, parentRunId, "run");
      const parentConfig = runInput.parse(parent["config"]);
      if (
        parentConfig.catalogRevision !== config.catalogRevision ||
        parent["projectId"] !== projectId
      )
        throw new ApiError(409, "Rerun source differs from its parent");
      try {
        await verifySource(config.catalogRevision);
      } catch {
        throw new ApiError(409, "Original source snapshot is unavailable");
      }
      source = parent["source"];
      permittedIds = parentConfig.selection.testIds;
    } else if (config.catalogRevision !== catalogRevision)
      throw new ApiError(
        409,
        "Catalog changed; refresh the selection before launching",
      );
    if (config.selection.testIds.some((id) => !permittedIds.includes(id)))
      throw new ApiError(422, "Unknown test selection");
    const id = randomUUID();
    const run: RunRecord = {
      id,
      projectId,
      organizationId: principal.organizationId,
      createdBy: principal.subject,
      phase: "queued",
      createdAt: new Date().toISOString(),
      selection: config.selection,
      config,
      reportPhase: "pending",
      parentRunId: parentRunId ?? null,
      source,
    };
    const result = await this.db.query<Row>(
      `WITH claimed AS (
      INSERT INTO launch_keys(scope,payload,run_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING run_id
    ) INSERT INTO platform_documents(id,organization_id,project_id,kind,body)
    SELECT run_id,$4,$5,'run',$6 FROM claimed RETURNING body,version`,
      [
        scope,
        payload,
        id,
        principal.organizationId,
        projectId,
        JSON.stringify(run),
      ],
    );
    if (!result.rows.length)
      return this.launch(principal, projectId, input, key, parentRunId);
    await this.audit(principal, projectId, "run.queued", id);
    return { ...run, version: 1 };
  }
  async rerun(
    principal: Principal,
    id: string,
    input: unknown,
    key: string | undefined,
  ) {
    const run = await this.get(principal, id, "run");
    const parsed = z
      .object({
        mode: z.enum(["all", "failed", "selected"]).default("all"),
        testIds: z.array(z.string()).optional(),
      })
      .strict()
      .safeParse(input);
    if (!parsed.success) throw new ApiError(422, "Invalid rerun selection");
    if (
      !["completed", "canceled", "infrastructure_error", "timed_out"].includes(
        String(run["phase"]),
      )
    )
      throw new ApiError(409, "Wait for the original execution to finish");
    const config = runInput.parse(run["config"]);
    let ids = config.selection.testIds;
    if (parsed.data.mode === "failed") {
      const results = z
        .array(
          z.object({
            id: z.string(),
            caseId: z.string().optional(),
            status: z.string(),
          }),
        )
        .parse(run["results"] ?? []);
      ids = [
        ...new Set(
          results
            .filter((result) =>
              ["failed", "timedOut", "broken", "interrupted"].includes(
                result.status,
              ),
            )
            .map((result) => result.caseId ?? result.id.split(":")[0]!),
        ),
      ];
    } else if (parsed.data.mode === "selected")
      ids = [...new Set(parsed.data.testIds ?? [])];
    if (
      !ids.length ||
      ids.some((testId) => !config.selection.testIds.includes(testId))
    )
      throw new ApiError(422, "Select tests from the original execution");
    return this.launch(
      principal,
      String(run["projectId"]),
      {
        ...config,
        selection: { testIds: ids },
        browserProjects: ids.some((testId) => testId.startsWith("UI-"))
          ? config.browserProjects
          : [],
      },
      key,
      id,
    );
  }
  async cancel(principal: Principal, id: string) {
    const run = await this.get(principal, id, "run");
    this.authorize(principal, String(run["projectId"]), "operator");
    if (
      run["createdBy"] !== principal.subject &&
      roles.indexOf(principal.role) < 2
    )
      throw new ApiError(
        403,
        "Only the creator or maintainer can cancel this run",
      );
    if (!["queued", "running", "provisioning"].includes(String(run["phase"])))
      return run;
    const config = runInput.parse(run["config"]);
    const pending = config.selection.testIds.flatMap((caseId) =>
      (caseId.startsWith("UI-") ? config.browserProjects : ["api"]).map(
        (project) => ({
          id: project === "api" ? caseId : `${caseId}:${project}`,
          caseId,
          title: caseId,
          browser: project === "api" ? null : project,
          status: "canceled",
          duration: 0,
          attempts: [],
        }),
      ),
    );
    await this.db.query(
      `WITH updated AS (UPDATE platform_documents SET body=body || '{"cancelRequested":true}'::jsonb || CASE WHEN body->>'phase'='queued' THEN $2::jsonb ELSE '{}'::jsonb END,version=version+1 WHERE id=$1 AND body->>'phase' IN ('queued','running','provisioning') RETURNING id,body) INSERT INTO run_events(run_id,body) SELECT id,jsonb_build_object('phase',body->>'phase','cancelRequested',true) FROM updated`,
      [
        id,
        JSON.stringify({
          phase: "canceled",
          endedAt: new Date().toISOString(),
          reportPhase: "failed",
          results: pending,
        }),
      ],
    );
    await this.audit(
      principal,
      String(run["projectId"]),
      "run.cancel_requested",
      id,
    );
    return this.get(principal, id, "run");
  }
}

export function mountPlatform(
  app: Express,
  service: PlatformService,
  identity: IdentityService,
) {
  const handler =
    (
      fn: (req: Request, res: Response, principal: Principal) => Promise<void>,
    ) =>
    async (req: Request, res: Response) => {
      res.set("Cache-Control", "no-store");
      try {
        const principal = await identity.principal(req);
        if (!principal) throw new ApiError(401, "Authentication required");
        if (!["GET", "HEAD"].includes(req.method) && !identity.sameOrigin(req))
          throw new ApiError(403, "Origin rejected");
        await fn(req, res, principal);
      } catch (error) {
        const status = error instanceof ApiError ? error.status : 500;
        res
          .status(status)
          .type("application/problem+json")
          .json({
            status,
            title:
              error instanceof ApiError
                ? error.message
                : "Internal service error",
            correlationId: randomUUID(),
          });
      }
    };
  app.get(
    "/v1/projects",
    handler(async (_req, res, principal) => {
      const items = (
        await Promise.all(
          principal.projectIds.map((id) =>
            service.list(principal, id, "project"),
          ),
        )
      ).flat();
      res.json({ items });
    }),
  );
  app.get(
    "/v1/projects/:project/catalog",
    handler(async (req, res, principal) => {
      const projectId = String(req.params["project"]);
      service.authorize(principal, projectId);
      const query = String(req.query["query"] ?? "").toLowerCase();
      res.json({
        revision: catalogRevision,
        items: localCatalog.filter((item) =>
          `${item.id} ${item.title} ${item.feature}`
            .toLowerCase()
            .includes(query),
        ),
      });
    }),
  );
  app.get(
    "/v1/projects/:project/environments",
    handler(async (req, res, principal) => {
      service.authorize(principal, String(req.params["project"]));
      res.json({
        items: [
          {
            id: "local-lab",
            name: "Local Lab sandbox",
            maxWorkers: 4,
            maxRetries: 2,
            browserProjects: [],
          },
        ],
      });
    }),
  );
  app.get(
    "/v1/projects/:project/suites",
    handler(async (req, res, principal) => {
      res.json({
        items: await service.list(
          principal,
          String(req.params["project"]),
          "suite",
        ),
      });
    }),
  );
  app.post(
    "/v1/projects/:project/suites",
    handler(async (req, res, principal) => {
      res
        .status(201)
        .json(
          await service.saveSuite(
            principal,
            String(req.params["project"]),
            req.body as unknown,
          ),
        );
    }),
  );
  app.patch(
    "/v1/suites/:id",
    handler(async (req, res, principal) => {
      const suite = await service.get(
        principal,
        String(req.params["id"]),
        "suite",
      );
      res.json(
        await service.saveSuite(
          principal,
          String(suite["projectId"]),
          req.body as unknown,
          String(req.params["id"]),
          req.get("If-Match"),
        ),
      );
    }),
  );
  app.post(
    "/v1/projects/:project/runs",
    handler(async (req, res, principal) => {
      res
        .status(202)
        .json(
          await service.launch(
            principal,
            String(req.params["project"]),
            req.body as unknown,
            req.get("Idempotency-Key"),
          ),
        );
    }),
  );
  app.get(
    "/v1/runs",
    handler(async (req, res, principal) => {
      res.json({
        items: await service.list(
          principal,
          String(req.query["projectId"]),
          "run",
        ),
      });
    }),
  );
  app.get(
    "/v1/runs/:id",
    handler(async (req, res, principal) => {
      res.json(await service.get(principal, String(req.params["id"]), "run"));
    }),
  );
  app.post(
    "/v1/runs/:id/cancel",
    handler(async (req, res, principal) => {
      res
        .status(202)
        .json(await service.cancel(principal, String(req.params["id"])));
    }),
  );
  app.post(
    "/v1/runs/:id/report-rebuilds",
    handler(async (req, res, principal) => {
      const id = String(req.params["id"]);
      const run = await service.get(principal, id, "run");
      service.authorize(principal, String(run["projectId"]), "maintainer");
      if (run["phase"] !== "completed")
        throw new ApiError(409, "Only completed runs have rebuildable reports");
      await service.db.query(
        `UPDATE platform_documents SET body=jsonb_set(body,'{reportPhase}','"rebuild_requested"'),version=version+1 WHERE id=$1 AND body->>'reportPhase' IN ('ready','failed')`,
        [id],
      );
      await service.audit(
        principal,
        String(run["projectId"]),
        "report.rebuild_requested",
        id,
      );
      res.status(202).json(await service.get(principal, id, "run"));
    }),
  );
  app.post(
    "/v1/runs/:id/reruns",
    handler(async (req, res, principal) => {
      res
        .status(202)
        .json(
          await service.rerun(
            principal,
            String(req.params["id"]),
            req.body as unknown,
            req.get("Idempotency-Key"),
          ),
        );
    }),
  );
  app.get(
    "/v1/audit-events",
    handler(async (req, res, principal) => {
      const projectId = String(req.query["projectId"]);
      service.authorize(principal, projectId, "administrator");
      res.json({ items: await service.list(principal, projectId, "audit") });
    }),
  );
}
