import { Component, Injectable, inject, signal, DestroyRef } from '@angular/core';
import { DatePipe } from '@angular/common';
interface Notice {
  id: number;
  message: string;
  at: string;
}
@Injectable({ providedIn: 'root' })
export class Notifications {
  readonly history = signal<Notice[]>([]);
  readonly active = signal<Notice[]>([]);
  private nextId = 0;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  constructor() {
    inject(DestroyRef).onDestroy(() => this.clear());
  }
  success(message: string) {
    const item = { id: ++this.nextId, message, at: new Date().toISOString() };
    this.history.update((items) => [item, ...items].slice(0, 50));
    this.active.set([item]);
    const timer = setTimeout(() => {
      this.dismiss(item.id);
      this.timers.delete(timer);
    }, 5000);
    this.timers.add(timer);
  }
  dismiss(id: number) {
    this.active.update((items) => items.filter((item) => item.id !== id));
  }
  clear() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.history.set([]);
    this.active.set([]);
  }
}
@Component({
  selector: 'app-notifications',
  imports: [DatePipe],
  template: `
    <details class="notification-history">
      <summary>Notification history ({{ notices.history().length }})</summary>
      @for (item of notices.history(); track item.id) {
        <p>{{ item.at | date: 'shortTime' }} · {{ item.message }}</p>
      } @empty {
        <p>No actions recorded in this session.</p>
      }
    </details>
    <div class="toast-area" aria-live="polite" aria-atomic="true">
      @for (item of notices.active(); track item.id) {
        <div class="toast">
          <span>{{ item.message }}</span
          ><button
            type="button"
            (click)="notices.dismiss(item.id)"
            aria-label="Dismiss notification"
          >
            Dismiss
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    '.notification-history { margin-bottom: 1rem; color: var(--muted); } .toast-area { position: fixed; bottom: 1rem; right: 1rem; z-index: 30; max-width: calc(100vw - 2rem); } .toast { display: flex; align-items: center; gap: 1rem; padding: 1rem; border: 1px solid var(--border); border-radius: .75rem; color: var(--text); background: var(--surface); box-shadow: 0 4px 20px #0003; }',
  ],
})
export class NotificationLog {
  readonly notices = inject(Notifications);
}
