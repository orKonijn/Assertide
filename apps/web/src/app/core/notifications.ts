import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
interface Notice {
  id: number;
  message: string;
  at: string;
}
@Injectable({ providedIn: 'root' })
export class Notifications {
  public readonly history = signal<Notice[]>([]);
  public readonly active = signal<Notice[]>([]);
  private readonly seenThrough = signal(0);
  public readonly historyOpen = signal(false);
  public readonly unread = computed(() =>
    this.historyOpen() ? 0 : this.history().filter((item) => item.id > this.seenThrough()).length,
  );
  private nextId = 0;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  public constructor() {
    inject(DestroyRef).onDestroy(() => this.clear());
  }
  public setHistoryOpen(open: boolean): void {
    this.seenThrough.set(this.nextId);
    this.historyOpen.set(open);
  }
  public success(message: string): void {
    const item = { id: ++this.nextId, message, at: new Date().toISOString() };
    this.history.update((items) => [item, ...items].slice(0, 50));
    this.active.set([item]);
    const timer = setTimeout(() => {
      this.dismiss(item.id);
      this.timers.delete(timer);
    }, 5000);
    this.timers.add(timer);
  }
  public dismiss(id: number): void {
    this.active.update((items) => items.filter((item) => item.id !== id));
  }
  public clear(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.historyOpen.set(false);
    this.seenThrough.set(this.nextId);
    this.history.set([]);
    this.active.set([]);
  }
}
@Component({
  selector: 'app-notifications',
  imports: [DatePipe],
  template: `
    <button
      class="notification-bell icon-button"
      popovertarget="notification-history"
      aria-label="Notification history"
      title="Notification history"
      [attr.aria-expanded]="notices.historyOpen()"
      aria-controls="notification-history"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </svg>
      @if (notices.unread()) {
        <span class="notification-count" aria-hidden="true">{{ notices.unread() }}</span>
      }
      <span class="notification-sr">{{ notices.unread() }} unread notifications</span>
    </button>
    <section
      id="notification-history"
      class="notification-panel"
      popover="auto"
      role="region"
      aria-label="Notification history"
      (beforetoggle)="onToggle($event)"
    >
      <header>
        <div class="notification-heading">
          <h2>Notifications</h2>
          <p>Activity from this session</p>
        </div>
        <button
          class="icon-button"
          popovertarget="notification-history"
          popovertargetaction="hide"
          aria-label="Close notifications"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </header>
      <div class="notification-items">
        @for (item of notices.history(); track item.id) {
          <article>
            <span class="notification-event-icon" aria-hidden="true"
              ><svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="m6 12 4 4 8-8" /></svg
            ></span>
            <div class="notification-event-text">
              <p>{{ item.message }}</p>
              <time [attr.datetime]="item.at">{{ item.at | date: 'shortTime' }}</time>
            </div>
          </article>
        } @empty {
          <div class="notification-empty">
            <strong>You’re all caught up</strong>
            <p>New activity will appear here.</p>
          </div>
        }
      </div>
    </section>
    <div class="notification-sr" aria-live="polite" aria-atomic="true">
      @for (item of notices.active(); track item.id) {
        <span>{{ item.message }}</span>
      }
    </div>
  `,
})
export class NotificationLog {
  public readonly notices = inject(Notifications);
  public onToggle(event: Event): void {
    this.notices.setHistoryOpen((event as ToggleEvent).newState === 'open');
  }
}
