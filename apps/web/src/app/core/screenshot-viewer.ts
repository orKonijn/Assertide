import { Component, ElementRef, input, signal, viewChild } from '@angular/core';
@Component({
  selector: 'app-screenshot-viewer',
  template: `
    <button type="button" (click)="open()">View screenshot</button>
    <dialog
      #dialog
      aria-label="Attempt screenshot"
      (close)="opened.set(false)"
      class="max-w-[94vw] max-h-[94vh] rounded-xl"
    >
      <button type="button" autofocus (click)="dialog.close()">Close screenshot</button>
      <p>{{ description() }}</p>
      @if (opened()) {
        @if (failed()) {
          <p role="alert">
            Screenshot is unavailable or access has expired. Close this view and refresh the
            execution.
          </p>
        }
        <img
          [src]="url()"
          [alt]="description()"
          (error)="failed.set(true)"
          class="block max-w-full max-h-[75vh] object-contain"
        />
      }
    </dialog>
  `,
  styles: [
    'dialog { color: var(--text); background: var(--surface); border: 1px solid var(--border); } dialog::backdrop { background: #0009; }',
  ],
})
export class ScreenshotViewer {
  readonly url = input.required<string>();
  readonly description = input.required<string>();
  readonly opened = signal(false);
  readonly failed = signal(false);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  open() {
    this.failed.set(false);
    this.opened.set(true);
    this.dialog().nativeElement.showModal();
  }
}
