import { randomUUID } from 'node:crypto';

import { type APIRequestContext, expect } from '@playwright/test';

import type { CatalogCase, Project, RunRecord, SuiteInput } from '../types/platform';
import { ApiRoutes } from '../types/routes';
import { RunStatus, TestData, Timeouts } from '../types/test-data';
export class PlatformApi {
  public constructor(public readonly request: APIRequestContext) {}
  public async get<T>(url: string): Promise<T> {
    const response = await this.request.get(url);
    if (!response.ok()) {
      throw new Error(`Setup read failed: HTTP ${response.status()}`);
    }
    return response.json() as Promise<T>;
  }
  public async post<T>(url: string, data: unknown): Promise<T> {
    const response = await this.request.post(url, {
      headers: { Origin: TestData.origin, 'Idempotency-Key': randomUUID() },
      data,
    });
    if (!response.ok()) {
      throw new Error(`Setup write failed: HTTP ${response.status()}`);
    }
    return response.json() as Promise<T>;
  }
  public createProject(name: string): Promise<Project> {
    return this.post<Project>(ApiRoutes.projects, {
      name,
      description: 'Independent UI regression project',
    });
  }
  public catalog(
    project: string = TestData.project,
  ): Promise<{ revision: string; items: CatalogCase[] }> {
    return this.get<{ revision: string; items: CatalogCase[] }>(ApiRoutes.catalog(project));
  }
  public run(id: string): Promise<RunRecord> {
    return this.get<RunRecord>(ApiRoutes.run(id));
  }
  public createSuite(project: string, input: SuiteInput): Promise<{ id: string }> {
    return this.post<{ id: string }>(ApiRoutes.suites(project), {
      description: '',
      owner: 'QA Automation',
      tags: [],
      ...input,
    });
  }
  public async setEnabled(
    project: string,
    ids: readonly string[],
    enabled: boolean,
  ): Promise<void> {
    for (const item of (await this.catalog(project)).items.filter((item) =>
      ids.includes(item.id),
    )) {
      const response = await this.request.patch(ApiRoutes.metadata(project, item.id), {
        headers: { Origin: TestData.origin, 'If-Match': `"${item.version}"` },
        data: {
          feature: item.feature,
          module: item.module,
          owner: item.owner,
          tags: item.tags,
          priority: item.priority,
          enabled,
          quarantined: item.quarantined ?? false,
        },
      });
      if (!response.ok()) {
        throw new Error(`Metadata setup failed: HTTP ${response.status()}`);
      }
    }
  }
  public async launch(
    ids: readonly string[],
    project: string = TestData.project,
  ): Promise<RunRecord> {
    const catalog = await this.catalog(project);
    return this.post<RunRecord>(ApiRoutes.launch(project), {
      catalogRevision: catalog.revision,
      selection: { testIds: ids },
      environmentId: TestData.environment,
      browserProjects: ids.some((id) => id.startsWith('UI-')) ? ['chromium'] : [],
      workers: 1,
      retries: 0,
      headed: false,
      video: 'off',
    });
  }
  public async completed(
    ids: readonly string[],
    project: string = TestData.project,
  ): Promise<RunRecord> {
    const run = await this.launch(ids, project);
    return this.waitForCompletion(run.id);
  }
  public async waitForCompletion(id: string): Promise<RunRecord> {
    await expect
      .poll(async () => (await this.run(id)).phase, {
        timeout: Timeouts.execution,
      })
      .toBe(RunStatus.completed);
    return this.run(id);
  }
  public async readyReport(
    ids: readonly string[],
    project: string = TestData.project,
  ): Promise<RunRecord> {
    const run = await this.completed(ids, project);
    await this.waitForReport(run.id);
    return this.run(run.id);
  }
  public async waitForReport(id: string): Promise<void> {
    await expect
      .poll(async () => (await this.run(id)).reportPhase, {
        timeout: Timeouts.report,
      })
      .toBe(RunStatus.ready);
  }
  public async tokenStatus(token: string, project: string = TestData.project): Promise<number> {
    return (
      await this.request.get(ApiRoutes.runs(project), {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status();
  }
}
