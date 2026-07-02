import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { env } from '../fixtures/env';

export type EntityType = 'agent' | 'pipeline';

/**
 * Shared page object for the create/edit form behind BOTH entity types this
 * suite automates:
 *   - Agents:    `/app/agents/create?viewMode=owner`    / `/app/agents/all/{id}?viewMode=owner`
 *   - Pipelines: `/app/pipelines/create?viewMode=owner` / `/app/pipelines/all/{id}?viewMode=owner`
 *
 * Originally `AgentFormPage` (agents module, PR #15) -- generalized here
 * during the pipelines module batch (TC-020..029) once every single one of
 * the 10 pipelines-module AFS files independently confirmed the two forms
 * are the exact same underlying component, not just visually similar:
 *   - identical `data-testid="agent-save-button"` on BOTH entity types' edit/
 *     detail pages (not a copy-paste id -- the literal same testid string,
 *     confirmed live on Pipelines by TC-020/021/022)
 *   - identical 32-char `maxLength` silent-truncation on the Name field
 *     (GH#27, "(Agents + Pipelines)")
 *   - identical delete-confirmation dialog, including the same broken
 *     `id="undefined-action"` kebab-menu button and the same broken
 *     `aria-labelledby` (GH#33)
 *   - identical "Warning Close" Cancel/Discard dialog (TC-024/TC-025,
 *     confirmed byte-for-byte against the Agents module's TC-014/TC-015) and
 *     "Warning" Back-arrow/unsaved-changes dialog (TC-029, confirmed
 *     byte-for-byte against TC-019)
 *   - identical `welcomeMessageInput` accessible name and GH#43 (Welcome
 *     Message silently dropped from the create payload under fast/automated
 *     entry) timing-sensitivity
 * See `.agents/testing.md` § Structure's own note that this consolidation
 * was anticipated and flagged as worth evaluating during this batch.
 *
 * Differences the `entityType` parameter accounts for:
 *   - URL path segment (`agents` vs `pipelines`) via `pathSegment`
 *   - the Pipeline form has NO Guidelines/Instructions field (confirmed live
 *     by TC-026) -- `guidelinesInput` is only ever referenced by
 *     `tests/agents.spec.ts`, never by `tests/pipelines.spec.ts`
 *   - the Pipeline form HAS a repeatable Conversation Starters field-array
 *     not present on the Agent form -- see the `conversationStarter*`
 *     methods below, new in this batch (TC-027)
 *
 * Both entity types redirect to their own `/app/{pathSegment}/all` list
 * page automatically after a successful delete -- confirmed live for
 * Pipelines during Phase 4 Execute (2026-07-02); see `deleteEntity()`'s own
 * doc comment for the one AFS incidental claim that didn't hold up.
 */
export class EntityFormPage {
  readonly page: Page;
  readonly entityType: EntityType;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly tagsCombobox: Locator;
  /** Agent-only field -- the Pipeline create/edit form has no Guidelines
   * section (confirmed live, TC-026). Never referenced by `pipelines.spec.ts`. */
  readonly guidelinesInput: Locator;
  readonly welcomeMessageInput: Locator;
  readonly stepLimitInput: Locator;
  /** Scoped `.first()` -- shares its accessible name with the discard-changes
   * dialog's own "Cancel" button (see `discardChangesDialog()` below).
   * Safe because callers always click this BEFORE that dialog opens. */
  readonly cancelButton: Locator;
  /** No accessible name/label/testid exists on this control (GH#36) --
   * Locator Ladder stop+flag: structural fallback confirmed live for Agents
   * (2026-07-02) and independently re-confirmed identical for Pipelines by
   * TC-029 -- the icon-button that is a direct-child sibling immediately
   * preceding the `.MuiTabs-root` tab-header container in the form's header. */
  readonly backButton: Locator;
  /** Detail page's overflow ("kebab") menu button. Its literal DOM `id`
   * renders as the string `"undefined-action"` -- a broken template
   * interpolation in the product, filed as GH#33 and confirmed identical on
   * BOTH entity types. Not a placeholder in this file; this is the real,
   * currently-working selector. */
  readonly overflowMenuButton: Locator;
  /** Conversation Starters "+ Starter" add control -- Pipeline-only
   * field-array, not present on the Agent form. Disabled while the last row
   * is empty or the confirmed 4-row cap is reached (TC-027). */
  readonly addStarterButton: Locator;

  constructor(page: Page, entityType: EntityType) {
    this.page = page;
    this.entityType = entityType;
    this.nameInput = page.getByRole('textbox', { name: 'Name *' });
    this.descriptionInput = page.getByRole('textbox', { name: 'Description *' });
    this.tagsCombobox = page.getByRole('combobox', { name: 'Tags' });
    this.guidelinesInput = page.getByRole('textbox', { name: 'Guidelines for the AI agent' });
    this.welcomeMessageInput = page.getByRole('textbox', { name: 'Input your welcome message' });
    this.stepLimitInput = page.getByRole('textbox', { name: 'Step limit' });
    this.cancelButton = page.getByRole('button', { name: 'Cancel', exact: true }).first();
    this.backButton = page.locator('div:has(> .MuiTabs-root) > button').first();
    this.overflowMenuButton = page.locator('#undefined-action');
    this.addStarterButton = page.getByRole('button', { name: 'Starter', exact: true });
  }

  /** URL path segment for this entity type -- `agents` or `pipelines`. */
  get pathSegment(): 'agents' | 'pipelines' {
    return this.entityType === 'agent' ? 'agents' : 'pipelines';
  }

  /**
   * Context-sensitive Save handle. The create form only ever renders
   * Save/Cancel (no collision), but the edit/detail page also renders
   * "Save As Version" -- a non-exact `getByRole('button', {name:'Save'})`
   * partial-matches both and strict-mode-violates (GH#34, confirmed
   * identical on both entity types). The edit page ships a stable
   * `data-testid="agent-save-button"` that sidesteps the ambiguity entirely
   * (confirmed present live on both Agent AND Pipeline detail pages -- the
   * literal same testid, not a coincidence); the create page has no such
   * testid on either entity type, so the `exact: true` role match is used
   * there instead.
   */
  get saveButton(): Locator {
    return this.page.url().includes(`/${this.pathSegment}/create`)
      ? this.page.getByRole('button', { name: 'Save', exact: true })
      : this.page.getByTestId('agent-save-button');
  }

  tagChip(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }

  /** Tags is a MUI free-solo autocomplete -- click, fill (not sequential
   * `keyboard.type()`), then Enter to commit a chip. */
  async addTag(name: string): Promise<void> {
    await this.tagsCombobox.click();
    await this.tagsCombobox.fill(name);
    await this.page.keyboard.press('Enter');
  }

  /**
   * Removes a tag chip by clicking its delete icon specifically -- the chip
   * renders as a MUI `<div role="button">` wrapping a label span and a
   * separate `.MuiChip-deleteIcon` svg; MUI wires `onDelete` to the SVG
   * specifically, not the outer chip. Confirmed live for Agents
   * (2026-07-02); the Pipelines Tags field is the identical MUI Autocomplete
   * component (same chip markup), so this is not re-verified per-entity.
   */
  async removeTag(name: string): Promise<void> {
    await this.tagChip(name).locator('.MuiChip-deleteIcon').click();
  }

  async fillMinimal(name: string, description: string): Promise<void> {
    await this.nameInput.fill(name);
    await this.descriptionInput.fill(description);
  }

  async fillFull(data: {
    name: string;
    description: string;
    tags?: string[];
    guidelines?: string;
    welcomeMessage?: string;
    stepLimit?: string;
    /** Pipeline-only field-array (TC-027/TC-021) -- ignored for `entityType: 'agent'`. */
    conversationStarters?: string[];
  }): Promise<void> {
    await this.nameInput.fill(data.name);
    await this.descriptionInput.fill(data.description);
    for (const tag of data.tags ?? []) {
      await this.addTag(tag);
    }
    if (data.guidelines !== undefined) await this.guidelinesInput.fill(data.guidelines);
    if (data.welcomeMessage !== undefined) await this.welcomeMessageInput.fill(data.welcomeMessage);
    if (data.stepLimit !== undefined) await this.stepLimitInput.fill(data.stepLimit);
    for (const starter of data.conversationStarters ?? []) {
      await this.addConversationStarter(starter);
    }
  }

  /**
   * Clicks Save on the CREATE form and waits for the authoritative
   * `POST .../applications/prompt_lib/{ownerId}` -> 201, then for the
   * post-save redirect (`/app/{pathSegment}/all/{id}`) -- both condition
   * waits, no fixed sleep. The underlying REST endpoint is entity-agnostic
   * (confirmed: Pipelines' `POST`/`PUT`/`DELETE` paths are the literal same
   * `applications/prompt_lib` / `application/prompt_lib` shape as Agents --
   * only the list GET's `agents_type` query param differs). Returns the
   * numeric id (parsed from the resulting URL) and the raw create response,
   * for callers that need to assert response-body fields.
   */
  async saveOnCreate(): Promise<{ id: number; response: Response }> {
    await dismissAnnouncementBanner(this.page);
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) =>
          r.url().includes('/applications/prompt_lib/') &&
          r.request().method() === 'POST' &&
          r.status() === 201,
      ),
      this.saveButton.click(),
    ]);
    const urlPattern = new RegExp(`/app/${this.pathSegment}/all/\\d+`);
    await this.page.waitForURL(urlPattern);
    const idMatch = this.page.url().match(new RegExp(`/app/${this.pathSegment}/all/(\\d+)`));
    if (!idMatch) {
      throw new Error(`Expected post-save URL to contain a numeric ${this.entityType} id, got: ${this.page.url()}`);
    }
    return { id: Number(idMatch[1]), response };
  }

  /**
   * Clicks Save on the EDIT/detail page and waits for the authoritative
   * `PUT .../application/prompt_lib/{ownerId}/{id}` (status < 300 -- this
   * app observed returning 201, not 200, on update for BOTH entity types;
   * not treated as a defect). Also waits for the Save button to re-disable,
   * the confirmed live completion signal (no toast/snackbar exists anywhere
   * in this flow, for either entity type).
   */
  async saveOnEdit(): Promise<Response> {
    await dismissAnnouncementBanner(this.page);
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) =>
          r.url().includes('/application/prompt_lib/') &&
          r.request().method() === 'PUT' &&
          r.status() < 300,
      ),
      this.saveButton.click(),
    ]);
    await expect(this.saveButton).toBeDisabled();
    return response;
  }

  /**
   * Toolbar "Cancel" -> "Warning Close" discard-changes dialog. Confirmed
   * live to be the SAME component on both Agents (TC-014/TC-015) and
   * Pipelines (TC-024/TC-025, byte-for-byte identical heading/body/buttons)
   * -- distinct from `unsavedChangesLeaveDialog()` below (see that method's
   * own doc comment for why they're kept separate).
   */
  discardChangesDialog(): Locator {
    return this.page.getByRole('dialog').filter({ hasText: 'Are you sure you want to discard changes?' });
  }

  async cancelAndDiscard(): Promise<void> {
    await dismissAnnouncementBanner(this.page);
    await this.cancelButton.click();
    const dialog = this.discardChangesDialog();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Discard' }).click();
  }

  /**
   * Back-arrow icon button -> "Warning" unsaved-changes dialog. Confirmed
   * live to be the SAME component on both Agents (TC-019) and Pipelines
   * (TC-029, byte-for-byte identical heading "Warning" / body "There are
   * unsaved changes. Are you sure you want to leave?" / Cancel+Confirm
   * buttons + `.MuiBackdrop-root`) -- do not unify with
   * `discardChangesDialog()` above, confirmed structurally different
   * component (different heading, body copy, and button set).
   */
  unsavedChangesLeaveDialog(): Locator {
    return this.page
      .getByRole('dialog')
      .filter({ hasText: 'There are unsaved changes. Are you sure you want to leave?' });
  }

  async clickBackAndConfirmLeave(): Promise<void> {
    await dismissAnnouncementBanner(this.page);
    await this.backButton.click();
    const dialog = this.unsavedChangesLeaveDialog();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirm' }).click();
  }

  /**
   * [New for the pipelines module, TC-029 Axis 2] Clicks the Back arrow and,
   * on the resulting "Warning" dialog, clicks "Cancel" (stay) instead of
   * "Confirm" (leave) -- the dialog's OTHER button, confirmed live to keep
   * the user on the form with all field values intact (TC-029's own Axis 2
   * addition: the case's literal steps only ever exercise the "leave"
   * branch). Does not assert the dialog closes/values-intact itself --
   * callers assert what they need, this just drives the interaction.
   */
  async clickBackAndCancelLeave(): Promise<void> {
    await dismissAnnouncementBanner(this.page);
    await this.backButton.click();
    const dialog = this.unsavedChangesLeaveDialog();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  }

  /**
   * Delete-confirmation dialog. Deliberately UNSCOPED by accessible name
   * (`getByRole('dialog')`, filtered by visible text) rather than
   * `getByRole('dialog', { name: 'Delete confirmation' })` -- confirmed live
   * that the dialog's `aria-labelledby` points at a non-existent element id
   * (GH#33) on BOTH entity types, so a name-scoped role query resolves to
   * zero matches. Only one dialog is ever mounted at a time in this app.
   */
  deleteConfirmationDialog(): Locator {
    return this.page.getByRole('dialog').filter({ hasText: 'Delete confirmation' });
  }

  /**
   * Full delete flow via the overflow menu: open menu -> "Delete agent" /
   * "Delete pipeline" (distinct from the always-disabled "Delete"
   * version-menuitem in the same menu's "VERSION" section, for both entity
   * types) -> type the exact current name into the dialog's sole textbox
   * (no "Confirm" button exists, contrary to every case's own Teardown text
   * -- GH#28) -> click the now-enabled "Delete" button, and wait for the
   * authoritative `DELETE .../application/prompt_lib/{ownerId}/{id}` -> 204.
   *
   * Waits for the post-delete redirect to `/app/{pathSegment}/all` before
   * returning. [Implementer correction, Phase 4 Execute, 2026-07-02]:
   * TC-020's AFS incidentally claimed Pipelines do NOT auto-redirect after
   * delete ("the page stayed put"), while TC-023's own DEDICATED delete
   * case asserted an exact post-delete URL and held. Running the real
   * Playwright flow confirmed TC-023's finding, not TC-020's: both entity
   * types redirect automatically. The first version of this method left
   * navigation to the caller (per TC-020's claim) and every pipelines.spec.ts
   * cleanup block that then called an unconditional `page.goto()` right
   * after raced the in-flight app-driven redirect and failed with
   * `net::ERR_ABORTED`. Waiting for the natural redirect here (with an
   * explicit-navigation fallback only if it doesn't materialize) fixes that
   * for every caller at once, entity-agnostically.
   */
  async deleteEntity(name: string): Promise<void> {
    await this.overflowMenuButton.click();
    const menuItemName = this.entityType === 'agent' ? 'Delete agent' : 'Delete pipeline';
    await this.page.getByRole('menuitem', { name: menuItemName, exact: true }).click();
    const dialog = this.deleteConfirmationDialog();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').fill(name);
    const deleteButton = dialog.getByRole('button', { name: 'Delete', exact: true });
    await expect(deleteButton).toBeEnabled();
    await Promise.all([
      this.page.waitForResponse(
        (r) =>
          /\/application\/prompt_lib\/\d+\/\d+$/.test(r.url()) &&
          r.request().method() === 'DELETE' &&
          r.status() === 204,
      ),
      deleteButton.click(),
    ]);
    await this.page
      .waitForURL(new RegExp(`/app/${this.pathSegment}/all`), { timeout: 10_000 })
      .catch(() => this.page.goto(`${env.BASE_URL}/app/${this.pathSegment}/all`));
  }

  // ---- Conversation Starters -- Pipeline-only field-array (TC-027) ----

  /**
   * Starter textarea at 0-indexed `index` -- bound via the stable `name`
   * attribute (`version_details.conversation_starters[N]`), NOT role+name:
   * every row shares the identical accessible name "Starter" (GH#57, a
   * confirmed accessibility/testability gap -- filed by TC-027), so
   * role+name alone cannot disambiguate once 2+ rows exist.
   */
  conversationStarterInput(index: number): Locator {
    return this.page.locator(`textarea[name="version_details.conversation_starters[${index}]"]`);
  }

  /**
   * Locator matching ALL starter rows currently in the DOM -- exposed so
   * callers can assert row count with a proper web-first
   * `expect(...).toHaveCount(n)` (auto-retries until the DOM settles) rather
   * than a one-shot `.count()` read, which raced the create->detail-page
   * redirect during implementer Phase 4 Execute (`conversationStarterCount()`
   * below is a plain snapshot value, appropriate for `addConversationStarter`'s
   * own synchronous index computation, but NOT for test-side assertions
   * across a navigation/re-render boundary).
   */
  conversationStarterInputs(): Locator {
    return this.page.locator('textarea[name^="version_details.conversation_starters"]');
  }

  async conversationStarterCount(): Promise<number> {
    return this.conversationStarterInputs().count();
  }

  /**
   * Clicks "+ Starter" and fills the newly-appended row. The add button
   * always appends at the current end of the list (confirmed live,
   * implementer Phase 2 exploration, 2026-07-02), so the pre-click count IS
   * the new row's 0-indexed position.
   */
  async addConversationStarter(text: string): Promise<void> {
    const index = await this.conversationStarterCount();
    await this.addStarterButton.click();
    const field = this.conversationStarterInput(index);
    await expect(field).toBeVisible();
    await field.fill(text);
  }

  /**
   * The per-row "delete starter" button shares its accessible name across
   * every row (GH#57, same gap as the textareas) -- scoped here via the
   * nearest ancestor that contains BOTH this row's own textarea (matched by
   * its stable `name` attribute) and a "delete starter" button. Confirmed
   * live (implementer Phase 2 exploration, 2026-07-02) via
   * `document.evaluate` that XPath's `ancestor::*[predicate][1]` resolves to
   * the NEAREST matching ancestor (not the outermost -- `ancestor` is a
   * reverse axis, position 1 is closest to the context node), landing on
   * the row's own wrapper `<div>` -- an MUI-generated, non-stable `css-*`
   * class, deliberately NOT hardcoded here. Deliberately NOT using bare
   * `.nth(index)` positional targeting either -- confirmed to also work
   * (DOM/array order match, per TC-027's own finding), but that's the AFS's
   * documented fallback, not its primary recommendation.
   */
  private conversationStarterRow(index: number): Locator {
    return this.page.locator(
      `xpath=//textarea[@name="version_details.conversation_starters[${index}]"]/ancestor::*[.//button[@aria-label="delete starter"]][1]`,
    );
  }

  async removeConversationStarterAt(index: number): Promise<void> {
    await this.conversationStarterRow(index).getByRole('button', { name: 'delete starter' }).click();
  }
}

/**
 * "Announcing ELITEA X.X.X" release-notes banner. Confirmed LIVE to
 * intercept pointer events on the create/edit form's Save AND Cancel
 * buttons until dismissed, even though it doesn't visually overlap either
 * button (GH#42). Confirmed present on BOTH the Agent and Pipeline
 * create/detail forms (and the Pipelines list route too, per TC-024/TC-025)
 * -- called from every mutating action in this page object rather than left
 * to each test to remember.
 */
export async function dismissAnnouncementBanner(page: Page): Promise<void> {
  const closeButton = page.getByRole('button', { name: 'close' }).first();
  if ((await closeButton.count()) > 0 && (await closeButton.isVisible().catch(() => false))) {
    await closeButton.click();
  }
}
