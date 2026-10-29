import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Api, Run, errorMessage } from '../core/api';
@Component({
  imports: [RouterLink, DatePipe, FormsModule],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">EXECUTION HISTORY</p>
        <h1>Executions</h1>
        <p class="muted">Immutable selections, live progress, and preserved results.</p>
      </div>
      <a class="button" routerLink="/explorer">New execution</a>
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <section class="card">
      <form class="toolbar" (ngSubmit)="apply()">
        <label
          >Phase<select name="phase" aria-label="Phase" [(ngModel)]="phase">
            @for (value of phases; track value) {
              <option [value]="value">{{ value }}</option>
            }
          </select></label
        >
        <label
          >Browser or API<select name="browser" aria-label="Browser or API" [(ngModel)]="browser">
            @for (value of ['all', 'api', 'chromium', 'firefox', 'webkit']; track value) {
              <option>{{ value }}</option>
            }
          </select></label
        >
        <label>From (UTC)<input type="date" name="from" [(ngModel)]="from" /></label
        ><label>Through (UTC)<input type="date" name="to" [(ngModel)]="to" /></label>
        <button type="submit" [disabled]="loading()">Apply filters</button
        ><button type="button" (click)="load()">Refresh</button>
      </form>
      @if (loading()) {
        <p role="status">Loading history…</p>
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th>Phase</th>
                <th>Selected</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              @for (run of runs(); track run.id) {
                <tr>
                  <td>
                    <a [routerLink]="['/runs', run.id]">{{ run.id.slice(0, 8) }}</a>
                    @if (run.parentRunId) {
                      <br /><span class="muted">Rerun</span>
                    }
                  </td>
                  <td>
                    <span class="badge">{{ run.phase }}</span>
                  </td>
                  <td>{{ run.selection.testIds.length }}</td>
                  <td>{{ run.createdAt | date: 'short' }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="4" class="empty">No executions match this filter.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      @if (nextCursor()) {
        <button [disabled]="loading()" (click)="load(true)">Load older executions</button>
      }
    </section>
  `,
})
export class Runs {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly phases = [
    'all',
    'queued',
    'running',
    'completed',
    'canceled',
    'infrastructure_error',
    'timed_out',
  ];
  phase = this.route.snapshot.queryParamMap.get('phase') ?? 'all';
  browser = this.route.snapshot.queryParamMap.get('browser') ?? 'all';
  from = this.route.snapshot.queryParamMap.get('from') ?? '';
  to = this.route.snapshot.queryParamMap.get('to') ?? '';
  readonly nextCursor = signal<string | null>(null);
  readonly runs = signal<Run[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  constructor() {
    void this.load();
  }
  async apply() {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        phase: this.phase,
        browser: this.browser,
        from: this.from || null,
        to: this.to || null,
      },
      replaceUrl: true,
    });
    await this.load();
  }
  async load(more = false) {
    this.loading.set(true);
    this.error.set('');
    try {
      const query = new URLSearchParams({
        projectId: this.api.projectId(),
        phase: this.phase,
        browser: this.browser,
      });
      if (this.from) query.set('from', this.from);
      if (this.to) query.set('to', this.to);
      if (more && this.nextCursor()) query.set('cursor', this.nextCursor()!);
      const result = await this.api.get<{ items: Run[]; nextCursor: string | null }>(
        `/runs?${query}`,
      );
      this.runs.set(more ? [...this.runs(), ...result.items] : result.items);
      this.nextCursor.set(result.nextCursor);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
