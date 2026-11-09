import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import type { Run } from '../core/api';
import { Api } from '../core/api';
import { ApiWorkspace } from './api-workspace';
describe('API workspace live refresh', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  it('polls active runs, preserves evidence and stops after completion', async () => {
    vi.useFakeTimers();
    const run: Run = {
      id: 'run',
      projectId: 'project',
      phase: 'running',
      createdAt: '',
      reportPhase: 'pending',
      selection: { testIds: ['LAB-001'] },
    };
    const get = vi.fn(async (path: string): Promise<unknown> =>
      path === '/runs/run' ? { ...run, phase: 'completed', artifacts: [] } : { items: [] },
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Api, useValue: { get, projectId: () => 'project', identity: signal(null) } },
      ],
    });
    const component = TestBed.createComponent(ApiWorkspace).componentInstance;
    await vi.advanceTimersByTimeAsync(0);
    component.selectedRun.set(run);
    component.runs.set([run]);
    component.evidence.set('kept');
    component.selectedArtifact.set('artifact');
    await vi.advanceTimersByTimeAsync(3000);
    expect(component.selectedRun()?.phase).toBe('completed');
    expect(component.evidence()).toBe('kept');
    expect(component.selectedArtifact()).toBe('artifact');
    const calls = get.mock.calls.length;
    await vi.advanceTimersByTimeAsync(6000);
    expect(get.mock.calls.length).toBe(calls);
  });
  it('ignores an old refresh after changing executions', async () => {
    let complete!: (run: Run) => void;
    const run: Run = {
      id: 'old',
      projectId: 'project',
      phase: 'running',
      createdAt: '',
      reportPhase: 'pending',
      selection: { testIds: [] },
    };
    const get = vi.fn((path: string): Promise<unknown> =>
      path === '/runs/old'
        ? new Promise<Run>((resolve) => {
            complete = resolve;
          })
        : Promise.resolve({ items: [] }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Api, useValue: { get, projectId: () => 'project', identity: signal(null) } },
      ],
    });
    const component = TestBed.createComponent(ApiWorkspace).componentInstance;
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    component.selectedRun.set(run);
    const pending = component.refreshSelected();
    component.choose('missing');
    complete({ ...run, phase: 'completed' });
    await pending;
    expect(component.selectedRun()).toBeNull();
  });
});
