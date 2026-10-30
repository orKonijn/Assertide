import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import type { Run, TestCase } from '../core/api';
import { Api, errorMessage } from '../core/api';
import { JsonEvidence } from '../core/json-evidence';

@Component({
  imports: [FormsModule, DatePipe, RouterLink, JsonEvidence],
  styles: [
    `
      .split {
        grid-template-columns: minmax(240px, 0.8fr) minmax(0, 1.6fr);
      }
      @media (max-width: 850px) {
        .split {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ],
  template: `<header class="page-header">
      <div>
        <p class="eyebrow">REQUEST AND RESPONSE EVIDENCE</p>
        <h1>API workspace</h1>
        <p class="muted">Investigate recorded contract checks against the controlled Lab.</p>
      </div>
      <button
        class="primary"
        [disabled]="busy() || !executableTests().length || api.identity()?.role === 'viewer'"
        (click)="start()"
      >
        Run API suite
      </button>
    </header>
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    <section class="card api-context">
      <div>
        <p class="eyebrow">CONTROLLED LAB</p>
        <h2>Orders contract</h2>
        <p>
          {{ executableTests().length }} executable API cases · {{ tests().length }} total · GET,
          POST, PUT, PATCH and DELETE · browserless execution
        </p>
        <p class="muted">
          Authentication credentials and fixture control headers are excluded from recorded
          exchanges.
        </p>
      </div>
      <div class="api-execution-picker">
        <label
          >Execution<select
            aria-label="Execution"
            [ngModel]="selectedRun()?.id ?? ''"
            (ngModelChange)="choose($event)"
          >
            <option value="">Choose an execution</option>
            @for (run of runs(); track run.id) {
              <option [value]="run.id">
                {{ run.createdAt | date: 'short' }} · {{ run.phase }} · {{ run.id.slice(0, 8) }}
              </option>
            }
          </select></label
        >
        @if (selectedRun(); as current) {
          <a [routerLink]="['/runs', current.id]">Open execution and Allure</a>
        }
      </div>
    </section>
    @if (selectedRun(); as run) {
      <div class="split api-workspace-layout">
        <section class="card exchange-browser">
          <div class="exchange-list-heading">
            <h2>Recorded exchanges</h2>
            <span class="badge">{{ exchanges().length }}</span>
          </div>
          <nav class="exchange-pagination" aria-label="Exchange pages">
            <span class="muted">Page {{ currentPage() }} of {{ pageCount() }}</span>
            <div class="catalog-page-buttons">
              <button
                aria-label="Previous exchange page"
                [disabled]="currentPage() === 1"
                (click)="page.set(currentPage() - 1)"
              >
                ‹
              </button>
              @for (number of pageNumbers(); track number) {
                <button
                  [attr.aria-label]="'Exchange page ' + number"
                  [attr.aria-current]="currentPage() === number ? 'page' : null"
                  (click)="page.set(number)"
                >
                  {{ number }}
                </button>
              }
              <button
                aria-label="Next exchange page"
                [disabled]="currentPage() === pageCount()"
                (click)="page.set(currentPage() + 1)"
              >
                ›
              </button>
            </div>
          </nav>
          <div class="exchange-list">
            @for (artifact of pageExchanges(); track artifact.id) {
              <button
                class="exchange-item"
                [class.is-selected]="selectedArtifact() === artifact.id"
                [attr.aria-pressed]="selectedArtifact() === artifact.id"
                [attr.aria-label]="
                  artifact.resultId + ' · attempt ' + artifact.attempt + ' · ' + artifact.name
                "
                [disabled]="!!artifact.unavailableReason"
                (click)="inspect(run.id, artifact.id)"
              >
                @if (artifact.exchange; as exchange) {
                  <span class="exchange-request"
                    ><span class="exchange-method">{{ exchange.method }}</span
                    ><span class="exchange-path">{{ exchange.path }}</span
                    ><span class="exchange-status">{{ exchange.status ?? 'Error' }}</span></span
                  >
                }
                <span class="exchange-meta"
                  ><strong>{{ artifact.resultId }}</strong
                  ><span>Attempt {{ artifact.attempt }}</span></span
                >
                @if (artifact.unavailableReason) {
                  <span class="exchange-unavailable">{{ artifact.unavailableReason }}</span>
                }
              </button>
            } @empty {
              <p class="empty">No recorded exchanges are available for this execution.</p>
            }
          </div>
        </section>
        <section class="card exchange-inspector" [attr.aria-busy]="inspecting()">
          <div class="exchange-inspector-heading">
            <div>
              <p class="eyebrow">RECORDED EVIDENCE</p>
              <h2>Request and response</h2>
            </div>
            @if (selectedExchange(); as artifact) {
              <span class="badge">{{ artifact.resultId }}</span>
            }
          </div>
          @if (inspecting()) {
            <p role="status" class="empty">Loading exchange…</p>
          } @else if (evidence()) {
            <p class="muted evidence-caption">
              Recorded evidence; opening this view does not repeat the request.
            </p>
            <app-json-evidence [value]="evidence()" />
          } @else {
            <div class="exchange-empty">
              <span aria-hidden="true">↔</span>
              <h3>Inspect an exchange</h3>
              <p>Choose a request to view its headers, body, response, and timing.</p>
            </div>
          }
        </section>
      </div>
    }`,
})
export class ApiWorkspace {
  public readonly api = inject(Api);
  private readonly router = inject(Router);
  public readonly tests = signal<TestCase[]>([]);
  public readonly executableTests = computed(() => this.tests().filter((test) => test.enabled));
  public readonly runs = signal<Run[]>([]);
  public readonly selectedRun = signal<Run | null>(null);
  public readonly evidence = signal('');
  public readonly error = signal('');
  public readonly busy = signal(false);
  public readonly page = signal(1);
  public readonly selectedArtifact = signal('');
  public readonly inspecting = signal(false);
  public readonly exchanges = computed(() =>
    (this.selectedRun()?.artifacts ?? []).filter((artifact) => artifact.name.startsWith('api-')),
  );
  public readonly pageCount = computed(() => Math.max(1, Math.ceil(this.exchanges().length / 10)));
  public readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));
  public readonly pageExchanges = computed(() =>
    this.exchanges().slice((this.currentPage() - 1) * 10, this.currentPage() * 10),
  );
  public readonly pageNumbers = computed(() => {
    const start = Math.max(1, Math.min(this.currentPage() - 1, this.pageCount() - 2));
    return Array.from({ length: Math.min(3, this.pageCount()) }, (_, index) => start + index);
  });
  public readonly selectedExchange = computed(() =>
    this.exchanges().find((item) => item.id === this.selectedArtifact()),
  );
  private inspectionVersion = 0;
  public constructor() {
    void this.load();
  }
  public async load(): Promise<void> {
    try {
      const [catalog, history] = await Promise.all([
        this.api.get<{ items: TestCase[] }>(`/projects/${this.api.projectId()}/catalog`),
        this.api.get<{ items: Run[] }>(`/runs?projectId=${this.api.projectId()}`),
      ]);
      this.tests.set(catalog.items.filter((test) => test.kind === 'api'));
      const runs = history.items
        .filter((run) => run.selection.testIds.some((id) => id.startsWith('LAB-')))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      this.runs.set(runs);
      if (runs[0]) {
        this.choose(runs[0].id);
      }
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
  public choose(id: string): void {
    this.inspectionVersion++;
    this.page.set(1);
    this.selectedArtifact.set('');
    this.inspecting.set(false);
    this.error.set('');
    this.selectedRun.set(this.runs().find((run) => run.id === id) ?? null);
    this.evidence.set('');
  }
  public async inspect(runId: string, artifactId: string): Promise<void> {
    const version = ++this.inspectionVersion;
    this.selectedArtifact.set(artifactId);
    this.inspecting.set(true);
    this.evidence.set('');
    this.error.set('');
    try {
      const evidence = await this.api.get<unknown>(`/runs/${runId}/artifacts/${artifactId}`);
      if (version === this.inspectionVersion) {
        this.evidence.set(JSON.stringify(evidence, null, 2));
      }
    } catch (error) {
      if (version !== this.inspectionVersion) {
        return;
      }
      this.evidence.set('');
      this.error.set(errorMessage(error));
    } finally {
      if (version === this.inspectionVersion) {
        this.inspecting.set(false);
      }
    }
  }
  public async start(): Promise<void> {
    if (this.busy() || !this.executableTests().length || this.api.identity()?.role === 'viewer') {
      return;
    }
    this.busy.set(true);
    try {
      const run = await this.api.launch(
        this.executableTests().map((test) => test.id),
        crypto.randomUUID(),
        1,
        0,
      );
      await this.router.navigate(['/runs', run.id]);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
