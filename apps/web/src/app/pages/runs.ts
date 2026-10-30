import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import type { Environment, Run, Suite } from '../core/api';
import { Api, errorMessage } from '../core/api';
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
      <form class="toolbar execution-filters" (ngSubmit)="apply()">
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
        <div class="filter-actions">
          <button type="submit" [disabled]="loading()">Apply filters</button>
          <button type="button" [disabled]="loading()" (click)="load()">Refresh</button>
        </div>
      </form>
      @if (loading() && !hasLoaded()) {
        <app-loading-state label="Loading history…" />
      } @else {
        <div class="table-wrap">
          <table
            class="mobile-result-cards history-table"
            role="table"
            [attr.aria-busy]="loading()"
          >
            <thead>
              <tr>
                <th [attr.aria-sort]="sortState('id')">
                  <button type="button" (click)="sortBy('id')">
                    Run<span class="sort-indicator" aria-hidden="true"></span>
                  </button>
                </th>
                <th [attr.aria-sort]="sortState('phase')">
                  <button type="button" (click)="sortBy('phase')">
                    Phase<span class="sort-indicator" aria-hidden="true"></span>
                  </button>
                </th>
                <th [attr.aria-sort]="sortState('selected')">
                  <button type="button" (click)="sortBy('selected')">
                    Selected<span class="sort-indicator" aria-hidden="true"></span>
                  </button>
                </th>
                <th [attr.aria-sort]="sortState('createdAt')">
                  <button type="button" (click)="sortBy('createdAt')">
                    Created<span class="sort-indicator" aria-hidden="true"></span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              @for (run of sorted(); track run.id) {
                <tr>
                  <td data-label="Run">
                    <div class="run-identity">
                      <a class="run-reference" [routerLink]="['/runs', run.id]"
                        >{{ run.id.slice(0, 8) }} <span aria-hidden="true">↗</span></a
                      >
                      @if (run.parentRunId) {
                        <span class="rerun-label" title="Repeated execution">↻ Rerun</span>
                      }
                    </div>
                  </td>
                  <td data-label="Phase">
                    <span class="badge phase-badge" [attr.data-phase]="run.phase">{{
                      run.phase
                    }}</span>
                  </td>
                  <td data-label="Selected">
                    <span class="run-count">{{ run.selection.testIds.length }}</span>
                  </td>
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
  public readonly phases = [
    'all',
    'queued',
    'running',
    'completed',
    'canceled',
    'infrastructure_error',
    'timed_out',
  ];
  public phase = this.route.snapshot.queryParamMap.get('phase') ?? 'all';
  public browser = this.route.snapshot.queryParamMap.get('browser') ?? 'all';
  public from = this.route.snapshot.queryParamMap.get('from') ?? '';
  public to = this.route.snapshot.queryParamMap.get('to') ?? '';
  public suite = this.route.snapshot.queryParamMap.get('suite') ?? '';
  public environment = this.route.snapshot.queryParamMap.get('environment') ?? '';
  public outcome = this.route.snapshot.queryParamMap.get('outcome') ?? 'all';
  public readonly suites = signal<Suite[]>([]);
  public readonly environments = signal<Environment[]>([]);
  public readonly nextCursor = signal<string | null>(null);
  public readonly runs = signal<Run[]>([]);
  public readonly sortKey = signal<'id' | 'phase' | 'selected' | 'createdAt'>('createdAt');
  public readonly ascending = signal(false);
  public readonly sorted = computed(() =>
    [...this.runs()].sort((a, b) => {
      const key = this.sortKey();
      const order =
        key === 'selected'
          ? a.selection.testIds.length - b.selection.testIds.length
          : a[key].localeCompare(b[key]);
      return (this.ascending() ? 1 : -1) * order;
    }),
  );
  public readonly loading = signal(true);
  public readonly hasLoaded = signal(false);
  public readonly error = signal('');
  private requestVersion = 0;
  public constructor() {
    void this.load();
  }
  public sortBy(key: 'id' | 'phase' | 'selected' | 'createdAt'): void {
    if (this.sortKey() === key) {
      this.ascending.update((value) => !value);
    } else {
      this.sortKey.set(key);
      this.ascending.set(true);
    }
  }
  public sortState(key: string): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) {
      return 'none';
    }
    return this.ascending() ? 'ascending' : 'descending';
  }
  public async apply(): Promise<void> {
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
  public async load(more = false): Promise<void> {
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
      if (this.from) {
        query.set('from', this.from);
      }
      if (this.to) {
        query.set('to', this.to);
      }
      if (this.suite) {
        query.set('suite', this.suite);
      }
      if (this.environment) {
        query.set('environment', this.environment);
      }
      if (more && this.nextCursor()) {
        query.set('cursor', this.nextCursor()!);
      }
      const [result, suites, environments] = await Promise.all([
        this.api.get<{ items: Run[]; nextCursor: string | null }>(`/runs?${query}`),
        this.api.get<{ items: Suite[] }>(`/projects/${this.api.projectId()}/suites`),
        this.api.get<{ items: Environment[] }>(`/projects/${this.api.projectId()}/environments`),
      ]);
      if (version !== this.requestVersion) {
        return;
      }
      this.hasLoaded.set(true);
      this.suites.set(suites.items);
      this.environments.set(environments.items);
      this.runs.set(more ? [...this.runs(), ...result.items] : result.items);
      this.nextCursor.set(result.nextCursor);
    } catch (error) {
      if (version === this.requestVersion) {
        this.error.set(errorMessage(error));
      }
    } finally {
      if (version === this.requestVersion) {
        this.loading.set(false);
      }
    }
  }
}
