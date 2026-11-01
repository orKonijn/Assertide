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
    <main class="login">
      <div class="brand-logo"><img src="/brand/assertide-logo.png" alt="Assertide" /></div>
      <p class="eyebrow">CONFIDENCE, ONE RUN AT A TIME</p>
      <h1 id="access-title" tabindex="-1">
        {{ registrationPage ? 'Create your workspace.' : 'Your quality workspace.' }}
      </h1>
      <p>Your own persistent workspace. Other workspaces require explicit permission.</p>
      @if (message) {
        <p role="alert">{{ message }}</p>
      }
      @if (error()) {
        <p role="alert">{{ error() }}</p>
        <button (click)="retry.emit()">Retry connection</button>
      }
      @if (expired()) {
        <p role="status">
          Your guest demo expired. Start a fresh demo or sign in. No demo data was saved to an
          account.
        </p>
      }
      @if (loading()) {
        <p role="status">Checking registration availability…</p>
      } @else if (optionsError()) {
        <p role="alert">Registration availability could not be checked.</p>
        <button (click)="loadOptions()">Retry registration check</button>
      }
      @if (registrationPage) {
        <h2>Secure registration</h2>
        <p>
          Create your account and verify your email securely with our identity provider. You’ll
          receive a personal workspace, without joining an existing organization.
        </p>
        @if (enabled()) {
          <a class="button" href="/auth/register">Continue to registration</a>
        } @else if (!loading()) {
          <p role="status">
            Registration is unavailable until the operator enables provider registration and
            verified email delivery.
          </p>
        }
        <p>Already have an account? <a [href]="loginUrl()">Sign in</a></p>
        <a href="/">Back to start</a>
      } @else {
        <div class="entry-actions">
          <a class="button" [href]="loginUrl()">Sign in</a
          ><a class="button secondary" href="/register">Create account</a>
        </div>
      }
      <hr />
      <h2>See Assertide in action</h2>
      <p>
        Tour sample projects, try a simulated run and inspect a failure report. A 30-minute,
        read-only demo: no real tests, private data or transfer to your account.
      </p>
      <button (click)="explore.emit()" [disabled]="!!error()">Explore as guest</button>
      <button (click)="theme.emit()">Light / dark theme</button>
    </main>
  `,
  styles: [
    `
      .login {
        margin: 16px auto;
        padding: 24px;
      }
      .login .brand-logo {
        width: 174px;
        overflow: visible;
        margin-bottom: 16px;
      }
      .login h1:not(.brand-logo) {
        max-width: 100%;
        font-size: clamp(28px, 5vw, 34px);
        margin: 12px 0;
      }
      .login p {
        margin: 10px 0;
        line-height: 1.5;
      }
      .login .button {
        margin: 12px 0;
        padding-block: 12px;
      }
      .entry-actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .login h1 {
        max-width: 100%;
      }
      .login h2 {
        font-size: 20px;
        margin: 16px 0 10px;
      }
      .login hr {
        border: 0;
        border-top: 1px solid var(--border);
        margin: 16px 0;
      }
      .login button {
        margin: 8px 8px 8px 0;
      }
      .login .secondary {
        background: var(--surface);
        color: var(--text);
        border: 1px solid var(--border);
      }
    `,
  ],
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
