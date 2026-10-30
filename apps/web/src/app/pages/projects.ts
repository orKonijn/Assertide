import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import type { Project } from '../core/api';
import { Api, errorMessage } from '../core/api';
@Component({
  host: { class: 'projects-page' },
  imports: [RouterLink, FormsModule],
  template: `<header class="page-header">
      <div>
        <p class="eyebrow">YOUR WORKSPACE</p>
        <h1>Projects</h1>
        <p class="muted">Organize your testing work, suites, and execution history.</p>
      </div>
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (api.identity()?.role === 'administrator') {
      <section class="card project-editor">
        <div class="project-editor-heading">
          <h2>{{ editing ? 'Edit project' : 'Create project' }}</h2>
          <p class="muted">
            {{
              editing
                ? 'Update the name and description for your team.'
                : 'Give your next testing workspace a name.'
            }}
          </p>
        </div>
        <form (ngSubmit)="save()" class="toolbar">
          <label
            >Project name<input name="name" [(ngModel)]="name" required maxlength="120"
          /></label>
          <label
            >Description<input name="description" [(ngModel)]="description" maxlength="2000"
          /></label>
          <button class="primary" [disabled]="busy() || !name.trim()">
            {{ editing ? 'Save project' : 'Create project' }}
          </button>
          @if (editing) {
            <button type="button" (click)="reset()">Cancel editing</button>
          }
        </form>
      </section>
    }
    <div class="project-list-toolbar">
      <label
        ><span class="project-search-label"
          >Search projects
          <span class="muted" role="status">{{ filteredProjects().length }} projects</span></span
        ><input
          aria-label="Search projects"
          type="search"
          placeholder="Search by name or description"
          [ngModel]="query()"
          (ngModelChange)="query.set($event); page.set(1)"
      /></label>
      <nav aria-label="Project pages">
        <div class="catalog-page-buttons">
          <button
            type="button"
            aria-label="Previous project page"
            [disabled]="currentPage() === 1"
            (click)="page.set(currentPage() - 1)"
          >
            ‹
          </button>
          @for (number of pageNumbers(); track number) {
            <button
              type="button"
              [attr.aria-label]="'Project page ' + number"
              [attr.aria-current]="currentPage() === number ? 'page' : null"
              (click)="page.set(number)"
            >
              {{ number }}
            </button>
          }
          <button
            type="button"
            aria-label="Next project page"
            [disabled]="currentPage() === pageCount()"
            (click)="page.set(currentPage() + 1)"
          >
            ›
          </button>
        </div>
      </nav>
    </div>
    <div class="grid project-grid">
      @for (project of pageProjects(); track project.id) {
        <section class="card project-card" [class.active-project]="api.projectId() === project.id">
          <div class="project-card-top">
            <span class="project-avatar" aria-hidden="true">{{
              project.name.slice(0, 1).toUpperCase()
            }}</span>
            @if (api.projectId() === project.id) {
              <span class="project-active-label">Active project</span>
            }
          </div>
          <h2>{{ project.name }}</h2>
          <p class="project-description">
            {{ project.description || 'No description added yet.' }}
          </p>
          <div class="actions project-actions">
            <a class="button" routerLink="/explorer" (click)="api.selectProject(project.id)"
              >Open project <span aria-hidden="true">→</span></a
            >
            @if (api.identity()?.role === 'administrator') {
              <button [attr.aria-label]="'Edit ' + project.name" (click)="edit(project)">
                Edit
              </button>
            }
          </div>
        </section>
      } @empty {
        <p class="empty">
          {{ query() ? 'No projects match your search.' : 'No accessible projects.' }}
        </p>
      }
    </div>`,
})
export class Projects {
  public readonly api = inject(Api);
  public readonly projects = signal<Project[]>([]);
  public readonly query = signal('');
  public readonly filteredProjects = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return this.projects().filter((project) =>
      (project.name + ' ' + project.description).toLocaleLowerCase().includes(query),
    );
  });
  public readonly page = signal(1);
  public readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredProjects().length / 12)),
  );
  public readonly currentPage = computed(() =>
    Math.max(1, Math.min(this.page(), this.pageCount())),
  );
  public readonly pageProjects = computed(() =>
    this.filteredProjects().slice((this.currentPage() - 1) * 12, this.currentPage() * 12),
  );
  public readonly pageNumbers = computed(() => {
    const start = Math.max(1, Math.min(this.currentPage() - 2, this.pageCount() - 4));
    return Array.from({ length: Math.min(5, this.pageCount()) }, (_, index) => start + index);
  });
  public readonly error = signal('');
  public readonly busy = signal(false);
  public editing: Project | null = null;
  public name = '';
  public description = '';
  public constructor() {
    void this.api
      .get<{ items: Project[] }>('/projects')
      .then((data) => this.projects.set(data.items))
      .catch((error) => this.error.set(errorMessage(error)));
  }
  public edit(project: Project): void {
    this.editing = project;
    this.name = project.name;
    this.description = project.description;
  }
  public reset(): void {
    this.editing = null;
    this.name = '';
    this.description = '';
  }
  public async save(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const body = { name: this.name, description: this.description };
      if (this.editing) {
        await this.api.patch(`/projects/${this.editing.id}`, body, this.editing.version);
      } else {
        await this.api.post('/projects', body);
      }
      await this.api.loadIdentity();
      this.projects.set(this.api.projects());
      this.reset();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
