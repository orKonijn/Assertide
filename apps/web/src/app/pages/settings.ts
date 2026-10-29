import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Api, errorMessage } from '../core/api';
import { Members } from '../core/members';
import { Environments } from '../core/environments';
interface Audit {
  id: string;
  actor: string;
  action: string;
  resourceId: string;
  occurredAt: string;
}
interface ServiceAccount {
  id: string;
  name: string;
  expires_at: string;
  revoked: boolean;
  version: number;
}
@Component({
  imports: [DatePipe, FormsModule, Members, Environments],
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
        <p>API and browser execution · up to 4 workers · up to 2 retries.</p>
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
      <app-members />
      <app-environments />
      <section class="card">
        <h2>CI service accounts</h2>
        <p class="muted">
          Project-scoped execution and evidence access. Credentials cannot manage suites or
          settings.
        </p>
        <form class="toolbar" (ngSubmit)="createAccount()">
          <label
            >Account name<input
              name="accountName"
              [(ngModel)]="accountName"
              required
              maxlength="120" /></label
          ><label
            >Expiry (days)<input
              name="expiry"
              type="number"
              min="1"
              max="90"
              [(ngModel)]="expiry" /></label
          ><button type="submit" [disabled]="busy() || !accountName.trim()">
            Create CI credential
          </button>
        </form>
        @if (token()) {
          <div role="status">
            <p>
              Copy this token now. It is shown only once and is never returned by account listings.
            </p>
            <label>New CI token<textarea readonly [value]="token()"></textarea></label
            ><button (click)="token.set('')">Hide token</button>
          </div>
        }
        @for (account of accounts(); track account.id) {
          <article>
            <h3>{{ account.name }}</h3>
            <p>
              {{ account.revoked ? 'Revoked' : 'Active' }} · expires
              {{ account.expires_at | date: 'short' }}
            </p>
            <div class="actions">
              <button [disabled]="busy()" (click)="changeAccount(account, 'rotate')">
                Rotate {{ account.name }}</button
              ><button
                [disabled]="busy() || account.revoked"
                (click)="changeAccount(account, 'revoke')"
              >
                Revoke {{ account.name }}
              </button>
            </div>
          </article>
        } @empty {
          <p>No CI credentials have been created.</p>
        }
      </section>
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
  readonly accounts = signal<ServiceAccount[]>([]);
  readonly token = signal('');
  readonly busy = signal(false);
  accountName = '';
  expiry = 30;
  constructor() {
    if (this.api.identity()?.role === 'administrator') void this.loadAccounts();
    if (this.api.identity()?.role === 'administrator')
      void this.api
        .get<{ items: Audit[] }>(`/audit-events?projectId=${this.api.projectId()}`)
        .then((data) => this.events.set(data.items))
        .catch((error) => this.error.set(errorMessage(error)));
  }
  async loadAccounts() {
    try {
      this.accounts.set(
        (
          await this.api.get<{ items: ServiceAccount[] }>(
            `/projects/${this.api.projectId()}/service-accounts`,
          )
        ).items,
      );
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
  async createAccount() {
    this.busy.set(true);
    this.error.set('');
    this.token.set('');
    try {
      const response = await this.api.post<{ token: string }>(
        `/projects/${this.api.projectId()}/service-accounts`,
        { name: this.accountName, days: this.expiry },
      );
      this.token.set(response.token);
      this.accountName = '';
      await this.loadAccounts();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
  async changeAccount(account: ServiceAccount, action: 'rotate' | 'revoke') {
    if (
      !confirm(
        `${action === 'rotate' ? 'Replace' : 'Revoke'} this credential? Existing callers using it will lose access immediately.`,
      )
    )
      return;
    this.busy.set(true);
    this.error.set('');
    this.token.set('');
    try {
      const response = await this.api.post<{ token?: string }>(
        `/projects/${this.api.projectId()}/service-accounts/${account.id}/${action}`,
        {},
        undefined,
        account.version,
      );
      this.token.set(response.token ?? '');
      await this.loadAccounts();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
