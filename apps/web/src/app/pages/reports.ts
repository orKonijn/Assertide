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
      <button (click)="load()">Refresh</button>
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <section class="card">
      <div class="table-wrap">
        <table class="mobile-result-cards" role="table">
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
                  <a [routerLink]="['/runs', run.id]">{{ run.id.slice(0, 8) }}</a>
                </td>
                <td data-label="Report">
                  {{ run.reportPhase }}
                  @if (run.reportExpiresAt) {
                    <p class="muted">Expires {{ run.reportExpiresAt | date: 'short' }}</p>
                  }
                </td>
                <td data-label="Action">
                  @if (run.reportPhase === 'ready') {
                    <a [href]="'/v1/runs/' + run.id + '/report'" target="_blank" rel="noopener"
                      >Open Allure</a
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
  public constructor() {
    void this.load();
  }
  public async load(): Promise<void> {
    try {
      this.runs.set(
        (await this.api.get<{ items: Run[] }>(`/runs?projectId=${this.api.projectId()}`)).items,
      );
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
}
