import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Api, TestCase, Environment, errorMessage } from '../core/api';
@Component({
  imports: [FormsModule],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">VERSIONED CATALOG</p>
        <h1>Test explorer</h1>
        <p class="muted">Select approved tests from the local Lab catalog.</p>
      </div>
      <span class="badge">{{ revision().slice(0, 12) || 'Loading revision' }}</span>
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }} <button (click)="load()">Retry</button></p>
    }
    @if (editing(); as test) {
      <section class="card">
        <h2>Edit {{ test.id }} metadata</h2>
        <form (ngSubmit)="saveMetadata()" class="toolbar">
          <label
            >Feature<input name="feature" [(ngModel)]="feature" required maxlength="120"
          /></label>
          <label>Module<input name="module" [(ngModel)]="module" maxlength="120" /></label>
          <label>Test owner<input name="owner" [(ngModel)]="owner" maxlength="120" /></label>
          <label>Test tags<input name="tags" [(ngModel)]="tags" maxlength="1000" /></label>
          <label
            >Test priority<select name="priority" [(ngModel)]="editPriority">
              <option>P0</option>
              <option>P1</option>
              <option>P2</option>
            </select></label
          >
          <label
            ><input name="enabled" type="checkbox" [(ngModel)]="enabled" />Enabled for future
            selections</label
          >
          <button [disabled]="saving()">Save test metadata</button
          ><button type="button" (click)="editing.set(null)">Cancel metadata edit</button>
        </form>
      </section>
    }
    <div class="split">
      <section class="card">
        <div class="toolbar">
          <label
            >Search tests<input
              [ngModel]="query()"
              (ngModelChange)="search($event)"
              placeholder="Case ID, title or feature" /></label
          ><button (click)="selectAll()">Select visible</button>
          <label
            >Kind<select
              aria-label="Test kind"
              [ngModel]="kind()"
              (ngModelChange)="kind.set($event); search(query())"
            >
              <option value="all">All tests</option>
              <option value="api">API</option>
              <option value="ui">Browser</option>
            </select></label
          >
          <label
            >Priority<select
              aria-label="Priority"
              [ngModel]="priority()"
              (ngModelChange)="priority.set($event); search(query())"
            >
              <option value="all">All priorities</option>
              <option>P0</option>
              <option>P1</option>
              <option>P2</option>
            </select></label
          >
        </div>
        @if (loading()) {
          <p role="status">Discovering catalog…</p>
        } @else {
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Test case</th>
                  <th class="hide-mobile">Feature</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                @for (test of filtered(); track test.id) {
                  <tr>
                    <td>
                      <input
                        type="checkbox"
                        [checked]="selected().includes(test.id)"
                        [disabled]="!test.enabled"
                        (change)="toggle(test.id)"
                        [attr.aria-label]="'Select ' + test.id"
                      />
                    </td>
                    <td>
                      <strong>{{ test.id }}</strong
                      ><br />{{ test.title }}
                      <p class="muted">
                        {{ test.file }}:{{ test.line }} · {{ test.tags.join(', ') }}
                      </p>
                      @if (!test.enabled) {
                        <span class="badge">Disabled</span>
                      }
                      @if (canEdit()) {
                        <button (click)="edit(test)">Edit {{ test.id }}</button>
                      }
                    </td>
                    <td class="hide-mobile">{{ test.feature }}</td>
                    <td>
                      <span class="badge">{{ test.priority }}</span>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="4" class="empty">No tests match your search.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
      <section class="card">
        <h2>Configure execution</h2>
        <p>{{ selected().length }} tests selected</p>
        @if (hasUi()) {
          @if (canHeaded()) {
            <label
              ><input type="checkbox" [(ngModel)]="headed" />Headed browser in a virtual
              display</label
            >
          }
          <label
            >Video<select [(ngModel)]="video">
              <option value="off">Off</option>
              <option value="retain-on-failure">Retain on failure</option>
            </select></label
          >
          <label
            >Browser<select [(ngModel)]="browser">
              <option>chromium</option>
              <option>firefox</option>
              <option>webkit</option>
            </select></label
          >
        }
        <label
          >Environment<select aria-label="Environment" [(ngModel)]="environmentId">
            @for (environment of environments(); track environment.id) {
              <option [value]="environment.id" [disabled]="!environment.enabled">
                {{ environment.name }}
              </option>
            }
          </select></label
        ><label>Workers<input type="number" min="1" max="4" [(ngModel)]="workers" /></label
        ><label>Retries<input type="number" min="0" max="2" [(ngModel)]="retries" /></label>
        <p class="muted">
          Selection and configuration are frozen when the run starts. API tests do not launch a
          browser.
        </p>
        <button
          class="primary"
          [disabled]="!selected().length || starting() || api.identity()?.role === 'viewer'"
          (click)="start()"
        >
          {{ starting() ? 'Starting…' : 'Start execution' }}
        </button>
      </section>
    </div>
  `,
})
export class Explorer {
  readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly tests = signal<TestCase[]>([]);
  readonly revision = signal('');
  readonly kind = signal(this.route.snapshot.queryParamMap.get('kind') ?? 'all');
  readonly priority = signal(this.route.snapshot.queryParamMap.get('priority') ?? 'all');
  readonly query = signal(this.route.snapshot.queryParamMap.get('query') ?? '');
  readonly selected = signal<string[]>([]);
  readonly loading = signal(true);
  readonly starting = signal(false);
  readonly error = signal('');
  readonly editing = signal<TestCase | null>(null);
  readonly saving = signal(false);
  feature = '';
  module = '';
  owner = '';
  tags = '';
  editPriority = 'P1';
  enabled = true;
  canEdit() {
    return ['administrator', 'maintainer'].includes(this.api.identity()?.role ?? '');
  }
  edit(test: TestCase) {
    this.editing.set(test);
    this.feature = test.feature;
    this.module = test.module;
    this.owner = test.owner;
    this.tags = test.tags.join(', ');
    this.editPriority = test.priority;
    this.enabled = test.enabled;
  }
  async saveMetadata() {
    const current = this.editing();
    if (!current) return;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.api.patch(
        `/projects/${this.api.projectId()}/catalog/${current.id}`,
        {
          feature: this.feature,
          module: this.module,
          owner: this.owner,
          tags: this.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
          priority: this.editPriority,
          enabled: this.enabled,
        },
        current.version,
      );
      this.editing.set(null);
      await this.load();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
  workers = 1;
  retries = 0;
  browser = 'chromium';
  environmentId = 'local-lab';
  readonly environments = signal<Environment[]>([]);
  readonly headedAvailable = signal(false);
  headed = false;
  canHeaded() {
    return (
      this.headedAvailable() &&
      !!this.environments().find((environment) => environment.id === this.environmentId)
        ?.allowHeaded
    );
  }
  video: 'off' | 'retain-on-failure' = 'off';
  readonly hasUi = computed(() => this.selected().some((id) => id.startsWith('UI-')));
  private key = crypto.randomUUID();
  readonly filtered = computed(() =>
    this.tests().filter(
      (test) =>
        `${test.id} ${test.title} ${test.feature} ${test.module} ${test.owner} ${test.tags.join(' ')}`
          .toLowerCase()
          .includes(this.query().toLowerCase()) &&
        (this.kind() === 'all' || test.kind === this.kind()) &&
        (this.priority() === 'all' || test.priority === this.priority()),
    ),
  );
  constructor() {
    void this.load();
  }
  async load() {
    this.loading.set(true);
    try {
      const catalog = await this.api.get<{
        items: TestCase[];
        revision: string;
        discoveryError?: string;
      }>(`/projects/${this.api.projectId()}/catalog`);
      this.tests.set(catalog.items);
      this.selected.update((ids) =>
        ids.filter((id) => catalog.items.some((item) => item.id === id && item.enabled)),
      );
      const environments = await this.api.get<{
        items: Environment[];
        capabilities?: { headed: boolean };
      }>(`/projects/${this.api.projectId()}/environments`);
      this.environments.set(environments.items);
      this.headedAvailable.set(environments.capabilities?.headed ?? false);
      this.revision.set(catalog.revision);
      this.error.set(catalog.discoveryError ?? '');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
  search(value: string) {
    this.query.set(value);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        query: value || null,
        kind: this.kind() === 'all' ? null : this.kind(),
        priority: this.priority() === 'all' ? null : this.priority(),
      },
      replaceUrl: true,
    });
  }
  toggle(id: string) {
    this.selected.update((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
    this.key = crypto.randomUUID();
  }
  selectAll() {
    this.selected.set(
      this.filtered()
        .filter((test) => test.enabled)
        .map((test) => test.id),
    );
    this.key = crypto.randomUUID();
  }
  async start() {
    this.starting.set(true);
    this.error.set('');
    try {
      const run = await this.api.launch(
        this.selected(),
        this.key,
        this.workers,
        this.retries,
        this.browser,
        this.revision(),
        this.video,
        this.environmentId,
        this.hasUi() && this.canHeaded() && this.headed,
      );
      await this.router.navigate(['/runs', run.id]);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.starting.set(false);
    }
  }
}
