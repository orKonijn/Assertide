import { expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ApiRoutes } from "../types/routes";
import { TestData, Timeouts, RunStatus } from "../types/test-data";
import type {
  CatalogCase,
  Project,
  RunRecord,
  SuiteInput,
} from "../types/platform";
export class PlatformApi {
  constructor(readonly request: APIRequestContext) {}
  async get<T>(url: string): Promise<T> {
    const response = await this.request.get(url);
    if (!response.ok())
      throw new Error(`Setup read failed: HTTP ${response.status()}`);
    return response.json() as Promise<T>;
  }
  async post<T>(url: string, data: unknown): Promise<T> {
    const response = await this.request.post(url, {
      headers: { Origin: TestData.origin, "Idempotency-Key": randomUUID() },
      data,
    });
    if (!response.ok())
      throw new Error(`Setup write failed: HTTP ${response.status()}`);
    return response.json() as Promise<T>;
  }
  createProject(name: string) {
    return this.post<Project>(ApiRoutes.projects, {
      name,
      description: "Independent UI regression project",
    });
  }
  catalog(project: string = TestData.project) {
    return this.get<{ revision: string; items: CatalogCase[] }>(
      ApiRoutes.catalog(project),
    );
  }
  run(id: string) {
    return this.get<RunRecord>(ApiRoutes.run(id));
  }
  createSuite(project: string, input: SuiteInput) {
    return this.post<{ id: string }>(ApiRoutes.suites(project), {
      description: "",
      owner: "QA Automation",
      tags: [],
      ...input,
    });
  }
  async setEnabled(project: string, ids: readonly string[], enabled: boolean) {
    for (const item of (await this.catalog(project)).items.filter((item) =>
      ids.includes(item.id),
    )) {
      const response = await this.request.patch(
        ApiRoutes.metadata(project, item.id),
        {
          headers: { Origin: TestData.origin, "If-Match": `"${item.version}"` },
          data: {
            feature: item.feature,
            module: item.module,
            owner: item.owner,
            tags: item.tags,
            priority: item.priority,
            enabled,
            quarantined: item.quarantined ?? false,
          },
        },
      );
      if (!response.ok())
        throw new Error(`Metadata setup failed: HTTP ${response.status()}`);
    }
  }
  async launch(ids: readonly string[], project: string = TestData.project) {
    const catalog = await this.catalog(project);
    return this.post<RunRecord>(ApiRoutes.launch(project), {
      catalogRevision: catalog.revision,
      selection: { testIds: ids },
      environmentId: TestData.environment,
      browserProjects: ids.some((id) => id.startsWith("UI-"))
        ? ["chromium"]
        : [],
      workers: 1,
      retries: 0,
      headed: false,
      video: "off",
    });
  }
  async completed(ids: readonly string[], project: string = TestData.project) {
    const run = await this.launch(ids, project);
    return this.waitForCompletion(run.id);
  }
  async waitForCompletion(id: string) {
    await expect
      .poll(async () => (await this.run(id)).phase, {
        timeout: Timeouts.execution,
      })
      .toBe(RunStatus.completed);
    return this.run(id);
  }
  async readyReport(
    ids: readonly string[],
    project: string = TestData.project,
  ) {
    const run = await this.completed(ids, project);
    await this.waitForReport(run.id);
    return this.run(run.id);
  }
  async waitForReport(id: string) {
    await expect
      .poll(async () => (await this.run(id)).reportPhase, {
        timeout: Timeouts.report,
      })
      .toBe(RunStatus.ready);
  }
  async tokenStatus(token: string, project: string = TestData.project) {
    return (
      await this.request.get(ApiRoutes.runs(project), {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status();
  }
}
