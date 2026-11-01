import { DestroyRef, inject, Injectable, signal } from '@angular/core';

export const guestStorageKey = 'assertide-guest-expiry';
export const guestDurationMs = 30 * 60 * 1000;

export function validGuestExpiry(value: string | null, now = Date.now()): number {
  const expiry = Number(value);
  return Number.isFinite(expiry) && expiry > now && expiry <= now + guestDurationMs ? expiry : 0;
}

/** Browser-only demo preference, never an authentication credential. Shared across tabs. */
@Injectable({ providedIn: 'root' })
export class GuestSession {
  public readonly active = signal(false);
  public readonly expired = signal(false);
  public readonly error = signal('');
  private timer: ReturnType<typeof setTimeout> | undefined;
  public constructor() {
    const update = (): void => this.restore();
    window.addEventListener('storage', update);
    document.addEventListener('visibilitychange', update);
    this.restore();
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      window.removeEventListener('storage', update);
      document.removeEventListener('visibilitychange', update);
    });
  }
  public start(): void {
    try {
      localStorage.setItem(guestStorageKey, String(Date.now() + guestDurationMs));
      this.expired.set(false);
      this.restore();
    } catch {
      this.error.set(
        'Guest demo needs temporary browser storage. Allow site storage and try again.',
      );
    }
  }
  public leave(): void {
    try {
      localStorage.removeItem(guestStorageKey);
    } catch {
      /* The in-memory demo still closes. */
    }
    clearTimeout(this.timer);
    this.active.set(false);
    this.expired.set(false);
  }
  private restore(): void {
    clearTimeout(this.timer);
    try {
      const stored = localStorage.getItem(guestStorageKey);
      const expiry = validGuestExpiry(stored);
      this.active.set(!!expiry);
      if (stored && !expiry) {
        // Keep the nonsensitive expiry marker so refresh can explain the expiry.
        this.expired.set(true);
      }
      if (expiry) {
        this.timer = setTimeout(() => this.restore(), Math.max(1, expiry - Date.now()));
      }
    } catch {
      this.active.set(false);
      this.error.set('Guest data is unavailable. Allow site storage and retry.');
    }
  }
}
