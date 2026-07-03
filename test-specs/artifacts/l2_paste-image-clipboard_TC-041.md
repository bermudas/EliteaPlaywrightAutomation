# Test Case: Upload Image via Clipboard Paste (Ctrl+V / Cmd+V)

## Metadata
- **TMS ID**: TC-041
- **Linked Story**: GH#106 (own tracking issue), parent epic GH#16
- **Priority**: l2
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`) — isolated `playwright-cli -s=TC-041` session with a unique `--profile=` persistent directory (not the shared default MCP profile — see `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`). `window.location.href` re-verified after every navigation per that memory entry's standing mitigation. Note: `.mcp.json` does **not** currently carry an `--isolated` flag (checked directly, only `@playwright/mcp@latest` with no args) — the dedicated persistent-profile `playwright-cli` session was therefore the *only* isolation actually in effect this run, not a defense-in-depth layer on top of an MCP-level one. Flagging for scout/Tal to correct the `.mcp.json` assumption in future dispatch prompts.
- **Prior attempt**: a previous TC-041 dispatch died mid-run on a transient server-side rate limit before writing an AFS. It left two orphaned artifacts in the shared account (see § Preconditions and § Cleanup) — both discovered and purged during this run's pre-flight and are not part of this AFS's own fixture.
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) via Keycloak SSO — confirmed handles match `.agents/testing.md`
- The "Announcing ELITEA 2.0.4!" release-notes banner (non-modal, dismissible via `getByRole('button', { name: 'close' })`) was present on first load and dismissed before interacting further — same recurring banner documented elsewhere in this batch (GH#42, TC-036's AFS). Not a `[role="dialog"]`, so the case's Setup step 3 literal guidance doesn't match it, but the intent (clear blockers first) is satisfied.
- Test image fixture `test-paste.png` exists locally at `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-paste.png` (gitignored, pre-generated) — confirmed: 6,100 bytes, valid 800×600 PNG, solid cyan background with the word "Paste" centered in white text.
- **Browser/automation context must be able to grant clipboard permissions** — `context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL })`. Without this, `navigator.clipboard.write()` throws a `NotAllowedError` and the paste technique below cannot run headlessly/unattended.
- **Pre-flight cleanup performed this run** (not part of the case's own fixture, but found and resolved before starting a clean attempt):
  - Conversation id 96 (`Test clipboard paste upload`, single message, uuid `9d21a710-0510-48db-9b7c-be0494e4619f/image_20260703_173346_1370KB.png`) — orphaned residue from the prior dead TC-041 dispatch. Purged via the chat-message "Remove attachment" flow with "Also delete from attachment storage" checked (`DELETE .../attachments/prompt_lib/21/96?...&keep_in_storage=0` → `204`); confirmed gone from both the chat message and the Artifacts bucket afterward.
  - **Not resolved, flagged for awareness only**: conversation id 87 ("New conversation test") also carries a leftover pasted image (`image_20260703_173133_1370KB.png`) **and** an unrelated `test-image-small.png` from what appears to be a different case's fixture — left untouched since it's not exclusively TC-041 residue and deleting it risked destroying another case's evidence. Not this AFS's responsibility to resolve; flagged here so the artifacts-module implementer/Tal is aware a genuinely ambiguous-ownership orphan exists in the shared account.

## Test Data

### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`
- `${TEST_IMAGE_PATH}` = `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-paste.png` (existing, local, gitignored fixture, re-used as-is)
- Message text: literal string `Test clipboard paste upload` (per case's own Test Data table — required, since attachments cannot be sent without accompanying text)

### Must Generate (in test setup)
- A brand-new, isolated conversation (sidebar "Conversation" button) — avoids racing sibling artifacts-module analysts/tests mutating the same shared `${TEST_USER}` account.
- The clipboard itself must be populated with the fixture's actual image bytes before the paste keystroke — see § Automation Hints for the exact, verified technique. This is generated fresh per test run (clipboard state does not persist across browser context lifecycles) — no static fixture file substitutes for it.
- Observed fixture this run: conversation id **108** (owner/project id **21**), server-side attachment path `/attachments/25583693-ba10-4847-8411-20293d6c606f/image_20260703_180620_1370KB.png`, `file_size: 14029` bytes. A second, disposable conversation (id **115**) was created solely to verify a clean (pre-deletion) baseline for step 10 — see Test Steps.

### Must Clean Up (in teardown)
- Delete the pasted image **with the "Also delete from attachment storage" checkbox checked**, via the chat-message removal flow — see § Cleanup. This is the case's own explicit Teardown requirement (unlike several sibling artifacts-module cases where teardown is optional/non-destructive) — do not skip it.

## Test Steps

1. Navigate to `${BASE_URL}app/chat/`.
   - **Verify**: if redirected to `auth.elitea.ai` (Keycloak), authenticate — `getByRole('textbox', { name: 'Username or email' })`, `getByRole('textbox', { name: 'Password' })`, `getByRole('button', { name: 'Sign In' })`. Wait for URL to settle on `${BASE_URL}app/chat/**`.
2. Dismiss the release-notes banner if present: `getByRole('button', { name: 'close' })`.
3. Create a fresh, isolated conversation: `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` (confirmed project handle).
   - **Verify**: URL becomes `${BASE_URL}app/chat` (no id yet); "Hello, {user}!" greeting visible; composer empty.
4. Grant clipboard permissions for the origin (one-time per context): `context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL })`.
5. Write the fixture's actual PNG bytes onto the real OS/browser clipboard via `page.evaluate()` — **not** a file-chooser, **not** `setInputFiles`. See § Automation Hints for the verified, copy-pasteable technique. This is the functional equivalent of Steps 3 in the case ("Copy image to system clipboard").
   - **Verify**: the evaluate call's return value confirms `navigator.clipboard.read()` reports exactly 1 item of type `image/png` (self-check inside the same evaluate call — confirmed this run: `{"itemCount":1,"types":[["image/png"]],"writtenBytes":6100}`).
6. Click the composer textarea to focus it: `getByTestId('chat-input')` (DOM-level resolves to `#standard-multiline-static` — don't select by that id directly, it's an implementation detail).
7. Press the paste shortcut: `page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V')`.
   - **Verify**: an attachment chip renders above the composer within ~1s — text node reading the auto-generated filename `image_{YYYYMMDD}_{HHMMSS}_{sizeInKB}KB.png` (this run: `image_20260703_180620_13.70KB.png` — **note the UI-displayed text inserts a decimal point for readability; the raw/API filename does not, see § Automation Hints**); "Attach Files (N left)" counter decrements from `10` to `9`.
   - **No file-chooser event fires** for this flow — clipboard paste bypasses the "plus menu" → "attach files" 2-click menu entirely (contrast with TC-030/TC-032's file-picker flow). Don't wait on `page.waitForEvent('filechooser')` for this case.
8. Inspect the pre-send chip's visual content — **it is a generic static SVG file-type icon, not a visual thumbnail of the pasted image** (confirmed via DOM inspection: the icon element is a fixed-path `<svg>`, not an `<img src="data:...">`). See § Known Defects Found — filed as a clarification (GH#121), not a bug.
9. Type the required message text into the same composer: `getByTestId('chat-input')` → type `Test clipboard paste upload`.
   - **Verify**: send button's accessible name flips from `"enter speaking mode"` to `"send your question"` (confirmed dynamic-name pattern, `.agents/testing.md`).
10. Click Send: `getByTestId('chat-send-button')`.
    - **Verify — network**: `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` → `201`, JSON body `[{"filepath": "/attachments/{uuid}/{filename}", "file_size": <bytes>}]` (this run: `[{"filepath": "/attachments/25583693-ba10-4847-8411-20293d6c606f/image_20260703_180620_1370KB.png", "file_size": 14029}]`). Capture `{uuid}` and the raw `{filename}` from this response for later steps — this is the authoritative filename, not the UI-displayed (dot-inserted) text from step 7.
    - **Verify — navigation**: URL moves to `${BASE_URL}app/chat/{newConversationId}`.
11. In the transcript, verify the sent user-message row: `getByTestId('chat-message-item')` — contains the message text AND a **real** rendered thumbnail this time: `getByRole('img', { name: '{rawFilename}' })` resolving to an `<img src="data:image/jpeg;base64,...">` — genuinely derived from the pasted bytes (confirmed visually: cyan background, "Paste" text, pixel-matching the source fixture).
12. Wait (condition-based) for the assistant's reply: `getByTestId('chat-answer-content')` or poll for the reply paragraph.
    - **Verify**: reply text demonstrably describes the actual image content (this run: *"It looks like a clipboard-pasted image upload test was received successfully. The image shows a cyan background with the word 'Paste' centered in white text."*) — proof the model genuinely read the pasted image via vision, not a placeholder/echo response.
13. Verify the thumbnail is clickable for a full-size preview — **normal `.click()` times out** in Playwright, reporting `.attachActionButtons` as intercepting pointer events (confirmed: this container's bounding box is pixel-identical to the image's, `pointer-events: auto`, `opacity: 1` at all times). Use `locator.click({ force: true })` instead (corroborates GH#117, independently re-confirmed this run on a clean/pre-deletion fixture — see § Known Defects). **Note for the implementer**: per this project's established finding (`.agents/memory/qa-engineer/image_preview_modal_esc_broken_and_permanent_overlay.md`, TC-040 addendum), the property that actually gates real browser hit-testing here is `visibility` (hidden at rest, visible on genuine hover) — `pointer-events`/`opacity` are red herrings Playwright's actionability check happens to report. A real mouse click reaches the image and opens the preview at rest or while hovering; this is a Playwright-actionability-vs-real-hit-testing gap, not a user-facing defect. `force: true` remains the correct, permanent automation pattern regardless of the underlying CSS mechanism.
    - **Verify**: a modal opens with heading = the raw filename, `Download image` / `Remove attachment` / `Close modal` icon buttons, and the full-size image. Network: `GET ${BASE_URL}api/v2/artifacts/artifact/default/{projectId}/attachments/{uuid}%2F{filename}` → `200` (confirmed clean baseline this run, zero console errors — see § Automation Hints for the exact scenario where this becomes a `400`, which is a *teardown-ordering* edge case, not the normal flow).
    - Close via `getByRole('button', { name: 'Close modal' })`.
14. Navigate to `${BASE_URL}app/artifacts`.
    - **Verify**: page loads; sidebar shows "Buckets: N" with `attach` / `attachments` / `warranty` (this account's current bucket set).
15. In the **left sidebar's bucket tree** (not the main-panel table — see § Automation Hints, clicking the main-panel row triggers inline-rename mode, not navigation), click the `attachments` bucket entry, then the `{uuid}` folder entry captured in step 10.
    - **Verify**: URL becomes `${BASE_URL}app/artifacts?bucket=attachments&folder={uuid}`; `getByTestId('artifacts-file-row')` shows exactly one row: raw filename, Type `PNG Image`, Size `13.7 KB`.
16. (Optional, bonus verification) Click the file row's own `Preview {filename}` button (`getByTestId('artifacts-file-row').getByRole('button', { name: /^Preview/ })`) — this is a **separate, independently working** preview mechanism from step 13's chat-transcript one.
    - **Verify**: a preview panel opens with a `Close preview` button and the full-size image; no console errors.

## Expected Results
- Clipboard-paste (Ctrl+V/Cmd+V) successfully attaches the fixture image to the composer without any file-chooser dialog.
- `POST .../attachments/prompt_lib/{projectId}/{conversationId}` → `201` with `filepath` + `file_size` in the response body.
- Sent message displays a genuine visual thumbnail (not present pre-send — pre-send is icon-only, see Known Defects); assistant's reply demonstrably describes the pasted image's actual content.
- Thumbnail opens a full-size preview modal when force-clicked (blocked on a normal click by a known pointer-events overlay, GH#117).
- File appears in `/app/artifacts` → `attachments` bucket → `{uuid}` folder, with the exact raw filename from the upload response.
- Zero console errors/warnings across the primary flow (steps 1–16).
- Teardown fully purges the file from both the chat message and Artifacts storage.

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Precondition: test image exists (< 1MB, valid PNG) | fixture available for paste | Test Data | pre-flight check (6,100 bytes, valid PNG) | asserted |
| Precondition: Artifact Toolkit is configured | paste-upload works | steps 5–10 | step 10: `201` response | asserted *(re-authored: no separate toolkit pre-configuration was needed or observed, same finding as TC-032's AFS — the chat composer's built-in attach/paste path is available by default)* |
| Setup 1: maximize browser window | all UI elements visible | n/a | n/a | out-of-scope — manual-execution artifact; Playwright's fixed viewport supersedes this (per `.agents/testing.md`) |
| Setup 2: verify authenticated state | redirect-or-authenticated branch | step 1 | step 1 | asserted |
| Setup 3: close modals/overlays, `[role="dialog"]` | overlay dismissed | step 2 | step 2 | **clarification** — it's a dismissible banner, not a `[role="dialog"]` modal, same drift already tracked (GH#66/#67, TC-036's AFS); not re-filed |
| Step 1: navigate to chat / open existing chat | chat loads, input toolbar visible | steps 1, 3 | step 3 | asserted *(decomposed — created a fresh isolated conversation rather than reusing an existing one, avoiding collision with 13 parallel sibling analysts in this batch)* |
| Step 2: wait 2 seconds for page to stabilize | interface fully loaded | step 3 verify | step 3 | asserted *(translated to condition-wait — greeting text visible — per Hard Rule, no fixed sleep)* |
| Step 3: copy image to system clipboard | image in clipboard memory | steps 4–5 | step 5's self-check (`navigator.clipboard.read()` → 1 item, `image/png`, correct byte count) | asserted — **this is the case's most consequential step; see § Automation Hints for the full verified technique** |
| Step 4: click message textarea to focus | textarea focused | step 6 | step 6 | asserted |
| Step 5: press Ctrl+V/Cmd+V | image pasted, preview/thumbnail appears in attachment area | step 7 | step 7 (chip renders, counter decrements) | **partially asserted / clarification** — a chip renders as expected, but see step 8/Known Defects: it's a generic icon, not a visual thumbnail |
| Step 6: verify thumbnail visible with filename indicator | thumbnail + filename shown | steps 7–8 | step 7 (filename text), step 8 (icon, not thumbnail) | **clarification** — filename indicator: confirmed; "thumbnail": generic icon substitutes for it pre-send, filed GH#121 |
| Step 7: type required message text | text entered | step 9 | step 9 | asserted |
| Step 8: click Send | message + attachment sent | step 10 | step 10 (`201` + navigation) | asserted |
| Step 9: wait for message with attachment (10s timeout) | message appears with text + thumbnail | steps 11–12 | step 11 (real thumbnail this time), step 12 (assistant reply content) | asserted *(translated to condition-wait, not fixed 10s sleep)* |
| Step 10: verify thumbnail clickable, opens preview | click opens preview | step 13 | step 13 (`{force:true}` + modal + `200` network) | **clarification** — normal click doesn't work (dead-zone overlay), `force: true` does; already filed/corroborated GH#117, independently re-verified here on a clean baseline |
| Step 11: navigate to `/app/artifacts` | artifacts page loads | step 14 | step 14 | asserted |
| Step 12: wait 10s with scroll trigger for lazy loading | all artifacts loaded | step 15 | step 15 | asserted *(translated to condition-wait; this bucket uses page-based pagination — "Rows per page: 10" — not infinite scroll, so no scroll trigger was needed to reach the 14-item bucket-list or the single-file folder; same disposition as TC-032's AFS for this step)* |
| Step 13: verify file appears in artifacts list | file listed with matching filename | step 15 | step 15 (`artifacts-file-row`, Type/Size match) | asserted |
| Expected Final State | image uploaded, message sent, file in bucket, no errors | steps 10–16 | throughout | asserted, plus the two clarifications above |
| Teardown: delete pasted image file | account left clean | § Cleanup | `DELETE .../attachments/prompt_lib/...&keep_in_storage=0` → `204` | asserted — **see § Cleanup for why the Artifacts-page-only delete path is NOT sufficient by itself** |

### Axis 2 — Analyst additions

- Step 5's clipboard self-check (`navigator.clipboard.read()` verifying item count/type/byte-length before ever pressing paste) — *added: this is the single most failure-prone step in the entire case; asserting the clipboard write actually landed, before blaming the paste keystroke for a failure, saves significant debugging time downstream.*
- Step 12 asserts the assistant's reply *content* (genuinely describes the image), not just its existence — *added: same rationale as TC-032's AFS — the strongest available proof the image was actually processed server-side via vision, not silently dropped.*
- Step 13's clean-baseline re-verification of GH#117's force-click finding, using a disposable second conversation (id 115) created specifically to isolate this check from the main fixture — *added: GH#117 was filed by a different case (TC-030/TC-034); rather than taking it on faith, independently reproduced it here on TC-041's own paste-produced attachment before relying on it in this AFS's step 13.*
- Step 16 (optional Artifacts-page "Preview" button) — *added: not in the case's numbered steps, but directly relevant context for step 13's finding — clarifies that a working, un-intercepted preview mechanism *does* exist, just not via the chat-transcript thumbnail's normal click.*
- Filename-format distinction (UI-display dot-insertion vs. raw filename) documented at step 7 and carried through — *added: a naive implementer asserting the UI-displayed "13.70KB" string against the API/Artifacts-page raw "1370KB" string would get spurious failures; this is genuinely easy to miss.*

## Cleanup

**The case's own Teardown is not optional here** (unlike several sibling artifacts-module cases with a "no cleanup needed" precedent) — TC-041's Teardown section explicitly asks to delete the uploaded file.

1. In the sent message, force-click the thumbnail to open the preview modal (or hover the thumbnail directly in the transcript — both surfaces expose an identical "Remove attachment" control; see § Concrete Handles).
2. Click `getByRole('button', { name: 'Remove attachment' })`.
3. In the "Delete confirmation" dialog, **check** `getByRole('checkbox')` ("Also delete from attachment storage") before confirming.
4. Click `getByRole('button', { name: 'Delete' })`.
   - **Verify**: `DELETE ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}?filename={urlencoded path}&keep_in_storage=0` → `204`; thumbnail no longer renders in the message afterward; file no longer present under `/app/artifacts` → `attachments` → `{uuid}`.

**Do NOT rely on Artifacts-page-only deletion for teardown.** Deleting the file directly from `/app/artifacts` (kebab menu → Delete, no checkbox) does remove the S3 object (`DELETE /api/v2/artifacts/artifact/default/{projectId}/attachments?filename=...` → `200`) but **leaves the chat message's thumbnail rendering** (a cached `data:` URI, decoupled from the S3 object, persists across reload) — and if that stale thumbnail is later force-clicked, the preview modal's own `GET .../artifact/...` fetch now **404s/400s** with a genuine console error. Verified/filed as GH#122 this run. The chat-message-side removal (steps 1–4 above) is the only path confirmed to leave a fully consistent clean state on both sides.

The conversation itself (message text, now attachment-less) is left in place — consistent with this suite's established "chat history persists, no full-conversation cleanup" convention (`.agents/testing.md` § Test data strategy).

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| New/isolated conversation button | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` | — (confirmed project-wide handle) |
| Announcement banner close | `getByRole('button', { name: 'close' })` (scope to the banner region) | `.filter({ has: page.getByText('Announcing ELITEA') })` on an ancestor |
| Message textarea | `getByTestId('chat-input')` | `getByPlaceholder('Type your message...')` — DOM-level resolves to `#standard-multiline-static`, don't select by that id |
| Send button | `getByTestId('chat-send-button')` (stable regardless of accessible-name state — **prefer over name-based** to avoid the dynamic-name race) | `getByRole('button', { name: 'send your question' })` — only present once text is typed |
| Pre-send attachment chip (composer) | `getByText('{rawFilename}')` scoped to the composer container | none disambiguated — **no `data-testid`/aria-label on the chip's remove ("×") icon**, a genuine Locator-Ladder stop+flag gap (raw `<svg>`, no accessible name, no testid, confirmed via DOM inspection up to 6 ancestor levels) |
| Sent message row | `getByTestId('chat-message-item')` | — (confirmed project-wide handle) |
| Sent thumbnail (real image) | `getByRole('img', { name: '{rawFilename}' })` | scope to `getByTestId('chat-message-item')` first if multiple attachments exist in one conversation |
| Thumbnail click-to-preview | `locator.click({ force: true })` — **normal click times out**, blocked by `.attachActionButtons` (`pointer-events: auto`, bounding box pixel-identical to the image, always-on not hover-gated) | n/a — force is required, not optional |
| Preview modal (from chat thumbnail) | `page.getByRole('dialog')` / `.MuiModal-root`, heading = raw filename | Buttons inside: `getByRole('button', { name: 'Download image' })`, `getByRole('button', { name: 'Remove attachment' })`, `getByRole('button', { name: 'Close modal' })` |
| Hover-action overlay (in-transcript) | `.attachActionButtons` container — `getByRole('button', { name: 'Download image' })` / `getByRole('button', { name: 'Remove attachment' })` — **only reliably reachable via `{force: true}` clicks or the preview-modal's own copies of these buttons** (the modal's buttons are NOT covered by an intercepting overlay and accept normal clicks) | prefer the modal-based buttons for automation — no force-click needed there |
| Delete-confirmation dialog | `page.getByRole('dialog')` (only one mounted at a time, heading "Delete confirmation") | `page.locator('[role="dialog"]')` |
| "Also delete from attachment storage" checkbox | `page.getByRole('dialog').getByRole('checkbox')` | n/a |
| Artifacts sidebar bucket entry (e.g. "attachments") | **Sidebar bucket-tree entry**, not the main-panel table row — `page.locator('nav, aside').getByText('attachments', { exact: true })` scoped to the bucket tree region (exact scoping container not disambiguated by a stable testid this run — Locator-Ladder stop+flag; clicking the wrong "attachments" instance, e.g. inside the main-panel breadcrumb, is a real risk) | — |
| Artifacts sidebar folder entry (`{uuid}`) | Sidebar tree entry, same region as above | — |
| Artifacts main-panel folder row | **Do not click to navigate** — clicking here selects/enters inline-rename-edit mode on the folder name, not navigation. Only the sidebar tree entry (above) actually navigates into the folder (confirmed live: URL only changed to `?...&folder={uuid}` after clicking the sidebar copy, never the main-panel row) | n/a |
| Artifacts file row | `getByTestId('artifacts-file-row')` | — (confirmed project-wide handle, TC-032's AFS) |
| Artifacts file row "Preview" button | `getByTestId('artifacts-file-row').getByRole('button', { name: /^Preview/ })` | — |
| Artifacts preview panel close | `getByRole('button', { name: 'Close preview' })` | — |
| "Attach Files (N left)" counter | `getByText(/Attach Files \(\d+ left\)/)` | n/a |

## Network Behavior
- `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` — fires on Send when an attachment is present. `201` on success. JSON body `[{"filepath": "/attachments/{uuid}/{rawFilename}", "file_size": <bytes>}]`.
- `GET ${BASE_URL}api/v2/artifacts/artifact/default/{projectId}/attachments/{uuid}%2F{rawFilename}` — fires when the preview modal opens (both the chat-transcript force-click path and the Artifacts-page "Preview" button). `200` while the underlying S3 object exists; **`400` if the object was already deleted via the Artifacts-page-only path while the chat message still references it** (see GH#122).
- `DELETE ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}?filename={urlencoded}&keep_in_storage=0|1` — fires on confirming the chat-message "Remove attachment" dialog. `204` on success. `0` = "Also delete from attachment storage" checked → fully purged; `1` = left unchecked → detached from the message only, file persists in the Artifacts bucket (independently confirmed both values this run — corroborating comment posted on GH#110, which had left the `1` case untested).
- `DELETE ${BASE_URL}api/v2/artifacts/artifact/default/{projectId}/attachments?filename=...` — the Artifacts-page-only delete path (kebab menu, no checkbox). `200` on success. Removes the S3 object but does **not** cascade to any chat message referencing it (see GH#122).
- GA4 beacons independently fire `attachment_uploaded` / `conversation_created` events — corroborating evidence only, not a reliable test oracle (same guidance as TC-032's AFS).

## Known Defects Found During Exploration

- **[INFO] GH#121** — filed this session. Pre-send composer attachment chip renders a generic static file-icon, not a visual thumbnail of the pasted image (case text implies a thumbnail at step 5/6). Reverse-masking guard: consistent, cross-file-type product behavior (confirmed same pattern as TC-032's non-image chip) — classified as a case-text-drift clarification, not a bug.
- **[MINOR] GH#122** — filed this session, **new finding**, not previously covered. Deleting a file via `/app/artifacts` does not invalidate the chat message that uploaded it: the message's thumbnail keeps rendering from a cached copy (persists across reload), and force-opening its preview modal afterward fires a genuine console `400` against the now-deleted S3 object. Reproduced deterministically once this run. Recommends either cascading the delete or having the preview modal degrade gracefully.
- **Corroborated, not re-filed**:
  - **GH#117** (filed under TC-030/TC-034) — chat-thumbnail click requires `{ force: true }`; independently re-verified here on a clean, pre-deletion baseline (conversation id 115) with a `200` network response and zero console errors, confirming the finding holds for TC-041's own paste-produced attachments too, not just file-picker uploads.
  - **GH#110** (filed under TC-036) — the "Also delete from attachment storage" checkbox / `keep_in_storage` query param mapping. Independently confirmed **both** values this run (`0` when checked, `1` when left unchecked, the latter of which GH#110 had explicitly flagged as "not independently re-tested") — posted as a corroborating comment on GH#110 rather than a new issue.
- No functional/security defects found in the core paste-upload path itself — clipboard-to-chat-to-Artifacts round-trips correctly, byte-for-byte in spirit (the assistant's vision-based description matches the fixture exactly), across all layers (client chip, network `201`, transcript render, Artifacts bucket listing, preview).

## Blocked Steps
None. All Setup steps, all 13 numbered case steps, and Teardown were executed end-to-end against the live system, using a disposable fixture created specifically for this case (conversation id 108, fully purged by end of run) plus a second disposable conversation (id 115) for isolated baseline verification of step 10 (also fully purged).

## Automation Hints

### The clipboard-paste technique (the case's core technical challenge)

Simulating a real OS clipboard paste of actual image bytes, verified working end-to-end this session:

```ts
// 1. One-time per browser context: grant clipboard permissions for the origin.
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });

// 2. Read the fixture file and base64-encode it (Node side).
const fs = require('fs');
const b64 = fs.readFileSync(TEST_IMAGE_PATH).toString('base64');

// 3. Inside the page, decode the bytes and write a real ClipboardItem to the
//    system clipboard via the async Clipboard API. This is NOT a JS-only
//    staging area -- navigator.clipboard.write() writes to the actual OS/
//    browser-process pasteboard once permission is granted, so a subsequent
//    native paste keystroke reads it back exactly like a human copy-paste.
const result = await page.evaluate(async (b64) => {
  const byteChars = atob(b64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'image/png' });
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  const items = await navigator.clipboard.read();       // self-check
  return { itemCount: items.length, types: items.map(i => i.types), writtenBytes: byteArray.length };
}, b64);
// Assert result.itemCount === 1, result.types[0] includes 'image/png',
// result.writtenBytes === fixture's actual byte length, BEFORE proceeding.

// 4. Focus the composer, then paste with the platform-correct shortcut.
await page.getByTestId('chat-input').click();
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
```

This was verified with `playwright-cli`'s `run-code` (which wraps `async page => {...}` and is executed via `page.evaluate`/`page.keyboard` exactly as above) — the same primitives are available directly in `@playwright/test`. No OS-level shell tool (e.g. macOS `osascript`/`pbcopy`) was needed or used; the in-browser `navigator.clipboard.write()` route is simpler, cross-platform (the same code runs on CI Linux runners, unlike an `osascript` shell-out), and was confirmed to produce a byte-identical, genuinely OS-level clipboard write (the subsequent paste keystroke correctly triggered the app's native paste handler with real `clipboardData`, not a synthetic event).

**If `context.grantPermissions(['clipboard-read', 'clipboard-write'])` is unavailable in a given CI/browser configuration** (e.g. some WebKit/Firefox configurations restrict the async Clipboard API more aggressively than Chromium), the documented fallback is an OS-level clipboard-set command (`osascript -e 'set the clipboard to (read (POSIX file "..." as «class PNGf»))'` on macOS, `xclip -selection clipboard -t image/png` on Linux, or a PowerShell `Set-Clipboard -Path` equivalent on Windows) run as a pre-test shell step, before the paste keystroke. Not needed this run — Chromium via `playwright-cli`/`@playwright/mcp` handled the in-browser route without issue — but documented here since `.agents/testing.md` currently only names `chromium` as the in-scope browser, and this fallback is the answer if that scope ever widens.

### Other implementation notes

- Framework: Playwright (TypeScript), per `.agents/testing.md` — joins `tests/artifacts.spec.ts` (module: artifacts, per `.agents/test-automation.yaml` and the EPIC's module-by-module delivery plan).
- No `waitForTimeout` — `waitForResponse` for the `201`/`204`/`200` endpoints above, web-first `expect(...).toBeVisible()` for the chip/thumbnail/modal, and the clipboard self-check (step 5) as a hard precondition-style assertion before ever pressing the paste shortcut.
- This case has **no dependency on the file-picker flow at all** (contrast with TC-030/032/036/037, which all route through "plus menu" → "attach files" → file chooser). The paste path is simpler in that one specific respect — no pointer-events-intercept risk on an attach button — but introduces the clipboard-permission/technique complexity documented above instead.
- Per this batch's process fix, this AFS file is left **uncommitted/untracked** on disk — the artifacts-module implementer bundles it (and the other 13 cases' AFS files) into one PR alongside the test code, per `.agents/workflow.md` § Test delivery pattern.
- Analyst execution note (process/tooling, not product): ran via `playwright-cli -s=TC-041` with a dedicated persistent profile directory (defense-in-depth per dispatch instructions, since `.mcp.json` itself does not currently set `--isolated` — see § Metadata). `window.location.href` re-verified after every navigation; no cross-talk observed with sibling analysts' sessions this run, beyond the pre-existing orphaned data discovered and partially cleaned per § Preconditions.
