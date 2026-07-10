import {
  test as base,
  expect,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
} from '@playwright/test';
import { env } from './fixtures/env';
import { dismissAnnouncementBanner } from './pages/entityForm.page';
import { SkillFormPage } from './pages/skillForm.page';
import { SkillsListPage } from './pages/skillsList.page';

/**
 * @skills suite -- ELITEA-1739, implemented from the AFS at
 * test-specs/skills/l3_search-skills-by-name_ELITEA-1739.md (analyst:
 * qa-engineer, implementer: test-automation-engineer). First case for the
 * `skills` module -- greenfield, no prior `tests/skills.spec.ts` or
 * `tests/pages/skill*.ts` existed before this PR (`.agents/testing.md`
 * § Structure "Growing past smoke" plan names `skills` as a future module;
 * this is that module's first spec file).
 *
 * Cleanup: per `.agents/testing.md` § Test data strategy's "`skills` module
 * cleanup decision" (Tal, 2026-07-10) -- no teardown. The 3 skills this case
 * creates (`formatter` / `code-reviewer` / `content-writer`) persist in the
 * account, following the `agents`/`pipelines`/smoke-suite precedent (no
 * destructive mutation is exercised by this case, so there's nothing to
 * clean up).
 *
 * Idempotent setup: per this PR's own dispatch note, the account may
 * already carry these 3 skills from an earlier analyst/implementer pass --
 * confirmed live during Phase 2 exploration (2026-07-10) that all 3 already
 * exist with the exact descriptions this test would otherwise generate.
 * `ensureSkillsExist()` below checks for each by exact name before creating
 * it, rather than assuming a clean slate and erroring on a duplicate-name
 * conflict.
 *
 * Auth: same worker-scoped-storageState + test-scoped-context fixture-graph
 * pattern as `tests/agents.spec.ts`/`tests/pipelines.spec.ts` (see
 * `tests/agents.spec.ts`'s own doc comment for the full rationale, including
 * why the fixture-graph approach was chosen over `test.use({ storageState })`
 * + `beforeAll`).
 *
 * `trackConsoleErrors()` below is duplicated from `tests/agents.spec.ts` /
 * `tests/pipelines.spec.ts` / `tests/modal-handling.spec.ts` /
 * `tests/lazy-loading.spec.ts` / `tests/artifacts.spec.ts` -- this is now
 * the 6th spec file carrying an identical copy, past `.agents/testing.md`'s
 * own "Do not let a 6th module land before this happens" note on the
 * planned (but not yet executed) framework-scale extraction of a shared
 * `tests/fixtures/auth.ts` + console-tracking helper. That extraction is a
 * framework-architecture decision (Hard Rule: implementer executes plans,
 * doesn't invent them) -- flagged here, and in this PR's Run Report, for
 * Tal to dispatch as the next framework-scale implementer PR rather than
 * done silently as part of this case's own implementation.
 */

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

const test = base.extend<
  { authenticatedPage: Page },
  { skillsStorageState: StorageState }
>({
  skillsStorageState: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${env.BASE_URL}/app/chat/`);
      await page.getByRole('textbox', { name: 'Username or email' }).fill(env.ELITEA_EMAIL);
      await page.getByRole('textbox', { name: 'Password' }).fill(env.ELITEA_PASSWORD);
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForURL(/\/app\/chat/);
      await dismissAnnouncementBanner(page);
      await dismissOnboardingTour(page);
      const storageState = await context.storageState();
      await context.close();
      await use(storageState);
    },
    // Same generous timeout rationale as tests/agents.spec.ts/tests/pipelines.spec.ts
    // -- a real Keycloak round-trip observed anywhere from ~3s to ~14s across
    // implementation runs against the shared live environment.
    { scope: 'worker', timeout: 60_000 },
  ],
  authenticatedPage: async ({ browser, skillsStorageState }, use) => {
    const context = await browser.newContext({ storageState: skillsStorageState });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

/**
 * [Implementer Phase 5 Debug fix, 2026-07-10] A first-run guided-tour
 * overlay ("Tip 1: Welcome to ELITEA" / "Jump in now!") is NOT documented
 * anywhere in the AFS -- the analyst's session (and every prior module's
 * worker-scoped storageState fixture) evidently never hit a fresh-enough
 * session to trigger it. Confirmed live (2026-07-10) via a fresh
 * `browser.newContext()` + real Keycloak login (no prior storageState) that
 * this full-screen tour CAN appear and intercepts the sidebar "Skills" click
 * (observed: the click landed on `/app/onboarding` instead of
 * `/app/skills/all`) -- root cause classified infrastructure (an
 * account/session-level "seen onboarding" flag racing the very first
 * post-login navigation), not a product defect in the search-by-name flow
 * this case actually tests. Dismissed defensively here, mirroring
 * `dismissAnnouncementBanner()`'s own "count() > 0 && isVisible()" guard so
 * this is a no-op on sessions where the tour never appears (confirmed: most
 * runs during implementation did NOT show it, so this must not error/skip a
 * legitimate first run).
 */
async function dismissOnboardingTour(page: Page): Promise<void> {
  const jumpInButton = page.getByRole('button', { name: 'Jump in now!' });
  // The tour's appearance is asynchronous (server-driven, observed to race
  // the very first post-login navigation) -- a bare, instant `.isVisible()`
  // check (no wait at all) can run BEFORE the tour has rendered and read a
  // false negative. A short bounded wait lets a genuinely-appearing tour
  // resolve without adding meaningful latency to the (more common) case
  // where it never appears at all.
  await jumpInButton.waitFor({ state: 'visible', timeout: 1_500 }).catch(() => undefined);
  if (await jumpInButton.isVisible().catch(() => false)) {
    await jumpInButton.click();
  }
}

/**
 * Clicks the sidebar "Skills" nav button and lands on `/app/skills/all`,
 * retrying once if the click gets diverted to `/app/onboarding` (the
 * onboarding tour's own confirmed-live redirect target -- see
 * `dismissOnboardingTour()`'s doc comment). One retry is sufficient:
 * confirmed live the tour never re-triggers a 2nd time in the same
 * context once dismissed.
 */
async function gotoSkillsListViaSidebar(page: Page): Promise<void> {
  const skillsNavButton = page
    .getByRole('navigation', { name: 'side-bar' })
    .getByRole('button', { name: 'Skills' });
  await dismissAnnouncementBanner(page);
  await dismissOnboardingTour(page);
  await skillsNavButton.click();
  if (page.url().includes('/app/onboarding')) {
    await dismissOnboardingTour(page);
    await skillsNavButton.click();
  }
}

/** Suite-local helper: collects console `error`-level messages for the
 * duration it's attached. See this file's own doc comment re: the now-6x
 * duplication across spec files and the deferred framework-scale
 * extraction. */
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

/** The 3 skills this case's AFS creates to search against. Names are the
 * AFS's own slug-valid substitutes for the upstream case's literal ("Formatter"
 * / "Code Reviewer" / "Content Writer") names -- filed as `#129` (case-text
 * drift, not a defect): the live Skill "Name" field's slug-format validation
 * (lowercase/digits/hyphens only, no spaces) rejects the case's literal
 * names outright. Per human guidance on `#129`, the upstream case text is
 * NOT being changed; only this implementation uses the valid names. */
const SKILL_DEFINITIONS = [
  {
    name: 'formatter',
    description: 'Formats text output. Created for ELITEA-1739 search-by-name test.',
    instructions: 'Format the given text output consistently.',
  },
  {
    name: 'code-reviewer',
    description: 'Reviews code for quality issues. Created for ELITEA-1739 search-by-name test.',
    instructions: 'Review the given code for quality issues.',
  },
  {
    name: 'content-writer',
    description: 'Writes marketing/content copy. Created for ELITEA-1739 search-by-name test.',
    instructions: 'Write marketing or content copy as requested.',
  },
] as const;

/**
 * Navigates to `/app/skills/all` and waits for the authoritative unfiltered
 * `GET .../skills/prompt_lib/{ownerId}?...query=&...` list response (same
 * endpoint `SkillsListPage.searchAndSubmit()` waits on) before returning --
 * a real race, root-caused during Phase 4 Execute: a bare `.count()`
 * immediately after `goto()` (no wait at all) intermittently read the list
 * BEFORE it had rendered, causing `ensureSkillsExist()` to misdetect an
 * already-existing skill as missing and create a live duplicate (observed
 * live: a 2nd "formatter" appeared, "1 - 4 of 4" instead of "1 - 3 of 3" --
 * cleaned up manually via the confirmed Skills delete-confirmation dialog,
 * same pattern as Agents/Pipelines' `deleteEntity()`, before re-running).
 * Waiting for this response first makes every subsequent `.count()` check
 * read a settled DOM, not a race.
 */
async function gotoSkillsList(page: Page): Promise<void> {
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/skills/prompt_lib/') && r.status() === 200),
    page.goto(`${env.BASE_URL}/app/skills/all`),
  ]);
}

/**
 * Creates any of `SKILL_DEFINITIONS` that don't already exist in the
 * account (exact-name match, scoped to the list's own tabpanel) -- see this
 * file's own doc comment re: idempotent setup. Confirmed live (2026-07-10)
 * that all 3 already existed with these exact descriptions at implementation
 * time, so the create branch below is NOT independently re-exercised
 * end-to-end by this implementer run -- it is built directly from the AFS's
 * own analyst-confirmed Concrete Handles (Name/Description/Instructions
 * fields, Save button, banner-dismiss-before-Save, post-save redirect to
 * `/app/skills/all/{id}`), the same handles this AFS already validated live
 * during its own Test Steps 3-6. Flagged explicitly in this PR's Run Report.
 */
async function ensureSkillsExist(page: Page, skillsList: SkillsListPage): Promise<void> {
  await gotoSkillsList(page);
  for (const definition of SKILL_DEFINITIONS) {
    const alreadyExists = (await skillsList.skillName(definition.name).count()) > 0;
    if (alreadyExists) continue;
    await page.goto(`${env.BASE_URL}/app/skills/create`);
    const form = new SkillFormPage(page);
    await form.fillMinimal(definition.name, definition.description, definition.instructions);
    await form.saveOnCreate();
    await gotoSkillsList(page);
  }
}

test.describe('@skills', () => {
  // Creating up to 3 skills (each a real sequential create-form round trip)
  // plus 4 search interactions against the shared live environment --
  // matching the widened per-suite timeout precedent set by
  // tests/agents.spec.ts/tests/pipelines.spec.ts for the same reason (a
  // single Keycloak login alone ranged ~3-14s across implementation runs).
  test.describe.configure({ timeout: 60_000 });

  test('ELITEA-1739: search skills by name', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const skillsList = new SkillsListPage(page);

    await test.step('1. Navigate and confirm authenticated session', async () => {
      await page.goto(`${env.BASE_URL}/app/chat/`);
      await expect(page).toHaveURL(/\/app\/chat/);
    });

    await test.step('2. Open the Skills list via the sidebar', async () => {
      // [Phase 5 Debug fix, 2026-07-10] Both the recurring release-notes
      // banner (GH#42) AND the first-run onboarding tour (see
      // `dismissOnboardingTour()`'s own doc comment) are confirmed live to
      // intercept this sidebar click when they haven't been dismissed
      // within THIS context's lifetime -- the worker-scoped fixture's own
      // dismissal (done in the login context, before `storageState()` is
      // captured) does not reliably carry over into each test's own fresh
      // `browser.newContext({ storageState })`, root-caused during Phase 4
      // Execute (a bare click here intermittently landed on `/app/chat/416`
      // or `/app/onboarding` instead of `/app/skills/all`). Dismissing
      // defensively here too -- both are no-ops when already dismissed,
      // same guard pattern as `dismissAnnouncementBanner()` itself.
      await gotoSkillsListViaSidebar(page);
      await expect(page).toHaveURL(/\/app\/skills\/all/);
    });

    await test.step('3-6. Ensure the 3 slug-valid skills exist (create any that are missing)', async () => {
      await ensureSkillsExist(page, skillsList);
      // Switch to Table view -- confirmed live (2026-07-10) that the search
      // query and its filtered result set survive a Card<->Table toggle, so
      // this one switch covers every subsequent step's Table-view assertion
      // without re-toggling per step.
      await page.goto(`${env.BASE_URL}/app/skills/all?view=table`);
      await expect(skillsList.paginationFooter()).toHaveText(/1\s*-\s*3 of 3/);
      await expect(skillsList.skillName('formatter')).toBeVisible();
      await expect(skillsList.skillName('code-reviewer')).toBeVisible();
      await expect(skillsList.skillName('content-writer')).toBeVisible();
    });

    await test.step('7. Search partial name "ter" (3-char minimum, the AFS\'s slug-valid substitute for the case\'s literal 2-char "Co" example) -- typeahead-only phase, before Enter', async () => {
      // fill() alone only opens the typeahead tooltip -- confirmed live
      // (2026-07-10) the main list/table stays unfiltered at this point.
      // This is the AFS's single most important implementation detail:
      // do NOT assert a filtered list yet.
      await skillsList.searchInput.fill('ter');
      await expect(skillsList.typeaheadPopper()).toBeVisible();
      await expect(skillsList.typeaheadPopper().getByText('content-writer', { exact: true })).toBeVisible();
      await expect(skillsList.typeaheadPopper().getByText('formatter', { exact: true })).toBeVisible();
      await expect(skillsList.typeaheadPopper().getByText('code-reviewer', { exact: true })).toHaveCount(0);
      await expect(skillsList.paginationFooter()).toHaveText(/1\s*-\s*3 of 3/);
    });

    await test.step('7b. Press Enter -- main list/table now filters to content-writer + formatter, excluding code-reviewer', async () => {
      await Promise.all([
        page.waitForResponse((r) => {
          if (!r.url().includes('/skills/prompt_lib/') || r.status() !== 200) return false;
          return new URL(r.url()).searchParams.get('query') === 'ter';
        }),
        page.keyboard.press('Enter'),
      ]);
      await expect(skillsList.typeaheadPopper()).toHaveCount(0);
      await expect(skillsList.paginationFooter()).toHaveText(/1\s*-\s*2 of 2/);
      await expect(skillsList.skillName('content-writer')).toBeVisible();
      await expect(skillsList.skillName('formatter')).toBeVisible();
      await expect(skillsList.skillName('code-reviewer')).toHaveCount(0);
    });

    await test.step('8. Search exact name "formatter" -- main list filters to formatter only', async () => {
      await skillsList.searchAndSubmit('formatter');
      await expect(skillsList.paginationFooter()).toHaveText(/1\s*-\s*1 of 1/);
      await expect(skillsList.skillName('formatter')).toBeVisible();
      await expect(skillsList.skillName('content-writer')).toHaveCount(0);
      await expect(skillsList.skillName('code-reviewer')).toHaveCount(0);
    });

    await test.step('9. Search non-existent name "translator" -- empty state, zero skills listed', async () => {
      await skillsList.searchAndSubmit('translator');
      // Confirmed live (2026-07-10): the empty state reuses the generic
      // "No skills yet" copy rather than a distinct no-results message --
      // a documented UX nit (AFS Known Defects), not a defect. The filter
      // is genuinely applied (0 rows), which is what's asserted here.
      await expect(skillsList.emptyStateText()).toBeVisible();
      await expect(skillsList.skillName('formatter')).toHaveCount(0);
      await expect(skillsList.skillName('code-reviewer')).toHaveCount(0);
      await expect(skillsList.skillName('content-writer')).toHaveCount(0);
    });

    await test.step('10. Clear the search box -- full list restored', async () => {
      await skillsList.clearAndSubmit();
      // Clearing also re-fires the live "at least 3 letters" toast
      // cosmetically (empty query) -- confirmed live the list still
      // correctly restores despite it; deliberately NOT gating this
      // assertion on the toast's absence, per the AFS's own Automation Hint.
      await expect(skillsList.paginationFooter()).toHaveText(/1\s*-\s*3 of 3/);
      await expect(skillsList.skillName('formatter')).toBeVisible();
      await expect(skillsList.skillName('code-reviewer')).toBeVisible();
      await expect(skillsList.skillName('content-writer')).toBeVisible();
    });

    await test.step('11. No console errors across the whole search sequence', async () => {
      console_.stop();
      expect(console_.errors).toEqual([]);
    });
  });
});
