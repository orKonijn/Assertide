import { Component, DestroyRef, inject, input, signal } from '@angular/core';
@Component({
  selector: 'app-loading-state',
  template: `<p role="status">{{ label() }}</p>
    @if (visible()) {
      <div aria-hidden="true" class="grid gap-3">
        <div class="skeleton"></div>
        <div class="skeleton"></div>
        <div class="skeleton"></div>
      </div>
    }`,
  styles: [
    '.skeleton { height: 3rem; border-radius: .5rem; background: var(--soft); border: 1px solid var(--border); }',
  ],
})
export class LoadingState {
  readonly label = input('Loading…');
  readonly visible = signal(false);
  constructor() {
    const timer = setTimeout(() => this.visible.set(true), 200);
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }
}
