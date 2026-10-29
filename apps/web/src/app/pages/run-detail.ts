import { Component, inject, signal, DestroyRef } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Api, Run, errorMessage } from '../core/api';
@Component({
  imports: [RouterLink, DatePipe],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">EXECUTION DETAIL</p>
        <h1>Run {{ id.slice(0, 8) }}</h1>
        <a routerLink="/runs">Back to executions</a>
      </div>
      <div class="actions">
        <button (click)="load()">Refresh</button
        ><button [disabled]="busy() || !canRerun()" (click)="rerun()">Rerun selection</button>
        <button [disabled]="busy() || !canRerun() || !hasFailures()" (click)="rerun('failed')">
          Rerun failed tests
        </button>
      </div>
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (disconnected()) {
      <p class="error" role="status">
        Live connection interrupted. Reconnecting; displayed results may be stale.
      </p>
    }
    @if (run(); as current) {
      <div class="grid">
        <section class="card">
          <h2>Execution phase</h2>
          <p class="metric" role="status">{{ current.phase }}</p>
          @if (current.queueReason) {
            <p>{{ current.queueReason }}. The run will start when capacity becomes available.</p>
          }
          @if (current.cancelRequested && current.phase !== 'canceled') {
            <p>Stopping workers…</p>
          }
          @if (['queued', 'running', 'provisioning'].includes(current.phase)) {
            <button [disabled]="busy()" (click)="cancel()">Cancel execution</button>
          }
        </section>
        <section class="card">
          <h2>Frozen selection</h2>
          <p class="metric">{{ current.selection.testIds.length }}</p>
          <p>{{ current.selection.testIds.join(', ') }}</p>
          @if (current.source) {
            <p class="muted">Source revision {{ current.source.revision.slice(0, 12) }}</p>
          }
        </section>
        <section class="card">
          <h2>Allure report</h2>
          <p>{{ current.reportPhase }}</p>
          @if (current.reportExpiresAt) {
            <p class="muted">
              Report expires {{ current.reportExpiresAt | date: 'medium' }}. Traces and videos
              expire after 14 days.
            </p>
          }
          @if (current.reportDiagnostic && current.reportPhase === 'failed') {
            <p role="alert">{{ current.reportDiagnostic }}</p>
          }
          @if (current.rawUnavailableReason) {
            <p>{{ current.rawUnavailableReason }}</p>
          }
          @if (current.phase === 'completed' && ['ready', 'failed'].includes(current.reportPhase)) {
            <button
              [disabled]="
                busy() ||
                !!current.rawExpiredAt ||
                !['maintainer', 'administrator'].includes(api.identity()?.role ?? '')
              "
              (click)="rebuild()"
            >
              Rebuild report
            </button>
          }
          @if (current.reportPhase === 'ready') {
            <a [href]="'/v1/runs/' + id + '/report'" target="_blank" rel="noopener">Open report</a>
          }
        </section>
      </div>
      <section class="card">
        <h2>Test results</h2>
        @if (current.results?.length) {
          <button
            [disabled]="busy() || !canRerun() || !selected().length"
            (click)="rerun('selected')"
          >
            Rerun checked tests
          </button>
        }
        @for (result of current.results ?? []; track result.id) {
          <details>
            <summary>{{ result.id }} · {{ result.status }} · {{ result.duration }}ms</summary>
            <p>{{ result.title }}</p>
            <label
              ><input
                type="checkbox"
                [checked]="selected().includes(result.id.split(':')[0])"
                (change)="toggle(result.id.split(':')[0])"
              />
              Select {{ result.id }} for rerun</label
            >
            @for (attempt of result.attempts ?? []; track $index) {
              <p>Attempt {{ $index + 1 }} · {{ attempt.status }} · {{ attempt.duration }}ms</p>
              @if (attempt.error) {
                <pre>{{ attempt.error }}</pre>
              }
            }
            @if (result.error) {
              <pre>{{ result.error }}</pre>
            }
            @for (artifact of current.artifacts ?? []; track artifact.id) {
              @if (artifact.resultId === result.id) {
                <div class="card">
                  <p>Attempt {{ artifact.attempt }} · {{ artifact.createdAt | date: 'short' }}</p>
                  @if (artifact.unavailableReason) {
                    <p>{{ artifact.name }}: {{ artifact.unavailableReason }}</p>
                  } @else {
                    <a [href]="'/v1/runs/' + id + '/artifacts/' + artifact.id"
                      >Download {{ artifact.name }}</a
                    >
                  }
                  <p class="muted">
                    {{ artifact.redactionPolicy }} · Expires
                    {{ artifact.expiresAt | date: 'shortDate' }}
                  </p>
                </div>
              }
            }
          </details>
        } @empty {
          <p class="empty">
            Results appear as execution finishes. No outcomes have been recorded yet.
          </p>
        }
      </section>
      <section class="card">
        <h2>Worker log</h2>
        <pre tabindex="0" aria-label="Worker log">{{
          current.logTail || 'Waiting for worker output.'
        }}</pre>
      </section>
      @if (current.parentRunId) {
        <p>
          Parent execution:
          <a [routerLink]="['/runs', current.parentRunId]">{{ current.parentRunId }}</a>
        </p>
      }
    }
  `,
})
export class RunDetail {
  readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  readonly run = signal<Run | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly disconnected = signal(false);
  readonly selected = signal<string[]>([]);
  canRerun() {
    return (
      this.api.identity()?.role !== 'viewer' &&
      ['completed', 'canceled', 'infrastructure_error', 'timed_out'].includes(
        this.run()?.phase ?? '',
      )
    );
  }
  hasFailures() {
    return (
      this.run()?.results?.some((result) =>
        ['failed', 'timedOut', 'broken', 'interrupted'].includes(result.status),
      ) ?? false
    );
  }
  toggle(id: string) {
    this.selected.update((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  }
  private readonly stream = new EventSource(`/v1/runs/${this.id}/events`);
  private lastSequence = 0;
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stream.close();
    });
    this.stream.onopen = () => {
      this.disconnected.set(false);
      void this.load();
    };
    this.stream.onerror = () => this.disconnected.set(true);
    this.stream.addEventListener('resync', () => {
      this.lastSequence = 0;
      void this.load();
    });
    this.stream.addEventListener('update', (event: MessageEvent<string>) => {
      const sequence = Number(event.lastEventId);
      if (Number.isSafeInteger(sequence) && sequence > this.lastSequence) {
        this.lastSequence = sequence;
        void this.load();
      }
    });
    this.stream.addEventListener('access_revoked', () => {
      this.stream.close();
      this.run.set(null);
      this.api.identity.set(null);
    });
    void this.load();
  }
  async load() {
    try {
      this.run.set(await this.api.get<Run>(`/runs/${this.id}`));
      this.error.set('');
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
  async cancel() {
    if (
      !confirm(
        'Stop this execution? Completed results are preserved; active and pending tests will be canceled.',
      )
    )
      return;
    this.busy.set(true);
    try {
      this.run.set(await this.api.post<Run>(`/runs/${this.id}/cancel`, {}));
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
  async rerun(mode: 'all' | 'failed' | 'selected' = 'all') {
    this.busy.set(true);
    try {
      const run = await this.api.post<Run>(
        `/runs/${this.id}/reruns`,
        { mode, ...(mode === 'selected' ? { testIds: this.selected() } : {}) },
        crypto.randomUUID(),
      );
      await this.router.navigateByUrl('/runs');
      await this.router.navigate(['/runs', run.id]);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
  async rebuild() {
    this.busy.set(true);
    try {
      this.run.set(await this.api.post<Run>(`/runs/${this.id}/report-rebuilds`, {}));
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
