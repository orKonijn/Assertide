import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { Api, errorMessage } from '../core/api';

@Component({
  imports: [RouterLink],
  template: `<header class="page-header">
      <div>
        <p class="eyebrow">YOUR PERSONAL WORKSPACE</p>
        <h1>Welcome to Assertide</h1>
      </div>
    </header>
    <section class="card">
      <h2>A private place to start</h2>
      <p>
        Your personal project is empty. You own this workspace; it does not grant access to any
        other organization. Guest samples are not copied here.
      </p>
      <h2>Your first steps</h2>
      <ol>
        <li>Review your <a routerLink="/projects">personal project</a>.</li>
        <li>
          Ask your deployment operator to approve your test source and configure an allowed
          environment.
        </li>
        <li>Choose tests and launch only after those prerequisites are ready.</li>
      </ol>
      <p>
        Signing up never connects a repository, provisions paid resources or starts an execution.
      </p>
      <h2>Learn before connecting</h2>
      <p>
        The read-only guest demo is available when signed out. You can return to this guide using
        the Getting started link at any time.
      </p>
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
      @if (busy()) {
        <p role="status">Saving your onboarding preference…</p>
      }
      <button [disabled]="busy()" (click)="finish()">Go to dashboard</button>
      <button [disabled]="busy()" (click)="skip()">Skip for now</button>
    </section>`,
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
