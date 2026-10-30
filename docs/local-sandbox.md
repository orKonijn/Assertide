# Pinned local browser fixture

The setup script clones Sauce Labs `sample-app-web` at `ad62bb2d7950bc5747af46a75aa1fb1bd6b8622a`, retains its MIT license and builds locally. The ignored checkout is under `.local/targets/swag-store`; it is not application source or a production dependency.

Local adaptations disable Backtrace initialization and sends, and substitute a local React error boundary retaining the original fallback. No business assertions or storefront behavior are replaced. The static server binds loopback on port 4013, rejects external connections through CSP, and supports history routes.

The upstream dependency audit currently reports 19 findings (6 low, 6 moderate, 7 high). This fixture is restricted to development and CI; do not expose it as a production service. Assertide's own automation dependency audit reports zero known findings after pinning DOMPurify 3.4.17 through an override for Allure's transitive dependency. Recheck audits on dependency updates.

Verification: UI-001 through UI-012 passed in Chromium, Firefox and WebKit on 30 October 2026. These are functional test results, not a production security certification. Failure traces contain only public demo credentials and synthetic customer data. Platform-login traces are disabled because they would contain generated local credentials.
