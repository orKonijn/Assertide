# Assertide brand and design system

Assertide combines “assert” with “tide”: repeated verification that reveals the direction of quality. Pronounce it “assert-tide.” The product promise is **Confidence, one run at a time.** The voice is calm, specific and useful: “2 tests need attention,” “Your evidence is preserved,” “Report generation failed.” Avoid celebratory language when a retry merely hides an earlier failure.

## Name research and availability

Exact-name searches for Assertide and assertide.com on 29 October 2026 returned no relevant established testing product in the reviewed results. This is a preliminary collision screen, not trademark clearance or proof of domain availability. assertide.com, assertide.dev and useassertide.com are naming suggestions only; no registrar availability or ownership was verified, and no domain was purchased. Search relevant trademark registries and obtain domain availability from a registrar before launch. Earlier candidates Veriqo and Qavelo were rejected because searches found existing uses. The empty Figma file retains its early provisional name because the provider quota prevented renaming it; it is not the final brand.

## Logo

The mark is an angular A with a verification stroke, held within a soft square. The diagonal conveys forward progress; the mint check provides a secondary cue. Files: `brand/logo-primary.svg`, `brand/logo-mark.svg`, `brand/favicon.svg`. The wordmark remains editable text and uses Inter with a sans-serif fallback; install Inter for consistent editing. The icon is native SVG paths. Clear space is one-quarter of the mark width on all sides. Minimum mark size 24px; use the standalone favicon at small sizes. Do not stretch, rotate, apply gradients or add drop shadows to the mark. A monochrome implementation may use the same paths with one foreground color when color is unavailable.

## Palette and typography

| Role | Light | Dark | Use |
|---|---|---|---|
| Canvas | #F5F6FA | #0D1321 | Application background |
| Surface | #FFFFFF | #151E30 | Cards, navigation and forms |
| Soft surface | #EEF0F7 | #1C2940 | Controls and secondary emphasis |
| Primary text | #182237 | #F0F3FA | Titles and body copy |
| Secondary text | #58657B | #A7B4CC | Labels and descriptions |
| Border | #D8DFEA | #33415A | Grouping; never sole focus indicator |
| Brand | #5145CD | #B2A7FF | Actions, links and focused scope |
| Brand surface | #EEEBFF | #30294F | Active navigation and notices |
| Success | #147455 | #70DBB2 | Passed and ready |
| Failure | #B92F49 | #FF92A4 | Failed and broken |
| Warning | #926000 | #F5CA78 | Incomplete and policy warnings |

Inter Regular, Medium and Bold are the Figma font contract. Product title 28px/1.45; display 36px; section 18px; body/label 14px; caption 12px. Preview CSS uses a compact screen-specific type scale and an Inter web-font request with Arial fallback if the network is unavailable. Monospace code in production should use a system stack; code in the native Figma generator uses Inter to avoid an unverified secondary font dependency. Use tabular numerals for timing and KPI alignment in implementation.

Spacing scale: 4, 8, 12, 16, 24, 32, 48px. Container radii 12px, controls 8px, hero artwork 24px. Desktop 1440px with 224px navigation and 32px content padding. Mobile 390px with 16px padding, stacked cards, and labeled data rows. Layout containers use Figma auto-layout. Charts are editable vectors rather than screenshots; their underlying values remain in `design-content.json`.

## Icons and mascot

The custom 24px icon set uses 1.8px rounded strokes. Eighteen SVG assets cover overview, project, layers/suites, search, play, chart, code, settings, passed, failed, skipped, canceled, running, queued, broken, chevron, download and theme. Status labels always accompany icons; color alone does not communicate outcome. Navigation icon swapping uses a Figma INSTANCE_SWAP property rather than duplicating a variant for every icon.

**Pip** is a small verification robot with a check on its chest and a signal antenna. Four original vector poses are provided: welcome (raised hand), success (check signal), failure (concerned face and alert), loading (progress arc). Pip appears in login, onboarding and empty/error/success views. Keep it out of dense result tables and use restrained expressions for failures. Each pose is a standalone editable SVG and a component in the generator. Loading animation is an implementation specification, not an animated SVG asset: rotate the signal arc over 1.2 seconds, stop it under reduced motion and retain a text status.

## Components and states

The generator builds Button variants Default/Hover/Focus/Disabled/Loading, Status variants Passed/Failed/Running/Queued/Skipped/Canceled/Broken, Metric card, Field, Navigation item, 18 icon components, Brand mark and four Mascot components. Screens use instances of these reusable elements. Text styles and aliased light/dark semantic variables share a primitive collection; spacing/radius variables are bound where applicable. Static icon geometry and plot geometry intentionally remain fixed.

Interaction requirements for implementation: button press 150ms, page dissolve 200ms, focus ring visible without hover, no movement when reduced motion is requested. Figma prototype links use click navigation with a dissolve. Button hover/focus states are provided as editable variants; the generator does not implement every interactive variant transition. Filters and form values in the local preview are illustrative rather than working product controls.

## Deliverable status and Figma recovery

The actual target file is [the created Figma file](https://www.figma.com/design/Omm8667aVR3UJbtJ5VTYfC). It is empty: the Starter-plan tool limit prevented all design mutations. Do not present that file as a completed editable design.

The offline development plugin in `figma-plugin/` generates native Figma text, vectors, auto-layout frames, components, instances, variables, styles and prototype links. Its content covers 12 main screens and 13 supporting states, each at desktop/mobile sizes and in light/dark themes: 100 screen/state frames in total, plus brand foundations and component library. The supporting states include separate new-run and rerun paths so selection and lineage remain consistent.

To complete the hosted deliverable, import `figma-plugin/manifest.json` through Figma desktop's development-plugin flow, run it in the created file, then inspect the output. The builder needs a plan that supports two variable modes. If Figma rejects a feature or the required font, it stops with the partial page preserved; do not blindly rerun. It prevents duplicate generation when an Assertide page already exists. The exact import UI may vary by Figma version; the manifest is the entry point.

Required native validation after import: verify 100 frames, native text and instances, zero full-screen image fills, Inter font family, non-overlapping layouts, two theme modes, readable mobile tables, button variants and flows A/B/C including the Open Allure link. Copy the printed `ASSERTIDE_DESIGN_LEDGER` from the plugin console into the handoff state record. Capture actual Figma screenshots only after inspecting the canvas. Plugin syntax checks and browser-preview checks do not prove native Figma rendering.

## Design review preview

Open `preview.html` for a reviewable local prototype. The screen selector exposes every main view and supporting state; theme and mobile controls change the preview. Primary actions, sidebar navigation, case rows and the Open Allure link connect the specified journeys. Values are synthetic, and evidence cards do not claim real screenshots or traces exist. The preview is a companion review artifact, not a substitute for the requested editable Figma project or an implemented Angular application.
