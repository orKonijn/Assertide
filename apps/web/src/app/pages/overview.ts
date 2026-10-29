import { Component, inject, signal, computed } from '@angular/core';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TrendChart } from '../core/trend-chart';
import { Api, Run, errorMessage } from '../core/api';
import { PercentPipe, DatePipe, DecimalPipe } from '@angular/common';
interface Analytics {
  executed: number;
  excluded: number;
  finalPassRate: number | null;
  firstAttemptPassRate: number | null;
  recoveredFlakyRate: number | null;
  dataAsOf: string;
  runCount: number;
  failed: number;
  broken: number;
  duration: { averageMs: number | null; p95Ms: number | null; samples: number };
  apiLatency: { p95Ms: number | null; samples: number; smallSample: boolean };
  trends: {
    day: string;
    executed: number;
    passed: number;
    failed: number;
    broken: number;
    finalPassRate: number | null;
  }[];
  browsers: {
    name: string;
    executed: number;
    passed: number;
    failed: number;
    broken: number;
    finalPassRate: number | null;
  }[];
  failures: { caseId: string; count: number }[];
}
@Component({
  imports: [RouterLink, PercentPipe, DatePipe, DecimalPipe, FormsModule, TrendChart],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">WORKSPACE OVERVIEW</p>
        <h1>Quality at a glance</h1>
        <p class="muted">Historical outcomes and live activity, clearly separated.</p>
      </div>
      <a class="button" routerLink="/explorer">New execution</a>
    </header>
    <form class="card actions" (ngSubmit)="filter()">
      <label
        >History window<select aria-label="History window" name="days" [(ngModel)]="days">
          <option [ngValue]="7">7 days</option>
          <option [ngValue]="30">30 days</option>
          <option [ngValue]="90">90 days</option>
        </select></label
      >
      <label
        >Execution project<select
          aria-label="Execution project"
          name="browser"
          [(ngModel)]="browser"
        >
          <option value="all">All browsers and API</option>
          <option value="api">API (no browser)</option>
          <option value="chromium">Chromium</option>
          <option value="firefox">Firefox</option>
          <option value="webkit">WebKit</option>
        </select></label
      >
      <button type="submit" [disabled]="loading()">Apply filters</button>
    </form>
    @if (error()) {
      <p class="error" role="alert">{{ error() }} <button (click)="load()">Retry</button></p>
    }
    @if (loading()) {
      <p role="status">Loading executions…</p>
    } @else {
      <div class="grid">
        <section class="card">
          <h2>Completed runs</h2>
          <div class="metric">{{ analytics()?.runCount ?? 0 }}</div>
          <p class="muted">Completed runs in the selected history window</p>
        </section>
        <section class="card">
          <h2>Live runs</h2>
          <div class="metric">{{ live().length }}</div>
          <p class="muted">Excluded from historical metrics</p>
        </section>
        <section class="card">
          <h2>Failed results</h2>
          <div class="metric">{{ (analytics()?.failed ?? 0) + (analytics()?.broken ?? 0) }}</div>
          <p class="muted">Failed or broken test instances</p>
        </section>
      </div>
      @if (analytics(); as metrics) {
        <section class="card">
          <h2>Last {{ days }} days</h2>
          <p class="muted">
            Data as of {{ metrics.dataAsOf | date: 'medium' }} · {{ metrics.executed }} executed
            instances · {{ metrics.excluded }} excluded
          </p>
          <div class="grid">
            <div>
              <h3>Final pass rate</h3>
              <p class="metric">
                {{
                  metrics.finalPassRate === null ? '—' : (metrics.finalPassRate | percent: '1.1-1')
                }}
              </p>
              <p>Final passed / executed</p>
            </div>
            <div>
              <h3>First-attempt pass rate</h3>
              <p class="metric">
                {{
                  metrics.firstAttemptPassRate === null
                    ? '—'
                    : (metrics.firstAttemptPassRate | percent: '1.1-1')
                }}
              </p>
              <p>First-attempt passed / executed</p>
            </div>
            <div>
              <h3>Recovered after retry</h3>
              <p class="metric">
                {{
                  metrics.recoveredFlakyRate === null
                    ? '—'
                    : (metrics.recoveredFlakyRate | percent: '1.1-1')
                }}
              </p>
              <p>Passed after an earlier failure / executed</p>
            </div>
          </div>
          <p class="muted">
            Executed = passed + failed + broken. Skipped, canceled and incomplete results are
            excluded. Live runs never enter these figures.
          </p>
        </section>
        <div class="grid">
          <section class="card">
            <h2>Average run duration</h2>
            <p class="metric">
              {{
                metrics.duration.averageMs === null
                  ? '—'
                  : (metrics.duration.averageMs / 1000 | number: '1.1-1')
              }}
              <small>seconds</small>
            </p>
            <p class="muted">
              Wall-clock duration / {{ metrics.duration.samples }} completed runs with timestamps;
              includes matching mixed runs.
            </p>
          </section>
          <section class="card">
            <h2>API request p95</h2>
            <p class="metric">
              {{
                metrics.apiLatency.p95Ms === null
                  ? '—'
                  : (metrics.apiLatency.p95Ms | number: '1.1-1')
              }}
              <small>ms</small>
            </p>
            <p class="muted">
              Nearest-rank p95 · {{ metrics.apiLatency.samples }} recorded non-authentication
              exchanges, including failures.
            </p>
            @if (metrics.apiLatency.smallSample) {
              <p>Small sample: fewer than 30 requests.</p>
            }
          </section>
        </div>
        <section class="card">
          <h2>Daily reliability</h2>
          @if (metrics.trends.length) {
            <app-trend-chart [points]="metrics.trends" />
          }
          <details>
            <summary>Show chart data and denominators</summary>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date (UTC)</th>
                    <th>Passed</th>
                    <th>Failed/broken</th>
                    <th>Executed</th>
                    <th>Final pass rate</th>
                  </tr>
                </thead>
                <tbody>
                  @for (point of metrics.trends; track point.day) {
                    <tr>
                      <td>{{ point.day }}</td>
                      <td>{{ point.passed }}</td>
                      <td>{{ point.failed + point.broken }}</td>
                      <td>{{ point.executed }}</td>
                      <td>
                        {{
                          point.finalPassRate === null
                            ? '—'
                            : (point.finalPassRate | percent: '1.1-1')
                        }}
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="5">No completed results match these filters.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </details>
        </section>
        <div class="grid">
          <section class="card">
            <h2>Browser and API breakdown</h2>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Executed</th>
                    <th>Final pass rate</th>
                  </tr>
                </thead>
                <tbody>
                  @for (group of metrics.browsers; track group.name) {
                    <tr>
                      <td>{{ group.name === 'api' ? 'API (no browser)' : group.name }}</td>
                      <td>
                        {{ group.executed }}{{ group.executed < 30 ? ' · small sample' : '' }}
                      </td>
                      <td>
                        {{
                          group.finalPassRate === null
                            ? '—'
                            : (group.finalPassRate | percent: '1.1-1')
                        }}
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="3">No matching results.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="muted">
              Passed / executed in each project. API cases are never assigned to Chromium.
            </p>
          </section>
          <section class="card">
            <h2>Most frequent failures</h2>
            @for (failure of metrics.failures; track failure.caseId) {
              <p>
                <a routerLink="/explorer" [queryParams]="{ query: failure.caseId }">{{
                  failure.caseId
                }}</a>
                · {{ failure.count }} failed/broken instances
              </p>
            } @empty {
              <p class="empty">No failed results in this history window.</p>
            }
          </section>
        </div>
      }
      <section class="card">
        <h2>Live activity</h2>
        @for (run of live(); track run.id) {
          <p>
            <a [routerLink]="['/runs', run.id]">{{ run.id.slice(0, 8) }}</a> · {{ run.phase }} ·
            {{ run.selection.testIds.length }} selected
          </p>
        } @empty {
          <p class="empty">No active executions. Select tests to start a run.</p>
        }
      </section>
      <section class="card">
        <h2>Recent completed executions</h2>
        @for (run of completed().slice(0, 5); track run.id) {
          <p>
            <a [routerLink]="['/runs', run.id]">{{ run.id.slice(0, 8) }}</a> ·
            {{ run.results?.length ?? 0 }} results
          </p>
        } @empty {
          <p class="empty">
            No completed history yet. Metrics will appear after real test execution.
          </p>
        }
      </section>
    }
  `,
})
export class Overview {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  days = Number(this.route.snapshot.queryParamMap.get('days') ?? 7);
  browser = this.route.snapshot.queryParamMap.get('browser') ?? 'all';
  readonly runs = signal<Run[]>([]);
  readonly analytics = signal<Analytics | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly completed = computed(() => this.runs().filter((run) => run.phase === 'completed'));
  readonly live = computed(() =>
    this.runs().filter((run) =>
      ['queued', 'provisioning', 'running', 'finalizing'].includes(run.phase),
    ),
  );
  readonly failed = computed(
    () =>
      this.completed()
        .flatMap((run) => run.results ?? [])
        .filter((result) => ['failed', 'broken'].includes(result.status)).length,
  );
  constructor() {
    void this.load();
  }
  async filter() {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { days: this.days, browser: this.browser },
      replaceUrl: true,
    });
    await this.load();
  }
  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      this.runs.set(
        (await this.api.get<{ items: Run[] }>(`/runs?projectId=${this.api.projectId()}`)).items,
      );
      this.analytics.set(
        await this.api.get<Analytics>(
          `/projects/${this.api.projectId()}/analytics?days=${this.days}&browser=${encodeURIComponent(this.browser)}`,
        ),
      );
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
