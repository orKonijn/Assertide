import { DecimalPipe } from '@angular/common';
import { Component, input } from '@angular/core';

import type { PerformanceCoverage } from './api';

@Component({
  selector: 'app-performance-review',
  imports: [DecimalPipe],
  template: `
    <section class="card" aria-labelledby="performance-heading">
      <header class="performance-heading">
        <div>
          <p class="eyebrow">Controlled laboratory · Advisory</p>
          <h2 id="performance-heading">Catalog performance</h2>
        </div>
        <span class="badge">Desktop · 3 samples</span>
      </header>
      <p class="muted">
        Lighthouse measures the controlled inventory route. Budgets do not change functional
        outcomes. These laboratory measurements are not field INP or a conformance score.
      </p>
      @for (row of coverage(); track row.resultId) {
        <h3>{{ row.resultId }}</h3>
        @if (row.checkpoint?.status === 'measured') {
          @for (sample of row.checkpoint.samples?.slice(0, 1) ?? []; track sample.profile) {
            <p class="muted">
              {{ sample.route }} · Lighthouse {{ sample.toolVersion }} · 40 ms RTT · 10,240 Kbps ·
              CPU ×1
            </p>
          }
          <div class="table-wrap">
            <table aria-label="Performance metric budgets">
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col">Median</th>
                  <th scope="col">Range</th>
                  <th scope="col">Budget</th>
                  <th scope="col">Assessment</th>
                </tr>
              </thead>
              <tbody>
                @for (decision of row.decisions; track decision.metric) {
                  <tr>
                    <th scope="row">{{ label(decision.metric) }}</th>
                    <td data-label="Median">
                      {{
                        decision.median === null
                          ? 'Unavailable'
                          : (decision.median | number: '1.0-3')
                      }}
                    </td>
                    <td data-label="Range">
                      {{ decision.minimum | number: '1.0-3' }}–{{
                        decision.maximum | number: '1.0-3'
                      }}
                    </td>
                    <td data-label="Budget">{{ decision.limit | number: '1.0-3' }}</td>
                    <td data-label="Assessment">
                      <span class="assessment" [attr.data-status]="decision.status">{{
                        decision.status
                      }}</span
                      ><small
                        >{{ decision.reason.replaceAll('-', ' ') }} ·
                        {{ decision.samples }} samples</small
                      >
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="muted">
            Timing spread above 20% is inconclusive. Byte budgets use the worst sample; other
            budgets use the median.
          </p>
        } @else {
          <p role="status">
            Not measured ·
            {{
              row.checkpoint?.reason?.replaceAll('-', ' ') ??
                'The final-attempt performance evidence is missing or unavailable.'
            }}
          </p>
        }
      } @empty {
        <p role="status">
          Measurements appear after the benchmark finishes. Missing evidence is never a performance
          pass.
        </p>
      }
    </section>
  `,
  styles: [
    `
      .performance-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
      }
      h2 {
        margin-block: 0.25rem;
      }
      small {
        display: block;
        color: var(--muted);
        margin-top: 0.5rem;
      }
      .assessment {
        text-transform: capitalize;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }
      .assessment::before {
        content: '';
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        background: var(--muted);
      }
      .assessment[data-status='pass']::before {
        background: #239d70;
      }
      .assessment[data-status='fail']::before {
        background: #d64455;
      }
      .assessment[data-status='inconclusive']::before {
        background: #b5811d;
      }
      @media (max-width: 600px) {
        table,
        tbody {
          display: block;
          min-width: 0;
        }
        thead {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip-path: inset(50%);
        }
        tr {
          display: grid;
          grid-template-columns: 1fr 1fr;
          border-bottom: 1px solid var(--border);
          padding-block: 1rem;
        }
        th {
          grid-column: 1/-1;
        }
        td {
          min-width: 0;
          border: 0;
          overflow-wrap: anywhere;
        }
        td::before {
          content: attr(data-label);
          display: block;
          color: var(--muted);
          font-size: 0.75rem;
          margin-bottom: 0.5rem;
        }
      }
    `,
  ],
})
export class PerformanceReview {
  public readonly coverage = input<PerformanceCoverage[]>([]);
  public label(metric: string): string {
    return (
      (
        {
          lcpMs: 'LCP (ms)',
          cls: 'Layout shift',
          tbtMs: 'Blocking time (ms)',
          transferBytes: 'Transferred bytes',
        } as Record<string, string>
      )[metric] ?? metric
    );
  }
}
