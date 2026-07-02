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
  reporter: [
    ['html', { outputFolder: 'test-results/reports' }],
    ['json', { outputFile: 'test-results/json/run.json' }],
  ],
  use: {
    baseURL: env.BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
