import { DatePipe, KeyValuePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';

import { Api, errorMessage } from './api';
interface State {
  status: string;
  checkedAt: string;
  dependencies: Record<string, string>;
  phases: { phase: string; count: number; workers: number }[];
  oldestQueuedAt: string | null;
  expiredLeases: number;
  failedReports: number;
  retentionDays: { traceVideo: number; rawReports: number; resultsAudit: number };
  quota: { projectRuns: number; organizationRuns: number; organizationWorkers: number };
}
@Component({
  selector: 'app-operations',
  imports: [DatePipe, KeyValuePipe],
  template: `<section class="card">
    <div class="section-heading">
      <h2>Service health and capacity</h2>
      <button (click)="load()" [disabled]="busy()">Refresh health</button>
    </div>
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    @if (state(); as value) {
      <p role="status">
        <span class="status-indicator" [attr.data-status]="value.status" aria-hidden="true"></span
        >{{ value.status }} · checked {{ value.checkedAt | date: 'medium' }}
      </p>
      <ul>
        @for (dependency of value.dependencies | keyvalue; track dependency.key) {
          <li>
            <span
              class="status-indicator"
              [attr.data-status]="dependency.value"
              aria-hidden="true"
            ></span
            >{{ dependency.key }}: {{ dependency.value }}
          </li>
        }
      </ul>
      <p>
        Capacity: {{ value.quota.projectRuns }} active runs per project,
        {{ value.quota.organizationRuns }} per organization,
        {{ value.quota.organizationWorkers }} workers per organization. Queued runs start as
        capacity becomes available.
      </p>
      <p>
        Retention: trace/video {{ value.retentionDays.traceVideo }} days; reports/raw evidence
        {{ value.retentionDays.rawReports }} days; results/audit
        {{ value.retentionDays.resultsAudit }} days.
      </p>
      <p>
        Expired active leases: {{ value.expiredLeases }} · Failed reports: {{ value.failedReports }}
      </p>
      @if (value.oldestQueuedAt) {
        <p>Oldest queued run: {{ value.oldestQueuedAt | date: 'medium' }}</p>
      }
      <div class="table-wrap" tabindex="0" role="region" aria-label="Execution capacity table">
        <table>
          <caption>
            Executions in your authorized projects
          </caption>
          <thead>
            <tr>
              <th>Phase</th>
              <th>Runs</th>
              <th>Requested workers</th>
            </tr>
          </thead>
          <tbody>
            @for (phase of value.phases; track phase.phase) {
              <tr>
                <td>
                  <span
                    class="status-indicator"
                    [attr.data-status]="phase.phase"
                    aria-hidden="true"
                  ></span
                  >{{ phase.phase }}
                </td>
                <td>{{ phase.count }}</td>
                <td>{{ phase.workers }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="3">No executions yet.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  </section>`,
})
export class Operations {
  private readonly api = inject(Api);
  public readonly state = signal<State | null>(null);
  public readonly error = signal('');
  public readonly busy = signal(false);
  public constructor() {
    void this.load();
  }
  public async load(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      this.state.set(await this.api.get<State>('/operations'));
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
