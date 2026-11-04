# Assertide visual system

## Direction

Assertide uses an operational graphite-and-indigo palette: neutral surfaces for work, indigo for actions and selection, and separate semantic colors for outcomes. The logo and existing line icons remain recognizable. No additional fonts, illustrations, libraries, or decorative animation are introduced.

The previous interface combined several rounds of styling: large rounded surfaces, repeated metric cards, small uppercase metadata, hardcoded chart colors, and elevated button hover effects. This refinement consolidates theme colors, flattens framing, improves metadata readability, and gives charts explicit series labels. It preserves the existing page-specific workflows and responsive table layouts.

## Semantic palette

Tokens live at the top of `apps/web/src/styles.css`. Components consume them rather than choosing their own theme colors.

| Role                    | Token                | Light     | Dark      |
| ----------------------- | -------------------- | --------- | --------- |
| Canvas                  | `--canvas`           | `#e8eae9` | `#14191e` |
| Working surface         | `--surface`          | `#f5f6f3` | `#1c232a` |
| Grouped / hover surface | `--soft`             | `#dfe4e2` | `#28323b` |
| Main text               | `--text`             | `#202b30` | `#e6eaed` |
| Supporting text         | `--muted`            | `#526169` | `#a8b5bf` |
| Separators              | `--border`           | `#bdc8c8` | `#40505c` |
| Input boundaries        | `--control-border`   | `#7c8a8d` | `#697984` |
| Action / focus          | `--brand`            | `#4d4cac` | `#b0b5ff` |
| Text on action          | `--on-brand`         | `#ffffff` | `#1b203c` |
| Selected surface        | `--tint`             | `#e4e4f3` | `#2c3251` |
| Success                 | `--success`          | `#187451` | `#6cd4a6` |
| Failure                 | `--danger`           | `#ad3146` | `#ff9aa6` |
| Pending / warning       | `--warning`          | `#92600d` | `#e4b563` |
| Information             | `--info`             | `#256a96` | `#81bee9` |
| Final pass rate         | `--chart-primary`    | `#5552b8` | `#b0b5ff` |
| First attempt           | `--chart-comparison` | `#167969` | `#6cd4bc` |

Separators are intentionally quiet. Input boundaries and focus use stronger contrast. Status labels retain their text; color alone never carries the outcome. Chart series retain circles/diamonds and solid/dashed lines, plus a visible legend and the existing exact-value table. Guest samples remain explicitly synthetic.

## Typography and spacing

Use the existing Inter/system stack, with Segoe UI and system fallbacks; no font download. Operational page titles scale from 24 to 30px, section titles are generally 16–18px, body text 14px, and shared metadata/labels at least 12px. Larger authentication and editorial headings remain deliberate exceptions. Use restrained tracking and sentence case for operational labels. Tabular numerals align counts, timings and dates. Technical evidence uses the platform monospace stack and 1.65 line height.

Use the existing 4/8/12/16/24/32px spacing rhythm. Desktop content keeps established gutters; mobile keeps 16px gutters. Panels use the 8px radius token and controls use 6px where shared. Circles remain for status indicators and avatars. Resting cards have no shadow; overlays retain elevation to communicate stacking. Avoid adding a nested card when a divider can group the content.

## Component conventions

- Primary actions use the brand fill and `--on-brand`; secondary actions use bordered surfaces. Tertiary table actions remain quiet until hovered or focused. Destructive/error content uses the danger role.
- Hover changes surface/border; primary buttons no longer float or glow. Disabled controls retain native semantics and reduced opacity. Focus remains visible. Existing drawer/dialog closing behavior and focus restoration are preserved.
- Table headers use a subdued surface and readable labels. Selection keeps its tint and edge marker. Priority text in catalog rows no longer needs a pill. Edit actions have 44px targets.
- Settings forms use separators instead of an extra nested panel. Guest metrics share one summary band. Empty states use quiet framing and concise explanations.
- Notification, date/select, and evidence components inherit the shared tokens. Keep existing keyboard behavior and error/recovery controls intact.
- Default theme remains dark and saved user preferences remain respected. Existing reduced-motion rules disable movement.

## Responsive and accessibility evidence

Local browser acceptance covered authenticated routes, a live execution, expanded results, run configuration, keyboard skip navigation, drawer dismissal/focus restoration, and reduced motion. Automated WCAG A/AA scans covered light/dark at 390, 768 and 1440px. Catalog checks additionally cover intermediate widths, sorting, selection and pagination. These checks do not establish complete WCAG conformance or replace assistive-technology review.

Final local verification on 2026-11-04: `npm run verify:quick` passed (lint, formatting, type/unit checks and production build); all 15 focused browser tests passed. Automated accessibility scans reported no violations in the tested states. The existing `access-entry.css` size warning remains non-blocking (4.37 kB against a 4 kB warning budget). Linux infrastructure checks were not run locally; their skips are not passes. No production verification is claimed.

### Comparable captures

Captured from the running local application, before edits and after implementation, at 1000px viewport height. Catalog comparisons use the same seeded Assertide Lab catalog; the guest chart uses the same fixed synthetic data. No baseline was reconstructed.

| View                          | Before                                                                   | After                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Test explorer, 1440px, dark   | [Before](changelog/assets/unreleased/design-explorer-desktop-before.png) | [After](changelog/assets/unreleased/design-explorer-desktop-after.png) |
| Test explorer, 390px, dark    | [Before](changelog/assets/unreleased/design-explorer-mobile-before.png)  | [After](changelog/assets/unreleased/design-explorer-mobile-after.png)  |
| Guest overview, 1440px, light | [Before](changelog/assets/unreleased/design-demo-light-before.png)       | [After](changelog/assets/unreleased/design-demo-light-after.png)       |

The catalog comparison shows calmer surfaces, readable metadata and clearer column headers. The guest overview shows the consolidated summary band, chart legend, theme-specific chart colors and removal of the oversized programmatic content focus frame. Interactive controls retain their focus rings.

## Scope and limits

This is a refinement of the implemented application, not a workflow rewrite. Shared styles cover navigation, projects, suites, explorer, runs/results, reports, API evidence, settings and notifications; the entry, guest and About screens receive scoped adjustments. Existing route, authorization, calculation, storage and evidence contracts are unchanged. Upstream Allure/Playwright reports and the development identity-provider UI retain their own styling. Dense page-specific layouts may warrant later usability work; no claim is made that every possible error or data permutation was visually inspected.

No editable Figma file was identified in repository documentation or supplied with this task, so no Figma synchronization is claimed. Publication and deployment evidence is recorded in [pilot deployment notes](guest-pilot-deployment.md). No product version is assigned.
