import { Component, input, inject, signal, OnInit } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, errorMessage, ResultStep } from './api';
@Component({
  selector: 'app-result-steps',
  imports: [NgTemplateOutlet],
  template: `<ng-template #tree let-items
      ><ol>
        @for (step of items; track $index) {
          <li>
            <details>
              <summary>
                {{ step.title }} · {{ step.duration }}ms
                @if (step.error) {
                  · failed
                }
              </summary>
              <p class="muted">{{ step.category }}</p>
              @if (step.error) {
                <pre>{{ step.error }}</pre>
              }
              <ng-container
                [ngTemplateOutlet]="tree"
                [ngTemplateOutletContext]="{ $implicit: step.steps }"
              />
            </details>
          </li>
        }</ol></ng-template
    ><ng-container [ngTemplateOutlet]="tree" [ngTemplateOutletContext]="{ $implicit: steps() }" />`,
})
export class ResultSteps {
  readonly steps = input<ResultStep[]>([]);
}
interface Note {
  id: string;
  resultId: string;
  text: string;
  author: string;
  createdAt: string;
}
@Component({
  selector: 'app-result-notes',
  imports: [DatePipe, FormsModule, RouterLink],
  styles: ['.note-text { white-space: pre-wrap; }'],
  template: `<h3>Previous comparable result</h3>
    @if (previous(); as value) {
      <p>
        <a [routerLink]="['/runs', value.runId]" [queryParams]="{ result: resultId() }">{{
          value.runId.slice(0, 8)
        }}</a>
        · {{ value.result.status }} · {{ value.result.duration }}ms ·
        {{ value.endedAt | date: 'medium' }}
      </p>
      <p class="muted">
        Same source revision, environment and case/browser. Execution worker/retry settings may
        differ.
      </p>
    } @else {
      <p>No earlier comparable completed result.</p>
    }
    <h3>Investigation notes</h3>
    <p class="muted">Diagnoses are separate from the recorded result.</p>
    @for (note of notes(); track note.id) {
      <article>
        <p>{{ note.author }} · {{ note.createdAt | date: 'medium' }}</p>
        <p class="note-text">{{ note.text }}</p>
      </article>
    } @empty {
      <p>No notes for this result.</p>
    }
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    @if (api.identity()?.role !== 'viewer') {
      <form (ngSubmit)="save()">
        <label
          >Diagnosis<textarea
            name="diagnosis"
            [(ngModel)]="text"
            maxlength="4000"
            required
          ></textarea></label
        ><button type="submit" [disabled]="busy() || !text.trim()">Add investigation note</button>
      </form>
    }`,
})
export class ResultNotes implements OnInit {
  readonly runId = input.required<string>();
  readonly resultId = input.required<string>();
  readonly api = inject(Api);
  readonly notes = signal<Note[]>([]);
  readonly previous = signal<{
    runId: string;
    endedAt: string;
    result: { status: string; duration: number };
  } | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  text = '';
  ngOnInit() {
    void this.load();
  }
  async load() {
    try {
      const response = await this.api.get<{ items: Note[] }>(`/runs/${this.runId()}/annotations`);
      this.notes.set(response.items.filter((note) => note.resultId === this.resultId()));
      this.previous.set(
        (
          await this.api.get<{
            previous: {
              runId: string;
              endedAt: string;
              result: { status: string; duration: number };
            } | null;
          }>(`/runs/${this.runId()}/results/${encodeURIComponent(this.resultId())}/previous`)
        ).previous,
      );
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
  async save() {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.post(`/runs/${this.runId()}/annotations`, {
        resultId: this.resultId(),
        text: this.text,
      });
      this.text = '';
      await this.load();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
