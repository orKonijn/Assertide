import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import type { Suite, TestCase } from '../core/api';
import { Api, errorMessage } from '../core/api';
import { Modal } from '../core/modal';
@Component({
  host: { class: 'suites-page' },
  imports: [FormsModule, Modal],
  template: `<header class="page-header">
      <div>
        <p class="eyebrow">Saved selections</p>
        <h1>Test suites</h1>
        <p class="muted">Save named groups of catalog tests.</p>
      </div>
      @if (canEdit()) {
        <button class="primary" (click)="reset(); editorOpen.set(true)">Create suite</button>
      }
    </header>
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    <div class="split suite-layout">
      <section class="suite-list">
        <nav class="result-pagination" aria-label="Suite pages">
          <span class="muted" role="status"
            >{{ suites().length }} suites · Page {{ currentPage() }} of {{ pageCount() }}</span
          >
          <div class="catalog-page-buttons">
            <button
              type="button"
              aria-label="Previous suite page"
              [disabled]="currentPage() === 1"
              (click)="page.set(currentPage() - 1)"
            >
              ‹
            </button>
            @for (number of pageNumbers(); track number) {
              <button
                type="button"
                [attr.aria-label]="'Suite page ' + number"
                [attr.aria-current]="currentPage() === number ? 'page' : null"
                (click)="page.set(number)"
              >
                {{ number }}
              </button>
            }
            <button
              type="button"
              aria-label="Next suite page"
              [disabled]="currentPage() === pageCount()"
              (click)="page.set(currentPage() + 1)"
            >
              ›
            </button>
          </div>
        </nav>
        <div class="suite-card-grid">
          @for (suite of pageSuites(); track suite.id) {
            <article class="card suite-card">
              <div class="suite-card-heading">
                <span class="suite-mark" aria-hidden="true"
                  ><svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M5 4h14v16H5z M9 8h6 M9 12h6 M9 16h3" /></svg
                ></span>
                <h2>{{ suite.name }}</h2>
                <span class="badge">{{ suite.priority || 'P1' }}</span>
              </div>
              <p>{{ suite.description }}</p>
              <div class="suite-meta">
                <span>{{ suite.testIds.length }} tests</span
                ><span>Revision {{ suite.version }}</span>
              </div>
              <p class="muted suite-owner">
                {{ suite.owner || 'No owner assigned' }}
                @if (suite.tags.length) {
                  <span> · {{ suite.tags.join(', ') }}</span>
                }
              </p>
              <div class="actions">
                @if (canEdit()) {
                  <button
                    [disabled]="busy()"
                    [attr.aria-label]="'Edit ' + suite.name"
                    (click)="edit(suite)"
                  >
                    Edit
                  </button>
                }
                <button
                  [disabled]="busy() || !suite.testIds.length || api.identity()?.role === 'viewer'"
                  class="suite-run"
                  (click)="run(suite)"
                >
                  Run suite
                </button>
              </div>
            </article>
          } @empty {
            <section class="card empty">No suites yet. Create a reusable selection.</section>
          }
        </div>
      </section>
    </div>
    @if (editorOpen()) {
      <dialog
        appModal
        class="workspace-modal suite-dialog"
        aria-label="Suite builder"
        (dismissed)="editorOpen.set(false)"
      >
        <header class="editor-heading">
          <div>
            <p class="eyebrow">SAVED SELECTION</p>
            <h2>{{ editing() ? 'Edit suite' : 'Create suite' }}</h2>
            <p class="muted">A focused collection, ready to run again.</p>
          </div>
          <button
            class="editor-close"
            type="button"
            (click)="editorOpen.set(false)"
            aria-label="Close suite builder"
          >
            &times;
          </button>
        </header>
        <form class="suite-editor" (ngSubmit)="save()">
          <div class="suite-builder-columns">
            <section class="suite-details" aria-label="Suite details">
              <h3>Suite details</h3>
              <label>Name<input name="name" [(ngModel)]="name" required maxlength="120" /></label
              ><label
                >Description<textarea
                  name="description"
                  [(ngModel)]="description"
                  maxlength="2000"
                ></textarea>
              </label>
              <details class="suite-options">
                <summary>Owner, priority & tags</summary>
                <label>Owner<input name="owner" [(ngModel)]="owner" maxlength="120" /></label>
                <label
                  >Suite priority<select name="priority" [(ngModel)]="priority">
                    <option>P0</option>
                    <option>P1</option>
                    <option>P2</option>
                  </select></label
                >
                <label
                  >Tags (comma separated)<input name="tags" [(ngModel)]="tags" maxlength="1000"
                /></label>
              </details>
            </section>
            <fieldset class="selection-list">
              <legend>
                Tests <span class="muted">{{ selected().length }} selected</span>
              </legend>
              <div class="suite-member-filters">
                <label class="suite-test-search"
                  >Search tests<input
                    type="search"
                    name="testSearch"
                    [ngModel]="testQuery()"
                    (ngModelChange)="testQuery.set($event); testPage.set(1)"
                    placeholder="Case ID or title"
                /></label>
                <label class="suite-test-kind"
                  >Test type<select
                    aria-label="Test type"
                    name="testKind"
                    [ngModel]="testKind()"
                    (ngModelChange)="testKind.set($event); testPage.set(1)"
                  >
                    <option value="all">All types</option>
                    <option value="api">API</option>
                    <option value="ui">Browser</option>
                  </select></label
                >
              </div>
              <div class="actions membership-actions">
                <button type="button" (click)="selectMatching()">Select matching tests</button
                ><button type="button" (click)="selected.set([])">Clear selection</button>
              </div>
              @for (test of pageTests(); track test.id) {
                <label
                  ><input
                    type="checkbox"
                    [checked]="selected().includes(test.id)"
                    [disabled]="!test.enabled && !selected().includes(test.id)"
                    (change)="toggle(test.id)"
                  />
                  <span
                    ><strong>{{ test.id }}</strong
                    ><span>{{ test.title }}</span></span
                  ></label
                >
              }
              @if (!filteredTests().length) {
                <p class="muted">No matching tests.</p>
              }
              <nav class="suite-test-pages" aria-label="Suite membership pages">
                <button
                  type="button"
                  aria-label="Previous tests"
                  [disabled]="currentTestPage() === 1"
                  (click)="testPage.set(currentTestPage() - 1)"
                >
                  ‹
                </button>
                <span>{{ currentTestPage() }} / {{ testPageCount() }}</span>
                <button
                  type="button"
                  aria-label="Next tests"
                  [disabled]="currentTestPage() === testPageCount()"
                  (click)="testPage.set(currentTestPage() + 1)"
                >
                  ›
                </button>
              </nav>
            </fieldset>
          </div>
          <footer class="editor-footer">
            <span class="muted" role="status">{{ selected().length }} tests selected</span>
            <div class="actions">
              <button type="button" (click)="editorOpen.set(false)">Cancel</button>
              <button
                class="primary"
                type="submit"
                [disabled]="
                  busy() ||
                  !name.trim() ||
                  !['administrator', 'maintainer'].includes(api.identity()?.role ?? '')
                "
              >
                Save suite
              </button>
            </div>
          </footer>
        </form>
      </dialog>
    }`,
})
export class Suites {
  public readonly api = inject(Api);
  private readonly router = inject(Router);
  public readonly suites = signal<Suite[]>([]);
  public readonly page = signal(1);
  public readonly pageCount = computed(() => Math.max(1, Math.ceil(this.suites().length / 10)));
  public readonly currentPage = computed(() =>
    Math.max(1, Math.min(this.page(), this.pageCount())),
  );
  public readonly pageSuites = computed(() =>
    this.suites().slice((this.currentPage() - 1) * 10, this.currentPage() * 10),
  );
  public readonly pageNumbers = computed(() => {
    const start = Math.max(1, Math.min(this.currentPage() - 2, this.pageCount() - 4));
    return Array.from({ length: Math.min(5, this.pageCount()) }, (_, index) => start + index);
  });
  public readonly editorOpen = signal(false);
  public readonly testKind = signal('all');
  public readonly tests = signal<TestCase[]>([]);
  public readonly selected = signal<string[]>([]);
  public readonly testQuery = signal('');
  public readonly testPage = signal(1);
  public readonly filteredTests = computed(() => {
    const query = this.testQuery().trim().toLowerCase();
    return this.tests().filter(
      (test) =>
        (test.id + ' ' + test.title).toLowerCase().includes(query) &&
        (this.testKind() === 'all' ||
          (this.testKind() === 'ui' ? test.id.startsWith('UI-') : !test.id.startsWith('UI-'))),
    );
  });
  public readonly testPageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredTests().length / 4)),
  );
  public readonly currentTestPage = computed(() => Math.min(this.testPage(), this.testPageCount()));
  public readonly pageTests = computed(() =>
    this.filteredTests().slice((this.currentTestPage() - 1) * 4, this.currentTestPage() * 4),
  );
  public readonly error = signal('');
  public readonly busy = signal(false);
  public readonly editing = signal<Suite | null>(null);
  public name = '';
  public description = '';
  public owner = '';
  public priority = 'P1';
  public tags = '';
  public constructor() {
    void this.load();
  }
  public selectMatching(): void {
    this.selected.update((ids) => [
      ...new Set([
        ...ids,
        ...this.filteredTests()
          .filter((test) => test.enabled)
          .map((test) => test.id),
      ]),
    ]);
  }
  public canEdit(): boolean {
    return ['administrator', 'maintainer'].includes(this.api.identity()?.role ?? '');
  }
  public edit(suite: Suite): void {
    this.editorOpen.set(true);
    this.testQuery.set('');
    this.testPage.set(1);
    this.editing.set(suite);
    this.name = suite.name;
    this.description = suite.description;
    this.owner = suite.owner;
    this.priority = suite.priority ?? 'P1';
    this.tags = suite.tags.join(', ');
    this.selected.set([...suite.testIds]);
    this.error.set('');
  }
  public reset(): void {
    this.testQuery.set('');
    this.testPage.set(1);
    this.editing.set(null);
    this.name = '';
    this.description = '';
    this.owner = '';
    this.priority = 'P1';
    this.tags = '';
    this.selected.set([]);
  }
  public async load(): Promise<void> {
    try {
      const [suites, tests] = await Promise.all([
        this.api.get<{ items: Suite[] }>(`/projects/${this.api.projectId()}/suites`),
        this.api.get<{ items: TestCase[] }>(`/projects/${this.api.projectId()}/catalog`),
      ]);
      this.suites.set(suites.items);
      this.tests.set(tests.items);
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
  public toggle(id: string): void {
    this.selected.update((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  }
  public async save(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const body = {
        name: this.name,
        description: this.description,
        testIds: this.selected(),
        owner: this.owner,
        priority: this.priority,
        tags: this.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      };
      const current = this.editing();
      if (current) {
        await this.api.patch(`/suites/${current.id}`, body, current.version);
      } else {
        await this.api.post(`/projects/${this.api.projectId()}/suites`, body);
      }
      this.reset();
      this.editorOpen.set(false);
      await this.load();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
  public async run(suite: Suite): Promise<void> {
    this.busy.set(true);
    try {
      const run = await this.api.launch(
        suite.testIds,
        crypto.randomUUID(),
        1,
        0,
        'chromium',
        undefined,
        'off',
        'local-lab',
        false,
        { id: suite.id, version: suite.version },
      );
      await this.router.navigate(['/runs', run.id]);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
