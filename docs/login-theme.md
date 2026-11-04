# Assertide sign-in theme

The production password form is served by Keycloak, separately from the Angular welcome screen. `deploy/keycloak/themes/assertide/login` gives that form the application's logo, graphite surfaces, indigo action, readable controls and mobile layout. It defaults to Assertide dark styling. The app's saved theme preference is not shared across the separate authentication origin.

The theme inherits Keycloak's `keycloak` login theme and changes only CSS and the English heading. It does not replace form templates, password handling, reset/verification flows, hidden fields, CSRF protection, redirects, or authentication policy. See [Keycloak's theme guidance](https://www.keycloak.org/ui-customization/themes).

`deploy/Keycloak.Dockerfile` packages the theme into the identity image. New pilot realms select `loginTheme: assertide` through `deploy/pilot-secrets.mjs`. The copied logo is the existing `apps/web/public/brand/assertide-logo.png`; keep those assets synchronized when the logo changes.

## Existing installations

Realm import does not update an existing realm. To activate this change:

1. Build and scan the Keycloak image through the existing reviewed image workflow and verify its signed digest. Retain the current image and realm theme value for rollback.
2. Roll out the new identity image using the existing private operational channel; wait for readiness.
3. In the private administrator session, set the Assertide realm's Login theme to `assertide` (Realm settings → Themes), or use an already-authenticated `kcadm.sh update realms/assertide -s loginTheme=assertide`. Do not expose the admin console or place credentials in shell history.
4. Check fresh sign-in, invalid credentials, password visibility, mandatory account actions, keyboard focus and mobile layouts. Confirm the OIDC callback still completes.

To roll back, restore the prior Login theme value before reverting the identity image. No database migration, user recreation or credential reset is needed. Never run the development identity fixture in production.

## Local evidence

Verified on a separate, loopback-only Keycloak 26.8.1 instance matching the production provider version. Fresh fixture realms rendered the inherited baseline and implemented theme; screenshots are actual provider forms, not mockups. A synthetic local user completed the authorization-code redirect. Invalid credentials, show/hide password, keyboard focus and no horizontal overflow passed at 390, 768 and 1440px. Automated WCAG A/AA scans reported no violations in the initial themed form. This is not a complete accessibility audit of every provider flow or a production sign-in test.

- [Desktop before](changelog/assets/unreleased/login-provider-before-1440.png) / [after](changelog/assets/unreleased/login-provider-after-1440.png)
- [Mobile before](changelog/assets/unreleased/login-provider-before-390.png) / [after](changelog/assets/unreleased/login-provider-after-390.png)

Only empty forms are retained as public screenshots. Credentials, sessions and local provider data remain in ignored storage. Local quick verification and all three realm-bootstrap tests passed. Container building/scanning passed in the publication workflow below.

## Pilot deployment

Activated at [assertide.com](https://assertide.com) on 2026-11-04. Source commit `5c53f3a3cdd46cf82cbe143511a2a9c71cc034b0` is on main. [Image publication 41848769425](https://github.com/orKonijn/Assertide/actions/runs/41848769425) passed builds, smoke tests, vulnerability scans and signed provenance publication. The deployed identity digest is `sha256:8ef354f880069533dda3f7223a8e9c941d4b3711facaa8041508e1853a98ad96`; signed provenance was checked against that exact source and the hosted publication workflow before rollout.

The identity StatefulSet became ready and the existing realm now uses `assertide`. Previous image and theme settings remain in private rollback storage. No user credentials, memberships or authentication policies changed. Fresh live sign-in pages passed theme, overflow, keyboard-focus and automated WCAG A/AA checks at 390px and 1440px. Actual authenticated sign-in was verified locally as described above; the production owner's account was not used to sign in or reset during deployment.

The broader [Verify run 41848744011](https://github.com/orKonijn/Assertide/actions/runs/41848744011) was **not green**: the application browser suite failed two About-page assertions (old creator heading and anonymous access expectations) and an onboarding-completion assertion. Its Kubernetes stage repeated the two About failures. Those files are unchanged by this theme commit. This deployment does not claim a fully passing application/infrastructure suite.
