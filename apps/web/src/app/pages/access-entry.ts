import { HttpClient } from '@angular/common/http';
import { afterNextRender, Component, inject, input, output, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';

const messages: Record<string, string> = {
  expired:
    'Your sign-in request expired or was already used. Start again; your account is retained.',
  login: 'Sign-in could not be completed. Restart sign-in to use a fresh secure request.',
  provider: 'The identity service is unavailable. Retry sign-in in a moment.',
  verification:
    'Verify your email with the identity provider before entering your workspace. Sign in again to resume verification or resend the email.',
  provisioning:
    'You signed in, but workspace setup could not finish. Retry sign-in to resume setup safely; a duplicate workspace will not be created.',
  membership:
    'This identity has no workspace access. Ask an administrator for access, or create an account when registration is available.',
  destination: 'That destination is not available to your account. Return to your workspace.',
  'registration-unavailable':
    'Account registration is not enabled on this installation. You can sign in with an existing account or explore the guest demo.',
  'rate-limit': 'Too many sign-in attempts. Wait ten minutes before trying again.',
};

@Component({
  selector: 'app-access-entry',
  template: `
    <main class="access-shell" [class.registration-entry]="registrationPage">
      <header class="access-header">
        <div class="brand-logo"><img src="/brand/assertide-logo.png" alt="Assertide" /></div>
        <button
          class="theme-button"
          (click)="theme.emit()"
          aria-label="Light / dark theme"
          title="Change theme"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
          >
            <circle cx="12" cy="12" r="4" />
            <path
              d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"
            />
          </svg>
        </button>
      </header>
      <div class="access-layout">
        <section class="access-main" aria-labelledby="access-title">
          <p class="eyebrow">CONFIDENCE, ONE RUN AT A TIME</p>
          <h1 id="access-title" tabindex="-1">
            {{ registrationPage ? 'Create your workspace.' : 'Your quality workspace.' }}
          </h1>
          <p class="access-intro">
            Organize your tests, follow every run, and turn results into answers.
          </p>
          @if (message) {
            <p class="access-notice" role="alert">{{ message }}</p>
          }
          @if (error() || optionsError()) {
            <div class="connection-notice" role="alert">
              <strong>We’re having trouble connecting</strong>
              <p>
                {{
                  error()
                    ? 'Your workspace connection is temporarily unavailable.'
                    : 'Account registration availability could not be checked.'
                }}
                Please try again.
              </p>
              <div class="retry-actions">
                @if (error()) {
                  <button (click)="retry.emit()">Retry connection</button>
                }
                @if (optionsError()) {
                  <button (click)="loadOptions()">Retry registration check</button>
                }
              </div>
            </div>
          }
          @if (expired()) {
            <p class="access-notice" role="status">
              Your guest demo expired. Start a fresh demo or sign in. No demo data was saved to an
              account.
            </p>
          }
          @if (loading()) {
            <p class="availability" role="status">Checking registration availability…</p>
          }
          @if (registrationPage) {
            @if (enabled()) {
              <h2 class="registration-heading">Secure registration</h2>
              <p class="registration-copy">
                Create your account and verify your email to receive a personal workspace.
              </p>
              <a class="button access-primary" href="/auth/register"
                >Continue to registration <span aria-hidden="true">→</span></a
              >
            } @else if (!loading() && !optionsError()) {
              <p class="access-notice" role="status">
                New accounts are currently unavailable. Explore the demo without an account, or sign
                in if you already have access.
              </p>
            }
            <div class="registration-links">
              <a class="button access-secondary" [href]="loginUrl()">Sign in</a
              ><a class="button access-secondary" href="/">Back to start</a>
            </div>
          } @else {
            <div class="entry-actions">
              <a
                class="button access-primary"
                [class.access-secondary]="!enabled()"
                [href]="loginUrl()"
                >Sign in <span aria-hidden="true">→</span></a
              >
              @if (enabled()) {
                <a class="button access-secondary" href="/register">Create account</a>
              }
            </div>
            <p class="account-note">
              {{
                enabled()
                  ? 'Your own workspace. Other workspaces require permission.'
                  : 'Sign-in is for existing accounts. Explore the demo without an account.'
              }}
            </p>
          }
        </section>
        <section class="access-preview" aria-labelledby="preview-title">
          <div class="preview-heading">
            <span class="preview-icon" aria-hidden="true"
              ><svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linejoin="round"
              >
                <path d="m9 6 9 6-9 6V6Z" />
                <rect x="2" y="2" width="20" height="20" rx="5" /></svg></span
            ><span class="preview-badge">Interactive demo</span>
          </div>
          <h2 id="preview-title">See Assertide in action</h2>
          <p>Explore the testing workflow. No account needed.</p>
          <ul class="preview-features">
            <li><span aria-hidden="true">01</span>Explore sample projects</li>
            <li><span aria-hidden="true">02</span>Try a simulated test run</li>
            <li><span aria-hidden="true">03</span>Investigate a failure report</li>
          </ul>
          <button
            class="guest-button"
            [class.access-primary]="!enabled()"
            (click)="explore.emit()"
            [disabled]="!!error()"
          >
            Explore as guest <span aria-hidden="true">↗</span>
          </button>
          <p class="preview-note">
            30 minutes · No account needed<br />Sample data only. No real tests or private data.
            Demo content isn’t saved to your account.
          </p>
        </section>
      </div>
      @if (!registrationPage) {
        <footer class="creator-footer">
          <span>Built by <strong>Or Konijn</strong> · Independent freelancer</span>
          <a href="/about"
            >About the creator &amp; architecture <span aria-hidden="true">↗</span></a
          >
        </footer>
      }
    </main>
  `,
  styleUrl: './access-entry.css',
})
export class AccessEntry {
  private readonly http = inject(HttpClient);
  public readonly error = input('');
  public readonly expired = input(false);
  public readonly explore = output<void>();
  public readonly retry = output<void>();
  public readonly theme = output<void>();
  public readonly enabled = signal(false);
  public readonly loading = signal(true);
  public readonly optionsError = signal(false);
  public readonly registrationPage = location.pathname === '/register';
  public readonly message =
    messages[new URLSearchParams(location.search).get('reason') ?? ''] ?? '';
  public constructor() {
    afterNextRender(() => document.getElementById('access-title')?.focus());
    void this.loadOptions();
  }
  public loginUrl(): string {
    const destination = ['/register', '/access', '/guest'].includes(location.pathname)
      ? '/'
      : location.pathname + location.search;
    return `/auth/login?returnTo=${encodeURIComponent(destination)}`;
  }
  public async loadOptions(): Promise<void> {
    this.loading.set(true);
    this.optionsError.set(false);
    try {
      const options = await firstValueFrom(
        this.http.get<{ registration: boolean }>('/auth/options').pipe(timeout(10000)),
      );
      this.enabled.set(options.registration === true);
    } catch {
      this.enabled.set(false);
      this.optionsError.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
