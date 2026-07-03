import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page object for the chat sidebar's conversation list and the two
 * conversation-specific modal types this module's analysis discovered:
 *
 *   1. The "Conversation not found" modal (`conversationNotFoundDialog()`)
 *      -- deterministically triggered by navigating to `/app/chat/all` (the
 *      literal `all` segment is parsed client-side as a conversation id that
 *      never resolves against the account's own conversation list -- no
 *      404/network error is involved, see TC-050's AFS § Network Behavior).
 *      Single "Got it" action, no separate close icon
 *      (`overlay_types: CLOSE-BTN-SINGLE`). Confirmed live 2026-07-03
 *      (implementer Phase 2 exploration) via `playwright-cli`.
 *
 *   2. The conversation delete-confirmation dialog (`conversationDeleteDialog()`)
 *      -- reached via a per-row kebab (3-dot) menu's "Delete" menuitem.
 *      Confirmed live (TC-052/TC-055 AFS, re-confirmed here during
 *      implementer Phase 2 exploration) to be a MATERIALLY SIMPLER, DISTINCT
 *      component from the Agent/Pipeline entity delete-confirmation dialog
 *      in `entityForm.page.ts` (`EntityFormPage.deleteConfirmationDialog()`):
 *      heading "Delete conversation?" (not "Delete confirmation"), body
 *      "Are you sure to delete conversation? It can't be restored." (not
 *      "Enter the name to complete the action."), and the "Delete" button
 *      is **enabled immediately** -- no type-the-exact-name gate. Filed as
 *      GH#69. Do NOT reuse `EntityFormPage`'s delete-dialog handling for
 *      conversations -- confirmed to be a genuinely different contract, not
 *      a shared component with cosmetic differences.
 *
 * The per-row kebab trigger's `id="conversation-menu-action"` is duplicated
 * across every rendered row (confirmed live: 27+ occurrences) -- every
 * method below scopes it under the parent row's own
 * `getByRole('button', { name })` locator, never queries the bare id.
 */
export class ConversationPage {
  constructor(private readonly page: Page) {}

  // ---- "Conversation not found" modal (TC-050/GH#59, TC-055, TC-056) ----

  conversationNotFoundDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Conversation not found' });
  }

  /**
   * Deterministically triggered by navigating to `/app/chat/all` (confirmed
   * live by TC-050/TC-055's own AFS -- delay observed ~1-3s typically, up to
   * ~12s under load; 15s default timeout matches the case's own stated
   * allowance). This is NOT the genuinely-conditional welcome modal --
   * see `closeWelcomeModalIfPresent()` in `modal.page.ts` for that check.
   * Asserts the dialog appears and dismisses it via its sole "Got it"
   * action.
   */
  async dismissConversationNotFoundModal(timeout = 15_000): Promise<void> {
    const dialog = this.conversationNotFoundDialog();
    await expect(dialog).toBeVisible({ timeout });
    await dialog.getByRole('button', { name: 'Got it' }).click();
    await expect(this.page.getByRole('dialog')).toHaveCount(0);
  }

  // ---- Sidebar conversation list ----

  /** A sidebar conversation row, matched by its own accessible name -- the
   * conversation's title. There is no dedicated Name field for
   * conversations (unlike Agents/Pipelines); the app auto-names from the
   * first sent message. */
  conversationRow(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }

  /** Per-row kebab (3-dot) menu trigger -- only rendered in the DOM on
   * hover (confirmed live, TC-052/TC-055 AFS). Always scoped under the
   * parent row -- see class doc comment on the duplicated bare id. */
  conversationMenuButton(name: string): Locator {
    return this.conversationRow(name).locator('#conversation-menu-action');
  }

  async openConversationMenu(name: string): Promise<void> {
    await this.conversationRow(name).hover();
    await this.conversationMenuButton(name).click();
  }

  // ---- Conversation delete-confirmation dialog (GH#69 -- see class doc) ----

  conversationDeleteDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Delete conversation?' });
  }

  /** Opens the named row's kebab menu and clicks "Delete", opening the
   * conversation-specific delete-confirmation dialog. */
  async openDeleteDialog(name: string): Promise<void> {
    await this.openConversationMenu(name);
    await this.page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect(this.conversationDeleteDialog()).toBeVisible();
  }

  /** Dismisses the delete dialog via its explicit "Cancel" button --
   * confirmed live to fire no DELETE request and leave the conversation
   * intact (TC-052 AFS). */
  async cancelDelete(): Promise<void> {
    const dialog = this.conversationDeleteDialog();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  /** Second, independent dismiss path confirmed equivalent to Cancel
   * (TC-052 AFS Axis 2, re-confirmed live during implementer Phase 2
   * exploration) -- MUI's native Escape/backdrop `onClose` handling, not a
   * separate header close icon (confirmed absent from this dialog's
   * markup). */
  async dismissDeleteDialogViaEscape(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.conversationDeleteDialog()).toBeHidden();
  }

  /** Confirms the delete for real -- enabled immediately, no
   * type-the-exact-name gate (unlike the Agent/Pipeline dialog, see class
   * doc comment). Waits for the authoritative
   * `DELETE .../conversation/prompt_lib/{owner}/{id}` -> 204. */
  async confirmDelete(): Promise<void> {
    const dialog = this.conversationDeleteDialog();
    const deleteButton = dialog.getByRole('button', { name: 'Delete', exact: true });
    await expect(deleteButton).toBeEnabled();
    await Promise.all([
      this.page.waitForResponse(
        (r) =>
          /\/conversation\/prompt_lib\/\d+\/\d+$/.test(r.url()) &&
          r.request().method() === 'DELETE' &&
          r.status() === 204,
      ),
      deleteButton.click(),
    ]);
  }

  // ---- Disposable fixture lifecycle (data-collision guard, TC-052/TC-055) ----

  /**
   * Creates a disposable conversation by sending one chat message from a
   * blank composer -- the app auto-names the conversation from the message
   * text (no dedicated Name field, unlike Agents/Pipelines) and fires a
   * rename `PUT` shortly after the create `POST`. Waits for BOTH the URL to
   * carry the new numeric id AND the rename `PUT` to complete before
   * returning, so the caller can immediately locate the row by its final
   * name without racing the transient "New Conversation" placeholder.
   *
   * Clicks `getByTestId('chat-input')` (a container `<div>`, not a
   * fillable element -- confirmed live) to focus the underlying textarea,
   * then types via `page.keyboard`, matching the confirmed-working pattern
   * `tests/smoke.spec.ts` already established for this same composer
   * (`.fill()` on `getByTestId('chat-input')` directly does not work; the
   * inner `#standard-multiline-static` textarea is the actual input, but
   * clicking the container correctly focuses it via the app's own click
   * delegation -- confirmed live during implementer Phase 2 exploration,
   * 2026-07-03).
   */
  async createFixture(text: string): Promise<number> {
    await this.page
      .getByRole('navigation', { name: 'side-bar' })
      .getByRole('button', { name: 'Conversation', exact: true })
      .click();
    await this.page.getByTestId('chat-input').click();
    await this.page.keyboard.type(text);
    await Promise.all([
      this.page.waitForURL(/\/app\/chat\/\d+/),
      this.page.waitForResponse(
        (r) =>
          /\/conversation\/prompt_lib\/\d+\/\d+$/.test(r.url()) &&
          r.request().method() === 'PUT' &&
          r.status() === 200,
      ),
      this.page.getByTestId('chat-send-button').click(),
    ]);
    const idMatch = this.page.url().match(/\/app\/chat\/(\d+)/);
    if (!idMatch) {
      throw new Error(`Expected post-send URL to contain a numeric conversation id, got: ${this.page.url()}`);
    }
    await expect(this.conversationRow(text)).toBeVisible();
    return Number(idMatch[1]);
  }

  /** Full real-delete flow for teardown -- open the row's kebab menu, click
   * "Delete", confirm for real, verify the row is gone. */
  async deleteFixture(name: string): Promise<void> {
    await this.openDeleteDialog(name);
    await this.confirmDelete();
    await expect(this.conversationRow(name)).toHaveCount(0);
  }
}
