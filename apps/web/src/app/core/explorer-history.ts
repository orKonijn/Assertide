export interface TestHistory {
  id: string;
  caseId: string;
  status: string;
  duration: number;
  endedAt: string;
  runId: string;
  retries: number;
}
export interface ExplorerView {
  name: string;
  query: string;
  kind: string;
  priority: string;
  sort: string;
  history: string;
  group: string;
  browser: string;
  environment: string;
}
export function readExplorerViews(key: string): ExplorerView[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(values)) {
      return [];
    }
    return values.slice(0, 20).flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') {
        return [];
      }
      const value = item as Record<string, unknown>;
      const keys = [
        'name',
        'query',
        'kind',
        'priority',
        'sort',
        'history',
        'group',
        'browser',
        'environment',
      ] as const;
      if (keys.some((key) => typeof value[key] !== 'string' || String(value[key]).length > 500)) {
        return [];
      }
      if (
        !String(value['name']).trim() ||
        String(value['name']).length > 60 ||
        !['all', 'api', 'ui'].includes(String(value['kind'])) ||
        !['all', 'P0', 'P1', 'P2'].includes(String(value['priority'])) ||
        !/^(id|title|feature|priority)-(asc|desc)$/.test(String(value['sort'])) ||
        !['all', 'never', 'failed'].includes(String(value['history'])) ||
        !['none', 'feature', 'kind', 'suite'].includes(String(value['group'])) ||
        !['chromium', 'firefox', 'webkit'].includes(String(value['browser'])) ||
        !/^[a-z][a-z0-9-]{0,63}$/.test(String(value['environment']))
      ) {
        return [];
      }
      return [
        {
          name: String(value['name']),
          query: String(value['query']),
          kind: String(value['kind']),
          priority: String(value['priority']),
          sort: String(value['sort']),
          history: String(value['history']),
          group: String(value['group']),
          browser: String(value['browser']),
          environment: String(value['environment']),
        },
      ];
    });
  } catch {
    return [];
  }
}
export function typicalDuration(items: TestHistory[]): number | null {
  const values = items
    .filter(
      (item) =>
        ['passed', 'failed', 'timedOut', 'broken'].includes(item.status) &&
        Number.isFinite(item.duration) &&
        item.duration > 0,
    )
    .map((item) => item.duration)
    .sort((a, b) => a - b);
  return values.length >= 3 ? values[Math.floor(values.length / 2)] : null;
}
