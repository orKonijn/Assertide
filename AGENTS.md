# Project instructions

These instructions apply throughout this repository. Follow more specific instructions in nested `AGENTS.md` files when working in their directories.

## Start with context

- Read `README.md`, `CONTRIBUTING.md`, and the documentation relevant to the task before editing. Check `git status` and inspect existing changes in files you will touch.
- Treat implemented code and verified behavior as evidence. The original specifications, previews, and illustrative examples in `deliverables/` are not proof that a feature is implemented.
- Keep changes focused on the request. Follow existing patterns before adding abstractions, dependencies, or configuration.
- Complete routine, reversible work without repeated confirmation. Ask when a missing requirement materially changes behavior or the requested action would destroy data.

## Repository map

- `apps/web/`: Angular application and frontend unit tests.
- `apps/api/`: API, backend tests, and service configuration.
- `packages/domain/`: shared domain behavior and tests.
- `packages/automation/`: Playwright suites, Page Objects, fixtures, and reporting checks.
- `workers/` and `deploy/`: worker runtimes, container and deployment configuration.
- `scripts/`: local development, setup, and verification commands.
- `docs/`: operational guidance, implementation evidence, and development conventions.
- `deliverables/`: original requirements, architecture, design artifacts, and examples.

## Protect existing work

- Preserve unrelated edits, untracked files, and historical assets. Do not reset, clean, overwrite, or revert other work to simplify your task.
- Inspect a file's current contents before changing it, and review the final diff for accidental changes.
- Avoid repository-wide automatic fixes when they would modify unrelated work; scope fixes and formatting to the files being changed.
- Work on a feature branch for implementation. Do not switch branches underneath existing work without checking its state.
- Do not commit, push, merge, publish, or deploy unless the user requests it. Keep PR #1 unmerged until the owner explicitly requests a merge, as required by `CONTRIBUTING.md`.

## Implementation rules

- Use Node.js 24 and npm 11. Preserve the relevant package lockfiles and use `npm ci` for reproducible installs. Run `npm run setup` only when setup is needed and the local application is stopped.
- Follow `docs/code-quality.md`, the existing ESLint configuration, Prettier, and EditorConfig.
- Keep strict TypeScript types, explicit function return contracts and class visibility, type-only imports, and readonly references where appropriate. Narrow untrusted input instead of using `any` or unsafe casts.
- Await or return promises, and handle failures in intentional background work. Do not silence lint, type, or test failures to make checks pass.
- In Angular, use the established standalone components, native control flow, and lifecycle-safe signal/subscription patterns.
- Reuse existing UI components and styles. Preserve keyboard navigation, focus management, accessible names, responsive layouts, light/dark themes, and reduced-motion behavior.
- Enforce authorization and project boundaries on the server. Frontend visibility is not an authorization check.
- For configuration or persistence changes, update the relevant example configuration and operational or migration guidance. Explain compatibility effects and recovery steps where applicable.

## Security and local data

- Never commit or expose credentials, tokens, private traces, database contents, or raw evidence. Keep local credentials and runtime data in ignored `.local/` storage.
- Do not print `.local/credentials.json` or copy its contents into responses, reports, screenshots, or logs. Use masked and sanitized diagnostics.
- Keep the development OIDC provider and trusted local runner private. Do not weaken production authentication, worker isolation, or private object storage to make local tests pass.
- Use controlled fixtures for automated tests. Public-practice cases are explicitly manual; do not run them as part of routine verification.

## Verification

Run commands from the repository root unless noted otherwise:

| Command                                                  | When to use it                                                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm run verify:quick`                                   | Implementation changes: lint, formatting, type checks, unit checks, and production build.                 |
| `npm run test:e2e`                                       | Connected browser acceptance; run the relevant documented focused tests during iteration.                 |
| `npm run test:regression`                                | Changes that need the full controlled API/UI regression suite.                                            |
| `npm --prefix packages/automation run test:architecture` | Changes to selectors, Page Objects, fixtures, diagnostics, or reporting.                                  |
| `npm --prefix packages/automation run test:reporting`    | Changes to selectors, fixtures, diagnostics, or reporting.                                                |
| `npm run format:check`                                   | Repository formatting verification; for documentation-only work, a scoped formatting check is sufficient. |

- Add or update meaningful tests for behavior changes and bug fixes. Documentation-only edits do not require running the application suite.
- Follow `docs/playwright-ui-architecture.md` and `docs/ui-testing.md`. Keep selectors and UI interactions in the established Page Objects.
- Tests must own their projects or run IDs. Use the authenticated in-memory fixture for ordinary journeys and fresh unauthenticated contexts for login/security tests; explicitly clear inherited storage state for anonymous contexts.
- Use observable conditions instead of arbitrary sleeps or retries that hide races. Preserve credential-safe screenshot and trace policies.
- Capture actual running UI evidence for meaningful visual changes, including mobile views when affected. Do not regenerate committed changelog screenshots during routine tests.
- Distinguish local checks from Linux infrastructure CI. A skipped or unavailable check is not a pass; report it and its impact clearly.

## Handoff

- Summarize what changed, the relevant files, checks actually run and their results, and any remaining limitation or blocker.
- Separate verified behavior from assumptions. Never claim a test passed, a screenshot was captured, or a release was published without evidence.
- For PR descriptions, explain the resulting behavior, verification, and any migration or security impact. Use meaningful Conventional Commits if a commit is requested.

## Changelog and release notes

Follow [the changelog rules](docs/changelog-rules.md) whenever implementing meaningful changes or preparing a release. Read the complete rules before updating changelog or release-note content. These rules are supplied by the project owner and apply throughout development.

Maintain `CHANGELOG.md` as the repository changelog. Record completed, relevant changes under `Unreleased`; do not describe planned features, design specifications, or mockups as working application functionality. Confirm changes and verification evidence before writing entries.

Use the versioning, migration, visual-evidence, release-finalization, and verification requirements in the linked rules. Do not increment versions or claim publication merely because the changelog changed. Preserve historical entries and assets.

No product release version or release automation is established yet. The version in `deliverables/examples/package.json` belongs to the illustrative automation example package, not to a released Assertide application. Establish a documented pre-1.0 product policy before assigning a product release version.
