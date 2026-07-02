import { test as base, expect, type ConsoleMessage, type Page, type Response } from '@playwright/test';
import { env } from './fixtures/env';
import { CardGridListPage } from './pages/cardGridList.page';

/**
 * @smoke suite -- TC-001 through TC-005, implemented from the AFS files at
 * test-specs/smoke/l1_*.md (analyst: qa-engineer, implementer: test-automation-engineer).
 *
 * These 5 cases are one continuous session journey (login -> send message ->
 * create conversation -> agents list -> pipelines list -> logout), per
 * `.agents/testing.md` § Structure. That file mandates ONE spec file, tests
 * in TC-001->005 order, `test.describe.configure({ mode: 'serial' })`, and
 * `workers: 1` (set in playwright.config.ts) -- because TC-002 needs the
 * authenticated session TC-001 establishes, TC-003/004 need to stay
 * authenticated, and TC-005 needs to run last (it ends the session).
 *
 * Playwright's built-in `page` fixture is test-scoped: a fresh, isolated
 * browser context is created per `test()` block by design, which would
 * silently break the intended chain (TC-002 would hit a logged-out redirect,
 * not a continued session). The `sharedPage` fixture below is the standard
 * Playwright pattern for sharing one real browser page across multiple
 * `test()` blocks in the same file/worker -- combined with `workers: 1` and
 * serial mode, it gives the whole file exactly one continuous session.
 *
 * Known trade-off: because `sharedPage` is created via `browser.newPage()`
 * rather than the built-in `context`/`page` fixtures, Playwright's automatic
 * per-test trace/screenshot-on-failure (wired into `playwright.config.ts`
 * `use.trace` / `use.screenshot`) does not apply to these tests -- that
 * instrumentation is specifically wired into the built-in fixtures. This is
 * mitigated below with an explicit `afterEach` failure screenshot. Flagging
 * this for Tal/orchestrator awareness: full manual trace start/stop is a
 * reasonable framework-scale follow-up if failure debugging ever needs more
 * than a screenshot.
 */
const test = base.extend<Record<string, never>, { sharedPage: Page }>({
  sharedPage: [
    async ({ browser }, use, testInfo) => {
      // Pull viewport from the project's own `use` config (playwright.config.ts)
      // instead of duplicating the 1920x1080 literal here, so the two stay in
      // sync automatically -- `browser.newPage()` does NOT auto-inherit
      // `use:` options the way the built-in `context`/`page` fixtures do.
      const page = await browser.newPage({
        viewport: testInfo.project.use.viewport ?? { width: 1920, height: 1080 },
      });
      await use(page);
      await page.close();
    },
    { scope: 'worker' },
  ],
});

/** Suite-local helper: collects console `error`-level messages for the
 * duration it's attached. Every AFS in this suite adds a "no console
 * errors" assertion beyond the original case (Axis 2) -- centralized here
 * instead of repeating the listener/array boilerplate per test. */
function trackConsoleErrors(page: Page) {
  const errors: string[] = [];
  const listener = (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text());
  };
  page.on('console', listener);
  return {
    errors,
    stop: () => page.off('console', listener),
  };
}

/** Suite-local helper: collects non-2xx responses matching a URL substring,
 * for the duration it's attached. Used by TC-002/003/004's Axis 2 network
 * assertions ("no 4xx/5xx on the relevant endpoint family"). */
function trackResponseFailures(page: Page, urlContains: string) {
  const failures: string[] = [];
  const listener = (response: Response) => {
    if (response.url().includes(urlContains) && !response.ok()) {
      failures.push(`${response.status()} ${response.url()}`);
    }
  };
  page.on('response', listener);
  return {
    failures,
    stop: () => page.off('response', listener),
  };
}

test.describe('@smoke', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async ({ sharedPage: page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      const safeTitle = testInfo.title.replace(/[^a-zA-Z0-9-_]/g, '_');
      await page
        .screenshot({ path: `test-results/screenshots/${safeTitle}-failure.png`, fullPage: true })
        .catch(() => {
          /* best-effort evidence capture -- never mask the real failure with a screenshot error */
        });
    }
  });

  test('TC-001: login and send test message', async ({ sharedPage: page }) => {
    const console_ = trackConsoleErrors(page);

    try {
      await test.step('1-2. Navigate to chat while logged out -- redirects to SSO login', async () => {
        await page.goto(`${env.BASE_URL}/app/chat/`);
        await expect(page).toHaveURL(/auth\.elitea\.ai/);
        await expect(page).toHaveTitle(/Sign in to Next/);
      });

      const usernameInput = page.getByRole('textbox', { name: 'Username or email' });
      const passwordInput = page.getByRole('textbox', { name: 'Password' });

      await test.step('3. Fill Username field', async () => {
        await usernameInput.fill(env.ELITEA_EMAIL);
        await expect(usernameInput).toHaveValue(env.ELITEA_EMAIL);
      });

      await test.step('4. Fill Password field -- masked input', async () => {
        await passwordInput.fill(env.ELITEA_PASSWORD);
        await expect(passwordInput).toHaveAttribute('type', 'password');
        // Evidence: visual dot-masking, per AFS step 4.
        await passwordInput.screenshot({
          path: 'test-results/screenshots/TC-001-step4-password-masked.png',
        });
      });

      await test.step('5. Click Sign In -- redirect back to app (condition wait, no fixed sleep)', async () => {
        await page.getByRole('button', { name: 'Sign In' }).click();
        await page.waitForURL(/\/app\/chat/);
      });

      await test.step('6. Wait for app shell to finish loading', async () => {
        await expect(page).toHaveURL(/\/app\/chat\/?/);
      });

      await test.step('7. Verify left sidebar is visible', async () => {
        await expect(page.locator('nav[aria-label="side-bar"]')).toBeVisible();
      });

      // Message textarea: AFS TC-001's own primary locator
      // (`getByPlaceholder('Type your message...')`) does NOT match live --
      // Phase 2 exploration confirmed the `placeholder` attribute is empty
      // (`""`) on the live app. `getByTestId('chat-input').locator('textarea')`
      // (TC-002 AFS's own primary) also fails -- strict-mode violation,
      // resolves to 2 elements (the real textarea + a hidden readonly shadow
      // textarea MUI renders for auto-sizing). `#standard-multiline-static`
      // is a stable, deliberately-named, unique id (confirmed via DOM query)
      // and is used here as the corrected primary handle for both TC-001 and
      // TC-002 -- see the AFS amendment commits for both cases.
      const messageTextarea = page.locator('#standard-multiline-static');
      // Send button: rather than the dynamic accessible name (`enter
      // speaking mode` -> `send your question`), `data-testid="chat-send-button"`
      // is a stable handle across both states -- confirmed live. Using the
      // testid removes the sequencing hazard entirely instead of merely
      // documenting it.
      const sendButton = page.getByTestId('chat-send-button');

      await test.step('8. Verify message input textarea is visible', async () => {
        await expect(messageTextarea).toBeVisible();
      });

      await test.step('9. Click message textarea -- becomes focused', async () => {
        await messageTextarea.click();
        await expect(messageTextarea).toBeFocused();
      });

      await test.step('10. Type "Hello, QA test"', async () => {
        await messageTextarea.fill('Hello, QA test');
        await expect(messageTextarea).toHaveValue('Hello, QA test');
      });

      await test.step('11. Click Send -- message appears attributed to the user', async () => {
        await expect(sendButton).toBeEnabled();
        await sendButton.click();

        // AFS Test Data is explicit that this message text is a fixed
        // literal, not uniquified per run -- "repeated runs will accumulate
        // additional identical messages in the account's chat history; this
        // is expected" (see AFS § Test Data / § Cleanup, and
        // `.agents/testing.md` § Test data strategy). Confirmed live: this
        // conversation already carried 2 prior "Hello, QA test" rows from
        // earlier runs/exploration, so a bare `.filter({ hasText })` is a
        // strict-mode violation (multiple matches). `.last()` picks the one
        // this test just sent.
        const sentMessage = page
          .locator('[data-testid="chat-message-item"]')
          .filter({ hasText: 'Hello, QA test' })
          .last();
        await expect(sentMessage).toBeVisible();
        // Sender-name span has no stable class per AFS Concrete Handles note
        // ("not stable enough to recommend") -- assert on the row's own
        // `hasText` contract instead, matching that guidance directly.
        await expect(sentMessage).toContainText('Alita Yoko');
      });

      expect(console_.errors, 'no console errors during login + send flow').toEqual([]);
    } finally {
      console_.stop();
    }
  });

  test('TC-002: create new conversation', async ({ sharedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const lifecycleCalls = trackResponseFailures(page, '/api/v2/elitea_core/');

    try {
      await test.step('1. Navigate to chat -- already authenticated (no redirect)', async () => {
        await page.goto(`${env.BASE_URL}/app/chat/`);
        await expect(page).not.toHaveURL(/auth\.elitea\.ai/);
      });

      await test.step('2. Wait for chat interface to finish loading, no blocking modal', async () => {
        await expect(page.getByTestId('chat-input')).toBeVisible();
      });

      const newConversationButton = page
        .getByRole('navigation', { name: 'side-bar' })
        .getByRole('button', { name: 'Conversation', exact: true });

      await test.step('3. Click the new-conversation control', async () => {
        await newConversationButton.click();
        // Confirmed live: URL drops to `/app/chat` (no id) -- id assignment
        // is lazy, tied to the first Send (see GH#9 / step 7 below), not to
        // this click. Waiting on the welcome text (next step) is the real
        // signal, not a URL change.
        await expect(page).toHaveURL(/\/app\/chat$/);
      });

      const messageTextarea = page.locator('#standard-multiline-static');
      const sendButton = page.getByTestId('chat-send-button');

      await test.step('4. Wait for the draft conversation welcome state to render', async () => {
        await expect(page.getByText('Hello, Alita!')).toBeVisible();
        await expect(messageTextarea).toBeVisible();
      });

      await test.step('5. Fill the textarea with the test message', async () => {
        await messageTextarea.fill('New conversation test');
        await expect(messageTextarea).toHaveValue('New conversation test');
      });

      await test.step('6. Verify Send is enabled, then click it', async () => {
        await expect(sendButton).toBeEnabled();
        await sendButton.click();
      });

      await test.step('7. New conversation id appears in the URL (assigned on Send)', async () => {
        await page.waitForURL(/\/app\/chat\/\d+/);
        const sentMessage = page
          .locator('[data-testid="chat-message-item"]')
          .filter({ hasText: 'New conversation test' });
        await expect(sentMessage).toBeVisible();
        await expect(sentMessage).toContainText('Alita Yoko');
      });

      await test.step('8. Wait for the AI response ("Thought for N sec")', async () => {
        await expect(
          page.getByRole('button', { name: /^Thought for \d+ secs?$/ }),
        ).toBeVisible({ timeout: 30_000 });
      });

      await test.step('9. New conversation is listed in the sidebar under "Today"', async () => {
        // Phase 2 finding: the sidebar entry shows a transient "Naming"
        // placeholder (an async AI-generated-title step) before settling on
        // the final name -- observed live to take up to ~30-40s to resolve,
        // well beyond the AFS's own framing. Generous timeout, condition
        // wait (toBeVisible polls), no fixed sleep.
        await expect(
          page.getByRole('button', { name: 'New conversation test', exact: true }),
        ).toBeVisible({ timeout: 45_000 });
      });

      expect(console_.errors, 'no console errors during create-conversation flow').toEqual([]);
      expect(
        lifecycleCalls.failures,
        'no non-2xx responses on any elitea_core conversation-lifecycle endpoint',
      ).toEqual([]);
    } finally {
      console_.stop();
      lifecycleCalls.stop();
    }
  });

  test('TC-003: navigate to agents list', async ({ sharedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const listCalls = trackResponseFailures(page, '/api/v2/elitea_core/applications/prompt_lib/');
    const agentsList = new CardGridListPage(page);

    try {
      await test.step('1. Navigate to the agents list', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await expect(page).toHaveURL(/\/app\/agents\/all/);
        await expect(page).toHaveTitle(/Agents/);
      });

      await test.step('2. Wait for the initial page to load (condition wait, not a fixed sleep)', async () => {
        await agentsList.waitForNextPageResponse('agents_type=classic', 0);
        await agentsList.waitForFirstCard();
      });

      let countBeforeScroll = 0;
      await test.step('3-4. Scroll to bottom -- triggers lazy-loading of the next page', async () => {
        countBeforeScroll = await agentsList.cardCount();
        await agentsList.scrollToBottom();
        await agentsList.waitForNextPageResponse('agents_type=classic', countBeforeScroll);
        await expect
          .poll(() => agentsList.cardCount(), { timeout: 10_000 })
          .toBeGreaterThan(countBeforeScroll);
      });

      await test.step('5. Scroll back to top', async () => {
        await agentsList.scrollToTop();
        await expect.poll(() => agentsList.scrollTop()).toBe(0);
      });

      await test.step('7. No loading indicators remain', async () => {
        await expect(agentsList.loadingIndicators()).toHaveCount(0);
      });

      await test.step('9. Card count >= 1; total account count (footer) >= 12', async () => {
        expect(await agentsList.cardCount()).toBeGreaterThanOrEqual(1);
        const footerCount = page.getByText(/^Agents:\s*\d+/);
        await expect(footerCount).toBeVisible();
        const footerText = (await footerCount.textContent()) ?? '';
        const match = footerText.match(/(\d+)/);
        expect(match, `footer text should contain a number: "${footerText}"`).not.toBeNull();
        expect(Number(match![1])).toBeGreaterThanOrEqual(12);
      });

      await test.step('10. First agent card has non-empty text content', async () => {
        await expect(agentsList.firstCard()).not.toBeEmpty();
      });

      await test.step('Final state screenshot (evidence)', async () => {
        await page.screenshot({
          path: 'test-results/screenshots/TC-003-final-state.png',
          fullPage: false,
        });
      });

      expect(console_.errors, 'no console errors during agents-list load/scroll').toEqual([]);
      expect(listCalls.failures, 'no 4xx/5xx from applications/prompt_lib').toEqual([]);
    } finally {
      console_.stop();
      listCalls.stop();
    }
  });

  test('TC-004: navigate to pipelines list', async ({ sharedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const listCalls = trackResponseFailures(page, '/api/v2/elitea_core/applications/prompt_lib/');
    const pipelinesList = new CardGridListPage(page);

    try {
      await test.step('1. Navigate to the pipelines list', async () => {
        await page.goto(`${env.BASE_URL}/app/pipelines/all`);
        await expect(page).toHaveURL(/\/app\/pipelines\/all/);
      });

      await test.step('2. Wait for the loading indicator to clear (condition wait, not "wait 3s")', async () => {
        // AFS step 1's "progressbar present momentarily" is a single
        // anecdotal live observation (1/1) of a sub-2s transient -- asserting
        // its *presence* immediately post-navigate would race Playwright's
        // own step overhead and risks flaking on timing, not on a product
        // issue. The meaningful, stable contract is that it clears -- assert
        // that instead (still exercises the same AFS step 2 verify).
        await expect
          .poll(() => pipelinesList.loadingIndicators().count(), { timeout: 10_000 })
          .toBe(0);
      });

      await test.step('3. Scroll to bottom -- defensive no-op under current data volume (1 pipeline)', async () => {
        await pipelinesList.scrollToBottom();
        await pipelinesList.scrollToTop();
        await expect.poll(() => pipelinesList.scrollTop()).toBe(0);
      });

      await test.step('4. Re-check no loading indicators remain', async () => {
        await expect(pipelinesList.loadingIndicators()).toHaveCount(0);
      });

      await test.step('5. Pipeline card count >= 1 -- see GH#13: case\'s own [role="button"] selector matches 0 elements inside a card', async () => {
        // `.MuiCard-root` scoped to `#EliteACustomTabPanel` -- confirmed live
        // (Phase 2 exploration) to be a MORE precise handle than the AFS's
        // own "Recommended Locator" (`[role="tabpanel"] > div > div`), which
        // matched 2 elements against the live single-pipeline account (the
        // real card AND an unrelated filter-sidebar text node). See
        // tests/pages/cardGridList.page.ts header comment for the full
        // rationale.
        await pipelinesList.waitForFirstCard();
        expect(await pipelinesList.cardCount()).toBeGreaterThanOrEqual(1);
      });

      await test.step('6. First pipeline card contains a real pipeline name (substring, not exact)', async () => {
        await expect(pipelinesList.firstCard()).not.toBeEmpty();
      });

      await test.step('Final state screenshot (evidence)', async () => {
        await page.screenshot({
          path: 'test-results/screenshots/TC-004-final-state.png',
          fullPage: false,
        });
      });

      expect(console_.errors, 'no console errors during pipelines-list load').toEqual([]);
      expect(listCalls.failures, 'no 4xx/5xx from applications/prompt_lib').toEqual([]);
    } finally {
      console_.stop();
      listCalls.stop();
    }
  });

  test('TC-005: logout', async ({ sharedPage: page }) => {
    const console_ = trackConsoleErrors(page);

    try {
      await test.step('1. Verify current URL is an authenticated /app/* page', async () => {
        await expect(page).toHaveURL(/\/app\//);
      });

      // `#user-menu-action` is positioned bottom-left of the sidebar, not
      // top-left as the original case text states -- live product is
      // correct (deliberate IA: workspace switcher top, account controls
      // bottom), case text is stale. Filed as GH#10. Asserting the live DOM
      // handle, not the stale wording (reverse-masking guard).
      const userMenuButton = page.locator('#user-menu-action');

      await test.step('2. Locate the user profile/avatar button', async () => {
        await expect(userMenuButton).toBeVisible();
        await page.screenshot({
          path: 'test-results/screenshots/TC-005-step2-authenticated-page.png',
        });
      });

      await test.step('3. Click the avatar -- dropdown menu opens', async () => {
        await userMenuButton.click();
        await expect(page.getByRole('menuitem', { name: 'Personalization' })).toBeVisible();
        await expect(page.getByRole('menuitem', { name: 'Logout' })).toBeVisible();
        await page.screenshot({
          path: 'test-results/screenshots/TC-005-step3-profile-menu-open.png',
        });
      });

      await test.step('5-6. Click Logout -- redirects to the Keycloak SSO login page', async () => {
        await page.getByRole('menuitem', { name: 'Logout' }).click();
        // Redirect chain has an intermediate same-origin hop
        // (`/forward-auth/auth_oidc/login?target_to=<JWT>`) before landing on
        // auth.elitea.ai -- match on the FINAL URL only, per AFS § Network
        // Behavior; don't assert on the intermediate hop.
        await page.waitForURL(/auth\.elitea\.ai/);
      });

      await test.step('7. Final URL is the Keycloak login/auth page', async () => {
        await expect(page).toHaveURL(/auth\.elitea\.ai/);
      });

      await test.step('8. Login form is visible and ready for a fresh sign-in', async () => {
        await expect(page.getByRole('textbox', { name: 'Username or email' })).toBeVisible();
        await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
        await page.screenshot({
          path: 'test-results/screenshots/TC-005-step8-login-page-after-logout.png',
        });
      });

      await test.step('9-10. Re-attempt to navigate to /app/chat/ -- bounced back to login (session terminated server-side)', async () => {
        // This re-navigation check is the AFS's own recommended "stronger
        // proof" of session termination (vs. only checking the URL right
        // after the Logout click) -- it exercises server-side session state,
        // not just client-side routing, which is why no separate
        // Keycloak-cookie-name assertion is implemented: coupling a test to
        // Keycloak's internal cookie-naming scheme would assert on a
        // third-party implementation detail this suite doesn't otherwise
        // depend on, and this check already proves the stronger claim.
        await page.goto(`${env.BASE_URL}/app/chat/`);
        await expect(page).toHaveURL(/auth\.elitea\.ai/);
        await page.screenshot({
          path: 'test-results/screenshots/TC-005-step10-reattempt-redirect.png',
        });
      });

      expect(console_.errors, 'no console errors during logout + re-navigation flow').toEqual([]);
    } finally {
      console_.stop();
    }
  });
});
