import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api, Suite, TestCase, errorMessage } from '../core/api';
@Component({
  imports: [FormsModule],
  template: `<header class="page-header">
      <div>
        <p class="eyebrow">REUSABLE SELECTIONS</p>
        <h1>Test suites</h1>
        <p class="muted">Save named groups of catalog tests.</p>
      </div>
    </header>
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    <div class="split">
      <section>
        @for (suite of suites(); track suite.id) {
          <article class="card">
            <h2>{{ suite.name }}</h2>
            <p>{{ suite.description }}</p>
            <p>{{ suite.testIds.length }} tests · revision {{ suite.version }}</p>
            <p class="muted">
              {{ suite.owner || 'No owner assigned' }} · {{ suite.tags.join(', ') }}
            </p>
            @if (canEdit()) {
              <button [disabled]="busy()" (click)="edit(suite)">Edit {{ suite.name }}</button>
            }
            <button
              [disabled]="busy() || !suite.testIds.length || api.identity()?.role === 'viewer'"
              (click)="run(suite)"
            >
              Run suite
            </button>
          </article>
        } @empty {
          <section class="card empty">No suites yet. Create a reusable selection.</section>
        }
      </section>
      <form class="card" (ngSubmit)="save()">
        <h2>{{ editing() ? 'Edit suite' : 'Create suite' }}</h2>
        @if (editing()) {
          <button type="button" (click)="reset()">Cancel editing</button>
        }
        <label>Name<input name="name" [(ngModel)]="name" required maxlength="120" /></label
        ><label
          >Description<textarea
            name="description"
            [(ngModel)]="description"
            maxlength="2000"
          ></textarea>
        </label>
        <label>Owner<input name="owner" [(ngModel)]="owner" maxlength="120" /></label>
        <label
          >Tags (comma separated)<input name="tags" [(ngModel)]="tags" maxlength="1000"
        /></label>
        <fieldset>
          <legend>Membership</legend>
          @for (test of tests(); track test.id) {
            <label
              ><input
                type="checkbox"
                [checked]="selected().includes(test.id)"
                (change)="toggle(test.id)"
              />
              {{ test.id }} {{ test.title }}</label
            >
          }
        </fieldset>
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
      </form>
    </div>`,
})
export class Suites {
  readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly suites = signal<Suite[]>([]);
  readonly tests = signal<TestCase[]>([]);
  readonly selected = signal<string[]>([]);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly editing = signal<Suite | null>(null);
  name = '';
  description = '';
  owner = '';
  tags = '';
  canEdit() {
    return ['administrator', 'maintainer'].includes(this.api.identity()?.role ?? '');
  }
  edit(suite: Suite) {
    this.editing.set(suite);
    this.name = suite.name;
    this.description = suite.description;
    this.owner = suite.owner;
    this.tags = suite.tags.join(', ');
    this.selected.set([...suite.testIds]);
    this.error.set('');
  }
  reset() {
    this.editing.set(null);
    this.name = '';
    this.description = '';
    this.owner = '';
    this.tags = '';
    this.selected.set([]);
  }
  constructor() {
    void this.load();
  }
  async load() {
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
  toggle(id: string) {
    this.selected.update((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  }
  async save() {
    this.busy.set(true);
    this.error.set('');
    try {
      const body = {
        name: this.name,
        description: this.description,
        testIds: this.selected(),
        owner: this.owner,
        tags: this.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      };
      const current = this.editing();
      if (current) await this.api.patch(`/suites/${current.id}`, body, current.version);
      else await this.api.post(`/projects/${this.api.projectId()}/suites`, body);
      this.reset();
      await this.load();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
  async run(suite: Suite) {
    this.busy.set(true);
    try {
      const run = await this.api.launch(suite.testIds, crypto.randomUUID(), 1, 0);
      await this.router.navigate(['/runs', run.id]);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
