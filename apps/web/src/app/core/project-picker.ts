import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from './api';

@Component({
  selector: 'app-project-picker',
  imports: [FormsModule],
  template: `
    <span class="picker-label">Active project</span>
    <button
      class="project-trigger"
      aria-label="Active project"
      aria-haspopup="dialog"
      (click)="open()"
    >
      <span>{{ currentName() }}</span
      ><span aria-hidden="true">⌄</span>
    </button>
    <dialog
      #dialog
      class="project-dialog"
      aria-labelledby="project-picker-title"
      (close)="query.set('')"
    >
      <div class="section-heading">
        <div>
          <p class="eyebrow">YOUR WORKSPACE</p>
          <h2 id="project-picker-title">Switch project</h2>
        </div>
        <button type="button" (click)="dialog.close()" aria-label="Close project picker">
          Close
        </button>
      </div>
      <label class="picker-search"
        >Search projects
        <input
          type="search"
          placeholder="Search by project name…"
          [ngModel]="query()"
          (ngModelChange)="query.set($event)"
        />
      </label>
      <p class="muted picker-count" role="status">{{ matches().length }} projects</p>
      <div class="project-options" aria-label="Projects">
        @for (project of matches(); track project.id) {
          <button
            class="project-option"
            [attr.aria-label]="project.name"
            [class.selected]="project.id === api.projectId()"
            [attr.aria-current]="project.id === api.projectId() ? 'true' : null"
            (click)="choose(project.id)"
          >
            <span class="project-initial" aria-hidden="true">{{
              project.name.slice(0, 1).toUpperCase()
            }}</span>
            <span class="project-option-name">{{ project.name }}</span>
            @if (project.id === api.projectId()) {
              <span class="picker-current">Current</span>
            }
          </button>
        } @empty {
          <p class="empty">No projects match “{{ query() }}”. Try another name.</p>
        }
      </div>
    </dialog>
  `,
})
export class ProjectPicker {
  readonly api = inject(Api);
  readonly query = signal('');
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly currentName = computed(
    () =>
      this.api.projects().find((p) => p.id === this.api.projectId())?.name ?? 'Choose a project',
  );
  readonly matches = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return this.api
      .projects()
      .filter((p) => p.name.toLocaleLowerCase().includes(query))
      .slice()
      .sort((a, b) => {
        if (a.id === this.api.projectId()) return -1;
        if (b.id === this.api.projectId()) return 1;
        return a.name.localeCompare(b.name);
      });
  });
  open() {
    this.query.set('');
    this.dialog().nativeElement.showModal();
    this.dialog().nativeElement.querySelector('input')?.focus();
  }
  choose(id: string) {
    this.dialog().nativeElement.close();
    if (id === this.api.projectId()) return;
    this.api.selectProject(id);
    location.assign('/');
  }
}
