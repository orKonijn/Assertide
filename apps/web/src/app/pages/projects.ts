import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import type { Project } from '../core/api';
import { Api, errorMessage } from '../core/api';
@Component({
  imports: [RouterLink, FormsModule],
  template: `<header class="page-header">
      <div>
        <p class="eyebrow">YOUR WORKSPACE</p>
        <h1>Projects</h1>
        <p class="muted">Projects you are authorized to access.</p>
      </div>
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (api.identity()?.role === 'administrator') {
      <section class="card">
        <h2>{{ editing ? 'Edit project' : 'Create project' }}</h2>
        <form (ngSubmit)="save()" class="toolbar">
          <label
            >Project name<input name="name" [(ngModel)]="name" required maxlength="120"
          /></label>
          <label
            >Description<input name="description" [(ngModel)]="description" maxlength="2000"
          /></label>
          <button [disabled]="busy() || !name.trim()">
            {{ editing ? 'Save project' : 'Create project' }}
          </button>
          @if (editing) {
            <button type="button" (click)="reset()">Cancel editing</button>
          }
        </form>
      </section>
    }
    <div class="grid">
      @for (project of projects(); track project.id) {
        <section class="card project-card">
          <h2>{{ project.name }}</h2>
          <p>{{ project.description }}</p>
          <div class="actions project-actions">
            <a class="button" routerLink="/explorer" (click)="api.selectProject(project.id)"
              >Open project</a
            >
            @if (api.identity()?.role === 'administrator') {
              <button [attr.aria-label]="'Edit ' + project.name" (click)="edit(project)">
                Edit
              </button>
            }
          </div>
        </section>
      } @empty {
        <p class="empty">No accessible projects.</p>
      }
    </div>`,
})
export class Projects {
  public readonly api = inject(Api);
  public readonly projects = signal<Project[]>([]);
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
