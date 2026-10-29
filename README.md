# Assertide

QA automation control plane specified in [the product requirements](deliverables/01-product-requirements.md).

## Implementation status

Development has started. `apps/web` is the Angular foundation; the control API, authentication, database, queue, isolated runners and reporting platform are not implemented yet. The files in `deliverables` are specifications, design previews and illustrative examples, not working platform features.

## Web development

Use Node.js 24 and npm 11. In `apps/web`, run `npm ci`, then `npm start`. Run `npm run build` for a production build and `npm test -- --watch=false` for unit tests.

The infrastructure baseline requires Docker, PostgreSQL 17, Redis and private S3-compatible storage. Follow [the architecture](deliverables/02-architecture-and-automation.md) and [implementation order](deliverables/05-roadmap.md).

## Versions

No product release is assigned. The private web package uses `0.0.0` as a tooling placeholder, not a released application version. A documented pre-1.0 compatibility policy must precede the first product release. Completed changes remain under `Unreleased` in the changelog.
