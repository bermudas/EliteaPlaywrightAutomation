import {
  test as base,
  expect,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
  type Response,
} from '@playwright/test';
import { env } from './fixtures/env';
import { uniqueEntityName } from './fixtures/testData';
import { CardGridListPage } from './pages/cardGridList.page';
import { ConversationPage } from './pages/conversation.page';
import { EntityFormPage, dismissAnnouncementBanner } from './pages/entityForm.page';
import { closeWelcomeModalIfPresent, expectNoDialog } from './pages/modal.page';

/**
 * @modal-handling suite -- TC-050, TC-051, TC-052, TC-054, TC-055, TC-056,
 * implemented from the AFS files at test-specs/modal-handling/l*_*_TC-0{50,
 * 51,52,54,55,56}.md (analyst: qa-engineer, implementer:
 * test-automation-engineer). Module-per-spec-file per `.agents/testing.md`
 * § Structure. TC-053 (`lcovered_confirm-delete-action-via-modal_TC-053.md`,
 * status `already-covered`) is a traceability-only AFS -- fully satisfied by
 * `tests/agents.spec.ts:422` (TC-013) -- and deliberately has NO
 * corresponding `test()` here; see that AFS for the dedup proof.
 *
 * Like `tests/agents.spec.ts`/`tests/pipelines.spec.ts` and UNLIKE
 * `tests/smoke.spec.ts`, this suite does NOT use `mode: 'serial'` -- every
 * one of the six AFS files in this batch independently confirmed its own
 * case is self-contained (lighter-weight modal-interaction checks, mostly
 * read-only, and the two that DO mutate state -- TC-052/TC-055 -- create and
 * tear down their own disposable conversation fixture rather than depending
 * on a sibling case's end-state). Confirmed during Phase 1 Absorb by reading
 * every AFS's own "Automation Hints" section, each of which states this
 * explicitly.
 *
 * New page objects this module's own exploration required (per
 * `.agents/testing.md` § Structure's own plan to "extend whichever pattern
 * agents/pipelines' delete-confirm and unsaved-changes modals establish --
 * don't build a separate one from scratch"):
 *   - `tests/pages/conversation.page.ts` -- the "Conversation not found"
 *     modal and the conversation-specific delete-confirmation dialog
 *     (confirmed live, GH#69, to be a materially simpler, distinct
 *     component from the Agent/Pipeline entity delete-confirmation dialog
 *     already in `entityForm.page.ts` -- NOT reused/conflated for
 *     conversations), plus the disposable-conversation-fixture lifecycle
 *     TC-052/TC-055 both independently established.
 *   - `tests/pages/modal.page.ts` -- the page/domain-agnostic "no dialog
 *     remains" standing guard (repeated 3+ times across this module's own
 *     cases, crossing Hard Rule 7's extraction threshold) and the
 *     genuinely-conditional welcome-modal check TC-051/GH#66 established.
 * TC-054/TC-056 need no new page-object code at all -- both reuse
 * `entityForm.page.ts`'s existing Agent form handles and its already-proven
 * "Warning" (Back-arrow) unsaved-changes dialog unchanged.
 *
 * Auth: same worker-scoped-storageState + test-scoped-context pattern as
 * `tests/agents.spec.ts`/`tests/pipelines.spec.ts` (see either file's own
 * doc comment for the full rationale). This is the THIRD spec file to
 * duplicate this exact fixture pair -- `tests/pipelines.spec.ts`'s own doc
 * comment already flagged staying under Hard Rule 7's "extract on the 3rd
 * repetition" threshold at its own 2nd occurrence. Duplicated here anyway
 * (not extracted) because extracting now would mean editing two
 * already-merged shared-caller files (`tests/agents.spec.ts`,
 * `tests/pipelines.spec.ts`) outside this module's own scope -- a
 * framework-scale refactor that belongs to Tal/orchestrator to schedule
 * explicitly, not something to fold silently into this PR. Flagging for
 * Tal: this crosses the exact trigger point the pipelines-module
 * implementer anticipated.
 */

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

const test = base.extend<
  { authenticatedPage: Page },
  { modalHandlingStorageState: StorageState }
>({
  modalHandlingStorageState: [
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
      // dismissed state; if it isn't, each mutating helper dismisses it
      // defensively anyway (GH#42).
      await dismissAnnouncementBanner(page);
      const storageState = await context.storageState();
      await context.close();
      await use(storageState);
    },
    // Same generous timeout rationale as tests/agents.spec.ts/pipelines.spec.ts
    // -- a real Keycloak round-trip observed anywhere from ~3s to ~14s across
    // implementation runs against the shared live environment.
    { scope: 'worker', timeout: 60_000 },
  ],
  authenticatedPage: async ({ browser, modalHandlingStorageState }, use) => {
    const context = await browser.newContext({ storageState: modalHandlingStorageState });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

/**
 * Suite-local helper: collects console `error`-level messages for the
 * duration it's attached. This is the FOURTH spec file duplicating this
 * exact helper (`tests/smoke.spec.ts` -> `tests/agents.spec.ts` ->
 * `tests/pipelines.spec.ts` -> here) -- `tests/pipelines.spec.ts`'s own doc
 * comment explicitly flagged extraction "once a 4th spec file would
 * otherwise repeat this a 4th time," which is exactly this file. NOT
 * extracted in this PR for the same reason the shared auth-fixture pair
 * above wasn't: doing so means editing three already-merged shared-caller
 * files, a framework-scale refactor outside this module's own scope.
 * Flagging for Tal to schedule `chore(test): extract trackConsoleErrors to
 * tests/fixtures/` explicitly rather than folding it in here silently.
 */
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

/** Tracks whether any DELETE request matching the conversation-lifecycle
 * endpoint fires while attached -- used by TC-052/TC-055's Cancel-path
 * assertions to prove the negative (no destructive call), not just DOM
 * absence of the dialog (per each AFS's own Axis 2 addition). */
function trackConversationDeleteRequests(page: Page) {
  let fired = false;
  const listener = (response: Response) => {
    if (/\/conversation\/prompt_lib\/\d+\/\d+$/.test(response.url()) && response.request().method() === 'DELETE') {
      fired = true;
    }
  };
  page.on('response', listener);
  return {
    fired: () => fired,
    stop: () => page.off('response', listener),
  };
}

test.describe('@modal-handling', () => {
  // Several real sequential network round-trips per case (conversation
  // create/delete lifecycle, agent detail reload) against the shared live
  // environment -- same rationale as tests/agents.spec.ts/pipelines.spec.ts.
  test.describe.configure({ timeout: 60_000 });

  test('TC-050: close conversation not found modal', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const conversations = new ConversationPage(page);

    try {
      await test.step('1. Navigate to /app/chat/all -- chat shell renders', async () => {
        await page.goto(`${env.BASE_URL}/app/chat/all`);
      });

      const dialog = conversations.conversationNotFoundDialog();

      await test.step('2. Wait up to 15s for the "Conversation not found" dialog (typically resolves in 1-3s)', async () => {
        await expect(dialog).toBeVisible({ timeout: 15_000 });
        await expect(dialog).toContainText(
          "The conversation you are looking for does not exist in your project or you don't have access to it. For sharing links, please use the Share option in the conversation menu.",
        );
      });

      await test.step('3. Verify "Got it" is the dialog\'s sole action, visible and enabled', async () => {
        const gotIt = dialog.getByRole('button', { name: 'Got it' });
        await expect(gotIt).toBeVisible();
        await expect(gotIt).toBeEnabled();
      });

      await test.step('4. Click "Got it" -- dialog and backdrop removed; app navigates into an existing conversation (id/name vary per run/account, not asserted -- see AFS Step 4 note)', async () => {
        await dialog.getByRole('button', { name: 'Got it' }).click();
        await expectNoDialog(page);
        await expect(page.locator('.MuiBackdrop-root, .MuiModal-backdrop')).toHaveCount(0);
        await expect(page).not.toHaveURL(/\/app\/chat\/all$/);
      });

      await test.step('5. Chat interface is interactive -- probe text lands in the input and clears cleanly (no submit, read-only)', async () => {
        await page.getByTestId('chat-input').click();
        await page.keyboard.type('interactivity probe');
        const messageTextarea = page.locator('#standard-multiline-static');
        await expect(messageTextarea).toHaveValue('interactivity probe');
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.press('Delete');
        await expect(messageTextarea).toHaveValue('');
      });

      expect(console_.errors, 'no console errors during the conversation-not-found flow').toEqual([]);
    } finally {
      console_.stop();
    }
  });

  test('TC-051: close welcome modal if appears', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);

    try {
      await test.step('1. Navigate to /app/chat/ (not /all -- GH#67: the literal case URL collides with TC-050\'s own "not found" dialog instead of loading cleanly)', async () => {
        await page.goto(`${env.BASE_URL}/app/chat/`);
        await expect(page).not.toHaveURL(/auth\.elitea\.ai/);
      });

      await test.step('2. Wait for the page to stabilize (condition wait, not the case\'s literal "wait 3 seconds")', async () => {
        await expect(page.getByTestId('chat-input')).toBeVisible();
      });

      let modalWasPresent = false;
      await test.step('3-5. Check for a welcome/onboarding dialog; dismiss if present -- absence is an equally valid outcome (GH#66: not reproducible for ${TEST_USER} under any tested condition)', async () => {
        modalWasPresent = await closeWelcomeModalIfPresent(page);
      });

      await test.step('6. Verify no dialog remains, regardless of which branch fired', async () => {
        await expectNoDialog(page);
      });

      await test.step('Verify the page is interactive: sidebar renders, quick-create button is enabled (not just visible)', async () => {
        const sidebar = page.getByRole('navigation', { name: 'side-bar' });
        await expect(sidebar).toBeVisible();
        // Case's own "Create" button hint does not exist -- accessible name
        // is "Conversation" (GH#9, already tracked, not re-filed).
        const quickCreate = sidebar.getByRole('button', { name: 'Conversation', exact: true });
        await expect(quickCreate).toBeVisible();
        await expect(quickCreate).toBeEnabled();
      });

      // Informational only -- this test does not require the "modal
      // present" branch to ever fire (see AFS Known Defects / GH#66); the
      // annotation makes the actual branch taken visible in the HTML/JSON
      // report without turning it into a pass/fail condition.
      test.info().annotations.push({
        type: 'welcome-modal-branch',
        description: modalWasPresent
          ? 'a welcome/onboarding dialog was present and was dismissed'
          : 'no welcome/onboarding dialog appeared (confirmed live steady state for this account, GH#66)',
      });

      expect(console_.errors, 'no console errors during the welcome-modal-check flow').toEqual([]);
    } finally {
      console_.stop();
    }
  });

  test('TC-052: cancel delete confirmation modal', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const conversations = new ConversationPage(page);
    const fixtureName = `TC052_Cancel_Fixture_${Date.now()}`;
    let fixtureCreated = false;

    try {
      await test.step('1-2. Navigate to /app/chat/all, dismiss the "Conversation not found" dialog that deterministically intervenes first (GH#67 -- a different modal than this case\'s own subject)', async () => {
        await page.goto(`${env.BASE_URL}/app/chat/all`);
        await conversations.dismissConversationNotFoundModal();
      });

      await test.step('3. Sidebar conversation list is present', async () => {
        await expect(page.getByText('Conversations')).toBeVisible();
      });

      await test.step('Setup: create a disposable conversation fixture (data-collision guard -- exercises the full cancel-survives lifecycle without risking shared/pre-existing conversations)', async () => {
        await conversations.createFixture(fixtureName);
        fixtureCreated = true;
      });

      await test.step('4-6. Open the fixture row\'s kebab menu, click "Delete" -- the conversation-specific delete-confirmation dialog opens', async () => {
        await conversations.openDeleteDialog(fixtureName);
      });

      await test.step('7. Verify modal content: heading, body text, Cancel/Delete buttons (Delete enabled immediately -- no type-exact-name gate, GH#69, distinct from the Agent/Pipeline dialog)', async () => {
        const dialog = conversations.conversationDeleteDialog();
        await expect(dialog.getByRole('heading', { name: 'Delete conversation?' })).toBeVisible();
        await expect(dialog).toContainText("Are you sure to delete conversation? It can't be restored.");
        await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
        await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled();
      });

      const deleteWatcher = trackConversationDeleteRequests(page);

      await test.step('8. Click "Cancel" -- dialog closes, no navigation occurs', async () => {
        await conversations.cancelDelete();
        await expectNoDialog(page);
      });

      await test.step('9. Verify the fixture conversation still exists, and no DELETE request fired on the Cancel path (Axis 2 -- stronger than DOM absence alone)', async () => {
        await expect(conversations.conversationRow(fixtureName)).toBeVisible();
        expect(deleteWatcher.fired(), 'no DELETE request should fire on the Cancel path').toBe(false);
      });
      deleteWatcher.stop();

      await test.step('Axis 2: a second, independent dismiss path (Escape key) produces the identical non-destructive outcome', async () => {
        await conversations.openDeleteDialog(fixtureName);
        await conversations.dismissDeleteDialogViaEscape();
        await expectNoDialog(page);
        await expect(conversations.conversationRow(fixtureName)).toBeVisible();
      });

      await test.step('Axis 2: persistence survives a hard reload (full server round-trip, not client-cache)', async () => {
        await page.reload();
        await expect(conversations.conversationRow(fixtureName)).toBeVisible();
      });

      expect(console_.errors, 'no console errors during the cancel-delete-confirmation flow').toEqual([]);
    } finally {
      console_.stop();
      if (fixtureCreated) {
        await test.step('Cleanup: delete the disposable fixture conversation for real', async () => {
          await conversations.deleteFixture(fixtureName);
        });
      }
    }
  });

  test('TC-054: dismiss unsaved changes modal', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const form = new EntityFormPage(page, 'agent');
    const agentsList = new CardGridListPage(page);
    const modifiedDescription = `MODIFIED_DESCRIPTION_TEMP_${Date.now()}`;
    let originalDescription = '';
    let agentId: number | undefined;

    try {
      await test.step('1. Navigate to the agents list (no [role="dialog"] expected on this route; only the dismissible release-notes banner may appear)', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await expect(page).toHaveURL(/\/app\/agents\/all/);
        await agentsList.waitForFirstCard();
      });

      await test.step('2. Click the first agent card/row in the list -- reuses whichever agent happens to be first (read-only-by-default, Hard Rule 10 -- no fixture needed for a discard-only flow)', async () => {
        await agentsList.firstCard().click();
        await expect(page).toHaveURL(/\/app\/agents\/all\/\d+/);
        const idMatch = page.url().match(/\/app\/agents\/all\/(\d+)/);
        if (!idMatch) {
          throw new Error(`Expected agent detail URL to contain a numeric id, got: ${page.url()}`);
        }
        agentId = Number(idMatch[1]);
      });

      await test.step('3. Locate the Description field, record its original value', async () => {
        await expect(form.descriptionInput).toBeVisible();
        originalDescription = await form.descriptionInput.inputValue();
      });

      await test.step('4. Clear and fill Description with the modified value -- header Save transitions to enabled (dirty-state signal, used as the wait condition instead of a fixed sleep)', async () => {
        await form.descriptionInput.fill(modifiedDescription);
        await expect(form.descriptionInput).toHaveValue(modifiedDescription);
        await expect(form.saveButton).toBeEnabled();
      });

      await test.step('5-6. Click the Back-arrow -- the "Warning" dialog appears (Cancel/Confirm; NOT the toolbar-Discard-triggered "Warning Close" variant -- see AFS Known Defects Finding 2, a distinct trigger this case does not use). The banner (if present) is dismissed internally by this same helper.', async () => {
        await form.clickBackAndConfirmLeave();
      });

      await test.step('7-8. Dialog closed the flow navigated to the agents list (leave/discard, functional equivalent of the case\'s own "Discard")', async () => {
        await expect(page).toHaveURL(new RegExp(`/app/agents/all\\?viewMode=owner`));
      });

      await test.step('9-10. Reopen the same agent detail page; Description reflects the ORIGINAL value, not the discarded edit', async () => {
        const [response] = await Promise.all([
          page.waitForResponse(
            (r) => /\/application\/prompt_lib\/\d+\/\d+$/.test(r.url()) && r.status() === 200,
          ),
          page.goto(`${env.BASE_URL}/app/agents/all/${agentId}?viewMode=owner`),
        ]);
        await expect(form.descriptionInput).toHaveValue(originalDescription);
        // Axis 2: race-free, server-side proof the edit was never persisted
        // (mirrors TC-019/TC-015's own search_options-based "not created"
        // pattern, applied here to "not modified").
        const body = await response.json();
        expect(body.description, 'server-side description should be unchanged').toBe(originalDescription);
      });

      expect(
        console_.errors,
        'no console errors during the modify -> Back-arrow -> Confirm -> reload -> verify flow',
      ).toEqual([]);
    } finally {
      console_.stop();
    }
  });

  test('TC-055: multiple modals in sequence', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const conversations = new ConversationPage(page);
    const fixtureName = `TC055_Fixture_${Date.now()}`;
    let fixtureCreated = false;

    async function expectAtMostOneDialog(): Promise<void> {
      expect(
        await page.getByRole('dialog').count(),
        'the app never mounts two [role="dialog"] elements simultaneously',
      ).toBeLessThanOrEqual(1);
    }

    try {
      await test.step('1-3. Navigate to /app/chat/all -- the first modal ("Conversation not found") appears within the 15s allowance', async () => {
        await page.goto(`${env.BASE_URL}/app/chat/all`);
        await expect(conversations.conversationNotFoundDialog()).toBeVisible({ timeout: 15_000 });
        await expectAtMostOneDialog();
      });

      await test.step('4. Click "Got it" -- first modal closes, 0 dialogs remain', async () => {
        await conversations.conversationNotFoundDialog().getByRole('button', { name: 'Got it' }).click();
        await expectNoDialog(page);
      });

      await test.step('Setup: create a disposable conversation fixture (data-collision guard, this module\'s high-parallelism convention -- avoids mutating shared/pre-existing conversations)', async () => {
        await conversations.createFixture(fixtureName);
        fixtureCreated = true;
      });

      const deleteWatcher = trackConversationDeleteRequests(page);

      await test.step('4-6 (case numbering). Locate the fixture row, hover to reveal its kebab, click it, then click "Delete" -- second modal appears; never coexists with a first', async () => {
        await conversations.openConversationMenu(fixtureName);
        await expectAtMostOneDialog();
        await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
        await expect(conversations.conversationDeleteDialog()).toBeVisible();
        await expectAtMostOneDialog();
      });

      await test.step('7-9. Verify second modal content (heading "Delete conversation?", confirmation paragraph -- case text assumed "Confirm", live button is "Delete", GH#69)', async () => {
        const dialog = conversations.conversationDeleteDialog();
        await expect(dialog.getByRole('heading', { name: 'Delete conversation?' })).toBeVisible();
        await expect(dialog).toContainText("Are you sure to delete conversation? It can't be restored.");
      });

      await test.step('10-11. Click "Cancel" -- second modal closes, no `[role="dialog"]` remains', async () => {
        await conversations.cancelDelete();
        await expectNoDialog(page);
      });

      await test.step('12. Verify the conversation still exists in the sidebar list, and no DELETE request fired on the Cancel path', async () => {
        await expect(conversations.conversationRow(fixtureName)).toBeVisible();
        expect(deleteWatcher.fired(), 'no DELETE request should fire on the Cancel path').toBe(false);
      });
      deleteWatcher.stop();

      expect(console_.errors, 'no console errors during the multiple-modals-in-sequence flow').toEqual([]);
    } finally {
      console_.stop();
      if (fixtureCreated) {
        await test.step('Cleanup: delete the disposable fixture conversation for real', async () => {
          await conversations.deleteFixture(fixtureName);
        });
      }
    }
  });

  test('TC-056: modal appears during form fill', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const form = new EntityFormPage(page, 'agent');
    const agentName = uniqueEntityName('TC056_Modal');
    const description = 'Test for modal interception during form fill';
    let agentId: number | undefined;

    try {
      await test.step('1. Navigate to the agents list', async () => {
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await expect(page).toHaveURL(/\/app\/agents\/all/);
        await expect(page).toHaveTitle(/Agents/);
      });

      await test.step('2. Dismiss the release-notes banner if present (GH#42) -- no [role="dialog"] is expected on this route (confirmed live)', async () => {
        await dismissAnnouncementBanner(page);
        await expectNoDialog(page);
      });

      await test.step('3. Click the sidebar "Create Agent" control (accessible name is "Agent", not "Create Agent" -- GH#30)', async () => {
        await page
          .getByRole('navigation', { name: 'side-bar' })
          .getByRole('button', { name: 'Agent', exact: true })
          .click();
        await expect(page).toHaveURL(/\/app\/agents\/create\?viewMode=owner/);
      });

      await test.step('4-5. Fill "Name" with the first 5 characters only', async () => {
        await expect(form.nameInput).toBeVisible();
        await form.nameInput.fill('TEST_');
        await expect(form.nameInput).toHaveValue('TEST_');
      });

      let newTab: Page | undefined;
      await test.step('6-7. New-tab variant (primary, non-destructive per AFS/GH#68): open a second tab in the SAME context, navigate it to /app/chat/all -- the "Conversation not found" modal appears there, not in the original tab', async () => {
        newTab = await page.context().newPage();
        const newTabConversations = new ConversationPage(newTab);
        await newTab.goto(`${env.BASE_URL}/app/chat/all`);
        await expect(newTabConversations.conversationNotFoundDialog()).toBeVisible({ timeout: 15_000 });
      });

      await test.step('8. Original tab is completely untouched -- "Name" field still contains "TEST_"', async () => {
        await expect(page).toHaveURL(/\/app\/agents\/create\?viewMode=owner/);
        await expect(form.nameInput).toHaveValue('TEST_');
      });

      await test.step('9-10. Dismiss the modal in the second tab, close it -- no navigation ever occurred in the original tab, so there is nothing to "navigate back" to', async () => {
        const newTabConversations = new ConversationPage(newTab!);
        await newTabConversations.dismissConversationNotFoundModal();
        await newTab!.close();
      });

      await test.step('11. Original tab: "Name" field still contains "TEST_" -- form state fully preserved (the new-tab variant\'s confirmed branch; the alternative "field is empty" branch is only reachable via the same-window variant, GH#68, not exercised here)', async () => {
        await expect(form.nameInput).toHaveValue('TEST_');
      });

      await test.step('12. Re-fill "Name" with the full generated value', async () => {
        await form.nameInput.fill(agentName);
        await expect(form.nameInput).toHaveValue(agentName);
      });

      await test.step('13. Fill "Description"', async () => {
        await form.descriptionInput.fill(description);
        await expect(form.descriptionInput).toHaveValue(description);
      });

      await test.step('14-15. Wait for Save to become enabled, click it -- agent created despite the mid-fill modal interruption', async () => {
        await expect(form.saveButton).toBeEnabled();
        const { id } = await form.saveOnCreate();
        agentId = id;
        await expect(page).toHaveTitle(new RegExp(`Agent: ${agentName}`));
      });

      await test.step('16-17. Navigate to the agents list; the new agent\'s card is present', async () => {
        const agentsList = new CardGridListPage(page);
        await page.goto(`${env.BASE_URL}/app/agents/all`);
        await agentsList.waitForFirstCard();
        await expect(agentsList.cardByName(agentName)).toBeVisible();
      });

      expect(console_.errors, 'no console errors during the modal-during-form-fill flow').toEqual([]);
    } finally {
      console_.stop();
      if (agentId !== undefined) {
        await test.step('Cleanup: delete the created agent', async () => {
          await page.goto(`${env.BASE_URL}/app/agents/all/${agentId}?viewMode=owner`);
          await form.deleteEntity(agentName);
          await expect(page).toHaveURL(/\/app\/agents\/all/);
        });
      }
    }
  });
});
