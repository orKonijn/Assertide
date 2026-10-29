import { Component, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, Run, errorMessage } from '../core/api';
import { PercentPipe, DatePipe } from '@angular/common';
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
}
@Component({
  imports: [RouterLink, PercentPipe, DatePipe],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">WORKSPACE OVERVIEW</p>
        <h1>Quality at a glance</h1>
        <p class="muted">Historical outcomes and live activity, clearly separated.</p>
      </div>
      <a class="button" routerLink="/explorer">New execution</a>
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }} <button (click)="load()">Retry</button></p>
    }
    @if (loading()) {
      <p role="status">Loading executions…</p>
    } @else {
      <div class="grid">
        <section class="card">
          <h2>Completed runs</h2>
          <div class="metric">{{ completed().length }}</div>
          <p class="muted">Terminal completed executions</p>
        </section>
        <section class="card">
          <h2>Live runs</h2>
          <div class="metric">{{ live().length }}</div>
          <p class="muted">Excluded from historical metrics</p>
        </section>
        <section class="card">
          <h2>Failed results</h2>
          <div class="metric">{{ failed() }}</div>
          <p class="muted">Failed or broken test instances</p>
        </section>
      </div>
      @if (analytics(); as metrics) {
        <section class="card">
          <h2>Last seven days</h2>
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
  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      this.runs.set(
        (await this.api.get<{ items: Run[] }>(`/runs?projectId=${this.api.projectId()}`)).items,
      );
      this.analytics.set(
        await this.api.get<Analytics>(`/projects/${this.api.projectId()}/analytics`),
      );
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
