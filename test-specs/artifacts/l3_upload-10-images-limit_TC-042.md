# Test Case: Upload 10 Images in One Message — Verify Max Limit (Positive Boundary)

## Metadata
- **TMS ID**: TC-042
- **Linked Story**: GH#16 (EPIC), GH#107 (own tracking issue)
- **Priority**: l3
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (Sage), analyst slot, `test-case-analysis`, 2026-07-03 — **clean re-run**. A prior dispatch for this exact case died on a transient server-side rate limit after apparently sending a message with 10 attached images; no AFS was produced. See § Orphan Cleanup below — the dead session's artifact was located and fully removed as part of this run, before this run's own fixture upload began.
- Isolated `playwright-cli -s=TC042` session with a dedicated `--persistent --profile=` directory (own pid, own on-disk profile, NOT the shared default MCP profile) — defense-in-depth per `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`, on top of `.mcp.json`'s `--isolated` flag. Confirmed fresh: first navigation to `${BASE_URL}app/chat/` bounced to the Keycloak login page (no inherited cookies). Re-verified `window.location.href` after every navigation.
- **Own new conversation created** per dispatch instruction — this case shares `test-batch-01..10.png` with the concurrently-running TC-043 sibling analyst (11-image negative-boundary variant), so an existing/shared thread was never reused.
- **Status**: ready-for-automation

## Orphan Cleanup (performed before this case's own execution)

Per the dispatch's explicit instruction, checked the shared `${TEST_USER}` account's recent conversations for a leftover artifact from the dead prior TC-042 dispatch before starting this run's own fixture upload. Found it:

- A conversation titled **"Test batch upload images max"** (conversation id **97**), timestamped ~26 minutes before this session started, with message text `"Test batch upload of 10 images - max limit"` — an exact match for this case's own Test Data message text — carrying all 10 `test-batch-01.png` .. `test-batch-10.png` attachments, with the assistant's reply confirming *"I can see all 10 uploaded images, labeled Batch 01 through Batch 10."* This is unambiguously the dead session's orphan (its content, title, and timing all match; I had not yet performed any upload of my own at the point this was found).
- Resolved the underlying storage location via the conversation's own `GET /api/v2/elitea_core/conversation/prompt_lib/21/97` response: all 10 files lived in a single shared folder, `attachments/5c98fa82-755e-4d6f-954d-a3e72d43a7f5/`.
- **Cleanup performed**: (1) selected that folder's checkbox in the Artifacts → `attachments` bucket view and used "Delete selected files" → confirmed in the "Delete confirmation" dialog — re-queried `GET /artifacts/s3/attachments?project_id=21&format=json` immediately after and confirmed zero remaining keys under that UUID (storage fully purged); (2) deleted the orphan conversation itself via its sidebar kebab menu → "Delete" → confirmed in the "Delete conversation?" dialog.
- One incidental, unrelated console error occurred during this cleanup (`500` on `POST .../select_conversation/prompt_lib/21/108`, immediately after the conversation-delete redirected to the next conversation in the list) — a transient artifact of the delete-triggered redirect, not connected to this case's own upload flow; not filed (no reproduction attempted, single occurrence, no user-facing impact observed).

## Preconditions
- App accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- Test user `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` (role: `${TEST_USER}`) can authenticate via Keycloak SSO
- 10 local fixture files exist: `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-batch-01.png` .. `test-batch-10.png` — confirmed live: all valid 800×600 PNGs, all well under 1 MB (6.9–10.9 KB each), exact per-file sizes in § Test Data below
- No toolkit pre-configuration required — same as TC-032/TC-036/TC-038/TC-043: the chat composer's built-in "Attach Files" action is available by default, the case's "Artifact Toolkit is configured" precondition does not gate this path
- **Shared-fixture caution** (same as TC-043's own note): `test-batch-01.png`..`test-batch-10.png` are reused verbatim by sibling cases TC-039 and TC-043. Always run this case in its own fresh conversation to avoid cross-case attachment-count contamination when executed concurrently against the same shared `${TEST_USER}` account — this is exactly what motivated the § Orphan Cleanup step above.

## Test Data

### Existing (re-use)
- `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — from `.env` (`${TEST_USER}`)
- `${BASE_URL}` — from `.env`
- Fixtures: `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-batch-01.png` .. `test-batch-10.png` (static, pre-generated, gitignored)

| File | Size (bytes) |
|---|---|
| test-batch-01.png | 8078 |
| test-batch-02.png | 10448 |
| test-batch-03.png | 8945 |
| test-batch-04.png | 7261 |
| test-batch-05.png | 7676 |
| test-batch-06.png | 7986 |
| test-batch-07.png | 8516 |
| test-batch-08.png | 10937 |
| test-batch-09.png | 8381 |
| test-batch-10.png | 8479 |

### Must Generate (in test setup)
- Message text: literal string `Test batch upload of 10 images - max limit` (case-supplied)
- None else — fixtures are static, pre-generated

### Must Clean Up (in teardown)
- The uploaded attachments' storage folder (destructive test data — see § Cleanup)
- The orphan cleanup above (not this test's own data, but performed as part of this run)

## Test Steps

1. Navigate to `${BASE_URL}app/chat/`.
   - **Verify**: if redirected to `auth.elitea.ai` (Keycloak), authenticate — fill `getByRole('textbox', { name: 'Username or email' })` with `${ELITEA_EMAIL}`, `getByRole('textbox', { name: 'Password' })` with `${ELITEA_PASSWORD}`, click `getByRole('button', { name: 'Sign In' })`. Wait for URL to settle on `${BASE_URL}app/chat/**`.
2. Dismiss the release-notes announcement banner if present: `getByRole('button', { name: 'close' })` scoped to the banner region.
3. Create a fresh, isolated conversation: `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })`.
   - **Verify**: URL becomes `${BASE_URL}app/chat` (no id yet); composer empty; baseline `"Attach Files (10 left)"` visible.
4. Open the attach-files menu — two clicks required: click `getByRole('button', { name: 'plus menu' })` first, then click `getByRole('button', { name: 'attach files' })` inside the menu that opens (confirmed project-wide two-step sequence, TC-032/036/038/043).
   - **Verify**: a native file chooser opens (Playwright: `page.waitForEvent('filechooser')` fires).
5. Supply all **10** fixtures in one call: `fileChooser.setFiles([...10 absolute paths, test-batch-01.png through test-batch-10.png])` — this is the automation-equivalent of the case's own "multi-select (Ctrl+Click or Shift+Click)" instruction; Playwright's array-argument `setFiles` models an OS-level multi-select in a single call.
   - **Verify — composer chips**: exactly 2 chips render inline (`test-batch-01.png`, `test-batch-02.png`) plus a `getByRole('button', { name: 'Show more files' })` overflow control reading **"+8"** (2 + 8 = 10 total — same overflow-at->2-attachments UI pattern GH#118/TC-039 first documented, now reconfirmed at full 10-file scale).
   - **Verify — ambient cap state**: the composer's `"Attach Files (10 left)"` label flips to **`"Max 10 attachments"`**, its `attach files` button becomes `disabled`.
6. Expand "Show more files" and verify the full attachment set: exactly `test-batch-01.png` through `test-batch-10.png`, no duplicates, none missing.
7. Type `Test batch upload of 10 images - max limit` into `getByTestId('chat-input')` / `getByRole('textbox', { name: 'Type your message...' })`.
   - **Verify**: `getByTestId('chat-send-button')` becomes enabled with dynamic accessible name `"send your question"`.
8. Click Send: `getByTestId('chat-send-button')`.
   - **Verify — network**: exactly **10** separate `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` requests fire (one per file, NOT one batched multipart request — confirmed both here and by GH#118/TC-039 at n=3), each resolving **201**; response body `[{"filepath": "/attachments/{uuid}/{fileName}", "file_size": <bytes>}]`; all 10 share the same `{uuid}` folder segment; each `file_size` matches the local fixture's byte size exactly (see § Test Data table — confirmed byte-for-byte this run).
   - **Verify — navigation**: URL moves to `${BASE_URL}app/chat/{newConversationId}`.
9. In the transcript, verify the sent user-message row: `getByTestId('chat-message-item')` — contains the message text and exactly 10 `img` elements, each with `alt`/accessible-name equal to its filename (`test-batch-01.png` .. `test-batch-10.png`).
10. Wait for the assistant's reply to render: `getByTestId('chat-answer-content')`.
    - **Verify**: reply text acknowledges all 10 images (this run: *"Got it — I can see all 10 uploaded images in the batch, labeled Batch 01 through Batch 10."*) — proof the model actually received and processed all 10, not a silently-truncated subset.
11. Click two thumbnails at random (`test-batch-01.png` and `test-batch-10.png` this run) to confirm each opens its own preview: `getByRole('img', { name: '${FILE_NAME}' }).click({ force: true })` — **`force: true` is required**, a direct click times out because the hover-revealed `.attachActionButtons` overlay (Download/Remove/Close controls) intercepts pointer events at the image's own coordinates (same class of finding as GH#110/TC-036 and GH#117/TC-030, now reconfirmed on a 10-image batch).
    - **Verify**: a `role="dialog"` opens per click, header text = the clicked file's name, with `"Download image"` / `"Remove attachment"` / `"Close modal"` buttons and the full-size image.
12. Navigate to `${BASE_URL}app/artifacts`, select the `attachments` bucket (`getByText('attachments', { exact: true })` in the bucket rail).
13. Open the newly-created folder (named by the upload's `{uuid}`, captured from step 8's response) via the **sidebar quick-nav item** (the bucket rail's own nested tree entry for that UUID) — **not** the main-table row's name span, which only toggles a checkbox on single-click and enters inline rename-edit mode on double-click (see § Automation Hints — this exact gotcha and its fix were independently discovered the same session by the TC-040 sibling analyst).
    - **Verify**: URL becomes `${BASE_URL}app/artifacts?bucket=attachments&folder={uuid}`; the file list shows all 10 rows.
    - **Verify — network (authoritative, used as the primary assertion in this AFS)**: `GET ${BASE_URL}artifacts/s3/attachments?project_id=21&format=json` response's `contents[]` array includes all 10 keys `{uuid}/test-batch-01.png` .. `{uuid}/test-batch-10.png`, each `size` matching the local fixture exactly.
14. Verify all 10 filenames are correct and none are missing/duplicated (covered by step 13's network assertion).
15. Case's own step 15 ("read dynamic count badge, verify it increased by 10") — **no such element exists for Artifacts**; see Coverage Map row and § Known Defects (already tracked, not re-filed).

## Expected Results
- All 10 images upload successfully in one message; no rejection at any layer (file-picker, client validation, server response, or transcript UI).
- Exactly 10 `POST .../attachments/prompt_lib/{projectId}/{conversationId}` calls fire, all `201`, sharing one destination folder.
- Sent message displays exactly 10 thumbnails; assistant's reply confirms all 10 were received.
- Each thumbnail independently opens a preview dialog (via forced click).
- `GET /artifacts/s3/attachments?...` lists all 10 files under the new folder, byte-exact sizes.
- Zero console errors during the core upload → send → preview → verify flow.
- System accepts the maximum allowed count (10) without issue — the positive boundary holds.

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| header: "Max 10 images per message... this test verifies the positive boundary" | exactly 10 succeeds | steps 5–13 | step 8 (network), step 13 (S3 listing) | asserted |
| header: "each image must be under size limit (5MB Anthropic / 20MB OpenAI)" | n/a to this case (all fixtures ≪ any limit) | — | — | out-of-scope — this case tests the count boundary, not the size boundary (TC-033's scope); note GH#115 found the live per-file limit is actually a flat 3MB, not 5MB/20MB per-model as documented — not independently re-verified here since no fixture approached any size threshold |
| header: "text prompt REQUIRED to accompany images" | message rejected/blocked without text | step 7 | step 7 (text always supplied) | asserted *(inherited, not independently re-tested without text this run — the no-text-rejection behavior was confirmed by TC-036's AFS; this run always supplied text per the case's own Test Data)* |
| Setup 1: maximize browser window | all UI elements visible | n/a | n/a | out-of-scope — manual-execution artifact; Playwright's fixed viewport supersedes this |
| Setup 2: verify authenticated state | redirect-or-authenticated branch | step 1 | step 1 | asserted |
| Setup 3: close modals/overlays, `[role="dialog"]` | overlay dismissed | step 2 | step 2 | **clarification** — it's a dismissible banner, not a `[role="dialog"]` modal; already tracked (GH#66/#67, reconfirmed TC-032/036/038/043), not re-filed |
| Step 1: navigate to chat | chat page loads, input toolbar visible | steps 1, 3 | step 3 | asserted *(decomposed — opened a fresh isolated conversation rather than reusing an existing thread, both to avoid the module's documented collision risk and because the reused-thread candidate this run would have been the just-cleaned orphan)* |
| Step 2: wait 2s for stabilization | interface fully loaded | step 3 verify | step 3 | asserted *(translated to condition-wait, no fixed sleep, per `.agents/testing.md` § Conventions)* |
| Step 3: click paperclip icon | file picker dialog opens | step 4 | step 4 | asserted *(decomposed into 2 clicks — "plus menu" then "attach files" — confirmed project-wide pattern)* |
| Step 4: select all 10 files via multi-select (Ctrl+Click/Shift+Click); picker shows "10 files selected" | all 10 selected | step 5 | step 5 (composer chip/overflow state) | **clarification** — the case's "picker shows 10 selected" premise describes native-OS-dialog UI, which Playwright's `setFiles()` bypasses entirely (same documented limitation as TC-032/038/043); the app's own composer state (chips + overflow + "Max 10 attachments") is the automatable proxy |
| Step 5: close/confirm picker; 10 previews appear | 10 thumbnails in attachment area | step 5 | step 5 | asserted *(decomposed — 2 inline chips + "+8" overflow toggle, not 10 simultaneously visible chips; same GH#118/TC-039 overflow pattern, now confirmed at n=10)* |
| Step 6: verify all 10 previews visible with clear filenames | 10 thumbnails, clear filenames | step 6 | step 6 (expanded overflow, exact filename check) | asserted |
| Step 7: type message text | text entered | step 7 | step 7 | asserted |
| Step 8: click Send; message with 10 attachments sent successfully | sent successfully | step 8 | step 8 (network: 10× 201) | asserted |
| Step 9: wait for message with 10 thumbnails (20s timeout) | message appears with text + 10 thumbnails | steps 8–9 | step 9 | asserted *(translated to condition-wait; rendered well under 20s, no fixed sleep)* |
| Step 10: verify all 10 images displayed as thumbnails, not truncated | all 10 render correctly | step 9 | step 9 (10 `img` elements, correct names) | asserted |
| Step 11: click 1–2 thumbnails randomly, verify preview opens | preview opens on click | step 11 | step 11 (2 clicks, both opened dialogs) | asserted *(re-authored: direct click times out — `{force: true}` required due to the `.attachActionButtons` hover overlay, same class of finding as GH#110/#117, reconfirmed here)* |
| Step 12: navigate to `/app/artifacts` | artifacts page loads | step 12 | step 12 | asserted |
| Step 13: wait 10s with scroll trigger for lazy loading | all artifacts loaded | step 12 | step 12 | asserted *(translated to condition-wait; the bucket's top-level folder list is a paginated table, not an infinite-scroll list — no scroll was needed to reach the new folder)* |
| Step 14: verify all 10 files appear with correct filenames | all 10 file items visible | step 13 | step 13 (S3 listing API — authoritative; UI folder list corroborates) | asserted *(re-authored — the UI's per-folder drill-down requires the sidebar quick-nav item, not the main-table row click; the network-level assertion remains the primary signal used here, consistent with this project's established preference for network-layer assertions over UI-only checks, but the UI path is now also confirmed reachable)* |
| Step 15: read dynamic count badge, verify it increased by 10 | count badge reflects +10 | — | — | **clarification** — no persistent numeric "count badge" exists anywhere in the Artifacts UI (sidebar nav, bucket rail, or folder header); already established generically by GH#118 (TC-039) and GH#117 (TC-030), reconfirmed here at n=10 scale — not re-filed. The scoped, reliable proxy is the per-folder file count in the S3 listing response (10 keys under the new UUID), not any bucket-wide total (which mixes concurrent sibling tests' own uploads) |
| Expected Final State | all uploaded, message shown, files in artifacts, no errors, max accepted | steps 8–13 | steps 8–13 | asserted — zero console errors during the core flow (one unrelated pre-existing error from the orphan-cleanup redirect persisted in the log but predates and is unconnected to this case's own steps) |
| Teardown: delete all 10 files OR delete attachments from chat message | account left clean | see § Cleanup | § Cleanup | asserted *(re-authored: used the Artifacts bucket-level "select folder → Delete selected files → confirm" flow, which purges storage in one action, rather than the chat-inline per-attachment removal)* |

### Axis 2 — Analyst additions

- Step 8 asserts the exact request **count** (10, not "at least 1") and that all 10 share one destination folder — *added: the strongest available proof this is a genuine 10-file batch upload, not a partial/duplicated send; a regression that silently dropped or duplicated a file would be caught here.*
- Step 8 asserts byte-exact `file_size` per response against the local fixture — *added: rules out silent truncation/corruption during upload, cheap to assert given known-good fixture sizes.*
- Step 10 asserts the assistant's reply text explicitly references "all 10" — *added: the strongest possible proof the model genuinely processed all 10 attachments server-side, not merely accepted-then-partially-ignored (same rationale as TC-032's reply-content assertion).*
- Step 11's `{force: true}` requirement is called out explicitly with the underlying cause (`.attachActionButtons` overlay) — *added: without this note, an implementer following the case's literal "click thumbnail" instruction hits an unexplained Playwright actionability timeout; already tracked generically (GH#110/#117) but restated here since this case's exploration independently reconfirmed it on two different thumbnails.*
- Step 12–13 assert via the `GET /artifacts/s3/attachments?...` response's `contents[]` array in addition to the bucket UI's folder-drill-down — *added: the network layer is both stronger and immune to the shared account's concurrent-mutation noise, so used it as the primary assertion; the UI path (sidebar quick-nav item, not the main-table row — see § Automation Hints) corroborates.*
- Explicit zero-console-errors check across the full upload→send→preview→artifacts-verify flow — *added: standard side-channel discipline; 0 new errors observed during the case's own steps (the one console error present in the log is a pre-existing, unrelated orphan-cleanup artifact — see § Orphan Cleanup).*

## Cleanup

1. Selected the uploaded folder's checkbox in the Artifacts → `attachments` bucket view (`10610069-1db4-4833-93c7-3954fd501934` this run) and clicked "Delete selected files" → confirmed "Are you sure to delete selected files?" dialog → Delete.
   - **Verify**: re-queried `GET /artifacts/s3/attachments?project_id=21&format=json` and confirmed zero remaining keys under that UUID (`grep`-equivalent count: 0). Note: this dialog's wording ("delete **selected** files") correctly matched the single-folder selection actually made — contrast with GH#117's finding of the *same-looking* dialog reading "delete **all** files" when triggered from the bucket-list-level "Delete all files" control; these are two distinct toolbar controls with (correctly) different confirmation copy, not the same mislabeling — noted for precision, not re-filed.
2. Left the conversation itself in place (id 113, titled "Test batch upload images max") — consistent with this project's established "chat history persists, no forced message/conversation cleanup" precedent (TC-001/002/032/036/043). Reloading the conversation after the storage delete showed the thumbnails still rendering (client-side cache or inline-embedded content from the original send — not independently confirmed which) despite the underlying files being gone from storage; this is informational, not a defect, and matches the existing "no full cleanup required for non-destructive chat messages" convention.
3. **Flag for whoever runs this case again**: my own cleaned-up conversation (id 113) now carries the exact same title and message text ("Test batch upload of 10 images - max limit") that the dead session's orphan (id 97, deleted this run) also carried. A future re-run's orphan-detection heuristic should not assume a conversation with this title is *always* an orphan — check the timestamp/recency and whether it was created by the current session before deleting.
4. Browser session closed (`playwright-cli -s=TC042 close`) at the end of the run.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| New/isolated conversation button | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` | — (confirmed project-wide handle) |
| Announcement banner close | `getByRole('button', { name: 'close' })` (scope to the banner region) | `.filter({ has: page.getByText('Announcing ELITEA') })` on an ancestor |
| Attach-menu trigger ("+") | `getByRole('button', { name: 'plus menu' })` | `[aria-label="plus menu"]` |
| Attach Files menu item | `getByRole('button', { name: 'attach files' })` inside the opened menu — **only actionable after "plus menu" is clicked**; **also note** a bare `getByRole('button', { name: 'attach files' })` without menu-scoping throws a strict-mode violation once the menu is open (2 elements match — GH#118/TC-039) | `page.getByRole('menu').getByRole('button', { name: 'attach files' })` (menu-scoped) — **or preferably bypass this control entirely, see next row** |
| Hidden file input (RECOMMENDED primary approach) | `page.locator('input[type="file"]').first().setInputFiles([...10 paths])` — confirmed working by TC-043's own exploration (2 `input[type=file]` elements present, `accept="*/*"`, `multiple` attribute); sidesteps both the plus-menu click sequence and its strict-mode-duplicate risk entirely | `page.waitForEvent('filechooser')` + `fileChooser.setFiles([...10 paths])` around the "attach files" click — the case-literal path, works but carries the strict-mode caveat above |
| Attach-remaining-count label (pre-cap) | `getByText(/Attach Files \(\d+ left\)/)` | baseline value is `10` on a fresh conversation |
| Attach-at-cap label (post-cap) | `getByText('Max 10 attachments')` | composer's `attach files` button carries `disabled` alongside it |
| Composer chip (pre-send) | `getByText('${FILE_NAME}')` scoped to the composer's attachment row | no `data-testid` on the pre-send chip (gap noted since TC-032) |
| Overflow control | `getByRole('button', { name: 'Show more files' })` — text reads `"+N"` where `N = total - 2` (`"+8"` for 10 total) | — |
| Overflow file list item | `getByRole('menuitem', { name: '${FILE_NAME}' })` (popover after clicking "Show more files") | `getByText('${FILE_NAME}')` scoped to the popover |
| Message textarea | `getByTestId('chat-input')` | `getByPlaceholder('Type your message...')` |
| Send button | `getByTestId('chat-send-button')` | `getByRole('button', { name: 'send your question' })` — dynamic accessible name, only present once text is typed |
| Sent message row | `getByTestId('chat-message-item')` | — (confirmed project-wide handle) |
| Attachment thumbnails, post-send (transcript) | `getByRole('img', { name: '${FILE_NAME}' })` scoped to `getByTestId('chat-message-item')` | `img[alt='${FILE_NAME}']` |
| Preview dialog trigger | `getByRole('img', { name: '${FILE_NAME}' }).click({ force: true })` — **force required**, see § Known Defects | — |
| Preview dialog | `page.getByRole('dialog')` (title = filename, header has Download/Remove/Close) | `page.locator('[role="dialog"]')` |
| Preview dialog close | `getByRole('button', { name: 'Close modal' })` | click outside (backdrop) — confirmed working; **not** `Escape` (see GH#119, does not close this dialog type) |
| Artifacts nav (sidebar) | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Artifacts' })` | `getByText('Artifacts')` in sidebar |
| Artifacts bucket row ("attachments") | `getByText('attachments', { exact: true })` scoped to the bucket rail | — |
| Artifacts folder open control (opens the drilled-down file view) | **Sidebar quick-nav item** — the bucket rail's own nested tree entry for the UUID (a `generic` wrapper, `cursor: pointer`), e.g. `page.locator('div').filter({ hasText: /^${UUID}$/ }).nth(2)` (confirmed working by TC-040's independent same-session discovery) | `GET ${BASE_URL}artifacts/s3/attachments?project_id=21&format=json` — parse `contents[]`, filter by `key.startsWith('${UUID}/')`; used as this AFS's primary assertion regardless, since it's immune to concurrent-sibling noise |
| Artifacts main-table folder row (by UUID) — **do NOT use this to navigate** | `getByTestId('artifacts-file-list').getByText('${UUID}')` | single-click only toggles the row's checkbox; **double-click enters inline rename-edit mode**, it does not open the folder (same gotcha independently hit by this run and by TC-040 the same session) |
| Artifacts bucket-level checkbox (row select) | `page.getByRole('checkbox').nth(N)` per visible row (no per-row `data-testid`/`aria-label` disambiguates rows individually) | — |
| "Delete selected files" toolbar button | `getByRole('button', { name: 'delete entity' })` scoped near `getByText('Delete selected files')` — same generic-accessible-name pattern already tracked (GH#87/#118 point, "delete entity" is the a11y name, not the visible label) | — |
| Delete confirmation dialog | `page.getByRole('dialog')` (heading "Delete confirmation") | `page.locator('[role="dialog"]')` |

## Network Behavior
- `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` — fires **exactly 10 times** on Send (one per file, not one batched multipart request), each **201**, JSON body `[{"filepath": "/attachments/{uuid}/{fileName}", "file_size": <bytes>}]`; all 10 share one `{uuid}` (this run: `10610069-1db4-4833-93c7-3954fd501934`). Assert count === 10 as the authoritative "all files sent, none dropped/duplicated" signal.
- `GET ${BASE_URL}artifacts/s3/attachments?project_id=21&format=json` — the Artifacts page's bucket-listing endpoint; flat `contents[]` array of every `{key, lastModified, etag, size, storageClass}` in the bucket (not folder-paginated at the API level — the UI groups by first path segment for display only). This is the authoritative source for step 13/14's "all 10 files present with correct names/sizes" assertion — preferred over the UI folder view even though the correct drill-down control (sidebar quick-nav item, see § Concrete Handles) is now known, since this endpoint is immune to concurrent-sibling noise in the shared account.
- `DELETE` (bucket-level bulk delete, exact verb/path not captured via UI network log this run — the click fired through React state before a distinctly-loggable request appeared in the accessible request list; the *effect* was confirmed via before/after `GET .../s3/attachments` diffs instead) — purges the selected folder's files from storage.

## Known Defects Found During Exploration

None new. All findings this run reconfirm and extend already-tracked, non-blocking clarifications (reverse-masking guard — live product behaves correctly/reasonably, case text is stale or under-specified):

- **GH#118** (TC-039) — "no count-badge for Artifacts", "attach files strict-mode duplicate", "overflow thumbnail display (+N)" — all three reconfirmed here at n=10 (TC-039 confirmed at n=3). Not re-filed; adding a corroboration comment to GH#118 referencing this case.
- **GH#110** (TC-036) / **GH#117** (TC-030) — thumbnail preview requires `{force: true}` due to the `.attachActionButtons` hover-overlay intercept — reconfirmed on two independent thumbnails this run (test-batch-01.png, test-batch-10.png).
- **GH#116** (TC-030) — "stray GET to attachments endpoint 404s after every attachment-bearing message" — **NOT reproduced this run** (checked the full request log for `GET .../attachments/prompt_lib/21/113` with no query params; absent). Refutation data point for GH#116's own request for cross-case corroboration — worth noting there that it does not appear to fire on *every* attachment message, contrary to the ticket's hypothesis.
- **GH#119** (TC-034) — preview dialog does not close on `Escape` — not independently re-tested (this run used the "Close modal" X button both times, the already-confirmed-working path); no new data.
- **GH#117 point 3** (TC-030) — delete-confirmation dialog wording ("delete all files" vs "delete selected files") — this run's own teardown (via the "Delete selected files" control, one folder selected) got the correctly-scoped "Are you sure to delete **selected** files?" wording, not the "all files" wording GH#117 flagged. This suggests the mislabeling is scoped to a *different* toolbar control ("Delete all files", used at the top-level bucket list) rather than a universal issue — noted for precision on the existing ticket, not filed as a new one.

## Blocked Steps

None. All setup steps and all 15 numbered case steps (plus teardown) were executed end-to-end against the live system.

## Automation Hints

- Framework: Playwright (TypeScript), per `.agents/testing.md` / `.agents/test-automation.yaml`. Belongs in `tests/artifacts.spec.ts` (module: artifacts), batched with the rest of TC-030..043 per the module's one-PR delivery plan.
- **Use direct `input[type="file"]` targeting, not the `filechooser` event, for the actual upload.** `page.locator('input[type="file"]').first().setInputFiles([...10 paths])` is confirmed working (corroborated independently by this run and by TC-043's own exploration) and avoids both (a) the plus-menu → attach-files click sequence's strict-mode-duplicate risk (GH#118) and (b) a tooling-specific race this analyst hit using `playwright-cli`'s own CLI-level file-chooser interception (its `upload` command only accepts one file path per invocation, and a custom `page.waitForEvent('filechooser')` script raced against the CLI's own global listener for the same event) — **this tooling race is specific to `playwright-cli` used for manual exploration and does NOT apply to real Playwright test code**, which owns the `filechooser`/input events exclusively; either approach (`filechooser` event or direct `input` targeting) works correctly in an actual `@playwright/test` spec file. Documented so the implementer doesn't waste time chasing an exploration-tooling artifact.
- **Artifacts folder drill-down: use the sidebar quick-nav item, not the main-table row.** This case's own exploration initially could not open a per-folder file view via the main-table row (single-click only toggles its checkbox; double-click enters inline rename-edit mode) — the same-session TC-040 sibling analyst independently hit and solved this identical gotcha: the working control is the bucket rail's own nested sidebar tree entry for the UUID, not the main content table. See § Concrete Handles for both the correct locator and the non-working one, so the implementer doesn't re-lose time rediscovering this. Either way, this AFS's own assertions use the `GET /artifacts/s3/attachments?...` network response as the primary signal (immune to concurrent-sibling noise in the shared account), with the UI folder view as corroboration.
- **Reply-content assertion (step 10)** is LLM-generated and non-deterministic in exact wording — assert on a stable substring/regex (e.g., `/all 10/i` or a count of distinct "Batch" mentions) rather than the full literal sentence.
- Page object: extend the artifacts module's shared page object (per `.agents/testing.md` § Structure) with the attach/overflow/cap-state handles above — TC-039/TC-043 establish the same handles at n=3/n=11; this case reconfirms them at the exact boundary n=10, a useful three-point corroboration (3, 10, 11) for the implementer's shared helper.
- Wait strategy: no `waitForTimeout` anywhere — `waitForResponse` filtering on the attachments-create endpoint (assert exactly 10 matching responses), web-first `expect(...).toBeVisible()` for the rendered thumbnails/dialogs, `waitForEvent('filechooser')` only if using the click-based upload path instead of direct `input` targeting.
