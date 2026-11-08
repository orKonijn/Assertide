import type { Run } from './api';
import { progressCounts } from './run-progress';

const run: Run = {
  id: 'test',
  projectId: 'test',
  phase: 'running',
  createdAt: '',
  reportPhase: 'pending',
  selection: { testIds: ['LAB-001', 'UI-001', 'UI-002'] },
  config: {
    environmentId: 'local-lab',
    workers: 2,
    retries: 2,
    video: 'off',
    headed: false,
    browserProjects: ['chromium', 'firefox'],
  },
};
describe('Run progress outcomes', () => {
  it('counts browser executions separately and keeps unfinished tests pending', () => {
    expect(progressCounts({ ...run, progress: { passed: 2, failed: 1, other: 0 } })).toEqual({
      passed: 2,
      failed: 1,
      other: 0,
      total: 5,
      remaining: 2,
    });
  });
  it('uses final outcomes rather than retry attempts or stale live counters', () => {
    const results = [
      {
        id: 'LAB-001',
        title: '',
        status: 'passed',
        duration: 10,
        attempts: [
          { status: 'failed', duration: 5, error: '' },
          { status: 'passed', duration: 5, error: '' },
        ],
      },
      { id: 'UI-001:chromium', title: '', status: 'timedOut', duration: 0 },
      { id: 'UI-001:firefox', title: '', status: 'failed', expectedFailure: true, duration: 0 },
      { id: 'UI-002:chromium', title: '', status: 'canceled', duration: 0 },
      { id: 'UI-002:firefox', title: '', status: 'skipped', duration: 0 },
    ];
    expect(
      progressCounts({ ...run, results, progress: { passed: 0, failed: 0, other: 0 } }),
    ).toEqual({ passed: 2, failed: 1, other: 2, total: 5, remaining: 0 });
  });
  it('handles an empty queued selection without invalid ring proportions', () => {
    expect(progressCounts({ ...run, selection: { testIds: [] } })).toEqual({
      passed: 0,
      failed: 0,
      other: 0,
      total: 0,
      remaining: 0,
    });
  });
});
