import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Api, errorMessage } from './api';
interface Member {
  subject: string;
  name: string;
  role: string;
  projectIds: string[];
  version: number;
}
@Component({
  selector: 'app-members',
  imports: [FormsModule],
  template: `<section class="card">
    <h2>Organization members</h2>
    <p class="muted">
      Use the subject identifier from your identity provider. Changes apply immediately to existing
      sessions. Another administrator must change your own access.
    </p>
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    <form (ngSubmit)="save()">
      <div class="toolbar">
        <label
          >Member subject<input
            name="subject"
            [(ngModel)]="subject"
            [readonly]="!!editing"
            required
            maxlength="240"
        /></label>
        <label>Member name<input name="name" [(ngModel)]="name" required maxlength="120" /></label>
        <label
          >Member role<select name="role" [(ngModel)]="role">
            <option>viewer</option>
            <option>operator</option>
            <option>maintainer</option>
            <option>administrator</option>
          </select></label
        >
      </div>
      <fieldset class="selection-list">
        <legend>Project access</legend>
        @for (project of api.projects(); track project.id) {
          <label
            ><input
              type="checkbox"
              [checked]="selected.includes(project.id)"
              (change)="toggle(project.id)"
            />{{ project.name }}</label
          >
        }
      </fieldset>
      <p class="muted">Clear every project to revoke execution and evidence access.</p>
      <div class="actions">
        <button [disabled]="busy() || !subject.trim() || !name.trim()">
          {{ editing ? 'Save member' : 'Add member' }}
        </button>
        @if (editing) {
          <button type="button" (click)="reset()">Cancel member edit</button>
        }
      </div>
    </form>
    <div class="table-wrap">
      <table class="mobile-result-cards" role="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Subject</th>
            <th>Role</th>
            <th>Projects</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          @for (member of members(); track member.subject) {
            <tr>
              <td data-label="Name">{{ member.name }}</td>
              <td data-label="Subject">{{ member.subject }}</td>
              <td data-label="Role">{{ member.role }}</td>
              <td data-label="Projects">{{ member.projectIds.length }}</td>
              <td data-label="Action">
                <button
                  [disabled]="member.subject === api.identity()?.subject"
                  (click)="edit(member)"
                >
                  Edit {{ member.name }}
                </button>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  </section>`,
})
export class Members {
  public readonly api = inject(Api);
  public readonly members = signal<Member[]>([]);
  public readonly busy = signal(false);
  public readonly error = signal('');
  public subject = '';
  public name = '';
  public role = 'viewer';
  public selected: string[] = [];
  public editing: Member | null = null;
  public constructor() {
    void this.load();
  }
  public async load(): Promise<void> {
    try {
      this.members.set((await this.api.get<{ items: Member[] }>('/members')).items);
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
  public toggle(id: string): void {
    this.selected = this.selected.includes(id)
      ? this.selected.filter((value) => value !== id)
      : [...this.selected, id];
  }
  public edit(member: Member): void {
    this.editing = member;
    this.subject = member.subject;
    this.name = member.name;
    this.role = member.role;
    this.selected = [...member.projectIds];
  }
  public reset(): void {
    this.editing = null;
    this.subject = '';
    this.name = '';
    this.role = 'viewer';
    this.selected = [];
  }
  public async save(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.post(
        '/members',
        { subject: this.subject, name: this.name, role: this.role, projectIds: this.selected },
        undefined,
        this.editing?.version,
      );
      this.reset();
      await this.load();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
