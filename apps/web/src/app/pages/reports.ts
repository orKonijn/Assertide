import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, Run, errorMessage } from '../core/api';
@Component({
  imports: [RouterLink],
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
        <table>
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
                <td>
                  <a [routerLink]="['/runs', run.id]">{{ run.id.slice(0, 8) }}</a>
                </td>
                <td>{{ run.reportPhase }}</td>
                <td>
                  @if (run.reportPhase === 'ready') {
                    <a [href]="'/v1/runs/' + run.id + '/report'" target="_blank" rel="noopener"
                      >Open Allure</a
                    >
                  } @else {
                    <span class="muted">{{
                      run.reportPhase === 'failed' ? 'Generation failed' : 'Not ready'
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
  readonly runs = signal<Run[]>([]);
  readonly error = signal('');
  constructor() {
    void this.load();
  }
  async load() {
    try {
      this.runs.set(
        (await this.api.get<{ items: Run[] }>(`/runs?projectId=${this.api.projectId()}`)).items,
      );
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
}
