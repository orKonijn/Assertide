import {
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'app-date-picker',
  host: {
    '(document:click)': 'outside($event)',
    '(document:keydown.escape)': 'close()',
    '(window:resize)': 'close()',
  },
  template: `
    <button
      #trigger
      [id]="label() === 'From date' ? 'from-date' : 'through-date'"
      type="button"
      class="date-trigger"
      [attr.aria-label]="label()"
      [attr.aria-expanded]="opened()"
      aria-haspopup="dialog"
      (click)="toggle()"
    >
      <span [class.muted]="!value()">{{ value() || 'Choose date' }}</span>
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
      >
        <path d="M5 5h14v16H5zM8 3v4m8-4v4M5 10h14" />
      </svg>
    </button>
    <div
      #popup
      popover="manual"
      class="date-calendar"
      role="dialog"
      [attr.aria-label]="label() + ' calendar'"
      [style.left.px]="left()"
      [style.top.px]="top()"
    >
      <div class="date-calendar-heading">
        <button type="button" aria-label="Previous month" (click)="move(-1)">‹</button>
        <span aria-live="polite">{{ monthTitle() }}</span>
        <button type="button" aria-label="Next month" (click)="move(1)">›</button>
      </div>
      <div class="date-calendar-week" aria-hidden="true">
        @for (day of weekdays; track $index) {
          <span>{{ day }}</span>
        }
      </div>
      <div class="date-calendar-days">
        @for (day of days(); track day.iso) {
          <button
            type="button"
            [class.outside-month]="!day.current"
            [class.is-today]="day.iso === today"
            [attr.aria-pressed]="day.iso === value()"
            [attr.aria-label]="day.iso"
            (click)="choose(day.iso)"
          >
            {{ day.number }}
          </button>
        }
      </div>
      <div class="date-calendar-footer">
        <button type="button" (click)="choose('')">Clear</button
        ><button type="button" (click)="choose(today)">Today</button
        ><button type="button" (click)="close()">Close</button>
      </div>
    </div>
  `,
})
export class DatePicker {
  public readonly value = model('');
  public readonly label = input('Date');
  public readonly opened = signal(false);
  public readonly left = signal(0);
  public readonly top = signal(0);
  public readonly month = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  public readonly today = this.iso(new Date());
  public readonly weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  public readonly monthTitle = computed(() =>
    this.month().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  );
  public readonly days = computed(() => {
    const month = this.month();
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(month.getFullYear(), month.getMonth(), index - month.getDay() + 1);
      return {
        iso: this.iso(date),
        number: date.getDate(),
        current: date.getMonth() === month.getMonth(),
      };
    });
  });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly popup = viewChild.required<ElementRef<HTMLElement>>('popup');
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  public toggle(): void {
    if (this.opened()) {
      this.close();
      return;
    }
    const date = this.value() ? new Date(this.value() + 'T12:00:00') : new Date();
    this.month.set(new Date(date.getFullYear(), date.getMonth(), 1));
    const box = this.trigger().nativeElement.getBoundingClientRect();
    this.left.set(Math.max(8, Math.min(box.left, window.innerWidth - 296)));
    this.top.set(Math.max(8, Math.min(box.bottom + 8, window.innerHeight - 366)));
    this.popup().nativeElement.showPopover();
    this.opened.set(true);
    setTimeout(() => {
      const selected =
        this.popup().nativeElement.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      const first = this.popup().nativeElement.querySelector<HTMLButtonElement>(
        '.date-calendar-days button:not(.outside-month)',
      );
      (selected ?? first)?.focus();
    });
  }
  public close(): void {
    if (!this.opened()) {
      return;
    }
    this.popup().nativeElement.hidePopover();
    this.opened.set(false);
    this.trigger().nativeElement.focus();
  }
  public choose(value: string): void {
    this.value.set(value);
    this.close();
  }
  public move(amount: number): void {
    const date = this.month();
    this.month.set(new Date(date.getFullYear(), date.getMonth() + amount, 1));
  }
  public outside(event: Event): void {
    if (this.opened() && !this.host.nativeElement.contains(event.target as Node)) {
      this.popup().nativeElement.hidePopover();
      this.opened.set(false);
    }
  }
  private iso(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
