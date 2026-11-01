import { afterNextRender, Component, inject, signal } from '@angular/core';

import { GuestSession } from '../core/guest-session';
import { TrendChart } from '../core/trend-chart';

const sampleCases = [
  {
    id: 'DEMO-01',
    name: 'Catalog returns available products',
    kind: 'API',
    status: 'Passed',
    duration: '140 ms',
  },
  {
    id: 'DEMO-02',
    name: 'Cart preserves selected quantity',
    kind: 'Browser',
    status: 'Passed',
    duration: '1.2 s',
  },
  {
    id: 'DEMO-03',
    name: 'Checkout displays delivery estimate',
    kind: 'Browser',
    status: 'Failed',
    duration: '2.1 s',
  },
] as const;

/** No Api/HttpClient dependency, fetch, execution or artifact routes. All evidence is literal synthetic content. */
@Component({
  selector: 'app-guest-demo',
  imports: [TrendChart],
  styleUrl: './guest-demo.css',
  template: `
    <a class="skip" href="#guest-content">Skip to demo content</a>
    <div class="demo-shell">
      <header class="demo-mobile">
        <span class="brand-logo"><img src="/brand/assertide-logo.png" alt="Assertide" /></span>
        <button
          (click)="menu.set(!menu())"
          [attr.aria-expanded]="menu()"
          aria-controls="demo-sidebar"
        >
          Menu
        </button>
      </header>
      <aside id="demo-sidebar" [class.demo-open]="menu()" aria-label="Guest workspace">
        <a href="/" (click)="leave($event)" class="brand-logo"
          ><img src="/brand/assertide-logo.png" alt="Assertide"
        /></a>
        <div class="demo-project">
          <span class="muted">Active project</span><strong>Meadow Shop</strong
          ><span class="muted">Synthetic workspace</span>
        </div>
        <nav aria-label="Demo navigation">
          @for (item of sections; track item) {
            <button
              [class.active]="section() === item"
              [attr.aria-current]="section() === item ? 'page' : null"
              (click)="open(item)"
            >
              <svg
                class="nav-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                aria-hidden="true"
              >
                <path [attr.d]="icons[$index]" />
              </svg>
              {{ item }}
            </button>
          }
        </nav>
        <div class="demo-account">
          <strong>Guest visitor</strong><span class="muted">Read-only access</span
          ><button (click)="theme()" aria-label="Toggle demo theme">Light / dark</button
          ><button (click)="session.leave()">Leave guest mode</button>
        </div>
      </aside>
      <div class="demo-content">
        <div class="demo-banner">
          <span class="badge">Guest demo</span
          ><span>Read-only synthetic data · No real tests run · Expires after 30 minutes</span
          ><a href="/register" (click)="session.leave()">Create account</a>
        </div>
        <main id="guest-content" tabindex="-1">
          <header class="page-header">
            <div>
              <p class="eyebrow">MEADOW SHOP · SYNTHETIC SAMPLE</p>
              <h1>{{ section() }}</h1>
            </div>
          </header>
          @switch (section()) {
            @case ('Overview') {
              <p>
                Explore the quality workflow for the fictional Meadow Shop: browse tests,
                investigate a failure, then review its evidence.
              </p>
              <div class="metrics">
                <article><strong>1</strong><span>Sample project</span></article>
                <article><strong>3</strong><span>Sample test cases</span></article>
                <article><strong>2 / 3</strong><span>Simulated passes</span></article>
              </div>
              <div class="demo-charts">
                <section class="card">
                  <h2>Pass rate over time</h2>
                  <p class="muted">Illustrative history · final and first-attempt pass rates</p>
                  <app-trend-chart [points]="trend" (daySelected)="selectedDay.set($event)" />
                  <p role="status">
                    {{
                      selectedDay()
                        ? 'Selected sample day: ' + selectedDay()
                        : 'Choose a graph point or table row to inspect a day.'
                    }}
                  </p>
                  <div class="table-wrap">
                    <table aria-label="Synthetic pass-rate history">
                      <thead>
                        <tr>
                          <th>Day</th>
                          <th>Final</th>
                          <th>First attempt</th>
                          <th>Tests</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (point of trend; track point.day) {
                          <tr>
                            <td>
                              <button (click)="selectedDay.set(point.day)">{{ point.day }}</button>
                            </td>
                            <td>{{ point.finalPassRate * 100 }}%</td>
                            <td>{{ point.firstAttemptPassRate * 100 }}%</td>
                            <td>{{ point.executed }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </section>
                <section class="card">
                  <h2>Latest result breakdown</h2>
                  <div
                    class="demo-donut"
                    role="img"
                    aria-label="Synthetic latest result: two passed and one failed"
                  >
                    <span><strong>67%</strong>passed</span>
                  </div>
                  <ul class="demo-legend">
                    <li>Passed <strong>2</strong></li>
                    <li>Failed <strong>1</strong></li>
                    <li>Total <strong>3</strong></li>
                  </ul>
                  <p class="muted">DEMO-RUN-01 · 3.44 seconds (simulated)</p>
                  <button (click)="open('Reports')">Explore Allure results</button>
                </section>
              </div>
              <h2>Try the platform in three steps</h2>
              <ol>
                <li>Browse the fictional project and its tests.</li>
                <li>Try a deterministic simulated run.</li>
                <li>Investigate the sample failure and review its evidence.</li>
              </ol>
              <p>
                This walkthrough demonstrates test organization, execution investigation and
                reporting. It uses no credentials, external targets or worker capacity.
              </p>
              <button (click)="open('Projects')">1. Explore the project</button>
              <button (click)="simulate()">2. Try a simulated run</button>
              <h2>3. Investigate a result</h2>
              <p>
                The sample checkout test expected a delivery estimate. The fictional response
                omitted it. Follow the execution to see an assertion and safe report.
              </p>
              <button (click)="open('Executions')">Investigate sample failure</button>
            }
            @case ('Projects') {
              <article>
                <h2>Meadow Shop</h2>
                <p>Fictional storefront · Sample project · Read-only</p>
                <p>
                  Owner: Demo team. This project is not connected to a repository, environment, or
                  external service.
                </p>
                <button (click)="open('Test suites')">Browse sample suite</button>
              </article>
              <button (click)="restrict('Project creation')">Create project</button>
            }
            @case ('Test suites') {
              <article>
                <h2>Checkout confidence</h2>
                <p>Three synthetic cases covering catalog, cart and delivery.</p>
                <button (click)="open('Test explorer')">Explore test cases</button
                ><button (click)="restrict('Real execution')">Run suite</button
                ><button (click)="simulate()">Try a simulated run</button>
              </article>
            }
            @case ('Test explorer') {
              <section class="card">
                <h2>Test catalog</h2>
                <p class="muted">3 synthetic cases · Checkout confidence</p>
                <div class="table-wrap">
                  <table aria-label="Sample test catalog">
                    <thead>
                      <tr>
                        <th>Test case</th>
                        <th>Type</th>
                        <th>Latest result</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (item of cases; track item.id) {
                        <tr>
                          <td>
                            <strong>{{ item.id }}</strong
                            ><br />{{ item.name }}
                          </td>
                          <td>{{ item.kind }}</td>
                          <td>
                            <span class="badge">{{ item.status }}</span>
                          </td>
                          <td>
                            <button (click)="open('Executions')">Inspect sample result</button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </section>
            }
            @case ('Executions') {
              @if (simulated()) {
                <p class="notice" role="status">
                  Simulation complete: 2 sample passes and 1 sample failure. No real tests ran, no
                  jobs were created, and nothing was saved. Refresh resets this simulation.
                </p>
              }
              <h2>Sample execution · DEMO-RUN-01</h2>
              <p>
                Simulated result, not a real execution. Fixed example: 1 October 2026, 12:00 UTC.
              </p>
              @for (item of cases; track item.id) {
                <article>
                  <h3>{{ item.name }}</h3>
                  <p>{{ item.status }} · {{ item.duration }} (simulated)</p>
                </article>
              }
              <h2>Failure details</h2>
              <p>DEMO-03 · Assertion mismatch</p>
              <dl>
                <dt>Expected</dt>
                <dd>Delivery estimate is visible</dd>
                <dt>Actual</dt>
                <dd>Delivery estimate is missing</dd>
              </dl>
              <p>
                Suggested investigation: compare the expected response field and the UI fallback.
              </p>
              <button (click)="open('API examples')">Inspect API example</button
              ><button (click)="open('Reports')">View sample report</button
              ><button (click)="restrict('Rerunning tests')">Rerun failed tests</button>
            }
            @case ('API examples') {
              <h2>Synthetic checkout exchange</h2>
              <p>
                No request is sent. example.invalid is a reserved, non-production example address.
              </p>
              <h3>Request</h3>
              <pre>GET https://example.invalid/catalog/items/demo-product</pre>
              <h3>Response · 200 OK (simulated)</h3>
              <pre>{{ response }}</pre>
              <p>The expected deliveryEstimate field is absent, explaining the example failure.</p>
              <button (click)="restrict('Sending API requests')">Send request</button>
            }
            @case ('Reports') {
              <section class="card report-library">
                <h2>Report library</h2>
                <p class="muted">1 sample report · Ready to open</p>
                <div class="table-wrap">
                  <table aria-label="Guest report library">
                    <thead>
                      <tr>
                        <th>Execution</th>
                        <th>Status</th>
                        <th>Results</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>DEMO-RUN-01<br />Checkout confidence</td>
                        <td><span class="badge">Ready</span></td>
                        <td>2 passed · 1 failed</td>
                        <td>
                          <a
                            class="button"
                            href="/demo-report/index.html"
                            target="_blank"
                            rel="noopener"
                            >Open Allure sample ↗</a
                          >
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p>
                  This is a real Allure report generated from fictional results. Explore its
                  overview, graphs, test list and failure steps. No real test execution or private
                  evidence is included.
                </p>
              </section>
              <article aria-label="Synthetic sample report">
                <h2>Checkout confidence report</h2>
                <p>Static sample report · 2 passed · 1 failed · 3.44 seconds (simulated)</p>
                <h3>Safe sample evidence</h3>
                <figure>
                  <div class="sample-evidence">
                    <strong>Meadow Shop · Fictional checkout</strong>
                    <p>Demo product · Quantity 1</p>
                    <p>Delivery estimate: unavailable</p>
                  </div>
                  <figcaption>
                    Illustrative HTML evidence, not a captured browser trace or customer screenshot.
                  </figcaption>
                </figure>
                <p>No private downloads or real report assets are included.</p>
              </article>
              <button (click)="restrict('Private report downloads')">Download report</button>
            }
          }
          @if (restricted()) {
            <section class="notice" role="status">
              <h2>Account required</h2>
              <p>
                {{ restricted() }} is unavailable in this read-only demo. Create an account for your
                own workspace; approved execution setup is required before real tests can run.
              </p>
              <a href="/register" (click)="session.leave()">Create account</a> ·
              <a href="/auth/login?returnTo=%2F" (click)="session.leave()">Sign in</a>
            </section>
          }
        </main>
        <footer>
          <h2>Make a workspace your own</h2>
          <p>
            An account provides a persistent personal workspace with assigned permissions. Demo
            content and selections are never copied into it.
          </p>
          <a class="button" href="/register" (click)="session.leave()">Create account</a
          ><a class="button secondary" href="/auth/login?returnTo=%2F" (click)="session.leave()"
            >Sign in</a
          >
        </footer>
      </div>
    </div>
  `,
})
export class GuestDemo {
  public readonly menu = signal(false);
  public readonly selectedDay = signal('');
  public readonly trend = [
    { day: 'Sep 27', finalPassRate: 0.6, firstAttemptPassRate: 0.5, executed: 10 },
    { day: 'Sep 28', finalPassRate: 0.8, firstAttemptPassRate: 0.6, executed: 10 },
    { day: 'Sep 29', finalPassRate: 0.9, firstAttemptPassRate: 0.8, executed: 10 },
    { day: 'Sep 30', finalPassRate: 1, firstAttemptPassRate: 0.9, executed: 10 },
    { day: 'Oct 01', finalPassRate: 0.67, firstAttemptPassRate: 0.67, executed: 3 },
  ];
  public readonly icons = [
    'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    'M3 7V4h6l3 3h9v13H3z',
    'M5 3h14v18H5z M9 8h6 M9 12h6 M9 16h4',
    'M10 3a7 7 0 1 0 0 14a7 7 0 0 0 0-14 M15 15l6 6',
    'M7 3l14 9L7 21z',
    'M8 5l-6 7 6 7 M16 5l6 7-6 7 M14 3l-4 18',
    'M4 3v18h17 M9 16v-5 M14 16V6 M19 16v-8',
  ];
  public readonly session = inject(GuestSession);
  public readonly sections = [
    'Overview',
    'Projects',
    'Test suites',
    'Test explorer',
    'Executions',
    'API examples',
    'Reports',
  ] as const;
  public readonly section = signal<(typeof this.sections)[number]>('Overview');
  public readonly restricted = signal('');
  public readonly simulated = signal(false);
  public readonly cases = sampleCases;
  public readonly response = JSON.stringify(
    { id: 'demo-product', name: 'Demo product', stock: 12 },
    null,
    2,
  );
  public constructor() {
    afterNextRender(() => document.getElementById('guest-content')?.focus());
  }
  public simulate(): void {
    this.simulated.set(true);
    this.open('Executions');
  }
  public open(section: (typeof this.sections)[number]): void {
    this.menu.set(false);
    this.section.set(section);
    this.restricted.set('');
    setTimeout(() => document.getElementById('guest-content')?.focus(), 0);
  }
  public restrict(action: string): void {
    this.restricted.set(action);
  }
  public leave(event: Event): void {
    event.preventDefault();
    this.session.leave();
  }
  public theme(): void {
    const next = document.documentElement.dataset['theme'] === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset['theme'] = next;
    localStorage.setItem('assertide-theme', next);
  }
}
