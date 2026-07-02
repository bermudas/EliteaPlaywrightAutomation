import { expect, type Locator, type Page, type Response } from '@playwright/test';

/**
 * Shared page object for the agent create/edit form
 * (`/app/agents/create?viewMode=owner` and `/app/agents/all/{id}?viewMode=owner`
 * -- the SAME form component, reused for both create and edit; confirmed
 * live across TC-010..019's exploration). Seeded from the Concrete Handles
 * tables of all ten `agents` module AFS files
 * (`test-specs/agents/l*_*_TC-01{0..9}.md`) -- extend this, don't duplicate,
 * for any future case touching this form (e.g. the `pipelines` module's
 * near-identical form, per `.agents/testing.md` § Structure).
 */
export class AgentFormPage {
  readonly page: Page;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly tagsCombobox: Locator;
  readonly guidelinesInput: Locator;
  readonly welcomeMessageInput: Locator;
  readonly stepLimitInput: Locator;
  /** Scoped `.first()` -- shares its accessible name with the discard-changes
   * dialog's own "Cancel" button (see `discardChangesDialog()` below).
   * Safe because callers always click this BEFORE that dialog opens. */
  readonly cancelButton: Locator;
  /** No accessible name/label/testid exists on this control (GH#36) --
   * Locator Ladder stop+flag: structural fallback confirmed live
   * (2026-07-02, implementer Phase 2 exploration) as the icon-button that
   * is a direct-child sibling immediately preceding the `.MuiTabs-root`
   * tab-header container in the form's header. */
  readonly backButton: Locator;
  /** Agent detail page's overflow ("kebab") menu button. Its literal DOM
   * `id` renders as the string `"undefined-action"` -- a broken template
   * interpolation in the product, confirmed on multiple agent ids and
   * filed as GH#33. Not a placeholder in this file; this is the real,
   * currently-working selector. */
  readonly overflowMenuButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nameInput = page.getByRole('textbox', { name: 'Name *' });
    this.descriptionInput = page.getByRole('textbox', { name: 'Description *' });
    this.tagsCombobox = page.getByRole('combobox', { name: 'Tags' });
    this.guidelinesInput = page.getByRole('textbox', { name: 'Guidelines for the AI agent' });
    this.welcomeMessageInput = page.getByRole('textbox', { name: 'Input your welcome message' });
    this.stepLimitInput = page.getByRole('textbox', { name: 'Step limit' });
    this.cancelButton = page.getByRole('button', { name: 'Cancel', exact: true }).first();
    this.backButton = page.locator('div:has(> .MuiTabs-root) > button').first();
    this.overflowMenuButton = page.locator('#undefined-action');
  }

  /**
   * Context-sensitive Save handle. The create form only ever renders
   * Save/Cancel (no collision), but the edit/detail page also renders
   * "Save As Version" -- a non-exact `getByRole('button', {name:'Save'})`
   * partial-matches both and strict-mode-violates (GH#34). The edit page
   * ships a stable `data-testid="agent-save-button"` that sidesteps the
   * ambiguity entirely (confirmed present live); the create page has no
   * such testid, so the `exact: true` role match is used there instead.
   */
  get saveButton(): Locator {
    return this.page.url().includes('/agents/create')
      ? this.page.getByRole('button', { name: 'Save', exact: true })
      : this.page.getByTestId('agent-save-button');
  }

  tagChip(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }

  /** Tags is a MUI free-solo autocomplete -- click, fill (not sequential
   * `keyboard.type()`, see `stepLimitInput` usage note below for why
   * `.fill()` is preferred throughout this form), then Enter to commit
   * a chip. */
  async addTag(name: string): Promise<void> {
    await this.tagsCombobox.click();
    await this.tagsCombobox.fill(name);
    await this.page.keyboard.press('Enter');
  }

  /**
   * Removes a tag chip by clicking its delete icon specifically.
   *
   * [Implementer correction, 2026-07-02] TC-017's AFS claimed "the chip's
   * own button wrapper is the full click target for removal... no need to
   * sub-target a nested delete icon." Confirmed live during implementer
   * Phase 2 exploration that this does NOT reliably work: the chip renders
   * as a MUI `<div role="button" class="MuiChip-root ...">` wrapping a
   * `<span class="MuiChip-label">` (the text) and a separate
   * `<svg class="MuiChip-deleteIcon">` -- MUI wires `onDelete` to the SVG
   * specifically (with its own stopPropagation), not to the outer chip
   * div. Clicking the outer chip element was confirmed to do nothing on
   * repeated attempts; clicking `.MuiChip-deleteIcon` removed it on the
   * first attempt, every time. Reverse-masking guard: the live component
   * structure is the ground truth here, not the AFS's untested claim.
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
  }): Promise<void> {
    await this.nameInput.fill(data.name);
    await this.descriptionInput.fill(data.description);
    for (const tag of data.tags ?? []) {
      await this.addTag(tag);
    }
    if (data.guidelines !== undefined) await this.guidelinesInput.fill(data.guidelines);
    if (data.welcomeMessage !== undefined) await this.welcomeMessageInput.fill(data.welcomeMessage);
    if (data.stepLimit !== undefined) await this.stepLimitInput.fill(data.stepLimit);
  }

  /**
   * Clicks Save on the CREATE form and waits for the authoritative
   * `POST .../applications/prompt_lib/{ownerId}` -> 201, then for the
   * post-save redirect (`/app/agents/all/{id}`) -- both condition waits,
   * no fixed sleep. Returns the numeric agent id (parsed from the
   * resulting URL) and the raw create response, for callers that need to
   * assert response-body fields (e.g. TC-011's tags/instructions checks).
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
    await this.page.waitForURL(/\/app\/agents\/all\/\d+/);
    const match = this.page.url().match(/\/app\/agents\/all\/(\d+)/);
    if (!match) {
      throw new Error(`Expected post-save URL to contain a numeric agent id, got: ${this.page.url()}`);
    }
    return { id: Number(match[1]), response };
  }

  /**
   * Clicks Save on the EDIT/detail page and waits for the authoritative
   * `PUT .../application/prompt_lib/{ownerId}/{id}` (status < 300 -- this
   * app observed returning 201, not 200, on update; TC-012/TC-013's own
   * finding, not treated as a defect). Also waits for the Save button to
   * re-disable, the confirmed live completion signal documented by TC-012
   * (no toast/snackbar exists anywhere in this flow).
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
   * Toolbar "Cancel" -> "Warning Close" discard-changes dialog
   * (TC-014/TC-015). Confirmed live (2026-07-02) to be a DIFFERENT
   * component than `unsavedChangesLeaveDialog()` below -- distinct
   * heading ("Warning Close" vs "Warning"), body copy, and button set
   * ("Cancel"/"Discard" vs "Cancel"/"Confirm"). See GH#36. Do not unify
   * these into one helper.
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
   * Back-arrow icon button -> "Warning" unsaved-changes dialog (TC-019
   * only). See `discardChangesDialog()` above for why these are kept
   * separate -- confirmed live, not just per the AFS text.
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
   * Delete-confirmation dialog. Deliberately UNSCOPED by accessible name
   * (`getByRole('dialog')`, filtered by visible text) rather than
   * `getByRole('dialog', { name: 'Delete confirmation' })` -- confirmed
   * live (2026-07-02) that the dialog's `aria-labelledby` points at a
   * non-existent element id (GH#33), so a name-scoped role query resolves
   * to zero matches. Only one dialog is ever mounted at a time in this
   * app (confirmed across every agents-module AFS), so the unscoped
   * `getByRole('dialog')` is unambiguous.
   */
  deleteConfirmationDialog(): Locator {
    return this.page.getByRole('dialog').filter({ hasText: 'Delete confirmation' });
  }

  /**
   * Full delete flow via the overflow menu: open menu -> "Delete agent"
   * (distinct from the always-disabled "Delete" version-menuitem in the
   * same menu's "VERSION" section) -> type the exact current agent name
   * into the dialog's sole textbox (no "Confirm" button exists, contrary
   * to every case's own Teardown text -- GH#28) -> click the now-enabled
   * "Delete" button, and wait for the authoritative
   * `DELETE .../application/prompt_lib/{ownerId}/{id}` -> 204.
   */
  async deleteAgent(agentName: string): Promise<void> {
    await this.overflowMenuButton.click();
    await this.page.getByRole('menuitem', { name: 'Delete agent', exact: true }).click();
    const dialog = this.deleteConfirmationDialog();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').fill(agentName);
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
  }
}

/**
 * "Announcing ELITEA X.X.X" release-notes banner. Confirmed LIVE
 * (2026-07-02, implementer Phase 2 exploration -- not just per the AFS
 * text) to intercept pointer events on the create/edit form's Save AND
 * Cancel buttons until dismissed, even though it doesn't visually overlap
 * either button ("<div ...> subtree intercepts pointer events", observed
 * directly via Playwright's own actionability-retry log). GH#42. Every
 * agents-module AFS that hit this recommends dismissing it defensively
 * rather than assuming absence -- called from every mutating action in
 * this page object rather than left to each test to remember.
 */
export async function dismissAnnouncementBanner(page: Page): Promise<void> {
  const closeButton = page.getByRole('button', { name: 'close' }).first();
  if ((await closeButton.count()) > 0 && (await closeButton.isVisible().catch(() => false))) {
    await closeButton.click();
  }
}
