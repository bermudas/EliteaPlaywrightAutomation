import { defineConfig, devices } from '@playwright/test';
import { env } from './tests/fixtures/env';

/**
 * See .agents/testing.md for the full framework-architecture rationale
 * (default/flat scaffold, single chromium project, serial smoke suite).
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  // Discovered while implementing @smoke (this PR): Playwright's default
  // `outputDir` is `test-results/`, which nests INSIDE it every reporter
  // output path this project already uses (`test-results/reports`,
  // `test-results/json`) plus this suite's own screenshot evidence
  // (`test-results/screenshots`, per `.agents/test-automation.yaml` §
  // evidence) -- `npx playwright test --list` flags this as a folder
  // collision ("HTML reporter output folder clashes with the tests output
  // folder"). Moving the run's own outputDir to a sibling subfolder avoids
  // it clearing evidence this suite deliberately writes elsewhere under
  // `test-results/`.
  outputDir: 'test-results/artifacts',
  reporter: [
    ['html', { outputFolder: 'test-results/reports' }],
    ['json', { outputFile: 'test-results/json/run.json' }],
    // CI-only, additive: Playwright's built-in GitHub Actions reporter emits
    // `::error::` workflow commands (file:line + message) for every failure,
    // which GitHub renders as inline annotations on the Checks tab / Files
    // view. Kept out of local runs -- it's noisy/irrelevant outside Actions.
    // Confirmed against the installed @playwright/test 1.61.1 type defs
    // (node_modules/playwright/types/test.d.ts): `['github']` is the exact,
    // no-options tuple form of `ReporterDescription`.
    ...(process.env.CI ? [['github'] as const] : []),
  ],
  use: {
    baseURL: env.BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Every @smoke case's own Setup step 1 (`window.moveTo`/`resizeTo`) is a
    // manual-execution artifact for maximizing the browser -- translated here
    // to a fixed large viewport per each AFS's Automation Hints, rather than
    // executing that script via page.evaluate. 1920x1080 is also the exact
    // resolution the TC-003 analyst explored against (see GH#12 finding on
    // column count) -- keeping automation on the same resolution avoids
    // introducing a new, unexplored viewport-dependent variable.
    viewport: { width: 1920, height: 1080 },
    // Diagnosed from run 28658801255 (this PR's own first two CI runs): a
    // distinct infra-instability bucket -- repeated "Target page, context or
    // browser has been closed" crashes and fields reading back empty right
    // after .fill() -- separate from the correctly-red known-defect tests
    // (GH#29, GH#72, ...). Consistent with Chromium exhausting /dev/shm on
    // GitHub's ubuntu-latest runners (default 64MB shared-memory mount,
    // small next to a 1920x1080 viewport under load); explicit here per
    // operator request as defense-in-depth.
    //
    // VERIFIED CAVEAT (do not remove without re-checking): Playwright's own
    // chromium launcher already hardcodes this exact flag unconditionally
    // for every launch, on every OS (node_modules/playwright-core/lib/
    // coreBundle.js, `chromiumSwitches`) -- confirmed via
    // `DEBUG=pw:browser npx playwright test ...`, which shows
    // `--disable-dev-shm-usage` in the resolved command line with or
    // without this block. So this line is a harmless duplicate (Chromium
    // ignores repeated flags), not something that was missing before. It
    // does NOT explain the infra-crash bucket in 28658801255 by itself --
    // that flag was already active on that run. Kept per operator request;
    // if the infra-crash bucket persists on the next run, the real cause is
    // still open (candidates: runner resource pressure under `workers: 1`
    // + `retries: 2`, not literally /dev/shm).
    launchOptions: {
      args: ['--disable-dev-shm-usage'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
