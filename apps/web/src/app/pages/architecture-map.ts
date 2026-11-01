import { Component } from '@angular/core';

@Component({
  selector: 'app-architecture-map',
  styleUrl: './architecture-map.css',
  template: `
    <figure class="system-map" aria-labelledby="map-caption">
      <figcaption id="map-caption">
        <span class="map-kicker">SYSTEM MAP</span><span>From workspace to evidence</span>
      </figcaption>
      <div class="map-entry">
        <svg
          class="node-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="14" rx="2" />
          <path d="M8 21h8M12 18v3M3 8h18" />
        </svg>
        <div>
          <strong>Angular workspace</strong
          ><span>Select tests · follow progress · inspect results</span>
        </div>
        <span class="node-tech">CLIENT</span>
      </div>
      <div class="map-connector"><span>Authenticated requests ↑↓ Live events</span></div>
      <div class="map-control">
        <div class="map-node map-api">
          <span class="node-label">CONTROL PLANE</span>
          <h4>NestJS API</h4>
          <p>Authorization, configuration and investigation</p>
        </div>
        <div class="map-side-link" aria-hidden="true">↔</div>
        <div class="map-node">
          <span class="node-label">SOURCE OF TRUTH</span>
          <h4>PostgreSQL</h4>
          <p>Projects, frozen selections, run state and transactional outbox</p>
        </div>
      </div>
      <div class="map-connector"><span>Persisted work → scheduler dispatch</span></div>
      <div class="map-queue">
        <span class="queue-mark" aria-hidden="true"><i></i><i></i><i></i></span>
        <div>
          <strong>Work scheduling</strong
          ><span>Outbox is authoritative · BullMQ / Redis transport when configured</span>
        </div>
        <span class="node-tech">ASYNC</span>
      </div>
      <div class="map-connector"><span>Supervisors claim work</span></div>
      <div class="map-workers">
        <div class="map-node">
          <span class="node-label">EXECUTION</span>
          <h4>Execution supervisor</h4>
          <p>Launches Playwright workloads, records results and handles cancellation.</p>
          <div class="map-chips"><span>Browser tests</span><span>API tests</span></div>
        </div>
        <div class="map-side-link"><span aria-hidden="true">→</span><small>Results</small></div>
        <div class="map-node">
          <span class="node-label">REPORTING</span>
          <h4>Report supervisor</h4>
          <p>Builds Allure reports independently of the test outcome.</p>
          <div class="map-chips"><span>Generate</span><span>Rebuild</span></div>
        </div>
      </div>
      <div class="map-connector">
        <span>Artifacts & reports ↓ Authenticated retrieval ↑</span>
      </div>
      <div class="map-storage">
        <svg
          class="node-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" />
        </svg>
        <div>
          <strong>Private evidence storage</strong
          ><span>S3-compatible object storage or local filesystem</span>
        </div>
        <span class="node-tech">PERSIST</span>
      </div>
      <div class="map-footnote">
        <span class="map-dot" aria-hidden="true"></span>Execution state and report readiness stay
        separate.
      </div>
    </figure>
  `,
})
export class ArchitectureMap {}
