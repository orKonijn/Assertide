import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

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
}
export interface TestCase {
  id: string;
  title: string;
  feature: string;
  kind: string;
  priority: string;
  tags: string[];
}
export interface Suite {
  id: string;
  name: string;
  description: string;
  testIds: string[];
  version: number;
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
}
export interface CaseResult {
  id: string;
  title: string;
  status: string;
  duration: number;
  error?: string;
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
  readonly projectId = signal('00000000-0000-4000-8000-000000000010');
  async loadIdentity() {
    const identity = await firstValueFrom(this.http.get<Identity>('/v1/me'));
    this.identity.set(identity);
    if (identity.projectIds[0]) this.projectId.set(identity.projectIds[0]);
  }
  get<T>(path: string) {
    return firstValueFrom(this.http.get<T>(`/v1${path}`));
  }
  post<T>(path: string, body: unknown, key?: string) {
    return firstValueFrom(
      this.http.post<T>(`/v1${path}`, body, { headers: key ? { 'Idempotency-Key': key } : {} }),
    );
  }
  async logout() {
    await firstValueFrom(this.http.post('/auth/logout', {}));
    this.identity.set(null);
    location.assign('/');
  }
  launch(testIds: string[], key: string, workers: number, retries: number) {
    return this.post<Run>(
      `/projects/${this.projectId()}/runs`,
      {
        catalogRevision: 'local-lab-v1',
        selection: { testIds },
        environmentId: 'local-lab',
        browserProjects: [],
        workers,
        retries,
        headed: false,
        video: 'off',
      },
      key,
    );
  }
}
