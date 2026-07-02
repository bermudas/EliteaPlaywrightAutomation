import { test, expect } from '@playwright/test';
import { env } from './fixtures/env';

/**
 * Bootstrap proving test — NOT TC-001. This exists only to prove the
 * scaffold works end to end: env loading, config wiring, and a real
 * navigation against the live app. TC-001 (login + send message) is a
 * separate, later automation pass per its own AFS.
 *
 * Expected redirect shape taken from smoke/TC-001_login-and-send-message.md
 * step 1: "Navigate to `{{base_url}}/app/chat/`" -> "Page redirects to SSO
 * login page (`auth.elitea.ai`)".
 */
test.describe('@bootstrap', () => {
  test('unauthenticated chat route redirects to SSO login', async ({ page }) => {
    await page.goto(`${env.BASE_URL}/app/chat/`);

    await expect(page).toHaveURL(/auth\.elitea\.ai/);
  });
});
