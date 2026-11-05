import { DOCUMENT } from '@angular/common';
import { afterNextRender, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { productVersion } from '../core/release';
import { creator, lifecycle } from './about-content';
import { ArchitectureMap } from './architecture-map';

@Component({
  imports: [ArchitectureMap],
  host: { class: 'about-page' },
  styleUrl: './about.css',
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">THE PEOPLE & THE ENGINEERING</p>
        <h1>About Assertide</h1>
        <p class="muted">A closer look at the work behind your testing workspace.</p>
        <a class="button" href="https://github.com/orKonijn/Assertide" rel="noopener noreferrer"
          >View source on GitHub</a
        >
      </div>
    </header>
    <nav class="about-nav" aria-label="About sections">
      <button type="button" (click)="jump('creator')">About the Creator</button>
      <button type="button" (click)="jump('inside')">Inside Assertide</button>
    </nav>
    <section id="creator" class="card creator-card" aria-labelledby="creator-title">
      <div class="creator-intro">
        <p class="eyebrow">ABOUT THE CREATOR</p>
        <h2 id="creator-title" tabindex="-1">{{ profile.name || profile.title }}</h2>
        @if (profile.name) {
          <p class="muted">{{ profile.title }}</p>
        }
        <p class="about-lead">{{ profile.introduction }}</p>
        <div class="about-tags">
          @for (item of profile.focus; track item) {
            <span class="badge">{{ item }}</span>
          }
        </div>
        @if (profile.portrait; as portrait) {
          <img
            class="creator-photo"
            [src]="portrait.src"
            [alt]="portrait.alt"
            width="120"
            height="120"
          />
        }
        @if (profile.links.length) {
          <div class="actions">
            @for (link of profile.links; track link.href) {
              <a [href]="link.href" rel="noopener noreferrer">{{ link.label }}</a>
            }
          </div>
        }
      </div>
      <div class="creator-story">
        <h3>Why I built it</h3>
        <p>{{ profile.motivation }}</p>
        <h3>My contribution</h3>
        <p>{{ profile.contribution }}</p>
      </div>
      <section class="creator-experience" aria-labelledby="freelance-title">
        <p class="eyebrow">FREELANCE EXPERIENCE · {{ profile.freelance.period }}</p>
        <h3 id="freelance-title">Companies I’ve supported</h3>
        <p class="muted">
          Alongside building website-testing tools, my freelance work has included supporting:
        </p>
        <ul>
          @for (company of profile.freelance.companies; track company) {
            <li>{{ company }}</li>
          }
        </ul>
      </section>
    </section>
    <section id="inside" aria-labelledby="inside-title">
      <div class="about-section-heading">
        <p class="eyebrow">INSIDE ASSERTIDE</p>
        <h2 id="inside-title" tabindex="-1">From a test idea to evidence you can inspect.</h2>
        <p class="muted">
          For teams managing website and API checks, Assertide connects reusable selections,
          execution, results, and reports.
        </p>
      </div>
      <div class="about-pillars">
        <article class="card">
          <span class="about-number">01</span>
          <h3>Organize</h3>
          <p>Discover source-backed tests and save reusable suites.</p>
        </article>
        <article class="card">
          <span class="about-number">02</span>
          <h3>Run</h3>
          <p>Launch configured executions and follow their progress.</p>
        </article>
        <article class="card">
          <span class="about-number">03</span>
          <h3>Understand</h3>
          <p>Review outcomes, retry attempts, reports, and recorded evidence.</p>
        </article>
      </div>
      <section class="card architecture" aria-labelledby="architecture-title">
        <div class="section-heading">
          <h3 id="architecture-title">How the pieces connect</h3>
          <span class="badge">Implemented architecture</span>
        </div>
        <p class="muted">
          The diagram summarizes the supported service topology. Local development uses a simpler
          configuration.
        </p>
        <app-architecture-map />
        <details>
          <summary>Read the architecture in detail</summary>
          <p>
            The Angular client sends authenticated requests to the NestJS API and receives persisted
            live events. PostgreSQL stores application state. A transactional outbox is
            authoritative; BullMQ and Redis provide redeliverable transport when configured.
            Supervisors claim work and launch test processes or isolated jobs.
          </p>
          <p>
            Results and evidence feed report generation. Filesystem or S3-compatible storage holds
            artifacts and reports, which the application serves through authenticated access paths.
          </p>
          <p>
            Local development can use embedded PostgreSQL through PGlite, filesystem storage, and a
            combined supervisor. Separate execution/report processes and OCI or Kubernetes jobs are
            supported deployment options, not a claim that every installation uses them.
          </p>
        </details>
      </section>
      <section class="card" aria-labelledby="lifecycle-title">
        <h3 id="lifecycle-title">A run, from start to finish</h3>
        <ol class="about-lifecycle">
          @for (step of steps; track step[0]; let index = $index) {
            <li>
              <span class="about-number">{{ index + 1 }}</span>
              <div>
                <h4>{{ step[0] }}</h4>
                <p>{{ step[1] }}</p>
              </div>
            </li>
          }
        </ol>
      </section>
      <div class="about-detail-grid">
        <section class="card">
          <h3>Automation with structure</h3>
          <p>
            Playwright and TypeScript power UI and API suites. Page Objects own UI interactions;
            fixtures provide test setup and isolated state. Controlled Lab and storefront
            environments make routine checks reproducible.
          </p>
          <details>
            <summary>Framework & execution boundaries</summary>
            <p>
              UI tests can target Chromium, Firefox, or WebKit. API cases exercise HTTP contracts
              without starting a browser. Allure collects execution results and reporting metadata.
            </p>
            <p>
              Cancellation requests are handled by the execution supervisor. Retries preserve
              attempt evidence. Local trusted processes are not the same isolation boundary as OCI
              containers or Kubernetes jobs; deployment policy selects the runtime.
            </p>
          </details>
        </section>
        <section class="card">
          <h3>A design built for investigation</h3>
          <p>
            The A/check logo, purple accents, neutral surfaces, and system typography tie the
            workspace together. Dark mode is the default; a saved light-mode choice is respected.
          </p>
          <div class="about-palette" aria-label="Design palette">
            <span class="palette-brand">Accent</span><span class="palette-surface">Surface</span
            ><span class="palette-soft">Secondary</span>
          </div>
          <details>
            <summary>Components & accessibility</summary>
            <p>
              Shared calendars, project selection, dialogs, status badges, and notification history
              support consistent interactions. Status text accompanies colored indicators. Layouts
              adapt to smaller screens, keyboard focus stays visible, and motion respects
              reduced-motion preferences.
            </p>
            <p>
              The illustrated mascot is a supporting brand asset. It is used sparingly so that
              evidence and task controls remain the focus. These are design principles and
              implemented patterns, not a claim of universal accessibility certification.
            </p>
          </details>
        </section>
      </div>
      <section class="card">
        <h3>Decisions that shape the product</h3>
        <div class="about-decisions">
          <article>
            <h4>Keep execution separate</h4>
            <p>
              Test workloads run in child processes or jobs rather than inside API request handlers.
              Separate supervisors are supported so execution and report work can be operated
              independently.
            </p>
          </article>
          <article>
            <h4>Keep retries visible</h4>
            <p>
              A final pass can follow a failed attempt. Retaining both makes investigation more
              useful than a single pass/fail label.
            </p>
          </article>
          <article>
            <h4>Separate outcomes from reports</h4>
            <p>
              Report generation can be pending or fail after tests finish. Independent readiness and
              rebuilds avoid hiding the execution outcome.
            </p>
          </article>
        </div>
      </section>
      <footer class="about-note">
        <strong>Assertide v{{ version }} - demonstration build.</strong>
        <p>
          This page describes implemented components and supported configurations.
          Deployment-specific isolation, storage, and infrastructure checks depend on the
          environment. Production rollout and human accessibility review remain separate validation
          steps; no production availability guarantee is made.
        </p>
      </footer>
    </section>
  `,
})
export class About {
  private readonly document = inject(DOCUMENT);
  private readonly route = inject(ActivatedRoute);
  public readonly version = productVersion;
  public readonly profile = creator;
  public readonly steps = lifecycle;
  public constructor() {
    afterNextRender(() => {
      const section = this.route.snapshot.fragment;
      if (section === 'creator' || section === 'inside') {
        this.jump(section);
      }
    });
  }
  public jump(section: 'creator' | 'inside'): void {
    this.document.getElementById(section)?.scrollIntoView({ block: 'start' });
    this.document.getElementById(section + '-title')?.focus({ preventScroll: true });
  }
}
