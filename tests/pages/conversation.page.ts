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

  /** The active conversation's message-thread panel (`region "scrollable
   * content"`, confirmed live via the app's own accessibility tree -- see
   * `createFixture()`'s own doc comment for why this is used as a
   * race-guard rather than just the URL). Exposed so a caller could assert
   * "no messages yet" independently if a future case needs it. */
  private messageThreadRegion(): Locator {
    return this.page.getByRole('region', { name: 'scrollable content' });
  }

  /**
   * Creates a disposable conversation by sending one chat message from a
   * blank composer -- the app auto-names the conversation from the message
   * text (no dedicated Name field, unlike Agents/Pipelines) and fires a
   * rename `PUT` shortly after the create `POST`. Waits for BOTH the URL to
   * carry the new numeric id AND the SPECIFIC `PUT` whose response body
   * actually carries the fixture text (see the precise-matching note below)
   * before proceeding, so the caller can locate the row by its final name
   * without racing the transient "New Conversation" placeholder.
   *
   * **Race condition fix (PR #70 review round 1, findings 1+2).** Clicking
   * the sidebar "+ Conversation" control does NOT atomically switch the
   * composer to a genuinely blank conversation -- confirmed live via traced
   * network requests (2026-07-03 re-investigation): for a brief window
   * (observed up to ~1s) after the click, the message-thread panel and the
   * app's internal "active conversation" context still point at WHATEVER
   * conversation was previously open (URL transiently `/app/chat?create=1`
   * before settling to bare `/app/chat`). Proceeding to click/type/send
   * during that window sends the fixture text as a plain MESSAGE into the
   * stale, pre-existing conversation instead of creating a new one -- no
   * `POST .../conversations/prompt_lib/{owner}` (create) ever fires, only a
   * `PUT .../conversation/prompt_lib/{owner}/{staleId}` (the app's generic
   * "conversation touched" call, which trivially satisfies this method's own
   * network wait below since it matches the same URL shape as a genuine
   * rename). This was CONFIRMED to be the actual mechanism behind the 5
   * "leaked conversations" flagged in review -- cross-checked directly
   * against the live account's API: none of the 5 named fixtures exist as
   * separate conversations; all 5 are message pairs sitting inside the
   * pre-existing `smoke.spec.ts` conversation ("Hello, test", id 36) --
   * see the PR's Run Report for the full evidence trail. Waiting for the
   * message-thread panel to genuinely empty out (0 items) is the
   * confirmed-live, semantic signal that the SPA has finished switching to
   * a truly blank compose context; it is NOT a network-bound wait (client
   * state reset), so a shorter timeout than the file's live-backend
   * convention would also be defensible, but 15s is used for consistency
   * with every other wait in this file and because it costs nothing when
   * the reset (observed ~150ms-1s) completes quickly.
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
   *
   * **Fixture-leak fix (PR #70 review round 1, finding 2).** The `onCreated`
   * callback fires the moment server-side creation is confirmed (URL
   * carries the new id AND the touch/rename `PUT` succeeded) -- BEFORE the
   * trailing UI-visibility assertion below runs. Callers use this to
   * register cleanup (e.g. set a `fixtureCreated` flag) at the true "the
   * conversation is real and persisted" boundary, not after this method
   * fully returns -- otherwise a slow-render UI check that throws leaves
   * the flag unset while the conversation already exists server-side,
   * leaking it into the shared live account.
   */
  async createFixture(text: string, onCreated?: (id: number) => void): Promise<number> {
    await this.page
      .getByRole('navigation', { name: 'side-bar' })
      .getByRole('button', { name: 'Conversation', exact: true })
      .click();
    // Race guard -- see this method's own doc comment above. Vacuously true
    // (resolves immediately) when there was no prior conversation to leave.
    await expect(this.messageThreadRegion().locator('[role="listitem"]')).toHaveCount(0, { timeout: 15_000 });
    await this.page.getByTestId('chat-input').click();
    await this.page.keyboard.type(text);

    // Registered BEFORE the send click below (never after -- a response
    // that already fired by the time we start listening would be missed).
    // Confirmed live (PR #70 review round 1 re-investigation) that TWO PUTs
    // hit this same URL shape in sequence: an early one whose body still
    // carries a placeholder name ("New Conversation") and a later,
    // authoritative one whose body carries the real fixture text -- both
    // gated behind the same AI-response-generation pipeline that also
    // powers the chat reply, observed taking anywhere from ~1s to ~17s
    // combined under load. The original implementation matched on URL shape
    // alone, so it could resolve on the EARLY (placeholder-name) PUT --
    // meaning the trailing UI-visibility check then had to re-absorb the
    // SAME AI latency a second time waiting for the sidebar to catch up
    // (the actual cause of PR #70 review round 1's finding 1, more
    // precisely diagnosed than "just add a timeout"). Matching on response
    // BODY content instead means the trailing visibility check only has to
    // absorb the sidebar's own quick re-render once the correct data is
    // already confirmed server-side.
    const renamed = this.page.waitForResponse(async (r) => {
      if (!(/\/conversation\/prompt_lib\/\d+\/\d+$/.test(r.url()) && r.request().method() === 'PUT' && r.status() === 200)) {
        return false;
      }
      const body = await r.json().catch(() => null);
      return body?.name === text;
    }, { timeout: 30_000 });

    await Promise.all([this.page.waitForURL(/\/app\/chat\/\d+/), this.page.getByTestId('chat-send-button').click()]);
    const idMatch = this.page.url().match(/\/app\/chat\/(\d+)/);
    if (!idMatch) {
      throw new Error(`Expected post-send URL to contain a numeric conversation id, got: ${this.page.url()}`);
    }
    const id = Number(idMatch[1]);
    // Register cleanup NOW -- the conversation is confirmed real and
    // persisted server-side (the create POST succeeded, URL carries a real
    // id) at this point, independent of whether the rename has completed or
    // the trailing UI-visibility check below succeeds or times out.
    onCreated?.(id);

    await renamed;
    // Explicit generous timeout matching this file's own convention (see
    // `dismissConversationNotFoundModal(timeout = 15_000)` above) -- this is
    // now purely the sidebar's own render lag AFTER the rename is already
    // confirmed server-side (see `renamed` above), not a re-absorption of
    // the AI-response latency. Previously fell back to Playwright's 5000ms
    // global default, which was empirically too short under load (PR #70
    // review round 1, finding 1).
    await expect(this.conversationRow(text)).toBeVisible({ timeout: 15_000 });
    return id;
  }

  /** Full real-delete flow for teardown -- open the row's kebab menu, click
   * "Delete", confirm for real, verify the row is gone. Same live-backend
   * render-lag class as `createFixture()`'s own final check (PR #70 review
   * round 1 audit) -- the sidebar removing the row is a UI reaction to the
   * just-confirmed `DELETE` response, not an instant DOM update. */
  async deleteFixture(name: string): Promise<void> {
    await this.openDeleteDialog(name);
    await this.confirmDelete();
    await expect(this.conversationRow(name)).toHaveCount(0, { timeout: 15_000 });
  }
}
