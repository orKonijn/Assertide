import { Component, inject, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Api, Run, errorMessage } from '../core/api';
@Component({
  imports: [RouterLink, DatePipe],
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
      <div class="toolbar">
        <button (click)="filter.set('all')">All</button
        ><button (click)="filter.set('completed')">Completed</button
        ><button (click)="filter.set('running')">Running</button
        ><button (click)="load()">Refresh</button>
      </div>
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
              @for (run of visible(); track run.id) {
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
    </section>
  `,
})
export class Runs {
  private readonly api = inject(Api);
  readonly runs = signal<Run[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly filter = signal('all');
  readonly visible = computed(() =>
    this.runs()
      .filter((run) => this.filter() === 'all' || run.phase === this.filter())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
  constructor() {
    void this.load();
  }
  async load() {
    this.loading.set(true);
    try {
      this.runs.set(
        (await this.api.get<{ items: Run[] }>(`/runs?projectId=${this.api.projectId()}`)).items,
      );
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
