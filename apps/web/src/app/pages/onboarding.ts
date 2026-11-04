import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { Api, errorMessage } from '../core/api';

@Component({
  imports: [RouterLink],
  styleUrl: './onboarding.css',
  template: `<header class="page-header">
      <div>
        <p class="eyebrow">Workspace guide</p>
        <h1>Getting started</h1>
        <p class="muted">From your first selection to evidence you can investigate.</p>
      </div>
      <button class="primary" [disabled]="busy()" (click)="finish()">Go to dashboard</button>
    </header>
    <section class="guide-intro" aria-labelledby="guide-title">
      <div>
        <span class="guide-label">Your workflow</span>
        <h2 id="guide-title">Select. Run. Investigate.</h2>
        <p>
          Work in the project selected in the sidebar. Keep reusable tests in suites, follow
          executions, and inspect the evidence behind each result.
        </p>
      </div>
      <div class="guide-prerequisites">
        <h3>Before your first run</h3>
        <p>
          An approved test catalog and an allowed environment must be configured. If either is
          missing, ask your deployment operator to connect them.
        </p>
        <a routerLink="/settings">Review workspace settings</a>
      </div>
    </section>
    <section class="guide-steps" aria-label="Getting started steps">
      <article class="card">
        <span class="guide-number" aria-hidden="true">01</span>
        <h2>Choose your workspace</h2>
        <p>
          Open a project you have access to. Its catalog, environments and execution history stay
          separate from other projects.
        </p>
        <a routerLink="/projects">Browse projects <span aria-hidden="true">&rarr;</span></a>
      </article>
      <article class="card">
        <span class="guide-number" aria-hidden="true">02</span>
        <h2>Build your selection</h2>
        <p>
          Search and filter the test catalog, select cases across pages, then choose an environment.
          Save recurring selections as test suites.
        </p>
        <a routerLink="/explorer">Open test explorer <span aria-hidden="true">&rarr;</span></a>
      </article>
      <article class="card">
        <span class="guide-number" aria-hidden="true">03</span>
        <h2>Follow the execution</h2>
        <p>
          Start a run when the configuration is ready. Execution phase tracks the job; individual
          test results show whether assertions passed.
        </p>
        <a routerLink="/runs">View executions <span aria-hidden="true">&rarr;</span></a>
      </article>
      <article class="card">
        <span class="guide-number" aria-hidden="true">04</span>
        <h2>Read the evidence</h2>
        <p>
          Inspect attempts and attachments in run details, API exchanges in the API workspace, and
          Allure reports once generation finishes.
        </p>
        <a routerLink="/reports">Explore reports <span aria-hidden="true">&rarr;</span></a>
      </article>
    </section>
    <footer class="guide-footer">
      <p>
        Opening this guide never starts tests or connects a repository. Return any time from
        <strong>Getting started</strong> in the sidebar.
      </p>
      <button [disabled]="busy()" (click)="skip()">Skip for now</button>
    </footer>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (busy()) {
      <p role="status">Saving your onboarding preference...</p>
    } `,
})
export class Onboarding {
  public readonly api = inject(Api);
  private readonly router = inject(Router);
  public readonly busy = signal(false);
  public readonly error = signal('');
  public async finish(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      if (this.api.identity()?.personalWorkspace) {
        await this.api.post('/onboarding', { complete: true });
      }
      await this.router.navigateByUrl(this.destination());
    } catch (error) {
      this.error.set(errorMessage(error) + ' You can retry or skip for now.');
    } finally {
      this.busy.set(false);
    }
  }
  public async skip(): Promise<void> {
    await this.router.navigateByUrl(this.destination());
  }

  private destination(): string {
    const value = new URLSearchParams(location.search).get('returnTo') ?? '/';
    try {
      const url = new URL(value, location.origin);
      return url.origin === location.origin &&
        /^\/(?:projects|suites|explorer|runs(?:\/[a-zA-Z0-9-]+)?|reports|api|settings|about)?$/.test(
          url.pathname,
        )
        ? url.pathname + url.search
        : '/';
    } catch {
      return '/';
    }
  }
}
