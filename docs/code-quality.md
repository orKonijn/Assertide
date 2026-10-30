# Code quality

Run these commands from the repository root after installing all three packages with `npm run setup`:

| Command                | Purpose                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `npm run lint`         | Check maintained TypeScript, JavaScript and Angular templates; zero warnings allowed. |
| `npm run lint:fix`     | Apply safe ESLint fixes, including import sorting and type imports.                   |
| `npm run format`       | Apply the shared Prettier configuration.                                              |
| `npm run format:check` | Check formatting without changing files.                                              |
| `npm run verify:quick` | Run lint, formatting, unit tests, type checks and the production build.               |

Run lint fixes before formatting, then review the diff. CI installs API, web and automation dependencies before type-aware linting, and rejects both lint and formatting failures. Infrastructure and Playwright acceptance remain separate CI gates.

## Toolchain

The migration was verified with the locked web toolchain: ESLint 10.13.0, TypeScript ESLint 8.72.1, Angular ESLint 22.6.0, Prettier 3.9.10, TypeScript 6.0.3 and Angular 22.2.4. Automation retains its pinned TypeScript 6.0.2. Package lockfiles remain the reproducible source of installed versions.

## Conventions

- Explicit accessibility for class fields, methods and constructors. Keep dependencies and implementation-only locators private; expose intentional assertion locators as public readonly.
- Explicit return contracts on named functions, utilities and methods, including Promise return types. Contextually typed callbacks can use inference.
- Readonly dependencies, signals and locator references. Keep fields before constructors, then public, protected and private methods. Preserve field initialization order when an initializer depends on another field.
- Type-only imports and automatically sorted import groups; no unused declarations or explicit any.
- Await or return promises, or explicitly handle background failures. Async callbacks must match the receiving API.
- Production code rejects unsafe assignments, calls, arguments, member access and returns. Parse untrusted input or narrow unknown values.
- Strict equality, const by default and braces for control flow. Prefer guard clauses, meaningful domain names and focused methods; review complexity instead of enforcing arbitrary line counts.
- No unexplained TypeScript or ESLint suppressions. Tests follow the same contract and promise rules.

One root flat ESLint configuration owns correctness. The Prettier compatibility configuration prevents competing formatting rules; Prettier owns quotes, wrapping and whitespace. The root EditorConfig supports editors without requiring a new commit-hook system. Configure your editor to use the repository Prettier and ESLint installations in `apps/web/node_modules`, format on save, and ESLint fixes on explicit save.

Generated outputs, dependency lockfiles and archived reference deliverables are excluded from formatting. Maintained application source, automation, scripts, configuration and documentation are included. The dedicated fallback lint tsconfig covers domain tests; API, automation and Angular use their own actual compiler projects.

This migration changes development checks, not the product release version. Existing users do not need a database migration.
