import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Run } from '../core/api';
import { Api, errorMessage } from '../core/api';
@Component({
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
    <section class="card">
      <div class="report-toolbar">
        <span aria-hidden="true">Execution</span><span aria-hidden="true">Report</span
        ><span aria-hidden="true">Action</span>
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
              <th>Report</th>
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
                <td data-label="Report">
                  <span class="badge">{{ run.reportPhase }}</span>
                  @if (run.reportExpiresAt) {
                    <p class="muted">Expires {{ run.reportExpiresAt | date: 'short' }}</p>
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
                <td colspan="3" class="empty">
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
