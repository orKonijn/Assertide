# Representative Playwright examples

These examples accompany the specification; they are not the production control plane or a full implementation of the test catalog. Dependency versions are resolved in the included package-lock.json. TypeScript checking and test discovery passed; five instances were discovered (one UI case across three browsers and two API cases). Tests target local defaults and were not executed against public sites or local targets.

1. Install dependencies with `npm ci` after the lockfile is present.
2. Run `npm run typecheck` and `npm run list` without contacting test targets.
3. Provision a pinned local SauceDemo at port 3000 and a JSONPlaceholder-compatible fixture at port 4011, or explicitly set UI_BASE_URL/API_BASE_URL to approved targets.
4. Install matched Playwright browsers with `npx playwright install` in your runner environment.
5. Run `npx playwright test --project=chromium` or `--project=api`. API projects never use browsers. Do not run the entire browser matrix against public targets by default.

The sample contains UI-005, API-001 and API-003 only. Test listing expands UI-005 into three browser instances. Allure report generation, vault, redaction pipeline, fixture server and backend are specified in the documents and remain implementation work. Use a fresh allure-results directory per run while preserving all attempts within a run.
