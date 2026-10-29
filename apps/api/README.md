# Control service and Lab fixture

Node 24, npm 11. Run `npm ci`, `npm run typecheck`, and `npm test` in this directory.

The current Nest service exposes health and an opt-in controlled Lab API. Production platform endpoints are still under development. The Lab fixture provides signed five-minute tokens, tenant-scoped orders, role checks, atomic idempotent creation, conditional updates and deletion. Tokens validate signature, issuer, audience and expiry.

Set `ENABLE_LAB=true`, `LAB_PASSWORD` (at least 12 characters) and `LAB_SIGNING_KEY` (at least 32 characters) in the process environment before `npm start`. Never use production secrets. The listener binds loopback. Fixture usernames are `operator-a`, `viewer-a`, and `operator-b`. All use the configured fixture password. Endpoints currently use `/lab/v1` to keep the fixture separate from future platform routes.

Set `DATABASE_URL` to PostgreSQL for deployment. Without it, non-production runs use PGlite; set `LOCAL_DATABASE_PATH` for persistent development storage. Without either setting the database is ephemeral. Production refuses this fallback and refuses Lab mode. Database migrations and production lifecycle management remain to be integrated.

Tests exercise real SQL and HTTP. Remaining Lab acceptance: fault hooks, rate limiting and expired-token fixtures. The platform authentication flow is separate from fixture tokens.
