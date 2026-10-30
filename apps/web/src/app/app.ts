import { HttpErrorResponse } from '@angular/common/http';
import type { ElementRef } from '@angular/core';
import { Component, DestroyRef, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import type { Identity } from './core/api';
import { Api } from './core/api';
import { errorMessage } from './core/api';
import { NotificationLog, Notifications } from './core/notifications';
import { ProjectPicker } from './core/project-picker';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NotificationLog, ProjectPicker],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
  host: {
    '(document:keydown)': 'onKeydown($event)',
    '(window:resize)': 'onResize()',
    '(document:visibilitychange)': 'onVisibility()',
  },
})
export class App {
  public readonly api = inject(Api);
  public readonly loading = signal(true);
  public readonly identityError = signal('');
  public readonly dark = signal(localStorage.getItem('assertide-theme') !== 'light');
  public readonly menu = signal(false);
  public readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  public readonly links = [
    ['/', 'Overview', 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z'],
    ['/projects', 'Projects', 'M3 7V4h6l3 3h9v13H3z'],
    ['/suites', 'Test suites', 'M5 3h14v18H5z M9 8h6 M9 12h6 M9 16h4'],
    ['/explorer', 'Test explorer', 'M10 3a7 7 0 1 0 0 14a7 7 0 0 0 0-14 M15 15l6 6'],
    ['/runs', 'Executions', 'M7 3l14 9L7 21z'],
    ['/reports', 'Reports', 'M4 3v18h17 M9 16v-5 M14 16V6 M19 16v-8'],
    ['/api', 'API workspace', 'M8 5l-6 7 6 7 M16 5l6 7-6 7 M14 3l-4 18'],
    ['/settings', 'Settings', 'M4 7h16 M4 17h16 M8 4v6 M16 14v6'],
  ];
  private validating = false;
  public constructor() {
    const notices = inject(Notifications);
    effect(() => {
      if (!this.api.identity()) {
        notices.clear();
      }
    });
    this.applyTheme();
    void this.connect();
    effect((onCleanup) => {
      const expiry = this.api.identity()?.sessionExpiresAt;
      if (!expiry) {
        return;
      }
      const timer = setTimeout(
        () => this.api.identity.set(null),
        Math.max(0, Date.parse(expiry) - Date.now()),
      );
      onCleanup(() => clearTimeout(timer));
    });
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void this.revalidate();
      }
    }, 15000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
  public skipToContent(event: Event): void {
    event.preventDefault();
    document.getElementById('content')?.focus();
  }
  public closeMenu(): void {
    if (this.menu()) {
      this.menu.set(false);
      this.menuButton()?.nativeElement.focus();
    }
  }
  public onResize(): void {
    if (window.innerWidth > 850) {
      this.closeMenu();
    }
  }
  public onKeydown(event: KeyboardEvent): void {
    if (document.querySelector('dialog[open]')) {
      return;
    }
    if (!this.menu()) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeMenu();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>('aside button,aside a,aside select'),
    ).filter((element) => !element.hasAttribute('disabled') && element.offsetParent !== null);
    const first = elements[0],
      last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  public onVisibility(): void {
    if (document.visibilityState === 'visible') {
      void this.revalidate();
    }
  }
  public async revalidate(): Promise<void> {
    if (!this.api.identity() || this.validating) {
      return;
    }
    this.validating = true;
    try {
      const identity = await this.api.get<Identity>('/me');
      if (!identity.projectIds.includes(this.api.projectId())) {
        this.api.identity.set(null);
        return;
      }
      this.api.identity.set(identity);
    } catch {
      /* A 401 clears the protected shell in Api.get; transient outages retain the known expiry. */
    } finally {
      this.validating = false;
    }
  }
  public loginUrl(): string {
    return `/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`;
  }
  public async connect(): Promise<void> {
    this.loading.set(true);
    this.identityError.set('');
    try {
      await this.api.loadIdentity();
    } catch (error) {
      this.api.identity.set(null);
      if (!(error instanceof HttpErrorResponse && error.status === 401)) {
        this.identityError.set(errorMessage(error));
      }
    } finally {
      this.loading.set(false);
    }
  }
  public toggleMenu(): void {
    if (this.menu()) {
      this.closeMenu();
      return;
    }
    this.menu.set(true);
    setTimeout(() => document.querySelector<HTMLElement>('.mobile-close')?.focus(), 0);
  }
  public toggleTheme(): void {
    this.dark.update((value) => !value);
    this.applyTheme();
  }
  private applyTheme(): void {
    document.documentElement.dataset['theme'] = this.dark() ? 'dark' : 'light';
    localStorage.setItem('assertide-theme', this.dark() ? 'dark' : 'light');
  }
}
