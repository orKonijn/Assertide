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
  public readonly label = input('Loading…');
  public readonly visible = signal(false);
  public constructor() {
    const timer = setTimeout(() => this.visible.set(true), 200);
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }
}
