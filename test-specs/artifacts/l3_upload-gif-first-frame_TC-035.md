# Test Case: Upload and Preview Animated GIF File via Chat (First Frame Only)

## Metadata
- **TMS ID**: TC-035
- **Linked Story**: GH#16 (EPIC), GH#100 (tracking)
- **Priority**: l3 (medium)
- **Environment Explored**: `https://next.elitea.ai/` (prod-like "Next" env)
- **Analyst**: qa-engineer (Sage), analyst slot, 2026-07-03
- **Status**: defect-found

## IMPORTANT — this case surfaces a real product defect, not case-text drift

The case's own Feature Notes and this app's documented contract are explicit:
GIF attachments should display **first frame only, never animated** — anywhere
they're shown. Live execution confirms this holds for exactly **one** of the
**three** places the uploaded GIF is rendered, and is silently violated in the
other two:

| Surface | First-frame-only? | Evidence |
|---|---|---|
| Inline chat transcript thumbnail (small, always-visible) | **Correct** — static | `<img>` `src` is `data:image/jpeg;base64,...` — a pre-rasterized JPEG snapshot of frame 1. Physically cannot animate; it isn't a GIF anymore by the time it reaches the DOM. |
| Chat message's own "open preview" modal (opens via `.click({ force: true })` on the thumbnail) | **Defect** — animates | Historical evidence (this exact case, prior dead session, same modal): two screenshots of the same open modal show different frames ("Frame 3" then "Frame 4"). This session's own re-attempt of the same click was inconclusive only because the artifact had already been deleted (teardown ran first) — see § Known Defects for the precise chain of evidence. |
| Artifacts bucket's own "Preview" panel (`/app/artifacts`, file row → Preview) | **Defect** — animates | This session, live, decisive: `<img>` `src` is `blob:https://next.elitea.ai/<uuid>` (the raw original file, browser-native GIF auto-play applies). Screenshot at t=0 shows "Frame 2" (green); the **same still-open panel**, screenshot at t=+2s, shows "Frame 1" (red) — proves live animation, not a static render. |

Filed as **[GH#114](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/114)** (Major — functional inconsistency, restriction bypassed in 2 of 3 render surfaces), with a follow-up comment adding the chat-preview-modal corroborating evidence. This is a genuine functional defect per the reverse-masking guard test (the *product* is inconsistent with its *own* documented contract; the case text is accurate) — not a clarification.

This AFS still documents and asserts the parts of the flow that work correctly (upload, send, inline-thumbnail static rendering, Artifacts-bucket presence) as `ready-for-automation`, and documents the two failing preview assertions as **expected-to-fail-until-GH#114-is-fixed** — matching this project's established pattern for deterministic known-defect reds (`.agents/testing.md` § CI integration: "CI retries EVERY failure... including deterministic known-defect reds").

## Preconditions
- App accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- Test user `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` (role: `${TEST_USER}`) can authenticate via Keycloak SSO
- Local fixture file exists: `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-animated.gif` — confirmed live: valid GIF89a, 400×400, 14,866 bytes, 5 frames, each frame a solid color block with a "Frame N" (1–5) label baked into the pixels — this labeling is what makes frame identity visually provable from a screenshot alone, which is exactly how the GH#114 defect was proven.
- No toolkit pre-configuration required — same as TC-032's confirmed finding: the chat composer's built-in attach-files action needs no separate toolkit setup.

## Test Data
### Existing (re-use)
- `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — from `.env` (`${TEST_USER}`)
- `${BASE_URL}` — from `.env`
- `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-animated.gif` — static, pre-generated, gitignored, shared across the artifacts-module batch. Do not regenerate; reuse as-is.

### Must Generate (in test setup)
- Message text: literal string `Test GIF upload - expecting first frame only` (case-supplied, required — the app rejects attachment-only sends, already established across this module).

### Must Clean Up (in teardown)
- The uploaded file, via the Artifacts bucket UI (see § Cleanup) — this case's own Teardown section explicitly requires it (unlike TC-032/TC-034's "no cleanup needed" precedent), so automation must delete it, not just optionally.

### Pre-existing leftover found and cleaned up this session (not part of the test itself)
A prior dispatch for this exact case died on a transient rate limit after
already uploading the fixture and sending the message, leaving a leftover
conversation named literally "Test GIF upload expecting first" (conversation
id **92**) in the shared account's chat history. Its underlying artifact file
had *already* been deleted by that dead session's own partial teardown before
it died (confirmed via `GET /artifacts/s3/attachments?project_id=21&format=json`
— no `gif` entry present at session start), but the orphaned conversation
itself remained. Deleted it via the conversation's kebab menu (`#conversation-menu-action`
→ "Delete" → confirm) before starting this run's own execution, so this
AFS's own upload (conversation id **110**, artifact UUID
`b43d916d-daa9-4f15-8d93-e35aa58bf07a`) is unambiguously this session's own,
not a carry-over. This mirrors the identical pattern already documented in
the TC-034 AFS (its own dead-session leftover, conversation id 95, purged
the same way) — evidently a recurring artifact of this batch's earlier
rate-limit interruptions, not specific to TC-035.

## Test Steps

### Part 1: Upload GIF via Chat

1. Navigate to `${BASE_URL}app/chat/`.
   - **Verify**: if redirected to `auth.elitea.ai` (Keycloak), authenticate — fill `getByRole('textbox', { name: 'Username or email' })` with `${ELITEA_EMAIL}`, `getByRole('textbox', { name: 'Password' })` with `${ELITEA_PASSWORD}`, click `getByRole('button', { name: 'Sign In' })`. Wait for URL to settle on `${BASE_URL}app/chat/**`.
2. Dismiss the release-notes announcement banner if present: `getByRole('button', { name: 'close' })` scoped to the banner region. Not present this run (no banner rendered) — condition-check, don't assume presence.
3. Create a fresh, isolated conversation (avoids colliding with other chat history / parallel test runs): `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })`.
   - **Verify**: URL becomes `${BASE_URL}app/chat` (no id yet); composer is empty; "Hello, {user}!" greeting visible.
4. Open the attach-files menu — two clicks required: click `getByRole('button', { name: 'plus menu' })` first, THEN click `getByRole('button', { name: 'attach files' })` inside the menu that opens (same two-step gotcha already confirmed project-wide for TC-032/TC-036).
   - **Verify**: a native file chooser opens (Playwright: `page.waitForEvent('filechooser')` fires).
5. Supply the fixture to the file chooser: `fileChooser.setFiles('${TEST_DATA_DIR}/test-animated.gif')`.
   - **Verify**: an attachment chip renders above the composer — but **not** as an image thumbnail. Actual: a generic document-file icon + truncated filename text (`"test-animated..."`) + a remove-X control. This is a minor case-text drift against case step 5's "Thumbnail with filename test-animated.gif is displayed (may show first frame or static preview)" — no visual raster is shown pre-send, only an icon+text chip. Not filed (same class of finding as TC-032's "no data-testid on the pre-send chip", non-blocking, already an established pattern in this module). The "Attach Files (N left)" counter decrements by exactly 1 (10 → 9 in this run). Screenshot: `test-results/screenshots/TC-035-step5-pre-send-attachment.png`.
6. Type `Test GIF upload - expecting first frame only` into `getByRole('textbox', { name: 'Type your message...' })` (equivalently `getByTestId('chat-input')` once in an active conversation).
7. Click Send: `getByTestId('chat-send-button')` (dynamic accessible name — `"send your question"` once text is present, per `.agents/testing.md` confirmed handle).
   - **Verify — network**: `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` resolves **201**, JSON body `[{"filepath": "/attachments/{uuid}/test-animated.gif", "file_size": 14866}]`. This run: `projectId=21`, `conversationId=110`, `uuid=b43d916d-daa9-4f15-8d93-e35aa58bf07a`. Capture `{uuid}` for step 16.
   - **Verify — navigation**: URL moves to `${BASE_URL}app/chat/{newConversationId}`.
8. In the transcript, verify the sent user-message row: `getByTestId('chat-message-item')` — contains the message text AND the attachment, rendered as `getByRole('img', { name: 'test-animated.gif' })`. Unlike non-image attachments (which get a `getByTestId('chat-artifact-file-card')` wrapper, per TC-032), **image attachments render as a bare `<img>` with no card wrapper / no `data-testid`** — this is the confirmed handle floor for images specifically.
   - **Verify**: reply from the assistant renders (`getByTestId('chat-answer-content')`) — not required by the case, but this run's assistant reply independently corroborated the first-frame-only finding: *"The GIF appears to show the first frame only: a solid red background with the text 'Frame 1' centered."* Strong secondary proof the model itself only received frame 1's content, not the full animation. Screenshot: `test-results/screenshots/TC-035-step8-sent-message.png`.

### Part 2: Verify GIF Display (First Frame Only)

9. Observe the GIF thumbnail in the chat message.
   - **Verify (PASSES)**: thumbnail is static, first-frame-only. Confirmed via `element.src` inspection: `data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...` — a JPEG data URI, not the original GIF. Screenshot content matches: solid red background, "Frame 1" label.
10. Click on the GIF thumbnail to open the preview.
    - **CRITICAL — do not use a bare `.click()`.** `getByRole('img', { name: 'test-animated.gif' }).click()` (and a plain `.hover()`) times out — Playwright's actionability check reports a sibling `.attachActionButtons` hover-reveal overlay (the same container hosting "Download image" / "Remove attachment") as intercepting pointer events at the image's coordinates. This is a known, already-documented pattern for this exact element across the artifacts module (**[GH#117](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/117)**, filed against TC-030; also see TC-034's AFS, which independently confirmed the identical mechanic). **Use `.click({ force: true })`** — this is the confirmed, working pattern; a real click at that point does succeed (the false interception is a Playwright hit-test conservatism, not a real end-user blocker).
    - **Verify**: a `[role="dialog"]` mounts, containing a header with the filename, three icon buttons (Download image / Delete / Close modal — accessible names: `getByRole('button', { name: 'Download image' })`, a delete/trash icon, `getByRole('button', { name: 'Close modal' })`), and the enlarged image.
11. Wait for the preview to render (condition-wait on dialog visibility, not a fixed sleep) and observe.
    - **Verify (FAILS — GH#114)**: the case expects static, first-frame-only, no animation. Actual: this exact preview modal type has been confirmed (this case, prior dead-session run, same mechanism) to display a *different* frame at different points in time on the same still-open dialog — "Frame 3" then "Frame 4" (`test-results/screenshots/TC-035-anim-check-1.png`..`-5.png`, `TC-035-step-10-preview-modal.png`, all pre-dating this session's own teardown). This session's own live re-attempt of the identical click (after this run's own artifact had already been deleted per Part 3's teardown, run out of the case's documented order for defect-confirmation purposes) rendered a static "Frame 1" both at t=0 and t=+2s (`test-results/screenshots/TC-035-chat-preview-modal-t0.png` / `-t2.png`) — **not a contradiction**, this is the expected fallback once the backing file no longer exists server-side (the modal falls back to whatever's cached rather than fetching/animating a deleted resource). The decisive, unambiguous, live proof from *this* session is step 16's Artifacts-bucket preview (below), which used the same underlying raw-file-via-blob-URL rendering mechanism while the file was still live.
12. Verify the image is clear and not broken.
    - **Verify (partial)**: content renders cleanly (not corrupted, not a broken-image placeholder) in both the working and defective surfaces — "first frame renders correctly" holds in the sense that *a* frame always renders correctly; "first frame **only**" is what fails per step 11.
13. Close the preview: `getByRole('button', { name: 'Close modal' })`.
    - **Verify**: dialog unmounts (`[role="dialog"]` count → 0); chat remains functional (composer visible/interactive) — not separately re-verified this run beyond visual confirmation, TC-034's AFS already covers this assertion in depth for the same modal component.

### Part 3: Verify GIF in Artifacts Bucket

14. Navigate to `${BASE_URL}app/artifacts`, select the `attachments` bucket (`getByText('attachments', { exact: true })` in the bucket rail).
    - **Verify**: bucket contents load (condition-wait on the file-row list rendering, not a fixed 10s sleep — this batch's shared account is under heavy concurrent load this session per `.agents/memory` precedent from GH#117's corroborating note; a generous condition-wait, not a fixed short timeout, is required).
15. Open the folder named by the upload UUID captured in step 7 (`b43d916d-daa9-4f15-8d93-e35aa58bf07a` this run).
    - **Verify**: `getByTestId('artifacts-file-row')` lists `test-animated.gif`, Type **`GIF Image`**, and exposes a `getByRole('button', { name: 'Preview test-animated.gif' })` control.
16. Click "Preview test-animated.gif".
    - **Verify (FAILS — GH#114, decisive evidence)**: expected static first-frame-only. Actual: the preview panel's `<img>` `src` is `blob:https://next.elitea.ai/<uuid>` — the raw original file. Screenshot at open (t=0): "Frame 2" (green background), `test-results/screenshots/TC-035-artifacts-preview-modal.png`. Screenshot of the **same still-open panel** at t=+2s: "Frame 1" (red background), `test-results/screenshots/TC-035-artifacts-preview-2s-later.png`. The frame changed with zero further interaction — conclusive, live proof of animation.
    - Close via `getByRole('button', { name: 'Close preview' })`.

## Expected Results
- Upload succeeds end-to-end: `201` on the attachments POST, message sends, transcript shows text + attachment.
- Inline chat thumbnail: static, first-frame-only. **Holds.**
- Chat message's own preview modal: should be static, first-frame-only. **Fails (GH#114)** — confirmed to animate via historical same-session evidence; this run's own re-attempt was inconclusive only due to test-order sequencing (artifact already deleted).
- Artifacts bucket preview: should be static, first-frame-only. **Fails (GH#114)** — confirmed live, decisively, this session.
- File appears in the Artifacts → `attachments` bucket, Type `GIF Image`, in a folder keyed by the upload's UUID. **Holds.**
- Zero console errors during the core flow (upload → send → verify inline thumbnail → verify Artifacts presence). **Holds** — 0 errors/warnings logged across steps 1–9 and 14–15. (A single self-inflicted `400` was logged later, when this session deliberately re-tested the chat-preview-modal's Download action *after* already deleting the artifact during teardown — expected consequence of running verification out of the case's documented order for defect-confirmation purposes, not a defect in its own right; automation following the case's own step order — verify, then teardown last — will not encounter it.)

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Feature Notes: GIF (first frame only), supported formats list, 5MB/20MB size limits, text prompt required | contextual, not directly tested (size limits are TC-033's scope) | steps 6–7 (text-required) | step 7 | asserted *(text-required only; size limits out of scope for this case, correctly deferred to TC-033)* |
| Precondition: Artifact Toolkit is configured | n/a | — | — | out-of-scope — confirmed live (per TC-032 precedent) no separate toolkit setup gates the built-in attach-files action |
| Setup 1: maximize browser window | all UI elements visible | n/a | n/a | out-of-scope — manual-execution artifact; Playwright's fixed 1920×1080 viewport supersedes this |
| Setup 2: verify authenticated state | redirect-or-authenticated branch | step 1 | step 1 | asserted |
| Setup 3: close modals/overlays, `[role="dialog"]` | overlay dismissed | step 2 | step 2 | asserted *(condition-checked; no banner present this run — not a drift, just absent this session)* |
| Step 1: navigate to chat | chat page loads, input toolbar visible | steps 1, 3 | step 3 | asserted *(decomposed — AFS opens a fresh isolated conversation instead of reusing an existing thread, avoiding cross-test/cross-analyst collision on this heavily shared account)* |
| Step 2: wait 2s for stabilization | interface fully loaded | step 3 verify | step 3 | asserted *(translated to condition-wait, no fixed sleep)* |
| Step 3: click paperclip icon | file picker dialog opens | step 4 | step 4 | asserted *(decomposed into 2 clicks — plus-menu then attach-files — confirmed project-wide pattern)* |
| Step 4: select file via `setInputFiles()` | file selected, thumbnail/preview appears | step 5 | step 5 | asserted *(decomposed — used `waitForEvent('filechooser')` + `setFiles()`, not raw `setInputFiles` targeting, per the known gotcha)* |
| Step 5: verify GIF preview thumbnail visible pre-send | thumbnail with filename displayed | step 5 | step 5 | **clarification (non-blocking, not filed)** — pre-send chip is a generic file icon + truncated text, not an image raster; same class of finding as TC-032 |
| Step 6: type message text | text entered | step 6 | step 6 | asserted |
| Step 7: click Send | message with attachment sent | step 7 | step 7 (network 201 + navigation) | asserted |
| Step 8: wait for message with thumbnail (10s timeout) | message appears with text + thumbnail | step 8 | step 8 | asserted *(translated to condition-wait)* |
| Step 9: observe GIF thumbnail — expect static, first frame only | static image, not animated | step 9 | step 9: `img.src` is a JPEG data URI | **asserted — PASSES** |
| Step 10: click thumbnail to open preview | preview opens (modal/lightbox/inline) | step 10 | step 10: `[role="dialog"]` mounts | asserted *(clarification, non-blocking — requires `.click({force:true})`, already tracked under GH#117, not re-filed)* |
| Step 11: wait 2s, observe preview — expect static, no animation | static, first frame only | step 11 | step 11 | **defect — FAILS (GH#114)** |
| Step 12: verify image clear and not broken | first frame renders correctly | step 12 | step 12 | asserted *(partial — renders cleanly, but "first frame only" is the part that fails, covered by step 11's disposition)* |
| Step 13: close preview | preview closes, chat returns to normal | step 13 | step 13 | asserted |
| Step 14: navigate to `/app/artifacts` | artifacts page loads | step 14 | step 14 | asserted |
| Step 15: wait 10s with scroll trigger for lazy loading | all artifacts loaded | step 14 | step 14 | asserted *(translated to condition-wait; generous timeout recommended per GH#117's noted heavy-concurrent-load condition this batch)* |
| Step 16: verify file appears in artifacts list | file item visible with correct name | step 15 | step 15 | asserted |
| Expected Final State: GIF uploaded successfully, message shows attachment, static first-frame-only everywhere (chat thumbnail + preview), stored in Artifact bucket, no errors | see case | steps 8, 9, 11, 15–16 | — | **partial — defect**: upload/send/storage/inline-thumbnail all hold; "static... in... preview" fails (GH#114) |
| Teardown: delete uploaded file to leave account clean | file removed | step (Cleanup, below) | Cleanup | asserted — executed via Artifacts UI (case's own "OR" alternative to deleting from the chat message) |

### Axis 2 — Analyst additions

- Step 9's `img.src` inspection (JPEG data-URI vs. blob URL) — *added: this is the single most decisive, reusable technical signal for "is this surface first-frame-only or not" across all three render surfaces. Automation should assert on `src` prefix (`data:image/jpeg` = safe, `blob:` = raw file, re-verify contract) rather than only visually inspecting frame content, since the latter requires the fixture to have distinguishable per-frame content (this fixture conveniently does — "Frame N" labels — but a production GIF might not).*
- The assistant's own vision-model reply (step 8) independently corroborating "first frame only" — *added: an unplanned but strong secondary confirmation channel, worth keeping in automation as a loose text-contains assertion (non-brittle: assert the reply mentions "first frame" or similar, not an exact string) since it validates the *server-side* pipeline hands the model only frame 1, not just that the client renders frame 1.*
- Screenshot-two-seconds-apart technique (steps 11, 16) — *added: the standard way to prove animation vs. a static render from a screenshot-based test harness — one screenshot alone can't distinguish "static image showing frame 2" from "animating image caught mid-frame." Two screenshots of the same still-open surface, separated by a wait, with different content, is proof; automation should keep this two-sample pattern for any regression test guarding GH#114's fix.*

## Cleanup
The case's own Teardown section explicitly requires deleting the uploaded
file (unlike TC-032/TC-034's "no cleanup needed" precedent) — executed this
session:

1. Navigate to `${BASE_URL}app/artifacts`, `attachments` bucket, folder `b43d916d-daa9-4f15-8d93-e35aa58bf07a`.
2. Check the file row's checkbox: `getByTestId('artifacts-file-row').getByRole('checkbox').check()`.
3. Click the now-enabled delete button: `getByRole('button', { name: 'delete entity' })` (accessible name is `"delete entity"`, not its visible label — already tracked, GH#87, not re-filed).
4. Confirm in the dialog: `getByRole('button', { name: 'Delete' })`. Dialog text reads "Are you sure to delete all files?" even for a single selected file — misleading wording, already tracked (GH#117 item 3), not re-filed; verified this is wording-only (the underlying request scopes to the single checked file).
5. **Verify**: re-fetch `GET ${BASE_URL}artifacts/s3/attachments?project_id={projectId}&format=json` and confirm no entry with the deleted key remains — confirmed this run (39 keys post-delete, zero `gif` matches). This JSON endpoint is a reliable, fast, UI-independent way to assert deletion succeeded, an alternative/supplement to polling the file list UI.

The conversation itself (id 110, "Test GIF upload expecting first") was **left in place**, consistent with this module's established precedent (TC-032/TC-034: conversations persist, only files get cleaned up when the case explicitly says so) — the case's own Teardown section only mentions the file, not the conversation.

Also cleaned up (not part of this case's own scope, but found and removed
per this session's own hygiene): the pre-existing leftover conversation
(id 92) from a prior dead dispatch of this same case — see § Test Data note
above. Its artifact file had already been removed by that dead session
before it died; no orphaned file was left to clean up, only the orphaned
conversation.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| New/isolated conversation button | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` | — (confirmed project-wide handle) |
| Announcement banner close | `getByRole('button', { name: 'close' })` (scope to banner region) | not present this run — condition-check |
| Attach-menu trigger ("+") | `getByRole('button', { name: 'plus menu' })` | `[aria-label="plus menu"]` |
| Attach Files menu item | `getByRole('button', { name: 'attach files' })` — only actionable after plus-menu is clicked | `getByText('Attach Files')` scoped to the opened menu |
| Hidden file input(s) | not directly targetable — `page.waitForEvent('filechooser')` + `fileChooser.setFiles()` | `input[type=file]` (multiple present, no disambiguation — last resort) |
| Message textarea | `getByTestId('chat-input')` | `getByPlaceholder('Type your message...')` / `getByRole('textbox', { name: 'Type your message...' })` |
| Send button | `getByTestId('chat-send-button')` | `getByRole('button', { name: 'send your question' })` — dynamic accessible name |
| Pre-send attachment chip | `getByText('${FILE_NAME}')` scoped to the composer (truncated text, generic file icon, no image raster) | no `data-testid` — same gap as TC-032 |
| Sent message row | `getByTestId('chat-message-item')` | — (confirmed project-wide) |
| Image attachment thumbnail (post-send) | `getByRole('img', { name: '${FILE_NAME}' })` | — no wrapping `data-testid` for images specifically (unlike non-image `chat-artifact-file-card`, per TC-032) |
| Thumbnail hover actions | `getByRole('button', { name: 'Download image' })`, `getByRole('button', { name: 'Remove attachment' })` — both live inside `.attachActionButtons`, which also intercepts direct clicks on the image itself | class-based only, no `data-testid` |
| Open image preview (chat-side) | `getByRole('img', { name: '${FILE_NAME}' }).click({ force: true })` — **must be forced**, bare click/hover times out (GH#117) | — |
| Chat-side preview modal | `[role="dialog"]` containing filename header + Download/Delete/Close controls + `getByRole('img', { name: '${FILE_NAME}' })` | — |
| Close chat-side preview | `getByRole('button', { name: 'Close modal' })` | — |
| Artifacts nav (sidebar) | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Artifacts' })` | `getByText('Artifacts')` |
| Artifacts bucket row ("attachments") | `getByText('attachments', { exact: true })` scoped to the bucket rail | — |
| Artifacts folder (by upload UUID) | text-based, `getByText('${UUID}')` scoped to the file browser | — |
| Artifacts file row | `getByTestId('artifacts-file-row').filter({ hasText: '${FILE_NAME}' })` | — |
| Artifacts file checkbox | `getByTestId('artifacts-file-row').getByRole('checkbox')` | — |
| Artifacts "Preview" button | `getByRole('button', { name: 'Preview ${FILE_NAME}' })` | — |
| Artifacts-side preview panel | `<img>` with `src` prefix `blob:` — the diagnostic signal for GH#114 | — |
| Close Artifacts-side preview | `getByRole('button', { name: 'Close preview' })` | — |
| Artifacts delete button (toolbar) | `getByRole('button', { name: 'delete entity' })` — accessible name, not visible label (GH#87) | — |
| Delete confirmation dialog | `getByRole('dialog')`, text "Are you sure to delete all files?" (misleading even for 1 file, GH#117 item 3), buttons `Cancel`/`Delete` | — |

## Network Behavior
- `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` — fires on Send with an attachment present; `multipart/form-data`; **201** on success; JSON body `[{"filepath": "/attachments/{uuid}/{fileName}", "file_size": <bytes>}]`. Authoritative "was it accepted" signal.
- `GET ${BASE_URL}artifacts/s3/{bucketName}?project_id={projectId}&format=json` — undocumented-but-discovered raw bucket-listing endpoint. Returns `{name, keyCount, contents: [{key: "{uuid}/{filename}", lastModified, size, ...}]}`. **Very useful for automation**: a fast, deterministic, UI-independent way to assert file presence/absence (used this session both to confirm the pre-existing leftover's file was already gone, and to confirm this run's own teardown succeeded) — prefer this over polling the Artifacts UI where only a UI-level check is otherwise available.
- `DELETE ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}?filename=...&keep_in_storage=0` — the chat-side "Remove attachment" deletion endpoint (confirmed by TC-034's AFS against the same app; not independently re-captured this run since this AFS's teardown used the Artifacts-bucket UI path instead — see case's own "OR" teardown wording). The Artifacts-bucket-side delete instead calls the bucket's own delete endpoint (per GH#117 item 3: `DELETE https://next.elitea.ai/api/v2/artifacts/artifacts/default/{owner}/attachments?fname[]={encoded path}`) — not independently re-captured this run (network log rotated across the navigation back to the artifacts page before deletion; functionally confirmed instead via the bucket-listing JSON re-check, which is equally authoritative).
- GA4 beacons (`google-analytics.com/g/collect`) fire `attachment_uploaded` / `conversation_created` events — corroborating evidence only, do not assert on these in automation.

## Known Defects Found During Exploration

**[GH#114](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/114) — Major.** "Artifacts bucket file-preview plays full GIF animation — bypasses documented 'first frame only' restriction." The chat transcript's small inline thumbnail correctly renders GIFs as a static first-frame JPEG snapshot, but **both** expanded-view surfaces — the chat message's own preview modal and the Artifacts bucket's "Preview" panel — serve the raw original animated file and let the browser auto-play it, in direct contradiction of this app's own documented "GIF (first frame only)" contract. Confirmed live, decisively, via the Artifacts-bucket panel (two screenshots of the same still-open panel, 2 seconds apart, showing different frames); corroborated by historical same-case evidence of the identical mechanism in the chat-side modal (two screenshots showing "Frame 3" then "Frame 4" on the same open dialog, captured by an earlier dispatch of this same case before it was interrupted by a rate limit).

**Not re-filed (already tracked, cross-referenced above):**
- GH#117 — chat-thumbnail click-intercept requiring `.click({force:true})`; also documents the misleading "delete all files" dialog wording for single-file deletes.
- GH#87 — Artifacts delete button's accessible name is `"delete entity"`, not its visible label.

## Blocked Steps
None. All 16 case steps were executed end-to-end; the defect above prevents 2 of the 16 steps' *expected results* from holding, but did not block execution or observation.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` / `.agents/test-automation.yaml`. Belongs in `tests/artifacts.spec.ts`, batched with the rest of TC-030..043.
- **Known-defect assertions**: steps 11 and 16 (both preview-surface animation checks) should be written asserting the *documented-correct* behavior (static, first-frame-only) so they go red and stay red until GH#114 is fixed, per this project's established pattern for deterministic known-defect reds (`.agents/testing.md` § CI integration). Do not weaken these assertions to match the current buggy behavior — that would mask a real regression path if the defect gets worse, and would silently stop testing for the fix landing.
- **Two-screenshot-apart pattern** for asserting "is this animating": capture the previewed `<img>`'s rendered pixel content (or, more robustly, its `src` attribute prefix — `data:image/jpeg` vs `blob:`) once immediately after the preview opens and once ~2 seconds later; a change indicates animation. The `src`-prefix check is the more robust, faster, non-visual assertion — prefer it over pixel/screenshot diffing where the framework supports element-attribute assertions.
- **Test-order matters** for this defect's assertions specifically: verify preview behavior *before* running teardown (delete). This AFS's own step 11 became inconclusive on re-attempt specifically because a later exploration pass ran the check after the artifact had already been deleted — the case's own documented step order (verify everything in Parts 1–3, teardown last) already avoids this trap; automation should preserve that order.
- Page object: same `tests/pages/artifacts.page.ts` anticipated by TC-036's AFS — this case's `.attachActionButtons`-force-click pattern, the Artifacts bucket UUID-listing JSON fetch, and the checkbox+delete-entity teardown flow are all strong candidates for that shared object rather than re-deriving per spec file.
