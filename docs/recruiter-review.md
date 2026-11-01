# Reviewing Assertide

Start with the [three-minute demo in the README](../README.md#a-three-minute-tour). The public creator page uses the approved name Or Konijn and freelancer description. Personal contact links are omitted until supplied; the GitHub link points to the project source.

## What each kind of evidence proves

- **Guest demo:** synthetic examples of navigation, results and investigation. No real tests run.
- **Local verification:** lint, types, unit checks and a production build; focused browser tests cover the changed flows.
- **Linux Verify workflow:** real infrastructure, controlled regression and platform acceptance for the selected commit. A running or failed job is not a pass. Inspect individual steps and retained artifacts.
- **Image publication:** a build was published, not that every acceptance check passed or that it was deployed.

For the reviewed baseline, [Verify at c0cd6d9](https://github.com/orKonijn/Assertide/actions/runs/41300010801) passed controlled regression but reported three platform acceptance failures on 2026-11-01: two registration-height checks and drawer focus restoration after an outside click. Kubernetes verification was still running. The shorter registration copy passes both affected layout checks locally. The drawer Page Object now uses an actionable locator click instead of a raw coordinate click that could precede rendering after reopening.

The earlier [run at 229acb4](https://github.com/orKonijn/Assertide/actions/runs/41219572704) failed platform acceptance and Kubernetes/Vault verification. These are historical observations, not the current status: follow the links and inspect the final results. Do not describe a revision as fully verified until its required checks complete successfully.

## Local verification of the introduction fixes

Nine focused browser checks pass: public creator access, registration policy messaging, both themes, mobile layouts, guest investigation, and guest expiry/state transitions. A separate controlled-identity browser check passes drawer dismissal and focus restoration at 390px and 820px. The original authenticated drawer journey could not reach the local identity-provider account selector, so this is UI evidence, not a successful authenticated acceptance run.

Quick verification passes, including 40 API checks (eight infrastructure checks skipped locally), 16 web unit checks and a production build. Architecture and reporting checks pass. The build reports a non-blocking access-entry stylesheet size warning; no budget was increased. Full Linux verification must run on the final revision before claiming CI success.

## Useful engineering discussion

- Tests use controlled targets, isolated project data and Page Objects. Explain where API prerequisites replace repeated UI setup.
- Metrics retain first-attempt and final outcomes so retries do not conceal instability.
- Evidence recording excludes authentication requests and selected sensitive data; artifact access still requires authorization. Redaction is not a promise that arbitrary input is safe to publish.

See [UI testing](ui-testing.md), [code quality](code-quality.md), and [deployment limitations](guest-pilot-deployment.md). Original documents in `deliverables/` are specifications and examples, not implementation evidence.
