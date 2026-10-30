import { Component, inject, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Api, Run, Suite, Environment, errorMessage } from '../core/api';
import { LoadingState } from '../core/loading-state';
@Component({
  imports: [RouterLink, DatePipe, FormsModule, LoadingState],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">EXECUTION HISTORY</p>
        <h1>Executions</h1>
        <p class="muted">Immutable selections, live progress, and preserved results.</p>
      </div>
      <a class="button" routerLink="/explorer">New execution</a>
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <section class="card">
      <form class="toolbar" (ngSubmit)="apply()">
        <label
          >Phase<select name="phase" aria-label="Phase" [(ngModel)]="phase">
            @for (value of phases; track value) {
              <option [value]="value">{{ value }}</option>
            }
          </select></label
        >
        <label
          >Browser or API<select name="browser" aria-label="Browser or API" [(ngModel)]="browser">
            @for (value of ['all', 'api', 'chromium', 'firefox', 'webkit']; track value) {
              <option>{{ value }}</option>
            }
          </select></label
        >
        <label
          >Contains outcome<select name="outcome" [(ngModel)]="outcome">
            @for (value of ['all', 'passed', 'failed', 'broken', 'skipped']; track value) {
              <option>{{ value }}</option>
            }
          </select></label
        ><label>From (UTC)<input type="date" name="from" [(ngModel)]="from" /></label
        ><label>Through (UTC)<input type="date" name="to" [(ngModel)]="to" /></label>
        <label
          >Suite<select name="suite" [(ngModel)]="suite">
            <option value="">All suites and selections</option>
            @for (item of suites(); track item.id) {
              <option [value]="item.id">{{ item.name }}</option>
            }
          </select></label
        >
        <label
          >Environment<select name="environment" [(ngModel)]="environment">
            <option value="">All environments</option>
            @for (item of environments(); track item.id) {
              <option [value]="item.id">{{ item.name }}</option>
            }
          </select></label
        >
        <button type="submit" [disabled]="loading()">Apply filters</button
        ><button type="button" (click)="load()">Refresh</button>
      </form>
      @if (loading() && !hasLoaded()) {
        <app-loading-state label="Loading history…" />
      } @else {
        <div class="table-wrap">
          <table class="mobile-result-cards" role="table" [attr.aria-busy]="loading()">
            <thead>
              <tr>
                <th [attr.aria-sort]="sortState('id')">
                  <button type="button" (click)="sortBy('id')">Run</button>
                </th>
                <th [attr.aria-sort]="sortState('phase')">
                  <button type="button" (click)="sortBy('phase')">Phase</button>
                </th>
                <th [attr.aria-sort]="sortState('selected')">
                  <button type="button" (click)="sortBy('selected')">Selected</button>
                </th>
                <th [attr.aria-sort]="sortState('createdAt')">
                  <button type="button" (click)="sortBy('createdAt')">Created</button>
                </th>
              </tr>
            </thead>
            <tbody>
              @for (run of sorted(); track run.id) {
                <tr>
                  <td data-label="Run">
                    <a [routerLink]="['/runs', run.id]">{{ run.id.slice(0, 8) }}</a>
                    @if (run.parentRunId) {
                      <br /><span class="muted">Rerun</span>
                    }
                  </td>
                  <td data-label="Phase">
                    <span class="badge">{{ run.phase }}</span>
                  </td>
                  <td data-label="Selected">{{ run.selection.testIds.length }}</td>
                  <td data-label="Created">{{ run.createdAt | date: 'short' }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="4" class="empty">No executions match this filter.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="muted">
          Column buttons sort the loaded executions. Load older executions to include more history.
        </p>
      }
      @if (nextCursor()) {
        <button [disabled]="loading()" (click)="load(true)">Load older executions</button>
      }
    </section>
  `,
})
export class Runs {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly phases = [
    'all',
    'queued',
    'running',
    'completed',
    'canceled',
    'infrastructure_error',
    'timed_out',
  ];
  phase = this.route.snapshot.queryParamMap.get('phase') ?? 'all';
  browser = this.route.snapshot.queryParamMap.get('browser') ?? 'all';
  from = this.route.snapshot.queryParamMap.get('from') ?? '';
  to = this.route.snapshot.queryParamMap.get('to') ?? '';
  suite = this.route.snapshot.queryParamMap.get('suite') ?? '';
  environment = this.route.snapshot.queryParamMap.get('environment') ?? '';
  outcome = this.route.snapshot.queryParamMap.get('outcome') ?? 'all';
  readonly suites = signal<Suite[]>([]);
  readonly environments = signal<Environment[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly runs = signal<Run[]>([]);
  readonly sortKey = signal<'id' | 'phase' | 'selected' | 'createdAt'>('createdAt');
  readonly ascending = signal(false);
  readonly sorted = computed(() =>
    [...this.runs()].sort((a, b) => {
      const key = this.sortKey();
      const order =
        key === 'selected'
          ? a.selection.testIds.length - b.selection.testIds.length
          : a[key].localeCompare(b[key]);
      return (this.ascending() ? 1 : -1) * order;
    }),
  );
  sortBy(key: 'id' | 'phase' | 'selected' | 'createdAt') {
    if (this.sortKey() === key) this.ascending.update((value) => !value);
    else {
      this.sortKey.set(key);
      this.ascending.set(true);
    }
  }
  sortState(key: string) {
    return this.sortKey() === key ? (this.ascending() ? 'ascending' : 'descending') : 'none';
  }
  readonly loading = signal(true);
  readonly hasLoaded = signal(false);
  readonly error = signal('');
  constructor() {
    void this.load();
  }
  async apply() {
    this.loading.set(true);
    this.requestVersion++;
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        phase: this.phase,
        browser: this.browser,
        outcome: this.outcome,
        from: this.from || null,
        to: this.to || null,
        suite: this.suite || null,
        environment: this.environment || null,
      },
      replaceUrl: true,
    });
    await this.load();
  }
  async load(more = false) {
    const version = ++this.requestVersion;
    this.loading.set(true);
    this.error.set('');
    try {
      const query = new URLSearchParams({
        projectId: this.api.projectId(),
        phase: this.phase,
        browser: this.browser,
        outcome: this.outcome,
      });
      if (this.from) query.set('from', this.from);
      if (this.to) query.set('to', this.to);
      if (this.suite) query.set('suite', this.suite);
      if (this.environment) query.set('environment', this.environment);
      if (more && this.nextCursor()) query.set('cursor', this.nextCursor()!);
      const [result, suites, environments] = await Promise.all([
        this.api.get<{ items: Run[]; nextCursor: string | null }>(`/runs?${query}`),
        this.api.get<{ items: Suite[] }>(`/projects/${this.api.projectId()}/suites`),
        this.api.get<{ items: Environment[] }>(`/projects/${this.api.projectId()}/environments`),
      ]);
      if (version !== this.requestVersion) return;
      this.hasLoaded.set(true);
      this.suites.set(suites.items);
      this.environments.set(environments.items);
      this.runs.set(more ? [...this.runs(), ...result.items] : result.items);
      this.nextCursor.set(result.nextCursor);
    } catch (error) {
      if (version === this.requestVersion) this.error.set(errorMessage(error));
    } finally {
      if (version === this.requestVersion) this.loading.set(false);
    }
  }
  private requestVersion = 0;
}
