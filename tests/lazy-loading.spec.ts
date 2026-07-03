import {
  test as base,
  expect,
  type BrowserContext,
  type ConsoleMessage,
  type ElementHandle,
  type Page,
  type Request,
} from '@playwright/test';
import { env } from './fixtures/env';
import { ArtifactsPage } from './pages/artifacts.page';
import { CardGridListPage } from './pages/cardGridList.page';
import { ConversationPage, type GroupedConversationsResponse } from './pages/conversation.page';

/**
 * @lazy-loading suite -- TC-060 through TC-067, implemented from the AFS
 * files at test-specs/lazy-loading/l*_*_TC-06{0..7}.md (analyst: qa-engineer,
 * implementer: test-automation-engineer). Module-per-spec-file per
 * `.agents/testing.md` § Structure.
 *
 * Like `tests/agents.spec.ts`/`tests/pipelines.spec.ts`/
 * `tests/modal-handling.spec.ts` and UNLIKE `tests/smoke.spec.ts`, this suite
 * does NOT use `mode: 'serial'` -- every one of the eight AFS files in this
 * batch independently confirms its own case is read-only (no create/edit/
 * delete) with no dependency on a sibling case's end-state (confirmed via
 * each AFS's own "Must Clean Up"/Teardown section, all stating "None
 * required (read-only test)").
 *
 * **Architecture notes** (per `.agents/testing.md` § Structure's own plan
 * for this module, applied as directed by the module dispatch):
 *   - `tests/pages/cardGridList.page.ts` extended (not duplicated) with
 *     `toolkitsTotalCountBadge()`/`.toolkitsTotalCount()` (mirrors the
 *     existing `pipelinesTotalCount*` pair) and three new network-driven
 *     helpers -- `waitForListTotal()`, `gotoAndCaptureTotal()`,
 *     `scrollUntilExhausted()` -- that read the AUTHORITATIVE `.total`
 *     field from the list's own network response as the primary assertion
 *     source (see GH#88 below). Toolkits (TC-063/TC-065) reuses this same
 *     page object as-is (confirmed live: identical `#EliteACustomTabPanel`/
 *     `.MuiCard-root` DOM pattern), not a separate `toolkits.page.ts`.
 *   - `tests/pages/conversation.page.ts` extended with group-aware sidebar
 *     helpers (TC-064/TC-066) -- the Conversations list is group-paginated
 *     by date (`today`/`this_week`/`older`), each capped at its own first
 *     10 items, NOT a flat infinite-scroll list like the card grid. See that
 *     file's own class-doc addendum for the full mechanism.
 *   - `tests/pages/artifacts.page.ts` is a new, deliberately minimal page
 *     object (TC-062 only needs the bucket list + empty/loading states) --
 *     the `artifacts` module (next after this one) will grow it further.
 *
 * **GH#88 -- badge-vs-authoritative-total discrepancy (real, filed, non-
 * blocking product defect).** The sidebar count badges ("Agents: N",
 * "Toolkits: N") are backed by a stale cached author-stats endpoint that can
 * drift +/-1 from the true list total (confirmed: Agents badge under-counts
 * by 1, Toolkits badge over-counts by 1; Pipelines showed no drift at this
 * account's current volume). Every hard hard hard pass/fail assertion in
 * this suite compares the DOM card count against the network `total` field
 * (never the badge); any badge-vs-total comparison is `expect.soft()` with a
 * `// Known defect: GH#88` comment -- EXCEPT TC-060, which predates GH#88's
 * filing and whose own Known Defects section attributes the same underlying
 * "don't trust a value captured earlier in this same run" phenomenon to
 * GH#81 instead (a value can go stale on this shared, concurrently-mutated
 * account even before the badge-vs-total root cause was itself understood).
 *
 * Auth: same worker-scoped-storageState + test-scoped-context pattern as
 * every other WebQAPreExecuted-module spec file (see `tests/agents.spec.ts`'s
 * own doc comment for the full rationale). `trackConsoleErrors()` below is
 * duplicated for the FIFTH time (`tests/smoke.spec.ts` ->
 * `tests/agents.spec.ts` -> `tests/pipelines.spec.ts` ->
 * `tests/modal-handling.spec.ts` -> here) -- per `.agents/testing.md` §
 * Structure's own planned framework-scale follow-up, this is deliberately
 * NOT extracted mid-batch: `artifacts` (the final module) will add one more
 * occurrence, and the plan is one dedicated extraction PR after all five
 * modules have merged, touching every already-merged spec file once instead
 * of twice.
 */

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

const test = base.extend<{ authenticatedPage: Page }, { lazyLoadingStorageState: StorageState }>({
  lazyLoadingStorageState: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${env.BASE_URL}/app/chat/`);
      await page.getByRole('textbox', { name: 'Username or email' }).fill(env.ELITEA_EMAIL);
      await page.getByRole('textbox', { name: 'Password' }).fill(env.ELITEA_PASSWORD);
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForURL(/\/app\/chat/);
      const storageState = await context.storageState();
      await context.close();
      await use(storageState);
    },
    // Same generous timeout rationale as every other module's own auth
    // fixture -- a real Keycloak round-trip observed anywhere from ~3s to
    // ~14s across implementation runs against the shared live environment.
    { scope: 'worker', timeout: 60_000 },
  ],
  authenticatedPage: async ({ browser, lazyLoadingStorageState }, use) => {
    const context = await browser.newContext({ storageState: lazyLoadingStorageState });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

/** Suite-local helper: collects console `error`-level messages for the
 * duration it's attached. See this file's own doc comment on why this is
 * duplicated rather than extracted at this point. */
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

/** Suite-local helper: collects uncaught JS exceptions (`page.on('pageerror')`)
 * for the duration it's attached -- distinct from `trackConsoleErrors()`
 * above (a `console.error()` call vs. a genuinely unhandled exception are
 * different events in Playwright). Only TC-064's own AFS explicitly asks for
 * this ("zero JS `pageerror` events... confirmed: both arrays empty"). */
function trackPageErrors(page: Page) {
  const errors: string[] = [];
  const listener = (error: Error) => errors.push(error.message);
  page.on('pageerror', listener);
  return {
    errors,
    stop: () => page.off('pageerror', listener),
  };
}

/**
 * Shared step logic for TC-065/TC-066 -- both cases assert the identical
 * Agents/Pipelines/Toolkits "navigate, read the authoritative network
 * total, scroll-exhaust, hard-assert the final DOM count against it, soft-
 * assert the sidebar badge against the same total (GH#88)" flow. Extracted
 * per the module dispatch's explicit instruction not to let the two tests
 * duplicate this logic -- TC-066's own Automation Hints section flags this
 * exact overlap and asks the implementer not to let it land twice.
 */
async function verifyListFullyLoaded(
  page: Page,
  list: CardGridListPage,
  opts: {
    url: string;
    urlContains: string;
    stepLabel: string;
    badgeTotal?: () => Promise<number>;
  },
): Promise<number> {
  return test.step(opts.stepLabel, async () => {
    const initialTotal = await list.gotoAndCaptureTotal(opts.url, opts.urlContains);
    await expect(page).not.toHaveURL(/auth\.elitea\.ai/);
    const finalTotal = await list.scrollUntilExhausted(opts.urlContains, initialTotal);
    await expect(list.cards).toHaveCount(finalTotal);
    if (opts.badgeTotal) {
      const badgeValue = await opts.badgeTotal();
      expect.soft(badgeValue, 'Known defect: GH#88').toBe(finalTotal);
    }
    return finalTotal;
  });
}

test.describe('@lazy-loading', () => {
  // Several of these cases chain multiple real scroll-exhaustion passes
  // and/or generous live-backend settle waits against the shared
  // environment -- same rationale as every other WebQAPreExecuted-module
  // suite's own describe-level timeout bump. Individually heavier tests
  // (TC-064/TC-065/TC-066) further bump their own `test.setTimeout()`
  // beyond this baseline.
  test.describe.configure({ timeout: 120_000 });

  test('TC-060: agents list loads via scroll-triggered lazy load until exhaustion', async ({
    authenticatedPage: page,
  }) => {
    const console_ = trackConsoleErrors(page);
    const agentsList = new CardGridListPage(page);
    const urlContains = 'agents_type=classic';

    try {
      let initialTotal = 0;
      await test.step('1-2. Navigate to the agents list, wait for the initial page to load', async () => {
        initialTotal = await agentsList.gotoAndCaptureTotal(`${env.BASE_URL}/app/agents/all`, urlContains);
        await expect(page).toHaveURL(/\/app\/agents\/all/);
        await expect(page).toHaveTitle(/Agents/);
        await agentsList.waitForFirstCard();
      });

      await test.step('3. Read the "Agents: N" footer badge as a reference-only baseline -- NOT used for the final equality check (see Known Defects/GH#81)', async () => {
        await expect(agentsList.totalCountBadge()).toBeVisible();
      });

      let finalTotal = initialTotal;
      await test.step("4-6. Scroll to bottom repeatedly until the list is fully lazy-loaded -- the case's own literal single-scroll-cycle assumption doesn't scale to this account's real volume (GH#81)", async () => {
        finalTotal = await agentsList.scrollUntilExhausted(urlContains, initialTotal);
      });

      await test.step('7-8. Scroll back to top -- all previously loaded cards remain, no new fetch fires', async () => {
        const countBeforeScrollUp = await agentsList.cardCount();
        await agentsList.scrollToTop();
        expect(await agentsList.scrollTop()).toBe(0);
        expect(await agentsList.cardCount()).toBe(countBeforeScrollUp);
      });

      await test.step('9. No loading indicators present at any point (never observed on this page)', async () => {
        await expect(agentsList.loadingIndicators()).toHaveCount(0);
      });

      await test.step('10. Final card count matches a freshly-read total -- NOT the step-3 badge value (GH#81)', async () => {
        await expect(agentsList.cards).toHaveCount(finalTotal);
      });

      await test.step('Known defect check (GH#81): the sidebar "Agents: N" badge can drift from the authoritative list total on this shared, concurrently-mutated account', async () => {
        const badgeTotal = await agentsList.totalCount();
        expect.soft(badgeTotal, 'Known defect: GH#81').toBe(finalTotal);
      });

      expect(console_.errors, 'no console errors during the load/scroll/exhaustion sequence').toEqual([]);
    } finally {
      console_.stop();
    }
  });

  test('TC-061: pipelines list scroll-trigger loads additional items', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const pipelinesList = new CardGridListPage(page);
    const urlContains = 'agents_type=pipeline';
    let offset40Fired = false;
    const offset40Listener = (request: Request) => {
      if (request.url().includes(urlContains) && request.url().includes('offset=40')) offset40Fired = true;
    };
    page.on('request', offset40Listener);

    try {
      await test.step('1. Navigate to the pipelines list (default "Private" project scope -- only 2 pipelines, below the pagination threshold this case needs to exercise)', async () => {
        await page.goto(`${env.BASE_URL}/app/pipelines/all`);
        await expect(page).toHaveURL(/\/app\/pipelines\/all/);
      });

      await test.step('2. Wait for the loading indicator to clear (condition wait)', async () => {
        await expect(pipelinesList.loadingIndicators()).toHaveCount(0, { timeout: 10_000 });
      });

      let initialTotal = 0;
      await test.step('3. Switch the project scope to "ELITEA Agents for SDLC" (31 pipelines) -- the only way to actually exercise scroll-triggered pagination on this account, per the AFS\'s own confirmed project-switch steps (Preconditions / GH#82 Finding 3)', async () => {
        const totalPromise = pipelinesList.waitForListTotal(urlContains);
        await page.getByRole('combobox', { name: 'Private' }).click();
        await page.getByRole('option', { name: 'ELITEA Agents for SDLC' }).click();
        initialTotal = await totalPromise;
        await expect(page).toHaveURL(/\/app\/pipelines\/all/);
      });

      await test.step('4. Initial batch M = min(total, 20)', async () => {
        await expect(pipelinesList.cards).toHaveCount(Math.min(initialTotal, 20));
      });

      let finalTotal = initialTotal;
      await test.step('5-7. Scroll to bottom -- triggers exactly the follow-up page(s) needed to reach the full total', async () => {
        finalTotal = await pipelinesList.scrollUntilExhausted(urlContains, initialTotal);
        await expect(pipelinesList.cards).toHaveCount(finalTotal);
      });

      await test.step('8-9. Scroll back to top -- cards remain, no additional fetch', async () => {
        await pipelinesList.scrollToTop();
        expect(await pipelinesList.scrollTop()).toBe(0);
      });

      await test.step('10-11. No loading indicators remain', async () => {
        await expect(pipelinesList.loadingIndicators()).toHaveCount(0);
      });

      await test.step('12. Final count equals the total exactly, and no extra/duplicate page fetch beyond what was needed', async () => {
        await expect(pipelinesList.cards).toHaveCount(finalTotal);
        expect(offset40Fired, 'no offset=40 request should ever fire once the list is fully loaded').toBe(false);
      });

      expect(console_.errors, 'no console errors during the pipelines scroll-trigger flow, including the project-switch interaction').toEqual([]);
    } finally {
      console_.stop();
      page.off('request', offset40Listener);
    }
  });

  test('TC-062: distinguishes empty state from loading state in the artifacts list', async ({
    authenticatedPage: page,
  }) => {
    const console_ = trackConsoleErrors(page);
    const artifacts = new ArtifactsPage(page);

    try {
      await test.step('1. Navigate to /app/artifacts -- register the file-list network wait before navigating, so a genuine fetch is proven rather than a hardcoded empty render', async () => {
        const fileListResponsePromise = page.waitForResponse(
          (r) => /\/artifacts\/s3\/\w+/.test(r.url()) && r.status() === 200,
        );
        await page.goto(`${env.BASE_URL}/app/artifacts`);
        await expect(page).toHaveTitle(/Artifacts/);
        await expect(artifacts.bucketsHeading).toBeVisible();
        await fileListResponsePromise;
      });

      await test.step("2. The case's own proposed loading-indicator selectors match 0 elements at any point (GH#84 case-text drift) -- the real loading UI is plain text with no ARIA semantics (GH#85)", async () => {
        await expect(artifacts.standardLoadingIndicators()).toHaveCount(0);
      });

      await test.step('3-4. Loading state resolves to the empty state (condition wait, not a fixed sleep) -- no loading text remains', async () => {
        await artifacts.waitForEmptyState(10_000);
        await expect(artifacts.loadingTextBucketRail()).toHaveCount(0);
        await expect(artifacts.loadingTextMainPanel()).toHaveCount(0);
      });

      await test.step("5. Scroll to bottom and back to top -- no crash (this account/bucket has nothing left to lazily fetch, so this is a no-op-safety check, not a load trigger)", async () => {
        await page.mouse.wheel(0, 2000);
        await page.mouse.wheel(0, -2000);
        await expect(artifacts.emptyState).toBeVisible();
      });

      await test.step('6. Page remains stable -- the empty state does not flip back to a loading state', async () => {
        await expect(artifacts.emptyState).toBeVisible();
      });

      await test.step('7-8. Empty-state message is exactly "No files in this bucket" -- this IS the confirmed "0 items" signal, no separate file-row selector exists to inspect since none render', async () => {
        await expect(artifacts.emptyState).toContainText('No files in this bucket');
      });

      await test.step('9. Both "Upload files" controls (toolbar + empty-state body) are visible and enabled', async () => {
        await expect(artifacts.uploadButtonToolbar).toBeVisible();
        await expect(artifacts.uploadButtonToolbar).toBeEnabled();
        await expect(artifacts.uploadButtonInEmptyState()).toBeVisible();
        await expect(artifacts.uploadButtonInEmptyState()).toBeEnabled();
      });

      await test.step('Axis 2: the other two pre-existing buckets independently resolve to the same empty state via a client-side bucket switch (no full reload)', async () => {
        for (const bucketName of ['attachments', 'warranty']) {
          const fileListResponsePromise = page.waitForResponse(
            (r) => r.url().includes(`/artifacts/s3/${bucketName}`) && r.status() === 200,
          );
          await artifacts.selectBucket(bucketName);
          await fileListResponsePromise;
          await artifacts.waitForEmptyState();
        }
      });

      expect(console_.errors, 'no console errors during the loading/empty-state flow, across all 3 buckets').toEqual(
        [],
      );
    } finally {
      console_.stop();
    }
  });

  test('TC-063: navigating away from the toolkits list before lazy load completes produces no errors', async ({
    authenticatedPage: page,
  }) => {
    const toolkitsList = new CardGridListPage(page);
    const agentsList = new CardGridListPage(page);
    const failedApiRequests: string[] = [];
    const requestFailedListener = (request: Request) => {
      if (request.url().includes('/api/v2/')) failedApiRequests.push(request.url());
    };
    page.on('requestfailed', requestFailedListener);

    // Deterministically widens the in-flight window for the toolkits list's
    // own fetch, rather than racing real server timing (root-caused during
    // implementation: this account's toolkits fetch normally completes in
    // ~1.4-2.1s per GH#86, but on a fast/warm connection it can resolve
    // before step 2 even fires, making a plain zero-wait interrupt
    // probabilistic rather than reliable -- 2 of 7 implementation runs saw
    // zero aborted requests despite an immediate navigate-away). Delaying
    // by a few seconds mirrors the same "manufacture a genuine in-flight
    // window deterministically" technique TC-064 already established for
    // an analogous problem, and still exercises the real product mechanism
    // (an in-flight `/tools/prompt_lib/` fetch getting cancelled by
    // navigation) -- it does not fabricate the cancellation itself.
    await page.route('**/api/v2/elitea_core/tools/prompt_lib/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      try {
        await route.continue();
      } catch {
        // Cancelled by the step-2 navigation before this resolves -- the
        // exact behavior this test is proving, not a bug in the route.
      }
    });

    // Console-error tracking starts AFTER the toolkits list is confirmed
    // settled (below), not from the very top of the test -- this case's own
    // precondition already assumes "authenticated, on the toolkits list" as
    // the starting state (see AFS Preconditions); noise from GH#93's
    // transient post-login route race (a separate, already-filed,
    // unrelated-to-this-case's-subject concern) while ESTABLISHING that
    // precondition should not count against this test's own "no console
    // errors during the rapid-navigation sequence" claim.
    // Ref-object wrapper (not a bare `let`) -- see TC-067's `handleRef` for
    // the same TypeScript control-flow-narrowing rationale: this is
    // assigned inside one `test.step()` closure and read inside several
    // different ones plus the outer `finally`.
    const consoleRef: { current: ReturnType<typeof trackConsoleErrors> | null } = { current: null };

    try {
      await test.step('1. Navigate to the toolkits list', async () => {
        await page.goto(`${env.BASE_URL}/app/toolkits/all`);
        // Known defect: GH#93 -- a transient post-login route race
        // (project/owner context not yet resolved) can land the FIRST
        // navigation in a fresh context on `/app/toolkits/create` instead
        // of `/app/toolkits/all`, occasionally also firing a 404 + console
        // error on that route's own toolkit-types fetch. First observed and
        // documented as "not filed, no reliable repro recipe" by TC-063's
        // own analyst pass; independently reproduced multiple times more
        // during implementation (crossing the "reproduce consistently
        // before filing" bar), so filed for real this time. One defensive
        // re-navigation recovers deterministically -- this is a documented,
        // cited retry around a known intermittent race, not a masked
        // assertion; TC-063's own subject (rapid navigation AWAY from an
        // already-loaded toolkits list) starts only after this recovers.
        if (page.url().includes('/app/toolkits/create')) {
          await page.goto(`${env.BASE_URL}/app/toolkits/all`);
        }
        // URL only, checked via a plain (non-polling) read -- the page
        // <title> on this app updates once the (now deliberately delayed)
        // toolkits data resolves, not on route entry alone, so asserting it
        // here would either race the artificial delay or defeat the point
        // of it; title is asserted later (step 8-9) once the route delay
        // has been removed and a real, undelayed fetch has completed.
        expect(page.url()).toContain('/app/toolkits/all');
        consoleRef.current = trackConsoleErrors(page);
      });

      await test.step("2. Immediately navigate away -- zero wait (a fixed 2s wait doesn't reliably land inside this account's ~1.4-2.1s fetch window at its current, much-smaller-than-case-assumed volume -- GH#86)", async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
      });

      await test.step('3. Check console immediately after the interrupted navigation -- 0 error/warning messages despite aborted in-flight requests', async () => {
        expect(consoleRef.current!.errors, 'no console errors immediately after the interrupted navigation').toEqual(
          [],
        );
      });

      await test.step('4-6. Agents page loads and displays correctly -- no UI corruption or frozen/residual Toolkits state', async () => {
        await expect(page).toHaveURL(/\/app\/agents\/all/);
        await expect(page).toHaveTitle(/Agents/);
        await agentsList.waitForFirstCard();
      });

      await test.step('7. Check console again -- still 0 new errors/warnings', async () => {
        expect(consoleRef.current!.errors, 'no new console errors after the Agents page settles').toEqual([]);
      });

      let freshToolkitsTotal = 0;
      await test.step('8-9. Navigate back to the toolkits list -- fresh fetch renders cleanly, all sample toolkits present', async () => {
        // Remove the step-1/2 artificial delay -- this navigation is meant
        // to observe a normal, undelayed re-render, not another manufactured
        // interrupt window.
        await page.unroute('**/api/v2/elitea_core/tools/prompt_lib/**');
        freshToolkitsTotal = await toolkitsList.gotoAndCaptureTotal(
          `${env.BASE_URL}/app/toolkits/all`,
          '/tools/prompt_lib/',
        );
        await expect(page).toHaveURL(/\/app\/toolkits\/all/);
        await expect(page).toHaveTitle(/Toolkits/);
        await expect(toolkitsList.cards).toHaveCount(freshToolkitsTotal);
        // .first() -- "warranty" matches TWO distinct toolkits on this
        // account (an Artifact-type and a Pandas-type toolkit sharing the
        // identical display name, confirmed live per the AFS's own Test
        // data inventory); a strict single-match `toBeVisible()` would
        // violate Playwright's strict mode here even though the sample is
        // genuinely present and rendering correctly.
        for (const name of ['attach', 'warranty', 'Browser']) {
          await expect(toolkitsList.cardByName(name).first()).toBeVisible();
        }
      });

      expect(
        failedApiRequests.length,
        'the rapid navigation away should have aborted at least one in-flight /api/v2/ request',
      ).toBeGreaterThan(0);
      expect(consoleRef.current!.errors, 'no console errors across the full rapid-navigation sequence').toEqual([]);
    } finally {
      consoleRef.current?.stop();
      page.off('requestfailed', requestFailedListener);
    }
  });

  test('TC-064: refreshing mid-load recovers correctly with no data corruption', async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(150_000); // this batch observed real post-reload settle
    // times up to 30s+ under heavy concurrent load -- see step 5 below.
    const console_ = trackConsoleErrors(page);
    const pageErrors_ = trackPageErrors(page);
    const conversations = new ConversationPage(page);

    try {
      let expectedTotal = 0;
      let initialIds: number[] = [];
      let initialBody: GroupedConversationsResponse | undefined;
      await test.step('1-2. Navigate to /app/chat/, capture the authoritative expected total from the grouped-list network response (no on-screen "Conversations: N" badge exists anywhere, GH#89/GH#90)', async () => {
        const [{ total, body }] = await Promise.all([
          conversations.waitForGroupedTotal(),
          page.goto(`${env.BASE_URL}/app/chat/`),
        ]);
        expectedTotal = total;
        initialBody = body;
        initialIds = (body.date_groups ?? []).flatMap((g) =>
          (g.conversations ?? []).map((c) => c.id).filter((id): id is number => typeof id === 'number'),
        );
        await expect(page).not.toHaveURL(/auth\.elitea\.ai/);
      });

      let delayApplied = false;
      await test.step("3. (Automation-only step, replaces the case's literal \"wait 4 seconds\") Intercept the initial grouped=true request and delay it ~4s, then reload -- a real, undelayed fetch on this account resolves too fast (~2-4s) to reliably land a fixed-wait mid-load probe, so the partial-load window is manufactured deterministically instead", async () => {
        await page.route('**/api/v2/elitea_core/folder/prompt_lib/**', async (route) => {
          const url = route.request().url();
          if (!delayApplied && url.includes('grouped=true') && !url.includes('date_group=')) {
            delayApplied = true;
            await new Promise((resolve) => setTimeout(resolve, 4_000));
          }
          try {
            await route.continue();
          } catch {
            // The delayed request may be cancelled by step 4's reload before
            // this resolves -- that IS the behavior this test proves
            // (net::ERR_ABORTED, a normal reload artifact), not a bug here.
          }
        });
        await page.reload();
        // Deliberate, bounded probe of the artificially-delayed (4s, set
        // above) response's mid-flight state at t=1.5s -- this is not a
        // hope-it's-ready sleep, it verifies an in-between state engineered
        // via page.route()'s own delay, which cannot be condition-waited
        // (the point of this check IS that the condition hasn't resolved
        // yet). Matches Hard Rule 5's single documented exception class,
        // and the AFS's own explicit step-3 recipe ("reload the page and
        // wait ~1.5s").
        await page.waitForTimeout(1_500);
        // Re-verified live during implementation: the "Conversations"
        // section label is part of the sidebar's static shell and renders
        // immediately regardless of data-load state (unlike the AFS's own
        // exploration note) -- the date-group headings are the actual
        // data-gated signal, so those (not the static label) are what this
        // mid-delay probe asserts absent. Also re-verified: a generic
        // top-level `[role="progressbar"]` DOES render during a genuine
        // full-page reload's transient boot window (confirmed live) --
        // the AFS's "no loading indicator of any kind" claim was based on
        // untimed manual observation, not this precise, artificially-
        // engineered t=1.5s probe; not asserted here (reverse-masking
        // guard -- the live product's real behavior, not the stale case
        // assumption, is the contract), since it isn't this test's actual
        // subject (the date-group headings' absence is).
        await expect(page.getByRole('heading', { name: /This Week|Older|Today/ })).toHaveCount(0);
      });

      await test.step('4. Refresh again WHILE the delayed request from step 3 is still in flight -- it aborts client-side (net::ERR_ABORTED), a normal browser reload artifact, not an application error', async () => {
        await page.reload();
      });

      await test.step("5. Wait for the reloaded page's own (now undelayed) fetch to settle -- generous timeout, this batch observed real settle times up to 30s+ under heavy concurrent load", async () => {
        await expect(page.getByRole('heading', { name: /This Week|Older|Today/ }).first()).toBeVisible({
          timeout: 30_000,
        });
      });

      // Populated ONLY from a genuine group-scoped follow-up fetch (empty
      // if none fires) -- used in step 9 to prove the follow-up page's own
      // ids are disjoint from the initial payload's. Guarded behind the
      // group's own live total, same "N <= page size means no follow-up
      // fetch ever fires" precedent already established for Pipelines/
      // Toolkits elsewhere in this module (GH#82 Finding 3) -- this
      // shared, concurrently-mutated account's "Older" total can itself
      // drop to <=10 (the initial payload's own per-group cap) between
      // when this AFS was authored and when this suite actually runs, in
      // which case the initial payload already contains every "Older" row
      // and no group-scoped request is expected to fire at all.
      let olderFollowUpIds: number[] = [];
      await test.step("6. Expand the \"Older\" group and scroll its own nested container to the bottom -- triggers the group-scoped follow-up fetch for its remaining items", async () => {
        const olderGroup = initialBody?.date_groups?.find((g) => g.name === 'older');
        const olderGroupTotal = olderGroup?.total ?? 0;
        const initialOlderCount = olderGroup?.conversations?.length ?? 0;
        if (olderGroupTotal > initialOlderCount) {
          const olderResponsePromise = conversations.waitForGroupResponse('older');
          await conversations.scrollGroupToBottom('Older');
          const olderResponse = await olderResponsePromise;
          const body = (await olderResponse.json()) as { conversations?: Array<{ id?: number }> };
          olderFollowUpIds = (body.conversations ?? [])
            .map((c) => c.id)
            .filter((id): id is number => typeof id === 'number');
        } else {
          // Nothing beyond the initial payload for this group -- expanding
          // it is still exercised (proves the UI control itself works),
          // but no separate network fetch is expected.
          await conversations.scrollGroupToBottom('Older');
        }
      });

      await test.step('7. Total visible conversation rows equal the expected total captured in step 1-2', async () => {
        await expect(conversations.conversationRows()).toHaveCount(expectedTotal);
      });

      await test.step('8. Only groups with total > 0 render a heading -- "Today" (total 0 for this account) renders none at all', async () => {
        const groupKeyToDisplayName: Record<string, 'Today' | 'This Week' | 'Older'> = {
          today: 'Today',
          this_week: 'This Week',
          older: 'Older',
        };
        for (const group of initialBody?.date_groups ?? []) {
          const displayName = group.name ? groupKeyToDisplayName[group.name] : undefined;
          if (!displayName) continue;
          if ((group.total ?? 0) > 0) {
            await expect(conversations.groupHeading(displayName)).toBeVisible();
          } else {
            await expect(conversations.groupHeading(displayName)).toHaveCount(0);
          }
        }
      });

      await test.step("9. No duplicate conversations -- the id-set union across both network responses (initial + the \"older\" follow-up) has exactly `expectedTotal` unique members; DOM display names legitimately repeat (7 of 18 share the literal name \"Hello, test\"), so a name-based check would false-positive", async () => {
        const allIds = new Set([...initialIds, ...olderFollowUpIds]);
        expect(allIds.size).toBe(expectedTotal);
        const overlap = initialIds.filter((id) => olderFollowUpIds.includes(id));
        expect(overlap, 'the initial and follow-up id sets should not overlap').toEqual([]);
      });

      expect(console_.errors, 'no console errors during the delay->abort->reload->settle sequence').toEqual([]);
      expect(
        pageErrors_.errors,
        'no unhandled JS exceptions during the delay->abort->reload->settle sequence',
      ).toEqual([]);
    } finally {
      console_.stop();
      pageErrors_.stop();
    }
  });

  test('TC-065: navigating through multiple lazy-loaded lists in sequence produces no errors', async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(150_000); // chains 3 full list-exhaustion passes
    const console_ = trackConsoleErrors(page);
    const list = new CardGridListPage(page);

    try {
      await verifyListFullyLoaded(page, list, {
        url: `${env.BASE_URL}/app/agents/all`,
        urlContains: 'agents_type=classic',
        stepLabel: '1-3. Agents list: scroll-exhaust and compare the final DOM count to the authoritative total',
        badgeTotal: () => list.totalCount(),
      });
      expect(console_.errors, 'no console errors on the Agents page').toEqual([]);

      await verifyListFullyLoaded(page, list, {
        url: `${env.BASE_URL}/app/pipelines/all`,
        urlContains: 'agents_type=pipeline',
        stepLabel:
          '4-6. Pipelines list: scroll-exhaust (no-op at this account\'s current volume) and compare to the authoritative total',
        badgeTotal: () => list.pipelinesTotalCount(),
      });
      expect(console_.errors, 'no console errors on the Pipelines page').toEqual([]);

      await verifyListFullyLoaded(page, list, {
        url: `${env.BASE_URL}/app/toolkits/all`,
        urlContains: '/tools/prompt_lib/',
        stepLabel:
          '7-9. Toolkits list: scroll-exhaust (no-op at this account\'s current volume) and compare to the authoritative total',
        badgeTotal: () => list.toolkitsTotalCount(),
      });
      expect(console_.errors, 'no console errors on the Toolkits page').toEqual([]);

      await test.step('10. Residual re-check: no console errors carried over from any earlier page in the sequence (a single end-of-sequence check would miss an error masked by a later page\'s fresh console buffer)', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await list.waitForFirstCard();
        expect(
          console_.errors,
          'no console errors across the entire 3-page-plus-residual-recheck sequence',
        ).toEqual([]);
      });
    } finally {
      console_.stop();
    }
  });

  test('TC-066: verifies exact item counts across all five lazy-loaded lists after full load', async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(180_000); // chains 3 full list-exhaustion passes plus
    // the Artifacts and Conversations surfaces -- the heaviest test in
    // this module.
    const console_ = trackConsoleErrors(page);
    const list = new CardGridListPage(page);
    const artifacts = new ArtifactsPage(page);
    const conversations = new ConversationPage(page);

    try {
      // Agents/Pipelines/Toolkits: identical scroll-exhaust-and-compare
      // logic already exercised by TC-065 -- shared via verifyListFullyLoaded()
      // rather than duplicated (see that function's own doc comment; this
      // module's dispatch explicitly flags the TC-065/TC-066 overlap).
      await verifyListFullyLoaded(page, list, {
        url: `${env.BASE_URL}/app/agents/all`,
        urlContains: 'agents_type=classic',
        stepLabel: '1-4. Agents: scroll-exhaust and compare the final DOM count to the authoritative total',
        badgeTotal: () => list.totalCount(),
      });
      expect(console_.errors, 'no console errors on the Agents page').toEqual([]);

      await verifyListFullyLoaded(page, list, {
        url: `${env.BASE_URL}/app/pipelines/all`,
        urlContains: 'agents_type=pipeline',
        stepLabel:
          '5-8. Pipelines: scroll-exhaust (no-op at this account\'s current volume) and compare to the authoritative total',
        badgeTotal: () => list.pipelinesTotalCount(),
      });
      expect(console_.errors, 'no console errors on the Pipelines page').toEqual([]);

      await verifyListFullyLoaded(page, list, {
        url: `${env.BASE_URL}/app/toolkits/all`,
        urlContains: '/tools/prompt_lib/',
        stepLabel:
          '9-12. Toolkits: scroll-exhaust (no-op at this account\'s current volume) and compare to the authoritative total',
        badgeTotal: () => list.toolkitsTotalCount(),
      });
      expect(console_.errors, 'no console errors on the Toolkits page').toEqual([]);

      await test.step("13-14. Artifacts: the case's literal /app/artifacts/all route 404s (GH#90) -- the corrected, working route is /app/artifacts (no /all)", async () => {
        await page.goto(`${env.BASE_URL}/app/artifacts/all`);
        await expect(page.getByText(/Page not found/i)).toBeVisible();
        await page.goto(`${env.BASE_URL}/app/artifacts`);
        await expect(page).toHaveTitle(/Artifacts/);
        await expect(artifacts.bucketsHeading).toBeVisible();
      });
      expect(console_.errors, 'no console errors on the Artifacts page (either the 404 or the corrected route)').toEqual(
        [],
      );

      await test.step('15-17. Artifacts: "Buckets: N" is the closest live equivalent to the case\'s non-existent "Artifacts: N" badge (GH#90) -- 3 buckets, each independently confirmed empty', async () => {
        await expect(artifacts.bucketsCountText()).toContainText('3');
        await expect(artifacts.bucketRow('attach')).toBeVisible();
        await expect(artifacts.bucketRow('attachments')).toBeVisible();
        await expect(artifacts.bucketRow('warranty')).toBeVisible();
        await artifacts.waitForEmptyState();
      });

      let expectedConversations = 0;
      await test.step('18-19. Conversations: derive the expected total from the grouped-list network response -- no on-screen "Conversations: N" badge exists anywhere (GH#90)', async () => {
        const [{ total }] = await Promise.all([
          conversations.waitForGroupedTotal(),
          page.goto(`${env.BASE_URL}/app/chat/`),
        ]);
        expectedConversations = total;
      });
      expect(console_.errors, 'no console errors on the Conversations page').toEqual([]);

      await test.step('20. Scroll-load the "Older" group\'s remainder (scoped to its own nested container, not window/the chat transcript) and count all visible conversation rows against the expected total', async () => {
        const olderResponsePromise = conversations.waitForGroupResponse('older', 5_000).catch(() => undefined);
        await conversations.scrollGroupToBottom('Older');
        await olderResponsePromise;
        await expect(conversations.conversationRows()).toHaveCount(expectedConversations);
      });

      expect(
        console_.errors,
        'no console errors across all five list surfaces (Agents/Pipelines/Toolkits/Artifacts/Conversations)',
      ).toEqual([]);
    } finally {
      console_.stop();
    }
  });

  test('TC-067: a card reference captured before a scroll-triggered lazy load remains clickable afterward', async ({
    authenticatedPage: page,
  }) => {
    const console_ = trackConsoleErrors(page);
    const agentsList = new CardGridListPage(page);
    // A ref-object wrapper (not a bare `let`) -- TypeScript's control-flow
    // narrowing does not track a `let` reassigned inside one `test.step()`
    // closure and read inside a DIFFERENT one (or in the outer `finally`);
    // it otherwise (incorrectly) narrows the later reads to `never`, since
    // the only assignment visible along its direct scope is the initial
    // `null`. Mutating a property on a stable object sidesteps that
    // compiler limitation entirely.
    const handleRef: { current: ElementHandle<SVGElement | HTMLElement> | null } = { current: null };
    let capturedName = '';

    try {
      await test.step('1-2. Navigate to the agents list, wait for the first card', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await expect(page).not.toHaveURL(/auth\.elitea\.ai/);
        await agentsList.waitForFirstCard();
      });

      await test.step('3. Read the initial card count and the first card\'s visible name (case\'s own [role="button"] selector matches 0 cards -- GH#12/GH#81, corrected to .MuiCard-root)', async () => {
        await expect(agentsList.cards).toHaveCount(20);
        capturedName = (await agentsList.firstCard().textContent()) ?? '';
        expect(capturedName).not.toBe('');
      });

      await test.step('4. Capture a genuine pinned ElementHandle reference to the first card -- NOT a Locator (a Locator re-resolves lazily and structurally cannot go stale, which would make this test unable to exercise what it is actually about)', async () => {
        handleRef.current = await agentsList.firstCard().elementHandle();
        expect(handleRef.current).not.toBeNull();
        expect(await handleRef.current!.textContent()).toBe(capturedName);
      });

      await test.step('5-6. First scroll-triggered fetch: card count strictly increases', async () => {
        const before = await agentsList.cardCount();
        const waitPromise = agentsList.waitForNextPageResponse('agents_type=classic', 20);
        await agentsList.scrollToBottom();
        await waitPromise;
        // Poll rather than a single immediate read -- a resolved network
        // response does not guarantee React has committed the new cards
        // yet (same DOM-catch-up race documented on
        // `CardGridListPage.scrollUntilExhausted()`).
        const after = await agentsList.pollCardCountBeyond(before, 3_000);
        expect(after).toBeGreaterThan(before);
      });

      await test.step('Second, independent scroll-triggered fetch -- the AFS confirms Scenario A (no staleness) holds across TWO cycles, not just one', async () => {
        const before = await agentsList.cardCount();
        const waitPromise = agentsList.waitForNextPageResponse('agents_type=classic', 40);
        await agentsList.scrollToBottom();
        await waitPromise;
        // Poll rather than a single immediate read -- a resolved network
        // response does not guarantee React has committed the new cards
        // yet (same DOM-catch-up race documented on
        // `CardGridListPage.scrollUntilExhausted()`).
        const after = await agentsList.pollCardCountBeyond(before, 3_000);
        expect(after).toBeGreaterThan(before);
      });

      await test.step('7-8. Click the pinned handle -- succeeds directly, no stale-element exception (Scenario A, confirmed deterministic against this app\'s append-only pagination -- GH#83). The re-query fallback is defensive/dead code, flagged loudly (not silently absorbed) if it ever actually fires', async () => {
        let staleErrorThrown = false;
        try {
          await handleRef.current!.click();
        } catch (error) {
          staleErrorThrown = true;
          // eslint-disable-next-line no-console
          console.warn('TC-067: stale-element fallback path fired unexpectedly -- see GH#83:', error);
          await agentsList.firstCard().click();
        }
        expect(
          staleErrorThrown,
          'Scenario B (stale-element error) is not expected against the current app -- see GH#83',
        ).toBe(false);
      });

      await test.step('9. Navigation lands on the corrected detail URL shape (GH#28: not /app/agents/{id})', async () => {
        await expect(page).toHaveURL(/\/app\/agents\/all\/\d+\?viewMode=owner&name=/);
      });

      await test.step('10. Agent detail page shows the SAME agent that was clicked -- confirms a concurrently-shifted first-position card was not clicked instead', async () => {
        await expect(page.getByRole('textbox', { name: 'Name *' })).toHaveValue(capturedName);
      });

      expect(console_.errors, 'no console errors during the stale-element-handling flow').toEqual([]);
    } finally {
      console_.stop();
      if (handleRef.current) {
        await handleRef.current.dispose();
      }
      await test.step('Cleanup: navigate back to the agents list', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
      });
    }
  });
});
