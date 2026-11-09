import { Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { CaseResult, Run } from './api';
import { Api, errorMessage } from './api';

export function failedResult(result: CaseResult): boolean {
  if (result.expectedFailure && ['passed', 'failed'].includes(result.status)) {
    return result.status === 'passed';
  }
  return ['failed', 'timedOut', 'broken'].includes(result.status);
}
@Component({
  selector: 'app-run-comparison',
  imports: [RouterLink],
  template: ` <details class="card">
    <summary>Compare with previous compatible run</summary>
    <p class="muted">{{ reason() }}</p>
    @if (error()) {
      <p role="alert">{{ error() }} <button (click)="load()">Retry comparison</button></p>
    } @else if (loading()) {
      <p>Loading comparison…</p>
    } @else if (previous(); as prior) {
      <p>
        Compared with <a [routerLink]="['/runs', prior.id]">{{ prior.id.slice(0, 8) }}</a> ·
        {{ changes().length }} changed outcomes or durations
      </p>
      @if (!run().results?.length) {
        <p>Comparison will be available when this run finalizes its test results.</p>
      } @else {
        @for (change of changes(); track change.id) {
          <p>
            <strong>{{ change.id }}</strong> · {{ change.message }}
          </p>
        } @empty {
          <p>No new failures, recoveries or material duration changes.</p>
        }
      }
    } @else {
      <p>Not enough history: no earlier compatible completed execution.</p>
    }
  </details>`,
  styles: [
    `
      :host {
        display: block;
        margin: 1rem 0;
      }
      summary {
        cursor: pointer;
        font-weight: 600;
      }
      p {
        overflow-wrap: anywhere;
      }
    `,
  ],
})
export class RunComparison {
  public readonly run = input.required<Run>();
  private readonly api = inject(Api);
  public readonly previous = signal<{ id: string; results: CaseResult[] } | null>(null);
  public readonly reason = signal(
    'Same project, source revision, environment, selection, browsers, workers and retry policy.',
  );
  public readonly loading = signal(false);
  public readonly error = signal('');
  private generation = 0;
  private readonly runId = computed(() => this.run().id);
  public readonly changes = computed(() => {
    const old = new Map((this.previous()?.results ?? []).map((r) => [r.id, r]));
    return (this.run().results ?? []).flatMap((r) => {
      const before = old.get(r.id);
      if (!before) {
        return [];
      }
      const messages: string[] = [];
      if (failedResult(r) && !failedResult(before)) {
        messages.push('New failure');
      }
      if (!failedResult(r) && failedResult(before) && ['passed', 'failed'].includes(r.status)) {
        messages.push('Recovered');
      }
      if (
        ['passed', 'failed', 'timedOut', 'broken'].includes(r.status) &&
        ['passed', 'failed', 'timedOut', 'broken'].includes(before.status) &&
        before.duration > 0 &&
        Math.abs(r.duration - before.duration) >= 1000 &&
        Math.abs(r.duration / before.duration - 1) >= 0.2
      ) {
        messages.push(
          `${r.duration > before.duration ? 'Slower' : 'Faster'} by ${Math.round(Math.abs(r.duration / before.duration - 1) * 100)}% (${before.duration} → ${r.duration} ms)`,
        );
      }
      return messages.length ? [{ id: r.id, message: messages.join(' · ') }] : [];
    });
  });
  public constructor() {
    effect(() => {
      const id = this.runId();
      void this.load(id);
    });
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
    });
  }
  public async load(id = this.run().id): Promise<void> {
    const version = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    this.previous.set(null);
    try {
      const data = await this.api.get<{
        previous: { id: string; results: CaseResult[] } | null;
        reason: string;
      }>(`/runs/${id}/comparison`);
      if (version === this.generation) {
        this.previous.set(data.previous);
        this.reason.set(data.reason);
      }
    } catch (error) {
      if (version === this.generation) {
        this.error.set(errorMessage(error));
      }
    } finally {
      if (version === this.generation) {
        this.loading.set(false);
      }
    }
  }
}
