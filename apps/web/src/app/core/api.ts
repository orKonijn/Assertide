import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, catchError, throwError } from 'rxjs';
import { Notifications } from './notifications';

export interface Identity {
  subject: string;
  name: string;
  role: string;
  projectIds: string[];
  sessionExpiresAt?: string;
}
export interface Project {
  id: string;
  name: string;
  description: string;
  version: number;
}
export interface Environment {
  id: string;
  name: string;
  version: number;
  enabled: boolean;
  apiUrl: string;
  browserUrl: string;
  maxWorkers: number;
  maxRetries: number;
  browsers: string[];
  allowVideo: boolean;
  allowHeaded: boolean;
  passwordRef?: { id: string; version: number };
}
export interface TestCase {
  id: string;
  title: string;
  feature: string;
  kind: string;
  priority: string;
  enabled: boolean;
  version: number;
  owner: string;
  module: string;
  tags: string[];
  file?: string;
  line?: number;
  projects?: string[];
}
export interface Suite {
  id: string;
  name: string;
  description: string;
  testIds: string[];
  version: number;
  owner: string;
  tags: string[];
  priority?: string;
}
export interface Run {
  id: string;
  projectId: string;
  phase: string;
  createdAt: string;
  reportPhase: string;
  reportExpiresAt?: string;
  reportDiagnostic?: string;
  historyStream?: string;
  rawExpiredAt?: string;
  rawUnavailableReason?: string;
  selection: { testIds: string[] };
  results?: CaseResult[];
  parentRunId?: string;
  cancelRequested?: boolean;
  source?: { revision: string };
  logTail?: string;
  queueReason?: string;
  workerImage?: string;
  toolchain?: {
    node: string;
    platform: string;
    architecture: string;
    playwright: string;
    allure: string;
    allureIntegration: string;
    browserBuilds: { name: string; revision: string; version?: string }[];
  };
  artifacts?: {
    id: string;
    resultId: string;
    attempt: number;
    name: string;
    createdAt: string;
    expiresAt: string;
    redactionPolicy: string;
    unavailableReason?: string;
    exchange?: { method: string; path: string; status?: number; durationMs: number };
  }[];
}
export interface CaseResult {
  id: string;
  title: string;
  status: string;
  duration: number;
  error?: string;
  expectedFailure?: boolean;
  category?: string;
  categoryRuleVersion?: number;
  assertion?: { expected: string; actual: string };
  attempts?: { status: string; duration: number; error: string; steps?: ResultStep[] }[];
}
export interface ResultStep {
  title: string;
  category: string;
  duration: number;
  error?: string;
  steps: ResultStep[];
}
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const id = error.headers.get('X-Request-ID');
    const reference = id && /^[a-f0-9-]{36}$/.test(id) ? ` Reference: ${id}.` : '';
    const body: unknown = error.error;
    if (body && typeof body === 'object' && 'title' in body && typeof body.title === 'string')
      return body.title + reference;
    return error.status === 0
      ? 'The service is unavailable. Please retry.'
      : `Request failed (${error.status}).${reference}`;
  }
  return 'The request could not be completed.';
}
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);
  private readonly notices = inject(Notifications);
  readonly identity = signal<Identity | null>(null);
  readonly projects = signal<Project[]>([]);
  readonly projectId = signal('00000000-0000-4000-8000-000000000010');
  async loadIdentity() {
    const identity = await firstValueFrom(this.http.get<Identity>('/v1/me'));
    this.identity.set(identity);
    const selected = localStorage.getItem('assertide-project');
    this.projectId.set(
      selected && identity.projectIds.includes(selected)
        ? selected
        : (identity.projectIds[0] ?? ''),
    );
    this.projects.set((await this.get<{ items: Project[] }>('/projects')).items);
  }
  selectProject(id: string) {
    if (!this.identity()?.projectIds.includes(id)) return;
    localStorage.setItem('assertide-project', id);
    this.projectId.set(id);
  }
  get<T>(path: string) {
    return firstValueFrom(
      this.http.get<T>(`/v1${path}`).pipe(
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 401) this.identity.set(null);
          return throwError(() => error);
        }),
      ),
    );
  }
  post<T>(path: string, body: unknown, key?: string, version?: number) {
    return firstValueFrom(
      this.http
        .post<T>(`/v1${path}`, body, {
          headers: {
            ...(key ? { 'Idempotency-Key': key } : {}),
            ...(version !== undefined ? { 'If-Match': `"${version}"` } : {}),
          },
        })
        .pipe(
          catchError((error: unknown) => {
            if (error instanceof HttpErrorResponse && error.status === 401) this.identity.set(null);
            return throwError(() => error);
          }),
        ),
    ).then((result) => {
      this.notices.success(
        path.endsWith('/runs') || path.endsWith('/reruns')
          ? 'Execution requested.'
          : path.endsWith('/cancel')
            ? 'Cancellation requested.'
            : path.endsWith('/report-rebuilds')
              ? 'Report rebuild requested.'
              : 'Changes saved.',
      );
      return result;
    });
  }
  patch<T>(path: string, body: unknown, version: number) {
    return firstValueFrom(
      this.http.patch<T>(`/v1${path}`, body, { headers: { 'If-Match': `"${version}"` } }).pipe(
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 401) this.identity.set(null);
          return throwError(() => error);
        }),
      ),
    ).then((result) => {
      this.notices.success('Changes saved.');
      return result;
    });
  }
  async logout() {
    await firstValueFrom(this.http.post('/auth/logout', {}));
    this.identity.set(null);
    location.assign('/');
  }
  async launch(
    testIds: string[],
    key: string,
    workers: number,
    retries: number,
    browser = 'chromium',
    revision?: string,
    video: 'off' | 'retain-on-failure' = 'off',
    environmentId = 'local-lab',
    headed = false,
    suite?: { id: string; version: number },
  ) {
    const catalogRevision =
      revision ??
      (await this.get<{ revision: string }>(`/projects/${this.projectId()}/catalog`)).revision;
    return this.post<Run>(
      `/projects/${this.projectId()}/runs`,
      {
        catalogRevision,
        selection: { testIds },
        ...(suite ? { suite } : {}),
        environmentId,
        browserProjects: testIds.some((id) => id.startsWith('UI-')) ? [browser] : [],
        workers,
        retries,
        headed,
        video,
      },
      key,
    );
  }
}
