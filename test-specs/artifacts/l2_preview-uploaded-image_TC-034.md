# Test Case: Preview an Uploaded Image File from Chat Message

## Metadata
- **TMS ID**: TC-034
- **Linked Story**: GH#16 (EPIC), GH#99 (own tracking issue)
- **Priority**: l2 (case priority: High)
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`) — isolated `playwright-cli -s=TC-034` session with a unique `--persistent --profile=` directory (not the shared default MCP profile — see `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`). Confirmed non-shared: the very first navigation to `${BASE_URL}` bounced to the Keycloak login page unauthenticated, before any login, proving no inherited cookies from any of the other concurrently-running sibling sessions this batch (TC-030, TC-031, TC-033, TC-035, TC-038, TC-040, TC-041, TC-043 all observed open in parallel via `playwright-cli list`). Re-verified `window.location.href` after every navigation per that memory entry's standing mitigation.
- **Status**: ready-for-automation
- **Note**: a prior dispatch for this exact case died mid-run on a transient server-side rate limit before any AFS was written. This is a clean re-run — see § Cleanup for debris found and removed from that dead session.

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via `${BASE_URL}app/chat/` not redirecting to the Keycloak login page (this run's isolated profile started unauthenticated, so login through Keycloak SSO was performed first — confirmed handles below match `.agents/testing.md`'s existing SSO leads)
- Test image file `test-preview-image.png` exists locally at `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-preview-image.png` (gitignored, pre-generated, shared across the artifacts-module batch) — confirmed: 7,938 bytes, valid 800×600 PNG, SHA-256 `c4dcb8407155e0cd07957948af2e5fb4318bb0dc4a79c17caf74ce06335e4327`, well under the case's `< 1MB` requirement
- The "Announcing ELITEA 2.0.4!" release-notes banner (non-modal, top-of-page, dismissible via `getByRole('button', { name: 'close' })`) was present on first load and dismissed before interacting further — same recurring banner already documented elsewhere in this batch (GH#42, TC-036). It is not a `[role="dialog"]`, so the case's Setup step 3 guidance ("check for `[role="dialog"]`... close with Got it/ESC/click outside") doesn't literally match it, but the intent (clear blocking overlays first) is satisfied.
- **At least 1 image file uploaded to a chat message** — the case allows reusing "previous test or setup" state. Given this dispatch's flagged module-specific collision risk (multiple parallel sibling analysts uploading concurrently against the same shared `${TEST_USER}` account) and the explicit instruction to use a fresh conversation, this run did **not** depend on or search for another analyst's shared conversation/attachment — it created its own disposable fixture in a freshly-started, isolated conversation instead (see Test Data → Must Generate).

## Test Data

### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`
- `${TEST_IMAGE_PATH}` = `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-preview-image.png` (existing, local, gitignored fixture — already generated per the task briefing, re-used as-is, not modified)

### Must Generate (in test setup)
- A disposable chat message carrying the attachment, in a **brand-new, isolated conversation**:
  1. Click sidebar "Conversation" button to start a fresh conversation (avoids touching/racing any sibling analyst's existing conversation, and avoids the debris left by the prior crashed TC-034 attempt — see § Cleanup)
  2. Open the attach-files menu via the two-click sequence (plus-menu → attach files) and supply the fixture via `page.waitForEvent('filechooser')` + `fileChooser.setFiles(...)` — **not** direct `setInputFiles` targeting (2 ambiguous `input[type=file]` elements exist in the DOM, per TC-032's prior finding)
  3. Type accompanying message text `"TC-034 preview test image"` (required — the app rejects/won't send attachment-only messages, corroborating the module's documented "text prompt REQUIRED" rule, already established in TC-032/TC-036)
  4. Send
  - Observed fixture this run: conversation id **105** (owner/project id **21**), server-side attachment path `/attachments/325b8f39-f400-4e16-bd60-43333c5733a5/test-preview-image.png`

### Must Clean Up (in teardown)
- Delete the uploaded attachment **with the "Also delete from attachment storage" checkbox checked** (full purge, not just message-level detach) — see Concrete Handles / Cleanup
- **Additionally found and cleaned up**: a leftover conversation named literally "TC-034 preview test image" (conversation id **95**), with the same fixture already uploaded, left behind by the previous dispatch that died on a rate limit before writing an AFS. Purged the same way. See § Cleanup.

## Test Steps

1. Navigate to `${BASE_URL}app/chat/`.
   - **Verify**: if redirected to `auth.elitea.ai` (Keycloak), authenticate — fill `getByRole('textbox', { name: 'Username or email' })` with `${ELITEA_EMAIL}`, `getByRole('textbox', { name: 'Password' })` with `${ELITEA_PASSWORD}`, click `getByRole('button', { name: 'Sign In' })`. Wait for URL to settle on `${BASE_URL}app/chat/**`.
2. Dismiss the release-notes announcement banner if present: `getByRole('button', { name: 'close' })` scoped to the banner region.
3. Create a fresh, isolated conversation (avoids colliding with other chat history / parallel test runs and with the prior dead session's leftover conversation of the same name): `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })`.
   - **Verify**: URL becomes `${BASE_URL}app/chat` (no id yet); composer is empty; "Hello, {user}!" greeting visible.
4. Open the attach-files menu — two clicks required: click `getByRole('button', { name: 'plus menu' })` first, then click `getByRole('menu').getByRole('button', { name: 'attach files' })` inside the menu that opens (see § Concrete Handles — the bare, unscoped `getByRole('button', { name: 'attach files' })` locator TC-032 originally documented is a **strict-mode violation**: a second, non-actionable "attach files" button also lives in the composer's "Attach Files (N left)" wrapper and shares the same accessible name).
   - **Verify**: a native file chooser opens (`page.waitForEvent('filechooser')` fires).
5. Supply the fixture to the file chooser: `fileChooser.setFiles('${TEST_DATA_DIR}/test-preview-image.png')`.
   - **Verify**: an attachment chip labeled `test-preview-image.png` renders above the composer; the "Attach Files (N left)" counter decrements by exactly 1 (10 → 9 in this run).
6. Type `TC-034 preview test image` into `getByTestId('chat-input')`.
7. Click Send: `getByTestId('chat-send-button')` (accessible name is dynamic — `"send your question"` once text is present).
   - **Verify — network**: `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` resolves **201**, JSON body `[{"filepath": "/attachments/{uuid}/test-preview-image.png", "file_size": 7938}]` — `file_size` matches the local fixture's byte count exactly.
   - **Verify — navigation**: URL moves to `${BASE_URL}app/chat/{newConversationId}`.
8. Wait — condition-based, not a fixed sleep — for the sent message's thumbnail to render: poll for `getByRole('img', { name: 'test-preview-image.png' })`.
   - **Verify**: thumbnail renders at good visual quality (solid green background, white "Preview" text — matches the fixture), not a broken-image placeholder. Screenshot evidence: `test-results/screenshots/TC-034-step-04-thumbnail.png`.
9. Click the thumbnail to open the preview: `getByRole('img', { name: 'test-preview-image.png' }).click({ force: true })`.
   - **CRITICAL — do NOT use a bare `.click()`.** A normal (non-forced) click on the image, and even a normal `.hover()`, times out — see § Known Defects. `force: true` is required and is the confirmed, working pattern (matches the app's real click-handling: the click lands on an always-present sibling overlay whose own handler opens the preview, not on the `<img>` itself).
   - **Verify**: a `[role="dialog"]` mounts (`page.locator('[role="dialog"]').count()` goes from `0` to `1`). No URL change / no navigation occurs — this is an in-page modal, not a route change or new tab.
10. Wait for the preview to fully render: `page.getByRole('dialog')` visible, containing a header with the filename (`test-preview-image.png`), three icon buttons (Download image / Remove attachment / Close modal), and the enlarged image (`page.getByRole('dialog').getByRole('img', { name: 'test-preview-image.png' })`).
    - **Verify**: the enlarged image renders correctly (not broken), visibly larger than the inline thumbnail (thumbnail bounding box was 260×146px; modal image renders at roughly 500×400px in a 1280×720 viewport — confirms "full size/zoom" per the case's expected result). Screenshot evidence: `test-results/screenshots/TC-034-step-06-preview-modal-clean.png`.
11. Verify the dismiss mechanisms the case calls out (X button / ESC key / backdrop click) — test each independently, not just "one exists":
    - **X button** — click `page.getByRole('dialog').getByRole('button', { name: 'Close modal' })`.
      - **Verify**: dialog closes (`[role="dialog"]` count → `0`).
    - **Backdrop click** — re-open the preview (step 9), then `page.mouse.click(10, 10)` (a point clearly outside the dialog box).
      - **Verify**: dialog closes.
    - **ESC key** — re-open the preview (step 9), then `page.keyboard.press('Escape')`.
      - **Verify (fails today)**: dialog does **NOT** close. Reproduced twice (a bare `Escape` press, and a second attempt that first clicked inside the dialog to rule out a focus issue, then pressed `Escape` twice in a row) — `[role="dialog"]` count stayed at `1` throughout. **Filed as [GH#119](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/119)**, a genuine (if minor) product defect, not a case-text-drift item — see § Known Defects.
12. Close the preview via the X button (the confirmed-reliable primary path) and confirm the chat is still functional: `getByTestId('chat-input')` is visible, accepts typed input, and the page URL is unchanged (no forced navigation/reload as a side effect of the preview interaction).
    - **Verify**: typed `"post-preview functional check"` into the composer, read back the same value via `inputValue()`, then cleared it (did not send) — proves the composer isn't just visible but genuinely interactive post-close.
13. Check for error messages/toasts in the UI and for console errors across the entire flow (steps 1–12).
    - **Verify**: no error text/toast visible anywhere; console showed 0 app-level errors — the only entries were a benign ASCII-art build-version banner (`VERSION: 0.4.1833`) and a benign third-party `net::ERR_CONNECTION_CLOSED` on a Google Analytics beacon (same noise pattern already documented elsewhere in this batch, e.g. TC-036's AFS — not an app error).

### Teardown

14. Hover the attachment thumbnail → click "Remove attachment" (`force: true`, same overlay-intercept reason as step 9) → in the "Delete confirmation" dialog, check the "Also delete from attachment storage" checkbox → click "Delete".
    - **Verify**: `DELETE /api/v2/elitea_core/attachments/prompt_lib/21/105?filename=%2Fattachments%2F325b8f39-f400-4e16-bd60-43333c5733a5%2Ftest-preview-image.png&keep_in_storage=0` returns **204**; the thumbnail no longer renders in the message row afterward (message text itself left intact — matches this suite's established "chat history persists, no full-message cleanup" convention).

## Expected Results
- The sent message's thumbnail is clickable (via the confirmed `force: true` pattern) and opens a `[role="dialog"]` preview modal — no page navigation.
- The preview modal shows the filename, the image at a visibly larger size than the inline thumbnail, and three controls: Download image, Remove attachment, Close modal.
- **X button and backdrop click both dismiss the preview cleanly. ESC key does not (GH#119, filed defect).**
- Chat remains fully functional after the preview closes (composer visible, interactive, accepts and holds typed input; no forced navigation).
- Zero console errors/warnings across the entire login → upload → preview → dismiss → cleanup flow (excluding the known-benign GA beacon noise).
- Teardown leaves the account clean: attachment purged from both the chat message and attachment storage (`keep_in_storage=0`).

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Precondition: test image exists (< 1MB) | fixture available for upload | Preconditions | pre-flight `file`/`shasum` of `${TEST_IMAGE_PATH}` (7,938 bytes, valid 800×600 PNG) | asserted |
| Precondition: at least 1 image uploaded to artifacts (from previous test/setup) | an attachment exists to preview | steps 4–7 | step 7: `201` create response + rendered thumbnail | asserted *(re-authored: generated a fresh, isolated fixture in a brand-new conversation instead of depending on/searching for a sibling analyst's shared state or the prior dead session's leftover — see Preconditions note)* |
| Setup 1: maximize browser window | UI elements visible | n/a | n/a | out-of-scope — manual-execution artifact; Playwright's fixed viewport (1920×1080 / project default per `.agents/testing.md`) supersedes this |
| Setup 2: verify authenticated state via `/app/chat/` | no redirect = authenticated (else login first) | step 1 | step 1 | asserted |
| Setup 3: close open modals/overlays, `[role="dialog"]` | overlay dismissed | step 2 | step 2 | **clarification (not re-filed)** — the only overlay present is a non-modal banner, not a `[role="dialog"]`; same drift already tracked for other cases in this batch (GH#66/#67, TC-051) |
| Setup 4: ensure test image exists / upload via TC-030 steps 1–10 if none | image available in a chat message | steps 4–7 | step 7: `201` response, thumbnail renders | asserted *(decomposed: performed the equivalent upload-and-send flow directly rather than literally re-running TC-030's steps)* |
| 1 Navigate to chat / find conversation with attachment | chat loads with message history | steps 1, 3 | step 3: new conversation URL | asserted *(re-authored: created a fresh conversation with its own fixture rather than "finding" a pre-existing one, per the collision-risk precondition)* |
| 2 Wait 2 seconds for page to stabilize | messages fully loaded | step 8 | step 8: condition wait on image role, not fixed sleep | asserted *(re-authored per `.agents/testing.md` § Conventions — no `waitForTimeout`)* |
| 3 Locate message containing attachment | thumbnail visible inline | step 8 | step 8: `getByRole('img', { name: 'test-preview-image.png' })` | asserted |
| 4 Verify thumbnail displayed with reasonable quality (not broken) | thumbnail renders correctly | step 8 | step 8: screenshot evidence, image loads without a broken-image icon | asserted |
| 5 Click on image thumbnail | preview opens (modal, lightbox, or inline expansion) | step 9 | step 9: `[role="dialog"]` count 0→1 | asserted *(clarification — requires `.click({ force: true })`; a bare click or even a `.hover()` times out, see Known Defects/GH#117)* |
| 6 Wait 2 seconds for preview to fully render | preview visible with full-size/zoomed image | step 10 | step 10 | asserted *(translated to condition-wait on dialog visibility, no fixed sleep)* |
| 7 Verify image renders correctly at larger size (not broken, full quality, visible in viewport) | image displayed without error | step 10 | step 10: screenshot + size comparison vs. inline thumbnail | asserted |
| 8 Verify close button or click-outside-to-close behavior exists (X, ESC, or backdrop click) | close mechanism is available and visible | step 11 | step 11 (three sub-checks) | **partial — defect**: X button and backdrop click both confirmed working; **ESC key does not close the modal** (filed [GH#119](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/119) — genuine minor product defect, not case-text drift, since ESC-to-close is the standard ARIA dialog-pattern expectation and the underlying MUI component supports it by default unless explicitly disabled) |
| 9 Close preview using one of the available methods (click X, press ESC, or click outside) | preview closes cleanly, chat view returns to normal | step 12 | step 12 (X button used as the confirmed-reliable primary path) | asserted |
| 10 Verify chat message is still visible and interactive after closing preview | chat remains functional | step 12 | step 12: composer visible, accepts and holds typed input | asserted *(enrichment — case only asks for "visible"; this run also verified genuine interactivity, not just visibility)* |
| Expected Final State: preview opened, displayed full-size correctly, closed cleanly, chat functional | all conditions hold | steps 9–13 | steps 9–13 | asserted, with one flagged non-blocking defect (ESC, GH#119) |
| Teardown: navigate to `/app/artifacts` and delete, OR delete from chat message attachment menu | account left clean | step 14 | step 14: `DELETE .../attachments/...?keep_in_storage=0` → `204` | asserted *(re-authored: used the chat-inline "Remove attachment" path with the storage-purge checkbox checked, satisfying the case's own listed OR alternative — same pattern established in TC-036; the `/app/artifacts` UI path was not separately exercised since the inline path already achieves full cleanup)* |

### Axis 2 — Analyst additions

- Step 7 asserts the `201` response body's `file_size` field matches the local fixture's byte count exactly (7,938) — *added: stronger proof of a correct, uncorrupted upload than "a thumbnail appeared."*
- Step 8's screenshot evidence and step 10's size comparison against the inline thumbnail's bounding box — *added: the case's "renders correctly at larger size" is otherwise unfalsifiable without a concrete before/after size reference.*
- Step 11 tests all three dismiss mechanisms **independently and explicitly**, rather than confirming "one exists" as the case's phrasing technically only requires — *added: this is exactly what surfaced the ESC defect (GH#119); a shallower single-method check would have missed it entirely.*
- Step 12 asserts the composer is genuinely interactive post-close (type → read back → clear), not merely visible — *added: stronger functional-continuity guarantee than the case's "still visible" wording.*
- Step 13 asserts zero console errors across the **entire** flow (login through cleanup), not just around the preview click — *added: standard side-channel discipline, guards a future silent regression.*
- Cleaned up a leftover conversation/attachment (id 95) from the previous, crashed TC-034 dispatch, in addition to this run's own fixture (id 105) — *added: account hygiene beyond this case's own scope, but directly relevant since the leftover carried the exact same fixture filename and could otherwise confuse a future analyst or implementer scanning the shared account.*

## Cleanup
1. Removed this run's own attachment (conversation id 105) with "Also delete from attachment storage" checked — confirmed via `DELETE /api/v2/elitea_core/attachments/prompt_lib/21/105?filename=%2Fattachments%2F325b8f39-f400-4e16-bd60-43333c5733a5%2Ftest-preview-image.png&keep_in_storage=0` → `204`.
2. Removed the previous dead session's leftover attachment (conversation id 95, same conversation name "TC-034 preview test image", same fixture) the same way — confirmed via `DELETE /api/v2/elitea_core/attachments/prompt_lib/21/95?filename=%2Fattachments%2F66e37dac-c0de-44e9-91de-c274b0a2f3e5%2Ftest-preview-image.png&keep_in_storage=0` → `204`.
3. Both conversations' text/history are left in place (message text only, no attachment) — consistent with this suite's established "chat history persists, no full-message/conversation cleanup" convention (`.agents/testing.md` § Test data strategy).
4. Browser session closed (`playwright-cli -s=TC-034 close`) at the end of the run. Stray `.playwright-cli`/root-level snapshot `.yml` files created during exploration were deleted; none were committed.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| New/isolated conversation button | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` | — (confirmed project-wide handle, `.agents/testing.md`) |
| Announcement banner close | `getByRole('button', { name: 'close' })` (scope to the banner region) | `.filter({ has: page.getByText('Announcing ELITEA') })` on an ancestor |
| Attach-menu trigger ("+") | `getByRole('button', { name: 'plus menu' })` | `[aria-label="plus menu"]` |
| Attach Files menu item | `page.getByRole('menu').getByRole('button', { name: 'attach files' })` — **must be scoped to the open menu**; the bare, unscoped locator is a **strict-mode violation** (2 elements share the accessible name "attach files": this menu item, and a non-actionable button inside the composer's "Attach Files (N left)" wrapper) — **correction to TC-032's AFS, which documented the unscoped form** | `getByText('Attach Files')` scoped to the opened `role="menu"` |
| Hidden file input(s) | not directly targetable — use `page.waitForEvent('filechooser')` + `fileChooser.setFiles()` | `input[type=file]` (2 present in DOM, no disambiguating attribute — last resort) |
| Message textarea | `getByTestId('chat-input')` — **prefer this over any role-based locator**; the rendered placeholder text ("Type your message...") is not backed by a native `placeholder` or `aria-label` attribute on this textarea at all times (confirmed via `element.getAttribute()` returning `null` for both), so a `getByRole('textbox', { name: 'Type your message...' })` locator is not reliably stable | `getByPlaceholder('Type your message...')` (works when the attribute happens to be present, not guaranteed) |
| Send button | `getByTestId('chat-send-button')` | `getByRole('button', { name: 'send your question' })` — dynamic accessible name, only present once text is typed |
| Attachment chip, pre-send (composer) | `getByText('${FILE_NAME}')` scoped to the composer container | none found — no `data-testid` on the pre-send chip |
| Sent message's attachment thumbnail | `getByRole('img', { name: 'test-preview-image.png' })` (accessible name = filename) | reuse `[data-testid="chat-message-item"]` to scope to the specific message row if disambiguating among multiple attachments in one conversation |
| **Thumbnail click-to-preview** | `getByRole('img', { name: filename }).click({ force: true })` — **`force: true` is required**, not optional (see Known Defects) | none reliable — a coordinate-based `page.mouse.click(x, y)` at the image's center produces the same result but is more brittle to layout changes |
| Preview modal container | `page.getByRole('dialog')` (single dialog at a time — matches this app's already-confirmed single-instance modal system, `.agents/memory/qa-engineer/conversation_delete_dialog_and_modal_stacking.md`) | `page.locator('[role="dialog"]')` |
| Preview modal filename header | `page.getByRole('dialog').getByText('test-preview-image.png', { exact: true })` | n/a |
| Preview modal "Download image" button | `page.getByRole('dialog').getByRole('button', { name: 'Download image' })` | n/a |
| Preview modal "Remove attachment" button | `page.getByRole('dialog').getByRole('button', { name: 'Remove attachment' })` | n/a |
| Preview modal "Close modal" button (X) | `page.getByRole('dialog').getByRole('button', { name: 'Close modal' })` — **new confirmed handle, not previously documented**; distinct accessible name from the hover-inline controls | n/a |
| Preview modal enlarged image | `page.getByRole('dialog').getByRole('img', { name: 'test-preview-image.png' })` | n/a |
| Hover-revealed inline "Download image" / "Remove attachment" (pre-open, on thumbnail) | same accessible names as the modal's buttons, scoped outside the dialog — `page.getByRole('button', { name: 'Download image' })` (unscoped, since only reachable via `force: true` hover/click, matching TC-036's prior finding) | scope with `.filter({ has: page.getByRole('img', { name: filename }) })` on the ancestor message row if multiple attachments exist |
| Delete-confirmation dialog | `page.getByRole('dialog')` (heading "Delete confirmation") | `page.locator('[role="dialog"]')` |
| "Also delete from attachment storage" checkbox | `page.getByRole('dialog').getByRole('checkbox')` | n/a |
| Dialog "Delete" button | `page.getByRole('dialog').getByRole('button', { name: 'Delete' })` | n/a |
| "Attach Files (N left)" counter | `getByText(/Attach Files \(\d+ left\)/)` | n/a |

## Network Behavior
- `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` — fires on Send click when an attachment is present; `multipart/form-data`; **201** on success; JSON body `[{"filepath": "/attachments/{uuid}/{fileName}", "file_size": <bytes>}]`. (`projectId=21`, `conversationId=105` this run.)
- `GET /api/v2/artifacts/artifact/default/{projectId}/attachments/{uuid}%2F{filename}` — fires when the message with an attachment renders (fetches bytes for the inline thumbnail), and **fires again on each preview-modal open** (observed 3 separate `200` responses across 3 modal-open events in this run — unlike TC-036's "Download image" button, which reuses an already-fetched `blob:` URL with zero new network activity, opening the *preview* modal appears to mount a fresh `<img>` that re-requests the same URL each time; harmless — server returns `200` every time, just a minor redundant-fetch note for anyone optimizing network calls, not filed).
- `DELETE /api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}?filename={urlencoded path}&keep_in_storage=0|1` — fires on confirming the delete dialog. `204` on success.

## Known Defects Found During Exploration

1. **[MINOR — filed as [GH#119](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/119)]** The image preview modal does not close on `Escape`. The case explicitly lists ESC as one of three equally-valid dismiss mechanisms (X button / ESC / backdrop click); only two of the three actually work. Reproduced twice independently (bare Escape press; and click-inside-dialog-first-then-Escape-twice). This is a genuine (if minor) accessibility/UX gap, not case-text drift — `role="dialog"` + the standard WAI-ARIA dialog pattern (and MUI's own `Dialog` default behavior) both make ESC-to-close a reasonable expectation. **Automation guidance**: assert the *correct* expected behavior (`Escape` closes the dialog) using `expect.soft()` with a comment referencing GH#119, so the suite reports this red without masking it or blocking the X-button/backdrop assertions — same non-masking pattern already established for GH#43/GH#29 in the agents/pipelines modules.
2. **[Automation-hint only, not filed — corroborates already-tracked [GH#117](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/117)/[GH#110](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/110)]** Clicking the sent-message thumbnail to open the preview is not reliably actionable via a bare Playwright `.click()` (or even `.hover()`) — both time out because an always-present sibling overlay (`.attachActionButtons`, the same container hosting the hover-revealed Download/Remove buttons) sits exactly on top of the image's full bounding box with `pointer-events: auto` at all times (confirmed via `getComputedStyle`), not merely on hover as its visual behavior suggests. `locator.click({ force: true })` reliably opens the preview and is the confirmed working pattern — since a real mouse click at that coordinate does successfully trigger the preview open (verified via the force-click's actual outcome), this reads as a real-user-transparent, automation-only ergonomics gap rather than a functional defect, consistent with GH#117's identical judgment call (filed by the sibling TC-030 analyst; commented there to cross-link this corroboration).
3. **[Correction to a prior AFS's documented handle, not filed]** TC-032's AFS (`test-specs/artifacts/l3_upload-text-file_TC-032.md`) documents the "Attach Files" menu item as `getByRole('button', { name: 'attach files' })` with no scoping. This run found that locator throws a Playwright strict-mode violation (2 matching elements: the actual menu item, and a separate non-actionable button inside the composer's "Attach Files (N left)" wrapper). The correct, disambiguated locator is `page.getByRole('menu').getByRole('button', { name: 'attach files' })` — see § Concrete Handles. Flagging here for whoever implements/reuses TC-032's handle table, rather than editing that file directly (out of scope for this AFS).

No functional/product defects beyond the ESC-key finding above. The core preview feature (open → view at larger size → close via 2 of 3 documented methods → chat remains functional) works correctly end-to-end.

## Blocked Steps
None. All Setup steps, all 10 numbered case steps, and Teardown were executed end-to-end against the live system, using a disposable fixture created specifically for this case (conversation id 105, attachment fully purged by the end of the run), plus cleanup of a second leftover fixture (conversation id 95) from a previous crashed dispatch.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — this case joins `tests/artifacts.spec.ts` (module: artifacts, per `.agents/test-automation.yaml` and the EPIC's module-by-module delivery plan, GH#16).
- Page object: extends the planned `tests/pages/artifacts.page.ts` (seeded by TC-036) with an `openPreview(filename)` helper encapsulating the confirmed `force: true` click, and a `closePreview()` helper that uses the X button (not ESC, since ESC is a known-broken path — see Known Defects #1). The modal-scoped locators in § Concrete Handles (Download/Remove/Close inside `getByRole('dialog')`) should live alongside TC-036's existing hover-inline Download/Remove handles in the same page object, since both surfaces expose the identical action set on the identical attachment.
- Wait strategy: no `waitForTimeout` anywhere in this spec — `waitForResponse` for the create (`201`)/delete (`204`) attachment endpoints, and web-first `expect(page.getByRole('dialog')).toBeVisible()` / `.not.toBeVisible()` polling for the preview modal's open/close states.
- Known-defect assertion guidance: implement the ESC-closes-modal assertion as `expect.soft(...)` referencing GH#119 in a comment, per this project's established non-masking pattern for confirmed, filed, non-blocking product defects (GH#43, GH#29 in the agents/pipelines modules).
- Cross-case handle correction: see Known Defects #3 — any shared "open attach menu and pick a file" helper (likely reused across most of TC-030..043) should use the menu-scoped locator from this AFS, not TC-032's originally-documented unscoped one.
- Analyst execution note (process/tooling, not product): ran via `playwright-cli -s=TC-034`, a genuinely isolated persistent-profile browser (confirmed via a fresh, unauthenticated Keycloak redirect at session start). One tooling-only footgun encountered and self-corrected during exploration: driving the file chooser via both an inline `run-code` script's own `page.waitForEvent('filechooser')` handler *and* a separate subsequent `playwright-cli upload` command double-fired `setFiles()` on the same input, producing two attachment chips from a single intended upload (caught via the "Attach Files (N left)" counter dropping by 2 instead of 1; corrected by removing the duplicate chip before sending). This is purely an artifact of combining two CLI-level mechanisms for the same modal during manual exploration — production Playwright test code using only a single `page.waitForEvent('filechooser')` + `fileChooser.setFiles()` call (as documented in § Test Steps) will not encounter this.
- Per this batch's process fix, this AFS file is left **uncommitted/untracked** on disk — the artifacts-module implementer bundles it (and the other cases' AFS files) into one PR alongside the test code, per `.agents/workflow.md` § Test delivery pattern.

- **Amendment (implementer debugging pass, post-merge fix round)**: the repeated open/close/re-open cycle in step 11 (three dismiss mechanisms tested independently) reproducibly failed on the 3rd re-open (`getByRole('dialog')` never appearing after the force-click) when the assistant's own reply was still streaming at that point -- confirmed live via the failure's own screenshot, which showed a "Wiring integrations..." in-progress placeholder still rendering. Same class of race already root-caused for TC-037's own delete flow: an in-flight assistant reply appending new content appears to trigger a broader message-list re-render that can land mid-interaction with a sibling row's own elements (here, the user's own image thumbnail two rows away). Fixed by waiting for the assistant's reply to genuinely finish (`assistantReply()` contains non-whitespace text) before the repeated open/close cycle begins, matching every other single-attachment case in this module. Not a scope change -- with the race removed, the test now reliably reaches its own intended, correct terminal state: GH#119's `expect.soft()` still (correctly) reports the test as failed, since Playwright always marks a test failed when any soft assertion inside it fails, regardless of every other assertion passing. This is the SAME "red-for-a-real-reason" pattern already established for TC-035/GH#114 -- both are expected, by design, to show as failed in a full-suite run, not a residual bug to chase further.
