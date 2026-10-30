import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import type { Suite, TestCase } from '../core/api';
import { Api, errorMessage } from '../core/api';
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
    <div class="split suite-layout">
      <section>
        @for (suite of suites(); track suite.id) {
          <article class="card">
            <h2>{{ suite.name }}</h2>
            <p>{{ suite.description }}</p>
            <p>{{ suite.testIds.length }} tests · revision {{ suite.version }}</p>
            <p>Priority {{ suite.priority || 'P1' }}</p>
            <p class="muted">
              {{ suite.owner || 'No owner assigned' }} · {{ suite.tags.join(', ') }}
            </p>
            <div class="actions">
              @if (canEdit()) {
                <button [disabled]="busy()" (click)="edit(suite)">Edit {{ suite.name }}</button>
              }
              <button
                [disabled]="busy() || !suite.testIds.length || api.identity()?.role === 'viewer'"
                (click)="run(suite)"
              >
                Run suite
              </button>
            </div>
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
          >Suite priority<select name="priority" [(ngModel)]="priority">
            <option>P0</option>
            <option>P1</option>
            <option>P2</option>
          </select></label
        >
        <label
          >Tags (comma separated)<input name="tags" [(ngModel)]="tags" maxlength="1000"
        /></label>
        <fieldset class="selection-list">
          <legend>Membership</legend>
          @for (test of tests(); track test.id) {
            <label
              ><input
                type="checkbox"
                [checked]="selected().includes(test.id)"
                [disabled]="!test.enabled && !selected().includes(test.id)"
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
  public readonly api = inject(Api);
  private readonly router = inject(Router);
  public readonly suites = signal<Suite[]>([]);
  public readonly tests = signal<TestCase[]>([]);
  public readonly selected = signal<string[]>([]);
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
  public canEdit(): boolean {
    return ['administrator', 'maintainer'].includes(this.api.identity()?.role ?? '');
  }
  public edit(suite: Suite): void {
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
