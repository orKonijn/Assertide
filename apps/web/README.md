# Assertide web application

Angular 22 standalone components, signals, lazy routes and strict templates. Run `npm run setup` and `npm start` from the repository root for the connected API, local OIDC and web server at `http://127.0.0.1:4200`.

From this directory, `npm run build` produces `dist/assertide-web`; `npm test -- --watch=false` runs Vitest. Root `npm run verify:quick` checks lint, API/automation types, unit tests and the production web build. Root `npm run test:e2e` runs the repository's Playwright browser journeys with zero retries, including desktop/mobile accessibility. There is no separate Angular CLI `ng e2e` target.

The API workspace launches only enabled API cases. Disabled members already saved in a suite remain removable. Run detail rejects out-of-order snapshot/history responses and clears protected state on access revocation. See [implementation and verification](../../docs/implementation-verification.md) and [contributor instructions](../../CONTRIBUTING.md).
