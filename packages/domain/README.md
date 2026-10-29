# Execution domain

Pure execution transitions and historical metric formulas from the product specification. Run tests with Node 24: `node --test packages/domain/execution.test.ts` from the repository root.

This package does not provide persistence, authorization, queue ownership or worker isolation. The control API must apply transitions inside a transaction with a conditional update on version and lease epoch. Cancellation requests preserve live phases until workers acknowledge termination. Report generation is independent of execution phase.
