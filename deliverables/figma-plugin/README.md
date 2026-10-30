# Assertide Figma development plugin

Entry point: `manifest.json`. Generated bundle: `code.js`. Authoring sources: `engine.js`, `../design-content.json` and `../build-design.cjs`.

Run `node build-design.cjs` from the deliverables directory after edits, then `node --check figma-plugin/code.js`. The plugin does not fetch external assets. It creates native text, paths, auto-layout, components, variables, styles and navigation links on one page. It requires Inter Regular/Medium/Bold and support for two variable modes.

Import the manifest using Figma desktop's development-plugin import flow and run it in the intended Design file. It refuses to create a second page with the same Assertide name. Partial work is preserved on failure. Rename an existing generated page only when intentionally creating another version; inspect it before doing so. The plugin never deletes existing user content.

Expected output: 12 major views plus 13 supporting states × 2 sizes × 2 themes = 100 screen/state frames, a brand section, and component library. The native console prints IDs and counts as ASSERTIDE_DESIGN_LEDGER. Inspect actual rendering and prototype links before accepting it. No Figma execution or screenshot validation was possible during this delivery because the connected provider reached its plan limit.

Prototype paths:

- A: Login → Projects → Suites → Explorer → Configure → New live run → Result → Open Allure.
- B: API workspace → API live → API result → API workspace.
- C: History → Result → Rerun configuration → Live rerun → Result.

The new-run path uses R-1044 and its own result/report; history and rerun paths retain R-1042/R-1043 lineage. Native controls are a design prototype and do not launch tests.
