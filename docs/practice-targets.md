# Supplemental practice targets

The seven API-001–007 JSONPlaceholder cases and seven WEB-001–007 The Internet cases are implemented as explicit manual practice. All seven API cases passed locally on 30 October 2026; all seven browser cases passed across the initial and corrected targeted checks. These results describe public fixture availability at that time, not a hosted-service SLA. The controlled Lab and pinned store remain the repeatable application/CI gates.

From `packages/automation` in PowerShell:

```powershell
$env:ASSERTIDE_PUBLIC_PRACTICE='true'
npx playwright test --config practice.config.ts
Remove-Item Env:ASSERTIDE_PUBLIC_PRACTICE
```

On Linux/macOS use `ASSERTIDE_PUBLIC_PRACTICE=true npx playwright test --config practice.config.ts`. Run only occasionally; the configuration rejects CI, uses one worker, zero retries, stops on the first failure, and spaces API requests by at least one second. HTTP 403/429 stops practice without retrying; investigate permission/Retry-After before another manual attempt. Browser requests are confined to the approved host. Uploaded content is a synthetic 20-byte text file. No real account, personal file or application credential is used.

Each invocation writes separate ignored evidence, JSON results and raw Allure results under `.local/practice/<timestamp>`. API attachments record the synthetic request and response. JSONPlaceholder writes are simulated; tests never assume persistence, authentication or production performance. Public execution is deliberately separate from the network-isolated application worker pool.

Permission sources checked during implementation: [JSONPlaceholder official guide](https://jsonplaceholder.typicode.com/guide/) and [Sauce Labs' The Internet repository](https://github.com/saucelabs/the-internet). Recheck those sources before changing scope. Full case expectations remain in [the approved test plan](../deliverables/03-testing-targets-and-test-plan.md).
