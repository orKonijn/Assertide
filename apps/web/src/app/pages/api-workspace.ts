import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Api, Run, TestCase, errorMessage } from '../core/api';

@Component({
  imports: [FormsModule, DatePipe, RouterLink],
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
        [disabled]="busy() || !tests().length || api.identity()?.role === 'viewer'"
        (click)="start()"
      >
        Run API suite
      </button>
    </header>
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    <section class="card">
      <h2>Orders contract</h2>
      <p>
        {{ tests().length }} API cases · GET, POST, PUT, PATCH and DELETE · browserless execution
      </p>
      <p class="muted">
        Authentication credentials and fixture control headers are excluded from recorded exchanges.
      </p>
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
    </section>
    @if (selectedRun(); as run) {
      <div class="split">
        <section class="card">
          <h2>Recorded exchanges</h2>
          <a [routerLink]="['/runs', run.id]">Open execution and Allure</a>
          @for (artifact of run.artifacts ?? []; track artifact.id) {
            @if (artifact.name.startsWith('api-')) {
              <p>
                <button
                  [disabled]="!!artifact.unavailableReason"
                  (click)="inspect(run.id, artifact.id)"
                >
                  {{ artifact.resultId }} · attempt {{ artifact.attempt }} · {{ artifact.name }}
                  @if (artifact.exchange; as exchange) {
                    <br />{{ exchange.method }} {{ exchange.path }} ·
                    {{ exchange.status ?? 'Transport error' }}
                  }
                </button>
              </p>
              @if (artifact.unavailableReason) {
                <p>{{ artifact.unavailableReason }}</p>
              }
            }
          } @empty {
            <p class="empty">No recorded exchanges are available for this execution.</p>
          }
        </section>
        <section class="card">
          <h2>Request and response</h2>
          @if (evidence()) {
            <p class="muted">Recorded evidence; opening this view does not repeat the request.</p>
            <pre tabindex="0" aria-label="Recorded request and response">{{ evidence() }}</pre>
          } @else {
            <p class="empty">
              Choose an exchange to inspect its method, path, body, status and duration.
            </p>
          }
        </section>
      </div>
    }`,
})
export class ApiWorkspace {
  readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly tests = signal<TestCase[]>([]);
  readonly runs = signal<Run[]>([]);
  readonly selectedRun = signal<Run | null>(null);
  readonly evidence = signal('');
  readonly error = signal('');
  readonly busy = signal(false);
  constructor() {
    void this.load();
  }
  async load() {
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
      if (runs[0]) this.choose(runs[0].id);
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
  choose(id: string) {
    this.selectedRun.set(this.runs().find((run) => run.id === id) ?? null);
    this.evidence.set('');
  }
  async inspect(runId: string, artifactId: string) {
    this.error.set('');
    try {
      this.evidence.set(
        JSON.stringify(
          await this.api.get<unknown>(`/runs/${runId}/artifacts/${artifactId}`),
          null,
          2,
        ),
      );
    } catch (error) {
      this.evidence.set('');
      this.error.set(errorMessage(error));
    }
  }
  async start() {
    this.busy.set(true);
    try {
      const run = await this.api.launch(
        this.tests().map((test) => test.id),
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
