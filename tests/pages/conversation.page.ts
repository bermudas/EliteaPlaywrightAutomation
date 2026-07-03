import { expect, type Locator, type Page, type Response } from '@playwright/test';

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
 *
 * **[Added during the `lazy-loading` module batch, TC-064/TC-066]** the
 * group-aware sidebar lazy-load/grouping surface -- confirmed live to be a
 * genuinely different mechanism from the flat, offset-paginated
 * Agents/Pipelines/Toolkits card grid (`cardGridList.page.ts`): the initial
 * `folder/prompt_lib?grouped=true` fetch returns EVERY date group (`today`/
 * `this_week`/`older`) in one shot, each capped at its own first 10 items
 * regardless of that group's own `total`; a group's remainder only loads via
 * a second, group-scoped request (`&date_group={group}&limit=10&offset=10`)
 * triggered by scrolling THAT SPECIFIC group's own nested scroll container
 * -- not the outer page, not the chat transcript's own "scrollable content"
 * region. See `conversations_list_is_group_paginated_not_flat_infinite_scroll.md`
 * (qa-engineer memory) for the full investigation trail both AFS files
 * independently arrived at. Extended here (not built as a new page object,
 * and not folded into `cardGridList.page.ts`'s flat-list model) per
 * `.agents/testing.md` § Structure's own plan for this module.
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
   * first sent message. Documented fallback for locating a row that is NOT
   * the currently-open/active conversation (e.g. a pre-existing conversation
   * a case never navigates into) -- for the conversation the caller JUST
   * created/opened, prefer `activeConversationRow()` instead (see its own
   * doc comment for why: this locator requires the AI-gated rename to have
   * already landed, `activeConversationRow()` does not). */
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

  /**
   * The sidebar row for whichever conversation is currently open (i.e. the
   * one the browser's URL is on) -- located via the app's own
   * `active-conversation` CSS class, confirmed live (PR #70 review round 2,
   * 2026-07-03 re-investigation) to be a **client-side-computed** marker
   * (route id vs. each row's own id), NOT gated behind the AI rename
   * pipeline. A 5-run timing probe against the live account showed this
   * class attaches to the correct row ~50-60ms after `waitForURL` resolves
   * (`tActive - tUrl` across 5 runs: 56, 57, 60, 50, 51ms) -- while the row's
   * OWN TEXT at that instant still reads the transient "Naming" placeholder,
   * confirmed via a second probe that the row is already fully interactable
   * at that point (hover -> kebab -> "Delete" menuitem -> confirmation
   * dialog opened in ~1-1.5s total, all pre-rename). Exactly one match at
   * all times while a conversation is open (`document.querySelectorAll(
   * '.active-conversation').length === 1`, confirmed across every probe run
   * including immediately post-reload). No `data-testid`/`data-*`/`href`
   * attribute anywhere in the row or its ancestor chain carries the
   * conversation's numeric id (confirmed via full DOM attribute sweep) --
   * this app-authored (non-hashed) CSS class is the closest available proxy
   * to an id-based handle, which is why it is used here as the PRIMARY
   * locator for interacting with a conversation the caller just
   * created/opened, in preference to `conversationRow(name)` (which requires
   * the AI-gated rename to have already landed -- the actual root cause of
   * PR #70's TC-052/TC-055 hangs, see `createFixture()`'s own doc comment).
   *
   * Only valid while the target conversation is still the active one in this
   * page's URL -- once the caller navigates elsewhere (or the conversation
   * itself is deleted, which the app responds to by auto-navigating into a
   * different existing conversation, confirmed live), this locator resolves
   * to a DIFFERENT row. Callers needing a specific, possibly-inactive
   * conversation by its display name should use `conversationRow(name)`
   * instead.
   */
  activeConversationRow(): Locator {
    return this.page.locator('.active-conversation');
  }

  private activeConversationMenuButton(): Locator {
    return this.activeConversationRow().locator('#conversation-menu-action');
  }

  /** Same interaction as `openConversationMenu(name)`, scoped to the
   * currently-active conversation instead of a name lookup -- see
   * `activeConversationRow()`'s own doc comment for why this is preferred
   * for a conversation the caller just created/opened. */
  async openActiveConversationMenu(): Promise<void> {
    const row = this.activeConversationRow();
    await row.hover();
    await this.activeConversationMenuButton().click();
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

  /** Same as `openDeleteDialog(name)`, scoped to the currently-active
   * conversation -- see `activeConversationRow()`'s own doc comment. Used by
   * TC-052/TC-055 for their disposable-fixture lifecycle so opening the
   * delete dialog never has to wait on the AI-gated rename. */
  async openDeleteDialogForActive(): Promise<void> {
    await this.openActiveConversationMenu();
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
   * `DELETE .../conversation/prompt_lib/{owner}/{id}` -> 204.
   *
   * `expectedId`, when given, narrows the wait to the DELETE whose URL id
   * segment matches exactly -- used by `deleteFixture()` so its own
   * "confirmed gone" signal is tied to the specific fixture id rather than
   * "some delete happened" (see `deleteFixture()`'s own doc comment for why
   * a DOM/URL-based post-delete check turned out to be unreliable). Omit it
   * for a real, ad-hoc single-delete flow where only one delete could
   * plausibly be in flight. */
  async confirmDelete(expectedId?: number): Promise<void> {
    const dialog = this.conversationDeleteDialog();
    const deleteButton = dialog.getByRole('button', { name: 'Delete', exact: true });
    await expect(deleteButton).toBeEnabled();
    await Promise.all([
      this.page.waitForResponse((r) => {
        const match = /\/conversation\/prompt_lib\/\d+\/(\d+)$/.exec(r.url());
        if (!match || r.request().method() !== 'DELETE' || r.status() !== 204) return false;
        return expectedId === undefined || Number(match[1]) === expectedId;
      }),
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
   * rename `PUT` shortly after the create `POST`. Waits for the URL to carry
   * the new numeric id and for `activeConversationRow()` to resolve (see its
   * own doc comment) before returning -- it does **not** wait for the rename
   * `PUT` itself. See "Root-cause fix" below for why.
   *
   * **Root-cause fix (PR #70 review round 2, 2026-07-03).** Round 1 matched
   * on the rename PUT's response body (`body.name === text`) before
   * returning, reasoning that the caller needed the row locatable by its
   * final name (`conversationRow(text)`). Tal's independent 3-run gate audit
   * post-round-1 (5/6, 6/6, 4/6 -- TC-052 and/or TC-055 timing out on this
   * exact wait, once past its own bumped 30s budget with the suite's 120s
   * test timeout still exceeded) showed this is genuine load-dependent
   * variance in the AI-response/rename pipeline (observed as low as ~1s,
   * as high as the full 120s test timeout), not a fixed worst-case -- i.e.
   * a real reliability gap in gating on it, not just an under-sized budget.
   * Re-investigated (round 2) whether the row needs the rename at all: it
   * does not. Every TC-052/TC-055 interaction against the fixture row
   * (open kebab menu, click Delete, verify "still exists") happens while
   * the fixture is still the browser's OWN active conversation, so
   * `activeConversationRow()` -- a CSS class the app computes client-side
   * from the route id, confirmed via a 5-run timing probe to attach ~50-60ms
   * after `waitForURL` resolves, well before the row's text even leaves the
   * transient "Naming" placeholder -- locates the correct row without ever
   * touching the AI-gated rename. A second probe confirmed the row is fully
   * interactable (hover -> kebab -> Delete menuitem -> confirmation dialog)
   * at that same pre-rename instant. This removes the flake source entirely
   * for this method's callers rather than budgeting a larger timeout around
   * it -- see `activeConversationRow()`'s own doc comment for the full
   * investigation trail.
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
   * carries the new id) -- BEFORE the trailing `activeConversationRow()`
   * assertion below runs. Callers use this to register cleanup (e.g. set a
   * `fixtureCreated` flag) at the true "the conversation is real and
   * persisted" boundary, not after this method fully returns -- otherwise a
   * slow-render UI check that throws leaves the flag unset while the
   * conversation already exists server-side, leaking it into the shared
   * live account.
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

    await Promise.all([this.page.waitForURL(/\/app\/chat\/\d+/), this.page.getByTestId('chat-send-button').click()]);
    const idMatch = this.page.url().match(/\/app\/chat\/(\d+)/);
    if (!idMatch) {
      throw new Error(`Expected post-send URL to contain a numeric conversation id, got: ${this.page.url()}`);
    }
    const id = Number(idMatch[1]);
    // Register cleanup NOW -- the conversation is confirmed real and
    // persisted server-side (the create POST succeeded, URL carries a real
    // id) at this point, independent of whether the trailing
    // activeConversationRow() assertion below succeeds or times out.
    onCreated?.(id);

    // Confirmed live (see this method's own "Root-cause fix" note) to
    // attach within ~50-60ms of the URL updating -- this is the sidebar's
    // own client-side render reacting to the route change, NOT a wait on
    // the AI-gated rename. 15s timeout kept purely as a generous ceiling
    // consistent with this file's convention; the observed p100 across
    // every probe run was well under 2s.
    await expect(this.activeConversationRow()).toBeVisible({ timeout: 15_000 });
    return id;
  }

  /** Full real-delete flow for teardown -- open the currently-active row's
   * kebab menu, click "Delete", confirm for real.
   *
   * **Root-cause fix (PR #70 review round 2).** Previously took the
   * fixture's `name` and verified removal via `conversationRow(name)`
   * having count 0 -- a false-positive risk if the AI-gated rename never
   * completed (the row would never have matched `name` in the first place,
   * so its "removal" would be vacuously true even if the row, still under
   * a placeholder, actually still existed). Takes the fixture's numeric
   * `id` (already known to every caller from `createFixture()`'s own return
   * value) instead: opens/confirms delete via `activeConversationRow()` (no
   * name dependency at all), and confirms removal via `confirmDelete(id)`'s
   * own precise DELETE-response matching (the server's `204` for THIS
   * specific id is the authoritative "it's gone" signal).
   *
   * An earlier version of this fix asserted the URL would stop carrying the
   * deleted id, on the assumption (confirmed via one manual probe during
   * investigation) that the app auto-navigates elsewhere after deleting the
   * active conversation. Re-verified against this suite's own live run:
   * that redirect is NOT reliable -- the URL stayed on the deleted id for
   * the full 15s wait in 2/2 real teardown runs during this fix's own
   * verification. Dropped in favor of the id-matched `204` response, which
   * has no dependency on any post-delete UI/routing behavior at all. */
  async deleteFixture(id: number): Promise<void> {
    await this.openDeleteDialogForActive();
    await this.confirmDelete(id);
  }

  // ---- Sidebar group-based lazy load (TC-064/TC-066, see class doc) ----

  /** Plain `<span>`, not an ARIA heading -- confirmed live, TC-064/TC-066. */
  conversationsSectionLabel(): Locator {
    return this.page.getByText('Conversations', { exact: true });
  }

  /**
   * A date-group's own heading -- renders ONLY when that group's `total > 0`
   * (confirmed live: this account's "Today" group, `total: 0`, renders no
   * heading at all -- do not assert its presence unconditionally). Clicking
   * the heading directly expands/collapses the group; no separate chevron
   * icon-button target is needed (it carries no accessible name of its own).
   */
  groupHeading(name: 'Today' | 'This Week' | 'Older'): Locator {
    return this.page.getByRole('heading', { name, level: 6 });
  }

  /**
   * Every conversation row currently rendered, across every expanded group.
   * `div[role="button"]` -- a dnd-kit draggable, confirmed live (TC-064/
   * TC-066, via direct tag-name inspection) to NOT be a literal `<button>`
   * element, though it carries real `role="button"` accessibility semantics
   * and resolves identically via `getByRole('button', ...)`. Scoped under
   * `.MuiCollapse-wrapperInner` (the per-group container) to exclude the 9
   * unrelated sidebar-nav buttons that also carry `role="button"` page-wide
   * -- confirmed live an unscoped `[role="button"]` query matches 25
   * elements, not the conversation rows this needs to count.
   */
  conversationRows(): Locator {
    return this.page.locator('.MuiCollapse-wrapperInner [role="button"]');
  }

  /**
   * Expands a date-group (if currently collapsed) and, if needed, scrolls
   * its nested container to trigger that group's group-scoped paginated
   * follow-up fetch (`&date_group={group}&limit=10&offset=10`).
   *
   * **Root-caused during implementation, superseding two earlier,
   * incorrect versions of this doc comment (kept out of the final version,
   * see git history for the investigation trail):** each date-group
   * heading sits beside its own dedicated chevron `<button>` (a MUI
   * `IconButton`, no accessible name of its own) inside a `MuiCollapse`
   * wrapper -- confirmed live via direct DOM inspection that:
   *   1. The group genuinely starts COLLAPSED on a fresh page load/reload
   *      (`.MuiCollapse-root` lacks the `MuiCollapse-entered` class, height
   *      pinned to 0) -- only the heading (+ chevron) renders, zero rows.
   *   2. Clicking the heading text DOES toggle expand/collapse (bubbles to
   *      the same handler as the chevron button) -- confirmed by the
   *      resulting `MuiCollapse-entered` class and the group's rows
   *      becoming visible.
   *   3. **The expand transition itself is what triggers the group-scoped
   *      fetch**, not a scroll gesture -- confirmed live: clicking a
   *      collapsed "Older" heading fired
   *      `date_group=older&limit=10&offset=10` with no scrolling involved
   *      at all. A separate attempt at forcing scroll-driven pagination
   *      (via a real viewport resize, then via a forced `max-height` +
   *      `scrollTop` write, both with a genuinely overflowing container)
   *      produced a real scroll but never triggered a fetch -- scrolling is
   *      not the trigger for this account's current data volume.
   *   4. `MuiCollapse`, true to its name, does NOT unmount children on
   *      collapse -- `.MuiCollapse-wrapperInner`'s rows remain queryable in
   *      the DOM even while visually collapsed (clipped via `height: 0`),
   *      which is why an earlier verification attempt that only checked
   *      `conversationRows().count()` before/after a click could not tell
   *      collapsed from expanded and produced a misleading "clicking does
   *      nothing" result.
   *
   * The scroll-to-bottom fallback below is kept for a group whose OWN
   * container ends up overflowing after expansion (a larger account, more
   * than one page beyond the initial 10) -- harmless/no-op otherwise.
   */
  async scrollGroupToBottom(name: 'Today' | 'This Week' | 'Older'): Promise<void> {
    const heading = this.groupHeading(name);
    const isExpanded = await heading.evaluate((el) => {
      const collapseRoot = el.parentElement?.nextElementSibling;
      return collapseRoot?.classList.contains('MuiCollapse-entered') ?? false;
    });
    if (!isExpanded) {
      await heading.click();
    }
    // Best-effort follow-up: if the now-expanded group's own container
    // genuinely overflows (more rows than fit), scroll it to bottom too --
    // a no-op when it doesn't (see class doc for why this account's current
    // volume never needs it).
    await heading.evaluate((el) => {
      let node: HTMLElement | null = el.parentElement;
      while (node) {
        const style = getComputedStyle(node);
        if (style.overflowY === 'scroll' || style.overflowY === 'auto') {
          if (node.scrollHeight > node.clientHeight) node.scrollTop = node.scrollHeight;
          return;
        }
        node = node.parentElement;
      }
    });
  }

  /**
   * Reads the authoritative expected total conversation count -- no
   * `"Conversations: N"` badge exists anywhere in the UI (GH#89/GH#90), so
   * this is the only count source: sum `pinned.total` + every
   * `date_groups[].total` from the initial (non-`date_group`-scoped)
   * `folder/prompt_lib?grouped=true` response.
   */
  async waitForGroupedTotal(timeout = 20_000): Promise<{ total: number; body: GroupedConversationsResponse }> {
    const response = await this.page.waitForResponse(
      (r) =>
        /\/folder\/prompt_lib\/\d+/.test(r.url()) &&
        r.url().includes('grouped=true') &&
        !r.url().includes('date_group=') &&
        r.status() === 200,
      { timeout },
    );
    const body = (await response.json()) as GroupedConversationsResponse;
    const total = (body.pinned?.total ?? 0) + (body.date_groups ?? []).reduce((sum, g) => sum + (g.total ?? 0), 0);
    return { total, body };
  }

  /** Waits for a specific date-group's own group-scoped paginated fetch
   * (`&date_group={group}&offset=10...`) -- fires only once that group's
   * own nested container is expanded and scrolled to bottom. */
  async waitForGroupResponse(dateGroup: 'today' | 'this_week' | 'older', timeout = 15_000): Promise<Response> {
    return this.page.waitForResponse(
      (r) =>
        /\/folder\/prompt_lib\/\d+/.test(r.url()) &&
        r.url().includes(`date_group=${dateGroup}`) &&
        r.status() === 200,
      { timeout },
    );
  }
}

/** Shape of `GET .../folder/prompt_lib/{ownerId}?...grouped=true` (and its
 * `&date_group={group}` follow-up variant, which uses the same nested
 * shape without the outer `date_groups` array) -- see `waitForGroupedTotal()`
 * and `waitForGroupResponse()` above. */
export interface GroupedConversationsResponse {
  pinned?: { total?: number };
  date_groups?: Array<{ name?: string; total?: number; conversations?: Array<{ id?: number }> }>;
}
