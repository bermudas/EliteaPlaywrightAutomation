import {
  test as base,
  expect,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
} from '@playwright/test';
import { env } from './fixtures/env';
import { uniqueAgentName } from './fixtures/testData';
import { CardGridListPage } from './pages/cardGridList.page';
import { AgentFormPage, dismissAnnouncementBanner } from './pages/agentForm.page';

/**
 * @agents suite -- TC-010 through TC-019, implemented from the AFS files at
 * test-specs/agents/l*_*_TC-01{0..9}.md (analyst: qa-engineer, implementer:
 * test-automation-engineer). Module-per-spec-file per `.agents/testing.md`
 * § Structure "Growing past smoke" plan.
 *
 * Unlike @smoke, this suite does NOT use `mode: 'serial'` -- every one of
 * the ten AFS files confirmed its own case is self-contained (creates and
 * tears down its own fixture agent, no dependency on a sibling case's
 * end-state). Playwright's describe-block default (non-serial) is used,
 * matching `.agents/testing.md`'s explicit default for WebQAPreExecuted-
 * module specs; `workers: 1` (project-wide, `playwright.config.ts`) still
 * makes actual execution sequential for now, independent of this choice.
 *
 * Auth: each AFS treats "user is authenticated" as a precondition, not a
 * per-case action (unlike @smoke's TC-001, which tests the login flow
 * itself). Rather than performing 10 real Keycloak logins, this suite logs
 * in ONCE per worker (a worker-scoped `agentsStorageState` fixture) and
 * hands each test its own isolated context/page seeded from that captured
 * state (a test-scoped `authenticatedPage` fixture) -- a file-scoped
 * application of the pattern `.agents/testing.md` § Hooks flags ("add a
 * storageState-based setup project... once needed twice", now needed ten
 * times in this one file). Deliberately implemented via Playwright's
 * fixture graph (in-memory `storageState` object, not a shared file path)
 * rather than `test.use({ storageState: <path> })` + `beforeAll` in the
 * same describe block -- that combination was tried first and hit a real
 * fixture-ordering race (the test-scoped `context`/`page` fixture attempted
 * to read the auth file before `beforeAll` had written it; 0/10 runs
 * succeeded). The fixture-graph version below has no such race: Playwright
 * resolves `authenticatedPage`'s dependency on `agentsStorageState`
 * deterministically before either fixture is handed to a test.
 *
 * This is also deliberately NOT a project-level `playwright.config.ts`
 * change: `bootstrap.spec.ts` asserts unauthenticated behavior (`/app/chat/`
 * redirects to login) and would break if a project-wide `use.storageState`
 * pre-authenticated its `page` fixture. Scoping the reused auth state to
 * this file's own fixture avoids that collision entirely while still
 * cutting 10 logins down to 1.
 */

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

const test = base.extend<
  { authenticatedPage: Page },
  { agentsStorageState: StorageState }
>({
  agentsStorageState: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${env.BASE_URL}/app/chat/`);
      await page.getByRole('textbox', { name: 'Username or email' }).fill(env.ELITEA_EMAIL);
      await page.getByRole('textbox', { name: 'Password' }).fill(env.ELITEA_PASSWORD);
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForURL(/\/app\/chat/);
      // Dismiss before capturing storageState -- if the banner's dismissal
      // is localStorage-backed, every test in this file inherits the
      // dismissed state; if it isn't, each mutating AgentFormPage method
      // dismisses it defensively anyway (GH#42).
      await dismissAnnouncementBanner(page);
      const storageState = await context.storageState();
      await context.close();
      await use(storageState);
    },
    // A real Keycloak round-trip observed anywhere from ~3s to ~14s across
    // implementation runs against the shared live environment -- giving
    // this one-time-per-worker login its own generous timeout (rather than
    // inheriting the project's per-test 30s default) avoids a slow-but-
    // legitimate login flakily timing out the first test in the file.
    { scope: 'worker', timeout: 60_000 },
  ],
  authenticatedPage: async ({ browser, agentsStorageState }, use) => {
    const context = await browser.newContext({ storageState: agentsStorageState });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

/** Suite-local helper: collects console `error`-level messages for the
 * duration it's attached. Duplicated from `tests/smoke.spec.ts` rather than
 * extracted to a shared module -- this is only the 2nd file needing it,
 * under Hard Rule 7's "extract on the 3rd repetition" threshold. Extract to
 * a shared `tests/fixtures/` helper when a 3rd spec file needs it. */
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('@agents', () => {
  // Each case does several real sequential network round-trips (create,
  // edit, reload, navigate, delete) against the shared live environment.
  // The project default (30s, `playwright.config.ts`) was observed to be
  // tight under real-world latency variance during implementation (a
  // single Keycloak login alone ranged ~3-14s across runs) -- widening it
  // here, scoped to this suite, rather than touching the shared project
  // default other suites rely on.
  test.describe.configure({ timeout: 60_000 });

  test('TC-010: create agent with minimal required fields', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const agentsList = new CardGridListPage(page);
    const form = new AgentFormPage(page);
    // TC-010's own AFS specifies the case's exact literal template here --
    // it fits exactly at the 32-char Name cap (GH#27) and the AFS
    // explicitly says to use it verbatim, not a shortened prefix (unlike
    // every sibling case in this module).
    const agentName = uniqueAgentName('TEST_Agent_Minimal');
    const description = 'Minimal test agent created for QA validation';
    let agentId: number | undefined;

    try {
      await test.step('1-2. Navigate to the agents list, wait for the card grid', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await expect(page).toHaveURL(/\/app\/agents\/all/);
        await expect(page).toHaveTitle(/Agents/);
        await agentsList.waitForFirstCard();
      });

      await test.step('3. Dismiss any blocking modal/banner if present', async () => {
        await dismissAnnouncementBanner(page);
      });

      await test.step('4. Click the "Create Agent" control in the sidebar', async () => {
        await page
          .getByRole('navigation', { name: 'side-bar' })
          .getByRole('button', { name: 'Agent', exact: true })
          .click();
        await expect(page).toHaveURL(/\/app\/agents\/create\?viewMode=owner/);
      });

      await test.step('5. Verify Save is disabled', async () => {
        await expect(form.saveButton).toBeDisabled();
      });

      await test.step('6. Fill Name', async () => {
        await form.nameInput.fill(agentName);
        // Read back the actual value -- guards the GH#27 silent-truncation
        // risk instead of trusting `fill()` alone.
        await expect(form.nameInput).toHaveValue(agentName);
      });

      await test.step('7. Verify Save remains disabled (Description still empty)', async () => {
        await expect(form.saveButton).toBeDisabled();
      });

      await test.step('8. Fill Description', async () => {
        await form.descriptionInput.fill(description);
        await expect(form.descriptionInput).toHaveValue(description);
      });

      await test.step('9. Verify Save is now enabled', async () => {
        await expect(form.saveButton).toBeEnabled();
      });

      await test.step('10-11. Click Save, wait for redirect to the agent detail page', async () => {
        const { id } = await form.saveOnCreate();
        agentId = id;
        await expect(page).toHaveURL(new RegExp(`/app/agents/all/${id}`));
        await expect(page).toHaveTitle(new RegExp(`Agent: ${escapeRegExp(agentName)}`));
      });

      await test.step('12. Verify the created agent appears in the agents list', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await agentsList.waitForFirstCard();
        await expect(agentsList.cardByName(agentName)).toBeVisible();
      });

      expect(console_.errors, 'no console errors during the create-minimal flow').toEqual([]);
    } finally {
      console_.stop();
      if (agentId !== undefined) {
        await test.step('Cleanup: delete the created agent', async () => {
          await page.goto(`${env.BASE_URL}/app/agents/all/${agentId}?viewMode=owner`);
          await form.deleteAgent(agentName);
          await expect(page).toHaveURL(/\/app\/agents\/all/);
        });
      }
    }
  });

  test('TC-011: create agent with all fields filled', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const agentsList = new CardGridListPage(page);
    const form = new AgentFormPage(page);
    const data = {
      name: uniqueAgentName('TC011'),
      description: 'Full test agent with all fields populated',
      tags: ['test', 'automation', 'qa'],
      guidelines:
        'You are a QA test agent. Follow all test instructions precisely and report results accurately.',
      welcomeMessage: 'Hello! I am a test agent. How can I assist you today?',
      stepLimit: '50',
    };
    let agentId: number | undefined;

    try {
      await test.step('1. Navigate to the agents list', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await expect(page).toHaveURL(/\/app\/agents\/all/);
        await agentsList.waitForFirstCard();
      });

      await test.step('2. Dismiss any blocking modal/banner if present', async () => {
        await dismissAnnouncementBanner(page);
      });

      await test.step('3. Click the sidebar create-agent control', async () => {
        await page
          .getByRole('navigation', { name: 'side-bar' })
          .getByRole('button', { name: 'Agent', exact: true })
          .click();
        await expect(page).toHaveURL(/\/app\/agents\/create\?viewMode=owner/);
      });

      await test.step('4. Fill Name', async () => {
        await form.nameInput.fill(data.name);
        await expect(form.nameInput).toHaveValue(data.name);
      });

      await test.step('5. Fill Description', async () => {
        await form.descriptionInput.fill(data.description);
        await expect(form.descriptionInput).toHaveValue(data.description);
      });

      await test.step('6. Add tags: test, automation, qa', async () => {
        for (const tag of data.tags) {
          await form.addTag(tag);
          await expect(form.tagChip(tag)).toBeVisible();
        }
      });

      await test.step('7. Instructions/Welcome message/Advanced sections are already expanded', async () => {
        await expect(form.guidelinesInput).toBeVisible();
        await expect(form.welcomeMessageInput).toBeVisible();
        await expect(form.stepLimitInput).toBeVisible();
      });

      await test.step('8. Fill Guidelines', async () => {
        await form.guidelinesInput.fill(data.guidelines);
        await expect(form.guidelinesInput).toHaveValue(data.guidelines);
      });

      await test.step('9. Fill Welcome message', async () => {
        await form.welcomeMessageInput.fill(data.welcomeMessage);
        await expect(form.welcomeMessageInput).toHaveValue(data.welcomeMessage);
      });

      await test.step('10. Fill Step limit (replaces the pre-filled "25" default via .fill())', async () => {
        await form.stepLimitInput.fill(data.stepLimit);
        await expect(form.stepLimitInput).toHaveValue(data.stepLimit);
      });

      await test.step('11-12. Click Save, verify the create response body and the redirect', async () => {
        const { id, response } = await form.saveOnCreate();
        agentId = id;
        const body = await response.json();
        const tagNames = (body.version_details?.tags ?? [])
          .map((t: { name: string }) => t.name)
          .sort();
        expect(tagNames).toEqual([...data.tags].sort());
        expect(body.version_details?.instructions).toBe(data.guidelines);
        // Known defect: GH#43 -- the Welcome Message field's value is
        // silently dropped from the create payload under fast, automated
        // field entry (confirmed: DOM value is correct at click time, but
        // the persisted server-side value is empty even after a fresh
        // reload -- not a UI-rendering artifact). Soft-asserted so this
        // isolated defect doesn't block the rest of this test's coverage;
        // will turn green automatically once the product fixes it.
        expect
          .soft(body.version_details?.welcome_message, 'Known defect: GH#43')
          .toBe(data.welcomeMessage);
        expect(body.version_details?.meta?.step_limit).toBe(Number(data.stepLimit));
        await expect(page).toHaveURL(new RegExp(`/app/agents/all/${id}`));
      });

      await test.step('13-14. Verify all field values persisted on the detail page', async () => {
        await expect(form.nameInput).toHaveValue(data.name);
        await expect(form.descriptionInput).toHaveValue(data.description);
        for (const tag of data.tags) {
          await expect(form.tagChip(tag)).toBeVisible();
        }
        await expect(form.guidelinesInput).toHaveValue(data.guidelines);
        // Known defect: GH#43 -- see the soft-assert above; the field
        // reflects the same (incorrectly empty) persisted state here.
        await expect.soft(form.welcomeMessageInput, 'Known defect: GH#43').toHaveValue(data.welcomeMessage);
        await expect(form.stepLimitInput).toHaveValue(data.stepLimit);
        await page.screenshot({ path: 'test-results/screenshots/TC-011-step14-detail-verified.png' });
      });

      expect(console_.errors, 'no console errors during the create-full-fields flow').toEqual([]);
    } finally {
      console_.stop();
      if (agentId !== undefined) {
        await test.step('Cleanup: delete the created agent', async () => {
          await page.goto(`${env.BASE_URL}/app/agents/all/${agentId}?viewMode=owner`);
          await form.deleteAgent(data.name);
          await expect(page).toHaveURL(/\/app\/agents\/all/);
        });
      }
    }
  });

  test('TC-012: edit existing agent', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const agentsList = new CardGridListPage(page);
    const form = new AgentFormPage(page);
    const originalName = uniqueAgentName('TC012');
    const updatedName = `${originalName}_UPDATED`;
    const originalDescription = 'Original description';
    const updatedDescription = 'Updated description for edit test case';
    let agentId: number | undefined;

    try {
      await test.step('Setup: create a throwaway fixture agent to edit', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/create?viewMode=owner`);
        await dismissAnnouncementBanner(page);
        await form.fillMinimal(originalName, originalDescription);
        const { id } = await form.saveOnCreate();
        agentId = id;
      });

      await test.step('1-2. Navigate to the agents list, wait for the card grid', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await expect(page).not.toHaveURL(/auth\.elitea\.ai/);
        await agentsList.waitForFirstCard();
      });

      await test.step('3. Dismiss any blocking modal/banner if present', async () => {
        await dismissAnnouncementBanner(page);
      });

      await test.step('4. Click the fixture agent card', async () => {
        await agentsList.clickCardByName(originalName);
        await expect(page).toHaveURL(new RegExp(`/app/agents/all/${agentId}`));
      });

      await test.step('5-6. Verify current Name/Description values', async () => {
        await expect(form.nameInput).toHaveValue(originalName);
        await expect(form.descriptionInput).toHaveValue(originalDescription);
      });

      await test.step('7-8. Fill Name with the updated value', async () => {
        await form.nameInput.fill(updatedName);
        await expect(form.nameInput).toHaveValue(updatedName);
      });

      await test.step('9-10. Fill Description with the updated value', async () => {
        await form.descriptionInput.fill(updatedDescription);
        await expect(form.descriptionInput).toHaveValue(updatedDescription);
      });

      await test.step('11. Verify Save is enabled', async () => {
        await expect(form.saveButton).toBeEnabled();
      });

      await test.step('12-13. Click Save, wait for completion', async () => {
        await form.saveOnEdit();
        await expect(page).toHaveURL(new RegExp(`name=${encodeURIComponent(updatedName)}`));
      });

      await test.step('14-15. Verify updated values, then reload to confirm server-side persistence', async () => {
        await expect(form.nameInput).toHaveValue(updatedName);
        await expect(form.descriptionInput).toHaveValue(updatedDescription);
        await Promise.all([
          page.waitForResponse(
            (r) => /\/application\/prompt_lib\/\d+\/\d+$/.test(r.url()) && r.status() === 200,
          ),
          page.reload(),
        ]);
        await expect(form.nameInput).toHaveValue(updatedName);
        await expect(form.descriptionInput).toHaveValue(updatedDescription);
      });

      await test.step('16-18. Navigate back to the list; updated card present, no stale duplicate', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await agentsList.waitForFirstCard();
        await expect(agentsList.cardByName(updatedName)).toBeVisible();
        // Assert the OLD name doesn't also render as a separate, stale
        // card -- catches a duplicate-card bug that "new card present"
        // alone would miss (Axis 2, TC-012's own addition).
        await expect(agentsList.cardByName(originalName)).toHaveCount(1);
        await expect(agentsList.cardByName(originalName)).toContainText('_UPDATED');
      });

      expect(console_.errors, 'no console errors during the edit flow').toEqual([]);
    } finally {
      console_.stop();
      if (agentId !== undefined) {
        await test.step('Cleanup: delete the fixture agent (current name is the updated one)', async () => {
          await page.goto(`${env.BASE_URL}/app/agents/all/${agentId}?viewMode=owner`);
          await form.deleteAgent(updatedName);
          await expect(page).toHaveURL(/\/app\/agents\/all/);
        });
      }
    }
  });

  test('TC-013: delete agent with confirmation', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const agentsList = new CardGridListPage(page);
    const form = new AgentFormPage(page);
    const agentName = uniqueAgentName('TC013');
    let agentId: number | undefined;

    try {
      await test.step('1-3. Create a disposable fixture agent to delete', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/create?viewMode=owner`);
        await expect(page).toHaveTitle(/Agents/);
        await dismissAnnouncementBanner(page);
        await form.fillMinimal(agentName, 'Agent to be deleted');
        await expect(form.saveButton).toBeEnabled();
        const { id } = await form.saveOnCreate();
        agentId = id;
      });

      await test.step('4-6. Navigate to the agents list, locate the fixture card', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await expect(page).toHaveURL(/\/app\/agents\/all/);
        await agentsList.waitForFirstCard();
        await dismissAnnouncementBanner(page);
        await expect(agentsList.cardByName(agentName)).toBeVisible();
      });

      await test.step('7-9. Click the card, verify its name, open the overflow menu', async () => {
        await agentsList.clickCardByName(agentName);
        await expect(page).toHaveURL(new RegExp(`/app/agents/all/${agentId}`));
        await expect(form.nameInput).toHaveValue(agentName);
        await form.overflowMenuButton.click();
        await expect(page.getByRole('menuitem', { name: 'Delete agent', exact: true })).toBeVisible();
        // "VERSION" section's own "Delete" item is always disabled --
        // distinct from "Delete agent" under "AGENT" (do not confuse).
        await expect(page.getByRole('menuitem', { name: 'Delete', exact: true })).toBeDisabled();
      });

      await test.step('10-11. Open the delete-confirmation dialog', async () => {
        await page.getByRole('menuitem', { name: 'Delete agent', exact: true }).click();
        const dialog = form.deleteConfirmationDialog();
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
        await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
      });

      await test.step('12. Typing the wrong name keeps Delete disabled (the gate actually gates)', async () => {
        const dialog = form.deleteConfirmationDialog();
        await dialog.getByRole('textbox').fill('wrong_name');
        await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
      });

      await test.step('13-14. Typing the exact name enables Delete; click it', async () => {
        const dialog = form.deleteConfirmationDialog();
        const deleteButton = dialog.getByRole('button', { name: 'Delete', exact: true });
        await dialog.getByRole('textbox').fill(agentName);
        await expect(deleteButton).toBeEnabled();
        await Promise.all([
          page.waitForResponse(
            (r) =>
              /\/application\/prompt_lib\/\d+\/\d+$/.test(r.url()) &&
              r.request().method() === 'DELETE' &&
              r.status() === 204,
          ),
          deleteButton.click(),
        ]);
        await expect(page).toHaveURL(`${env.BASE_URL}/app/agents/all`);
      });

      await test.step('15-16. Wait for the list to reload, confirm the agent is gone', async () => {
        await agentsList.waitForFirstCard();
        await expect(agentsList.cardByName(agentName)).toHaveCount(0);
      });

      agentId = undefined; // deleted as part of the test's own flow -- no fallback cleanup needed
      expect(console_.errors, 'no console errors during the create-delete flow').toEqual([]);
    } finally {
      console_.stop();
      if (agentId !== undefined) {
        await test.step('Cleanup fallback: delete the fixture (test failed before its own delete step)', async () => {
          await page.goto(`${env.BASE_URL}/app/agents/all/${agentId}?viewMode=owner`);
          await form.deleteAgent(agentName);
        });
      }
    }
  });

  test('TC-014: form validation for required fields', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const agentsList = new CardGridListPage(page);
    const form = new AgentFormPage(page);
    const agentName = uniqueAgentName('TC014');
    const description = 'Description for validation test';

    try {
      await test.step('1-2. Navigate to the agents list, wait for the card grid', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await expect(page).toHaveURL(/\/app\/agents\/all/);
        await agentsList.waitForFirstCard();
      });

      await test.step('3. Dismiss any blocking modal/banner if present', async () => {
        await dismissAnnouncementBanner(page);
      });

      await test.step('4. Click the "Create Agent" control', async () => {
        await page
          .getByRole('navigation', { name: 'side-bar' })
          .getByRole('button', { name: 'Agent', exact: true })
          .click();
        await expect(page).toHaveURL(/\/app\/agents\/create\?viewMode=owner/);
      });

      await test.step('5. Verify Save AND Cancel are disabled on the pristine form', async () => {
        await expect(form.saveButton).toBeDisabled();
        await expect(form.cancelButton).toBeDisabled();
      });

      await test.step('6-7. Fill Name; Save stays disabled, Cancel becomes enabled (dirty)', async () => {
        await form.nameInput.fill(agentName);
        await expect(form.saveButton).toBeDisabled();
        await expect(form.cancelButton).toBeEnabled();
      });

      await test.step('8. Clear Name; inline "Name is required" error appears on blur', async () => {
        await form.nameInput.fill('');
        await form.nameInput.blur();
        await expect(page.getByText('Name is required')).toBeVisible();
      });

      await test.step('9-10. Fill Description; Save stays disabled (Name now empty)', async () => {
        await form.descriptionInput.fill(description);
        await expect(form.descriptionInput).toHaveValue(description);
        await expect(form.saveButton).toBeDisabled();
      });

      await test.step('11. Fill Name again; both required fields hold values', async () => {
        await form.nameInput.fill(agentName);
        await expect(form.nameInput).toHaveValue(agentName);
      });

      await test.step('12. Verify Save is now enabled', async () => {
        await expect(form.saveButton).toBeEnabled();
      });

      await test.step('Known defect check (optional, not a case step): GH#29 -- whitespace-only required fields', async () => {
        await form.nameInput.fill('   ');
        // Known defect: GH#29 -- Save's disabled-gate is a raw
        // truthiness/length check on the untrimmed value, not a
        // "has real content" check. Soft-asserting the CORRECT behavior so
        // this turns green automatically if the product fixes it, without
        // failing the case's own flow today.
        await expect.soft(form.saveButton, 'Known defect: GH#29').toBeDisabled();
        // Restore a valid Name so Teardown's Cancel/Discard isn't left in
        // a defect-induced state.
        await form.nameInput.fill(agentName);
      });

      expect(console_.errors, 'no console errors during the validation flow').toEqual([]);
    } finally {
      console_.stop();
      await test.step('Teardown: Cancel and discard without saving', async () => {
        if (await form.cancelButton.isEnabled().catch(() => false)) {
          await form.cancelAndDiscard();
        } else {
          await page.goto(`${env.BASE_URL}/app/agents/all`);
        }
      });
    }
  });

  test('TC-015: cancel button discards changes', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const agentsList = new CardGridListPage(page);
    const form = new AgentFormPage(page);
    const agentName = uniqueAgentName('TC015');
    let initialCount = 0;

    try {
      await test.step('1-2. Navigate to the agents list, wait for the card grid', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await expect(page).toHaveURL(/\/app\/agents\/all/);
        await agentsList.waitForFirstCard();
      });

      await test.step('3. Dismiss any blocking modal/banner if present', async () => {
        await dismissAnnouncementBanner(page);
      });

      await test.step('4. Read the "Agents: N" badge as a baseline (informational -- shared account)', async () => {
        initialCount = await agentsList.totalCount();
      });

      await test.step('5. Click "Create Agent"', async () => {
        await page
          .getByRole('navigation', { name: 'side-bar' })
          .getByRole('button', { name: 'Agent', exact: true })
          .click();
        await expect(page).toHaveURL(/\/app\/agents\/create\?viewMode=owner/);
      });

      await test.step('6-9. Fill Name, Description, a tag, and Guidelines', async () => {
        await form.nameInput.fill(agentName);
        await form.descriptionInput.fill('This agent should not be created');
        await form.addTag('temp');
        await expect(form.tagChip('temp')).toBeVisible();
        await form.guidelinesInput.fill('Test guidelines');
      });

      await test.step('10. Verify Cancel is enabled (form is dirty)', async () => {
        await expect(form.cancelButton).toBeEnabled();
      });

      await test.step('11-13. Click Cancel, confirm Discard, verify return to the agents list', async () => {
        await form.cancelAndDiscard();
        await expect(page).toHaveURL(`${env.BASE_URL}/app/agents/all`);
      });

      await test.step('14-15. Search for the generated name -- confirm no agent was created', async () => {
        await agentsList.waitForFirstCard();
        const response = await agentsList.searchAndAwaitResults(agentName);
        const body = await response.json();
        expect(body.application?.total, 'search_options application.total should be 0').toBe(0);
        await expect(agentsList.noAgentsMatchText()).toBeVisible();
        await expect(agentsList.cardByName(agentName)).toHaveCount(0);
      });

      await test.step('16. "Agents: N" badge never decreases below the baseline (not a strict-equality gate)', async () => {
        await agentsList.searchInput.fill('');
        const finalCount = await agentsList.totalCount();
        expect(finalCount).toBeGreaterThanOrEqual(initialCount);
      });

      expect(console_.errors, 'no console errors during the cancel-discard flow').toEqual([]);
    } finally {
      console_.stop();
    }
  });

  test('TC-016: agent detail page displays correct data', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const form = new AgentFormPage(page);
    const data = {
      name: uniqueAgentName('TC016'),
      description: 'Agent for detail page verification',
      tags: ['detail', 'test', 'qa'],
      guidelines: 'Detailed agent guidelines for testing',
      welcomeMessage: 'Welcome to the detail test agent',
      stepLimit: '75',
    };
    let agentId: number | undefined;

    try {
      await test.step('1. Verify authenticated state (no redirect to login)', async () => {
        await page.goto(`${env.BASE_URL}/app/chat/`);
        await expect(page).not.toHaveURL(/auth\.elitea\.ai/);
      });

      await test.step('Setup: create the fixture agent with the full field set', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await expect(page).toHaveURL(/\/app\/agents\/all/);
        await dismissAnnouncementBanner(page);
        await page
          .getByRole('navigation', { name: 'side-bar' })
          .getByRole('button', { name: 'Agent', exact: true })
          .click();
        await expect(page).toHaveURL(/\/app\/agents\/create\?viewMode=owner/);
        await form.fillFull(data);
        const { id } = await form.saveOnCreate();
        agentId = id;
      });

      await test.step('2. Navigate directly (fresh goto) to the corrected detail URL', async () => {
        await Promise.all([
          page.waitForResponse(
            (r) => /\/application\/prompt_lib\/\d+\/\d+$/.test(r.url()) && r.status() === 200,
          ),
          page.goto(`${env.BASE_URL}/app/agents/all/${agentId}?viewMode=owner`),
        ]);
      });

      await test.step('3-11. Verify every field value persisted exactly, all sections pre-expanded', async () => {
        await expect(form.nameInput).toHaveValue(data.name);
        await expect(form.descriptionInput).toHaveValue(data.description);
        for (const tag of data.tags) {
          await expect(form.tagChip(tag)).toBeVisible();
        }
        await expect(form.guidelinesInput).toBeVisible();
        await expect(form.guidelinesInput).toHaveValue(data.guidelines);
        await expect(form.welcomeMessageInput).toBeVisible();
        // Known defect: GH#43 -- the Welcome Message field's value is
        // silently dropped from the create payload under fast, automated
        // field entry (confirmed: DOM value is correct at click time, but
        // the persisted server-side value is empty even after a fresh
        // reload -- not a UI-rendering artifact). Soft-asserted so this
        // isolated defect doesn't block the rest of this test's coverage.
        await expect.soft(form.welcomeMessageInput, 'Known defect: GH#43').toHaveValue(data.welcomeMessage);
        await expect(form.stepLimitInput).toBeVisible();
        await expect(form.stepLimitInput).toHaveValue(data.stepLimit);
      });

      // AFS Axis 2: WebSocket ERR_NAME_NOT_RESOLVED entries are a sandboxed-
      // network artifact of the analyst's isolated exploration profile, not
      // a page defect -- filtered out rather than asserted on, per the
      // AFS's own documented carve-out. A normal CI runner should see none
      // of these at all; the filter is defensive, not load-bearing.
      expect(
        console_.errors.filter((e) => !e.includes('ERR_NAME_NOT_RESOLVED')),
        "no console errors attributable to the detail page's own data load",
      ).toEqual([]);
    } finally {
      console_.stop();
      if (agentId !== undefined) {
        await test.step('Cleanup: delete the fixture agent', async () => {
          await page.goto(`${env.BASE_URL}/app/agents/all/${agentId}?viewMode=owner`);
          await form.deleteAgent(data.name);
          await expect(page).toHaveURL(/\/app\/agents\/all/);
        });
      }
    }
  });

  test('TC-017: tags field multi-select functionality', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const agentsList = new CardGridListPage(page);
    const form = new AgentFormPage(page);
    const agentName = uniqueAgentName('TC017');
    let agentId: number | undefined;

    try {
      await test.step('1-3. Navigate to the agents list, wait for the card grid, dismiss banner', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await expect(page).toHaveURL(/\/app\/agents\/all/);
        await agentsList.waitForFirstCard();
        await dismissAnnouncementBanner(page);
      });

      await test.step('4. Click "Create Agent"', async () => {
        await page
          .getByRole('navigation', { name: 'side-bar' })
          .getByRole('button', { name: 'Agent', exact: true })
          .click();
        await expect(page).toHaveURL(/\/app\/agents\/create\?viewMode=owner/);
      });

      await test.step('5-6. Fill Name and Description', async () => {
        await form.nameInput.fill(agentName);
        await expect(form.nameInput).toHaveValue(agentName);
        await form.descriptionInput.fill('Agent for testing multi-select tags');
      });

      await test.step('7-9. Add tag "automation" -- pre-existing account tag', async () => {
        await form.tagsCombobox.click();
        await form.tagsCombobox.fill('automation');
        // AFS step 8's live-suggestion listbox is Axis-2 "additional"
        // coverage, not part of the case's own requirement -- confirmed
        // during implementer Phase 2 exploration (2026-07-02) NOT to
        // reproduce reliably (aria-expanded stayed "false" across two
        // independent techniques), so it's checked best-effort rather than
        // hard-asserted. The chip-after-Enter behavior below is the real,
        // load-bearing assertion and reproduces every time.
        const suggestion = page.getByRole('listbox', { name: 'Tags' }).getByRole('option', { name: 'automation' });
        if (await suggestion.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await expect(suggestion).toBeVisible();
        }
        await page.keyboard.press('Enter');
        await expect(form.tagChip('automation')).toBeVisible();
      });

      await test.step('10-11. Add tag "testing" -- novel tag, no suggestion listbox required', async () => {
        await form.addTag('testing');
        await expect(form.tagChip('testing')).toBeVisible();
        await expect(form.tagChip('automation')).toBeVisible();
      });

      await test.step('12-13. Case\'s literal "qa-suite" is rejected by client-side validation (GH#35)', async () => {
        await form.tagsCombobox.click();
        await form.tagsCombobox.fill('qa-suite');
        await expect(
          page.getByText('Only alphanumeric characters, white space, comma and underscore allowed'),
        ).toBeVisible();
        await page.keyboard.press('Enter');
        await expect(form.tagChip('qa-suite')).toHaveCount(0);
      });

      await test.step('14-15. Substitute "qa_suite" (validation-compliant) -- all three tags present', async () => {
        await form.tagsCombobox.fill('');
        await form.addTag('qa_suite');
        await expect(form.tagChip('automation')).toBeVisible();
        await expect(form.tagChip('testing')).toBeVisible();
        await expect(form.tagChip('qa_suite')).toBeVisible();
      });

      await test.step('16. Remove the "testing" chip', async () => {
        await form.removeTag('testing');
        await expect(form.tagChip('testing')).toHaveCount(0);
        await expect(form.tagChip('automation')).toBeVisible();
        await expect(form.tagChip('qa_suite')).toBeVisible();
      });

      await test.step('17. Re-add "testing" to restore the full three-tag set', async () => {
        await form.addTag('testing');
        await expect(form.tagChip('automation')).toBeVisible();
        await expect(form.tagChip('qa_suite')).toBeVisible();
        await expect(form.tagChip('testing')).toBeVisible();
      });

      await test.step('18-19. Save, wait for redirect; response body has exactly the 3 committed tags', async () => {
        const { id, response } = await form.saveOnCreate();
        agentId = id;
        const body = await response.json();
        const tagNames = (body.version_details?.tags ?? [])
          .map((t: { name: string }) => t.name)
          .sort();
        expect(tagNames).toEqual(['automation', 'qa_suite', 'testing'].sort());
      });

      await test.step('20. Verify all three tags on the detail page', async () => {
        await expect(form.tagChip('automation')).toBeVisible();
        await expect(form.tagChip('qa_suite')).toBeVisible();
        await expect(form.tagChip('testing')).toBeVisible();
      });

      await test.step('21. Hard reload -- confirms server-side persistence, not just client state', async () => {
        await Promise.all([
          page.waitForResponse(
            (r) => /\/application\/prompt_lib\/\d+\/\d+$/.test(r.url()) && r.status() === 200,
          ),
          page.reload(),
        ]);
        await expect(form.tagChip('automation')).toBeVisible();
        await expect(form.tagChip('qa_suite')).toBeVisible();
        await expect(form.tagChip('testing')).toBeVisible();
      });

      await test.step('22-25. Navigate to the list, verify the card renders tags', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await expect(page).toHaveURL(/\/app\/agents\/all/);
        await agentsList.waitForFirstCard();
        const card = agentsList.cardByName(agentName);
        await expect(card).toBeVisible();
        // Card design shows 2 visible tag chips + a "+N" overflow marker
        // (confirmed live; order not guaranteed to match the field's own
        // insertion order) -- assert at least one tag or the overflow
        // marker renders, rather than a brittle exact-order match.
        await expect(card).toContainText(/automation|testing|qa_suite|\+1/);
      });

      expect(console_.errors, 'no console errors during the tags multi-select flow').toEqual([]);
    } finally {
      console_.stop();
      if (agentId !== undefined) {
        await test.step('Cleanup: delete the created agent', async () => {
          await page.goto(`${env.BASE_URL}/app/agents/all/${agentId}?viewMode=owner`);
          await form.deleteAgent(agentName);
          await expect(page).toHaveURL(/\/app\/agents\/all/);
        });
      }
    }
  });

  test('TC-018: step limit field value validation', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const agentsList = new CardGridListPage(page);
    const form = new AgentFormPage(page);
    const agentName = uniqueAgentName('TC018');
    const description = 'Agent for testing step limit values';
    let agentId: number | undefined;
    let ownerId: number | undefined;

    async function currentStepLimitFromApi(): Promise<number> {
      const response = await page.request.get(
        `${env.BASE_URL}/api/v2/elitea_core/application/prompt_lib/${ownerId}/${agentId}`,
      );
      const body = await response.json();
      return body.version_details?.meta?.step_limit;
    }

    try {
      await test.step('1-4. Navigate to the agents list, dismiss banner, open the create form', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await agentsList.waitForFirstCard();
        await dismissAnnouncementBanner(page);
        await page
          .getByRole('navigation', { name: 'side-bar' })
          .getByRole('button', { name: 'Agent', exact: true })
          .click();
        await expect(page).toHaveURL(/\/app\/agents\/create\?viewMode=owner/);
      });

      await test.step('5-6. Fill Name and Description', async () => {
        await form.nameInput.fill(agentName);
        await form.descriptionInput.fill(description);
      });

      await test.step('7-8. Advanced section is visible by default; Step limit defaults to 25', async () => {
        await expect(form.stepLimitInput).toBeVisible();
        await expect(form.stepLimitInput).toHaveValue('25');
      });

      await test.step('9-11. Set Step limit to 50, Save', async () => {
        await form.stepLimitInput.fill('50');
        await expect(form.stepLimitInput).toHaveValue('50');
        const { id, response } = await form.saveOnCreate();
        agentId = id;
        const body = await response.json();
        ownerId = body.owner_id;
      });

      await test.step('12-14. Verify Step limit is 50 -- DOM and API cross-check', async () => {
        await expect(form.stepLimitInput).toHaveValue('50');
        expect(await currentStepLimitFromApi()).toBe(50);
      });

      await test.step('15-18. Set Step limit to 100, Save, verify DOM and API', async () => {
        await form.stepLimitInput.fill('100');
        await expect(form.stepLimitInput).toHaveValue('100');
        await form.saveOnEdit();
        await expect(form.stepLimitInput).toHaveValue('100');
        expect(await currentStepLimitFromApi()).toBe(100);
      });

      await test.step('19-21. Navigate away and back via UI click-through; value still persists', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await agentsList.waitForFirstCard();
        await agentsList.clickCardByName(agentName);
        await expect(page).toHaveURL(new RegExp(`/app/agents/all/${agentId}`));
        await expect(form.stepLimitInput).toBeVisible();
        await expect(form.stepLimitInput).toHaveValue('100');
      });

      // Numeric-boundary probes (Axis 2, dispatch-requested "advanced" deep
      // dive) -- table-driven, exercising the field's own clamp/strip logic
      // beyond the case's literal 25/50/100 happy path. Client-side only,
      // nothing here is saved.
      const boundaryCases: Array<[string, string]> = [
        ['1234', '999'],
        ['0', '0'],
        [' -5', '0'],
        ['abc', ''],
        ['12.5', '12'],
      ];
      for (const [input, expected] of boundaryCases) {
        await test.step(`Boundary probe: fill("${input}") clamps to "${expected}"`, async () => {
          await form.stepLimitInput.fill(input);
          await expect(form.stepLimitInput).toHaveValue(expected);
        });
      }
      // Restore a valid value so Teardown's delete flow isn't operating on
      // a form left in the last boundary probe's stripped-empty state.
      await form.stepLimitInput.fill('100');

      expect(console_.errors, 'no console errors during the step-limit flow').toEqual([]);
    } finally {
      console_.stop();
      if (agentId !== undefined) {
        await test.step('Cleanup: delete the fixture agent', async () => {
          await page.goto(`${env.BASE_URL}/app/agents/all/${agentId}?viewMode=owner`);
          await form.deleteAgent(agentName);
          await expect(page).toHaveURL(/\/app\/agents\/all/);
        });
      }
    }
  });

  test('TC-019: navigate back without saving shows confirmation', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const agentsList = new CardGridListPage(page);
    const form = new AgentFormPage(page);
    const agentName = uniqueAgentName('TC019');
    let initialCount = 0;

    try {
      await test.step('1-3. Navigate to the agents list, wait for the card grid, dismiss banner', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await expect(page).toHaveURL(/\/app\/agents\/all/);
        await agentsList.waitForFirstCard();
        await dismissAnnouncementBanner(page);
      });

      await test.step('4. Read the "Agents: N" badge as a baseline', async () => {
        initialCount = await agentsList.totalCount();
      });

      await test.step('5. Click "Create Agent"', async () => {
        await page
          .getByRole('navigation', { name: 'side-bar' })
          .getByRole('button', { name: 'Agent', exact: true })
          .click();
        await expect(page).toHaveURL(/\/app\/agents\/create\?viewMode=owner/);
      });

      await test.step('6-7. Fill Name and Description', async () => {
        await form.nameInput.fill(agentName);
        await expect(form.nameInput).toHaveValue(agentName);
        await form.descriptionInput.fill('This data should be discarded');
      });

      await test.step('8-9. Add a tag and Guidelines; header Save transitions to enabled (dirty)', async () => {
        await form.addTag('unsaved');
        await expect(form.tagChip('unsaved')).toBeVisible();
        await form.guidelinesInput.fill('Test unsaved guidelines');
        await expect(form.saveButton).toBeEnabled();
      });

      await test.step('10-12. Click the Back arrow, confirm the "Warning" leave dialog (distinct from Cancel\'s "Warning Close" -- GH#36)', async () => {
        await form.clickBackAndConfirmLeave();
        await expect(page).toHaveURL(/\/app\/agents\/all/);
      });

      await test.step('13-14. URL returns to the agents list', async () => {
        await agentsList.waitForFirstCard();
      });

      await test.step('15. Search for the generated name -- confirm no agent was created', async () => {
        const response = await agentsList.searchAndAwaitResults(agentName);
        const body = await response.json();
        expect(body.application?.total, 'search_options application.total should be 0').toBe(0);
        // Corrected 2026-07-02 per implementer live re-verification (the
        // AFS's original claim of "No agents yet" did not reproduce --
        // see the docs(afs) amendment in this same PR).
        await expect(agentsList.noAgentsMatchText()).toBeVisible();
      });

      await test.step('16. "Agents: N" badge never decreases below the baseline (informational, shared account)', async () => {
        await agentsList.searchInput.fill('');
        const finalCount = await agentsList.totalCount();
        expect(finalCount).toBeGreaterThanOrEqual(initialCount);
      });

      expect(console_.errors, 'no console errors during the back-navigation-discard flow').toEqual([]);
    } finally {
      console_.stop();
    }
  });
});
