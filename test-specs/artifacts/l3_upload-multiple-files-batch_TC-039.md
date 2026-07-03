# Test Case: Upload Multiple Images in Batch via Chat (Max 10 Per Message)

## Metadata
- **TMS ID**: TC-039
- **Linked Story**: GH#16 (EPIC), GH#104 (tracking), GH#118 (case-text-drift clarifications filed this session)
- **Priority**: l3 (medium)
- **Environment Explored**: `https://next.elitea.ai/` (prod-like "Next" env)
- **Analyst**: qa-engineer (Sage), analyst slot, 2026-07-03
- **Status**: ready-for-automation

## Session note — clean-attempt browser hygiene

A prior dispatch for this exact case died mid-run on a transient server-side
rate limit before any AFS was written. Its `playwright-cli -s=TC-039` session
left behind a **populated** persistent profile directory (real Keycloak
session cookie, one half-created conversation "Test batch upload images
expect" already visible in the shared account's chat history). Per this
project's browser-isolation defense-in-depth policy, that leftover profile
was discarded (`close` + `rm -rf` the profile dir) and a genuinely fresh
persistent profile (`pw-profile-TC-039-clean`) was opened before any case
step — confirmed clean via a real, unauthenticated Keycloak redirect on
first navigation (no inherited cookies). `window.location.href` was
re-verified after every navigation/interaction per the standing
`parallel_analyst_browser_isolation` mitigation. The stray leftover
conversation from the dead prior attempt was left untouched (it belongs to
the shared account's history, not to this run, and cleaning up another
dispatch's abandoned chat is out of scope here) — this run created its own
fresh, isolated conversation instead (conversation id **106**).

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- Test user `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` (role: `${TEST_USER}`) can authenticate via Keycloak SSO
- 3 local fixture files exist (pre-generated, gitignored, confirmed byte-for-byte this run):
  - `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-batch-1.png` — 6,925 bytes, PNG
  - `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-batch-2.jpg` — 13,760 bytes, JPEG
  - `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-batch-3.png` — 6,886 bytes, PNG
  - All 3 are well under the 5MB (Anthropic) / 20MB (OpenAI) per-file size caps documented in the case header — size-limit boundary is out of scope here (covered by TC-033).
- No toolkit pre-configuration required — same confirmed pattern as TC-032/TC-036: the chat composer's built-in attach action works with no separate toolkit setup. The case's "Artifact Toolkit is configured" precondition does not gate this path.

## Test Data
### Existing (re-use)
- `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — from `.env` (`${TEST_USER}`)
- `${BASE_URL}` — from `.env`
- `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-batch-1.png`, `test-batch-2.jpg`, `test-batch-3.png` — static, pre-generated, gitignored fixtures re-used as-is (not modified this run)

### Must Generate (in test setup)
- Message text: literal string `Test batch upload of 3 images` (case-supplied). This is an additive, non-destructive chat message — see § Cleanup for why the message/conversation itself is not deleted.
- A fresh, isolated conversation (avoids racing sibling analysts'/implementers' concurrent mutations against the same shared `${TEST_USER}` account — this batch had 7+ other sibling browser sessions open concurrently, confirmed via `playwright-cli list`): click sidebar "Conversation" button before attaching anything.

### Must Clean Up (in teardown)
- The 3 uploaded files, fully purged from the `attachments` bucket in `/app/artifacts` (see § Cleanup — confirmed done this run, folder verified empty after a full page reload).
- The chat message/conversation itself is **not** deleted — see § Cleanup rationale (matches this suite's established "chat history persists" precedent).

## Test Steps

1. Navigate to `${BASE_URL}app/chat/`.
   - **Verify**: if redirected to `auth.elitea.ai` (Keycloak), authenticate — fill `getByRole('textbox', { name: 'Username or email' })` with `${ELITEA_EMAIL}`, `getByRole('textbox', { name: 'Password' })` with `${ELITEA_PASSWORD}`, click `getByRole('button', { name: 'Sign In' })`. Wait for URL to settle on `${BASE_URL}app/chat/**`. Confirmed this run: a genuinely fresh profile correctly redirected to Keycloak; login succeeded and landed on `${BASE_URL}app/chat`.
2. Dismiss the release-notes announcement banner if present: `getByRole('button', { name: 'close' })`.
   - **Note**: dismissing it triggered this shared account's known post-login auto-redirect into an existing conversation — a manual-execution/shared-account artifact already documented for sibling cases in this batch (TC-036 etc.), not a functional issue. Automation should navigate to the target flow rather than assert on the immediate post-dismiss URL.
3. Start a fresh, isolated conversation: `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` (confirmed project-wide handle, `.agents/testing.md`).
   - **Verify**: URL becomes `${BASE_URL}app/chat` (no id yet); composer is empty; "Hello, {user}!" greeting visible.
4. Open the attach-files menu — **two clicks required**: click `getByRole('button', { name: 'plus menu' })` first, THEN click the "attach files" button **inside the now-open menu** — see § Automation Hints for the exact scoped locator needed (a bare `getByRole('button', { name: 'attach files' })` throws a Playwright strict-mode violation here — 2 same-named elements coexist once the menu is open).
   - **Verify**: a native file chooser opens (`page.waitForEvent('filechooser')` fires).
5. Supply all 3 fixtures to the SAME file-chooser event in one call: `fileChooser.setFiles([test-batch-1.png, test-batch-2.jpg, test-batch-3.png])`.
   - **Verify**: the "Attach Files (N left)" counter decrements by exactly 3 (10 → 7 this run). The composer shows the first 2 files as inline chips (`test-batch-1.png`, `test-batch-2.jpg`) plus a `button "Show more files": "+1"` overflow toggle — clicking it opens a popover listing the 3rd file (`test-batch-3.png`). **This deviates from the case's literal step 5/6 wording** ("3 image previews/thumbnails appear... 3 thumbnails displayed") — filed as a clarification, GH#118 point 1. Automation asserting "3 attached files" should either open the overflow first or assert via the network responses in step 6, not via simultaneous DOM visibility of all 3 chips.
6. Type the required message text into `getByTestId('chat-input')`: `Test batch upload of 3 images`.
   - **Verify**: send button's accessible name flips from `"enter speaking mode"` to `"send your question"` once text is present (confirmed dynamic-name pattern, `.agents/testing.md`).
7. Click Send: `getByTestId('chat-send-button')`.
   - **Verify — network**: **3 separate** `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` calls fire (one per file, not one batched multipart request), each returning **201**:
     - `[{"filepath": "/attachments/{uuid}/test-batch-1.png", "file_size": 6925}]`
     - `[{"filepath": "/attachments/{uuid}/test-batch-2.jpg", "file_size": 13760}]`
     - `[{"filepath": "/attachments/{uuid}/test-batch-3.png", "file_size": 6886}]`
     — **all 3 share the exact same `{uuid}` folder** (confirmed this run: `9846b1b2-27e4-45be-b5fb-9e75aa850570` for all 3). Capture this shared `{uuid}` for step 11.
   - **Verify — navigation**: URL moves to `${BASE_URL}app/chat/{newConversationId}` (this run: conversation id **106**).
8. In the transcript, verify the sent user-message row: `getByTestId('chat-message-item')` contains the message text `Test batch upload of 3 images` AND 3 inline image elements, one per filename: `getByRole('img', { name: 'test-batch-1.png' })`, `getByRole('img', { name: 'test-batch-2.jpg' })`, `getByRole('img', { name: 'test-batch-3.png' })`.
   - **Verify**: all 3 render as valid, non-broken thumbnails (screenshot-confirmed this run — see evidence).
9. Wait for the assistant's reply to render: `getByTestId('chat-answer-content')`.
   - **Verify**: reply text distinguishes all 3 images individually (this run's fixtures render literal "Batch 1"/"Batch 2"/"Batch 3" labels on solid blue/green/yellow backgrounds respectively — the assistant's reply correctly named all 3 colors/labels) — strong proof all 3 images were genuinely processed, not silently dropped or only-first-N accepted.
10. Click each of the 3 thumbnails individually to verify a preview/lightbox opens.
    - **Verify**: `getByRole('img', { name: '${FILE_NAME}' }).click({ force: true })` — **a plain `.click()` without `force: true` hangs in Playwright's actionability retry loop indefinitely**; the hover-revealed `.attachActionButtons` overlay (same container documented in GH#110 for TC-036) intercepts the pointer event on every retry. `{ force: true }` is required and confirmed reliable for all 3 thumbnails independently. Each click opens `page.getByRole('dialog')` showing the filename as a heading, the full image, and Download/Remove/Close controls; closing via `getByRole('button', { name: 'Close modal' })` returns cleanly to the transcript each time.
11. Navigate to `${BASE_URL}app/artifacts`, select the `attachments` bucket (`getByText('attachments', { exact: true })` in the bucket rail), open the folder named `{uuid}` captured in step 7 — **not** a single click: click the sidebar tree entry showing the uuid text (the main file-list row's checkbox area is a red herring — clicking it only toggles row selection, does not navigate. Click the sidebar-tree occurrence of the folder name instead, or navigate directly via `?bucket=attachments&folder={uuid}` query params).
    - **Verify**: `getByTestId('artifacts-file-row')` lists exactly 3 rows: `test-batch-1.png` (PNG Image, 6.8 KB), `test-batch-2.jpg` (JPEG Image, 13.4 KB), `test-batch-3.png` (PNG Image, 6.7 KB) — sizes match the upload responses' `file_size` exactly (within KB-rounding display). Folder pagination footer reads `1 - 3 of 3`.
12. Read the "dynamic count badge" per the case's literal step 15 wording.
    - **Verify — case-text drift**: **no such badge exists** anywhere in the Artifacts UI (checked: sidebar "Artifacts" nav item's accessible name, the bucket header, the folder header — none carry a count). The only deterministic, scoped count-equivalent is the folder's own pagination text asserted in step 11 (`1 - 3 of 3`). The bucket-level S3-style listing endpoint (`GET /artifacts/s3/attachments?project_id=21&format=json`) does return a `keyCount` field, but it is a **flat, whole-bucket, shared-account total** (36 in this run, incorporating every concurrently-running sibling test's fixtures) — **not usable for a "+3" delta assertion**, matching this project's already-documented shared-account count-drift caution for Agents/Pipelines lists. Filed as a clarification, GH#118 point 2. Automation should assert the scoped folder pagination text from step 11, never a bucket-wide total.
13. Check for error messages/toasts in the UI and for console errors across the entire flow.
    - **Verify**: no error text/toast visible anywhere; console shows 0 errors / 0 warnings across login → upload → send → 3× preview → artifacts verify (only the benign ASCII-art build-version banner noise already documented elsewhere in this batch).

### Teardown

14. Select all 3 files in the folder (`getByRole('checkbox')` header "select all" toggle) and click the bulk-delete toolbar action.
    - **Note — accessible-name quirk, already tracked (GH#87, reconfirmed here)**: the "Delete selected files" toolbar control's accessible name is the generic **"delete entity"**, not its visible label — same templated-name pattern GH#87 already documents for "Delete all files". Use `page.getByRole('button', { name: 'delete entity' })` scoped to the toolbar, or scope via the wrapping `generic "Delete selected files"` container if disambiguating from other same-named controls on the page.
15. In the "Delete confirmation" dialog (`page.getByRole('dialog')`, body text "Are you sure to delete all files?"), click `getByRole('button', { name: 'Delete' })`.
    - **Verify — network**: a **single** `DELETE ${BASE_URL}api/v2/artifacts/artifacts/default/{projectId}/attachments?fname[]={uuid}%2Ftest-batch-3.png&fname[]={uuid}%2Ftest-batch-2.jpg&fname[]={uuid}%2Ftest-batch-1.png` fires — **one call purges all 3 files** (`{"message": "Deleted", "size": "269K"}`), unlike TC-036's single-file flow which used one `DELETE` per file. Response is `200`.
16. Reload the page and re-open the same folder to confirm cleanup is real, not just an optimistic client-side removal.
    - **Verify**: folder content pane shows "No files in this bucket" (the literal empty-state copy is bucket-scoped wording reused for the folder view too — same minor copy-drift class as GH#84's TC-062 finding, not re-filed) after a genuine full-page reload. **Minor observation, not filed** (too low-value/cosmetic to warrant its own ticket): the now-empty folder's uuid entry persists as a node in the Artifacts sidebar tree even after all its contents are deleted and the page reloaded — purely a stale navigational leftover, does not affect the file-list assertion (which correctly shows zero rows).

## Expected Results
- All 3 images upload successfully in one message via chat (3 separate `201` attachment POSTs, all sharing one destination UUID folder).
- Message with 3 attachments appears in chat history; all 3 render as valid, non-broken inline thumbnails; assistant's reply demonstrably distinguishes all 3 images individually.
- Each of the 3 thumbnails independently opens a preview lightbox on click (`{ force: true }` required).
- All 3 files are present and correctly named/typed/sized in `/app/artifacts` → `attachments` bucket → the shared upload UUID folder.
- Zero console errors/warnings across the entire flow.
- Teardown leaves the account clean: all 3 files purged from attachment storage in a single bulk `DELETE`, confirmed empty via reload.

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| desc: max 10 images per message, only image formats, per-file size caps, text required | governs test design | Preconditions, step 6 | n/a (design constraints, not independently asserted — boundary/negative variants covered by sibling cases TC-033/TC-038/TC-042/TC-043) | out-of-scope for this case — informational header only |
| Precondition: 3 test image files exist, each < 1MB | fixtures available for upload | Preconditions | pre-flight size check (6,925 / 13,760 / 6,886 bytes, all < 1MB) | asserted |
| Precondition: Artifact Toolkit is configured | toolkit available | Preconditions | n/a | **clarification** — not required; the composer's built-in attach action works with no separate toolkit setup, same confirmed pattern as TC-032/TC-036 |
| Setup 1: maximize browser window | all UI elements visible | n/a | n/a | out-of-scope — manual-execution artifact; Playwright's fixed viewport supersedes this |
| Setup 2: verify authenticated state | redirect-or-authenticated branch | step 1 | step 1 | asserted |
| Setup 3: close modals/overlays, `[role="dialog"]` | overlay dismissed | step 2 | step 2 | **clarification** (already tracked, GH#66/#67/TC-051 class) — it's a dismissible banner, not a `[role="dialog"]` modal; not re-filed |
| Step 1: navigate to chat / open existing chat | chat page loads, toolbar visible | steps 1, 3 | step 3 | asserted *(decomposed — AFS deliberately opens a fresh isolated conversation instead of reusing an existing thread, to avoid cross-test/cross-sibling-analyst collision on the shared account)* |
| Step 2: wait 2s for stabilization | interface fully loaded | step 3 verify | step 3 | asserted *(translated to condition-wait per `.agents/testing.md` § Conventions — no fixed sleep)* |
| Step 3: click paperclip icon | file picker dialog opens | step 4 | step 4 | asserted *(decomposed into 2 clicks — "plus menu" then "attach files" scoped to the open menu — see Automation Hints for the strict-mode nuance found this run)* |
| Step 4: select 3 files via multi-select (Ctrl/Cmd/Shift-click); picker shows "3 files selected" indicator | all 3 selected, indicator shown | step 5 | step 5 (`fileChooser.setFiles([...])`, one call) | asserted *(re-authored — Playwright's `setFiles` bypasses the native OS picker entirely, same established limitation as TC-032's Automation Hints; the "N files selected" native-OS indicator is not observable/assertable via Playwright, not a product gap)* |
| Step 5: close/confirm file picker; 3 thumbnails appear in attachment area | 3 previews visible | step 5 | step 5 | **clarification** — only 2 chips render inline; the 3rd is behind a "+1"/"Show more files" overflow toggle. Filed GH#118 point 1 |
| Step 6: verify all 3 previews visible with filenames | 3 thumbnails with filenames | step 5 | step 5 (overflow popover, opened) | **clarification** — same as above; filenames ARE all present and correct once the overflow is opened, just not simultaneously visible by default |
| Step 7: type message text | text entered | step 6 | step 6 | asserted |
| Step 8: click Send | message + 3 attachments sent | step 7 | step 7 (3× network `201`), step 8 (transcript) | asserted *(re-authored — 3 separate POSTs, not 1 batched request; informational, not a defect)* |
| Step 9: wait for message with 3 thumbnails (timeout 15s) | message renders with all 3 | steps 8-9 | step 8 (thumbnails), step 9 (assistant reply) | asserted *(translated wait to condition-based per `.agents/testing.md`)* |
| Step 10: verify all 3 images displayed as thumbnails, not broken | all render correctly | step 8 | step 8, screenshot evidence | asserted |
| Step 11: click each thumbnail individually, verify preview opens | 3 independent previews | step 10 | step 10 | asserted *(enrichment: documented the required `{ force: true }` — a plain click hangs indefinitely on the hover-action-buttons overlay, same class as GH#110)* |
| Step 12: navigate to `/app/artifacts` | artifacts page loads | step 11 | step 11 | asserted |
| Step 13: wait 10s with scroll trigger for lazy loading | all items loaded | step 11 | step 11 | asserted *(translated to condition-wait; this run's target folder had exactly 3 items, no scroll needed to reach them, but automation should still wait on load-complete state, not a fixed 10s)* |
| Step 14: verify all 3 files appear with correct filenames | 3 files visible | step 11 | step 11 (`artifacts-file-row` ×3, `1 - 3 of 3`) | asserted |
| Step 15: read dynamic count badge, verify +3 | badge reflects increment | step 12 | step 12 | **clarification** — no count badge exists anywhere for Artifacts; closest scoped proxy is the folder's own pagination text (already asserted in step 11). Filed GH#118 point 2 |
| Expected Final State: all 3 uploaded, message in history, all accessible in artifacts, no errors | see case | steps 7-13 | steps 7-13 | asserted |
| Teardown 1-2: navigate to artifacts, wait for lazy loading | ready to delete | step 11 (already there) | step 11 | asserted *(decomposed — teardown re-uses the same navigation from verification, no separate re-navigation needed)* |
| Teardown 3-8: delete each of the 3 files individually (click delete icon, confirm, wait — ×3) | account clean | steps 14-15 | step 15 (single bulk `DELETE`) | asserted *(re-authored — bulk-select + one confirm dialog + one `DELETE` call purges all 3 in one action, far more efficient than 3 sequential individual deletes; functionally equivalent end state)* |

### Axis 2 — Analyst additions

- Step 7 captures and asserts the shared destination `{uuid}` across all 3 upload responses — *added: this is the only reliable way to locate the batch's own folder in step 11 without a full-bucket text search across potentially dozens of concurrent sibling folders (36 keys existed in the shared bucket during this run).*
- Step 9 asserts the assistant's reply distinguishes all 3 images by their individually-distinct content (not just that a reply exists) — *added: same rationale as TC-032's Axis 2 addition — the strongest available proof all 3 attachments were genuinely processed server-side, not accepted-then-partially-dropped (e.g. a regression that only forwards the first N images to the model).*
- Step 10 documents the required `{ force: true }` on the thumbnail-preview click — *added: without this, an implementer's first automation attempt hangs indefinitely on Playwright's actionability retry loop; this is necessary plumbing knowledge, not scope creep.*
- Step 13 asserts zero console errors/warnings across the **entire** flow (login through teardown reload), not just around the send/upload moment — *added: standard side-channel discipline per this project's established pattern.*
- Step 16 (teardown verification) reloads the page before asserting emptiness — *added: guards against an optimistic-client-side-only removal that doesn't actually persist server-side; the reload is a real HTTP round-trip re-fetch, not a cache read.*

## Cleanup
All 3 uploaded files were deleted from the `attachments` bucket via a single
bulk-select + confirm + `DELETE` action (see steps 14-16), verified empty
after a full page reload. This satisfies the case's own teardown intent
(delete all uploaded test files) more efficiently than its literal
per-file-sequential wording.

The chat message and its conversation (id **106**, named "Test batch upload
images" after the send) are **not** deleted — consistent with this suite's
established "chat history persists across runs, no message/conversation
teardown" precedent (`.agents/testing.md` § Test data strategy, and TC-032/
TC-036's identical cleanup rationale). The message itself is a strictly
additive, non-destructive artifact with no bearing on future test runs.

If strict full-account hygiene is ever required beyond this:
1. Delete the conversation named "Test batch upload images" (conversation id 106, project/owner id 21) via the chat sidebar's own conversation-delete flow (not explored in this session — out of scope for TC-039, see TC-055's conversation-delete AFS for that flow's handles).

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| New/isolated conversation button | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` | — (confirmed project-wide handle, `.agents/testing.md`) |
| Announcement banner close | `getByRole('button', { name: 'close' })` (scope to the banner region) | `.filter({ has: page.getByText('Announcing ELITEA') })` on an ancestor |
| Attach-menu trigger ("+") | `getByRole('button', { name: 'plus menu' })` | `[aria-label="plus menu"]` |
| Attach Files menu item (**after** plus-menu is open) | `page.getByRole('menu').getByRole('button', { name: 'attach files' })` — **must be scoped to the open menu**; a bare `getByRole('button', { name: 'attach files' })` throws a strict-mode violation (2 same-named elements coexist: the composer-toolbar one and the menu one) | `page.getByRole('tooltip').getByRole('button', { name: 'attach files' })` if the menu renders as a tooltip role instead of menu in a given app version |
| Hidden file input(s) | not directly targetable — use `page.waitForEvent('filechooser')` + `fileChooser.setFiles([path1, path2, path3])` for a true multi-file batch selection in one call | `input[type=file]` (2 present in DOM, no disambiguating attribute — CSS-only, last resort; per GH#110, direct `setInputFiles` on this also works for a single-file case but is untested here for a 3-file array) |
| Composer text input | `getByTestId('chat-input')` | `getByPlaceholder('Type your message...')` |
| Send button | `getByTestId('chat-send-button')` | `getByRole('button', { name: 'send your question' })` — dynamic accessible name, only present once text is typed |
| Pre-send attachment chip (composer, first 2 only) | `getByText('${FILE_NAME}')` scoped to the composer container | none found — no `data-testid` on the pre-send chip |
| "Show more files" overflow toggle (composer, appears when attachments > 2) | `getByRole('button', { name: 'Show more files' })` (visible text is the count, e.g. `"+1"`) | n/a — new handle, not previously documented (single/dual-attachment cases never trigger it) |
| Attachment chip inside overflow popover | `page.getByRole('menuitem', { name: '${FILE_NAME}' })` — renders as a `menuitem`, not a plain chip, once the overflow is open | `getByText('${FILE_NAME}')` scoped to the opened popover |
| Sent message row | `getByTestId('chat-message-item')` | — (confirmed project-wide handle) |
| Sent message's inline thumbnail (per file) | `getByRole('img', { name: '${FILE_NAME}' })` (accessible name = exact filename) | scope to `getByTestId('chat-message-item')` first if disambiguating among multiple messages |
| Assistant reply content | `getByTestId('chat-answer-content')` | — |
| Thumbnail hover-action overlay (blocks direct click) | n/a — click through it | `getByRole('img', { name }).click({ force: true })` **required** to open the preview lightbox; a plain click hangs indefinitely |
| Preview lightbox/dialog | `page.getByRole('dialog')` (single dialog mounted at a time) | `page.locator('[role="dialog"]')` |
| Preview dialog close button | `page.getByRole('dialog').getByRole('button', { name: 'Close modal' })` | n/a |
| Artifacts nav (sidebar) | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Artifacts' })` | `getByText('Artifacts')` in sidebar |
| Artifacts bucket row ("attachments") | `getByText('attachments', { exact: true })` scoped to the bucket rail | — |
| Artifacts folder entry (by uuid, sidebar tree) | click the **sidebar-tree** occurrence of the uuid text (a `[cursor=pointer]`-wrapped generic) — **not** the main file-list row, whose click target only toggles the row's own selection checkbox | navigate directly via `?bucket=attachments&folder={uuid}` query params (confirmed reliable, avoids the row-vs-tree ambiguity entirely) |
| Artifacts file list container | `getByTestId('artifacts-file-list')` | — |
| Artifacts file row | `getByTestId('artifacts-file-row').filter({ hasText: '${FILE_NAME}' })` | — |
| Folder pagination text (scoped file-count proxy) | `getByText(/\d+ - \d+ of \d+/)` in the file-list footer | n/a — this is the recommended count-assertion handle; no "count badge" exists (see step 12) |
| Bulk "select all" checkbox (file-list header) | `page.getByRole('checkbox').first()` scoped to the file-list header row | n/a |
| Bulk delete toolbar button | `page.getByRole('button', { name: 'delete entity' })` scoped to the toolbar — **accessible name is the generic "delete entity"**, not "Delete selected files"/"Delete all files" (GH#87, reconfirmed here for the multi-select variant too) | scope via the wrapping `generic "Delete selected files"` container |
| Delete-confirmation dialog | `page.getByRole('dialog')` (heading "Delete confirmation", body "Are you sure to delete all files?") | `page.locator('[role="dialog"]')` |
| Dialog "Delete" / "Cancel" buttons | `page.getByRole('dialog').getByRole('button', { name: 'Delete' })` / `{ name: 'Cancel' }` | n/a |
| "Attach Files (N left)" counter | `getByText(/Attach Files \(\d+ left\)/)` — decrements by exactly the number of files attached in one `setFiles` call (3 this run: 10 → 7) | n/a |

## Network Behavior
- `POST ${BASE_URL}api/v2/elitea_core/conversations/prompt_lib/{projectId}` — fires once, creating the new conversation. `201` on success.
- `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` — fires **3 times** on Send click, once per attached file (NOT one batched multipart request for all 3). Each `201`, JSON body `[{"filepath": "/attachments/{uuid}/{fileName}", "file_size": <bytes>}]`. **All 3 calls resolve the same shared `{uuid}`** — confirms the batch is stored under one destination folder, not 3 separate ones. This is the authoritative "was it accepted" signal per file — assert on these, not just UI absence-of-error.
- `GET ${BASE_URL}artifacts/s3/attachments?project_id={projectId}&format=json` — S3-style flat bucket listing; returns `keyCount` (whole-bucket total, shared/mutating across concurrent sibling tests) and a `contents` array of `{key, lastModified, etag, size}` per file, `key` formatted as `{uuid}/{filename}`. Do **not** use `keyCount` for a scoped "+3" assertion (see step 12).
- `DELETE ${BASE_URL}api/v2/artifacts/artifacts/default/{projectId}/attachments?fname[]={uuid}%2F{file1}&fname[]={uuid}%2F{file2}&fname[]={uuid}%2F{file3}` — fires once on confirming the bulk-delete dialog, purges all 3 files in a single call. `200`, body `{"message": "Deleted", "size": "<total freed>"}`.
- GA4 beacons (`google-analytics.com/g/collect`) independently fire a `conversation_created` event with `ep.has_attachments=true` and `epn.conversation_id` — corroborating evidence only, **do not assert on these in automation** (third-party, best-effort).

## Known Defects Found During Exploration
No functional product defects. Three case-text-drift/under-specification clarifications filed as one bundled ticket (reverse-masking guard — live behavior is correct/reasonable, case text just didn't anticipate the batch-specific scenario): **[GH#118](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/118)** —
1. The composer shows only 2 of 3 attachment thumbnails inline by default; the 3rd is behind a "Show more files"/"+1" overflow toggle.
2. No dynamic "count badge" exists anywhere for Artifacts (case step 15's literal expectation has no UI equivalent); the folder's own pagination text is the correct scoped proxy.
3. The composer's "attach files" button is not uniquely resolvable by bare role+name once the plus-menu is open (Playwright strict-mode violation, 2 matching elements) — extends **GH#110** point 1 (cross-referenced there via comment) with a different failure symptom than the pointer-interception GH#110 already documented.

Also reconfirmed (already tracked, no new filing): **GH#87**'s "delete entity" generic accessible-name finding also holds for the multi-select "Delete selected files" toolbar action, not just "Delete all files".

## Blocked Steps
None. All Setup steps, all 15 numbered case steps, and the full Teardown were executed end-to-end against the live system in a single, genuinely isolated browser profile (conversation id 106, project/owner id 21, shared upload folder `9846b1b2-27e4-45be-b5fb-9e75aa850570` — fully purged and reload-verified empty by the end of the run).

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` / `.agents/test-automation.yaml`. This case belongs in `tests/artifacts.spec.ts` (module: artifacts), batched with the rest of TC-030..043 per the module's one-PR delivery plan.
- Page object: extend the planned `tests/pages/artifacts.page.ts` (seeded by TC-036's AFS) with: multi-file `waitForEvent('filechooser')` + `setFiles([...])` for batch attach, the "Show more files" overflow-open helper, and the bulk select-all + confirm-delete flow. TC-042 (10-image boundary) and TC-043 (11-image rejection) are the natural next users of this same batch-attach helper — this case's fixture-generation/handle-discovery work should be reused, not re-derived, for both.
- **Strict-mode gotcha (new this run, see GH#118 point 3 / GH#110 comment)**: after opening "plus menu", scope the "attach files" click to the open menu container (`page.getByRole('menu').getByRole('button', { name: 'attach files' })`) — a bare role+name locator throws a strict-mode violation since 2 same-named elements coexist in the DOM at that moment.
- **Force-click gotcha for thumbnail previews**: `getByRole('img', { name }).click({ force: true })` is required to open the preview lightbox — a plain click hangs indefinitely on the hover-revealed `.attachActionButtons` overlay (same overlay class documented in GH#110 for TC-036's download/remove controls).
- **Folder navigation gotcha**: to open an artifacts folder by its uuid, click the sidebar-tree occurrence of the uuid text, not the main file-list row (which only toggles a selection checkbox on click) — or bypass the ambiguity entirely by navigating directly to `?bucket=attachments&folder={uuid}`.
- Wait strategy: no `waitForTimeout` anywhere in this spec — `waitForEvent('filechooser')` for the attach, `waitForResponse` (or assert against `page.on('response')` collection) for the 3× attachment-create `201`s and the bulk-delete `200`, and web-first `expect(...).toBeVisible()` polling for rendered thumbnails/dialogs.
- Analyst execution note (process/tooling, not product): ran via `playwright-cli -s=TC-039` with a genuinely fresh, isolated persistent-profile browser after discarding a prior dead dispatch's leftover profile state (see § Session note above) — confirmed non-shared via a real unauthenticated Keycloak redirect at session start. `playwright-cli list` at the time of this run showed 7 other concurrent sibling sessions (TC-030, TC-031, TC-033, TC-035, TC-038, TC-040, TC-041) — no cross-talk observed, own isolated conversation (id 106) used throughout.
- Per this batch's process fix, this AFS file is left **uncommitted/untracked** on disk — the artifacts-module implementer bundles it (and the other module cases' AFS files) into one PR alongside the test code, per `.agents/workflow.md` § Test delivery pattern.
