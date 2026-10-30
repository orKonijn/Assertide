import { Component, computed, input, signal } from '@angular/core';
@Component({
  selector: 'app-json-evidence',
  template: `
    <div class="flex flex-wrap gap-2 items-center">
      @if (lines().length > 200) {
        <button type="button" (click)="expanded.set(!expanded())">
          {{ expanded() ? 'Collapse to 200 lines' : 'Show all ' + lines().length + ' lines' }}
        </button>
      }
      <button type="button" (click)="download()">Download redacted JSON</button>
    </div>
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
