import { Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

export function atJsonPointer(value: unknown, pointer: string): unknown {
  if (pointer === '') return value;
  if (!pointer.startsWith('/') || /~(?![01])/.test(pointer))
    throw new Error('Use an empty pointer for the whole document or a path starting with /.');
  for (const segment of pointer.slice(1).split('/')) {
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key))
      throw new Error('This pointer is not present in the recorded evidence.');
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
@Component({
  selector: 'app-json-evidence',
  imports: [FormsModule],
  template: `
    <div class="flex flex-wrap gap-2 items-center">
      @if (lines().length > 200) {
        <button type="button" (click)="expanded.set(!expanded())">
          {{ expanded() ? 'Collapse to 200 lines' : 'Show all ' + lines().length + ' lines' }}
        </button>
      }
      <button type="button" (click)="download()">Download redacted JSON</button>
      <button type="button" (click)="inspect('/request')">Request</button>
      <button type="button" (click)="inspect('/response')">Response</button>
    </div>
    <form (ngSubmit)="inspect(pointer)" class="toolbar">
      <label
        >JSON pointer<input
          name="pointer"
          [(ngModel)]="pointer"
          placeholder="/response/body/quantity"
      /></label>
      <button type="submit">Inspect pointer</button>
    </form>
    @if (selected()) {
      <p class="muted">{{ selected()!.label }}</p>
      <pre tabindex="0" aria-label="Selected JSON value" class="max-h-[20rem] overflow-auto">{{
        selected()!.text
      }}</pre>
    }
    @if (pointerError()) {
      <p role="alert">{{ pointerError() }}</p>
    }
    <pre
      tabindex="0"
      aria-label="Recorded request and response"
      class="max-h-[32rem] overflow-auto"
      >{{ displayed() }}</pre>
    @if (lines().length > 200 && !expanded()) {
      <p class="muted">
        Showing 200 of {{ lines().length }} lines. The download contains all recorded redacted
        evidence.
      </p>
    }
  `,
})
export class JsonEvidence {
  readonly value = input.required<string>();
  readonly expanded = signal(false);
  pointer = '/response/body';
  private readonly selection = signal<{ source: string; label: string; text: string } | null>(null);
  readonly selected = computed(() =>
    this.selection()?.source === this.value() ? this.selection() : null,
  );
  readonly pointerError = signal('');
  inspect(pointer: string) {
    this.pointer = pointer;
    this.pointerError.set('');
    this.selection.set(null);
    try {
      this.selection.set({
        source: this.value(),
        label: pointer || 'Whole document',
        text: JSON.stringify(atJsonPointer(JSON.parse(this.value()), pointer), null, 2),
      });
    } catch (error) {
      this.pointerError.set(error instanceof Error ? error.message : 'Evidence is not valid JSON.');
    }
  }
  readonly lines = computed(() => this.value().split('\n'));
  readonly displayed = computed(() =>
    (this.expanded() ? this.lines() : this.lines().slice(0, 200)).join('\n'),
  );
  download() {
    const url = URL.createObjectURL(new Blob([this.value()], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'assertide-redacted-exchange.json';
    link.click();
    URL.revokeObjectURL(url);
  }
}
