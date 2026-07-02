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
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
