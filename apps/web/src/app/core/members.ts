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
      <fieldset>
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
      <button [disabled]="busy() || !subject.trim() || !name.trim()">
        {{ editing ? 'Save member' : 'Add member' }}
      </button>
      @if (editing) {
        <button type="button" (click)="reset()">Cancel member edit</button>
      }
    </form>
    <div class="table-wrap">
      <table>
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
              <td>{{ member.name }}</td>
              <td>{{ member.subject }}</td>
              <td>{{ member.role }}</td>
              <td>{{ member.projectIds.length }}</td>
              <td>
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
  readonly api = inject(Api);
  readonly members = signal<Member[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  subject = '';
  name = '';
  role = 'viewer';
  selected: string[] = [];
  editing: Member | null = null;
  constructor() {
    void this.load();
  }
  async load() {
    try {
      this.members.set((await this.api.get<{ items: Member[] }>('/members')).items);
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
  toggle(id: string) {
    this.selected = this.selected.includes(id)
      ? this.selected.filter((value) => value !== id)
      : [...this.selected, id];
  }
  edit(member: Member) {
    this.editing = member;
    this.subject = member.subject;
    this.name = member.name;
    this.role = member.role;
    this.selected = [...member.projectIds];
  }
  reset() {
    this.editing = null;
    this.subject = '';
    this.name = '';
    this.role = 'viewer';
    this.selected = [];
  }
  async save() {
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
