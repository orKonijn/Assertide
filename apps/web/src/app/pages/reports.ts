import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Run } from '../core/api';
import { Api, errorMessage } from '../core/api';
@Component({
  host: { class: 'reports-page' },
  imports: [RouterLink, DatePipe],
  template: `<header class="page-header">
      <div>
        <p class="eyebrow">EXECUTION EVIDENCE</p>
        <h1>Reports</h1>
        <p class="muted">Report generation is independent of test outcomes.</p>
      </div>
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <section class="card reports-panel" [attr.aria-busy]="loading()">
      <div class="report-library-heading">
        <div>
          <h2>Report library</h2>
          <p class="muted">{{ runs().length }} loaded · {{ readyCount() }} ready to open</p>
        </div>
        <button
          class="icon-button report-refresh"
          (click)="load()"
          aria-label="Refresh reports"
          title="Refresh reports"
          [disabled]="loading()"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9" />
          </svg>
        </button>
      </div>
      <div class="table-wrap">
        <table class="mobile-result-cards report-cards" role="table">
          <thead>
            <tr>
              <th>Execution</th>
              <th>Status</th>
              <th>Available until</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            @for (run of runs(); track run.id) {
              <tr>
                <td data-label="Execution">
                  <a class="execution-link" [routerLink]="['/runs', run.id]">{{
                    run.id.slice(0, 8)
                  }}</a>
                </td>
                <td data-label="Status">
                  <span class="report-status"
                    ><span
                      class="status-indicator"
                      [attr.data-status]="run.reportPhase"
                      aria-hidden="true"
                    ></span
                    >{{ run.reportPhase }}</span
                  >
                </td>
                <td data-label="Available until">
                  @if (run.reportExpiresAt) {
                    <time [attr.datetime]="run.reportExpiresAt">{{
                      run.reportExpiresAt | date: 'mediumDate'
                    }}</time>
                    <p class="muted">{{ run.reportExpiresAt | date: 'shortTime' }}</p>
                  } @else {
                    <span class="muted">Not available yet</span>
                  }
                </td>
                <td data-label="Action">
                  @if (run.reportPhase === 'ready') {
                    <a
                      class="report-action"
                      [href]="'/v1/runs/' + run.id + '/report'"
                      target="_blank"
                      rel="noopener"
                      >Open Allure <span aria-hidden="true">&#8599;</span></a
                    >
                  } @else {
                    <span class="muted">{{
                      run.reportPhase === 'expired'
                        ? 'Expired under retention policy'
                        : run.reportPhase === 'failed'
                          ? 'Generation failed'
                          : 'Not ready'
                    }}</span>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="4" class="empty">
                  No reports yet. Start an execution to collect evidence.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>`,
})
export class Reports {
  private readonly api = inject(Api);
  public readonly runs = signal<Run[]>([]);
  public readonly readyCount = computed(
    () => this.runs().filter((run) => run.reportPhase === 'ready').length,
  );
  public readonly error = signal('');
  public readonly loading = signal(false);
  public constructor() {
    void this.load();
  }
  public async load(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
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
