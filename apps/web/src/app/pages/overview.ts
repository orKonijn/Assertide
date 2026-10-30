import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import type { Environment, Run, Suite } from '../core/api';
import { Api, errorMessage } from '../core/api';
import { LoadingState } from '../core/loading-state';
import { TrendChart } from '../core/trend-chart';
interface Analytics {
  timeZone: string;
  quarantined: number;
  expectedFailures: number;
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
  apiLatency: {
    p95Ms: number | null;
    samples: number;
    smallSample: boolean;
    transportFailures: number;
  };
  comparison: {
    from: string;
    to: string;
    executed: number;
    finalPassRateChange: number | null;
    missingPriorIdentities: number;
    missingCurrentIdentities: number;
  };
  testDuration: { samples: number; medianMs: number | null; p95Ms: number | null };
  instability: {
    caseId: string;
    browser: string;
    environment: string;
    parameterFingerprint: string;
    samples: number;
    failed: number;
  }[];
  evidence: {
    eligibleAttempts: number;
    completeAttempts: number;
    rate: number | null;
    missing: number;
    expired: number;
    unavailable: number;
    videoDisabledRuns: number;
  };
  endpoints: {
    method: string;
    path: string;
    samples: number;
    p95Ms: number | null;
    transportFailures: number;
    smallSample: boolean;
  }[];
  trends: {
    day: string;
    executed: number;
    passed: number;
    failed: number;
    broken: number;
    finalPassRate: number | null;
    firstAttemptPassRate: number | null;
  }[];
  browsers: {
    name: string;
    executed: number;
    passed: number;
    failed: number;
    broken: number;
    finalPassRate: number | null;
  }[];
  failures: { caseId: string; count: number; samples: number; rate: number }[];
}
@Component({
  host: { class: 'overview-page' },
  imports: [RouterLink, PercentPipe, DatePipe, DecimalPipe, FormsModule, TrendChart, LoadingState],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">WORKSPACE OVERVIEW</p>
        <h1>Quality at a glance</h1>
        <p class="muted">Historical outcomes and live activity, clearly separated.</p>
      </div>
      <a class="button" routerLink="/explorer">New execution</a>
    </header>
    <details class="history-filters card">
      <summary>
        History filters <span class="muted">Date range, environment, and results</span>
      </summary>
      <form class="actions" (ngSubmit)="filter()">
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
        <label
          >From ({{ analytics()?.timeZone ?? 'UTC' }})<input
            type="date"
            name="from"
            aria-label="From date"
            [(ngModel)]="from"
        /></label>
        <label
          >Through ({{ analytics()?.timeZone ?? 'UTC' }})<input
            type="date"
            name="to"
            aria-label="Through date"
            [(ngModel)]="to"
        /></label>
        <label
          >Environment<select name="environment" [(ngModel)]="environment">
            <option value="">All environments</option>
            @for (item of environments(); track item.id) {
              <option [value]="item.id">{{ item.name }}</option>
            }
          </select></label
        >
        <label
          >Result status<select name="status" [(ngModel)]="status">
            <option value="all">All results</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
            <option value="broken">Broken</option>
            <option value="skipped">Skipped</option>
          </select></label
        >
        <label
          >Suite<select name="suite" [(ngModel)]="suite">
            <option value="">All suites and selections</option>
            @for (item of suites(); track item.id) {
              <option [value]="item.id">{{ item.name }}</option>
            }
          </select></label
        >
        <button type="button" (click)="reset()">Reset filters</button>
        <button type="button" (click)="saveFilters()">Save my filters</button>
        <button type="button" (click)="restoreFilters()">Restore my filters</button>
        <button type="button" [disabled]="!analytics() || loading()" (click)="exportMetrics()">
          Export metrics JSON
        </button>
      </form>
    </details>
    @if (notice()) {
      <p role="status">{{ notice() }}</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }} <button (click)="load()">Retry</button></p>
    }
    @if (loading()) {
      <app-loading-state label="Loading executions…" />
    } @else {
      <div class="overview-activity-grid">
        <section class="card overview-activity">
          <div class="section-heading">
            <h2>Live activity</h2>
            <span class="badge">{{ live().length }} active</span>
          </div>
          @for (run of live().slice(0, 5); track run.id) {
            <div class="overview-run-row">
              <a class="run-reference" [routerLink]="['/runs', run.id]"
                >{{ run.id.slice(0, 8) }} <span aria-hidden="true">↗</span></a
              ><span class="badge phase-badge" [attr.data-phase]="run.phase">{{ run.phase }}</span
              ><span class="muted">{{ run.selection.testIds.length }} tests</span>
            </div>
          } @empty {
            <div class="overview-empty">
              <strong>Ready for your next run</strong>
              <p>No executions are active. Choose tests to get started.</p>
              <a routerLink="/explorer">Select tests →</a>
            </div>
          }
          @if (live().length) {
            <a class="overview-more" routerLink="/runs">View executions →</a>
          }
        </section>
        <section class="card overview-activity">
          <div class="section-heading">
            <h2>Recent completed executions</h2>
            <a class="overview-more" routerLink="/runs">View history →</a>
          </div>
          @for (run of completed().slice(0, 5); track run.id) {
            <div class="overview-run-row">
              <a class="run-reference" [routerLink]="['/runs', run.id]"
                >{{ run.id.slice(0, 8) }} <span aria-hidden="true">↗</span></a
              ><span class="muted">{{ run.results?.length ?? 0 }} results</span
              ><time>{{ run.createdAt | date: 'short' }}</time>
            </div>
          } @empty {
            <div class="overview-empty">
              <strong>No completed runs yet</strong>
              <p>Your results and reports will appear here after a run finishes.</p>
              <a routerLink="/explorer">Create an execution →</a>
            </div>
          }
        </section>
      </div>
      <div class="grid metric-grid">
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
        <p class="muted">
          Excluded from headline rates: {{ metrics.quarantined }} quarantined and
          {{ metrics.expectedFailures }} expected-failure instances. Day buckets:
          {{ metrics.timeZone }}.
        </p>
        <section class="card">
          <h2>Previous interval comparison</h2>
          <p>
            {{ metrics.comparison.from | date: 'mediumDate' : 'UTC' }} to
            {{ metrics.comparison.to | date: 'mediumDate' : 'UTC' }} (exclusive, UTC) ·
            {{ metrics.comparison.executed }} executed instances
          </p>
          <p>
            Final pass-rate change:
            {{
              metrics.comparison.finalPassRateChange === null
                ? 'Insufficient comparable data'
                : (metrics.comparison.finalPassRateChange * 100 | number: '1.1-1') +
                  ' percentage points'
            }}
          </p>
          <p class="muted">
            Same filters, equal-length preceding interval.
            {{ metrics.comparison.missingPriorIdentities }} identities absent from the prior
            interval; {{ metrics.comparison.missingCurrentIdentities }} absent from this interval.
            Changes may reflect case mix.
          </p>
        </section>
        <section class="card">
          <h2>{{ from || to ? 'Selected UTC interval' : 'Last ' + days + ' days' }}</h2>
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
              <p>Small sample: fewer than 20 completed HTTP requests.</p>
            }
          </section>
        </div>
        <section class="card">
          <h2>Daily reliability</h2>
          @if (metrics.trends.length) {
            <app-trend-chart [points]="metrics.trends" (daySelected)="selectDay($event)" />
            <p class="muted">
              Solid purple: final pass rate. Dashed teal: first-attempt pass rate. Select a day in
              the chart or table to filter the interval.
            </p>
          }
          <details>
            <summary>Show chart data and denominators</summary>
            <div class="table-wrap" tabindex="0" role="region" aria-label="Daily reliability data">
              <table>
                <thead>
                  <tr>
                    <th>Date ({{ metrics.timeZone }})</th>
                    <th>Passed</th>
                    <th>Failed/broken</th>
                    <th>Executed</th>
                    <th>Final pass rate</th>
                    <th>First-attempt pass rate</th>
                  </tr>
                </thead>
                <tbody>
                  @for (point of metrics.trends; track point.day) {
                    <tr>
                      <td>
                        <button (click)="selectDay(point.day)">{{ point.day }}</button>
                      </td>
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
                      <td>
                        {{
                          point.firstAttemptPassRate === null
                            ? '—'
                            : (point.firstAttemptPassRate | percent: '1.1-1')
                        }}
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="6">No completed results match these filters.</td>
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
                · {{ failure.count }} / {{ failure.samples }} failed/broken instances ({{
                  failure.rate | percent: '1.1-1'
                }})
              </p>
            } @empty {
              <p class="empty">No failed results in this history window.</p>
            }
          </section>
        </div>
      }
      @if (analytics(); as metrics) {
        <p class="muted">
          Excluded from headline rates: {{ metrics.quarantined }} quarantined and
          {{ metrics.expectedFailures }} expected-failure instances. Day buckets:
          {{ metrics.timeZone }}.
        </p>
        <section class="card">
          <h2>Test duration and instability</h2>
          <p>
            Attempt-duration sum per instance: median {{ metrics.testDuration.medianMs ?? '—' }} ms
            · p95 {{ metrics.testDuration.p95Ms ?? '—' }} ms ·
            {{ metrics.testDuration.samples }} samples. Retry cost is included.
          </p>
          <p>
            {{ metrics.apiLatency.transportFailures }} transport failures excluded from completed
            HTTP latency.
          </p>
          @for (
            item of metrics.instability;
            track item.caseId + item.browser + item.environment + item.parameterFingerprint
          ) {
            <p>
              {{ item.caseId }} · {{ item.browser }} · {{ item.environment }} ·
              {{ item.parameterFingerprint }}: {{ item.failed }} failures in
              {{ item.samples }} eligible runs.
            </p>
          } @empty {
            <p>No instability candidates with at least five eligible runs.</p>
          }
          <p class="muted">
            Candidates have both pass and failure in their last ten eligible runs within this
            window. Code changes can explain differences; this is not a root-cause diagnosis.
          </p>
        </section>
        <section class="card">
          <h2>Evidence completeness</h2>
          <p>
            {{ metrics.evidence.completeAttempts }} / {{ metrics.evidence.eligibleAttempts }} failed
            or broken attempts have all required evidence ({{
              metrics.evidence.rate === null
                ? 'No eligible attempts'
                : (metrics.evidence.rate | percent: '1.1-1')
            }}).
          </p>
          <p>
            Required items: {{ metrics.evidence.missing }} missing ·
            {{ metrics.evidence.expired }} expired · {{ metrics.evidence.unavailable }} unavailable.
            Video capture disabled in {{ metrics.evidence.videoDisabledRuns }} matching browser
            runs.
          </p>
          <p class="muted">
            Browser failures require screenshot and trace, plus video when enabled. API failures
            require a recorded exchange or transport error. Expected failures are excluded; failed
            attempts recovered by retry remain eligible.
          </p>
        </section>
        <section class="card">
          <h2>API endpoint latency</h2>
          @for (endpoint of metrics.endpoints; track endpoint.method + endpoint.path) {
            <p>
              <code style="overflow-wrap: anywhere">{{ endpoint.method }} {{ endpoint.path }}</code>
              · p95 {{ endpoint.p95Ms ?? '—' }} ms · {{ endpoint.samples }} completed responses ·
              {{ endpoint.transportFailures }} transport failures{{
                endpoint.smallSample ? ' · small sample' : ''
              }}
            </p>
          } @empty {
            <p>No recorded API exchanges match these filters.</p>
          }
        </section>
      }
    }
  `,
})
export class Overview {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  public days = Number(this.route.snapshot.queryParamMap.get('days') ?? 7);
  public browser = this.route.snapshot.queryParamMap.get('browser') ?? 'all';
  public from = this.route.snapshot.queryParamMap.get('from') ?? '';
  public to = this.route.snapshot.queryParamMap.get('to') ?? '';
  public environment = this.route.snapshot.queryParamMap.get('environment') ?? '';
  public suite = this.route.snapshot.queryParamMap.get('suite') ?? '';
  public readonly suites = signal<Suite[]>([]);
  public status = this.route.snapshot.queryParamMap.get('status') ?? 'all';
  public readonly environments = signal<Environment[]>([]);
  public readonly notice = signal('');
  public readonly runs = signal<Run[]>([]);
  public readonly analytics = signal<Analytics | null>(null);
  public readonly loading = signal(true);
  public readonly error = signal('');
  public readonly completed = computed(() =>
    this.runs().filter((run) => run.phase === 'completed'),
  );
  public readonly live = computed(() =>
    this.runs().filter((run) =>
      ['queued', 'provisioning', 'running', 'finalizing'].includes(run.phase),
    ),
  );
  public readonly failed = computed(
    () =>
      this.completed()
        .flatMap((run) => run.results ?? [])
        .filter((result) => ['failed', 'broken'].includes(result.status)).length,
  );
  private requestVersion = 0;
  public constructor() {
    void this.load();
  }
  public async filter(): Promise<void> {
    this.loading.set(true);
    this.requestVersion++;
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.filters(),
      replaceUrl: true,
    });
    await this.load();
  }
  public filters(): {
    status: string;
    suite?: string | undefined;
    environment?: string | undefined;
    to?: string | undefined;
    from?: string | undefined;
    days: number;
    browser: string;
  } {
    return {
      days: this.days,
      browser: this.browser,
      ...(this.from ? { from: this.from } : {}),
      ...(this.to ? { to: this.to } : {}),
      ...(this.environment ? { environment: this.environment } : {}),
      ...(this.suite ? { suite: this.suite } : {}),
      status: this.status,
    };
  }
  public reset(): void {
    this.days = 7;
    this.browser = 'all';
    this.from = '';
    this.to = '';
    this.environment = '';
    this.suite = '';
    this.status = 'all';
    void this.filter();
  }
  public selectDay(day: string): void {
    this.from = day;
    this.to = day;
    void this.filter();
  }
  public saveFilters(): void {
    try {
      localStorage.setItem(
        `assertide.analytics.${this.api.identity()?.subject}.${this.api.projectId()}`,
        JSON.stringify(this.filters()),
      );
      this.notice.set('Filters saved on this device.');
    } catch {
      this.notice.set('This browser could not save filters.');
    }
  }
  public restoreFilters(): void {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(
          `assertide.analytics.${this.api.identity()?.subject}.${this.api.projectId()}`,
        ) ?? 'null',
      );
      if (!saved || typeof saved !== 'object') {
        this.notice.set('No saved filters on this device.');
        return;
      }
      const value = saved as Record<string, unknown>;
      this.days = typeof value['days'] === 'number' ? value['days'] : 7;
      for (const key of ['browser', 'from', 'to', 'environment', 'suite', 'status'] as const) {
        const fallback = key === 'browser' || key === 'status' ? 'all' : '';
        this[key] = typeof value[key] === 'string' ? value[key] : fallback;
      }
      void this.filter();
      this.notice.set('Saved filters restored.');
    } catch {
      this.notice.set('Saved filters could not be restored.');
    }
  }
  public exportMetrics(): void {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(this.analytics(), null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'assertide-metrics.json';
    link.click();
    URL.revokeObjectURL(url);
  }
  public async load(): Promise<void> {
    const version = ++this.requestVersion;
    const project = this.api.projectId();
    const query = new URLSearchParams(
      Object.entries(this.filters()).map(([key, value]) => [key, String(value)]),
    );
    this.loading.set(true);
    this.error.set('');
    try {
      const [environments, runs, analytics, suites] = await Promise.all([
        this.api.get<{ items: Environment[] }>(`/projects/${project}/environments`),
        this.api.get<{ items: Run[] }>(`/runs?projectId=${project}`),
        this.api.get<Analytics>(`/projects/${project}/analytics?${query}`),
        this.api.get<{ items: Suite[] }>(`/projects/${project}/suites`),
      ]);
      if (version !== this.requestVersion) {
        return;
      }
      this.environments.set(environments.items);
      this.suites.set(suites.items);
      this.runs.set(runs.items);
      this.analytics.set(analytics);
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
