import { DatePipe } from '@angular/common';
import type { ElementRef } from '@angular/core';
import { Component, computed, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import type { Environment, Run } from '../core/api';
import { Api, errorMessage } from '../core/api';
import { ResultNotes, ResultSteps } from '../core/result-investigation';
import { ScreenshotViewer } from '../core/screenshot-viewer';
@Component({
  imports: [RouterLink, DatePipe, ResultSteps, ResultNotes, ScreenshotViewer],
  styles: [
    'dialog { color: var(--text); background: var(--surface); border: 1px solid var(--border); max-width: min(40rem, 90vw); border-radius: .75rem; } dialog::backdrop { background: #0009; }',
  ],
  template: `
    <dialog #rerunDialog aria-labelledby="rerun-heading">
      <h2 id="rerun-heading">Review rerun</h2>
      <p>
        {{ rerunIds().length }} selected cases · same source revision and frozen execution
        parameters.
      </p>
      <p class="wrap-anywhere">Cases: {{ rerunIds().join(', ') }}</p>
      <p class="wrap-anywhere">Source: {{ run()?.source?.revision }}</p>
      @if (run()?.config; as config) {
        <p>
          Environment: {{ config.environmentId }} ·
          {{ environmentAvailable() ? 'Available' : 'Checking or unavailable' }}
        </p>
        <p>
          {{ config.workers }} workers · {{ config.retries }} retries · Video {{ config.video }} ·
          {{ config.headed ? 'Headed' : 'Headless' }}
        </p>
        <p>Browsers: {{ rerunHasBrowser() ? config.browserProjects.join(', ') : 'API only' }}</p>
      }
      <p>
        Current environment limits and source availability are checked again before queueing. The
        original execution is preserved.
      </p>
      @if (rerunError()) {
        <p class="error" role="alert">{{ rerunError() }}</p>
      }
      <div class="actions">
        <button type="button" autofocus (click)="rerunDialog.close()">Cancel rerun</button>
        <button
          type="button"
          [disabled]="busy() || !environmentAvailable() || !rerunIds().length"
          (click)="startRerun()"
        >
          Start rerun
        </button>
      </div>
    </dialog>
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
      <div class="grid execution-summary">
        <section class="card">
          <h2>Execution phase</h2>
          <p class="metric" role="status">
            <span
              class="status-indicator"
              [attr.data-status]="current.phase"
              aria-hidden="true"
            ></span
            >{{ current.phase }}
          </p>
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
          <details class="frozen-cases">
            <summary>View selected tests</summary>
            <div class="frozen-case-list" aria-label="Selected test identifiers">
              @for (caseId of current.selection.testIds; track caseId) {
                <span class="badge">{{ caseId }}</span>
              }
            </div>
          </details>
          @if (current.source) {
            <p class="muted">Source revision {{ current.source.revision.slice(0, 12) }}</p>
          }
        </section>
        <section class="card execution-report">
          <div class="execution-report-heading">
            <h2>Allure report</h2>
            <span class="badge"
              ><span
                class="status-indicator"
                [attr.data-status]="current.reportPhase"
                aria-hidden="true"
              ></span
              >{{ current.reportPhase }}</span
            >
          </div>
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
          <div class="execution-report-actions">
            @if (
              current.phase === 'completed' && ['ready', 'failed'].includes(current.reportPhase)
            ) {
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
              <a [href]="'/v1/runs/' + id + '/report'" target="_blank" rel="noopener"
                >Open report</a
              >
              <a [href]="'/v1/runs/' + id + '/report-download'">Download report ZIP</a>
            }
          </div>
        </section>
      </div>
      @if (current.toolchain; as tools) {
        <section class="card">
          <h2>Execution environment</h2>
          <p>Allure {{ tools.allure }} · Playwright integration {{ tools.allureIntegration }}</p>
          <p>
            Playwright {{ tools.playwright }} · Node {{ tools.node }} · {{ tools.platform }}/{{
              tools.architecture
            }}
          </p>
          @for (browser of tools.browserBuilds; track browser.name) {
            <p>{{ browser.name }} {{ browser.version }} · build {{ browser.revision }}</p>
          }
          @if (current.workerImage) {
            <p class="muted">
              Isolated worker image:
              <code class="wrap-anywhere">{{ current.workerImage }}</code>
            </p>
          }
        </section>
      }
      <section class="card execution-results">
        <div class="section-heading">
          <h2>Test results</h2>
          @if (current.results?.length) {
            <button
              [disabled]="busy() || !canRerun() || !selected().length"
              (click)="rerun('selected')"
            >
              Rerun checked tests
            </button>
          }
        </div>
        <nav class="result-pagination" aria-label="Result pages">
          <span class="muted" role="status"
            >{{ current.results?.length ?? 0 }} results · Page {{ currentResultPage() }} of
            {{ resultPageCount() }} · {{ selected().length }} checked</span
          >
          <div class="catalog-page-buttons">
            <button
              aria-label="Previous result page"
              [disabled]="currentResultPage() === 1"
              (click)="resultPage.set(currentResultPage() - 1)"
            >
              ‹
            </button>
            @for (number of resultPageNumbers(); track number) {
              <button
                [attr.aria-label]="'Result page ' + number"
                [attr.aria-current]="currentResultPage() === number ? 'page' : null"
                (click)="resultPage.set(number)"
              >
                {{ number }}
              </button>
            }
            <button
              aria-label="Next result page"
              [disabled]="currentResultPage() === resultPageCount()"
              (click)="resultPage.set(currentResultPage() + 1)"
            >
              ›
            </button>
          </div>
        </nav>
        <div class="table-wrap">
          <table class="result-table mobile-result-cards" role="table" aria-label="Test results">
            <thead>
              <tr>
                <th>Select</th>
                <th>Test result</th>
                <th>Duration</th>
                <th>Attempts</th>
              </tr>
            </thead>
            <tbody>
              @for (result of pageResults(); track result.id) {
                <tr>
                  <td data-label="Select">
                    <input
                      type="checkbox"
                      [checked]="selected().includes(result.id.split(':')[0])"
                      (change)="toggle(result.id.split(':')[0])"
                      [attr.aria-label]="'Select ' + result.id + ' for rerun'"
                    />
                  </td>
                  <td data-label="Test result">
                    <details
                      [open]="focusedResult() === result.id"
                      (toggle)="toggleResult(result.id, $event)"
                    >
                      <summary>
                        <span
                          class="status-indicator"
                          [attr.data-status]="result.status"
                          aria-hidden="true"
                        ></span
                        >{{ result.id }} · {{ result.status }}
                      </summary>
                      <a [routerLink]="['/runs', id]" [queryParams]="{ result: result.id }"
                        >Link to this result</a
                      >
                      <p>{{ result.title }}</p>
                      @if (result.assertion; as values) {
                        <dl>
                          <dt>Expected</dt>
                          <dd>
                            <pre>{{ values.expected }}</pre>
                          </dd>
                          <dt>Actual</dt>
                          <dd>
                            <pre>{{ values.actual }}</pre>
                          </dd>
                        </dl>
                      }
                      @if (result.quarantined) {
                        <p class="badge">Quarantined · excluded from headline metrics</p>
                      }
                      @if (result.expectedFailure) {
                        <p class="badge">Expected failure</p>
                      }
                      @if (result.status === 'passed' && (result.attempts?.length ?? 0) > 1) {
                        <p class="badge">Passed after retry</p>
                      }
                      @if (result.category && result.category !== 'none') {
                        <p>
                          Failure category: {{ result.category }} · rules
                          {{ result.categoryRuleVersion }}. This classification is a starting point
                          for investigation.
                        </p>
                      }
                      @for (attempt of result.attempts ?? []; track $index) {
                        <p>
                          Attempt {{ $index + 1 }} · {{ attempt.status }} · {{ attempt.duration }}ms
                        </p>
                        @if (attempt.steps?.length) {
                          <app-result-steps [steps]="attempt.steps" />
                        }
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
                            <p>
                              Attempt {{ artifact.attempt }} ·
                              {{ artifact.createdAt | date: 'short' }}
                            </p>
                            @if (artifact.unavailableReason) {
                              <p>{{ artifact.name }}: {{ artifact.unavailableReason }}</p>
                            } @else {
                              @if (artifact.name === 'screenshot') {
                                <app-screenshot-viewer
                                  [url]="'/v1/runs/' + id + '/artifacts/' + artifact.id"
                                  [description]="result.title + ' · attempt ' + artifact.attempt"
                                />
                              }
                              @if (artifact.name === 'trace') {
                                <a
                                  [href]="'/v1/runs/' + id + '/traces/' + artifact.id"
                                  target="_blank"
                                  rel="noopener"
                                  >Open private trace viewer</a
                                >
                              }
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
                      @if (expanded().includes(result.id)) {
                        <app-result-notes [runId]="id" [resultId]="result.id" />
                      }
                    </details>
                    <p class="result-title">{{ result.title }}</p>
                  </td>
                  <td data-label="Duration">{{ result.duration }} ms</td>
                  <td data-label="Attempts">{{ result.attempts?.length || 1 }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="4" class="empty">
                    Results appear as execution finishes. No outcomes have been recorded yet.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
      <section class="card">
        <h2>Worker log</h2>
        <pre tabindex="0" aria-label="Worker log">{{
          current.logTail || 'Waiting for worker output.'
        }}</pre>
      </section>
      @if (history().length) {
        <section class="card">
          <h2>Compatible execution history</h2>
          <p class="muted">
            Same project, environment, selection family and browser configuration.
          </p>
          @for (entry of history(); track entry.runId) {
            <p>
              <a [routerLink]="['/runs', entry.runId]">{{ entry.runId.slice(0, 8) }}</a> ·
              {{ entry.endedAt | date: 'short' }} ·
              {{ entry.reportAvailable ? 'Report available' : 'Report expired; results retained' }}
            </p>
          }
        </section>
      }
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
  public readonly api = inject(Api);
  private readonly router = inject(Router);
  public id = '';
  public readonly history = signal<{ runId: string; endedAt: string; reportAvailable: boolean }[]>(
    [],
  );
  public readonly run = signal<Run | null>(null);
  public readonly resultPage = signal<number | null>(null);
  public readonly resultPageCount = computed(() =>
    Math.max(1, Math.ceil((this.run()?.results?.length ?? 0) / 10)),
  );
  public readonly currentResultPage = computed(() => {
    const index = (this.run()?.results ?? []).findIndex(
      (result) => result.id === this.focusedResult(),
    );
    return Math.max(
      1,
      Math.min(
        this.resultPage() ?? Math.floor(Math.max(0, index) / 10) + 1,
        this.resultPageCount(),
      ),
    );
  });
  public readonly pageResults = computed(() =>
    (this.run()?.results ?? []).slice(
      (this.currentResultPage() - 1) * 10,
      this.currentResultPage() * 10,
    ),
  );
  public readonly resultPageNumbers = computed(() => {
    const start = Math.max(1, Math.min(this.currentResultPage() - 2, this.resultPageCount() - 4));
    return Array.from({ length: Math.min(5, this.resultPageCount()) }, (_, index) => start + index);
  });
  public readonly error = signal('');
  public readonly busy = signal(false);
  private readonly rerunDialog = viewChild.required<ElementRef<HTMLDialogElement>>('rerunDialog');
  public readonly rerunIds = signal<string[]>([]);
  public readonly rerunError = signal('');
  public readonly environmentAvailable = signal(false);
  private rerunMode: 'all' | 'failed' | 'selected' = 'all';
  public readonly disconnected = signal(false);
  public readonly selected = signal<string[]>([]);
  public readonly focusedResult = signal('');
  public readonly expanded = signal<string[]>([]);
  private stream: EventSource | undefined;
  private lastSequence = 0;
  private loadGeneration = 0;
  private accessRevoked = false;
  public constructor() {
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.focusedResult.set(params.get('result') ?? '');
        this.resultPage.set(null);
      });
    inject(DestroyRef).onDestroy(() => {
      this.accessRevoked = true;
      this.loadGeneration++;
      this.stream?.close();
    });
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.id = params.get('id') ?? '';
        this.loadGeneration++;
        this.accessRevoked = false;
        this.error.set('');
        this.run.set(null);
        this.history.set([]);
        this.selected.set([]);
        this.resultPage.set(null);
        this.expanded.set([]);
        this.lastSequence = 0;
        this.connect();
      });
  }
  public toggleResult(id: string, event: Event): void {
    const open = (event.target as HTMLDetailsElement).open;
    this.expanded.update((items) =>
      open ? [...new Set([...items, id])] : items.filter((item) => item !== id),
    );
  }
  public canRerun(): boolean {
    return (
      this.api.identity()?.role !== 'viewer' &&
      ['completed', 'canceled', 'infrastructure_error', 'timed_out'].includes(
        this.run()?.phase ?? '',
      )
    );
  }
  public hasFailures(): boolean {
    return (
      this.run()?.results?.some((result) =>
        ['failed', 'timedOut', 'broken', 'interrupted'].includes(result.status),
      ) ?? false
    );
  }
  public toggle(id: string): void {
    this.selected.update((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  }
  public async load(): Promise<void> {
    if (this.accessRevoked) {
      return;
    }
    const id = this.id;
    const generation = ++this.loadGeneration;
    const current = (): boolean =>
      generation === this.loadGeneration && id === this.id && !this.accessRevoked;
    try {
      const run = await this.api.get<Run>(`/runs/${id}`);
      if (!current()) {
        return;
      }
      this.run.set(run);
      this.history.set([]);
      if (run.historyStream) {
        const data = await this.api.get<{
          items: { runId: string; endedAt: string; reportAvailable: boolean }[];
        }>(`/runs/${id}/history`);
        if (!current()) {
          return;
        }
        this.history.set(data.items);
      }
      this.error.set('');
    } catch (error) {
      if (!current()) {
        return;
      }
      this.error.set(errorMessage(error));
    }
  }
  public async cancel(): Promise<void> {
    if (
      !confirm(
        'Stop this execution? Completed results are preserved; active and pending tests will be canceled.',
      )
    ) {
      return;
    }
    this.busy.set(true);
    try {
      this.run.set(await this.api.post<Run>(`/runs/${this.id}/cancel`, {}));
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
  public async rerun(mode: 'all' | 'failed' | 'selected' = 'all'): Promise<void> {
    this.rerunMode = mode;
    const run = this.run();
    if (mode === 'selected') {
      this.rerunIds.set([...this.selected()]);
    } else if (mode === 'all') {
      this.rerunIds.set([...(run?.selection.testIds ?? [])]);
    } else {
      this.rerunIds.set([
        ...new Set(
          (run?.results ?? [])
            .filter((result) =>
              ['failed', 'timedOut', 'broken', 'interrupted'].includes(result.status),
            )
            .map((result) => result.caseId ?? result.id.split(':')[0]),
        ),
      ]);
    }
    this.rerunError.set('');
    this.environmentAvailable.set(false);
    this.rerunDialog().nativeElement.showModal();
    try {
      const environments = await this.api.get<{ items: Environment[] }>(
        `/projects/${run?.projectId}/environments`,
      );
      this.environmentAvailable.set(
        environments.items.some((item) => item.id === run?.config?.environmentId && item.enabled),
      );
      if (!this.environmentAvailable()) {
        this.rerunError.set(
          'The original environment is unavailable. Ask an administrator to restore its policy.',
        );
      }
    } catch (error) {
      this.rerunError.set(errorMessage(error));
    }
  }
  public rerunHasBrowser(): boolean {
    return this.rerunIds().some((id) => id.startsWith('UI-'));
  }
  public async startRerun(): Promise<void> {
    this.busy.set(true);
    try {
      const run = await this.api.post<Run>(
        `/runs/${this.id}/reruns`,
        {
          mode: this.rerunMode,
          ...(this.rerunMode === 'selected' ? { testIds: this.rerunIds() } : {}),
        },
        crypto.randomUUID(),
      );
      this.rerunDialog().nativeElement.close();
      await this.router.navigateByUrl('/runs');
      await this.router.navigate(['/runs', run.id]);
    } catch (error) {
      this.rerunError.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
  public async rebuild(): Promise<void> {
    this.busy.set(true);
    try {
      this.run.set(await this.api.post<Run>(`/runs/${this.id}/report-rebuilds`, {}));
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
  private connect(): void {
    this.stream?.close();
    const stream = (this.stream = new EventSource(`/v1/runs/${this.id}/events`));
    const current = (): boolean => this.stream === stream && !this.accessRevoked;
    stream.onopen = () => {
      if (!current()) {
        return;
      }
      this.disconnected.set(false);
      void this.load();
    };
    stream.onerror = () => {
      if (current()) {
        this.disconnected.set(true);
      }
    };
    stream.addEventListener('resync', () => {
      if (!current()) {
        return;
      }
      this.lastSequence = 0;
      void this.load();
    });
    stream.addEventListener('update', (event: MessageEvent<string>) => {
      if (!current()) {
        return;
      }
      const sequence = Number(event.lastEventId);
      if (Number.isSafeInteger(sequence) && sequence > this.lastSequence) {
        this.lastSequence = sequence;
        void this.load();
      }
    });
    stream.addEventListener('access_revoked', () => {
      if (!current()) {
        return;
      }
      this.accessRevoked = true;
      this.loadGeneration++;
      stream.close();
      this.run.set(null);
      this.history.set([]);
      this.error.set('');
      this.api.identity.set(null);
    });
    void this.load();
  }
}
