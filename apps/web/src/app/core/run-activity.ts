import { Component, computed, DestroyRef, inject, input, signal } from '@angular/core';

import type { Run } from './api';

@Component({
  selector: 'app-run-activity',
  template: ` <section class="card" aria-label="Active tests">
    <div class="section-heading">
      <h2>Currently running</h2>
      <span class="badge">Elapsed {{ elapsed(run().startedAt, run().endedAt) }}</span>
    </div>
    <p class="muted">
      Tests: {{ testPhase() }} · Evidence: {{ evidencePhase() }} · Report: {{ run().reportPhase }}
    </p>
    @for (test of active(); track test.id) {
      <p>
        <strong>{{ test.title }}</strong> · {{ test.id.split(':')[1] || 'api' }} ·
        {{ elapsed(test.startedAt) }} · Retry {{ test.retry }}
      </p>
    } @empty {
      <p class="muted">{{ message() }}</p>
    }
  </section>`,
  styles: [
    `
      :host {
        display: block;
        margin-bottom: 1rem;
      }
      p {
        overflow-wrap: anywhere;
      }
    `,
  ],
})
export class RunActivity {
  public readonly run = input.required<Run>();
  private readonly now = signal(Date.now());
  public readonly testPhase = computed(() => {
    if (
      this.run().phase === 'finalizing' ||
      this.run().phase === 'completed' ||
      this.run().performancePhase === 'running'
    ) {
      return 'Finished';
    }
    return this.run().phase;
  });
  public readonly evidencePhase = computed(() => {
    if (this.run().phase === 'finalizing') {
      return 'Saving';
    }
    if (['queued', 'provisioning', 'running'].includes(this.run().phase)) {
      return 'Pending';
    }
    return this.run().artifacts?.length
      ? `${this.run().artifacts!.length} recorded attachments`
      : 'No attachments recorded';
  });
  public readonly active = computed(() =>
    this.run().phase === 'running' && this.run().performancePhase !== 'running'
      ? (this.run().progress?.active ?? [])
      : [],
  );
  public readonly message = computed(() => {
    if (this.run().phase === 'finalizing') {
      return 'Tests complete · Evidence saving';
    }
    if (this.run().performancePhase === 'running') {
      return 'Functional tests complete · Performance benchmark running';
    }
    return ['queued', 'provisioning', 'running'].includes(this.run().phase)
      ? 'Waiting for the next worker activity event.'
      : 'No tests are running. Report generation is separate from execution.';
  });
  public constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
  public elapsed(start?: string, end?: string): string {
    if (!start) {
      return 'Not started';
    }
    const seconds = Math.max(
      0,
      Math.floor(((end ? Date.parse(end) : this.now()) - Date.parse(start)) / 1000),
    );
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }
}
