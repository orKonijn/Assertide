import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Api, errorMessage } from '../core/api';
interface Audit {
  id: string;
  actor: string;
  action: string;
  resourceId: string;
  occurredAt: string;
}
@Component({
  imports: [DatePipe],
  template: `<header class="page-header">
      <div>
        <p class="eyebrow">WORKSPACE SETTINGS</p>
        <h1>Environment and audit</h1>
        <p class="muted">Approved execution policy and recorded changes.</p>
      </div>
    </header>
    <div class="grid">
      <section class="card">
        <h2>Local Lab sandbox</h2>
        <p>API-only execution · up to 4 workers · up to 2 retries.</p>
        <p class="muted">
          Development fixture credentials are generated locally and never returned by this API.
        </p>
      </section>
      <section class="card">
        <h2>Current access</h2>
        <p>{{ api.identity()?.name }} · {{ api.identity()?.role }}</p>
        <p class="muted">Project membership is checked by the server on every request.</p>
      </section>
    </div>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (api.identity()?.role === 'administrator') {
      <section class="card">
        <h2>Audit trail</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
              </tr>
            </thead>
            <tbody>
              @for (event of events(); track event.id) {
                <tr>
                  <td>{{ event.occurredAt | date: 'short' }}</td>
                  <td>{{ event.actor }}</td>
                  <td>{{ event.action }}</td>
                  <td>{{ event.resourceId.slice(0, 8) }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="4">No audited changes yet.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }`,
})
export class Settings {
  readonly api = inject(Api);
  readonly events = signal<Audit[]>([]);
  readonly error = signal('');
  constructor() {
    if (this.api.identity()?.role === 'administrator')
      void this.api
        .get<{ items: Audit[] }>(`/audit-events?projectId=${this.api.projectId()}`)
        .then((data) => this.events.set(data.items))
        .catch((error) => this.error.set(errorMessage(error)));
  }
}
