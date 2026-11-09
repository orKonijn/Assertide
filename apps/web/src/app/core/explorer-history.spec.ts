import type { TestHistory } from './explorer-history';
import { readExplorerViews, typicalDuration } from './explorer-history';
describe('Explorer history', () => {
  afterEach(() => localStorage.clear());
  it('requires three measured outcomes and excludes skipped samples', () => {
    const sample = (duration: number, status = 'passed'): TestHistory => ({
      id: 'LAB-001',
      caseId: 'LAB-001',
      status,
      duration,
      endedAt: '',
      runId: 'run',
      retries: 0,
    });
    expect(typicalDuration([sample(100), sample(900), sample(0, 'skipped')])).toBeNull();
    expect(typicalDuration([sample(0, 'broken'), sample(0, 'failed'), sample(100)])).toBeNull();
    expect(typicalDuration([sample(100), sample(900), sample(200)])).toBe(200);
  });
  it('rejects malformed or unsupported saved views', () => {
    const view = {
      name: 'Smoke',
      query: 'smoke',
      kind: 'all',
      priority: 'P0',
      sort: 'id-asc',
      history: 'never',
      group: 'feature',
      browser: 'chromium',
      environment: 'local-lab',
    };
    localStorage.setItem(
      'views',
      JSON.stringify([view, { ...view, browser: 'unsupported' }, { ...view, name: '' }]),
    );
    expect(readExplorerViews('views')).toEqual([view]);
    localStorage.setItem('views', 'broken');
    expect(readExplorerViews('views')).toEqual([]);
  });
});
