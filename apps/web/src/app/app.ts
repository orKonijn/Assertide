import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { Api } from './core/api';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  readonly api = inject(Api);
  readonly loading = signal(true);
  readonly dark = signal(localStorage.getItem('assertide-theme') === 'dark');
  readonly menu = signal(false);
  readonly links = [
    ['/', 'Overview'],
    ['/projects', 'Projects'],
    ['/suites', 'Test suites'],
    ['/explorer', 'Test explorer'],
    ['/runs', 'Executions'],
    ['/reports', 'Reports'],
    ['/api', 'API workspace'],
    ['/settings', 'Settings'],
  ];
  constructor() {
    this.applyTheme();
    void this.api
      .loadIdentity()
      .catch(() => this.api.identity.set(null))
      .finally(() => this.loading.set(false));
  }
  toggleMenu() {
    this.menu.update((value) => !value);
  }
  toggleTheme() {
    this.dark.update((value) => !value);
    this.applyTheme();
  }
  private applyTheme() {
    document.documentElement.dataset['theme'] = this.dark() ? 'dark' : 'light';
    localStorage.setItem('assertide-theme', this.dark() ? 'dark' : 'light');
  }
}
