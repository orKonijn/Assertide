import { DatePipe } from '@angular/common';
import { Component, ElementRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Api, errorMessage } from '../core/api';
import { Environments } from '../core/environments';
import { Members } from '../core/members';
import { Operations } from '../core/operations';
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
  host: { class: 'settings-page' },
  imports: [DatePipe, FormsModule, Members, Environments, Operations],
  template: `<header class="page-header">
      <div>
        <p class="eyebrow">WORKSPACE SETTINGS</p>
        <h1>Workspace settings</h1>
        <p class="muted">Manage access, execution policies, and workspace activity.</p>
      </div>
    </header>
    @if (api.identity()?.role === 'administrator') {
      <nav class="settings-nav" aria-label="Settings sections">
        @for (section of sections; track section.id) {
          <button
            type="button"
            [attr.aria-current]="activeSection() === section.id ? 'location' : null"
            (click)="openSection(section.id)"
          >
            <span class="settings-nav-index" aria-hidden="true">{{ section.number }}</span
            >{{ section.label }}
          </button>
        }
      </nav>
    }
    <div class="grid settings-overview">
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
      <app-operations id="settings-health" />
      <app-members id="settings-members" />
      <app-environments id="settings-environments" />
      <section class="card" id="settings-accounts">
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
          <article class="service-account-row">
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
      <section class="card" id="settings-audit">
        <h2>Audit trail</h2>
        <div class="table-wrap" tabindex="0" role="region" aria-label="Audit events table">
          <table class="mobile-result-cards" role="table">
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
                  <td data-label="Time">{{ event.occurredAt | date: 'short' }}</td>
                  <td data-label="Actor">{{ event.actor }}</td>
                  <td data-label="Action">{{ event.action }}</td>
                  <td data-label="Resource">{{ event.resourceId.slice(0, 8) }}</td>
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
  public readonly sections = [
    { id: 'settings-health', label: 'Health', number: '01' },
    { id: 'settings-members', label: 'Members', number: '02' },
    { id: 'settings-environments', label: 'Environments', number: '03' },
    { id: 'settings-accounts', label: 'Service accounts', number: '04' },
    { id: 'settings-audit', label: 'Audit trail', number: '05' },
  ];
  public readonly activeSection = signal('settings-health');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  public readonly api = inject(Api);
  public readonly events = signal<Audit[]>([]);
  public readonly error = signal('');
  public readonly accounts = signal<ServiceAccount[]>([]);
  public readonly token = signal('');
  public readonly busy = signal(false);
  public accountName = '';
  public expiry = 30;
  public constructor() {
    if (this.api.identity()?.role === 'administrator') {
      void this.loadAccounts();
    }
    if (this.api.identity()?.role === 'administrator') {
      void this.api
        .get<{ items: Audit[] }>(`/audit-events?projectId=${this.api.projectId()}`)
        .then((data) => this.events.set(data.items))
        .catch((error) => this.error.set(errorMessage(error)));
    }
  }
  public openSection(id: string): void {
    const section = this.host.nativeElement.querySelector<HTMLElement>('#' + id);
    if (!section) {
      return;
    }
    this.activeSection.set(id);
    section.setAttribute('tabindex', '-1');
    section.focus({ preventScroll: true });
    section.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }
  public async loadAccounts(): Promise<void> {
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
  public async createAccount(): Promise<void> {
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
  public async changeAccount(account: ServiceAccount, action: 'rotate' | 'revoke'): Promise<void> {
    if (
      !confirm(
        `${action === 'rotate' ? 'Replace' : 'Revoke'} this credential? Existing callers using it will lose access immediately.`,
      )
    ) {
      return;
    }
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
