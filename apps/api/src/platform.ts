import { randomUUID } from 'node:crypto';

import type { Express, Request, Response } from 'express';
import { z } from 'zod';

import { initializeAnalyticsProjection } from './analytics-projection.ts';
import type { SqlConnection } from './database.ts';
import { discoverApprovedSource, discoveredCase } from './discovery.ts';
import { environmentSchema, initializeEnvironments, listEnvironments } from './environments.ts';
import type { IdentityService } from './identity.ts';
import { type Principal } from './identity.ts';
import { migrate } from './migrations.ts';
import { initializeHistory, readHistory } from './report-history.ts';
import { initializeReports } from './report-storage.ts';
import { failureResponse } from './request-context.ts';
import { initializeScheduler } from './scheduler.ts';
import { catalogRevision, prepareSource, sourceManifest, verifySource } from './source.ts';

export const localProjectId = '00000000-0000-4000-8000-000000000010';
const localOrg = '00000000-0000-4000-8000-000000000001';
export const localCatalog = [
  ['LAB-001', 'Persistent order lifecycle', 'Orders'],
  ['LAB-002', 'Missing authentication', 'Authentication'],
  ['LAB-003', 'Invalid and expired token', 'Authentication'],
  ['LAB-004', 'Viewer cannot create', 'Authorization'],
  ['LAB-005', 'Tenant separation', 'Authorization'],
  ['LAB-006', 'Quantity boundary validation', 'Schema'],
  ['LAB-007', 'Malformed JSON and media type', 'Transport'],
  ['LAB-008', 'Optimistic concurrency', 'Orders'],
  ['LAB-009', 'Idempotency deduplication', 'Orders'],
  ['LAB-010', 'Pagination has no overlap', 'Orders'],
  ['LAB-011', 'Rate-limit handling', 'Resilience'],
  ['LAB-012', 'Bounded timeout', 'Resilience'],
  ['LAB-013', 'Service failure diagnosis', 'Resilience'],
  ['LAB-014', 'Response-time budget', 'Performance'],
  ['LAB-015', 'Confirmed-order deletion protection', 'Orders'],
  ['UI-001', 'Valid login unlocks catalog', 'Store authentication'],
  ['UI-002', 'Locked user cannot enter', 'Store authentication'],
  ['UI-003', 'Invalid password is rejected', 'Store authentication'],
  ['UI-004', 'Required login input', 'Store authentication'],
  ['UI-005', 'Checkout completes', 'Checkout'],
  ['UI-006', 'Cart removal preserves remaining items', 'Cart'],
  ['UI-007', 'Price sort is numeric', 'Catalog'],
  ['UI-008', 'Checkout rejects missing customer data', 'Checkout'],
  ['UI-009', 'Logout clears session', 'Store authentication'],
  ['UI-010', 'Cancel checkout preserves cart', 'Checkout'],
  ['UI-011', 'Product detail matches catalog', 'Catalog'],
  ['UI-012', 'Checkout total arithmetic', 'Checkout'],
].map(([id, title, feature]) => ({
  id,
  title,
  feature,
  kind: id?.startsWith('UI-') ? 'ui' : 'api',
  tags: ['smoke', id?.startsWith('UI-') ? 'ui' : 'api'],
  priority: 'P0',
  enabled: true,
}));
interface Row extends Record<string, unknown> {
  body: Record<string, unknown>;
  version: number;
}
const suiteInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(2000).default(''),
    testIds: z.array(z.string()).max(10000),
    owner: z.string().max(120).default(''),
    tags: z.array(z.string().max(50)).max(20).default([]),
    priority: z.enum(['P0', 'P1', 'P2']).default('P1'),
  })
  .strict();
const selectionInput = z.object({ testIds: z.array(z.string()).min(1).max(10000) }).strict();
const metadataInput = z
  .object({
    feature: z.string().trim().min(1).max(120),
    module: z.string().trim().max(120).default(''),
    owner: z.string().trim().max(120).default(''),
    priority: z.enum(['P0', 'P1', 'P2']),
    enabled: z.boolean(),
    quarantined: z.boolean().default(false),
    tags: z.array(z.string().trim().min(1).max(50)).max(20),
  })
  .strict();
const runInput = z
  .object({
    catalogRevision: z.string().min(1),
    selection: selectionInput,
    suite: z.object({ id: z.uuid(), version: z.number().int().positive() }).strict().optional(),
    environmentId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    browserProjects: z.array(z.enum(['chromium', 'firefox', 'webkit'])).max(3),
    workers: z.number().int().min(1).max(4),
    retries: z.number().int().min(0).max(2),
    headed: z.boolean().default(false),
    video: z.enum(['off', 'retain-on-failure']),
    commitSha: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .optional(),
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
  public constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const roles = ['viewer', 'operator', 'maintainer', 'administrator'];
export class PlatformService {
  public revision = catalogRevision;
  public manifest = sourceManifest;
  public catalog: (z.infer<typeof discoveredCase> & {
    feature: string;
    kind: string;
    priority: string;
    enabled: boolean;
  })[] = [];
  public discoveryError: string | null = null;
  public constructor(
    public readonly db: SqlConnection,
    private readonly discover = discoverApprovedSource,
  ) {}
  public async initialize(): Promise<void> {
    await prepareSource();
    await migrate(this.db, 'catalog-baseline-v1', [
      'CREATE TABLE IF NOT EXISTS catalog_revisions (revision text PRIMARY KEY, body jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())',
    ]);
    try {
      const items = await this.discover();
      await this.db.query(
        'INSERT INTO catalog_revisions(revision,body) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [catalogRevision, JSON.stringify({ items, manifest: sourceManifest })],
      );
      this.setCatalog(items);
    } catch {
      this.discoveryError =
        'Source discovery failed; the previous successful catalog remains active';
      const previous = (
        await this.db.query<{
          revision: string;
          body: { items: unknown; manifest: typeof sourceManifest };
        }>('SELECT revision,body FROM catalog_revisions ORDER BY created_at DESC LIMIT 1')
      ).rows[0];
      if (!previous) {
        throw new Error(
          'No successful catalog is available; install automation dependencies and fix discovery',
        );
      }
      this.revision = previous.revision;
      this.manifest = previous.body.manifest;
      this.setCatalog(z.array(discoveredCase).parse(previous.body.items));
    }
    await migrate(this.db, 'platform-baseline-v1', [
      'CREATE TABLE IF NOT EXISTS platform_documents (id text PRIMARY KEY, organization_id uuid NOT NULL, project_id uuid NOT NULL, kind text NOT NULL, version integer NOT NULL DEFAULT 1, body jsonb NOT NULL)',
      'CREATE INDEX IF NOT EXISTS platform_scope ON platform_documents(organization_id,project_id,kind,id)',
      'CREATE TABLE IF NOT EXISTS launch_keys (scope text PRIMARY KEY, payload text NOT NULL, run_id text NOT NULL)',
      'CREATE TABLE IF NOT EXISTS run_events (sequence bigserial PRIMARY KEY, run_id text NOT NULL, body jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now())',
    ]);
    await initializeScheduler(this.db);
    await initializeReports(this.db);
    await initializeHistory(this.db);
    await initializeEnvironments(this.db);
    await initializeAnalyticsProjection(this.db);
  }
  public async seedLocal(): Promise<void> {
    await this.db.query(
      'INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1::text,$2,$1::uuid,$3,$4) ON CONFLICT DO NOTHING',
      [
        localProjectId,
        localOrg,
        'project',
        JSON.stringify({
          id: localProjectId,
          name: 'Assertide Lab',
          description: 'Controlled API contract sandbox',
          owner: 'QA Platform',
          catalogRevision: this.revision,
        }),
      ],
    );
  }
  public authorize(principal: Principal, projectId: string, minimum = 'viewer'): void {
    if (!principal.projectIds.includes(projectId)) {
      throw new ApiError(404, 'Project not found');
    }
    if (roles.indexOf(principal.role) < roles.indexOf(minimum)) {
      throw new ApiError(403, `${minimum} role required`);
    }
  }
  public async list(
    principal: Principal,
    projectId: string,
    kind: string,
  ): Promise<{ version: number }[]> {
    this.authorize(principal, projectId);
    return (
      await this.db.query<Row>(
        "SELECT body,version FROM platform_documents WHERE organization_id=$1 AND project_id=$2 AND kind=$3 ORDER BY COALESCE(body->>'createdAt',body->>'occurredAt','') DESC,id DESC LIMIT 200",
        [principal.organizationId, projectId, kind],
      )
    ).rows.map((row) => ({ ...row.body, version: row.version }));
  }
  public async get(
    principal: Principal,
    id: string,
    kind: string,
  ): Promise<Record<string, unknown> & { version: number }> {
    const row = (
      await this.db.query<Row>(
        'SELECT body,version FROM platform_documents WHERE id=$1 AND organization_id=$2 AND kind=$3',
        [id, principal.organizationId, kind],
      )
    ).rows[0];
    if (!row) {
      throw new ApiError(404, 'Resource not found');
    }
    const projectId = kind === 'project' ? id : String(row.body['projectId']);
    this.authorize(principal, projectId);
    return { ...row.body, version: row.version };
  }
  public async history(
    principal: Principal,
    projectId: string,
    input: unknown,
  ): Promise<{ items: { version: number }[]; nextCursor: string | null }> {
    this.authorize(principal, projectId);
    const parsed = z
      .object({
        phase: z
          .enum([
            'all',
            'queued',
            'running',
            'provisioning',
            'finalizing',
            'completed',
            'canceled',
            'infrastructure_error',
            'timed_out',
          ])
          .default('all'),
        browser: z.enum(['all', 'api', 'chromium', 'firefox', 'webkit']).default('all'),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        suite: z.uuid().optional(),
        environment: z
          .string()
          .regex(/^[a-z][a-z0-9-]{0,63}$/)
          .optional(),
        outcome: z.enum(['all', 'passed', 'failed', 'broken', 'skipped']).default('all'),
        cursor: z.string().max(500).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .safeParse(input);
    if (!parsed.success) {
      throw new ApiError(422, 'Invalid history filters');
    }
    const filters = parsed.data;
    let cursor: { at: string; id: string } | undefined;
    try {
      if (filters.cursor) {
        cursor = z
          .object({ at: z.iso.datetime(), id: z.uuid() })
          .parse(JSON.parse(Buffer.from(filters.cursor, 'base64url').toString('utf8')));
      }
    } catch {
      throw new ApiError(422, 'Invalid history cursor');
    }
    if (filters.from && filters.to && filters.from > filters.to) {
      throw new ApiError(422, 'Start date must precede end date');
    }
    const rows = (
      await this.db.query<Row>(
        `SELECT body,version FROM platform_documents WHERE organization_id=$1 AND project_id=$2 AND kind='run' AND ($3='all' OR body->>'phase'=$3) AND ($4='all' OR body->'config'->'browserProjects' ? $4 OR ($4='api' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(body->'selection'->'testIds') t WHERE t LIKE 'LAB-%'))) AND ($5::text IS NULL OR (body->>'createdAt',id)<($5,$6)) AND ($7::timestamptz IS NULL OR (body->>'createdAt')::timestamptz >= $7) AND ($8::timestamptz IS NULL OR (body->>'createdAt')::timestamptz < $8) AND ($10::text IS NULL OR body->'config'->'suite'->>'id'=$10) AND ($11::text IS NULL OR body->'config'->>'environmentId'=$11) AND ($12='all' OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(body->'results','[]'::jsonb)) r WHERE NOT COALESCE((r->>'expectedFailure')::boolean,false) AND (r->>'status'=$12 OR ($12='failed' AND r->>'status'='timedOut')))) ORDER BY body->>'createdAt' DESC,id DESC LIMIT $9`,
        [
          principal.organizationId,
          projectId,
          filters.phase,
          filters.browser,
          cursor?.at ?? null,
          cursor?.id ?? null,
          filters.from ? `${filters.from}T00:00:00Z` : null,
          filters.to
            ? new Date(Date.parse(`${filters.to}T00:00:00Z`) + 86400000).toISOString()
            : null,
          filters.limit + 1,
          filters.suite ?? null,
          filters.environment ?? null,
          filters.outcome,
        ],
      )
    ).rows;
    const items = rows
      .slice(0, filters.limit)
      .map((row) => ({ ...row.body, version: row.version }));
    const last = rows.slice(0, filters.limit).at(-1)?.body;
    return {
      items,
      nextCursor:
        rows.length > filters.limit && last
          ? Buffer.from(JSON.stringify({ at: last['createdAt'], id: last['id'] })).toString(
              'base64url',
            )
          : null,
    };
  }
  public async audit(
    principal: Principal,
    projectId: string,
    action: string,
    resourceId: string,
  ): Promise<void> {
    const id = randomUUID();
    await this.db.query(
      'INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1,$2,$3,$4,$5)',
      [
        id,
        principal.organizationId,
        projectId,
        'audit',
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
  public async projectCatalog(
    principal: Principal,
    projectId: string,
  ): Promise<
    {
      version: number;
      feature: string;
      module: string;
      owner: string;
      priority: string;
      enabled: boolean;
      quarantined?: boolean;
      tags: string[];
      id: string;
      title: string;
      file: string;
      line: number;
      projects: string[];
      kind: string;
    }[]
  > {
    this.authorize(principal, projectId);
    const rows = (
      await this.db.query<Row>(
        "SELECT body,version FROM platform_documents WHERE organization_id=$1 AND project_id=$2 AND kind='metadata'",
        [principal.organizationId, projectId],
      )
    ).rows;
    const overrides = new Map(rows.map((row) => [String(row.body['caseId']), row]));
    return this.catalog.map((item) => {
      const override = overrides.get(item.id);
      return {
        ...item,
        module: '',
        owner: '',
        ...(override ? metadataInput.parse(override.body['metadata']) : {}),
        version: override?.version ?? 0,
      };
    });
  }
  public async saveMetadata(
    principal: Principal,
    projectId: string,
    caseId: string,
    input: unknown,
    match?: string,
  ): Promise<{
    version: number;
    feature: string;
    module: string;
    owner: string;
    priority: 'P0' | 'P1' | 'P2';
    enabled: boolean;
    quarantined: boolean;
    tags: string[];
  }> {
    this.authorize(principal, projectId, 'maintainer');
    if (!this.catalog.some((item) => item.id === caseId)) {
      throw new ApiError(404, 'Test not found');
    }
    const parsed = metadataInput.safeParse(input);
    if (!parsed.success) {
      throw new ApiError(422, 'Invalid test metadata');
    }
    const version = /^"(\d+)"$/.exec(match ?? '');
    if (!version) {
      throw new ApiError(412, 'Reload the catalog before saving');
    }
    const id = `${projectId}:metadata:${caseId}`;
    const body = { id, projectId, caseId, metadata: parsed.data };
    const rows =
      Number(version[1]) === 0
        ? await this.db.query<Row>(
            "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1,$2,$3,'metadata',$4) ON CONFLICT DO NOTHING RETURNING body,version",
            [id, principal.organizationId, projectId, JSON.stringify(body)],
          )
        : await this.db.query<Row>(
            'UPDATE platform_documents SET body=$4,version=version+1 WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND version=$5 RETURNING body,version',
            [id, principal.organizationId, projectId, JSON.stringify(body), Number(version[1])],
          );
    if (!rows.rows[0]) {
      throw new ApiError(412, 'Test metadata changed; reload before saving');
    }
    await this.audit(principal, projectId, 'catalog.metadata_updated', caseId);
    return { ...parsed.data, version: rows.rows[0].version };
  }
  public async saveSuite(
    principal: Principal,
    projectId: string,
    input: unknown,
    id?: string,
    version?: string,
  ): Promise<{
    version: number;
    testIds: string[];
    id: string;
    projectId: string;
    name: string;
    description: string;
    owner: string;
    tags: string[];
    priority: 'P0' | 'P1' | 'P2';
  }> {
    this.authorize(principal, projectId, 'maintainer');
    const parsed = suiteInput.safeParse(input);
    if (!parsed.success) {
      throw new ApiError(422, 'Invalid suite fields');
    }
    if (parsed.data.testIds.some((testId) => !this.catalog.some((test) => test.id === testId))) {
      throw new ApiError(422, 'Unknown test selection');
    }
    const suiteId = id ?? randomUUID();
    const body = {
      ...parsed.data,
      testIds: [...new Set(parsed.data.testIds)],
      id: suiteId,
      projectId,
    };
    if (id) {
      const current = await this.get(principal, id, 'suite');
      if (version !== `"${current.version}"`) {
        throw new ApiError(412, 'Suite changed; reload before saving');
      }
      const updated = await this.db.query<Row>(
        'UPDATE platform_documents SET body=$1,version=version+1 WHERE id=$2 AND organization_id=$3 AND project_id=$4 AND version=$5 RETURNING body,version',
        [JSON.stringify(body), id, principal.organizationId, projectId, current.version],
      );
      if (!updated.rows[0]) {
        throw new ApiError(412, 'Suite changed concurrently');
      }
      await this.audit(principal, projectId, 'suite.updated', suiteId);
      return { ...body, version: updated.rows[0].version };
    }
    await this.db.query(
      'INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1,$2,$3,$4,$5)',
      [suiteId, principal.organizationId, projectId, 'suite', JSON.stringify(body)],
    );
    await this.audit(principal, projectId, 'suite.created', suiteId);
    return { ...body, version: 1 };
  }
  public async launch(
    principal: Principal,
    projectId: string,
    input: unknown,
    key: string | undefined,
    parentRunId?: string,
  ): Promise<Record<string, unknown> & { version: number }> {
    this.authorize(principal, projectId, 'operator');
    const parsed = runInput.safeParse(input);
    if (!parsed.success || !key || key.length > 200) {
      throw new ApiError(422, 'Invalid execution policy, selection or idempotency key');
    }
    const config = {
      ...parsed.data,
      selection: {
        testIds: [...new Set(parsed.data.selection.testIds)].sort(),
      },
    };
    const hasUi = config.selection.testIds.some((id) => id.startsWith('UI-'));
    if (hasUi !== Boolean(config.browserProjects.length)) {
      throw new ApiError(
        422,
        'UI selections require a browser; API-only selections must not select browsers',
      );
    }
    const payload = JSON.stringify({
      config,
      parentRunId: parentRunId ?? null,
    });
    const scope = `${principal.organizationId}:${principal.subject}:${projectId}:${key}`;
    const existing = (
      await this.db.query<{ payload: string; run_id: string }>(
        'SELECT payload,run_id FROM launch_keys WHERE scope=$1',
        [scope],
      )
    ).rows[0];
    if (existing) {
      if (existing.payload !== payload) {
        throw new ApiError(409, 'Idempotency key conflicts with previous request');
      }
      return this.get(principal, existing.run_id, 'run');
    }
    let historyFamily = config.selection.testIds;
    let suite: unknown;
    if (config.suite && !parentRunId) {
      const saved = await this.get(principal, config.suite.id, 'suite');
      if (saved['projectId'] !== projectId) {
        throw new ApiError(404, 'Suite unavailable for this project');
      }
      if (saved.version !== config.suite.version) {
        throw new ApiError(412, 'Suite changed; refresh before launching');
      }
      const ids = z.array(z.string()).parse(saved['testIds']).sort();
      if (JSON.stringify(ids) !== JSON.stringify(config.selection.testIds)) {
        throw new ApiError(422, 'Suite selection does not match its saved version');
      }
      suite = saved;
    }
    let workerImage = ['oci', 'kubernetes'].includes(process.env['WORKER_RUNTIME'] ?? '')
      ? process.env['OCI_WORKER_IMAGE']
      : undefined;
    let source: unknown = {
      revision: this.revision,
      manifest: this.manifest,
    };
    let environment = (await listEnvironments(this.db, principal.organizationId, projectId)).find(
      (item) => item.id === config.environmentId,
    );
    if (
      !environment ||
      !environment.enabled ||
      config.workers > environment.maxWorkers ||
      config.retries > environment.maxRetries ||
      config.browserProjects.some((browser) => !environment?.browsers.includes(browser)) ||
      (config.video !== 'off' && !environment.allowVideo) ||
      (config.headed &&
        (!environment.allowHeaded ||
          !['oci', 'kubernetes'].includes(process.env['WORKER_RUNTIME'] ?? '') ||
          !config.selection.testIds.some((id) => id.startsWith('UI-'))))
    ) {
      throw new ApiError(
        422,
        'Environment unavailable or execution exceeds its current policy; refresh configuration',
      );
    }
    let metadata = (await this.projectCatalog(principal, projectId)).filter((item) =>
      config.selection.testIds.includes(item.id),
    );
    let permittedIds = metadata.filter((test) => test.enabled).map((test) => test.id);
    if (parentRunId) {
      const parent = await this.get(principal, parentRunId, 'run');
      const parentConfig = runInput.parse(parent['config']);
      if (
        parentConfig.catalogRevision !== config.catalogRevision ||
        parent['projectId'] !== projectId
      ) {
        throw new ApiError(409, 'Rerun source differs from its parent');
      }
      try {
        await verifySource(config.catalogRevision);
      } catch {
        throw new ApiError(409, 'Original source snapshot is unavailable');
      }
      source = parent['source'];
      suite = parent['suite'];
      historyFamily = z
        .array(z.string())
        .parse(parent['historyFamily'] ?? parentConfig.selection.testIds);
      workerImage = z.string().optional().parse(parent['workerImage']);
      const availableImage = ['oci', 'kubernetes'].includes(process.env['WORKER_RUNTIME'] ?? '')
        ? process.env['OCI_WORKER_IMAGE']
        : undefined;
      if (workerImage !== availableImage) {
        throw new ApiError(
          409,
          'Original worker image is unavailable; restore a matching worker deployment before rerunning',
        );
      }
      if (Array.isArray(parent['metadata'])) {
        metadata = z
          .array(
            discoveredCase.extend({
              version: z.number(),
              feature: z.string(),
              module: z.string(),
              owner: z.string(),
              priority: z.string(),
              enabled: z.boolean(),
              quarantined: z.boolean().default(false),
              kind: z.string(),
            }),
          )
          .parse(parent['metadata'])
          .filter((item) => config.selection.testIds.includes(item.id));
      }
      if (parent['environment']) {
        environment = environmentSchema
          .extend({ version: z.number() })
          .parse(parent['environment']);
      }
      permittedIds = parentConfig.selection.testIds;
    } else if (config.catalogRevision !== this.revision) {
      throw new ApiError(409, 'Catalog changed; refresh the selection before launching');
    }
    if (config.selection.testIds.some((id) => !permittedIds.includes(id))) {
      throw new ApiError(422, 'Unknown or disabled test selection');
    }
    const id = randomUUID();
    const run: RunRecord = {
      id,
      projectId,
      organizationId: principal.organizationId,
      createdBy: principal.subject,
      phase: 'queued',
      createdAt: new Date().toISOString(),
      selection: config.selection,
      config,
      reportPhase: 'pending',
      parentRunId: parentRunId ?? null,
      source,
      suite,
      metadata,
      historyFamily,
      workerImage,
      environment,
    };
    const result = await this.db.query<Row>(
      `WITH claimed AS (
      INSERT INTO launch_keys(scope,payload,run_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING run_id
    ), created AS (INSERT INTO platform_documents(id,organization_id,project_id,kind,body)
    SELECT run_id,$4,$5,'run',$6 FROM claimed RETURNING id,body,version), enqueued AS (INSERT INTO run_outbox(run_id) SELECT id FROM created RETURNING run_id) SELECT body,version FROM created`,
      [scope, payload, id, principal.organizationId, projectId, JSON.stringify(run)],
    );
    if (!result.rows.length) {
      return this.launch(principal, projectId, input, key, parentRunId);
    }
    await this.audit(principal, projectId, 'run.queued', id);
    return { ...run, version: 1 };
  }
  public async rerun(
    principal: Principal,
    id: string,
    input: unknown,
    key: string | undefined,
  ): Promise<Record<string, unknown> & { version: number }> {
    const run = await this.get(principal, id, 'run');
    const parsed = z
      .object({
        mode: z.enum(['all', 'failed', 'selected']).default('all'),
        testIds: z.array(z.string()).optional(),
      })
      .strict()
      .safeParse(input);
    if (!parsed.success) {
      throw new ApiError(422, 'Invalid rerun selection');
    }
    if (
      !['completed', 'canceled', 'infrastructure_error', 'timed_out'].includes(String(run['phase']))
    ) {
      throw new ApiError(409, 'Wait for the original execution to finish');
    }
    const config = runInput.parse(run['config']);
    let ids = config.selection.testIds;
    if (parsed.data.mode === 'failed') {
      const results = z
        .array(
          z.object({
            id: z.string(),
            caseId: z.string().optional(),
            status: z.string(),
          }),
        )
        .parse(run['results'] ?? []);
      ids = [
        ...new Set(
          results
            .filter((result) =>
              ['failed', 'timedOut', 'broken', 'interrupted'].includes(result.status),
            )
            .map((result) => result.caseId ?? result.id.split(':')[0]!),
        ),
      ];
    } else if (parsed.data.mode === 'selected') {
      ids = [...new Set(parsed.data.testIds ?? [])];
    }
    if (!ids.length || ids.some((testId) => !config.selection.testIds.includes(testId))) {
      throw new ApiError(422, 'Select tests from the original execution');
    }
    return this.launch(
      principal,
      String(run['projectId']),
      {
        ...config,
        selection: { testIds: ids },
        browserProjects: ids.some((testId) => testId.startsWith('UI-'))
          ? config.browserProjects
          : [],
      },
      key,
      id,
    );
  }
  public async cancel(
    principal: Principal,
    id: string,
  ): Promise<Record<string, unknown> & { version: number }> {
    const run = await this.get(principal, id, 'run');
    this.authorize(principal, String(run['projectId']), 'operator');
    if (run['createdBy'] !== principal.subject && roles.indexOf(principal.role) < 2) {
      throw new ApiError(403, 'Only the creator or maintainer can cancel this run');
    }
    if (!['queued', 'running', 'provisioning'].includes(String(run['phase']))) {
      return run;
    }
    const config = runInput.parse(run['config']);
    const pending = config.selection.testIds.flatMap((caseId) =>
      (caseId.startsWith('UI-') ? config.browserProjects : ['api']).map((project) => ({
        id: project === 'api' ? caseId : `${caseId}:${project}`,
        caseId,
        title: caseId,
        browser: project === 'api' ? null : project,
        status: 'canceled',
        duration: 0,
        attempts: [],
      })),
    );
    await this.db.query(
      `WITH updated AS (UPDATE platform_documents SET body=body || '{"cancelRequested":true}'::jsonb || CASE WHEN body->>'phase'='queued' THEN $2::jsonb ELSE '{}'::jsonb END,version=version+1 WHERE id=$1 AND body->>'phase' IN ('queued','running','provisioning') RETURNING id,body) INSERT INTO run_events(run_id,body) SELECT id,jsonb_build_object('phase',body->>'phase','cancelRequested',true) FROM updated`,
      [
        id,
        JSON.stringify({
          phase: 'canceled',
          endedAt: new Date().toISOString(),
          reportPhase: 'failed',
          results: pending,
        }),
      ],
    );
    await this.audit(principal, String(run['projectId']), 'run.cancel_requested', id);
    return this.get(principal, id, 'run');
  }
  private setCatalog(items: z.infer<typeof discoveredCase>[]): void {
    const smoke = new Set([
      'LAB-001',
      'LAB-002',
      'LAB-003',
      'LAB-004',
      'LAB-005',
      'LAB-008',
      'LAB-009',
      'UI-001',
      'UI-005',
      'UI-008',
      'UI-009',
      'UI-012',
    ]);
    const defaultPriority = (id: string): string => (smoke.has(id) ? 'P0' : 'P1');
    this.catalog = items.map((item) => ({
      ...item,
      feature: localCatalog.find((meta) => meta.id === item.id)?.feature ?? 'Other',
      kind: item.projects.includes('api') ? 'api' : 'ui',
      tags: [
        ...new Set([
          ...item.tags,
          smoke.has(item.id) ? 'smoke' : 'regression',
          item.id.startsWith('UI-') ? 'ui' : 'api',
        ]),
      ],
      priority: item.id === 'LAB-014' ? 'P2' : defaultPriority(item.id),
      enabled: true,
    }));
  }
}

export function mountPlatform(
  app: Express,
  service: PlatformService,
  identity: IdentityService,
): void {
  const handler =
    (fn: (req: Request, res: Response, principal: Principal) => Promise<void>) =>
    async (req: Request, res: Response) => {
      res.set('Cache-Control', 'no-store');
      try {
        const principal = await identity.principal(req);
        if (!principal) {
          throw new ApiError(401, 'Authentication required');
        }
        if (principal.machine) {
          const read =
            req.method === 'GET' &&
            (/^\/v1\/runs(?:\/|$)/.test(req.path) ||
              /^\/v1\/projects(?:$|\/[^/]+\/(catalog|environments)$)/.test(req.path));
          const write =
            req.method === 'POST' &&
            (/^\/v1\/projects\/[^/]+\/runs$/.test(req.path) ||
              /^\/v1\/runs\/[^/]+\/(cancel|reruns)$/.test(req.path));
          if (!read && !write) {
            throw new ApiError(403, 'Service account scope does not allow this action');
          }
        }
        if (!['GET', 'HEAD'].includes(req.method) && !identity.sameOrigin(req)) {
          throw new ApiError(403, 'Origin rejected');
        }
        await fn(req, res, principal);
      } catch (error) {
        const status = error instanceof ApiError ? error.status : 500;
        failureResponse(
          res,
          error,
          'platform',
          error instanceof ApiError ? error.message : 'Internal service error',
          status,
        );
      }
    };
  app.get(
    '/v1/projects',
    handler(async (_req, res, principal) => {
      const items = (
        await Promise.all(principal.projectIds.map((id) => service.list(principal, id, 'project')))
      ).flat();
      res.json({ items });
    }),
  );
  app.get(
    '/v1/projects/:project/catalog',
    handler(async (req, res, principal) => {
      const projectId = String(req.params['project']);
      service.authorize(principal, projectId);
      const query = String(req.query['query'] ?? '').toLowerCase();
      res.json({
        revision: service.revision,
        discoveryError: service.discoveryError,
        items: (await service.projectCatalog(principal, projectId)).filter((item) =>
          `${item.id} ${item.title} ${item.feature} ${item.module} ${item.owner} ${item.tags.join(' ')}`
            .toLowerCase()
            .includes(query),
        ),
      });
    }),
  );
  app.get(
    '/v1/projects/:project/environments',
    handler(async (req, res, principal) => {
      service.authorize(principal, String(req.params['project']));
      res.json({
        items: await listEnvironments(
          service.db,
          principal.organizationId,
          String(req.params['project']),
        ),
        capabilities: {
          headed: ['oci', 'kubernetes'].includes(process.env['WORKER_RUNTIME'] ?? ''),
        },
      });
    }),
  );
  app.patch(
    '/v1/projects/:project/catalog/:id',
    handler(async (req, res, principal) => {
      res.json(
        await service.saveMetadata(
          principal,
          String(req.params['project']),
          String(req.params['id']),
          req.body,
          req.get('If-Match'),
        ),
      );
    }),
  );
  app.get(
    '/v1/projects/:project/suites',
    handler(async (req, res, principal) => {
      res.json({
        items: await service.list(principal, String(req.params['project']), 'suite'),
      });
    }),
  );
  app.post(
    '/v1/projects/:project/suites',
    handler(async (req, res, principal) => {
      res
        .status(201)
        .json(
          await service.saveSuite(principal, String(req.params['project']), req.body as unknown),
        );
    }),
  );
  app.patch(
    '/v1/suites/:id',
    handler(async (req, res, principal) => {
      const suite = await service.get(principal, String(req.params['id']), 'suite');
      res.json(
        await service.saveSuite(
          principal,
          String(suite['projectId']),
          req.body as unknown,
          String(req.params['id']),
          req.get('If-Match'),
        ),
      );
    }),
  );
  app.post(
    '/v1/projects/:project/runs',
    handler(async (req, res, principal) => {
      res
        .status(202)
        .json(
          await service.launch(
            principal,
            String(req.params['project']),
            req.body as unknown,
            req.get('Idempotency-Key'),
          ),
        );
    }),
  );
  app.get(
    '/v1/runs',
    handler(async (req, res, principal) => {
      res.json(await service.history(principal, String(req.query['projectId']), req.query));
    }),
  );
  app.get(
    '/v1/runs/:id',
    handler(async (req, res, principal) => {
      res.json(await service.get(principal, String(req.params['id']), 'run'));
    }),
  );
  app.post(
    '/v1/runs/:id/cancel',
    handler(async (req, res, principal) => {
      res.status(202).json(await service.cancel(principal, String(req.params['id'])));
    }),
  );
  app.get(
    '/v1/runs/:id/results/:result/previous',
    handler(async (req, res, principal) => {
      const run = await service.get(principal, String(req.params['id']), 'run');
      const resultId = String(req.params['result']);
      if (
        !z
          .array(z.object({ id: z.string() }))
          .parse(run['results'] ?? [])
          .some((result) => result.id === resultId)
      ) {
        throw new ApiError(404, 'Result not found');
      }
      const config = z
        .object({ catalogRevision: z.string(), environmentId: z.string() })
        .parse(run['config']);
      const previous = (
        await service.db.query<{ body: Record<string, unknown> }>(
          "SELECT body FROM platform_documents WHERE kind='run' AND organization_id=$1 AND project_id=$2 AND body->>'phase'='completed' AND body->>'endedAt'<$3 AND body->'config'->>'catalogRevision'=$4 AND body->'config'->>'environmentId'=$5 AND EXISTS(SELECT 1 FROM jsonb_array_elements(body->'results') result WHERE result->>'id'=$6) ORDER BY body->>'endedAt' DESC,id DESC LIMIT 1",
          [
            principal.organizationId,
            run['projectId'],
            run['endedAt'] ?? run['createdAt'],
            config.catalogRevision,
            config.environmentId,
            resultId,
          ],
        )
      ).rows[0]?.body;
      res.json({
        comparison: 'Same source revision, environment and case/browser identity',
        previous: previous
          ? {
              runId: previous['id'],
              endedAt: previous['endedAt'],
              result: z
                .array(z.object({ id: z.string() }).passthrough())
                .parse(previous['results'])
                .find((result) => result.id === resultId),
              config: previous['config'],
            }
          : null,
      });
    }),
  );
  app.get(
    '/v1/runs/:id/history',
    handler(async (req, res, principal) => {
      const run = await service.get(principal, String(req.params['id']), 'run');
      const stream = run['historyStream'];
      const entries = typeof stream === 'string' ? await readHistory(service.db, stream) : [];
      res.json({
        items: entries
          .filter((entry) => entry.runId !== run['id'])
          .reverse()
          .map((entry) => ({
            runId: entry.runId,
            endedAt: entry.endedAt,
            reportAvailable: new Date(entry.reportExpiresAt) > new Date(),
          })),
      });
    }),
  );
  app.get(
    '/v1/runs/:id/annotations',
    handler(async (req, res, principal) => {
      const run = await service.get(principal, String(req.params['id']), 'run');
      const rows = await service.db.query<Row>(
        "SELECT body,version FROM platform_documents WHERE organization_id=$1 AND project_id=$2 AND kind='annotation' AND body->>'runId'=$3 ORDER BY body->>'createdAt',id LIMIT 200",
        [principal.organizationId, run['projectId'], run['id']],
      );
      res.json({ items: rows.rows.map((row) => row.body) });
    }),
  );
  app.post(
    '/v1/runs/:id/annotations',
    handler(async (req, res, principal) => {
      const run = await service.get(principal, String(req.params['id']), 'run');
      service.authorize(principal, String(run['projectId']), 'operator');
      const parsed = z
        .object({
          resultId: z.string().min(1).max(120),
          text: z.string().trim().min(1).max(4000),
        })
        .strict()
        .safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(422, 'A result and diagnosis text are required');
      }
      const results = z.array(z.object({ id: z.string() })).parse(run['results'] ?? []);
      if (!results.some((result) => result.id === parsed.data.resultId)) {
        throw new ApiError(404, 'Result not found');
      }
      const note = {
        id: randomUUID(),
        runId: run['id'],
        projectId: run['projectId'],
        resultId: parsed.data.resultId,
        text: parsed.data.text,
        author: principal.name,
        subject: principal.subject,
        createdAt: new Date().toISOString(),
      };
      await service.db.query(
        "INSERT INTO platform_documents(id,organization_id,project_id,kind,body) VALUES($1,$2,$3,'annotation',$4)",
        [note.id, principal.organizationId, note.projectId, JSON.stringify(note)],
      );
      await service.audit(principal, String(note.projectId), 'result.annotated', note.id);
      res.status(201).json(note);
    }),
  );
  app.post(
    '/v1/runs/:id/report-rebuilds',
    handler(async (req, res, principal) => {
      const id = String(req.params['id']);
      const run = await service.get(principal, id, 'run');
      service.authorize(principal, String(run['projectId']), 'maintainer');
      if (run['phase'] !== 'completed') {
        throw new ApiError(409, 'Only completed runs have rebuildable reports');
      }
      if (
        run['rawExpiredAt'] ||
        (typeof run['endedAt'] === 'string' &&
          new Date(run['endedAt']).getTime() + 30 * 86400000 <= Date.now())
      ) {
        throw new ApiError(410, 'Raw evidence expired; this report can no longer be rebuilt');
      }
      await service.db.query(
        `UPDATE platform_documents SET body=jsonb_set(body,'{reportPhase}','"rebuild_requested"'),version=version+1 WHERE id=$1 AND body->>'reportPhase' IN ('ready','failed')`,
        [id],
      );
      await service.audit(principal, String(run['projectId']), 'report.rebuild_requested', id);
      res.status(202).json(await service.get(principal, id, 'run'));
    }),
  );
  app.post(
    '/v1/runs/:id/reruns',
    handler(async (req, res, principal) => {
      res
        .status(202)
        .json(
          await service.rerun(
            principal,
            String(req.params['id']),
            req.body as unknown,
            req.get('Idempotency-Key'),
          ),
        );
    }),
  );
  app.get(
    '/v1/audit-events',
    handler(async (req, res, principal) => {
      const projectId = String(req.query['projectId']);
      service.authorize(principal, projectId, 'administrator');
      res.json({ items: await service.list(principal, projectId, 'audit') });
    }),
  );
}
