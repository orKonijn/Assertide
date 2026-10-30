# Workspace visual refresh

The workspace uses a consistent indigo accent, navigation icons, clearer headings, softly elevated cards, and a more prominent metric row. History filters expand on demand, preserving all existing filtering, saved-filter, and export controls. Sign-in uses a contained card, and mobile actions expand to a comfortable width.

Motion includes short header and metric entrances, hover/press feedback, a mobile drawer entrance, toast/dialog entrances, and pulsing loading placeholders. The operating system's reduced-motion preference disables animations and transitions, including pseudo-elements.

## Actual application captures

These captures use the running local application and its existing Lab data, with matching viewport sizes and themes before and after the changes. They are not generated mockups.

### Desktop, 1440 × 1000

![Desktop before the visual refresh](changelog/assets/unreleased/ui-refresh-desktop-before.png)

Before: the full filter form occupies the top of the overview.

![Desktop after the visual refresh](changelog/assets/unreleased/ui-refresh-desktop-after.png)

After: expandable filters make room for headline metrics, with consistent surfaces and navigation icons.

### Mobile, 390 × 844

![Mobile overview before the refresh](changelog/assets/unreleased/ui-refresh-mobile-before.png)

Before: filters dominate the initial mobile view.

![Mobile overview after the refresh](changelog/assets/unreleased/ui-refresh-mobile-after.png)

After: the primary action, filter disclosure, and metric cards fit the viewport.

### Dark theme and sign-in

![Updated dark desktop overview](changelog/assets/unreleased/ui-refresh-dark-after.png)

Dark mode preserves readable text and the white logo treatment.

![Updated sign-in screen](changelog/assets/unreleased/ui-refresh-login-after.png)

Sign-in uses a focused card and full-width action.

## Dialog and card polish

Dialogs fade and move slightly as they close, including the backdrop. Native top-layer/display transitions retain the closing surface for 160ms; reduced-motion preferences dismiss it immediately. The mobile drawer now has a small close icon with a 44px hit target and the accessible name “Close menu.” Project actions use a single row with a short visible Edit label and a project-specific accessible name. Catalog status badges and edit buttons have an explicit wrapping gap.

![Compact mobile drawer close control](changelog/assets/unreleased/detail-polish-drawer.png)

The Workspace heading and close icon replace the full-width close button.

![Compact project actions](changelog/assets/unreleased/detail-polish-project.png)

Open project remains prominent, with Edit alongside it.

![Disabled test badge separated from its edit action](changelog/assets/unreleased/detail-polish-disabled-catalog.png)

The disabled status remains distinct from the edit button on a narrow screen.

Closing transition captured from the actual running dialog: [open](changelog/assets/unreleased/detail-polish-popup-open.png), [mid-close](changelog/assets/unreleased/detail-polish-popup-closing.png), [closed](changelog/assets/unreleased/detail-polish-popup-closed.png). The browser animation was paused at its midpoint for the middle capture, then completed. Browser inspection confirmed an active exit transition and immediate reduced-motion dismissal. Seven browser tests, including the 64-state accessibility matrix, passed along with production build and lint. No product version was assigned.

## Dropdowns and scrollbars

Regular select controls now use rounded anchored menus with themed selected options and arrows inset from the right edge. They retain native select semantics, Angular form values, keyboard selection, and Escape dismissal. The project-switch dialog remains searchable, and clicking or tapping its backdrop closes it and returns focus; starting a drag inside the dialog does not dismiss it.

Scrollbars use a slim thumb and transparent track, with light/dark tokens and a forced-colors fallback. The enhanced menus use [the browser's customizable select API](https://developer.chrome.com/blog/a-customizable-select); browsers without support keep the native option menu and receive the restyled closed control and inset arrow.

![Anchored dropdown on a light desktop](changelog/assets/unreleased/controls-light-1280.png)

The menu stays anchored to its field, with rounded options and the current selection highlighted.

![Anchored dropdown in dark mode on mobile](changelog/assets/unreleased/controls-dark-390.png)

The browser places the menu above the field when that gives it more room. This is not a modal dialog.

![Slim sidebar scrollbar on mobile](changelog/assets/unreleased/controls-scrollbar-mobile.png)

The navigation uses a narrow themed scrollbar, preserving room for its content. Original user-supplied evidence: [dropdown](changelog/assets/unreleased/controls-dropdown-reported.png), [scrollbar](changelog/assets/unreleased/controls-scrollbar-reported.png). Those crops are not pixel-matched to the new captures.

Validation: production build, lint, automation type checks, architecture/reporting checks, six browser tests including all 64 accessibility states, and direct option selection/Escape checks in light/dark at 390px and 1280px. Desktop and mobile tests cover backdrop dismissal, inside padding, drag-out protection, and restored focus. Changes remain Unreleased without a version increment.

## Site-wide review

Reviewed overview, projects, suites, test explorer, execution history, reports, API workspace, and settings at 320, 768, and 1440 CSS pixels in light and dark themes. The browser acceptance suite additionally exercises run details, live monitoring, reruns, screenshot dialogs, JSON evidence, report access, credentials, and keyboard navigation. Its accessibility matrix covers 64 states at 390/768/1440px.

Completed corrections:

- Suite, member-edit, and rerun actions use wrapping groups with explicit spacing.
- Member tables become labeled cards on mobile, keeping edit buttons on-screen.
- Membership checklists have bounded scrolling, spaced checkboxes, and wrapping names.
- Split layouts no longer stretch editors to match long lists. The suite form appears first on mobile.
- Long names and evidence content stay within cards; dialogs fit short screens.
- Chart tooltips use the active theme and remain inside chart bounds; data tables have keyboard-accessible scrolling regions.

![Suite controls and editor in dark mode](changelog/assets/unreleased/site-audit-suites-desktop-dark.png)

The desktop editor remains at its natural height beside the suite list. [Original full-page capture](changelog/assets/unreleased/site-audit-suites-before.png) records the previous stretched panel; the after image focuses on the first viewport.

![Suite editor on a 320px phone viewport](changelog/assets/unreleased/site-audit-suites-mobile-light.png)

The form is reachable before the suite list and checkbox labels wrap within the panel.

![Member controls visible on a mobile screen in dark mode](changelog/assets/unreleased/site-audit-members-mobile-dark.png)

Member cards keep all fields and actions within the phone viewport. [Original settings capture at 320px](changelog/assets/unreleased/site-audit-settings-before.png) records the horizontally scrolling table; this focused after capture is 390px, so it is not a pixel-matched comparison.

![Theme-aware chart tooltip](changelog/assets/unreleased/site-audit-chart-dark.png)

The tooltip has a dark surface, readable labels, and stays inside the chart.

Verification: all 27 browser acceptance tests passed, including 64 accessibility states; the additional 48-route/theme/viewport scan found no overflowing controls. `npm run verify:quick`, architecture checks, and reporting/redaction checks passed. Eight infrastructure-dependent API checks are skipped locally and remain Linux CI gates. An initial concurrent verification attempt failed catalog initialization; the isolated discovery test and full subsequent verification passed. No product release version is assigned; GitHub source publication is distinct from deployment or a numbered release.

### Earlier refresh verification

Production build, lint, analytics filter/export and execution-history browser tests passed. Automated accessibility scans passed for the application's light/dark desktop/mobile states; keyboard skip-link, menu focus containment, Escape/focus restoration, and reduced-motion checks passed. Entrance animations keep text fully opaque to preserve contrast throughout the transition. Browser checks also verified all eight primary routes at 390px without horizontal overflow and animation suppression under reduced motion. No product version is assigned or published by this update.

## Layout corrections

### Searchable project picker

The active-project control opens a searchable dialog with wrapped names, current-project highlighting, alphabetical results, and a bounded scrolling area. Escape closes the picker and returns focus to its trigger while keeping the mobile navigation open. Selecting another project preserves the existing project-switch behavior.

![Searchable project picker in dark mode on mobile](changelog/assets/unreleased/project-picker-mobile.png)

Actual application capture at 390px. Search, empty results, project switching and persistence, mobile focus restoration, and dark-mode accessibility checks pass. Build and lint pass. No comparable automated before-state image was captured for this change.

Follow-up fixes reduce the logo size, add a 12px gap between wrapping project actions, and align service-health headings with their refresh action. Mobile navigation uses the same 72px offset as its header, omits the duplicate logo, and locks background scrolling while open.

![Project card with separated action buttons](changelog/assets/unreleased/layout-fixes-project-after.png)

Project actions retain spacing when they wrap onto separate lines.

![Service health with aligned heading and refresh action](changelog/assets/unreleased/layout-fixes-health-after.png)

The heading and action are vertically centered and wrap with a defined gap on narrow screens.

![Mobile drawer below the header without a duplicated logo](changelog/assets/unreleased/layout-fixes-menu-after.png)

The drawer clears the header even when opened after scrolling. These are actual post-fix captures; the attempted automated before-state capture failed at sign-in, so no comparable before images are claimed.

Build, lint, and browser checks passed. Projects and settings fit 320, 390, 768, and 1280px viewports without horizontal overflow.

## Mobile navigation and sign-in alignment

A dimmed backdrop now dismisses the mobile drawer when clicked. The drawer slides left and the backdrop fades over 180ms when closing through the backdrop, close icon, menu toggle, Escape, or a navigation link. Focus returns to the menu trigger. Reduced-motion preferences remove the transitions.

The sign-in card keeps equal automatic side margins at desktop, tablet, and phone sizes, including widths reached by browser zoom. Previously, the mobile margin override left-aligned the card whenever the available width was larger than its maximum width.

![Centered sign-in card at 840 CSS pixels](changelog/assets/unreleased/navigation-login-centered-840.png)

The card remains centered at the mobile breakpoint instead of attaching to the left side.

![Mobile drawer with an outside dismissal backdrop](changelog/assets/unreleased/navigation-login-drawer-open.png)

Actual browser closing sequence: [open](changelog/assets/unreleased/navigation-login-drawer-open.png), [mid-close](changelog/assets/unreleased/navigation-login-drawer-closing.png), [closed](changelog/assets/unreleased/navigation-login-drawer-closed.png). The middle capture pauses the real transition at 90ms for inspection.

Verification: production build, lint, automation type checks, test architecture/reporting checks, and five browser tests passed, including 64 accessibility states. Browser measurements confirm equal sign-in margins at 320, 390, 840, and 1280px. The mobile test checks real outside clicks, restored focus, and an active exit animation before the drawer hides. Changes remain Unreleased; no version increment or deployment is claimed.

## Execution-history sort headings

Replaced oversized outlined header buttons with compact, borderless sorting controls. A muted bidirectional arrow marks sortable columns, and the active column uses an accent-colored arrow showing ascending or descending order. Native buttons, keyboard focus, 44px touch targets, and `aria-sort` remain intact.

At typical mobile widths the four headings fit in one row. At widths of 380px or less they form a two-column grid to avoid cramped labels or horizontal scrolling.

![Previous dark mobile sort controls](changelog/assets/unreleased/history-sort-dark-390-before.png)

![Updated dark mobile sort controls](changelog/assets/unreleased/history-sort-dark-390-after.png)

These focused captures use the same 390px viewport and dark theme.

![Updated controls at 320px](changelog/assets/unreleased/history-sort-dark-320-after.png)

Narrow phones keep full labels and touch targets in two rows. Light and dark desktop/mobile screenshots were captured at 320, 390, and 1280px; none had page overflow.

Verification: production build, lint, four browser tests (including the 64-state accessibility matrix and keyboard sorting), and the six viewport/theme checks passed. Changes remain Unreleased; no version increment.

## Compact test and report cards

Test cards group the identifier and priority together, with a smaller source line and a concise Edit action. The accessible edit name still includes the test identifier. Report cards keep the execution link and report action together, with status and expiry beneath; links use the workspace colors and the report action has a clear external-link indicator. Routes, report authorization, and retention behavior are unchanged.

The mobile header now places a labeled sun/moon icon beside Menu. Desktop navigation retains an icon theme control next to Sign out. The header fits at 320px and theme changes persist as before.

Actual running application, dark theme at 768px, before and after:

![Test card before compact grouping](changelog/assets/unreleased/compact-explorer-before.png)
![Test card with grouped priority and concise edit action](changelog/assets/unreleased/compact-explorer-after.png)

![Report card before grouping](changelog/assets/unreleased/compact-reports-before.png)
![Report card with compact execution and status layout](changelog/assets/unreleased/compact-reports-after.png)

Actual 320px mobile report views show the theme icon, ready report action, and expiry in both themes:

![Compact light mobile header and report cards](changelog/assets/unreleased/compact-phone-light.png)
![Compact dark mobile header and report cards](changelog/assets/unreleased/compact-phone-dark.png)

Verification: six browser tests pass, including the 64-state accessibility matrix, catalog editing, project selection, and drawer dismissal/animation. Both routes have no document overflow at 320/390/768/1280px in light and dark themes; the icon switches themes correctly at 320px.

`npm run verify:quick` passes (lint, type checks, local API tests, seven web unit tests, and production build). Eight infrastructure tests remain skipped on Windows. The initial run overlapped browser setup and failed catalog initialization in two API tests; a separate full rerun passed. No release version is assigned; this remains an Unreleased development change.

## Report toolbar and notification bell

Report headings now span a full-width toolbar with a labeled refresh icon beside Action. Refresh is disabled while loading and clears stale errors before retrying. Table headers remain available to assistive technology.

Actual running dark interface at 768px, before and after (sample execution history can grow between captures):

![Reports with a separate refresh button and top notification disclosure](changelog/assets/unreleased/report-toolbar-before.png)
![Spaced report toolbar with refresh icon and bottom-right bell](changelog/assets/unreleased/report-toolbar-after.png)
![Report toolbar fitting a 320px phone in light mode](changelog/assets/unreleased/report-toolbar-phone.png)

The bell opens session history in an anchored panel. Its red badge counts unread entries in the retained history (up to 50); opening clears the count without deleting history. Entries arriving while open are read, and later entries restore the badge. The panel closes using its close icon, Escape, or an outside click. Visual toasts no longer interrupt the page; polite screen-reader announcements remain. Logging out clears session history.

Actual 390px captures after saving a sample project:

![Bottom-right bell with a red unread badge](changelog/assets/unreleased/notification-bell-dark.png)
![Opened dark notification panel with badge cleared](changelog/assets/unreleased/notification-panel-dark.png)
![Opened light notification panel](changelog/assets/unreleased/notification-panel-light.png)

Verification: `npm run verify:quick` passed, including eight web unit tests; eight infrastructure checks are skipped on Windows. Six browser tests passed, covering the 64-state light/dark accessibility matrix, notification unread/history behavior, outside/Escape dismissal, and mobile navigation. Open notification panels also passed automated accessibility scans in both themes. Report refresh and overflow checks passed at 320/390/768/1280px. Page Object architecture and reporting/redaction checks passed. No product version is assigned; these are Unreleased development changes.

## Execution summaries, filters, and button links

Execution summaries use compact status text and independent card heights. Frozen selections keep the count visible and put the complete test identifiers in a keyboard-accessible disclosure with bounded scrolling. Report actions wrap as buttons without changing their destinations or download behavior.

Actual running dark interface at 1280px, before and after:

![Tall execution summary with expanded test identifiers](changelog/assets/unreleased/run-summary-before.png)
![Compact execution summary with an expandable selection and report buttons](changelog/assets/unreleased/run-summary-after.png)

Filters now use a responsive grid with equal-height fields and a separate action row. Suite names stay on one line in the closed selector; the option menu retains the full text.

![Execution filters before alignment](changelog/assets/unreleased/run-filters-before.png)
![Aligned execution filters and grouped actions](changelog/assets/unreleased/run-filters-after.png)

Content links throughout the application now use bordered button surfaces, hover feedback, and visible keyboard focus. They remain semantic links so opening new tabs, copying destinations, and downloading evidence work normally. Primary actions, navigation items, and logo links keep their established presentation.

Actual 390px mobile views:

![Single-column light execution filters](changelog/assets/unreleased/run-filters-mobile-light.png)
![Compact dark execution summary and report buttons](changelog/assets/unreleased/run-summary-mobile-dark.png)

Verification: local lint, type checks, API tests, eight web unit tests, and production build pass; eight infrastructure tests remain skipped on Windows. Layout and link-style checks on overview, history, reports, explorer, and run details pass at 320/390/768/1280px in both themes, including opening the frozen selection. These are Unreleased development changes with no assigned product version.

Twelve browser tests passed, including the 64-state accessibility matrix, filter/sort behavior, cancellation, execution, mobile evidence viewing, reruns, authenticated report downloads, and report-history/investigation workflows.

## Notification panel refinement

The activity panel uses a compact title and session subtitle, a quiet icon-only close control with a 44px target, and notification rows with a small confirmation icon and timestamp. The bell has a subtle active state while the panel is open. Opening and closing use a short slide/fade; reduced-motion preferences disable transitions. Unread counting, keyboard focus, outside-click dismissal, and session history behavior are preserved.

Actual running interface at 390px after saving a sample project:

![Previous dark notification panel](changelog/assets/unreleased/notification-polish-dark-before.png)
![Refined dark notification panel with compact rows and close icon](changelog/assets/unreleased/notification-polish-dark-after.png)
![Refined light notification panel](changelog/assets/unreleased/notification-polish-light-after.png)

Local verification passes, including lint, type checks, API tests, eight web unit tests, and production build. Eight infrastructure checks remain skipped on Windows. Open-panel accessibility scans pass in light and dark mode. No product version is assigned; this remains an Unreleased UI refinement.

Three browser tests passed, including 64 accessibility states and notification unread/history dismissal behavior. The first attempt was interrupted by the local server becoming unavailable; the rerun passed once the server was available.

## Balanced execution summary

Execution phase and frozen selection now share an aligned two-column row. The Allure report spans the full width below them, with its status beside the heading and actions grouped in a wrapping row. Phones use a single column. This replaces the uneven three-column layout where report buttons made one card much taller than its neighbors.

Actual running dark interface at 1280px (sample execution data can change between captures):

![Uneven execution cards before rebalancing](changelog/assets/unreleased/balanced-summary-before.png)
![Aligned summary cards and full-width report actions](changelog/assets/unreleased/balanced-summary-after.png)

Actual 390px mobile layouts:

![Balanced execution cards in light mode on mobile](changelog/assets/unreleased/balanced-summary-mobile-light.png)
![Balanced execution cards in dark mode on mobile](changelog/assets/unreleased/balanced-summary-mobile-dark.png)

Layout and selection-expansion checks pass at 320/390/768/1280px in both themes. No product version is assigned; this is an Unreleased layout correction.

Local verification passes (lint, type checks, API tests, eight web unit tests, production build; eight Windows infrastructure skips). Six browser tests passed, including 64 accessibility states, execution, mobile evidence viewing, reruns, and evidence downloads.
