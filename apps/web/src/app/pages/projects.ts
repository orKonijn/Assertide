import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, Project, errorMessage } from '../core/api';
@Component({
  imports: [RouterLink],
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
    <div class="grid">
      @for (project of projects(); track project.id) {
        <section class="card">
          <h2>{{ project.name }}</h2>
          <p>{{ project.description }}</p>
          <a class="button" routerLink="/explorer" (click)="api.projectId.set(project.id)"
            >Open project</a
          >
        </section>
      } @empty {
        <p class="empty">No accessible projects.</p>
      }
    </div>`,
})
export class Projects {
  readonly api = inject(Api);
  readonly projects = signal<Project[]>([]);
  readonly error = signal('');
  constructor() {
    void this.api
      .get<{ items: Project[] }>('/projects')
      .then((data) => this.projects.set(data.items))
      .catch((error) => this.error.set(errorMessage(error)));
  }
}
