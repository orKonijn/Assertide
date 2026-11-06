import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { ApiRoutes } from '../types/routes';
import { TestData } from '../types/test-data';
import type { PlatformApi } from './platform-api.utils';

interface EnvironmentPolicy {
  id: string;
  name: string;
  enabled: boolean;
  apiUrl: string;
  browserUrl: string;
  maxWorkers: number;
  maxRetries: number;
  browsers: string[];
  allowVideo: boolean;
  allowHeaded: boolean;
  version: number;
}

export async function configureLaunchEnvironments(
  api: PlatformApi,
  project: string,
  enabled = true,
): Promise<void> {
  const path = `/v1/projects/${project}/environments`;
  const { items } = await api.get<{ items: EnvironmentPolicy[] }>(path);
  const original = items.find((item) => item.id === TestData.environment);
  if (!original) {
    throw new Error('Missing fixture environment');
  }
  const { version, ...policy } = original;
  for (const environment of [
    { ...policy, enabled: false },
    { ...policy, id: 'qa-primary', name: 'QA primary', enabled },
    { ...policy, id: 'qa-alternate', name: 'QA alternate', enabled },
  ]) {
    const response = await api.request.post(path, {
      headers: {
        Origin: TestData.origin,
        'If-Match': `"${environment.id === policy.id ? version : 0}"`,
      },
      data: environment,
    });
    expect(response.ok(), 'environment prerequisite accepted').toBe(true);
  }
}

export class PaginatedHistoryFixture {
  public readonly requests: URLSearchParams[] = [];
  public failNextPage = false;
  public readonly rows;
  public constructor(project: string) {
    this.rows = Array.from({ length: 101 }, (_, index) => ({
      id: `${String(index + 1).padStart(8, '0')}-0000-4000-8000-000000000001`,
      projectId: project,
      phase: index < 50 ? 'completed' : 'canceled',
      reportPhase: 'ready',
      reportExpiresAt: '2027-01-01T00:00:00Z',
      createdAt: new Date(Date.UTC(2026, 10, 7) - index * 60000).toISOString(),
      selection: { testIds: [index < 50 ? 'UI-001' : 'LAB-001'] },
      artifacts: [],
    }));
  }
  public async install(page: Page): Promise<void> {
    await page.route(`**${ApiRoutes.runs(this.rows[0]!.projectId)}*`, async (route) => {
      const query = new URL(route.request().url()).searchParams;
      this.requests.push(query);
      if (this.failNextPage && query.has('cursor')) {
        this.failNextPage = false;
        await route.fulfill({
          status: 503,
          json: { title: 'Controlled temporary history failure' },
        });
        return;
      }
      const filtered = this.rows.filter(
        (run) =>
          (!query.has('phase') ||
            query.get('phase') === 'all' ||
            run.phase === query.get('phase')) &&
          (query.get('browser') !== 'api' || run.selection.testIds.includes('LAB-001')),
      );
      const cursor = query.get('cursor');
      const offset = cursor ? filtered.findIndex((run) => run.id === cursor) + 1 : 0;
      const items = filtered.slice(offset, offset + 50);
      await route.fulfill({
        json: { items, nextCursor: offset + 50 < filtered.length ? items.at(-1)!.id : null },
      });
    });
  }
}
