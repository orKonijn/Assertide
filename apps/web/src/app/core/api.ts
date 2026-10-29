import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, catchError, throwError } from 'rxjs';

export interface Identity {
  subject: string;
  name: string;
  role: string;
  projectIds: string[];
}
export interface Project {
  id: string;
  name: string;
  description: string;
  version: number;
}
export interface TestCase {
  id: string;
  title: string;
  feature: string;
  kind: string;
  priority: string;
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
}
export interface Run {
  id: string;
  projectId: string;
  phase: string;
  createdAt: string;
  reportPhase: string;
  selection: { testIds: string[] };
  results?: CaseResult[];
  parentRunId?: string;
  cancelRequested?: boolean;
  source?: { revision: string };
  logTail?: string;
  queueReason?: string;
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
  attempts?: { status: string; duration: number; error: string }[];
}
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (body && typeof body === 'object' && 'title' in body && typeof body.title === 'string')
      return body.title;
    return error.status === 0
      ? 'The service is unavailable. Please retry.'
      : `Request failed (${error.status}).`;
  }
  return 'The request could not be completed.';
}
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);
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
    );
  }
  patch<T>(path: string, body: unknown, version: number) {
    return firstValueFrom(
      this.http.patch<T>(`/v1${path}`, body, { headers: { 'If-Match': `"${version}"` } }).pipe(
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 401) this.identity.set(null);
          return throwError(() => error);
        }),
      ),
    );
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
  ) {
    const catalogRevision =
      revision ??
      (await this.get<{ revision: string }>(`/projects/${this.projectId()}/catalog`)).revision;
    return this.post<Run>(
      `/projects/${this.projectId()}/runs`,
      {
        catalogRevision,
        selection: { testIds },
        environmentId: 'local-lab',
        browserProjects: testIds.some((id) => id.startsWith('UI-')) ? [browser] : [],
        workers,
        retries,
        headed: false,
        video: 'off',
      },
      key,
    );
  }
}
