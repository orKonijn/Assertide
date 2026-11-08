import { Component, computed, input } from '@angular/core';

import type { Run } from './api';

export function progressCounts(run: Run): {
  passed: number;
  failed: number;
  other: number;
  total: number;
  remaining: number;
} {
  const counts = { passed: 0, failed: 0, other: 0 };
  if (run.results?.length) {
    for (const result of run.results) {
      if (['skipped', 'canceled', 'interrupted'].includes(result.status)) {
        counts.other++;
      } else if (
        (result.status === 'passed' && !result.expectedFailure) ||
        (result.status === 'failed' && result.expectedFailure)
      ) {
        counts.passed++;
      } else {
        counts.failed++;
      }
    }
  } else if (run.progress) {
    Object.assign(counts, run.progress);
  }
  const finished = counts.passed + counts.failed + counts.other;
  const total = Math.max(
    finished,
    run.selection.testIds.reduce(
      (sum, id) => sum + (id.startsWith('UI-') ? (run.config?.browserProjects.length ?? 1) : 1),
      0,
    ),
  );
  return { ...counts, total, remaining: Math.max(0, total - finished) };
}

@Component({
  selector: 'app-run-progress',
  template: `
    <section class="progress-card" aria-label="Test progress">
      <div class="progress-ring" role="img" [attr.aria-label]="description()">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle class="track" cx="100" cy="100" r="88" />
          <circle
            class="passed-arc"
            cx="100"
            cy="100"
            r="88"
            pathLength="100"
            [attr.stroke-dasharray]="arc(counts().passed)"
          />
          <circle
            class="failed-arc"
            cx="100"
            cy="100"
            r="88"
            pathLength="100"
            [attr.stroke-dasharray]="arc(counts().failed)"
            [attr.stroke-dashoffset]="-percent(counts().passed)"
          />
        </svg>
        <div class="ring-counts" aria-hidden="true">
          <span class="ring-caption">TEST RESULTS</span>
          <div class="outcomes">
            <span class="passed"
              ><strong>{{ counts().passed }}</strong
              >Passed</span
            >
            <span class="divider"></span
            ><span class="failed"
              ><strong>{{ counts().failed }}</strong
              >Failed</span
            >
          </div>
        </div>
      </div>
      <div class="progress-copy">
        <h2>Test progress</h2>
        <p class="completion">
          <strong>{{ counts().total - counts().remaining }}</strong> / {{ counts().total }} finished
        </p>
        <p class="muted">
          {{ counts().remaining }} {{ terminal() ? 'not completed' : 'remaining' }}
          @if (counts().other) {
            · {{ counts().other }} skipped or canceled
          }
        </p>
        <p class="muted">{{ message() }}</p>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        margin-block: 0 1.25rem;
      }
      .progress-card {
        display: flex;
        align-items: center;
        gap: 2rem;
        padding: 1.5rem 2rem;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 0.75rem;
      }
      .progress-ring {
        position: relative;
        width: 200px;
        height: 200px;
        flex: 0 0 200px;
      }
      svg {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }
      circle {
        fill: none;
        stroke-width: 10;
      }
      .track {
        stroke: var(--border);
      }
      .passed-arc {
        stroke: var(--success);
      }
      .failed-arc {
        stroke: var(--danger);
      }
      .ring-counts {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
      }
      .ring-caption {
        font-size: 0.65rem;
        letter-spacing: 0.12em;
        color: var(--muted);
      }
      .outcomes {
        display: flex;
        align-items: center;
        gap: 0.85rem;
      }
      .outcomes span:not(.divider) {
        display: grid;
        text-align: center;
        font-size: 0.75rem;
        gap: 0.3rem;
      }
      .outcomes strong {
        font-size: 1.65rem;
        font-variant-numeric: tabular-nums;
        line-height: 1;
      }
      .passed {
        color: var(--success);
      }
      .failed {
        color: var(--danger);
      }
      .divider {
        height: 2.4rem;
        border-left: 1px solid var(--border);
      }
      h2 {
        margin: 0;
        font-size: 1.1rem;
      }
      .completion {
        font-size: 1.4rem;
        margin-block: 0.75rem;
        font-variant-numeric: tabular-nums;
      }
      .progress-copy {
        min-width: 0;
      }
      .progress-copy .muted {
        margin-block: 0.5rem;
      }
      @media (max-width: 600px) {
        .progress-card {
          flex-direction: column;
          text-align: center;
          gap: 1rem;
          padding: 1.25rem;
        }
      }
    `,
  ],
})
export class RunProgress {
  public readonly run = input.required<Run>();
  public readonly counts = computed(() => progressCounts(this.run()));
  public readonly terminal = computed(() =>
    ['completed', 'canceled', 'timed_out', 'infrastructure_error'].includes(this.run().phase),
  );
  public readonly description = computed(() => {
    const c = this.counts();
    return `${c.passed} passed, ${c.failed} failed, ${c.other} skipped or canceled, ${c.remaining} ${this.terminal() ? 'not completed' : 'remaining'}, ${c.total} total`;
  });
  public readonly message = computed(() => {
    if (this.run().phase === 'finalizing') {
      return 'Tests finished. Saving evidence…';
    }
    if (this.run().performancePhase === 'running') {
      return 'Tests finished. Measuring performance…';
    }
    if (this.terminal()) {
      return 'Final test outcomes. Retries count once per test.';
    }
    if (['queued', 'provisioning'].includes(this.run().phase)) {
      return 'Waiting for tests to start.';
    }
    return 'Updates as tests finish. Retrying tests stay pending.';
  });
  public percent(value: number): number {
    return this.counts().total ? (value / this.counts().total) * 100 : 0;
  }
  public arc(value: number): string {
    return `${this.percent(value)} 100`;
  }
}
