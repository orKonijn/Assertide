import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { Api } from './core/api';
import { HttpErrorResponse } from '@angular/common/http';
import { errorMessage } from './core/api';
import { FormsModule } from '@angular/forms';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  readonly api = inject(Api);
  readonly loading = signal(true);
  readonly identityError = signal('');
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
    void this.connect();
  }
  loginUrl() {
    return `/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`;
  }
  async connect() {
    this.loading.set(true);
    this.identityError.set('');
    try {
      await this.api.loadIdentity();
    } catch (error) {
      this.api.identity.set(null);
      if (!(error instanceof HttpErrorResponse && error.status === 401))
        this.identityError.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
  toggleMenu() {
    this.menu.update((value) => !value);
  }
  changeProject(id: string) {
    this.api.selectProject(id);
    location.assign('/');
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
