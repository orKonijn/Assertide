import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ParamMap } from '@angular/router';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';

import type { Run } from '../core/api';
import { Api } from '../core/api';
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
});
