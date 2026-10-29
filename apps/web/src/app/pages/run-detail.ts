import { Component, inject, signal, DestroyRef } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, Run, errorMessage } from '../core/api';
@Component({
  imports: [RouterLink],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">EXECUTION DETAIL</p>
        <h1>Run {{ id.slice(0, 8) }}</h1>
        <a routerLink="/runs">Back to executions</a>
      </div>
      <div class="actions">
        <button (click)="load()">Refresh</button
        ><button [disabled]="busy()" (click)="rerun()">Rerun selection</button>
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
        </section>
        <section class="card">
          <h2>Allure report</h2>
          <p>{{ current.reportPhase }}</p>
          @if (current.phase === 'completed' && ['ready', 'failed'].includes(current.reportPhase)) {
            <button [disabled]="busy()" (click)="rebuild()">Rebuild report</button>
          }
          @if (current.reportPhase === 'ready') {
            <a [href]="'/v1/runs/' + id + '/report'" target="_blank" rel="noopener">Open report</a>
          }
        </section>
      </div>
      <section class="card">
        <h2>Test results</h2>
        @for (result of current.results ?? []; track result.id) {
          <details>
            <summary>{{ result.id }} · {{ result.status }} · {{ result.duration }}ms</summary>
            <p>{{ result.title }}</p>
            @for (attempt of result.attempts ?? []; track $index) {
              <p>Attempt {{ $index + 1 }} · {{ attempt.status }} · {{ attempt.duration }}ms</p>
              @if (attempt.error) {
                <pre>{{ attempt.error }}</pre>
              }
            }
            @if (result.error) {
              <pre>{{ result.error }}</pre>
            }
          </details>
        } @empty {
          <p class="empty">
            Results appear as execution finishes. No outcomes have been recorded yet.
          </p>
        }
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
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  readonly run = signal<Run | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly disconnected = signal(false);
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
  async rerun() {
    this.busy.set(true);
    try {
      const run = await this.api.post<Run>(`/runs/${this.id}/reruns`, {}, crypto.randomUUID());
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
