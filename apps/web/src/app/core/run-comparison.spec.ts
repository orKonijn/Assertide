import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import type { Run } from './api';
import { Api } from './api';
import { failedResult, RunComparison } from './run-comparison';
describe('Compatible run comparison', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('handles expected failures without hiding timeouts or classifying skipped tests as failures', () => {
    const result = { id: 'case', title: '', duration: 0, expectedFailure: true };
    expect(failedResult({ ...result, status: 'failed' })).toBe(false);
    expect(failedResult({ ...result, status: 'passed' })).toBe(true);
    expect(failedResult({ ...result, status: 'timedOut' })).toBe(true);
    expect(failedResult({ ...result, status: 'skipped' })).toBe(false);
  });
  it('compares final outcomes and durations without refetching on each live update', async () => {
    const get = vi.fn(async () => ({
      previous: {
        id: 'prior',
        results: [
          { id: 'a', status: 'passed', duration: 2000 },
          { id: 'b', status: 'failed', duration: 2000 },
        ],
      },
      reason: 'Compatible',
    }));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Api, useValue: { get } }],
    });
    const fixture = TestBed.createComponent(RunComparison);
    const run: Run = {
      id: 'run',
      projectId: 'project',
      phase: 'running',
      reportPhase: 'pending',
      createdAt: '',
      selection: { testIds: ['a', 'b'] },
    };
    fixture.componentRef.setInput('run', run);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentRef.setInput('run', {
      ...run,
      phase: 'completed',
      results: [
        { id: 'a', status: 'failed', duration: 4000 },
        { id: 'b', status: 'passed', duration: 2000 },
      ],
    });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(get).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.changes().map((c) => c.message)).toEqual([
      'New failure · Slower by 100% (2000 → 4000 ms)',
      'Recovered',
    ]);
  });
});
