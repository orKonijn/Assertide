import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { AccessibilityCoverage } from './api';

@Component({
  selector: 'app-accessibility-review',
  imports: [RouterLink],
  template: `
    <section class="card accessibility-review" aria-labelledby="accessibility-heading">
      <header class="accessibility-heading">
        <div>
          <p class="eyebrow">Quality checks <span class="badge">Advisory</span></p>
          <h2 id="accessibility-heading">Accessibility review</h2>
          <p class="muted">Final browser states only. Functional outcomes are unchanged.</p>
        </div>
        <span class="badge">{{ terminal() ? 'Recorded coverage' : 'Awaiting results' }}</span>
      </header>
      <div class="accessibility-metrics">
        <div>
          <strong>{{ checked() }} / {{ expected() }}</strong
          ><span>states checked</span>
        </div>
        <div>
          <strong>{{ findings() }}</strong
          ><span>recorded rule findings</span>
        </div>
        <div>
          <strong>{{ manual() }}</strong
          ><span>rules needing manual review</span>
        </div>
      </div>
      <p class="muted">
        Automated checks cannot establish accessibility conformance. Keyboard, screen-reader and
        manual assessment are still needed. Unvisited states are not covered.
      </p>
      @if (terminal() && checked() < expected()) {
        <p role="status">
          Coverage is incomplete. Missing or unavailable scans are not passing checks.
        </p>
      }
      @for (row of pageRows(); track row.resultId) {
        <details class="accessibility-state">
          <summary>
            <strong>{{ row.resultId }}</strong
            ><span class="badge">{{ status(row) }}</span>
          </summary>
          @if (row.checkpoint; as check) {
            @if (check.status === 'checked') {
              <p class="muted">
                Final state · Attempt {{ row.attempt }} · axe {{ check.engine }}
                @if (check.viewport) {
                  · {{ check.viewport.width }} × {{ check.viewport.height }}
                }
              </p>
              @if (check.truncated) {
                <p>Finding list was capped. Review the complete state manually.</p>
              }
              @for (finding of check.violations; track finding.id) {
                <article class="accessibility-finding">
                  <div>
                    <strong>{{ finding.id }}</strong
                    ><span class="badge">{{ finding.impact ?? 'Unclassified' }}</span>
                  </div>
                  <p>{{ finding.description }}</p>
                  <div class="actions">
                    <span class="muted">{{ finding.nodes }} affected nodes</span>
                    <a [href]="finding.helpUrl" target="_blank" rel="noopener noreferrer"
                      >Rule guidance ↗</a
                    >
                  </div>
                </article>
              } @empty {
                <p>No automated violations were found in this state.</p>
              }
              @if (check.incomplete) {
                <p>
                  {{ check.incomplete }}
                  {{ check.incomplete === 1 ? 'rule needs' : 'rules need' }} manual review. They are
                  not counted as passes.
                </p>
              }
              @for (rule of check.reviewRules ?? []; track rule.id) {
                <article class="accessibility-finding">
                  <div>
                    <strong>{{ rule.id }}</strong
                    ><span class="badge">Manual assessment</span>
                  </div>
                  <p>{{ rule.description }}</p>
                  <a [href]="rule.helpUrl" target="_blank" rel="noopener noreferrer"
                    >Review guidance ↗</a
                  >
                </article>
              }
            } @else {
              <p>{{ reason(check.reason) }}</p>
            }
          } @else {
            <p>
              No valid scan was recorded for the final attempt. The page may have closed, the run
              may have stopped, or evidence may be unavailable.
            </p>
          }
          <p>
            <a [routerLink]="['/runs', runId()]" [queryParams]="{ result: row.resultId }"
              >Investigate result and add a note</a
            >
          </p>
        </details>
      } @empty {
        <p>
          {{
            terminal()
              ? 'No scan evidence was recorded. Review coverage before drawing conclusions.'
              : 'Accessibility results will appear after the browser tests finish.'
          }}
        </p>
      }
      @if (pageCount() > 1) {
        <nav class="pagination" aria-label="Accessibility coverage pages">
          <button
            type="button"
            aria-label="Previous accessibility page"
            [disabled]="currentPage() === 1"
            (click)="page.set(currentPage() - 1)"
          >
            ‹
          </button>
          <span>Page {{ currentPage() }} of {{ pageCount() }}</span>
          <button
            type="button"
            aria-label="Next accessibility page"
            [disabled]="currentPage() === pageCount()"
            (click)="page.set(currentPage() + 1)"
          >
            ›
          </button>
        </nav>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        margin-block: 1.5rem;
      }
      .accessibility-heading,
      .accessibility-state summary,
      .accessibility-finding > div {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .accessibility-heading {
        align-items: flex-start;
      }
      .accessibility-metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 1rem;
        margin-block: 1.25rem;
      }
      .accessibility-metrics > div {
        padding: 1rem;
        border: 1px solid var(--border);
        border-radius: 0.7rem;
      }
      .accessibility-metrics strong {
        display: block;
        font-size: 1.5rem;
      }
      .accessibility-metrics span {
        color: var(--muted);
        font-size: 0.85rem;
      }
      .accessibility-state {
        border-top: 1px solid var(--border);
        padding-block: 0.7rem;
      }
      .accessibility-state summary {
        cursor: pointer;
        min-height: 2.75rem;
        border-radius: 0.4rem;
      }
      .accessibility-state summary strong {
        overflow-wrap: anywhere;
      }
      .accessibility-state[open] summary {
        margin-bottom: 0.8rem;
      }
      .accessibility-finding {
        background: var(--canvas);
        border: 1px solid var(--border);
        border-radius: 0.7rem;
        padding: 1rem;
        margin-block: 0.7rem;
      }
      .accessibility-finding p {
        margin-block: 0.75rem;
      }
      @media (max-width: 600px) {
        .accessibility-metrics {
          grid-template-columns: 1fr;
          gap: 0.5rem;
        }
        .accessibility-metrics > div {
          padding: 0.75rem;
        }
      }
    `,
  ],
})
export class AccessibilityReview {
  public readonly runId = input.required<string>();
  public readonly coverage = input<AccessibilityCoverage[]>([]);
  public readonly expected = input(0);
  public readonly terminal = input(false);
  public readonly page = signal(1);
  public readonly pageCount = computed(() => Math.max(1, Math.ceil(this.coverage().length / 10)));
  public readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));
  public readonly pageRows = computed(() =>
    this.coverage().slice((this.currentPage() - 1) * 10, this.currentPage() * 10),
  );
  public readonly checked = computed(
    () => this.coverage().filter((row) => row.checkpoint?.status === 'checked').length,
  );
  public readonly findings = computed(() =>
    this.coverage().reduce((count, row) => count + (row.checkpoint?.violations.length ?? 0), 0),
  );
  public readonly manual = computed(() =>
    this.coverage().reduce((count, row) => count + (row.checkpoint?.incomplete ?? 0), 0),
  );
  public status(row: AccessibilityCoverage): string {
    const check = row.checkpoint;
    if (check?.status !== 'checked') {
      return 'Not checked';
    }
    if (check.violations.length) {
      return `${check.violations.length} ${check.violations.length === 1 ? 'finding' : 'findings'}`;
    }
    return check.incomplete || check.truncated ? 'Needs manual review' : 'No automated violations';
  }
  public reason(reason?: string): string {
    switch (reason) {
      case 'sensitive':
        return 'Scan omitted because this test handles sensitive data.';
      case 'target-not-approved':
        return 'Scan omitted because the final page is outside the controlled storefront.';
      case 'page-unavailable':
        return 'The browser page was unavailable for scanning.';
      default:
        return 'The scan could not finish. This state has not passed an accessibility check.';
    }
  }
}
