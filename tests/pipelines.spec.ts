import {
  test as base,
  expect,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
} from '@playwright/test';
import { env } from './fixtures/env';
import { uniquePipelineName } from './fixtures/testData';
import { CardGridListPage } from './pages/cardGridList.page';
import { EntityFormPage, dismissAnnouncementBanner } from './pages/entityForm.page';

/**
 * @pipelines suite -- TC-020 through TC-029, implemented from the AFS files
 * at test-specs/pipelines/l*_*_TC-02{0..9}.md (analyst: qa-engineer,
 * implementer: test-automation-engineer). Module-per-spec-file per
 * `.agents/testing.md` § Structure "Growing past smoke" plan.
 *
 * Like `tests/agents.spec.ts` and UNLIKE `tests/smoke.spec.ts`, this suite
 * does NOT use `mode: 'serial'` -- every one of the ten pipelines-module AFS
 * files independently confirmed its own case is self-contained (creates and
 * tears down its own fixture pipeline, no dependency on a sibling case's
 * end-state). Confirmed during Phase 1 Absorb by reading all 10 AFS files'
 * own "Automation Hints" sections, each of which states this explicitly.
 *
 * Architecture note: the Agents and Pipelines create/edit forms are
 * confirmed (across all 10 AFS files in this batch) to be the literal same
 * underlying component -- identical `data-testid="agent-save-button"`,
 * identical 32-char Name cap, identical delete-confirmation dialog
 * (including the same broken `id="undefined-action"` kebab button and dead
 * `aria-labelledby`), identical Cancel/Back-arrow dialog pair. Per this
 * batch's dispatch, `tests/pages/agentForm.page.ts` was generalized into
 * `tests/pages/entityForm.page.ts` (a parametrized `EntityFormPage`, keyed
 * by `entityType: 'agent' | 'pipeline'`) rather than forking a near-duplicate
 * `pipelineForm.page.ts` -- see that file's own doc comment for the full
 * evidence trail. `tests/agents.spec.ts` was updated in the same PR to
 * consume the renamed/generalized class and re-verified end-to-end (see the
 * Run Report) to confirm zero regressions from the rename.
 *
 * Auth: same worker-scoped-storageState + test-scoped-context pattern as
 * `tests/agents.spec.ts` (see that file's own doc comment for the full
 * rationale, including why the fixture-graph approach was chosen over
 * `test.use({ storageState })` + `beforeAll`). Duplicated here rather than
 * extracted to a shared fixtures module -- this is only the 2nd spec file
 * needing it, under Hard Rule 7's "extract on the 3rd repetition" threshold
 * (the same reasoning `tests/agents.spec.ts` already applied to its own
 * `trackConsoleErrors` helper, duplicated from `tests/smoke.spec.ts`).
 */

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

const test = base.extend<
  { authenticatedPage: Page },
  { pipelinesStorageState: StorageState }
>({
  pipelinesStorageState: [
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
      // dismissed state; if it isn't, each mutating EntityFormPage method
      // dismisses it defensively anyway (GH#42).
      await dismissAnnouncementBanner(page);
      const storageState = await context.storageState();
      await context.close();
      await use(storageState);
    },
    // Same generous timeout rationale as tests/agents.spec.ts -- a real
    // Keycloak round-trip observed anywhere from ~3s to ~14s across
    // implementation runs against the shared live environment.
    { scope: 'worker', timeout: 60_000 },
  ],
  authenticatedPage: async ({ browser, pipelinesStorageState }, use) => {
    const context = await browser.newContext({ storageState: pipelinesStorageState });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

/** Suite-local helper: collects console `error`-level messages for the
 * duration it's attached. Duplicated from `tests/agents.spec.ts` (itself
 * duplicated from `tests/smoke.spec.ts`) -- this is the 3rd spec file
 * needing it, which crosses Hard Rule 7's "extract on the 3rd repetition"
 * threshold. Flagged here rather than extracted mid-PR (extraction would
 * touch `tests/smoke.spec.ts` and `tests/agents.spec.ts`, both
 * already-merged shared-caller files, which is a framework-scale
 * refactor outside this PR's scope) -- recommend Tal schedule a follow-up
 * `chore(test): extract trackConsoleErrors to tests/fixtures/` once a 4th
 * spec file would otherwise repeat this a 4th time. */
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

test.describe('@pipelines', () => {
  // Same rationale as tests/agents.spec.ts -- several real sequential
  // network round-trips per case against the shared live environment.
  test.describe.configure({ timeout: 60_000 });

  test('TC-020: create pipeline with minimal required fields', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const pipelinesList = new CardGridListPage(page);
    const form = new EntityFormPage(page, 'pipeline');
    const pipelineName = uniquePipelineName('TC020_Pipe_Min');
    const description = 'Minimal test pipeline created for QA validation';
    let pipelineId: number | undefined;

    try {
      await test.step('1-2. Navigate to the pipelines list, wait for the card grid', async () => {
        await page.goto(`${env.BASE_URL}/app/pipelines/all`);
        await expect(page).toHaveURL(/\/app\/pipelines\/all/);
        await expect(page).toHaveTitle(/Pipelines/);
        await pipelinesList.waitForFirstCard();
      });

      await test.step('3. Dismiss any blocking modal/banner if present', async () => {
        await dismissAnnouncementBanner(page);
      });

      await test.step('4. Click the "Create Pipeline" control in the sidebar', async () => {
        await page
          .getByRole('navigation', { name: 'side-bar' })
          .getByRole('button', { name: 'Pipeline', exact: true })
          .click();
        await expect(page).toHaveURL(/\/app\/pipelines\/create\?viewMode=owner/);
      });

      await test.step('5. Verify Save is disabled', async () => {
        await expect(form.saveButton).toBeDisabled();
      });

      await test.step('6. Fill Name', async () => {
        await form.nameInput.fill(pipelineName);
        // Read back the actual value -- guards the GH#27 silent-truncation
        // risk instead of trusting `fill()` alone.
        await expect(form.nameInput).toHaveValue(pipelineName);
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

      await test.step('10-11. Click Save, wait for redirect to the pipeline detail page', async () => {
        const { id } = await form.saveOnCreate();
        pipelineId = id;
        await expect(page).toHaveURL(new RegExp(`/app/pipelines/all/${id}`));
        await expect(page).toHaveTitle(new RegExp(`Pipeline: ${escapeRegExp(pipelineName)}`));
      });

      await test.step('12. Verify the created pipeline appears in the pipelines list', async () => {
        await page.goto(`${env.BASE_URL}/app/pipelines/all`);
        await pipelinesList.waitForFirstCard();
        await expect(pipelinesList.cardByName(pipelineName)).toBeVisible();
      });

      expect(console_.errors, 'no console errors during the create-minimal flow').toEqual([]);
    } finally {
      console_.stop();
      if (pipelineId !== undefined) {
        await test.step('Cleanup: delete the created pipeline', async () => {
          await page.goto(`${env.BASE_URL}/app/pipelines/all/${pipelineId}?viewMode=owner`);
          // deleteEntity() waits for the post-delete redirect internally
          // (confirmed live to auto-redirect for both entity types -- see
          // that method's own doc comment for the AFS incidental claim
          // that didn't hold up).
          await form.deleteEntity(pipelineName);
          await expect(page).toHaveURL(/\/app\/pipelines\/all/);
        });
      }
    }
  });

  test('TC-021: create pipeline with all fields filled', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const form = new EntityFormPage(page, 'pipeline');
    const data = {
      name: uniquePipelineName('TC021_Pipeline'),
      description: 'Full test pipeline with all fields populated',
      tags: ['test', 'automation', 'pipeline'],
      welcomeMessage: 'Hello! This is a test pipeline. How can I help you?',
      conversationStarters: ['What can this pipeline do?', 'Show me an example workflow'],
      stepLimit: '60',
    };
    let pipelineId: number | undefined;

    try {
      await test.step('1. Navigate to the pipelines list', async () => {
        await page.goto(`${env.BASE_URL}/app/pipelines/all`);
        await expect(page).toHaveURL(/\/app\/pipelines\/all/);
        await new CardGridListPage(page).waitForFirstCard();
      });

      await test.step('2. Dismiss any blocking modal/banner if present', async () => {
        await dismissAnnouncementBanner(page);
      });

      await test.step('3. Click the sidebar create-pipeline control', async () => {
        await page
          .getByRole('navigation', { name: 'side-bar' })
          .getByRole('button', { name: 'Pipeline', exact: true })
          .click();
        await expect(page).toHaveURL(/\/app\/pipelines\/create\?viewMode=owner/);
      });

      await test.step('4. Fill Name', async () => {
        await form.nameInput.fill(data.name);
        await expect(form.nameInput).toHaveValue(data.name);
      });

      await test.step('5. Fill Description', async () => {
        await form.descriptionInput.fill(data.description);
        await expect(form.descriptionInput).toHaveValue(data.description);
      });

      await test.step('6. Add tags: test, automation, pipeline', async () => {
        for (const tag of data.tags) {
          await form.addTag(tag);
          await expect(form.tagChip(tag)).toBeVisible();
        }
      });

      await test.step('7. Welcome message / Conversation starters / Advanced sections are already expanded', async () => {
        await expect(form.welcomeMessageInput).toBeVisible();
        await expect(form.addStarterButton).toBeVisible();
        await expect(form.stepLimitInput).toBeVisible();
      });

      await test.step('8. Fill Welcome message', async () => {
        await form.welcomeMessageInput.fill(data.welcomeMessage);
        await expect(form.welcomeMessageInput).toHaveValue(data.welcomeMessage);
      });

      await test.step('9-13. Add both conversation starters', async () => {
        for (const starter of data.conversationStarters) {
          await form.addConversationStarter(starter);
        }
        await expect(form.conversationStarterInput(0)).toHaveValue(data.conversationStarters[0]);
        await expect(form.conversationStarterInput(1)).toHaveValue(data.conversationStarters[1]);
      });

      await test.step('14. Fill Step limit (replaces the pre-filled "25" default via .fill())', async () => {
        await form.stepLimitInput.fill(data.stepLimit);
        await expect(form.stepLimitInput).toHaveValue(data.stepLimit);
      });

      await test.step('15-16. Click Save, verify the create response body and the redirect', async () => {
        const { id, response } = await form.saveOnCreate();
        pipelineId = id;
        const body = await response.json();
        const tagNames = (body.version_details?.tags ?? [])
          .map((t: { name: string }) => t.name)
          .sort();
        expect(tagNames).toEqual([...data.tags].sort());
        expect(body.version_details?.conversation_starters).toEqual(data.conversationStarters);
        expect(body.version_details?.meta?.step_limit).toBe(Number(data.stepLimit));
        // Known defect: GH#43 -- the Welcome Message field's value is
        // silently dropped from the create payload under fast, automated
        // field entry (confirmed 2/2 on this exact Pipelines form by
        // TC-028's analyst; same shared entity-form component as the
        // already-confirmed Agents-side defect). Soft-asserted so this
        // isolated defect doesn't block the rest of this test's coverage;
        // will turn green automatically once the product fixes it.
        expect
          .soft(body.version_details?.welcome_message, 'Known defect: GH#43')
          .toBe(data.welcomeMessage);
        await expect(page).toHaveURL(new RegExp(`/app/pipelines/all/${id}`));
      });

      await test.step('17-18. Verify all field values persisted on the detail page', async () => {
        await expect(form.nameInput).toHaveValue(data.name);
        await expect(form.descriptionInput).toHaveValue(data.description);
        for (const tag of data.tags) {
          await expect(form.tagChip(tag)).toBeVisible();
        }
        // Known defect: GH#43 -- see the soft-assert above; the field
        // reflects the same (incorrectly empty) persisted state here.
        await expect.soft(form.welcomeMessageInput, 'Known defect: GH#43').toHaveValue(data.welcomeMessage);
        await expect(form.conversationStarterInput(0)).toHaveValue(data.conversationStarters[0]);
        await expect(form.conversationStarterInput(1)).toHaveValue(data.conversationStarters[1]);
        await expect(form.stepLimitInput).toHaveValue(data.stepLimit);
      });

      expect(console_.errors, 'no console errors during the create-full-fields flow').toEqual([]);
    } finally {
      console_.stop();
      if (pipelineId !== undefined) {
        await test.step('Cleanup: delete the created pipeline', async () => {
          await page.goto(`${env.BASE_URL}/app/pipelines/all/${pipelineId}?viewMode=owner`);
          await form.deleteEntity(data.name);
          await expect(page).toHaveURL(/\/app\/pipelines\/all/);
        });
      }
    }
  });

  test('TC-022: edit existing pipeline', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const pipelinesList = new CardGridListPage(page);
    const form = new EntityFormPage(page, 'pipeline');
    const originalName = uniquePipelineName('TC022_Edit');
    const updatedName = `${originalName}_UPDATED`;
    const originalDescription = 'Original description';
    const updatedDescription = 'Updated description for edit test case';
    let pipelineId: number | undefined;

    try {
      await test.step('Setup: create a throwaway fixture pipeline to edit', async () => {
        await page.goto(`${env.BASE_URL}/app/pipelines/create?viewMode=owner`);
        await dismissAnnouncementBanner(page);
        await form.fillMinimal(originalName, originalDescription);
        const { id } = await form.saveOnCreate();
        pipelineId = id;
      });

      await test.step('1-2. Navigate to the pipelines list, wait for the card grid', async () => {
        await page.goto(`${env.BASE_URL}/app/pipelines/all`);
        await expect(page).not.toHaveURL(/auth\.elitea\.ai/);
        await pipelinesList.waitForFirstCard();
      });

      await test.step('3. Dismiss any blocking modal/banner if present', async () => {
        await dismissAnnouncementBanner(page);
      });

      await test.step('4. Click the fixture pipeline card', async () => {
        await pipelinesList.clickCardByName(originalName);
        await expect(page).toHaveURL(new RegExp(`/app/pipelines/all/${pipelineId}`));
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

      await test.step('11. Verify Save is enabled (via the testid handle -- role-name collides with "Save As Version", GH#34)', async () => {
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
        await page.goto(`${env.BASE_URL}/app/pipelines/all`);
        await pipelinesList.waitForFirstCard();
        await expect(pipelinesList.cardByName(updatedName)).toBeVisible();
        // Assert the OLD name doesn't also render as a separate, stale
        // card -- catches a duplicate-card bug that "new card present"
        // alone would miss (Axis 2, TC-022's own addition).
        await expect(pipelinesList.cardByName(originalName)).toHaveCount(1);
        await expect(pipelinesList.cardByName(originalName)).toContainText('_UPDATED');
      });

      expect(console_.errors, 'no console errors during the edit flow').toEqual([]);
    } finally {
      console_.stop();
      if (pipelineId !== undefined) {
        await test.step('Cleanup: delete the fixture pipeline (current name is the updated one)', async () => {
          await page.goto(`${env.BASE_URL}/app/pipelines/all/${pipelineId}?viewMode=owner`);
          await form.deleteEntity(updatedName);
          await expect(page).toHaveURL(/\/app\/pipelines\/all/);
        });
      }
    }
  });

  test('TC-023: delete pipeline with confirmation', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const pipelinesList = new CardGridListPage(page);
    const form = new EntityFormPage(page, 'pipeline');
    const pipelineName = uniquePipelineName('TC023_Delete');
    let pipelineId: number | undefined;

    try {
      await test.step('1-3. Create a disposable fixture pipeline to delete', async () => {
        await page.goto(`${env.BASE_URL}/app/pipelines/create?viewMode=owner`);
        await expect(page).toHaveTitle(/Pipelines/);
        await dismissAnnouncementBanner(page);
        await form.fillMinimal(pipelineName, 'Pipeline to be deleted');
        await expect(form.saveButton).toBeEnabled();
        const { id } = await form.saveOnCreate();
        pipelineId = id;
      });

      await test.step('4-6. Navigate to the pipelines list, locate the fixture card', async () => {
        await page.goto(`${env.BASE_URL}/app/pipelines/all`);
        await expect(page).toHaveURL(/\/app\/pipelines\/all/);
        await pipelinesList.waitForFirstCard();
        await dismissAnnouncementBanner(page);
        await expect(pipelinesList.cardByName(pipelineName)).toBeVisible();
      });

      await test.step('7-9. Click the card, verify its name, open the overflow menu', async () => {
        await pipelinesList.clickCardByName(pipelineName);
        await expect(page).toHaveURL(new RegExp(`/app/pipelines/all/${pipelineId}`));
        await expect(form.nameInput).toHaveValue(pipelineName);
        await form.overflowMenuButton.click();
        await expect(page.getByRole('menuitem', { name: 'Delete pipeline', exact: true })).toBeVisible();
        // "VERSION" section's own "Delete" item is always disabled --
        // distinct from "Delete pipeline" under "PIPELINE" (do not confuse).
        await expect(page.getByRole('menuitem', { name: 'Delete', exact: true })).toBeDisabled();
      });

      await test.step('10-11. Open the delete-confirmation dialog', async () => {
        await page.getByRole('menuitem', { name: 'Delete pipeline', exact: true }).click();
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
        await dialog.getByRole('textbox').fill(pipelineName);
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
        // TC-023's own dedicated exploration confirmed an exact,
        // no-query-param redirect after delete for this flow specifically
        // (distinct from TC-020's more casual cleanup-pass observation of
        // no auto-redirect) -- asserting the case's own stated contract
        // here; if this proves flaky under the real Playwright timing,
        // that's an infrastructure fix (explicit `page.goto` fallback), not
        // a scope change.
        await expect(page).toHaveURL(`${env.BASE_URL}/app/pipelines/all`);
      });

      await test.step('15-16. Wait for the list to reload, confirm the pipeline is gone (DOM + search API)', async () => {
        await pipelinesList.waitForFirstCard();
        await expect(pipelinesList.cardByName(pipelineName)).toHaveCount(0);
        // Axis 2 enrichment (TC-023's own addition): the authoritative,
        // concurrency-immune `search_options` API check, keyed on
        // `pipeline` (not `application` -- that key is Agents' own count in
        // this shared, entity-type-keyed response shape).
        const response = await pipelinesList.searchAndAwaitResults(pipelineName);
        const body = await response.json();
        expect(body.pipeline?.total, 'search_options pipeline.total should be 0').toBe(0);
      });

      pipelineId = undefined; // deleted as part of the test's own flow -- no fallback cleanup needed
      expect(console_.errors, 'no console errors during the create-delete flow').toEqual([]);
    } finally {
      console_.stop();
      if (pipelineId !== undefined) {
        await test.step('Cleanup fallback: delete the fixture (test failed before its own delete step)', async () => {
          await page.goto(`${env.BASE_URL}/app/pipelines/all/${pipelineId}?viewMode=owner`);
          await form.deleteEntity(pipelineName);
        });
      }
    }
  });

  test('TC-024: form validation for required fields', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const pipelinesList = new CardGridListPage(page);
    const form = new EntityFormPage(page, 'pipeline');
    const pipelineName = uniquePipelineName('TC024');
    const description = 'Description for validation test';

    try {
      await test.step('1-2. Navigate to the pipelines list, wait for the card grid', async () => {
        await page.goto(`${env.BASE_URL}/app/pipelines/all`);
        await expect(page).toHaveURL(/\/app\/pipelines\/all/);
        await pipelinesList.waitForFirstCard();
      });

      await test.step('3. Dismiss any blocking modal/banner if present', async () => {
        await dismissAnnouncementBanner(page);
      });

      await test.step('4. Click the "Create Pipeline" control', async () => {
        await page
          .getByRole('navigation', { name: 'side-bar' })
          .getByRole('button', { name: 'Pipeline', exact: true })
          .click();
        await expect(page).toHaveURL(/\/app\/pipelines\/create\?viewMode=owner/);
      });

      await test.step('5. Verify Save AND Cancel are disabled on the pristine form', async () => {
        await expect(form.saveButton).toBeDisabled();
        await expect(form.cancelButton).toBeDisabled();
      });

      await test.step('6-7. Fill Name; Save stays disabled, Cancel becomes enabled (dirty)', async () => {
        await form.nameInput.fill(pipelineName);
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
        await form.nameInput.fill(pipelineName);
        await expect(form.nameInput).toHaveValue(pipelineName);
      });

      await test.step('12. Verify Save is now enabled', async () => {
        await expect(form.saveButton).toBeEnabled();
      });

      await test.step('Known defect check (optional, not a case step): GH#29 -- whitespace-only required fields', async () => {
        await form.nameInput.fill('   ');
        // Known defect: GH#29 -- Save's disabled-gate is a raw
        // truthiness/length check on the untrimmed value, not a "has real
        // content" check. Corroborated on the Pipelines form by TC-024's
        // own analyst pass (independently confirmed for both Name and
        // Description). Soft-asserting the CORRECT behavior so this turns
        // green automatically if the product fixes it, without failing the
        // case's own flow today.
        await expect.soft(form.saveButton, 'Known defect: GH#29').toBeDisabled();
        // Restore a valid Name so Teardown's Cancel/Discard isn't left in a
        // defect-induced state.
        await form.nameInput.fill(pipelineName);
      });

      expect(console_.errors, 'no console errors during the validation flow').toEqual([]);
    } finally {
      console_.stop();
      await test.step('Teardown: Cancel and discard without saving', async () => {
        if (await form.cancelButton.isEnabled().catch(() => false)) {
          await form.cancelAndDiscard();
        } else {
          await page.goto(`${env.BASE_URL}/app/pipelines/all`);
        }
      });
    }
  });

  test('TC-025: cancel button discards changes', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const pipelinesList = new CardGridListPage(page);
    const form = new EntityFormPage(page, 'pipeline');
    const pipelineName = uniquePipelineName('TC025_Cancel');
    let initialCount = 0;

    try {
      await test.step('1-2. Navigate to the pipelines list, wait for the card grid', async () => {
        await page.goto(`${env.BASE_URL}/app/pipelines/all`);
        await expect(page).toHaveURL(/\/app\/pipelines\/all/);
        await pipelinesList.waitForFirstCard();
      });

      await test.step('3. Dismiss any blocking modal/banner if present', async () => {
        await dismissAnnouncementBanner(page);
      });

      await test.step('4. Read the "Pipelines: N" badge as a baseline (informational -- shared account)', async () => {
        initialCount = await pipelinesList.pipelinesTotalCount();
      });

      await test.step('5. Click "Create Pipeline"', async () => {
        await page
          .getByRole('navigation', { name: 'side-bar' })
          .getByRole('button', { name: 'Pipeline', exact: true })
          .click();
        await expect(page).toHaveURL(/\/app\/pipelines\/create\?viewMode=owner/);
      });

      await test.step('6-9. Fill Name, Description, a tag, and Welcome message', async () => {
        await form.nameInput.fill(pipelineName);
        await form.descriptionInput.fill('This pipeline should not be created');
        await form.addTag('temp');
        await expect(form.tagChip('temp')).toBeVisible();
        await form.welcomeMessageInput.fill('Test welcome message');
      });

      await test.step('10. Verify Cancel is enabled (form is dirty)', async () => {
        await expect(form.cancelButton).toBeEnabled();
      });

      await test.step('11-13. Click Cancel, confirm Discard (the "Warning Close" dialog -- NOT the Back-arrow "Warning" dialog, see TC-025 AFS), verify return to the pipelines list', async () => {
        await form.cancelAndDiscard();
        await expect(page).toHaveURL(`${env.BASE_URL}/app/pipelines/all`);
      });

      await test.step('14-15. Search for the generated name -- confirm no pipeline was created', async () => {
        await pipelinesList.waitForFirstCard();
        const response = await pipelinesList.searchAndAwaitResults(pipelineName);
        const body = await response.json();
        expect(body.pipeline?.total, 'search_options pipeline.total should be 0').toBe(0);
        await expect(pipelinesList.noPipelinesMatchText()).toBeVisible();
        await expect(pipelinesList.cardByName(pipelineName)).toHaveCount(0);
      });

      await test.step('16. "Pipelines: N" badge never decreases below the baseline (not a strict-equality gate)', async () => {
        await pipelinesList.searchInput.fill('');
        const finalCount = await pipelinesList.pipelinesTotalCount();
        expect(finalCount).toBeGreaterThanOrEqual(initialCount);
      });

      expect(console_.errors, 'no console errors during the cancel-discard flow').toEqual([]);
    } finally {
      console_.stop();
    }
  });

  test('TC-026: pipeline detail page displays correct data', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const form = new EntityFormPage(page, 'pipeline');
    const data = {
      name: uniquePipelineName('TC026_Detail'),
      description: 'Pipeline for detail page verification',
      tags: ['detail', 'test', 'qa'],
      welcomeMessage: 'Welcome to the detail test pipeline',
      stepLimit: '80',
    };
    let pipelineId: number | undefined;

    try {
      await test.step('1. Verify authenticated state (no redirect to login)', async () => {
        await page.goto(`${env.BASE_URL}/app/chat/`);
        await expect(page).not.toHaveURL(/auth\.elitea\.ai/);
      });

      await test.step('Setup: create the fixture pipeline with the full field set (no Guidelines field on this form -- confirmed absent, TC-026)', async () => {
        await page.goto(`${env.BASE_URL}/app/pipelines/all`);
        await expect(page).toHaveURL(/\/app\/pipelines\/all/);
        await dismissAnnouncementBanner(page);
        await page
          .getByRole('navigation', { name: 'side-bar' })
          .getByRole('button', { name: 'Pipeline', exact: true })
          .click();
        await expect(page).toHaveURL(/\/app\/pipelines\/create\?viewMode=owner/);
        await form.fillFull(data);
        const { id } = await form.saveOnCreate();
        pipelineId = id;
      });

      await test.step('2. Navigate directly (fresh goto) to the corrected detail URL', async () => {
        await Promise.all([
          page.waitForResponse(
            (r) => /\/application\/prompt_lib\/\d+\/\d+$/.test(r.url()) && r.status() === 200,
          ),
          page.goto(`${env.BASE_URL}/app/pipelines/all/${pipelineId}?viewMode=owner`),
        ]);
      });

      await test.step('3-9. Verify every field value persisted exactly, all sections pre-expanded', async () => {
        await expect(form.nameInput).toHaveValue(data.name);
        await expect(form.descriptionInput).toHaveValue(data.description);
        for (const tag of data.tags) {
          await expect(form.tagChip(tag)).toBeVisible();
        }
        await expect(form.welcomeMessageInput).toBeVisible();
        // Known defect: GH#43 -- the Welcome Message field's value is
        // silently dropped from the create payload under fast, automated
        // field entry. This case's own AFS didn't flag the risk (its manual
        // exploration used slower, human-paced entry, which does not
        // reproduce it -- see TC-028's own finding on the exact same
        // mechanism), but this fixture's Setup step (`fillFull()` followed
        // immediately by `saveOnCreate()`) is timing-shaped identically to
        // TC-021/TC-028's own confirmed reproduction, and reproduced here
        // too during implementer Phase 4 Execute. Soft-asserted per the
        // same established pattern rather than hard-failing a case whose
        // actual subject under test is field *display*, not this defect.
        await expect.soft(form.welcomeMessageInput, 'Known defect: GH#43').toHaveValue(data.welcomeMessage);
        await expect(form.stepLimitInput).toBeVisible();
        await expect(form.stepLimitInput).toHaveValue(data.stepLimit);
      });

      expect(
        console_.errors,
        "no console errors attributable to the detail page's own data load",
      ).toEqual([]);
    } finally {
      console_.stop();
      if (pipelineId !== undefined) {
        await test.step('Cleanup: delete the fixture pipeline', async () => {
          await page.goto(`${env.BASE_URL}/app/pipelines/all/${pipelineId}?viewMode=owner`);
          await form.deleteEntity(data.name);
          await expect(page).toHaveURL(/\/app\/pipelines\/all/);
        });
      }
    }
  });

  test('TC-027: conversation starters add and remove', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const form = new EntityFormPage(page, 'pipeline');
    const pipelineName = uniquePipelineName('TC027_Pipe');
    const description = 'Pipeline for testing conversation starters';
    const starter1 = 'What are your capabilities?';
    const starter2 = 'Show me examples';
    let pipelineId: number | undefined;

    try {
      await test.step('1. Navigate to the pipelines list', async () => {
        await page.goto(`${env.BASE_URL}/app/pipelines/all`);
        await expect(page).toHaveURL(/\/app\/pipelines\/all/);
        await new CardGridListPage(page).waitForFirstCard();
      });

      await test.step('2-4. Click the sidebar create-pipeline control, dismiss banner', async () => {
        await page
          .getByRole('navigation', { name: 'side-bar' })
          .getByRole('button', { name: 'Pipeline', exact: true })
          .click();
        await expect(page).toHaveURL(/\/app\/pipelines\/create\?viewMode=owner/);
        await dismissAnnouncementBanner(page);
      });

      await test.step('5. Fill Name', async () => {
        await form.nameInput.fill(pipelineName);
        await expect(form.nameInput).toHaveValue(pipelineName);
      });

      await test.step('6. Fill Description', async () => {
        await form.descriptionInput.fill(description);
        await expect(form.descriptionInput).toHaveValue(description);
      });

      await test.step('7. Confirm the "Conversation Starters" section is visible -- no expand needed', async () => {
        await expect(form.addStarterButton).toBeVisible();
      });

      await test.step('8-9. Add and fill the first starter', async () => {
        await form.addConversationStarter(starter1);
        await expect(form.conversationStarterInput(0)).toHaveValue(starter1);
      });

      await test.step('10-11. Add and fill the second starter', async () => {
        await form.addConversationStarter(starter2);
        await expect(form.conversationStarterInput(1)).toHaveValue(starter2);
      });

      await test.step('12-13. Remove the first starter', async () => {
        await form.removeConversationStarterAt(0);
      });

      await test.step('14. Verify only one starter field remains, re-indexed to [0], with the second starter\'s text', async () => {
        await expect(form.conversationStarterInputs()).toHaveCount(1);
        await expect(form.conversationStarterInput(0)).toHaveValue(starter2);
      });

      await test.step('15-16. Click Save, verify the create response body\'s conversation_starters array, wait for redirect', async () => {
        const { id, response } = await form.saveOnCreate();
        pipelineId = id;
        const body = await response.json();
        expect(body.version_details?.conversation_starters).toEqual([starter2]);
        await expect(page).toHaveURL(new RegExp(`/app/pipelines/all/${id}`));
      });

      await test.step('17-19. Detail page (already loaded post-redirect) shows exactly one starter, correct text', async () => {
        await expect(form.conversationStarterInputs()).toHaveCount(1);
        await expect(form.conversationStarterInput(0)).toHaveValue(starter2);
      });

      expect(console_.errors, 'no console errors during the conversation-starters flow').toEqual([]);
    } finally {
      console_.stop();
      if (pipelineId !== undefined) {
        await test.step('Cleanup: delete the created pipeline', async () => {
          await page.goto(`${env.BASE_URL}/app/pipelines/all/${pipelineId}?viewMode=owner`);
          await form.deleteEntity(pipelineName);
          await expect(page).toHaveURL(/\/app\/pipelines\/all/);
        });
      }
    }
  });

  test('TC-028: welcome message field functionality', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const form = new EntityFormPage(page, 'pipeline');
    const pipelineName = uniquePipelineName('TC028');
    const description = 'Pipeline for testing welcome message';
    const welcomeMessage =
      'Hello and welcome! This is a test pipeline designed to demonstrate the welcome message feature. Feel free to explore the capabilities.';
    let pipelineId: number | undefined;

    try {
      await test.step('1-2. Navigate to the pipelines list, wait for the card grid', async () => {
        await page.goto(`${env.BASE_URL}/app/pipelines/all`);
        await expect(page).toHaveTitle(/Pipelines/);
        await new CardGridListPage(page).waitForFirstCard();
      });

      await test.step('3. Dismiss any blocking modal/banner if present', async () => {
        await dismissAnnouncementBanner(page);
      });

      await test.step('4. Click the sidebar quick-create "Pipeline" button', async () => {
        await page
          .getByRole('navigation', { name: 'side-bar' })
          .getByRole('button', { name: 'Pipeline', exact: true })
          .click();
        await expect(page).toHaveURL(/\/app\/pipelines\/create\?viewMode=owner/);
      });

      await test.step('5. Fill Name', async () => {
        await form.nameInput.fill(pipelineName);
        await expect(form.nameInput).toHaveValue(pipelineName);
      });

      await test.step('6. Fill Description', async () => {
        await form.descriptionInput.fill(description);
        await expect(form.descriptionInput).toHaveValue(description);
      });

      await test.step('7. Welcome Message section is already expanded -- no expand action needed', async () => {
        await expect(form.welcomeMessageInput).toBeVisible();
      });

      await test.step('8-9. Fill the Welcome message field, verify the full text is entered', async () => {
        await form.welcomeMessageInput.fill(welcomeMessage);
        await expect(form.welcomeMessageInput).toHaveValue(welcomeMessage);
      });

      await test.step('10-11. Click Save, wait for redirect', async () => {
        const { id, response } = await form.saveOnCreate();
        pipelineId = id;
        const body = await response.json();
        // Known defect: GH#43 -- the Welcome Message field's value is
        // silently dropped from the create payload under fast, automated
        // field entry. TC-028's own dedicated analysis confirmed this
        // reproduces 2/2 under scripted `fill()`+immediate-`.click()`
        // timing (the exact shape of a real Playwright test) on this
        // Pipelines form, while a slower, human-paced entry did not trigger
        // it. Soft-asserted per the AFS's own explicit recommendation and
        // the identical pattern already established in tests/agents.spec.ts
        // for TC-011/TC-016 -- this is the field this case exists
        // specifically to exercise, so the defect is the most likely
        // observable outcome of running this test for real, not an
        // incidental risk.
        expect
          .soft(body.version_details?.welcome_message, 'Known defect: GH#43')
          .toBe(welcomeMessage);
        await expect(page).toHaveURL(new RegExp(`/app/pipelines/all/${id}`));
      });

      await test.step('12-14. Detail page (already loaded post-redirect): Welcome Message section expanded, full text displayed', async () => {
        await expect(form.welcomeMessageInput).toBeVisible();
        // Known defect: GH#43 -- see the soft-assert above; the field
        // reflects the same (incorrectly empty) persisted state here.
        await expect.soft(form.welcomeMessageInput, 'Known defect: GH#43').toHaveValue(welcomeMessage);
      });

      expect(console_.errors, 'no console errors during the welcome-message flow').toEqual([]);
    } finally {
      console_.stop();
      if (pipelineId !== undefined) {
        await test.step('Cleanup: delete the created pipeline', async () => {
          await page.goto(`${env.BASE_URL}/app/pipelines/all/${pipelineId}?viewMode=owner`);
          await form.deleteEntity(pipelineName);
          await expect(page).toHaveURL(/\/app\/pipelines\/all/);
        });
      }
    }
  });

  test('TC-029: navigate back without saving shows confirmation', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const pipelinesList = new CardGridListPage(page);
    const form = new EntityFormPage(page, 'pipeline');
    const pipelineName = uniquePipelineName('TC029');
    let initialCount = 0;

    try {
      await test.step('1-3. Navigate to the pipelines list, wait for the card grid, dismiss banner', async () => {
        await page.goto(`${env.BASE_URL}/app/pipelines/all`);
        await expect(page).toHaveURL(/\/app\/pipelines\/all/);
        await pipelinesList.waitForFirstCard();
        await dismissAnnouncementBanner(page);
      });

      await test.step('4. Read the "Pipelines: N" badge as a baseline', async () => {
        initialCount = await pipelinesList.pipelinesTotalCount();
      });

      await test.step('5. Click "Create Pipeline"', async () => {
        await page
          .getByRole('navigation', { name: 'side-bar' })
          .getByRole('button', { name: 'Pipeline', exact: true })
          .click();
        await expect(page).toHaveURL(/\/app\/pipelines\/create\?viewMode=owner/);
      });

      await test.step('6-7. Fill Name and Description', async () => {
        await form.nameInput.fill(pipelineName);
        await expect(form.nameInput).toHaveValue(pipelineName);
        await form.descriptionInput.fill('This data should be discarded');
      });

      await test.step('8-9. Add a tag and Welcome message; header Save transitions to enabled (dirty)', async () => {
        await form.addTag('unsaved');
        await expect(form.tagChip('unsaved')).toBeVisible();
        await form.welcomeMessageInput.fill('Test unsaved welcome');
        await expect(form.saveButton).toBeEnabled();
      });

      await test.step('Axis 2 (TC-029\'s own addition): the dialog\'s "Cancel" (stay) button preserves the draft', async () => {
        await form.clickBackAndCancelLeave();
        await expect(form.unsavedChangesLeaveDialog()).toBeHidden();
        await expect(page).toHaveURL(/\/app\/pipelines\/create/);
        await expect(form.nameInput).toHaveValue(pipelineName);
      });

      await test.step('10-12. Click the Back arrow again, confirm the "Warning" leave dialog (distinct from Cancel\'s "Warning Close" -- GH#36)', async () => {
        await form.clickBackAndConfirmLeave();
        await expect(page).toHaveURL(/\/app\/pipelines\/all/);
      });

      await test.step('13-14. URL returns to the pipelines list', async () => {
        await pipelinesList.waitForFirstCard();
      });

      await test.step('15. Search for the generated name -- confirm no pipeline was created', async () => {
        const response = await pipelinesList.searchAndAwaitResults(pipelineName);
        const body = await response.json();
        expect(body.pipeline?.total, 'search_options pipeline.total should be 0').toBe(0);
        await expect(pipelinesList.noPipelinesMatchText()).toBeVisible();
      });

      await test.step('16. "Pipelines: N" badge never decreases below the baseline (informational, shared account)', async () => {
        await pipelinesList.searchInput.fill('');
        const finalCount = await pipelinesList.pipelinesTotalCount();
        expect(finalCount).toBeGreaterThanOrEqual(initialCount);
      });

      expect(console_.errors, 'no console errors during the back-navigation-discard flow').toEqual([]);
    } finally {
      console_.stop();
    }
  });
});
