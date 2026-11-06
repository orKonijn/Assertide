import { type BrowserContext, chromium, type Page, type TestInfo } from '@playwright/test';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import puppeteer, { type Browser as BenchmarkBrowser } from 'puppeteer-core';

/** The server/worker permit one case only; preserve final evidence before releasing its browser. */
async function releaseFunctionalBrowser(
  page: Page,
): Promise<Awaited<ReturnType<BrowserContext['storageState']>> | null> {
  try {
    const context = page.context();
    const state = await context.storageState();
    const browser = context.browser();
    if (!browser) {
      return null;
    }
    await context.close();
    await browser.close();
    return state;
  } catch {
    return null;
  }
}

/** Fixed, opt-in laboratory profile. Raw Lighthouse reports never become attachments. */
export async function captureRunPerformance(
  page: Page,
  info: TestInfo,
  sensitive: boolean,
): Promise<void> {
  if (process.env['RUN_PERFORMANCE'] !== 'true') {
    return;
  }
  const approved = 'http://127.0.0.1:4013/inventory.html';
  let reason = 'measurement-failed';
  if (sensitive || info.project.name !== 'chromium' || !info.title.startsWith('UI-001 ')) {
    reason = 'profile-not-supported';
  } else if (page.isClosed() || page.url() !== approved) {
    reason = 'target-not-approved';
  } else {
    const state = await releaseFunctionalBrowser(page);
    const chrome = state
      ? await launch({
          chromePath: chromium.executablePath(),
          chromeFlags: [
            '--headless',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--remote-debugging-address=127.0.0.1',
          ],
          handleSIGINT: false,
          logLevel: 'silent',
        }).catch(() => null)
      : null;
    if (chrome && state) {
      let benchmark: BenchmarkBrowser | undefined;
      let deadlineExpired = false;
      const deadline = setTimeout(() => {
        deadlineExpired = true;
        chrome.kill();
      }, 150_000);
      try {
        const browser = await puppeteer.connect({
          browserURL: `http://127.0.0.1:${chrome.port}`,
          defaultViewport: null,
        });
        benchmark = browser;
        const context = browser.defaultBrowserContext();
        if (state.cookies.length) {
          await context.setCookie(
            ...state.cookies.map(
              ({ name, value, domain, path, expires, httpOnly, secure, sameSite }) => ({
                name,
                value,
                domain,
                path,
                expires,
                httpOnly,
                secure,
                sameSite,
              }),
            ),
          );
        }
        const setup = await context.newPage();
        await setup.goto('http://127.0.0.1:4013/');
        const storage = state.origins.find((origin) => origin.origin === 'http://127.0.0.1:4013');
        await setup.evaluate((entries) => {
          for (const entry of entries) {
            localStorage.setItem(entry.name, entry.value);
          }
        }, storage?.localStorage ?? []);
        // Keep only one renderer active: launcher/setup tabs otherwise overlap Lighthouse's tab.
        for (const open of await context.pages()) {
          await open.close();
        }
        const reports = [];
        for (let sample = 0; sample < 3; sample++) {
          const cachePage = await context.newPage();
          const network = await cachePage.createCDPSession();
          await network.send('Network.clearBrowserCache');
          await network.detach();
          await cachePage.close();
          const result = await lighthouse(approved, {
            port: chrome.port,
            logLevel: 'silent',
            output: 'json',
            onlyAudits: [
              'largest-contentful-paint',
              'cumulative-layout-shift',
              'total-blocking-time',
              'total-byte-weight',
            ],
            disableStorageReset: true,
            formFactor: 'desktop',
            screenEmulation: {
              mobile: false,
              width: 1350,
              height: 940,
              deviceScaleFactor: 1,
              disabled: false,
            },
            throttlingMethod: 'simulate',
            throttling: { rttMs: 40, throughputKbps: 10_240, cpuSlowdownMultiplier: 1 },
            maxWaitForLoad: 15_000,
            maxWaitForFcp: 15_000,
          });
          if (!result) {
            throw new Error('Benchmark returned no measurements');
          }
          const report = result.lhr;
          // Build an allowlist before Playwright/Allure sees anything. No DOM, diagnostics or images.
          reports.push({
            gatherMode: report.gatherMode,
            requestedUrl: report.requestedUrl,
            finalDisplayedUrl: report.finalDisplayedUrl,
            fetchTime: report.fetchTime,
            lighthouseVersion: report.lighthouseVersion,
            configSettings: {
              formFactor: report.configSettings.formFactor,
              screenEmulation: report.configSettings.screenEmulation,
              throttlingMethod: report.configSettings.throttlingMethod,
              throttling: {
                rttMs: 40,
                throughputKbps: 10_240,
                cpuSlowdownMultiplier: 1,
              },
            },
            environment: { hostUserAgent: report.environment.hostUserAgent },
            ...(report.runtimeError ? { runtimeError: { code: report.runtimeError.code } } : {}),
            audits: Object.fromEntries(
              [
                'largest-contentful-paint',
                'cumulative-layout-shift',
                'total-blocking-time',
                'total-byte-weight',
              ].map((id) => {
                const audit = report.audits[id];
                return [
                  id,
                  {
                    numericValue: audit?.numericValue ?? null,
                    numericUnit: audit?.numericUnit,
                    scoreDisplayMode: audit?.scoreDisplayMode,
                  },
                ];
              }),
            ),
          });
          console.log(`Lighthouse: sample ${sample + 1}/3 recorded.`);
        }
        await info.attach('performance-checkpoint.json', {
          contentType: 'application/json',
          body: JSON.stringify({ version: 1, status: 'measured', reports }),
        });
        return;
      } catch {
        reason = 'measurement-failed';
      } finally {
        clearTimeout(deadline);
        try {
          if (!deadlineExpired && benchmark?.connected) {
            await benchmark.close();
          }
        } finally {
          chrome.kill();
        }
      }
    }
  }
  await info.attach('performance-checkpoint.json', {
    contentType: 'application/json',
    body: JSON.stringify({ version: 1, status: 'unavailable', reason }),
  });
}
