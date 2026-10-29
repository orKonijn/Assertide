import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Api, TestCase, errorMessage } from '../core/api';
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
          <label
            >Browser<select [(ngModel)]="browser">
              <option>chromium</option>
              <option>firefox</option>
              <option>webkit</option>
            </select></label
          >
        }
        <label
          >Environment<select>
            <option>Local Lab sandbox</option>
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
  workers = 1;
  retries = 0;
  browser = 'chromium';
  readonly hasUi = computed(() => this.selected().some((id) => id.startsWith('UI-')));
  private key = crypto.randomUUID();
  readonly filtered = computed(() =>
    this.tests().filter(
      (test) =>
        `${test.id} ${test.title} ${test.feature} ${test.tags.join(' ')}`
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
    this.selected.set(this.filtered().map((test) => test.id));
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
      );
      await this.router.navigate(['/runs', run.id]);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.starting.set(false);
    }
  }
}
