import * as fs from 'fs';
import * as path from 'path';
import { expect, type Download, type JSHandle, type Locator, type Page, type Response } from '@playwright/test';
import { env } from '../fixtures/env';
import { dismissAnnouncementBanner } from './entityForm.page';

/**
 * Page object for the Artifacts bucket/file browser
 * (`/app/artifacts` -- **not** `/app/artifacts/all`, which 404s, see GH#90)
 * AND the chat-attachment lifecycle (upload / preview / download / delete)
 * that feeds it.
 *
 * Structurally distinct from `cardGridList.page.ts`'s `#EliteACustomTabPanel`
 * / `.MuiCard-root` grid pattern -- this is a two-pane bucket-rail + file-
 * panel layout with its own `data-testid` namespace (`artifacts-*`) that
 * shares nothing with the card grid. Confirmed live during TC-062's analysis
 * (`test-specs/lazy-loading/l3_empty-vs-loading-state_TC-062.md`).
 *
 * **Grown substantially for the `artifacts` module (TC-030..043)** per
 * `.agents/testing.md` § Structure's own plan -- everything below the
 * original TC-062-only section (bucket rail / empty-loading state) was added
 * during that module's implementation. All 14 AFS files independently
 * confirmed the same handles for the shared chat-composer attach flow, the
 * `.attachActionButtons` hover-reveal overlay, and the delete-with-purge
 * flow -- consolidated here rather than duplicated per spec-file test.
 */
export class ArtifactsPage {
  readonly page: Page;
  readonly bucketsHeading: Locator;
  readonly emptyState: Locator;
  readonly uploadButtonToolbar: Locator;

  // ---- Chat composer / attach-files flow ----
  readonly plusMenuButton: Locator;
  readonly chatInput: Locator;
  readonly sendButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.bucketsHeading = page.getByTestId('artifacts-buckets-heading');
    this.emptyState = page.getByTestId('artifacts-empty-state');
    this.uploadButtonToolbar = page.getByTestId('artifacts-upload-files-button');
    this.plusMenuButton = page.getByRole('button', { name: 'plus menu' });
    this.chatInput = page.getByTestId('chat-input');
    this.sendButton = page.getByTestId('chat-send-button');
  }

  /**
   * Both loading cues are plain text nodes with zero ARIA semantics (no
   * `role="status"`/`aria-busy`/`aria-live` -- filed as GH#85, a genuine but
   * non-blocking accessibility gap). The window is short-lived (~1-1.2s
   * once it appears) -- callers should not gate a hard wait on either being
   * *present* (timing-sensitive under CI load); prefer waiting on the
   * *resolved* state (`emptyState` below) or on the underlying
   * `/artifacts/s3/{bucket}` network response instead.
   */
  loadingTextBucketRail(): Locator {
    return this.page.getByText('Loading files...');
  }

  loadingTextMainPanel(): Locator {
    return this.page.getByText('Loading...', { exact: true });
  }

  /** Standard progressbar/aria-busy/class-based loading indicators --
   * confirmed live to match 0 elements at any point on this page (the app
   * communicates loading via the plain-text nodes above instead). Included
   * so a test can assert the case's own proposed selectors are genuinely
   * absent (GH#84 case-text drift), not just that ours are the real ones. */
  standardLoadingIndicators(): Locator {
    return this.page.locator('[role="progressbar"], [aria-busy="true"], .loading, .spinner');
  }

  async waitForEmptyState(timeout = 10_000): Promise<void> {
    await expect(this.emptyState).toBeVisible({ timeout });
  }

  /** A bucket-rail row, matched by its own name -- no `data-testid`/`role`/
   * accessible name exists on these rows (same handle-gap pattern as the
   * card grid, GH#12/#13-family) -- text match is the confirmed floor.
   *
   * Scoped to the bucket rail's own container (the nearest common ancestor
   * of `bucketsHeading` and the rail rows, confirmed live via direct DOM
   * inspection) -- an UNSCOPED text match is confirmed to also hit a
   * SECOND, unrelated element: once a bucket is selected, the main file
   * panel renders its own `MuiTypography-headingSmall` heading with the
   * identical bucket name text, which a bare `getByText(name, { exact:
   * true })` would ambiguously match too (Playwright strict-mode
   * violation, 2 elements). No stable testid exists on this scoping
   * container either (same Locator Ladder stop+flag as the rows
   * themselves) -- the 3-parent-level xpath walk up from `bucketsHeading`
   * is the confirmed-live floor.
   */
  bucketRow(name: string): Locator {
    return this.bucketsHeading.locator('xpath=../../..').getByText(name, { exact: true });
  }

  async selectBucket(name: string): Promise<void> {
    await this.bucketRow(name).click();
  }

  /** The second "Upload files"-named button, rendered only inside the
   * empty-state panel body when the selected bucket has 0 files -- scoped
   * off `emptyState`'s own container to disambiguate from the always-visible
   * toolbar button above (both share the identical accessible name). */
  uploadButtonInEmptyState(): Locator {
    return this.emptyState.locator('..').getByRole('button', { name: 'Upload files' });
  }

  /** "Buckets: N" rail summary -- renders as two text nodes ("Buckets:" then
   * the digit on its own line), so this matches with a regex spanning both
   * rather than an exact-equality `.textContent()` check. */
  bucketsCountText(): Locator {
    return this.page.getByText(/Buckets:\s*\d+/);
  }

  // =========================================================================
  // Chat: navigation / composer / attach-files flow (artifacts module)
  // =========================================================================

  /** Navigates to `/app/chat/` and asserts no Keycloak redirect occurred
   * (already-authenticated context, per this suite's worker-scoped
   * storageState fixture pattern). Every artifacts-module AFS's own step 1. */
  async gotoChat(): Promise<void> {
    await this.page.goto(`${env.BASE_URL}/app/chat/`);
    await expect(this.page).not.toHaveURL(/auth\.elitea\.ai/);
  }

  /**
   * Starts a brand-new, isolated conversation via the sidebar "Conversation"
   * button -- every one of the 14 artifacts-module AFS files deliberately
   * does this instead of reusing/finding an existing thread, to avoid
   * racing sibling tests mutating the same shared `${TEST_USER}` account
   * (`.agents/testing.md` § Concurrency policy). Extracted here (Hard Rule 7
   * -- used by all 14 tests in this module, far past the 3rd-repetition
   * threshold).
   */
  async startNewConversation(): Promise<void> {
    await this.page
      .getByRole('navigation', { name: 'side-bar' })
      .getByRole('button', { name: 'Conversation', exact: true })
      .click();
    // Root-caused during re-verification: the bare `/\/app\/chat$/` regex
    // (no query string) intermittently failed live -- confirmed the URL can
    // legitimately settle to `/app/chat?create=1` (an explicit create-intent
    // flag, if anything a STRONGER fresh-conversation signal than the bare
    // route) as well as plain `/app/chat`. Accept an optional query string
    // rather than asserting a specific one, since the exact flag isn't the
    // contract -- being on the un-numbered chat route (not `/app/chat/<id>`)
    // is.
    await expect(this.page).toHaveURL(/\/app\/chat(\?.*)?$/);
    // Race guard -- root-caused during this module's own implementation
    // (confirmed live, same mechanism `ConversationPage.createFixture()`'s
    // own doc comment already documents): clicking "+ Conversation" does
    // NOT atomically switch the composer to a genuinely blank conversation.
    // For a brief window (observed up to ~1s) the message-thread panel can
    // still point at whichever conversation was previously open even
    // though the URL has already settled to bare `/app/chat` -- sending
    // during that window lands the message in the STALE prior conversation
    // instead of a new one (confirmed live: two artifacts-module test runs
    // in a row landed their "own fresh conversation" messages in the exact
    // same thread). Waiting for the message-thread panel to genuinely empty
    // out is the confirmed-live, semantic signal that the SPA has finished
    // switching to a truly blank compose context.
    await expect(this.page.getByRole('region', { name: 'scrollable content' }).locator('[role="listitem"]')).toHaveCount(0, {
      timeout: 15_000,
    });
  }

  /**
   * Opens the composer's plus-menu and returns the resulting `menu` locator,
   * scoped so callers can read its `attach files` menu item without a
   * strict-mode collision -- a bare, unscoped `getByRole('button', { name:
   * 'attach files' })` matches TWO elements once the menu is open (the menu
   * item itself, and a second, non-actionable button inside the composer's
   * persistent "Attach Files (N left)" wrapper). Confirmed and corrected
   * across TC-033/034/039/042/043's AFS files (a correction to TC-032's
   * originally-documented unscoped locator).
   */
  async openAttachMenu(): Promise<Locator> {
    await this.plusMenuButton.click();
    const menu = this.page.getByRole('menu');
    await expect(menu).toBeVisible();
    return menu;
  }

  /** Menu-scoped "attach files" item -- only actionable once `openAttachMenu()`
   * has opened the menu (clicking it directly, without opening the menu
   * first, hangs Playwright's actionability retry loop -- confirmed project-
   * wide across every artifacts-module AFS). */
  attachFilesMenuItem(menu: Locator): Locator {
    return menu.getByRole('button', { name: 'attach files' });
  }

  /**
   * Full file-chooser-based attach flow: opens the plus-menu, clicks the
   * menu-scoped "attach files" item while listening for the native
   * `filechooser` event, then supplies `paths` to it. This is the confirmed,
   * project-wide-recommended technique (`page.waitForEvent('filechooser')` +
   * `fileChooser.setFiles()`) -- NOT raw `setInputFiles` targeting, since 2
   * ambiguous `input[type=file]` elements exist in the DOM with no
   * disambiguating attribute. Accepts an array for batch attaches (TC-039/
   * 042/043) -- Playwright's `setFiles([...])` models a native OS multi-select
   * in one call.
   */
  async attachFiles(paths: string | string[]): Promise<void> {
    const menu = await this.openAttachMenu();
    const [fileChooser] = await Promise.all([
      this.page.waitForEvent('filechooser'),
      this.attachFilesMenuItem(menu).click(),
    ]);
    await fileChooser.setFiles(paths);
  }

  /** Every `input[type=file]` element's current `accept` attribute value --
   * used by TC-031/TC-032/TC-038 as the automatable proxy for "does the app
   * intend to allow/reject this extension" (Playwright's `setFiles()`
   * bypasses OS-level `accept` filtering entirely, a Playwright/CDP
   * limitation, not app-specific). */
  async fileInputAcceptValues(): Promise<string[]> {
    return this.page.locator('input[type="file"]').evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).accept));
  }

  /** Every `input[type=file]` element's current `.files.length` -- used by
   * TC-038 to prove the app's own JS actively clears a rejected selection
   * (`.exe`), rather than merely not rendering a chip for cosmetic reasons. */
  async fileInputFileCounts(): Promise<number[]> {
    return this.page.locator('input[type="file"]').evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).files?.length ?? 0));
  }

  /**
   * "Attach Files (N left)" ambient counter -- pre-cap state.
   *
   * Root-caused during implementation (corrected after the first fix
   * attempt -- `getByText()` reopening the menu -- still failed identically):
   * this string is NEVER present as rendered DOM text anywhere on the page.
   * Direct DOM inspection found it exists ONLY as a literal
   * `aria-label="Attach Files (N left)"` attribute on an always-in-DOM
   * composer-toolbar `<span>` wrapping a hidden duplicate attach button --
   * confirmed present and visible via `getByLabel()` both with the plus-menu
   * open AND closed. (The popup menu's OWN "attach files" item renders "Attach
   * Files" and "N left" as two separate sibling `<span>`s with no literal
   * parentheses in their text content at all -- that's a second, unrelated
   * reason the original `getByText(/Attach Files \(\d+ left\)/)` could never
   * match: even concatenated, that pair's DOM text has no parens.) `getByText`
   * only ever inspects rendered text content, never `aria-label`, so it was
   * structurally guaranteed to find zero elements regardless of menu state --
   * the "the popover closes on rejection" theory from the first fix attempt
   * was a red herring; the counter was reachable via `getByLabel()` the whole
   * time, with no menu-open precondition at all.
   */
  attachCounterText(): Locator {
    return this.page.getByLabel(/Attach Files \(\d+ left\)/);
  }

  /** "Max 10 attachments" ambient state -- replaces the "(N left)" label
   * once the 10-attachment cap is reached (TC-042/TC-043). Same aria-label-
   * only mechanism as `attachCounterText()` above (confirmed live: absent
   * from `document.body.innerText`, present as a `<span aria-label="Max 10
   * attachments">`) -- `getByLabel()`, not `getByText()`. */
  maxAttachmentsText(): Locator {
    return this.page.getByLabel('Max 10 attachments');
  }

  /** Overflow toggle rendered once > 2 files are attached in one message
   * (GH#118/TC-039) -- accessible text reads `"+N"` where `N = total - 2`. */
  showMoreFilesButton(): Locator {
    return this.page.getByRole('button', { name: 'Show more files' });
  }

  /** A single filename entry inside the opened overflow popover. */
  overflowFileItem(fileName: string): Locator {
    return this.page.getByRole('menuitem', { name: fileName });
  }

  /**
   * Closes the "Show more files" overflow menu (a MUI Popover/Menu,
   * `role="menu"`) opened via `showMoreFilesButton()`. Root-caused during
   * implementation (TC-039): the menu's own invisible `MuiBackdrop-root`
   * stays mounted and intercepts pointer events on the composer -- calling
   * `typeMessage()` right after checking the overflow's contents hangs
   * indefinitely on that backdrop, since nothing in the AFS-documented flow
   * ever explicitly closes the menu before moving on. `Escape` is the
   * standard, confirmed-working MUI Menu dismissal (distinct from the image
   * preview modal's own broken ESC handling, GH#119 -- that's a different
   * component). Every batch-upload case that opens this overflow
   * (TC-039/042/043) must call this before any further composer
   * interaction.
   */
  async closeOverflowMenu(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.page.getByRole('menu')).toHaveCount(0);
  }

  /** Pre-send attachment chip in the composer, matched by filename text --
   * no `data-testid` exists on this chip (gap noted since TC-032's AFS). */
  preSendChip(fileName: string): Locator {
    return this.page.getByText(fileName).first();
  }

  /**
   * Types `text` into the composer. `chat-input` is a container `<div>`, not
   * a fillable element (confirmed live, `conversation.page.ts`'s
   * `createFixture()` doc comment and this suite's own smoke-suite
   * precedent) -- click to focus, then drive real keystrokes via
   * `page.keyboard`, matching the confirmed-working project-wide pattern.
   */
  async typeMessage(text: string): Promise<void> {
    await this.chatInput.click();
    await this.page.keyboard.type(text);
  }

  async sendMessage(): Promise<void> {
    await this.sendButton.click();
  }

  /** The actual underlying MUI textarea backing `chat-input` -- `chat-input`
   * itself is a container `<div>`, not a fillable/readable-by-value element.
   * Implementation detail (do not select by this id at call sites outside
   * this page object); exposed here only for reading back a typed value via
   * `toHaveValue()`, matching the project-wide confirmed pattern already
   * used in `tests/modal-handling.spec.ts` (TC-050). */
  composerTextarea(): Locator {
    return this.page.locator('#standard-multiline-static');
  }

  // =========================================================================
  // Chat: sent-message / thumbnail / preview
  // =========================================================================

  /** Every message row in the transcript -- `chat-message-item` is shared by
   * BOTH the user's own sent message AND the assistant's reply row (not
   * user-specific, despite the generic testid name). Confirmed live during
   * implementation: `.last()` is NOT a reliable way to locate "the message
   * I just sent" -- the assistant's reply row mounts as a loading
   * placeholder ("Waking the agent...", "Packing its tools...") almost
   * immediately after Send and becomes the last item before any content
   * streams in, well before the row this test actually wants to assert on.
   * Use `userMessageRow(text)` below instead. */
  chatMessageItems(): Locator {
    return this.page.getByTestId('chat-message-item');
  }

  /** The specific message row containing `messageText` -- the confirmed-
   * reliable way to locate the user's own just-sent message row, immune to
   * the assistant's own reply row (also a `chat-message-item`) racing
   * ahead of it in DOM order. See `chatMessageItems()`'s own doc comment
   * for the root-caused reason `.last()` doesn't work here. */
  userMessageRow(messageText: string): Locator {
    return this.chatMessageItems().filter({ hasText: messageText });
  }

  /** Image-attachment thumbnail -- renders as a bare `<img>` with the
   * filename as its accessible name, no wrapping `data-testid` (confirmed
   * for images specifically; non-image attachments get `chat-artifact-file-card`
   * instead, see below). */
  messageThumbnail(fileName: string): Locator {
    return this.page.getByRole('img', { name: fileName });
  }

  /** Non-image attachment card (PDF/TXT/etc, TC-031/TC-032) -- optionally
   * filtered by filename text when disambiguating among multiple cards. */
  attachmentFileCard(fileName?: string): Locator {
    const card = this.page.getByTestId('chat-artifact-file-card');
    return fileName ? card.filter({ hasText: fileName }) : card;
  }

  assistantReply(): Locator {
    return this.page.getByTestId('chat-answer-content');
  }

  /**
   * Opens the sent message's thumbnail preview modal via a **forced** click
   * -- a plain (non-forced) `.click()`/`.hover()` on the image reliably
   * times out project-wide (GH#117/GH#110): the same `.attachActionButtons`
   * hover-reveal container that hosts the Download/Remove buttons sits on
   * top of the thumbnail and intercepts pointer events at its coordinates
   * even when its own buttons aren't the click target. Confirmed (TC-040)
   * to be a Playwright-actionability-vs-real-hit-testing false positive, not
   * a real user-facing defect -- `force: true` is the confirmed, permanent,
   * correct automation pattern regardless.
   */
  async openThumbnailPreview(fileName: string): Promise<void> {
    await this.messageThumbnail(fileName).click({ force: true });
    await expect(this.previewModal()).toBeVisible();
  }

  /** Only one dialog is ever mounted at a time in this app (confirmed
   * project-wide). */
  previewModal(): Locator {
    return this.page.getByRole('dialog');
  }

  previewModalDownloadButton(): Locator {
    return this.previewModal().getByRole('button', { name: 'Download image' });
  }

  previewModalRemoveButton(): Locator {
    return this.previewModal().getByRole('button', { name: 'Remove attachment' });
  }

  previewModalCloseButton(): Locator {
    return this.previewModal().getByRole('button', { name: 'Close modal' });
  }

  async closePreviewModal(): Promise<void> {
    await this.previewModalCloseButton().click();
    await expect(this.previewModal()).toHaveCount(0);
  }

  // =========================================================================
  // Chat: hover-revealed action buttons (Download / Remove) + delete
  // =========================================================================

  /**
   * The always-in-DOM overlay hosting the hover-revealed Download/Remove
   * controls. **Hover this container directly, not the inline `<img>`** --
   * TC-037's own exploration found hovering the image itself times out
   * (the container intercepts the pointer before a plain image-hover can
   * register), whereas hovering the container succeeds immediately.
   *
   * Root-caused during implementation (TC-034/TC-037, corrected after the
   * first fix attempt still hung for 120s): `.attachActionButtons` is a
   * **sibling** of the message's `<img>`, not its ancestor (confirmed via
   * direct DOM inspection -- both are children of the same wrapping
   * `MuiBox-root` div). A `.filter({ has: getByRole('img', { name }) })` on
   * `.attachActionButtons` therefore NEVER matches (it requires the img to
   * be a descendant), so `hover()` polled a permanently-empty locator until
   * the whole test's 120s timeout killed the browser out from under it.
   * The correct scoping walks from the image to its parent, then queries
   * `.attachActionButtons` there -- confirmed live (1 match, hover +
   * scoped Download/Remove buttons all resolve). This also still solves the
   * original ambiguity this scoping was added for: after a message's
   * preview modal has been opened/closed multiple times (the 3-dismiss-
   * mechanism check), TWO `.attachActionButtons` nodes can coexist in the
   * DOM simultaneously (a strict-mode violation on the bare selector) --
   * scoping via the specific attachment's own image parent still resolves
   * to the single, genuinely-live container regardless of any such
   * leftover, since the leftover node lives under a different image's
   * parent (or none).
   */
  attachActionButtonsContainer(fileName?: string): Locator {
    if (!fileName) return this.page.locator('.attachActionButtons');
    return this.page
      .getByRole('img', { name: fileName })
      .locator('xpath=..')
      .locator('.attachActionButtons');
  }

  /**
   * A plain (non-forced) `.hover()` on this container can hang indefinitely
   * -- Playwright's actionability check reports the container as "not
   * visible" even though it is genuinely present and a real mouse hover
   * does reveal it. Same class of Playwright-actionability-vs-real-hit-
   * testing false positive already established project-wide for force-
   * clicking this exact overlay's sibling `<img>` (GH#110/GH#117) --
   * `force: true` is the confirmed, permanent, correct pattern here too.
   */
  async hoverAttachActionButtons(fileName?: string): Promise<Locator> {
    const container = this.attachActionButtonsContainer(fileName);
    await container.hover({ force: true });
    return container;
  }

  downloadImageButton(scope?: Locator): Locator {
    return (scope ?? this.page).getByRole('button', { name: 'Download image' });
  }

  removeAttachmentButton(scope?: Locator): Locator {
    return (scope ?? this.page).getByRole('button', { name: 'Remove attachment' });
  }

  /**
   * The chat-message-side "Delete confirmation" dialog. Deliberately
   * UNSCOPED by accessible name -- confirmed live (GH#111) that this
   * dialog's `aria-labelledby="alert-dialog-title"` does not resolve to any
   * element in the DOM, so a name-scoped `getByRole('dialog', { name })`
   * query resolves to zero matches. Filtered by visible text instead.
   */
  chatDeleteConfirmationDialog(): Locator {
    return this.page.getByRole('dialog').filter({ hasText: 'Are you sure to delete' });
  }

  purgeStorageCheckbox(): Locator {
    return this.chatDeleteConfirmationDialog().getByRole('checkbox');
  }

  /**
   * Hovers the action-buttons overlay, clicks "Download image" while
   * listening for the browser's native download event -- not a fixed wait,
   * since the download is a client-side `blob:` re-save of already-fetched
   * bytes (no new network round trip, confirmed TC-036). `fileName`, when
   * given, scopes to the specific attachment's own container (see
   * `attachActionButtonsContainer()`'s doc comment on why this matters once
   * more than one such container can coexist in the DOM).
   */
  async downloadAttachmentImage(fileName?: string): Promise<Download> {
    const container = await this.hoverAttachActionButtons(fileName);
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.downloadImageButton(container).click(),
    ]);
    return download;
  }

  /**
   * Full chat-message-side remove-attachment flow: hover the action-buttons
   * overlay, click "Remove attachment", optionally check "Also delete from
   * attachment storage" (full purge, `keep_in_storage=0`, vs. message-level-
   * only detach, `keep_in_storage=1`), confirm. Waits for the authoritative
   * `DELETE .../attachments/prompt_lib/{owner}/{conversation}?...` response
   * and returns it so callers can assert its exact query params/status.
   * `fileName`, when given, scopes to the specific attachment (see
   * `attachActionButtonsContainer()`'s doc comment).
   */
  async removeAttachmentFromChatMessage(purgeStorage: boolean, fileName?: string): Promise<Response> {
    const container = await this.hoverAttachActionButtons(fileName);
    await this.removeAttachmentButton(container).click();
    const dialog = this.chatDeleteConfirmationDialog();
    await expect(dialog).toBeVisible();
    if (purgeStorage) {
      await this.purgeStorageCheckbox().check();
    }
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => /\/attachments\/prompt_lib\/\d+\/\d+\?/.test(r.url()) && r.request().method() === 'DELETE',
      ),
      dialog.getByRole('button', { name: 'Delete' }).click(),
    ]);
    return response;
  }

  // =========================================================================
  // Artifacts bucket: folder navigation, file rows, delete, S3 listing
  // =========================================================================

  /**
   * Navigates directly into a bucket/folder via URL query params -- the
   * confirmed-robust technique (TC-039/TC-040/TC-041/TC-042) that sidesteps
   * the in-list folder row's own click ambiguity entirely: a single click on
   * the main-table row only toggles its selection checkbox, and a
   * double-click enters inline rename-edit mode instead of navigating in.
   *
   * Dismisses the release-notes banner defensively after navigating --
   * root-caused during implementation: the banner's dismissal does not
   * persist across a fresh navigation to this route, and the banner
   * physically overlaps controls near the top of the Artifacts page (e.g.
   * `bucketInfoButton()`), which otherwise hangs indefinitely on an
   * intercepted hover/click.
   */
  async openBucketFolder(bucket: string, folderUuid: string): Promise<void> {
    await this.page.goto(`${env.BASE_URL}/app/artifacts?bucket=${bucket}&folder=${folderUuid}`);
    await expect(this.page).toHaveURL(new RegExp(`bucket=${bucket}&folder=${folderUuid}`));
    await dismissAnnouncementBanner(this.page);
  }

  artifactsFileList(): Locator {
    return this.page.getByTestId('artifacts-file-list');
  }

  artifactsFileRow(fileName: string): Locator {
    return this.page.getByTestId('artifacts-file-row').filter({ hasText: fileName });
  }

  artifactsFileRowCheckbox(fileName: string): Locator {
    return this.artifactsFileRow(fileName).getByRole('checkbox');
  }

  /** Accessible name is the generic **"delete entity"**, not its visible
   * label ("Delete selected files" / "Delete all files") -- GH#87,
   * reconfirmed across the whole module. */
  artifactsDeleteEntityButton(): Locator {
    return this.page.getByRole('button', { name: 'delete entity' });
  }

  /** The Artifacts-page-side delete-confirmation dialog (distinct wording
   * from the chat-message-side one, e.g. "Are you sure to delete all
   * files?" even for a single selection -- GH#117 point 3, wording-only,
   * not a data-safety bug: the underlying request correctly scopes to only
   * the checked file(s)). */
  artifactsDeleteConfirmationDialog(): Locator {
    return this.page.getByRole('dialog').filter({ hasText: 'Delete confirmation' });
  }

  /** Folder pagination footer text (e.g. "1 - 10 of 10") -- the scoped,
   * reliable per-folder count proxy; no persistent numeric "count badge"
   * exists anywhere in the Artifacts UI (GH#117/GH#118, reconfirmed
   * repeatedly across this module). */
  folderPaginationText(): Locator {
    return this.page.getByText(/\d+\s*-\s*\d+ of \d+/);
  }

  /**
   * "Bucket info" icon button -- accessible name is the static `"Bucket
   * info"` at rest. Root-caused during implementation: the AFS's own
   * documented locator (`getByRole('button', { name: /Retention
   * Policy.*Number of files/ })`) only matches once the button is actively
   * hovered -- MUI recomputes its accessible name to include the tooltip
   * content while shown, but at rest it's plain "Bucket info". A locator
   * built on the dynamic name never resolves without a hover already in
   * flight, which hangs indefinitely (no actionability timeout is set by
   * default in this project). Locate by the static name; read the count via
   * `bucketFileCount()` below, which drives the hover itself.
   */
  bucketInfoButton(): Locator {
    return this.page.getByRole('button', { name: 'Bucket info' });
  }

  /** The MUI tooltip that appears on hovering `bucketInfoButton()` -- a
   * separate `role="tooltip"` node (confirmed live), not baked into the
   * button's resting accessible name or a native `title` attribute. */
  bucketInfoTooltip(): Locator {
    return this.page.getByRole('tooltip');
  }

  /**
   * Hovers the "Bucket info" button and reads "Number of files: N" off the
   * resulting tooltip. Callers must ensure no overlay (the release-notes
   * banner in particular -- confirmed live to sit directly on top of this
   * button and intercept the hover indefinitely) is still mounted before
   * calling this.
   */
  async bucketFileCount(): Promise<number> {
    await this.bucketInfoButton().hover();
    const tooltip = this.bucketInfoTooltip();
    await expect(tooltip).toBeVisible();
    const text = await tooltip.textContent();
    const match = /Number of files:\s*(\d+)/.exec(text ?? '');
    if (!match) {
      throw new Error(`Could not parse file count from bucket-info tooltip: "${text}"`);
    }
    return Number(match[1]);
  }

  /**
   * Row-checkbox + toolbar-delete-entity + confirm flow -- confirmed
   * working for both a single file row (TC-030/TC-035) and a multi-file
   * bulk selection (TC-039's 3-file select-all, TC-042's whole-folder
   * select) in ONE call. Waits for the authoritative `DELETE
   * .../artifacts/artifact(s)/default/{projectId}/attachments?...` response
   * (both the singular- and plural-path variants observed across this
   * module resolve to the same regex) before returning.
   */
  async deleteViaRowCheckbox(rows: Locator | Locator[]): Promise<Response> {
    const rowList = Array.isArray(rows) ? rows : [rows];
    for (const row of rowList) {
      await row.getByRole('checkbox').check();
    }
    await this.artifactsDeleteEntityButton().click();
    const dialog = this.artifactsDeleteConfirmationDialog();
    await expect(dialog).toBeVisible();
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => /\/artifacts\/artifacts?\/default\/\d+\/attachments/.test(r.url()) && r.request().method() === 'DELETE',
      ),
      dialog.getByRole('button', { name: 'Delete' }).click(),
    ]);
    return response;
  }

  /**
   * Authoritative, UI-independent bucket-contents listing --
   * `GET /artifacts/s3/{bucket}?project_id={id}&format=json`. Preferred over
   * any UI-only check across this whole module: immune to the shared
   * account's concurrent-mutation noise from sibling tests, and doesn't
   * depend on the sometimes-slow Artifacts UI render timing. Uses
   * `page.request`, which shares the authenticated context's cookies.
   */
  async fetchBucketListing(bucket: string, projectId: string): Promise<S3Listing> {
    const response = await this.page.request.get(`${env.BASE_URL}/artifacts/s3/${bucket}?project_id=${projectId}&format=json`);
    return response.json();
  }
}

/** Shape of `GET /artifacts/s3/{bucket}?project_id={id}&format=json`. */
export interface S3ListingEntry {
  key: string;
  lastModified?: string;
  etag?: string;
  size?: number;
  storageClass?: string;
}

export interface S3Listing {
  name?: string;
  prefix?: string;
  delimiter?: string;
  maxKeys?: number;
  keyCount?: number;
  isTruncated?: boolean;
  contents?: S3ListingEntry[];
}

/** Shape of one entry in the `attachments/prompt_lib/{project}/{conversation}`
 * create response body: `[{ filepath, file_size }]`. */
export interface AttachmentUploadEntry {
  filepath: string;
  file_size: number;
}

/**
 * Parses `{projectId, conversationId}` out of an attachment-upload request
 * URL (`.../attachments/prompt_lib/{projectId}/{conversationId}`) -- the
 * only place either id is directly observable without hardcoding the shared
 * test account's own project id.
 */
export function parseAttachmentUrl(url: string): { projectId: string; conversationId: string } {
  const match = /\/attachments\/prompt_lib\/(\d+)\/(\d+)/.exec(url);
  if (!match) {
    throw new Error(`Could not parse projectId/conversationId from attachment URL: ${url}`);
  }
  return { projectId: match[1], conversationId: match[2] };
}

/** Parses the upload's destination UUID folder out of a response body's
 * `filepath` field (`/attachments/{uuid}/{fileName}`). */
export function extractUploadUuid(filepath: string): string {
  const match = /^\/attachments\/([^/]+)\//.exec(filepath);
  if (!match) {
    throw new Error(`Could not parse upload uuid from filepath: ${filepath}`);
  }
  return match[1];
}

/**
 * Suite-local network tracker for attachment-create responses -- collects
 * every `POST .../attachments/prompt_lib/{project}/{conversation}` -> `201`
 * response body fired while attached, for asserting exact upload counts
 * (TC-039: 3, TC-042: 10, TC-043: exactly-10-not-11) and per-file response
 * shape. Mirrors this suite's existing `trackConsoleErrors()` pattern.
 */
export function trackAttachmentUploads(page: Page): {
  uploads: Array<{ url: string; body: AttachmentUploadEntry[] }>;
  stop: () => void;
} {
  const uploads: Array<{ url: string; body: AttachmentUploadEntry[] }> = [];
  const listener = async (response: Response) => {
    if (
      /\/attachments\/prompt_lib\/\d+\/\d+$/.test(response.url()) &&
      response.request().method() === 'POST' &&
      response.status() === 201
    ) {
      uploads.push({ url: response.url(), body: (await response.json()) as AttachmentUploadEntry[] });
    }
  };
  page.on('response', listener);
  return {
    uploads,
    stop: () => page.off('response', listener),
  };
}

/**
 * Builds a real `DataTransfer` (with an actual `File`, decoded from the
 * fixture's bytes) inside the page context -- the framework-portable
 * equivalent of what a native OS-level file drag produces. There is no
 * public, first-class `Locator` API for simulating an OS-level file drag as
 * of Playwright 1.61 (`locator.setInputFiles()` is for `<input type="file">`
 * only) -- this is the community-documented technique, verified working
 * end-to-end against this app's live drop zone twice independently during
 * TC-040's analysis.
 */
async function createFileDataTransfer(page: Page, filePath: string, mimeType: string): Promise<JSHandle> {
  const buffer = fs.readFileSync(filePath).toString('base64');
  const fileName = path.basename(filePath);
  return page.evaluateHandle(
    async ({ bufferData, fileName, fileType }) => {
      const dt = new DataTransfer();
      const blob = await fetch(bufferData).then((res) => res.blob());
      const file = new File([blob], fileName, { type: fileType });
      dt.items.add(file);
      return dt;
    },
    { bufferData: `data:${mimeType};base64,${buffer}`, fileName, fileType: mimeType },
  );
}

/**
 * Whether the composer's drag-active dashed-border feedback is currently
 * showing. Root-caused during this debugging pass (not documented by the
 * AFS, which only says "the entire composer box gets a teal/cyan dashed-
 * border highlight" without naming the exact element): the dashed border is
 * applied to an OUTER WRAPPING ancestor of `chat-input` -- confirmed live via
 * direct DOM inspection (the ancestor's bounding box matches the visible
 * composer box in the AFS's own screenshot evidence exactly), several
 * levels up, not to `chat-input` itself. That ancestor's own class is a
 * MUI/emotion-generated, build-unstable string (observed to differ between
 * page loads of the same session) -- there is no stable class/testid/role to
 * target it by. Walking the ancestor chain from the one stable handle that
 * DOES exist (`chat-input`) and checking each one's own computed
 * `border-style` for "dashed" is the robust, class-name-independent way to
 * observe this state -- this is what made the original direct
 * `chatInput.evaluate(...borderStyle)` check (asserting on `chat-input`'s
 * OWN border, which never changes) structurally unable to ever pass.
 */
async function composerHasDragActiveBorder(page: Page): Promise<boolean> {
  return page.getByTestId('chat-input').evaluate((el) => {
    let node: HTMLElement | null = el;
    while (node) {
      if (getComputedStyle(node).borderStyle.includes('dashed')) return true;
      node = node.parentElement;
    }
    return false;
  });
}

/** Polls `composerHasDragActiveBorder()` until it reaches `expected` --
 * exported so the spec can assert both the "not yet active" (pre-drag) and
 * "now active" (during dragover) states without duplicating the ancestor-walk
 * logic. */
export async function expectComposerDragActiveBorder(page: Page, expected: boolean, timeout = 3_000): Promise<void> {
  await expect.poll(() => composerHasDragActiveBorder(page), { timeout }).toBe(expected);
}

/**
 * Dispatches `dragenter` + `dragover` only (no `drop`) on the composer --
 * for asserting the dragover-active visual feedback (dashed-border
 * highlight) BEFORE completing the drop (TC-040 step 4). Returns the
 * `DataTransfer` handle so a caller can continue the SAME drag gesture with
 * `dropDraggedFile()` below, rather than starting a second, independent one.
 *
 * Root-caused during this debugging pass: an EARLIER version of this helper
 * returned `void`, and TC-040's own test called this once (to check the
 * visual feedback), then separately called the old `dropFileOnComposer()`
 * (which built its OWN, second `DataTransfer` and re-dispatched its own
 * `dragenter`/`dragover` before `drop`) -- two independent drag sequences
 * back-to-back, with no `dragleave`/`drop` ending the first one. Confirmed
 * live, reproducibly (2 consecutive clean runs, not a one-off flake): the
 * app's own attach-slot counter never decremented after the second
 * sequence's `drop` (stayed at "10 left" instead of "9 left") even though
 * the pre-send chip still rendered -- consistent with the app's internal
 * drag-state tracking (most nested-drag-target implementations count
 * enter/leave pairs) getting left in an inconsistent state by the
 * back-to-back double dragenter with no leave/drop between them. Continuing
 * a SINGLE gesture (one `DataTransfer`, one dragenter/dragover, one drop) is
 * both the technique the AFS's own code sample documents and the fix.
 */
export async function dragOverComposer(page: Page, filePath: string, mimeType = 'image/png'): Promise<JSHandle> {
  const dataTransfer = await createFileDataTransfer(page, filePath, mimeType);
  const target = page.getByTestId('chat-input');
  await target.dispatchEvent('dragenter', { dataTransfer });
  await target.dispatchEvent('dragover', { dataTransfer });
  return dataTransfer;
}

/** Completes a drag gesture already started by `dragOverComposer()` --
 * dispatches only `drop`, reusing the SAME `DataTransfer` handle (see that
 * function's own doc comment for why a second, independent `DataTransfer` +
 * re-dispatched `dragenter`/`dragover` left the app's attach-slot counter
 * stuck). */
export async function dropDraggedFile(page: Page, dataTransfer: JSHandle): Promise<void> {
  await page.getByTestId('chat-input').dispatchEvent('drop', { dataTransfer });
}

/** Full drag-and-drop sequence (`dragenter` -> `dragover` -> `drop`) on the
 * chat composer in ONE continuous gesture -- for callers that don't need to
 * assert the dragover-only visual feedback separately. Prefer
 * `dragOverComposer()` + `dropDraggedFile()` when both need checking (TC-040). */
export async function dropFileOnComposer(page: Page, filePath: string, mimeType = 'image/png'): Promise<void> {
  const dataTransfer = await createFileDataTransfer(page, filePath, mimeType);
  const target = page.getByTestId('chat-input');
  await target.dispatchEvent('dragenter', { dataTransfer });
  await target.dispatchEvent('dragover', { dataTransfer });
  await target.dispatchEvent('drop', { dataTransfer });
}

/**
 * Writes the fixture's actual image bytes onto the real OS/browser
 * clipboard via the async Clipboard API (`navigator.clipboard.write()`),
 * inside the page context. Requires `context.grantPermissions(['clipboard-
 * read', 'clipboard-write'], { origin: BASE_URL })` to have been called
 * first (caller's responsibility -- context-level, one-time per test).
 * Self-checks the write via an immediate `navigator.clipboard.read()`
 * before returning, so a caller can assert the write actually landed
 * BEFORE blaming a subsequent paste keystroke for a failure (TC-041's own
 * documented most-failure-prone step).
 */
export async function writeImageToClipboard(
  page: Page,
  filePath: string,
  mimeType = 'image/png',
): Promise<{ itemCount: number; types: string[][]; writtenBytes: number }> {
  const b64 = fs.readFileSync(filePath).toString('base64');
  return page.evaluate(
    async ({ b64, mimeType }) => {
      const byteChars = atob(b64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });
      await navigator.clipboard.write([new ClipboardItem({ [mimeType]: blob })]);
      const items = await navigator.clipboard.read();
      return {
        itemCount: items.length,
        types: items.map((i) => i.types),
        writtenBytes: byteArray.length,
      };
    },
    { b64, mimeType },
  );
}

/** Focuses the composer and pastes via the platform-correct keyboard
 * shortcut -- the functional equivalent of a real Ctrl+V/Cmd+V once the
 * clipboard has been populated via `writeImageToClipboard()`. */
export async function pasteFromClipboard(page: Page): Promise<void> {
  await page.getByTestId('chat-input').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
}
