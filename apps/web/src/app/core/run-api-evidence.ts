import { Component, DestroyRef, inject, input, signal } from '@angular/core';

import { Api } from './api';
import { JsonEvidence } from './json-evidence';

@Component({
  selector: 'app-run-api-evidence',
  imports: [JsonEvidence],
  template: `
    <button (click)="load()" [disabled]="loading()">
      {{ loading() ? 'Loading exchange…' : 'Inspect API exchange' }}
    </button>
    @if (error()) {
      <p role="alert">Evidence could not be loaded. It may have expired. Try again.</p>
    }
    @if (value()) {
      <app-json-evidence [value]="value()" />
    }
  `,
})
export class RunApiEvidence {
  public readonly runId = input.required<string>();
  public readonly artifactId = input.required<string>();
  public readonly value = signal('');
  public readonly loading = signal(false);
  public readonly error = signal(false);
  private readonly api = inject(Api);
  private destroyed = false;
  public constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
    });
  }
  public async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      const data = await this.api.get<unknown>(
        `/runs/${this.runId()}/artifacts/${this.artifactId()}`,
      );
      if (!this.destroyed) {
        this.value.set(JSON.stringify(data, null, 2));
      }
    } catch {
      if (!this.destroyed) {
        this.error.set(true);
      }
    } finally {
      if (!this.destroyed) {
        this.loading.set(false);
      }
    }
  }
}
