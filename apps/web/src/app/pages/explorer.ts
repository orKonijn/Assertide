import { DatePipe } from '@angular/common';
import type { ElementRef } from '@angular/core';
import {
  afterRenderEffect,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import type { Environment, Suite, TestCase } from '../core/api';
import { Api, errorMessage } from '../core/api';
import type { ExplorerView, TestHistory } from '../core/explorer-history';
import { readExplorerViews, typicalDuration } from '../core/explorer-history';
import { LoadingState } from '../core/loading-state';
import { Modal } from '../core/modal';
import { readSelectionDraft, writeSelectionDraft } from '../core/selection-draft';
@Component({
  imports: [FormsModule, LoadingState, Modal, DatePipe],
  styles: [
    `
      .split {
        display: block;
      }
      .selection-bar {
        position: sticky;
        bottom: 1rem;
        z-index: 8;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;
        margin-top: 1rem;
        padding: 1rem;
        border: 1px solid var(--border);
        border-radius: 0.75rem;
        background: var(--surface);
        box-shadow: 0 4px 20px #0002;
      }
      .history-outcomes {
        display: flex;
        gap: 0.4rem;
        flex-wrap: wrap;
        margin: 0.5rem 0;
      }
      .history-outcomes span {
        border: 1px solid var(--border);
        border-radius: 0.3rem;
        padding: 0.15rem 0.35rem;
        font-size: 0.7rem;
      }
      .history-outcomes .passed {
        color: var(--success);
      }
      .history-outcomes .failed {
        color: var(--danger);
      }
      .filter-chips {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
        margin: 0.75rem 0;
      }
      .group-row th {
        background: var(--surface);
        padding: 0.8rem;
      }
      .launch-panel {
        width: min(40rem, 100vw);
        margin: 0 0 0 auto;
        max-height: 100dvh;
        height: 100dvh;
        border-radius: 0;
        padding: 1.5rem;
        overflow: auto;
      }
      .launch-panel::backdrop {
        background: #0007;
      }
      .saved-view-tools {
        display: flex;
        gap: 0.6rem;
        align-items: end;
        flex-wrap: wrap;
      }
      .saved-view-tools label {
        flex: 1;
        min-width: 10rem;
      }
      .case-history {
        font-size: 0.8rem;
        margin: 0.4rem 0;
      }
      .catalog-cards td {
        padding-block: 0.65rem;
      }
      .catalog-cards details {
        padding: 0;
        margin: 0.25rem 0;
        border: 0;
        background: transparent;
      }
      .catalog-cards details > summary {
        padding: 0.25rem 0;
        min-height: 32px;
      }
      .view-options,
      .history-scope {
        margin: 0.6rem 0;
        padding: 0.5rem 0.75rem;
      }
      .view-options > summary,
      .history-scope > summary {
        cursor: pointer;
        font-size: 0.8rem;
      }
      .saved-view-tools {
        margin-top: 0.75rem;
      }
      .catalog-filters {
        display: grid;
        grid-template-columns: minmax(160px, 1.5fr) repeat(5, minmax(105px, 1fr));
        gap: 0.75rem;
      }
      .catalog-filters label {
        min-width: 0;
      }
      @media (max-width: 1200px) {
        .catalog-filters {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      .selection-bar p {
        margin: 0;
      }
      @media (max-width: 700px) {
        .launch-panel {
          width: 100vw;
          max-width: 100vw;
        }
        .catalog-filters {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.5rem;
        }
        .catalog-filters label:first-child {
          grid-column: 1/-1;
        }
      }
    `,
  ],
  template: `
    <header class="page-header explorer-heading">
      <div>
        <p class="eyebrow">
          Test catalog
          <span class="catalog-revision">{{ revision().slice(0, 12) || 'Loading revision' }}</span>
        </p>
        <h1>Test explorer</h1>
        <p class="muted">Select approved tests from the local Lab catalog.</p>
      </div>
      <div class="explorer-header-actions">
        @if (selected().length) {
          <button type="button" (click)="clearSelection()">Clear selection</button>
        }
        <span class="selection-count" role="status">{{ selected().length }} selected</span>
        <button
          class="primary"
          [disabled]="!selected().length || starting() || api.identity()?.role === 'viewer'"
          (click)="configurationOpen.set(true)"
        >
          Run selected
        </button>
      </div>
    </header>
    @if (draftMessage()) {
      <p role="status" class="muted">{{ draftMessage() }}</p>
    }
    @if (error() && !editing()) {
      <p class="error" role="alert">{{ error() }} <button (click)="load()">Retry</button></p>
    }
    @if (editing(); as test) {
      <dialog
        appModal
        class="workspace-modal metadata-dialog"
        aria-label="Edit test metadata"
        (dismissed)="editing.set(null)"
      >
        <header class="editor-heading">
          <div>
            <p class="eyebrow">
              TEST DETAILS <span class="badge">{{ test.id }}</span>
            </p>
            <h2>Edit test metadata</h2>
            <p class="muted">{{ test.title }}</p>
          </div>
          <button
            type="button"
            class="editor-close"
            aria-label="Close test editor"
            (click)="editing.set(null)"
          >
            &times;
          </button>
        </header>
        <form (ngSubmit)="saveMetadata()" class="metadata-editor">
          @if (error()) {
            <div class="error editor-request-error" #saveError tabindex="-1" role="alert">
              <strong>Changes were not saved.</strong>
              <p>{{ error() }}</p>
              <p>
                Your changes are preserved. Retry Save, or cancel and reopen to load the latest
                metadata after a conflict.
              </p>
            </div>
          }

          <div class="editor-fields">
            <label
              >Feature<input name="feature" [(ngModel)]="feature" required maxlength="120"
            /></label>
            <label>Module<input name="module" [(ngModel)]="module" maxlength="120" /></label>
            <label>Test owner<input name="owner" [(ngModel)]="owner" maxlength="120" /></label>
            <label
              >Test priority<select name="priority" [(ngModel)]="editPriority">
                <option>P0</option>
                <option>P1</option>
                <option>P2</option>
              </select></label
            >
            <label class="editor-wide"
              >Test tags<input name="tags" [(ngModel)]="tags" maxlength="1000" /><span
                class="muted editor-hint"
                >Separate tags with commas.</span
              ></label
            >
          </div>
          <section class="editor-behavior" aria-label="Execution behavior">
            <h3>Execution behavior</h3>
            <label class="editor-toggle"
              ><input
                name="enabled"
                aria-label="Enabled for future selections"
                aria-describedby="enabled-help"
                type="checkbox"
                [(ngModel)]="enabled"
              /><span
                ><strong>Enabled for future selections</strong
                ><small id="enabled-help"
                  >Make this test available when building a run.</small
                ></span
              ></label
            >
            <label class="editor-toggle"
              ><input
                name="quarantined"
                aria-label="Quarantine future results"
                aria-describedby="quarantine-help"
                type="checkbox"
                [(ngModel)]="quarantined"
              /><span
                ><strong>Quarantine future results</strong
                ><small id="quarantine-help"
                  >Exclude this test from headline metrics while investigating.</small
                ></span
              ></label
            >
          </section>
          <footer class="editor-footer">
            <span class="muted">Changes apply to future runs.</span>
            <div class="actions">
              <button type="button" (click)="editing.set(null)">Cancel metadata edit</button
              ><button class="primary" [disabled]="saving()">Save test metadata</button>
            </div>
          </footer>
        </form>
      </dialog>
    }
    <div class="split">
      <section class="card explorer-catalog">
        <div class="toolbar catalog-filters">
          <label
            >Search tests<input
              [ngModel]="query()"
              (ngModelChange)="search($event)"
              placeholder="Case ID, title or feature"
          /></label>
          <label
            >Kind<select
              aria-label="Test kind"
              [ngModel]="kind()"
              (ngModelChange)="kind.set($event); search(query())"
            >
              <option value="all">All tests</option>
              <option value="api">API</option>
              <option value="ui">Browser</option>
            </select></label
          >
          <label
            >Priority<select
              aria-label="Priority"
              [ngModel]="priority()"
              (ngModelChange)="priority.set($event); search(query())"
            >
              <option value="all">All priorities</option>
              <option>P0</option>
              <option>P1</option>
              <option>P2</option>
            </select></label
          >
          <label
            >History filter<select
              aria-label="History filter"
              [ngModel]="historyFilter()"
              (ngModelChange)="historyFilter.set($event); page.set(1)"
            >
              <option value="all">Any history</option>
              <option value="never">Never run</option>
              <option value="failed">Recently failed (7 days)</option>
            </select></label
          >
          <label
            >History browser<select
              aria-label="History browser"
              [ngModel]="historyBrowser()"
              (ngModelChange)="historyBrowser.set($event); page.set(1)"
            >
              <option>chromium</option>
              <option>firefox</option>
              <option>webkit</option>
            </select></label
          >
          <label
            >Group by<select
              aria-label="Group by"
              [ngModel]="group()"
              (ngModelChange)="group.set($event); page.set(1)"
            >
              <option value="none">No grouping</option>
              <option value="feature">Feature</option>
              <option value="kind">Test type</option>
              <option value="suite">Suite</option>
            </select></label
          >
        </div>
        <details class="view-options">
          <summary>Saved views</summary>
          <div class="saved-view-tools">
            <label
              >Saved view<select
                aria-label="Saved view"
                [ngModel]="''"
                (ngModelChange)="restoreView($event)"
              >
                <option value="">Choose saved view</option>
                @for (view of views(); track view.name) {
                  <option [value]="view.name">{{ view.name }}</option>
                }
              </select></label
            >
            <label>View name<input [(ngModel)]="viewName" maxlength="60" /></label
            ><button (click)="saveView()" [disabled]="!viewName.trim()">Save view</button
            ><button (click)="deleteView()" [disabled]="!viewName.trim()">Delete named view</button>
          </div>
        </details>
        <div class="filter-chips" aria-label="Applied filters">
          @if (query()) {
            <button (click)="search('')">Search: {{ query() }} ×</button>
          }
          @if (kind() !== 'all') {
            <button (click)="kind.set('all'); search(query())">Kind: {{ kind() }} ×</button>
          }
          @if (priority() !== 'all') {
            <button (click)="priority.set('all'); search(query())">
              Priority: {{ priority() }} ×
            </button>
          }
          @if (historyFilter() !== 'all') {
            <button (click)="historyFilter.set('all'); page.set(1)">
              History: {{ historyFilter() }} ×
            </button>
          }
          <button (click)="clearFilters()">Clear filters</button>
        </div>
        <details class="history-scope">
          <summary>
            History scope: {{ historyBrowser() }} and API · {{ environmentId }} · current revision
          </summary>
          <p class="muted">
            Never run means no recorded result in this scope. Recently failed checks the last five
            outcomes for failures within seven days. Suite grouping uses the first matching suite by
            name. Saved views stay on this device.
          </p>
        </details>
        @if (historyLoading()) {
          <p role="status">Loading execution history…</p>
        }
        @if (historyError()) {
          <p role="alert">
            {{ historyError() }} <button (click)="loadHistory()">Retry history</button>
          </p>
        }
        @if (loading()) {
          <app-loading-state label="Discovering catalog…" />
        } @else {
          <nav class="catalog-pagination" aria-label="Test pages">
            <div class="catalog-selection-tools">
              <button
                (click)="selectAll()"
                [disabled]="loading() || !filtered().length"
                [title]="
                  allSelected()
                    ? 'Deselect all matching tests'
                    : 'Select all enabled matching tests across every page'
                "
              >
                {{ allSelected() ? 'Deselect all' : 'Select all' }}
              </button>
              <span class="muted" role="status"
                >{{ filtered().length }} tests · Page {{ currentPage() }} of {{ pageCount() }}</span
              >
            </div>
            <label class="catalog-sort"
              >Sort by<select
                aria-label="Sort tests"
                [ngModel]="sort()"
                (ngModelChange)="sort.set($event); search(query())"
              >
                <option value="id-asc">Case ID · ascending</option>
                <option value="id-desc">Case ID · descending</option>
                <option value="title-asc">Title · A–Z</option>
                <option value="title-desc">Title · Z–A</option>
                <option value="feature-asc">Feature · A–Z</option>
                <option value="feature-desc">Feature · Z–A</option>
                <option value="priority-asc">Priority · P0 first</option>
                <option value="priority-desc">Priority · P2 first</option>
              </select></label
            >
            <div class="catalog-page-buttons">
              <button
                (click)="page.set(currentPage() - 1)"
                [disabled]="currentPage() === 1"
                aria-label="Previous test page"
              >
                ‹
              </button>
              @for (number of pageNumbers(); track number) {
                <button
                  (click)="page.set(number)"
                  [attr.aria-label]="'Test page ' + number"
                  [attr.aria-current]="currentPage() === number ? 'page' : null"
                >
                  {{ number }}
                </button>
              }
              <button
                (click)="page.set(currentPage() + 1)"
                [disabled]="currentPage() === pageCount()"
                aria-label="Next test page"
              >
                ›
              </button>
            </div>
          </nav>
          <div class="table-wrap">
            <table class="mobile-result-cards catalog-cards" role="table">
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Test case</th>
                  <th class="hide-mobile">Feature</th>
                  <th class="hide-mobile">Priority</th>
                </tr>
              </thead>
              <tbody>
                @for (test of pageTests(); track test.id; let i = $index) {
                  @if (
                    group() !== 'none' &&
                    (i === 0 || groupFor(test) !== groupFor(pageTests()[i - 1]))
                  ) {
                    <tr class="group-row">
                      <th colspan="4" scope="rowgroup">{{ groupFor(test) }}</th>
                    </tr>
                  }
                  <tr [class.case-selected]="selected().includes(test.id)">
                    <td data-label="Select">
                      <label class="case-selection">
                        <input
                          type="checkbox"
                          [checked]="selected().includes(test.id)"
                          [disabled]="!test.enabled"
                          (change)="toggle(test.id)"
                          [attr.aria-label]="'Select ' + test.id"
                        />
                      </label>
                    </td>
                    <td data-label="Test case">
                      <div class="case-heading">
                        <strong>{{ test.id }}</strong
                        ><span class="badge mobile-priority">{{ test.priority }}</span>
                        @if (canEdit()) {
                          <button
                            class="case-edit icon-button"
                            (click)="edit(test)"
                            [attr.aria-label]="'Edit ' + test.id"
                            [title]="'Edit ' + test.id"
                          >
                            <svg
                              aria-hidden="true"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="1.8"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            >
                              <path d="m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5" />
                            </svg>
                          </button>
                        }
                      </div>
                      <div class="case-title">{{ test.title }}</div>
                      <div
                        class="history-outcomes"
                        [attr.aria-label]="'Recent outcomes for ' + test.id"
                      >
                        @for (item of recent(test.id); track item.runId) {
                          <span
                            [class.passed]="item.status === 'passed'"
                            [class.failed]="['failed', 'timedOut', 'broken'].includes(item.status)"
                            [title]="item.endedAt"
                            >{{ item.status }}</span
                          >
                        }
                      </div>
                      <p class="muted case-history">
                        {{ test.kind }} · {{ test.priority }} · Last run:
                        {{
                          recent(test.id)[0]?.endedAt
                            ? (recent(test.id)[0].endedAt | date: 'short')
                            : historyState()
                        }}
                        · Typical: {{ durationLabel(test.id) }}
                      </p>
                      <details>
                        <summary>Test details</summary>
                        <p class="muted case-source">
                          {{ test.file }}:{{ test.line }} · {{ test.tags.join(', ') }}
                        </p>
                        <p>
                          Owner: {{ test.owner || 'Unassigned' }} · Module:
                          {{ test.module || 'None' }}
                        </p>
                      </details>
                      @if (!test.enabled) {
                        <span class="badge">Disabled</span>
                      }
                    </td>
                    <td class="hide-mobile">{{ test.feature }}</td>
                    <td class="hide-mobile" data-label="Priority">
                      <span class="badge">{{ test.priority }}</span>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="4" class="empty">No tests match your search.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
      @if (configurationOpen()) {
        <dialog
          appModal
          class="card execution-config launch-panel"
          aria-label="Configure execution"
          (dismissed)="configurationOpen.set(false)"
        >
          <button (click)="configurationOpen.set(false)">Close configuration</button>
          <h2>Configure execution</h2>
          @if (!environmentId) {
            <p role="alert">Choose an enabled environment before starting.</p>
          }
          @if (error()) {
            <p role="alert">{{ error() }}</p>
          }
          <p>
            {{ selected().length }} cases · {{ executionCount() }} executions · up to
            {{ retries }} retries per test
          </p>
          <p>{{ estimate() }}</p>
          <p class="muted">
            Estimate uses at least three comparable samples per selected case/browser, excludes
            provisioning and evidence transfer, and is not a guarantee.
          </p>
          @if (hasUi()) {
            <label><input type="checkbox" [(ngModel)]="accessibility" />Check accessibility</label>
            <p class="muted">
              Scan the final browser state with axe. Findings are advisory and do not change
              functional test outcomes.
            </p>
            @if (canHeaded()) {
              <label
                ><input type="checkbox" [(ngModel)]="headed" />Headed browser in a virtual
                display</label
              >
            }
            <label
              >Video<select [(ngModel)]="video">
                <option value="off">Off</option>
                <option value="retain-on-failure">Retain on failure</option>
              </select></label
            >
            <label
              >Browser<select aria-label="Browser" [(ngModel)]="browser">
                <option>chromium</option>
                <option>firefox</option>
                <option>webkit</option>
              </select></label
            >
            <fieldset>
              <legend>Additional browsers</legend>
              @for (extra of ['chromium', 'firefox', 'webkit']; track extra) {
                @if (extra !== browser) {
                  <label
                    ><input
                      type="checkbox"
                      [checked]="additionalBrowsers().includes(extra)"
                      (change)="toggleBrowser(extra)"
                    />{{ extra }}</label
                  >
                }
              }
            </fieldset>
          }
          <label
            ><input type="checkbox" [(ngModel)]="performance" />Benchmark catalog performance</label
          >
          <p class="muted">
            Runs once after your selected tests and all retries finish. Measures the controlled
            catalog three times in headless Chromium. Your test selection, browser, workers and
            retries stay unchanged. Available in Local Lab; budgets are advisory.
          </p>
          @if (performanceIssue(); as issue) {
            <p role="status" class="muted">{{ issue }}</p>
          }
          <label
            >Environment<select
              aria-label="Environment"
              [(ngModel)]="environmentId"
              (ngModelChange)="loadHistory()"
            >
              @for (environment of environments(); track environment.id) {
                <option [value]="environment.id" [disabled]="!environment.enabled">
                  {{ environment.name }}
                </option>
              }
            </select></label
          ><label>Workers<input type="number" min="1" max="4" [(ngModel)]="workers" /></label
          ><label>Retries<input type="number" min="0" max="2" [(ngModel)]="retries" /></label>
          <p class="muted">
            Selection and configuration are frozen when the run starts. API tests do not launch a
            browser.
          </p>
          <button
            class="primary"
            [disabled]="
              !selected().length ||
              !environmentId ||
              starting() ||
              !!performanceIssue() ||
              api.identity()?.role === 'viewer'
            "
            (click)="start()"
          >
            {{ starting() ? 'Starting…' : 'Start execution' }}
          </button>
        </dialog>
      }
    </div>
    <div class="selection-bar">
      <div>
        <p>{{ selected().length }} tests selected</p>
        <small>{{ executionCount() }} executions · selections stay across pages and filters</small>
      </div>
      <button (click)="clearSelection()">Clear selected tests</button
      ><button
        class="primary"
        [disabled]="!selected().length || starting() || api.identity()?.role === 'viewer'"
        (click)="configurationOpen.set(true)"
      >
        Run selected
      </button>
    </div>
  `,
})
export class Explorer {
  public readonly configurationOpen = signal(false);
  public readonly historyItems = signal<TestHistory[]>([]);
  public readonly historyError = signal('');
  public readonly historyLoading = signal(true);
  public readonly historyFilter = signal('all');
  public readonly historyBrowser = signal('chromium');
  public readonly group = signal('none');
  public readonly suites = signal<Suite[]>([]);
  public readonly additionalBrowsers = signal<string[]>([]);
  public readonly views = signal<ExplorerView[]>([]);
  public viewName = '';
  private historyGeneration = 0;
  private readonly saveError = viewChild<ElementRef<HTMLElement>>('saveError');
  public readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  public readonly tests = signal<TestCase[]>([]);
  public readonly revision = signal('');
  public readonly kind = signal(this.route.snapshot.queryParamMap.get('kind') ?? 'all');
  public readonly priority = signal(this.route.snapshot.queryParamMap.get('priority') ?? 'all');
  public readonly query = signal(this.route.snapshot.queryParamMap.get('query') ?? '');
  public readonly sort = signal(this.route.snapshot.queryParamMap.get('sort') ?? 'id-asc');
  public readonly sorted = computed(() => {
    const [field, direction] = this.sort().split('-');
    const key = field === 'title' || field === 'feature' || field === 'priority' ? field : 'id';
    return [...this.filtered()].sort((a, b) => {
      if (this.group() !== 'none') {
        const order = this.groupFor(a).localeCompare(this.groupFor(b));
        if (order) {
          return order;
        }
      }
      const comparison = a[key].localeCompare(b[key], undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return (
        (comparison || a.id.localeCompare(b.id, undefined, { numeric: true })) *
        (direction === 'desc' ? -1 : 1)
      );
    });
  });
  public readonly selected = signal<string[]>([]);
  public readonly draftMessage = signal('');
  private loadedProject = '';
  public readonly loading = signal(true);
  public readonly starting = signal(false);
  public readonly error = signal('');
  public readonly editing = signal<TestCase | null>(null);
  public readonly saving = signal(false);
  public feature = '';
  public module = '';
  public owner = '';
  public tags = '';
  public editPriority = 'P1';
  public enabled = true;
  public quarantined = false;
  public workers = 1;
  public retries = 0;
  public browser = 'chromium';
  public environmentId = 'local-lab';
  public readonly environments = signal<Environment[]>([]);
  public readonly headedAvailable = signal(false);
  public headed = false;
  public accessibility = false;
  public performance = false;
  public video: 'off' | 'retain-on-failure' = 'off';
  public readonly hasUi = computed(() => this.selected().some((id) => id.startsWith('UI-')));
  private key = crypto.randomUUID();
  public readonly filtered = computed(() =>
    this.tests().filter(
      (test) =>
        `${test.id} ${test.title} ${test.feature} ${test.module} ${test.owner} ${test.tags.join(' ')}`
          .toLowerCase()
          .includes(this.query().toLowerCase()) &&
        (this.kind() === 'all' || test.kind === this.kind()) &&
        (this.priority() === 'all' || test.priority === this.priority()) &&
        (this.historyFilter() === 'all' ||
          (!this.historyLoading() &&
            !this.historyError() &&
            (this.historyFilter() === 'never'
              ? this.recent(test.id).length === 0
              : this.recent(test.id).some(
                  (item) =>
                    ['failed', 'timedOut', 'broken'].includes(item.status) &&
                    Date.parse(item.endedAt) >= Date.now() - 7 * 86400000,
                )))),
    ),
  );
  public readonly allSelected = computed(() => {
    const enabled = this.filtered().filter((test) => test.enabled);
    return enabled.length > 0 && enabled.every((test) => this.selected().includes(test.id));
  });
  public readonly page = signal(1);
  public readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / 10)));
  public readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));
  public readonly pageTests = computed(() =>
    this.sorted().slice((this.currentPage() - 1) * 10, this.currentPage() * 10),
  );
  public readonly pageNumbers = computed(() => {
    const start = Math.max(1, Math.min(this.currentPage() - 2, this.pageCount() - 4));
    return Array.from({ length: Math.min(5, this.pageCount()) }, (_, index) => start + index);
  });
  public constructor() {
    afterRenderEffect(() => {
      const region = this.saveError()?.nativeElement;
      if (region && this.error()) {
        region.focus({ preventScroll: true });
        region.scrollIntoView({ block: 'nearest' });
      }
    });
    effect(() => {
      const identity = this.api.identity();
      if (this.loading() || !identity || this.loadedProject !== this.api.projectId()) {
        return;
      }
      if (
        !writeSelectionDraft(this.loadedProject, {
          scope: JSON.stringify([identity.subject, identity.sessionExpiresAt]),
          revision: this.revision(),
          ids: this.selected(),
        })
      ) {
        this.draftMessage.set(
          'Selection cannot be saved in this browser. Keep this page open until you start the run.',
        );
      }
    });
    void this.load();
  }
  public recent(id: string): TestHistory[] {
    const resultId = id.startsWith('UI-') ? `${id}:${this.historyBrowser()}` : id;
    return this.historyItems().filter((item) => item.id === resultId);
  }
  public durationLabel(id: string): string {
    if (this.historyLoading() || this.historyError()) {
      return this.historyState();
    }
    const value = typicalDuration(this.recent(id));
    return value === null ? 'Not enough history' : `${(value / 1000).toFixed(1)}s`;
  }
  public historyState(): string {
    if (this.historyLoading()) {
      return 'Loading history…';
    }
    return this.historyError() ? 'History unavailable' : 'No recorded outcome';
  }
  public groupFor(test?: TestCase): string {
    if (!test) {
      return '';
    }
    if (this.group() === 'suite') {
      return (
        [...this.suites()]
          .sort((a, b) => a.name.localeCompare(b.name))
          .find((s) => s.testIds.includes(test.id))?.name ?? 'No suite'
      );
    }
    return this.group() === 'kind' ? test.kind : test.feature;
  }
  public browsers(): string[] {
    return [...new Set([this.browser, ...this.additionalBrowsers()])];
  }
  public toggleBrowser(browser: string): void {
    this.additionalBrowsers.update((values) =>
      values.includes(browser) ? values.filter((v) => v !== browser) : [...values, browser],
    );
  }
  public executionCount(): number {
    return this.selected().reduce(
      (sum, id) => sum + (id.startsWith('UI-') ? this.browsers().length : 1),
      0,
    );
  }
  public estimate(): string {
    const values: number[] = [];
    for (const id of this.selected()) {
      for (const browser of id.startsWith('UI-') ? this.browsers() : ['api']) {
        const key = browser === 'api' ? id : `${id}:${browser}`;
        const median = typicalDuration(
          this.historyItems().filter((item) => item.id === key && item.retries === this.retries),
        );
        if (median === null) {
          return 'Estimated duration: Not enough history';
        }
        values.push(median);
      }
    }
    if (!values.length) {
      return 'Choose tests to estimate duration';
    }
    return `Estimated testing time: about ${Math.ceil(Math.max(Math.max(...values), values.reduce((a, b) => a + b, 0) / Math.max(1, this.workers)) / 1000)} seconds`;
  }
  public clearFilters(): void {
    this.kind.set('all');
    this.priority.set('all');
    this.historyFilter.set('all');
    this.search('');
  }
  public saveView(): void {
    const name = this.viewName.trim();
    if (!name) {
      return;
    }
    const view: ExplorerView = {
      name,
      query: this.query(),
      kind: this.kind(),
      priority: this.priority(),
      sort: this.sort(),
      history: this.historyFilter(),
      group: this.group(),
      browser: this.historyBrowser(),
      environment: this.environmentId,
    };
    const next = [view, ...this.views().filter((v) => v.name !== name)].slice(0, 20);
    try {
      localStorage.setItem(this.viewKey(), JSON.stringify(next));
      this.views.set(next);
      this.draftMessage.set('View saved on this device.');
    } catch {
      this.draftMessage.set('This browser could not save the view.');
    }
  }
  public deleteView(): void {
    const next = this.views().filter((v) => v.name !== this.viewName.trim());
    try {
      localStorage.setItem(this.viewKey(), JSON.stringify(next));
      this.views.set(next);
    } catch {
      this.draftMessage.set('This browser could not remove the view.');
    }
  }
  public restoreView(name: string): void {
    const view = this.views().find((v) => v.name === name);
    if (!view) {
      return;
    }
    this.viewName = name;
    this.kind.set(view.kind);
    this.priority.set(view.priority);
    this.sort.set(view.sort);
    this.historyFilter.set(view.history);
    this.group.set(view.group);
    this.historyBrowser.set(view.browser);
    this.environmentId = view.environment;
    if (!this.environments().some((item) => item.id === view.environment && item.enabled)) {
      this.environmentId = '';
      this.draftMessage.set(
        'The saved environment is unavailable. Choose an enabled environment in execution settings.',
      );
    }
    this.search(view.query);
    void this.loadHistory();
  }
  public async loadHistory(): Promise<void> {
    const generation = ++this.historyGeneration;
    this.historyError.set('');
    this.historyLoading.set(true);
    this.historyItems.set([]);
    try {
      const result = await this.api.get<{ items: TestHistory[] }>(
        `/projects/${this.api.projectId()}/test-history?${new URLSearchParams({ environment: this.environmentId, revision: this.revision() })}`,
      );
      if (generation === this.historyGeneration) {
        this.historyItems.set(result.items);
      }
    } catch (error) {
      if (generation === this.historyGeneration) {
        this.historyError.set(errorMessage(error));
      }
    } finally {
      if (generation === this.historyGeneration) {
        this.historyLoading.set(false);
      }
    }
  }
  public clearSelection(): void {
    this.selected.set([]);
    writeSelectionDraft(this.api.projectId(), { scope: '', revision: '', ids: [] });
    this.draftMessage.set('Selection cleared.');
    this.key = crypto.randomUUID();
  }
  public canEdit(): boolean {
    return ['administrator', 'maintainer'].includes(this.api.identity()?.role ?? '');
  }
  public edit(test: TestCase): void {
    this.editing.set(test);
    this.feature = test.feature;
    this.module = test.module;
    this.owner = test.owner;
    this.tags = test.tags.join(', ');
    this.editPriority = test.priority;
    this.enabled = test.enabled;
    this.quarantined = test.quarantined ?? false;
  }
  public async saveMetadata(): Promise<void> {
    const current = this.editing();
    if (!current) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      await this.api.patch(
        `/projects/${this.api.projectId()}/catalog/${current.id}`,
        {
          feature: this.feature,
          module: this.module,
          owner: this.owner,
          tags: this.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
          priority: this.editPriority,
          enabled: this.enabled,
          quarantined: this.quarantined,
        },
        current.version,
      );
      this.editing.set(null);
      await this.load();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
  public canHeaded(): boolean {
    return (
      this.headedAvailable() &&
      !!this.environments().find((environment) => environment.id === this.environmentId)
        ?.allowHeaded
    );
  }
  public async load(): Promise<void> {
    this.loading.set(true);
    const project = this.api.projectId();
    try {
      const catalog = await this.api.get<{
        items: TestCase[];
        revision: string;
        discoveryError?: string;
      }>(`/projects/${this.api.projectId()}/catalog`);
      this.tests.set(catalog.items);
      if (!this.loadedProject) {
        const identity = this.api.identity();
        const draft = readSelectionDraft(
          project,
          JSON.stringify([identity?.subject, identity?.sessionExpiresAt]),
        );
        if (draft && identity) {
          if (draft.revision === catalog.revision) {
            this.selected.set(draft.ids);
            this.draftMessage.set(
              'Selection restored for this tab. Review execution settings before starting.',
            );
          } else {
            this.draftMessage.set(
              'The catalog revision changed. Select tests again for the current revision.',
            );
          }
        }
      } else if (this.revision() && this.revision() !== catalog.revision) {
        this.selected.set([]);
        this.draftMessage.set(
          'The catalog revision changed. Select tests again for the current revision.',
        );
      }
      const count = this.selected().length;
      this.selected.update((ids) =>
        ids.filter((id) => catalog.items.some((item) => item.id === id && item.enabled)),
      );
      if (count !== this.selected().length) {
        this.draftMessage.set(
          'Unavailable or disabled tests were removed from your selection. Review the remaining tests before starting.',
        );
      }
      const environments = await this.api.get<{
        items: Environment[];
        capabilities?: { headed: boolean };
      }>(`/projects/${this.api.projectId()}/environments`);
      this.environments.set(environments.items);
      if (!environments.items.some((item) => item.id === this.environmentId && item.enabled)) {
        this.environmentId = environments.items.find((item) => item.enabled)?.id ?? '';
      }
      this.headedAvailable.set(environments.capabilities?.headed ?? false);
      this.revision.set(catalog.revision);
      this.suites.set(
        (await this.api.get<{ items: Suite[] }>(`/projects/${project}/suites`)).items,
      );
      this.views.set(readExplorerViews(this.viewKey()));
      await this.loadHistory();
      this.loadedProject = project;
      this.error.set(catalog.discoveryError ?? '');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
  public search(value: string): void {
    this.page.set(1);
    this.query.set(value);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        query: value || null,
        sort: this.sort() === 'id-asc' ? null : this.sort(),
        kind: this.kind() === 'all' ? null : this.kind(),
        priority: this.priority() === 'all' ? null : this.priority(),
      },
      replaceUrl: true,
    });
  }
  public toggle(id: string): void {
    this.selected.update((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
    this.key = crypto.randomUUID();
  }
  public selectAll(): void {
    if (this.allSelected()) {
      const matching = new Set(this.filtered().map((test) => test.id));
      this.selected.update((ids) => ids.filter((id) => !matching.has(id)));
      this.key = crypto.randomUUID();
      return;
    }
    this.selected.update((ids) => [
      ...new Set([
        ...ids,
        ...this.filtered()
          .filter((test) => test.enabled)
          .map((test) => test.id),
      ]),
    ]);
    this.key = crypto.randomUUID();
  }
  public async start(): Promise<void> {
    if (
      this.starting() ||
      !this.selected().length ||
      !this.environmentId ||
      this.performanceIssue()
    ) {
      return;
    }
    this.starting.set(true);
    this.error.set('');
    try {
      const run = await this.api.launch(
        this.selected(),
        this.key,
        this.workers,
        this.retries,
        this.browser,
        this.revision(),
        this.video,
        this.environmentId,
        this.hasUi() && this.canHeaded() && this.headed,
        undefined,
        this.hasUi() && this.accessibility,
        this.performance,
        this.browsers(),
      );
      this.clearSelection();
      await this.router.navigate(['/runs', run.id]);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.starting.set(false);
    }
  }
  public performanceIssue(): string {
    return this.performance && this.environmentId !== 'local-lab'
      ? 'Catalog performance benchmarking is available in Local Lab. Choose Local Lab or turn off the benchmark.'
      : '';
  }
  private viewKey(): string {
    return `assertide.explorer.views.${this.api.identity()?.subject}.${this.api.projectId()}`;
  }
}
