import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ParamMap } from '@angular/router';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';

import type { Run } from '../core/api';
import { Api } from '../core/api';
import { Notifications } from '../core/notifications';
import { RunDetail } from './run-detail';

class Stream extends EventTarget {
  public static latest: Stream;
  public onopen = null;
  public onerror = null;
  public constructor() {
    super();
    Stream.latest = this;
  }
  public close(): void {}
}
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const run = (phase: string, historyStream?: string): Run => ({
  id: 'run-1',
  projectId: 'project',
  phase,
  createdAt: '',
  reportPhase: 'pending',
  selection: { testIds: [] },
  historyStream,
});
describe('Run detail response ordering', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });
  function setup(): {
    component: RunDetail;
    pending: {
      promise: Promise<unknown>;
      resolve: (value: unknown) => void;
      reject: (reason: unknown) => void;
    }[];
    params: BehaviorSubject<ParamMap>;
  } {
    vi.stubGlobal('EventSource', Stream);
    const pending: ReturnType<typeof deferred<unknown>>[] = [];
    const params = new BehaviorSubject(convertToParamMap({ id: 'run-1' }));
    const api = {
      identity: signal(null),
      get: vi.fn(() => {
        const response = deferred<unknown>();
        pending.push(response);
        return response.promise;
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Api, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: params, queryParamMap: of(convertToParamMap({})) },
        },
      ],
    });
    const component = TestBed.createComponent(RunDetail).componentInstance;
    return { component, pending, params };
  }
  it('keeps the newest same-run response when responses arrive in reverse order', async () => {
    const { component, pending } = setup();
    const newer = component.load();
    pending[1].resolve(run('completed'));
    await newer;
    pending[0].resolve(run('running'));
    await Promise.resolve();
    expect(component.run()?.phase).toBe('completed');
  });
  it('announces a confirmed failure once across updates and component reloads', async () => {
    const first = setup();
    const failed = { ...run('running'), progress: { passed: 0, failed: 1, other: 0 } };
    first.pending[0].resolve(failed);
    await Promise.resolve();
    expect(TestBed.inject(Notifications).history()).toHaveLength(1);
    const refresh = first.component.load();
    first.pending[1].resolve(failed);
    await refresh;
    expect(TestBed.inject(Notifications).history()).toHaveLength(1);
    TestBed.resetTestingModule();
    const reloaded = setup();
    reloaded.pending[0].resolve(failed);
    await Promise.resolve();
    expect(TestBed.inject(Notifications).history()).toHaveLength(0);
  });
  it('filters live and final outcomes while retaining selected rerun cases', () => {
    const { component } = setup();
    component.toggle('LAB-001');
    component.run.set({
      ...run('running'),
      progress: {
        passed: 1,
        failed: 1,
        other: 0,
        outcomes: [
          { id: 'LAB-001:api', status: 'passed' },
          { id: 'LAB-002:api', status: 'failed' },
        ],
        active: [
          { id: 'UI-001:chromium', title: 'Active', startedAt: '2026-11-09T00:00:00Z', retry: 1 },
        ],
      },
    });
    component.setResultFilter('running');
    expect(component.filteredResults().map((r) => r.id)).toEqual(['UI-001:chromium']);
    component.setResultFilter('failed');
    expect(component.filteredResults().map((r) => r.id)).toEqual(['LAB-002']);
    expect(component.selected()).toEqual(['LAB-001']);
  });
  it('ignores stale history and errors after newer responses', async () => {
    const { component, pending } = setup();
    pending[0].resolve(run('running', 'history'));
    await Promise.resolve();
    const newer = component.load();
    pending[2].resolve(run('completed'));
    await newer;
    pending[1].resolve({ items: [{ runId: 'old', endedAt: '', reportAvailable: true }] });
    await Promise.resolve();
    expect(component.history()).toEqual([]);
    const old = component.load();
    const latest = component.load();
    pending[4].resolve(run('completed'));
    await latest;
    pending[3].reject(new Error('stale error'));
    await old;
    expect(component.error()).toBe('');
  });
  it('invalidates pending responses on route changes and access revocation', async () => {
    const { component, pending, params } = setup();
    params.next(convertToParamMap({ id: 'run-2' }));
    pending[0].resolve(run('completed'));
    await Promise.resolve();
    expect(component.run()).toBeNull();
    Stream.latest.dispatchEvent(new Event('access_revoked'));
    pending[1].resolve(run('running', 'history'));
    await Promise.resolve();
    expect(component.run()).toBeNull();
    expect(component.history()).toEqual([]);
  });
  it('paginates live results, preserves checks and locates deep-linked results', () => {
    const { component, params } = setup();
    const results = Array.from({ length: 23 }, (_, index) => ({
      id: 'case-' + index,
      title: 'Case ' + index,
      status: 'passed',
      duration: index,
    }));
    component.run.set({ ...run('running'), results });
    expect(component.pageResults()).toHaveLength(10);
    component.toggle('case-0');
    component.resultPage.set(3);
    expect(component.pageResults().map((item) => item.id)).toEqual([
      'case-20',
      'case-21',
      'case-22',
    ]);
    component.run.set({
      ...run('running'),
      results: [...results, { id: 'case-23', title: 'New result', status: 'passed', duration: 1 }],
    });
    expect(component.currentResultPage()).toBe(3);
    expect(component.selected()).toEqual(['case-0']);
    component.resultPage.set(null);
    component.focusedResult.set('case-15');
    expect(component.currentResultPage()).toBe(2);
    expect(component.pageResults().some((item) => item.id === 'case-15')).toBe(true);
    component.run.set({ ...run('running'), results: [] });
    expect(component.currentResultPage()).toBe(1);
    expect(component.resultPageCount()).toBe(1);
    params.next(convertToParamMap({ id: 'run-2' }));
    expect(component.selected()).toEqual([]);
    expect(component.resultPage()).toBeNull();
  });
});
