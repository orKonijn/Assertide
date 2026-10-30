# Playwright UI Test Architecture

All UI automation in Assertide must follow a strict Page Object Model architecture.

The goals are:

```text
Very short tests
Highly readable tests
Reusable Page Objects
Typed selectors and constants
Focused utilities
Clear separation of concerns
Minimal duplication
Stable selectors
Independent tests
Rich Allure reports
Useful screenshots and diagnostics
Easy maintenance
```

Someone reading either the source code or the Allure report should understand the tested behavior without needing to inspect low-level Playwright implementation details.

---

# 1. Page Object Model is mandatory

All non-trivial UI tests must use Page Object Model.

Tests must not directly contain large amounts of:

```ts
page.getByRole(...)
page.getByLabel(...)
page.locator(...)
page.goto(...)
```

Page-specific interactions belong inside Page Object classes.

Bad:

```ts
test('user can run a test suite', async ({ page }) => {
  await page.goto('/automation');

  await page
    .getByRole('button', { name: 'Smoke Tests' })
    .click();

  await page
    .getByRole('button', { name: 'Run' })
    .click();

  await expect(
    page.getByTestId('execution-status')
  ).toHaveText('Passed');
});
```

Prefer:

```ts
test('user can run a test suite', async () => {
  await automationPage.runSuite(TestSuites.SMOKE);

  await expect(
    automationPage.executionStatus
  ).toHaveText(TestRunStatuses.PASSED);
});
```

The spec communicates behavior.

The Page Object contains UI implementation details.

---

# 2. Tests should be as short as reasonably possible

Test bodies should normally contain only:

```text
Arrange
Act
Assert
```

with setup handled by hooks, fixtures, APIs, utilities, and Page Objects.

Ideal:

```ts
test('shows report after successful execution', async () => {
  await automationPage.runSuite(TestSuites.SMOKE);

  await automationPage.openLatestReport();

  await expect(reportPage.title).toBeVisible();
});
```

If a test becomes long, first determine whether:

- Setup belongs in `beforeEach`
- Suite preparation belongs in `beforeAll`
- UI behavior belongs in a Page Object
- Generic repeated logic belongs in a utility
- Test data belongs in a typed constant
- API setup belongs in an API utility or fixture

Do not shorten tests by hiding the entire scenario inside meaningless mega-methods.

Bad:

```ts
await automationPage.doEverythingAndVerifyItWorks();
```

---

# 3. Use test.describe

Tests must be logically grouped using:

```ts
test.describe()
```

Example:

```ts
test.describe('Automation execution', () => {
  ...
});
```

Nested describes are appropriate when they improve clarity:

```ts
test.describe('Automation execution', () => {
  test.describe('successful execution', () => {
    ...
  });

  test.describe('failed execution', () => {
    ...
  });
});
```

Do not use meaningless groups such as:

```ts
test.describe('Tests', ...)
```

Prefer domain language:

```text
Test suite execution
Allure reports
Authentication
Execution history
Projects
Settings
```

Usually one or two levels of nesting is enough.

---

# 4. Use beforeEach

Use:

```ts
test.beforeEach()
```

for setup required independently by each test.

Typical responsibilities:

- Create Page Objects
- Navigate to the feature
- Establish per-test state
- Create test-specific data
- Reset required state

Example:

```ts
test.describe('Automation execution', () => {
  let automationPage: AutomationPage;

  test.beforeEach(async ({ page }) => {
    automationPage = new AutomationPage(page);

    await automationPage.goto();
  });

  test('runs a smoke suite', async () => {
    await automationPage.runSuite(TestSuites.SMOKE);

    await expect(
      automationPage.executionStatus
    ).toHaveText(TestRunStatuses.PASSED);
  });
});
```

---

# 5. Use beforeAll deliberately

Use:

```ts
test.beforeAll()
```

for expensive setup that can safely happen once per worker or suite.

Good examples:

- Creating immutable backend seed data
- Creating reusable read-only resources
- Loading static configuration
- Preparing an external environment
- Worker-safe test preparation

Do not use `beforeAll` to share mutable browser state.

Do not share:

```text
Page
BrowserContext
mutable Page Objects
navigation state
mutable UI state
data changed by individual tests
```

Tests must remain independently runnable.

---

# 6. Preferred beforeAll + beforeEach structure

```ts
test.describe('Project automation', () => {
  let projectId: string;

  let projectPage: ProjectPage;
  let automationPage: AutomationPage;

  test.beforeAll(async ({ request }) => {
    projectId = await ProjectApiUtils.createProject(
      request,
      TestProjects.AUTOMATION
    );
  });

  test.beforeEach(async ({ page }) => {
    projectPage = new ProjectPage(page);
    automationPage = new AutomationPage(page);

    await projectPage.goto(projectId);
  });

  test('runs the smoke suite', async () => {
    await projectPage.openAutomation();

    await automationPage.runSuite(TestSuites.SMOKE);

    await expect(
      automationPage.executionStatus
    ).toHaveText(TestRunStatuses.PASSED);
  });
});
```

Responsibility:

```text
beforeAll
→ safe suite-level preparation

beforeEach
→ fresh browser/POM preparation

test
→ behavior + assertion
```

---

# 7. Constants must not be scattered through code

Repeated constants must not be hardcoded throughout:

- Tests
- Page Objects
- Fixtures
- Utilities

This includes:

- Selector IDs
- Test IDs
- Routes
- Status values
- Stable button labels when reused as automation contracts
- Environment names
- Suite names
- Test project names
- API paths
- Repeated test data
- Meaningful timeout/config values

Bad:

```ts
page.getByTestId('execution-status');
```

repeated throughout the project.

Prefer:

```ts
export const AutomationSelectors = {
  executionStatus: 'execution-status',
  reportButton: 'report-button',
  environmentSelector: 'environment-selector',
} as const;
```

Then:

```ts
page.getByTestId(
  AutomationSelectors.executionStatus
);
```

---

# 8. Selector constants belong in typed files

Selector definitions should live in dedicated typed files.

Preferred structure:

```text
tests/
  types/
    automation.selectors.ts
    authentication.selectors.ts
    reports.selectors.ts
    routes.ts
    test-data.ts
    test-statuses.ts
```

Example:

```ts
export const AutomationSelectors = {
  executionStatus: 'execution-status',
  environmentSelector: 'environment-selector',
  reportButton: 'report-button',
} as const;

export type AutomationSelector =
  typeof AutomationSelectors[
    keyof typeof AutomationSelectors
  ];
```

Do not scatter raw selector strings throughout POM methods.

---

# 9. Prefer feature-specific selector files

Avoid one giant:

```text
selectors.ts
```

containing every selector.

Prefer:

```text
automation.selectors.ts
projects.selectors.ts
authentication.selectors.ts
reports.selectors.ts
```

---

# 10. Do not over-centralize every UI string

Not every visible word needs to become a constant.

Centralize primarily:

- Stable automation contracts
- Repeated values
- Selectors
- Routes
- Statuses
- Domain values
- Shared test data

Do not create absurd constants such as:

```ts
const THE_WORD_OK = 'OK';
```

---

# 11. Use typed domain constants

Example:

```ts
export const TestRunStatuses = {
  QUEUED: 'Queued',
  RUNNING: 'Running',
  PASSED: 'Passed',
  FAILED: 'Failed',
} as const;

export type TestRunStatus =
  typeof TestRunStatuses[
    keyof typeof TestRunStatuses
  ];
```

Then:

```ts
await expect(
  automationPage.executionStatus
).toHaveText(TestRunStatuses.PASSED);
```

---

# 12. Routes should be constants

Avoid repeating:

```ts
await page.goto('/automation');
```

throughout POMs.

Prefer:

```ts
export const TestRoutes = {
  automation: '/automation',
  projects: '/projects',
  reports: '/reports',
} as const;
```

---

# 13. Test data should be centralized where appropriate

Example:

```ts
export const TestSuites = {
  SMOKE: 'Smoke Tests',
  REGRESSION: 'Regression Tests',
  API: 'API Tests',
} as const;
```

Dynamic test data should be generated through utilities when uniqueness matters.

---

# 14. Use utilities

Reusable non-page-specific logic belongs in focused utilities.

Good utility responsibilities:

- Unique data generation
- API setup
- Date formatting
- File handling
- Environment helpers
- URL building
- Test-data factories
- JSON helpers
- Cleanup helpers

Suggested structure:

```text
tests/
  utils/
    api.utils.ts
    test-data.utils.ts
    date.utils.ts
    environment.utils.ts
    file.utils.ts
    allure.utils.ts
```

---

# 15. Utilities must remain focused

Avoid generic:

```text
utils.ts
helpers.ts
common.ts
everything.utils.ts
```

Prefer focused modules.

---

# 16. Do not put page behavior in utils

Bad:

```ts
export async function clickRunButton(
  page: Page
): Promise<void> {
  await page.getByRole(
    'button',
    { name: 'Run tests' }
  ).click();
}
```

That belongs in `AutomationPage`.

Good utility:

```ts
export function createUniqueProjectName(): string {
  return `project-${Date.now()}-${crypto.randomUUID()}`;
}
```

Rule:

```text
UI interaction
→ Page Object

Generic reusable logic
→ Utility

Stable selectors and values
→ Types/constants
```

---

# 17. POM structure must be readable

Preferred ordering:

```text
imports
↓
class declaration
↓
dependencies
↓
locators
↓
constructor
↓
navigation
↓
public user actions
↓
small private helpers
```

POM code should be easy to scan.

---

# 18. POM methods should model user behavior

Good:

```text
login()
logout()
runSuite()
openReport()
createProject()
deleteProject()
retryExecution()
selectEnvironment()
```

Bad:

```text
clickButton()
clickElement()
fillField()
doAction()
handlePage()
```

POM APIs should use Assertide's domain language.

---

# 19. Keep locators readable

Good:

```ts
readonly emailInput: Locator;
readonly passwordInput: Locator;
readonly loginButton: Locator;
readonly executionStatus: Locator;
readonly reportButton: Locator;
```

Bad:

```ts
readonly btn: Locator;
readonly el: Locator;
readonly locator1: Locator;
```

---

# 20. Prefer user-facing locators

Inside POMs prefer:

1. `getByRole`
2. `getByLabel`
3. `getByPlaceholder`
4. `getByText`
5. `getByTestId`
6. CSS only when necessary

Avoid brittle CSS and XPath.

---

# 21. Use component objects where appropriate

Reusable complex UI areas may have their own objects:

```text
NavigationComponent
SidebarComponent
TestRunTable
EnvironmentSelector
ExecutionDialog
ToastComponent
```

Prefer composition over deep inheritance.

---

# 22. Avoid unnecessary BasePage hierarchies

Avoid:

```text
BasePage
↓
AuthenticatedBasePage
↓
DashboardBasePage
↓
AutomationPage
```

unless inheritance solves a real problem.

Prefer composition.

---

# 23. Tests should read like specifications

Ideal:

```ts
test('user can retry a failed execution', async () => {
  await executionPage.retry();

  await expect(
    executionPage.status
  ).toHaveText(TestRunStatuses.RUNNING);
});
```

A reader should understand:

```text
action
↓
expected result
```

immediately.

---

# 24. Keep assertions visible

Prefer:

```ts
await automationPage.runSuite(TestSuites.SMOKE);

await expect(
  automationPage.executionStatus
).toHaveText(TestRunStatuses.PASSED);
```

Avoid:

```ts
await automationPage.verifyEverything();
```

POM exposes state.

Specs assert state.

---

# 25. Avoid raw page usage in tests

Once Page Objects are initialized, test bodies should rarely access:

```ts
page
```

directly.

If an interaction belongs to a feature, put it in its Page Object.

---

# 26. Keep POM methods small

POM methods should represent one meaningful user action or workflow.

Composed actions are acceptable.

Avoid giant methods containing entire scenarios.

---

# 27. Preferred test architecture

```text
tests/
  ui/
    authentication/
      authentication.spec.ts

    automation/
      execution.spec.ts
      reports.spec.ts

  pages/
    login.page.ts
    automation.page.ts
    reports.page.ts

  components/
    navigation.component.ts
    test-run-table.component.ts

  types/
    automation.selectors.ts
    authentication.selectors.ts
    routes.ts
    test-data.ts
    test-statuses.ts

  utils/
    api.utils.ts
    test-data.utils.ts
    date.utils.ts
    environment.utils.ts
    allure.utils.ts

  fixtures/
    test.fixture.ts
```

Adapt this to the existing Assertide structure.

---

# 28. One feature per spec file

Prefer:

```text
authentication.spec.ts
test-execution.spec.ts
execution-history.spec.ts
allure-report.spec.ts
```

Avoid one giant:

```text
app.spec.ts
```

---

# 29. Keep hooks readable

If `beforeEach` or `beforeAll` becomes large:

- Extract API setup into utilities
- Extract UI actions into Page Objects
- Move data creation into utilities
- Use fixtures where appropriate

Hooks should communicate setup intent.

---

# 30. Avoid serial dependencies

Do not build:

```text
Test 1 creates resource
Test 2 edits it
Test 3 deletes it
```

with cross-test dependencies.

Each test should normally own its state.

---

# 31. POM constructors should not perform actions

Bad:

```ts
constructor(page: Page) {
  this.page = page;
  page.goto('/automation');
}
```

Good:

```ts
constructor(
  private readonly page: Page
) {}
```

Navigation should be explicit.

---

# 32. Strict typing

Avoid:

```ts
page: any
selector: any
data: any
```

Use proper Playwright and domain types.

---

# 33. No arbitrary waits

Never use:

```ts
await page.waitForTimeout(5000);
```

to stabilize tests.

Use:

- Auto-waiting
- Web-first assertions
- Relevant network responses
- Actual application state

---

# 34. Authentication

Do not perform full UI login before every unrelated test.

Use:

- `storageState`
- Authentication fixtures
- Playwright setup projects

where appropriate.

---

# 35. Prefer API setup for unrelated prerequisites

Example:

```text
API utility creates project
↓
POM opens project
↓
test verifies UI feature
```

Do not spend many UI actions creating unrelated prerequisites.

---

# 36. Test names describe behavior

Good:

```ts
test(
  'shows passed status after successful execution',
  async () => {
    ...
  }
);
```

Bad:

```ts
test('test 1', ...)
test('execution test', ...)
```

---

# 37. Allure reports are a product-quality artifact

The Allure report must not look like raw automation logs.

It should read like professional QA documentation.

Someone who did not write the test should be able to understand:

```text
What feature was tested?
What scenario ran?
What environment was used?
What happened?
What data was used?
What failed?
What did the UI look like?
How can the issue be reproduced?
```

The report should be useful to:

- QA engineers
- Developers
- Team leads
- Product owners
- Reviewers
- CI investigators

---

# 38. Allure hierarchy

Organize tests using meaningful Allure hierarchy.

Preferred structure:

```text
Epic
↓
Feature
↓
Story
↓
Suite
↓
Test
```

Example:

```text
Epic:
Test Automation

Feature:
Execution

Story:
Run Playwright Suites

Suite:
Successful Execution

Test:
shows passed status after successful execution
```

Do not use meaningless values such as:

```text
Epic: Tests
Feature: UI
Suite: Suite 1
```

Use Assertide product/domain terminology.

---

# 39. Allure labels should describe the feature

Where supported, add meaningful labels such as:

```text
epic
feature
story
suite
subSuite
severity
owner
tag
```

Example:

```ts
await allure.epic('Test Automation');
await allure.feature('Execution');
await allure.story('Run Playwright Suite');
await allure.severity('critical');
await allure.owner('QA Automation');
```

Adapt syntax to the actual Allure Playwright integration installed in the repository.

Do not invent APIs without checking the installed package.

---

# 40. Test titles must be human-readable

The Allure test title should usually be the Playwright test title.

Good:

```text
shows passed status after successful execution
```

Bad:

```text
TC_001
test1
automation test
runSuiteTest
```

If test IDs are required, include them separately as metadata rather than replacing the readable title.

Example:

```text
Test ID: AUT-142
Title: shows passed status after successful execution
```

---

# 41. Add a useful test description

Important tests should include a concise description.

A useful description explains:

- Goal
- Preconditions
- Expected outcome

Example:

```text
Verifies that an authenticated user can run the Smoke Tests suite
from the Automation page and that Assertide displays the execution
as Passed after completion.
```

Do not write descriptions that simply repeat the test title.

---

# 42. Allure steps must represent meaningful user actions

Use Allure steps for important actions.

Good:

```text
Open Automation page
Select Smoke Tests suite
Start test execution
Wait for execution to complete
Verify Passed status
Open generated report
```

Bad:

```text
Click button
Wait
Find element
Fill field
Click element
Wait 500 ms
```

Steps should use domain language.

---

# 43. Page Object methods may create Allure steps

POM methods that represent meaningful user workflows may wrap their behavior in an Allure step.

Example concept:

```ts
async runSuite(
  suiteName: string
): Promise<void> {
  await allure.step(
    `Run suite: ${suiteName}`,
    async () => {
      await this.selectSuite(suiteName);
      await this.runSelectedSuite();
    }
  );
}
```

This makes the report readable while keeping spec files short.

Do not wrap every locator operation in its own step.

---

# 44. Avoid excessive Allure steps

Bad:

```text
Get run button
Click run button
Get status
Read status text
Compare status
```

Good:

```text
Run Smoke Tests suite
Verify execution completed successfully
```

Allure should explain workflows, not Playwright internals.

---

# 45. Allure step nesting

Use shallow, meaningful nesting.

Example:

```text
Run Smoke Tests suite
  ├─ Select Smoke Tests
  └─ Start execution

Verify execution
  ├─ Wait for completion
  └─ Verify status is Passed
```

Avoid five or six levels of nested steps.

Usually one or two levels is enough.

---

# 46. Every failed UI test should have a screenshot

On UI test failure, attach a screenshot to Allure.

The screenshot should show the actual browser state when the failure occurred.

Configure Playwright appropriately, for example:

```ts
screenshot: 'only-on-failure'
```

Additionally, ensure the screenshot is available or attached within the Allure report.

The goal is that a reviewer can open the failed test and immediately see:

```text
What was displayed on screen?
Was the expected element missing?
Was a modal blocking the page?
Was the wrong page open?
Was there an error banner?
```

---

# 47. Use descriptive screenshot names

Avoid:

```text
screenshot.png
image1.png
test.png
```

Prefer:

```text
failure-state.png
automation-before-run.png
execution-failed.png
report-page.png
validation-error.png
```

For multiple screenshots:

```text
01-automation-page.png
02-suite-selected.png
03-execution-result.png
```

Names should describe what the image shows.

---

# 48. Add screenshots at meaningful milestones

Screenshots may also be added for important successful flows.

Examples:

```text
After successful login
After test suite selection
After execution completes
After report loads
After an important configuration change
```

Do not take a screenshot after every click.

Screenshots should add diagnostic or documentation value.

---

# 49. Screenshot utility

If screenshot attachment logic is reused, implement it in a focused utility.

Example structure:

```text
tests/
  utils/
    allure.utils.ts
```

Conceptually:

```ts
export class AllureUtils {
  static async attachScreenshot(
    page: Page,
    name: string
  ): Promise<void> {
    const screenshot = await page.screenshot({
      fullPage: true,
    });

    await allure.attachment(
      name,
      screenshot,
      'image/png'
    );
  }
}
```

Use the actual API provided by the repository's installed Allure package.

Do not duplicate screenshot attachment code across tests.

---

# 50. Failure screenshots should capture useful context

Default failure screenshot behavior should generally capture enough of the page to diagnose the issue.

Use:

```text
full page
```

when helpful.

For very large pages, use viewport screenshots when they provide clearer diagnostics.

Do not crop away the relevant failure state.

---

# 51. Attach Playwright traces

For failed or retried tests, preserve Playwright trace artifacts.

A useful configuration commonly includes:

```ts
trace: 'on-first-retry'
```

or another repository-appropriate strategy.

The Allure report should provide a clear way to locate related trace artifacts when available.

Trace information is especially useful for:

- Timing issues
- Navigation problems
- Network failures
- Unexpected DOM state
- Flaky tests

---

# 52. Attach videos when useful

A common Playwright configuration is:

```ts
video: 'retain-on-failure'
```

Retain videos only when they provide useful debugging value.

Do not generate and permanently store videos for every successful test unless explicitly required.

When a failure video exists, make it accessible with the report or CI artifacts.

---

# 53. Attach relevant API information

For UI workflows involving important API requests, useful failure diagnostics may include:

```text
Request method
Request URL
Sanitized request body
Response status
Sanitized response body
```

Do not attach every network request.

Attach only requests that help explain the scenario or failure.

---

# 54. Never expose secrets in Allure

Before attaching requests, responses, logs, or screenshots, remove sensitive data.

Never expose:

```text
Passwords
Authorization headers
Bearer tokens
Cookies
API keys
Refresh tokens
Private credentials
Sensitive personal information
```

Redact values where necessary.

Example:

```json
{
  "authorization": "[REDACTED]"
}
```

Allure reports may be retained as CI artifacts and should be treated accordingly.

---

# 55. Attach relevant test data

Where useful, attach or display meaningful test data.

Example:

```text
Project:
Assertide Automation 92841

Suite:
Smoke Tests

Environment:
Staging

Browser:
Chromium

User role:
QA Admin
```

Do not dump giant unstructured objects into the report.

Only include data useful for reproducing or understanding the test.

---

# 56. Environment information

Allure should expose enough environment information to reproduce failures.

Include, where available:

```text
Application environment
Base URL
Browser
Browser version
Operating system
Node.js version
Playwright version
Angular application version
Assertide version
Commit SHA
Branch
CI build/run ID
```

Do not include secrets.

---

# 57. Create environment.properties or equivalent

If supported by the Allure setup, generate environment information for each run.

Conceptual result:

```text
Environment
-----------
Application = Assertide
Environment = Staging
Browser = Chromium
Branch = feature/new-runner
Commit = 9f32abc
Node = 22.x
Playwright = x.x.x
```

Generate this automatically where possible.

Do not manually maintain values likely to become stale.

---

# 58. Add executor information in CI

Where supported, Allure should identify the execution source.

Example:

```text
Executor:
GitHub Actions

Build:
#184

Branch:
main

Commit:
9f32abc
```

Where possible provide a link back to:

- GitHub Actions run
- Pull Request
- Commit

This makes failed reports much easier to investigate.

---

# 59. Add meaningful severity

Use severity where it adds value.

Example guidance:

```text
blocker
→ application cannot perform a core workflow

critical
→ essential business/automation path

normal
→ standard feature behavior

minor
→ secondary behavior

trivial
→ low-impact cosmetic behavior
```

Do not mark every test `critical`.

Severity should communicate impact.

---

# 60. Use useful tags

Tags may include:

```text
@smoke
@regression
@critical
@authentication
@automation
@reports
```

Keep tags deliberate and consistent.

Do not create dozens of overlapping tag systems.

---

# 61. Expected Allure test page layout

A good individual test report should effectively read like:

```text
------------------------------------------------
shows passed status after successful execution
------------------------------------------------

Status:
PASSED

Epic:
Test Automation

Feature:
Execution

Story:
Run Playwright Suite

Severity:
Critical

Environment:
Staging

Browser:
Chromium

Description:
Verifies that an authenticated user can execute
the Smoke Tests suite and receive a Passed status.

Steps:

✓ Open Automation page

✓ Run suite: Smoke Tests
    ✓ Select Smoke Tests
    ✓ Start execution

✓ Verify execution
    ✓ Wait for completion
    ✓ Status is Passed

Attachments:

📷 execution-result.png

Test Data:
Project: Assertide Automation 92841
Suite: Smoke Tests
Environment: Staging

Duration:
4.8s
```

This is the quality target.

---

# 62. Expected failed Allure test layout

A failed report should provide substantially more diagnostic information.

Example:

```text
------------------------------------------------
shows failed status when execution fails
------------------------------------------------

Status:
FAILED

Feature:
Execution

Environment:
Staging

Browser:
Chromium

Failure:

Expected:
"Failed"

Received:
"Running"

Failure Location:
execution.spec.ts:82

Steps:

✓ Open Automation page

✓ Run suite: Broken Suite

✗ Verify failed status
    Expected "Failed"
    Received "Running"

Attachments:

📷 failure-state.png
🎥 failure-video.webm
🧭 playwright-trace.zip
📄 request.json
📄 response.json

Test Data:

Project:
Assertide Automation 38192

Suite:
Broken Suite

Execution ID:
RUN-8912
```

The report should allow investigation without immediately rerunning the test.

---

# 63. Screenshot placement in the report

Screenshots should be attached directly to the relevant test or step.

Where possible:

```text
Step: Run suite
  → suite-selected.png

Step: Verify execution
  → execution-result.png
```

A screenshot should be attached near the action it documents.

Do not create an unrelated dump of images with no context.

---

# 64. Screenshot quality

Screenshots must:

- Be readable
- Capture the relevant state
- Avoid unnecessary browser chrome where possible
- Use consistent viewport sizes
- Avoid sensitive information
- Show error banners/modal states where relevant

For documentation screenshots, prefer consistent dimensions.

For failure screenshots, diagnostic value takes priority.

---

# 65. Screenshot before destructive actions when useful

For tests involving destructive or difficult-to-reproduce workflows, consider taking a screenshot before the important action.

Example:

```text
Before deleting project
Before cancelling execution
Before submitting complex configuration
```

Only do this when it provides genuine diagnostic value.

---

# 66. Attach console errors on failure

If browser console errors are captured by the framework, attach relevant errors to failed Allure tests.

Example:

```text
Browser Console Errors

[ERROR]
Failed to fetch /api/executions/8912

[ERROR]
TypeError: Cannot read properties of undefined
```

Do not attach massive noisy logs containing irrelevant messages.

Filter for useful diagnostics.

---

# 67. Attach page URL on failure

Failed reports should make the current URL visible.

Example:

```text
Current URL:
https://staging.assertide.app/automation/executions/8912
```

This is useful for:

- Wrong redirects
- Routing bugs
- Authentication failures
- Incorrect navigation

---

# 68. Attach failure context automatically

Create an Allure utility/helper capable of attaching relevant failure context.

Conceptually:

```text
Failure context
├── screenshot
├── current URL
├── console errors
├── test data
├── relevant API response
└── trace/video reference
```

Avoid repeating this manually in every test.

Use hooks, fixtures, or reporters where appropriate.

---

# 69. Do not hide failures behind screenshots

Screenshots supplement assertions.

They do not replace them.

Bad:

```ts
await page.screenshot();
```

with no assertion.

Good:

```ts
await expect(
  automationPage.executionStatus
).toHaveText(TestRunStatuses.PASSED);
```

with screenshot attached on failure or meaningful milestone.

---

# 70. Allure history and trends

When CI infrastructure supports it, preserve Allure history between runs so reports can show:

- Pass-rate trends
- Duration trends
- Flaky tests
- Failure history
- Historical executions

Do not discard Allure history unnecessarily between CI runs.

---

# 71. Flaky tests should be visible

If Allure detects a test repeatedly failing and passing across runs, use that information to identify flaky automation.

Do not normalize flaky tests as acceptable.

Track recurring failures and fix root causes.

---

# 72. Categories for failures

If supported, configure useful Allure categories such as:

```text
Product defect
Test defect
Timeout
Network failure
Authentication failure
Assertion failure
Environment failure
```

Avoid overcomplicated categorization.

The goal is faster triage.

---

# 73. Allure report landing page

The overall report should make it easy to see:

```text
Total tests
Passed
Failed
Broken
Skipped
Flaky
Duration
Suites
Features
Severity
Trends
Environment
Executor
```

A reviewer should immediately understand the health of the run.

---

# 74. Report naming

Use meaningful report/run names.

Prefer:

```text
Assertide UI Regression — Chromium — Staging
Assertide Smoke Tests — Pull Request #142
Assertide Main Branch Regression — Build #184
```

Avoid:

```text
Report
Test Results
Run 1
```

---

# 75. CI artifact structure

Where practical, CI should retain:

```text
allure-results/
allure-report/
playwright-report/
test-results/
```

along with relevant:

```text
screenshots
traces
failure videos
```

Retention should follow repository/CI policy.

Do not commit generated reports to Git unless that is explicitly the project strategy.

---

# 76. Do not attach excessive data

Allure should remain useful and performant.

Do not attach:

```text
full application logs for every passing test
screenshots after every click
all network traffic
videos for every successful test
huge JSON objects
```

Use richer diagnostics primarily:

- On failure
- On retry
- At important milestones
- For critical flows

---

# 77. Allure naming consistency

Use one naming style across the project.

Example:

```text
Epic:
Test Automation

Features:
Authentication
Projects
Execution
Reports
Settings

Stories:
Login
Create Project
Run Test Suite
Retry Execution
Open Allure Report
```

Do not vary between:

```text
Test Execution
Execution Tests
Execute Tests
Runner
Automation Runner
```

for the same domain concept.

---

# 78. Allure utility responsibilities

A focused `allure.utils.ts` may provide functionality such as:

```text
attachScreenshot()
attachJson()
attachText()
attachFailureContext()
attachEnvironment()
redactSensitiveData()
```

Do not put UI navigation or Page Object behavior inside Allure utilities.

---

# 79. POM + Allure relationship

The Page Object may report meaningful workflow steps.

Example:

```text
AutomationPage.runSuite()
→ Allure step: "Run suite: Smoke Tests"
```

but Page Objects should not contain unrelated report-generation logic.

Keep reporting helpers reusable and focused.

---

# 80. Test + Allure relationship

The spec should still clearly show the assertions.

Example:

```ts
test(
  'shows passed status after successful execution',
  async () => {
    await allure.description(
      'Verifies successful Playwright suite execution.'
    );

    await automationPage.runSuite(
      TestSuites.SMOKE
    );

    await allure.step(
      'Verify execution completed successfully',
      async () => {
        await expect(
          automationPage.executionStatus
        ).toHaveText(
          TestRunStatuses.PASSED
        );
      }
    );
  }
);
```

Do not allow Allure integration to make tests significantly harder to read.

---

# 81. Prefer reusable Allure wrappers where appropriate

If metadata setup is repeated across many tests, extract a focused helper.

Conceptually:

```ts
await AllureUtils.setTestMetadata({
  epic: 'Test Automation',
  feature: 'Execution',
  story: 'Run Test Suite',
  severity: 'critical',
});
```

Do not repeat six identical metadata calls in hundreds of specs.

---

# 82. Allure screenshots for successful critical tests

For critical smoke workflows, consider attaching final-state screenshots even on success.

Useful examples:

```text
Login successful
Dashboard loaded
Execution passed
Allure report opened
```

This can make CI reports valuable as visual evidence.

Do not apply this indiscriminately to every regression test.

---

# 83. Test IDs

If Assertide uses test-case IDs, expose them as metadata.

Example:

```text
Test ID:
AUT-142
```

Keep readable names as the primary title.

Avoid:

```text
AUT-142
```

as the entire test title.

---

# 84. Links to requirements/issues

Where useful, link Allure tests to:

- GitHub Issue
- Requirement
- Bug
- Pull Request
- External test case

Example concept:

```text
Issue:
#142

Requirement:
AUTOMATION-12
```

Do not add links that are stale or meaningless.

---

# 85. Expected report quality standard

Before considering the automation complete, ask:

```text
Can a developer understand why this test failed
without opening the test source?

Can they see the UI state?

Can they identify the environment?

Can they identify the test data?

Can they find the trace/video?

Can they understand the user steps?

Are secrets protected?

Does the report use product terminology?

Would this report be useful in a PR review?
```

If not, improve the reporting.

---

# 86. Complete architecture

The intended dependency direction is:

```text
Spec
↓
Page Object
↓
Typed selectors / constants

Spec / Hooks
↓
Utilities
↓
API / data / environment helpers

Spec / POM
↓
Allure metadata and meaningful steps

Failure handling
↓
AllureUtils
↓
Screenshot / logs / trace / context
```

---

# 87. Separation of responsibilities

Always follow:

```text
Spec
→ scenario + assertions

Page Object
→ UI interactions + locators

Component Object
→ reusable UI component behavior

Types / Constants
→ selectors, routes, statuses,
   stable values and contracts

Utils
→ reusable non-UI logic

Fixtures
→ Playwright dependency/setup composition

Allure Utils
→ reporting, attachments,
   screenshots and diagnostics
```

Do not blur these responsibilities.

---

# 88. UI test review checklist

Every new or modified UI test should satisfy:

- [ ] Uses Page Object Model
- [ ] Uses `test.describe`
- [ ] Uses `beforeEach` for shared per-test setup
- [ ] Uses `beforeAll` when legitimate suite-level setup exists
- [ ] `beforeAll` does not create unsafe mutable browser state
- [ ] Test bodies are short
- [ ] Test bodies are readable
- [ ] Assertions remain visible
- [ ] Page Object methods use domain language
- [ ] Page Objects are focused
- [ ] Page Objects are strongly typed
- [ ] Constructors contain no navigation/actions
- [ ] Reusable selectors are defined in typed selector files
- [ ] Routes are centralized
- [ ] Shared domain constants are typed
- [ ] Reusable test data is centralized
- [ ] Dynamic test data uses utilities
- [ ] Generic repeated logic uses focused utilities
- [ ] Utilities contain no page-specific UI actions
- [ ] No giant generic utility file exists
- [ ] No unnecessary BasePage hierarchy
- [ ] No brittle CSS/XPath selectors unless unavoidable
- [ ] No arbitrary sleeps
- [ ] Tests are isolated
- [ ] No unnecessary serial mode
- [ ] Authentication setup is reusable
- [ ] API setup is used for unrelated prerequisites
- [ ] Strict TypeScript is preserved
- [ ] No unnecessary `any`
- [ ] Allure hierarchy is meaningful
- [ ] Allure title is human-readable
- [ ] Important tests have useful descriptions
- [ ] Allure steps use product/domain language
- [ ] No low-level step spam
- [ ] Failure screenshot is available
- [ ] Trace is retained where configured
- [ ] Failure video is retained where configured
- [ ] Current URL is available on failure
- [ ] Relevant test data is attached
- [ ] Sensitive data is redacted
- [ ] Environment metadata is available
- [ ] CI/executor metadata is available
- [ ] Critical tests contain useful evidence where appropriate
- [ ] Report is understandable without reading source code

---

# 89. Refactoring existing tests

When touching an existing UI test that violates these conventions, improve the related architecture where reasonably within scope.

Example:

```text
Before

40-line test
+ inline selectors
+ hardcoded routes
+ repeated setup
+ duplicated test data
+ meaningless Allure output

After

short spec
+ POM
+ typed selectors
+ typed constants
+ focused utils
+ beforeEach / beforeAll
+ meaningful Allure hierarchy
+ readable steps
+ screenshots and diagnostics
```

Do not turn a small feature PR into a repository-wide rewrite.

---

# 90. Core architecture principle

The spec answers:

```text
What is the user doing?
What should happen?
```

The Page Object answers:

```text
How is the interaction performed?
Where is the UI element?
```

Types/constants answer:

```text
What stable selectors, routes,
statuses and domain values exist?
```

Utilities answer:

```text
What generic reusable logic
is shared by multiple tests?
```

Fixtures answer:

```text
How are Playwright dependencies
and reusable contexts composed?
```

Allure answers:

```text
What happened during execution?
What did the user workflow look like?
What evidence exists?
Why did the test fail?
How can someone investigate it?
```

Each responsibility should have one obvious home.

---

# 91. Final rule

When deciding whether a Playwright UI test is complete, ask:

```text
Can I understand the scenario
without reading selectors?

Are selector values centralized?

Can UI structure change
without rewriting every spec?

Are reusable operations
implemented once?

Are utilities focused?

Can the test run independently?

Does the Page Object describe
real Assertide behavior?

Does the test read like
a specification?

Does the Allure report read like
professional QA documentation?

If it fails, can I diagnose it
from screenshots, steps, metadata,
logs and traces?
```

The desired Assertide UI automation architecture is:

```text
describe
↓
beforeAll
safe suite preparation
↓
beforeEach
fresh POM/test setup
↓
short readable test
↓
Page Object domain action
↓
typed selectors/constants
↓
focused utilities
↓
visible assertion
↓
meaningful Allure steps
↓
screenshots + diagnostics
```

Tests should be boring to read.

Reports should be rich to investigate.

That is a feature.

Complexity should live in the correct reusable layer—not duplicated throughout spec files.