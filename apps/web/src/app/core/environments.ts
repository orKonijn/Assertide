import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, Environment, errorMessage } from './api';
interface Secret {
  id: string;
  name: string;
  version: number;
}
@Component({
  selector: 'app-environments',
  imports: [FormsModule],
  template: `<section class="card">
      <h2>Execution environments</h2>
      <p class="muted">
        Destinations are restricted to the approved local Lab and browser sandbox. Existing runs
        retain their saved policy and credential version.
      </p>
      @if (error()) {
        <p role="alert" class="error">{{ error() }}</p>
      }
      @if (notice()) {
        <p role="status">{{ notice() }}</p>
      }
      <div class="actions">
        @for (item of environments(); track item.id) {
          <button (click)="edit(item)">Edit {{ item.name }}</button>
        }
        <button (click)="fresh()">New environment</button>
      </div>
      <form (ngSubmit)="saveEnvironment()">
        <div class="toolbar">
          <label
            >Environment ID<input
              name="id"
              [(ngModel)]="draft.id"
              [readonly]="draft.version > 0 || draft.id === 'local-lab'"
              required
          /></label>
          <label
            >Environment name<input name="name" [(ngModel)]="draft.name" required maxlength="120"
          /></label>
          <label>API destination<input name="apiUrl" [(ngModel)]="draft.apiUrl" required /></label>
          <label
            >Browser destination<input name="browserUrl" [(ngModel)]="draft.browserUrl" required
          /></label>
          <label
            >Maximum workers<input
              name="workers"
              type="number"
              min="1"
              max="4"
              [(ngModel)]="draft.maxWorkers"
          /></label>
          <label
            >Maximum retries<input
              name="retries"
              type="number"
              min="0"
              max="2"
              [(ngModel)]="draft.maxRetries"
          /></label>
          <label
            >Lab password reference<select name="secret" [(ngModel)]="reference">
              <option value="">Generated local credential</option>
              @if (oldReference()) {
                <option [value]="draft.passwordRef!.id + ':' + draft.passwordRef!.version">
                  Saved credential · version {{ draft.passwordRef!.version }}
                </option>
              }
              @for (secret of secrets(); track secret.id) {
                <option [value]="secret.id + ':' + secret.version">
                  {{ secret.name }} · version {{ secret.version }}
                </option>
              }
            </select></label
          >
        </div>
        <fieldset>
          <legend>Allowed browsers</legend>
          @for (browser of ['chromium', 'firefox', 'webkit']; track browser) {
            <label
              ><input
                type="checkbox"
                [checked]="draft.browsers.includes(browser)"
                (change)="toggleBrowser(browser)"
              />{{ browser }}</label
            >
          }
        </fieldset>
        <label
          ><input name="enabled" type="checkbox" [(ngModel)]="draft.enabled" />Available for new
          executions</label
        >
        <label
          ><input name="video" type="checkbox" [(ngModel)]="draft.allowVideo" />Allow failure
          video</label
        >
        <label
          ><input name="headed" type="checkbox" [(ngModel)]="draft.allowHeaded" />Allow headed
          execution in isolated virtual displays</label
        >
        <button [disabled]="busy()">Save environment</button>
      </form>
    </section>
    <section class="card">
      <h2>Write-only credentials</h2>
      <p class="muted">
        Values are encrypted and cannot be read back. Rotation creates a new version; select that
        version in an environment to use it for future runs.
      </p>
      <form class="toolbar" (ngSubmit)="saveSecret()">
        <label
          >Credential to rotate<select name="rotation" [(ngModel)]="rotation">
            <option value="">Create a credential</option>
            @for (secret of secrets(); track secret.id) {
              <option [value]="secret.id">{{ secret.name }} · version {{ secret.version }}</option>
            }
          </select></label
        >
        <label
          >Credential name<input
            name="secretName"
            [(ngModel)]="secretName"
            required
            maxlength="120"
        /></label>
        <label
          >Credential value<input
            name="secretValue"
            type="password"
            [(ngModel)]="secretValue"
            autocomplete="new-password"
            required
        /></label>
        <button [disabled]="busy() || !secretName.trim() || !secretValue">
          Save credential version
        </button>
      </form>
    </section>`,
})
export class Environments {
  readonly api = inject(Api);
  readonly environments = signal<Environment[]>([]);
  readonly secrets = signal<Secret[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  draft: Environment = this.empty();
  reference = '';
  oldReference() {
    return (
      this.draft.passwordRef &&
      !this.secrets().some(
        (secret) =>
          secret.id === this.draft.passwordRef?.id &&
          secret.version === this.draft.passwordRef.version,
      )
    );
  }
  rotation = '';
  secretName = '';
  secretValue = '';
  constructor() {
    void this.load();
  }
  empty(): Environment {
    return {
      id: '',
      name: '',
      version: 0,
      enabled: true,
      apiUrl: 'http://127.0.0.1:4010/lab/v1/',
      browserUrl: 'http://127.0.0.1:4013',
      maxWorkers: 1,
      maxRetries: 0,
      browsers: ['chromium'],
      allowVideo: false,
      allowHeaded: false,
    };
  }
  fresh() {
    this.draft = this.empty();
    this.reference = '';
  }
  edit(item: Environment) {
    this.draft = structuredClone(item);
    this.reference = item.passwordRef ? `${item.passwordRef.id}:${item.passwordRef.version}` : '';
  }
  toggleBrowser(browser: string) {
    this.draft.browsers = this.draft.browsers.includes(browser)
      ? this.draft.browsers.filter((value) => value !== browser)
      : [...this.draft.browsers, browser];
  }
  async load() {
    try {
      const base = `/projects/${this.api.projectId()}`;
      this.environments.set(
        (await this.api.get<{ items: Environment[] }>(`${base}/environments`)).items,
      );
      this.secrets.set((await this.api.get<{ items: Secret[] }>(`${base}/secrets`)).items);
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
  async saveEnvironment() {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const { version, passwordRef: _previousReference, ...body } = this.draft;
      const [id, refVersion] = this.reference.split(':');
      const saved = await this.api.post<Environment>(
        `/projects/${this.api.projectId()}/environments`,
        { ...body, ...(id ? { passwordRef: { id, version: Number(refVersion) } } : {}) },
        undefined,
        version,
      );
      this.edit(saved);
      await this.load();
      this.notice.set('Environment saved. Future launches use this policy.');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
  async saveSecret() {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const previous = this.secrets().find((secret) => secret.id === this.rotation);
      await this.api.post(
        `/projects/${this.api.projectId()}/secrets`,
        {
          name: this.secretName,
          value: this.secretValue,
          ...(previous ? { id: previous.id } : {}),
        },
        undefined,
        previous?.version,
      );
      this.secretValue = '';
      this.secretName = '';
      this.rotation = '';
      await this.load();
      this.notice.set('Credential version saved. Its value cannot be read back.');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.secretValue = '';
      this.busy.set(false);
    }
  }
}
