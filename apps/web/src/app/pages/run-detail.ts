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
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stopped = true;
      clearTimeout(this.timer);
    });
    void this.poll();
  }
  private async poll() {
    await this.load();
    if (
      !this.stopped &&
      (!this.run() ||
        this.run()?.reportPhase === 'generating' ||
        ['queued', 'running', 'provisioning', 'finalizing'].includes(this.run()?.phase ?? ''))
    )
      this.timer = setTimeout(() => void this.poll(), 2000);
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
}
