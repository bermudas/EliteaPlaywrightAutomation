# Test Case: Upload a Small Image File via Paperclip (PNG, < 1MB)

## Metadata
- **TMS ID**: TC-030
- **Linked Story**: GH#16 (EPIC), GH#95 (tracking), GH#116 (MINOR bug filed this session: stray 404 on attachment endpoint), GH#117 (INFO bundle filed this session: 3 case-text-drift/automation-hint findings)
- **Priority**: l1 (case priority: critical)
- **Environment Explored**: `https://next.elitea.ai/` (prod-like "Next" env)
- **Analyst**: qa-engineer (Sage), analyst slot, 2026-07-03 — isolated `playwright-cli -s=TC-030` session with a unique `--persistent --profile=` directory (not the shared default MCP profile — see `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`). Confirmed non-shared: the first navigation to `${BASE_URL}app/chat/` bounced to the Keycloak login page before any login. `window.location.href` re-verified after every navigation/interaction per that memory entry's standing mitigation.
- **Status**: ready-for-automation

## IMPORTANT — pre-flight orphan cleanup performed this session

A prior dispatch for this exact case (TC-030) died mid-run on a transient
server-side rate limit *after* completing the upload but *before* writing
an AFS or tearing down. On session start, `playwright-cli list` showed a
stale, still-open `TC-030` browser session pointed at
`${BASE_URL}app/chat/99?name=Test+image+upload` — the dead session's own
conversation, with `test-image-small.png` already uploaded and an AI reply
already rendered. That stale session died on its own between my first two
commands against it (in-memory profile, no persistent state lost server-side).
Before starting my own fresh run, I re-opened that same conversation (id
`99`) in my own new session, hovered the attachment, clicked "Remove
attachment", checked "Also delete from attachment storage", and confirmed:
`DELETE .../attachments/prompt_lib/21/99?filename=%2Fattachments%2F39ebbb3a-c9f2-4a62-8683-8959c7e3da5f%2Ftest-image-small.png&keep_in_storage=0` → **204**.
Verified the thumbnail no longer rendered in that message afterward. This
orphan cleanup is **not part of this AFS's own Test Steps** (it's one-time
incident cleanup, not a repeatable case step) but is documented here for
audit completeness, and folded into my own Cleanup section below since the
task explicitly called for it.

## Preconditions
- App accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- Test user `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` (role `${TEST_USER}`) can authenticate via Keycloak SSO
- Local fixture file exists: `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-image-small.png` — confirmed live: 8,637 bytes, valid 800×600 PNG, well under the case's own <1MB target and the documented 5MB (Anthropic)/20MB (OpenAI) limits
- No toolkit pre-configuration required — same finding already established for this module (TC-032/TC-036): the chat composer's built-in "Attach Files" action is available by default; the case's "Artifact Toolkit is configured (if first-time user...)" precondition does not gate this path. Not independently re-verified fresh in this run (the shared `${TEST_USER}` account is not a first-time account by this point in the batch), carried over from the established pattern.

## Test Data
### Existing (re-use)
- `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — from `.env` (`${TEST_USER}`)
- `${BASE_URL}` — from `.env`
- `${TEST_IMAGE_PATH}` = `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-image-small.png` (existing, local, gitignored, pre-generated fixture — reused as-is)

### Must Generate (in test setup)
- A fresh, isolated conversation (sidebar "Conversation" button) — avoids racing the many sibling analysts/implementers concurrently mutating the same shared `${TEST_USER}` account this batch (`.agents/testing.md` § Concurrency policy)
- Message text: literal string `Test image upload` (case-supplied, required — the app rejects attachment-only messages with no text)
- Observed fixture this run: conversation id **102** (owner/project id **21**), server-side attachment path `/attachments/edc50a03-ee9d-4454-b75c-ee5e601ded7a/test-image-small.png`

### Must Clean Up (in teardown)
- Delete the uploaded file from the `attachments` bucket (via the Artifacts UI's row-checkbox + delete flow — see Test Steps/Cleanup)
- (One-time, not part of the repeatable case) the pre-existing orphan from the dead prior dispatch — already cleaned up this session, see above

## Test Steps

1. Navigate to `${BASE_URL}app/chat/`.
   - **Verify**: if redirected to `auth.elitea.ai` (Keycloak), authenticate — `getByRole('textbox', { name: 'Username or email' })` = `${ELITEA_EMAIL}`, `getByRole('textbox', { name: 'Password' })` = `${ELITEA_PASSWORD}`, click `getByRole('button', { name: 'Sign In' })`. Confirmed handles match `.agents/testing.md`. Note: the shared account's post-login auto-redirect may land on another analyst's/prior run's existing conversation (already documented, TC-036) — don't assert on the immediate post-login URL, navigate onward.
2. Dismiss the "Announcing ELITEA 2.0.4!" release-notes banner if present: `getByRole('button', { name: 'close' })` scoped to the banner region.
   - Note: a plain dismissible banner, **not** a `[role="dialog"]` modal as the case's Setup step 3 assumes (same drift already on file, GH#66/#67/GH#42 pattern) — not re-filed.
3. Click the sidebar "Conversation" button — `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` (confirmed project-wide handle) — starts a brand-new, empty conversation.
   - **Verify**: URL becomes `${BASE_URL}app/chat` (no id yet); "Hello, {user}!" greeting visible.
4. Open the attach-files menu — **two clicks required**: click `getByRole('button', { name: 'plus menu' })` first, THEN click `getByRole('button', { name: 'attach files' })` inside the menu that opens. Clicking "attach files" directly (before the plus menu is opened) is not reliably actionable — the element renders in the DOM with no `ref` until the menu is open. This exact sequencing gotcha is already documented for TC-032/TC-036.
   - **Verify**: a native file chooser opens (`page.waitForEvent('filechooser')` fires).
5. Supply the fixture to the file chooser: `fileChooser.setFiles('${TEST_IMAGE_PATH}')`.
   - **Verify**: a pre-send preview chip renders in the composer showing `test-image-small.png` (with a thumbnail `img` and a remove-x icon); the "Attach Files (N left)" counter decrements by exactly 1 (10 → 9 this run).
6. Type `Test image upload` into `getByTestId('chat-input')` (equivalently `getByRole('textbox', { name: 'Type your message...' })`).
   - **Verify**: send button's accessible name flips from `"enter speaking mode"` to `"send your question"` once text is present (confirmed project-wide dynamic-name pattern).
7. Click Send — `getByTestId('chat-send-button')`.
   - **Verify — network**: `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` → **201**, JSON body `[{"filepath": "/attachments/{uuid}/test-image-small.png", "file_size": 8637}]`. Capture `{uuid}` for step 11. (`projectId=21`, `conversationId=102`, `uuid=edc50a03-ee9d-4454-b75c-ee5e601ded7a` this run.)
   - **Verify — navigation**: URL moves to `${BASE_URL}app/chat/{newConversationId}?name=Test+image+upload`.
8. In the transcript, verify the sent user-message row: `getByTestId('chat-message-item')` — contains the message text `Test image upload` AND the thumbnail `getByRole('img', { name: 'test-image-small.png' })`.
9. Wait — condition-based, not a fixed sleep — for the assistant's reply to render (poll for its content container).
   - **Verify**: reply text demonstrably describes the actual uploaded image content (this run: "a solid blue background with the text 'Test Small'... centered near the lower-middle area") — proof the model genuinely processed the image bytes, not a generic/placeholder acknowledgment.
10. Verify the thumbnail is "clickable (can be previewed)" per the case's own step 10.
    - **Verify**: a **forced** click (`locator.click({ force: true })`) on `getByRole('img', { name: 'test-image-small.png' })` opens a `[role="dialog"]` preview modal containing the filename header, the full image, and Download/Remove/Close controls.
    - **Known automation gotcha (GH#117)**: a plain, non-forced `getByRole('img', ...).click()` **times out** — the same `attachActionButtons` hover-reveal container that hosts the Download/Remove buttons (already documented for TC-036) sits on top of the thumbnail and intercepts pointer events at its coordinates even when its own buttons aren't the click target. Use a forced click for this specific assertion; do not spend retry budget on a bare `getByRole('img', ...).click()`.
    - Close the modal: `getByRole('button', { name: 'Close modal' })`.
11. Navigate to `${BASE_URL}app/artifacts`.
    - **Verify**: bucket rail renders `attach`, `attachments`, `warranty` (condition-wait on the rail's populated state — see § Automation Hints re: this can take materially longer than the previously-documented ~1.2s baseline under this batch's heavy concurrent load).
12. Click the `attachments` bucket row (`getByText('attachments', { exact: true })` scoped to the bucket rail).
    - **Verify**: URL becomes `${BASE_URL}app/artifacts?bucket=attachments` (matches the case's own expected URL pattern).
13. Locate the folder named `{uuid}` captured in step 7 and open it.
    - **Verify**: URL becomes `${BASE_URL}app/artifacts?bucket=attachments&folder={uuid}`; `getByTestId('artifacts-file-row')` lists a row for `test-image-small.png`, Type `PNG Image`, Size `8.4 KB`.
14. Verify the case's step-16 "dynamic count badge" intent: click the "Bucket info" icon button (`getByRole('button', { name: /Retention Policy.*Number of files/ })`).
    - **Verify**: its tooltip text matches `/Number of files: \d+/` with the captured number > 0 (this run: 13, immediately post-upload).
    - **Known case-text drift (GH#117)**: there is no persistently-visible numeric "badge" anywhere on the bucket rail item itself — the count is only surfaced via this icon's accessible name/tooltip. Assert on the tooltip text, not a separate badge element.
15. Assert zero *unexpected* console errors across steps 1–14.
    - **Known exception (GH#116)**: an unqualified `GET ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` (no query params) reliably 404s shortly after the AI reply finishes rendering (step 9), logging one real console error. This is a genuine, filed product defect — allow-list this **specific** request/error in the assertion (`expect.soft()` with a `// Known defect: GH#116` comment, matching this project's established pattern for GH#29/#43/etc.), don't mask it by weakening the check for everything else.

## Teardown

16. In the artifacts folder view (state from step 13), check the file's row-level checkbox — `getByTestId('artifacts-file-row').getByRole('checkbox')` (not the header "select-all" checkbox).
    - **Verify**: the toolbar delete button becomes enabled. Its accessible name is `"delete entity"`, not a visible "Delete" label (already documented, GH#87 — not re-filed).
17. Click the delete button, then confirm in the resulting dialog: `page.getByRole('dialog').getByRole('button', { name: 'Delete' })`.
    - **Known case-text drift (GH#117)**: the dialog's body text reads **"Are you sure to delete all files?"** even though only one file's row checkbox was checked. **Verified this is wording-only, not a data-safety bug** — the resulting request explicitly scopes to the single checked file (see Network Behavior). Don't let the wording block automation; assert on the resulting network call's scope, not the dialog copy.
    - **Verify — network**: `DELETE ${BASE_URL}api/v2/artifacts/artifacts/default/{projectId}/attachments?fname[]={uuid}%2Ftest-image-small.png` → **200**.
18. Re-open the `attachments` bucket / folder listing.
    - **Verify**: the `{uuid}` folder from step 7/13 no longer appears in the bucket's file listing; sibling analysts' own uploaded files (verified via the raw `GET /artifacts/s3/attachments?...` listing) are untouched.

## Expected Results
- File `test-image-small.png` uploads successfully via the chat paperclip/attach-files flow; server responds `201` with `filepath`/`file_size`.
- Sent message displays the text and the attachment thumbnail; the AI's reply demonstrably describes the actual image content.
- Thumbnail is previewable in a modal (via a forced click — see automation gotcha above).
- File appears in the Artifacts → `attachments` bucket, inside a folder keyed by the upload's UUID, with correct Type (`PNG Image`) and Size (`8.4 KB`).
- The bucket's file count (surfaced via the "Bucket info" tooltip, not a persistent badge) is > 0 and reflects the upload.
- No *unexpected* console errors — the one known, filed GH#116 404 is the sole allow-listed exception.
- Teardown removes only the test's own file, verified via the `DELETE` request's explicit `fname[]` scope and a post-delete listing check — no collateral impact on sibling files in the same shared bucket.

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| desc: supported formats/size/count/text-required/30-day retention (Feature Notes) | informational context | — | Preconditions, Test Data | asserted *(baseline facts confirmed compatible with this run: PNG, 8,637 bytes, 1 image, text provided; retention shown live as "1 Month" via the Bucket-info tooltip — treated as equivalent to "30-day default", not a meaningful drift)* |
| Setup 1: maximize browser window | all UI elements visible | n/a | n/a | out-of-scope — manual-execution artifact; Playwright's fixed viewport supersedes this (established pattern) |
| Setup 2: verify authenticated state | redirect-or-authenticated branch | step 1 | step 1 | asserted |
| Setup 3: close modals/overlays, `[role="dialog"]` | overlay dismissed | step 2 | step 2 | **clarification** — it's a dismissible banner, not a `[role="dialog"]` modal; drift already tracked (GH#66/#67/#42 pattern), not re-filed |
| Setup 4: Configure Artifact Toolkit (first-time) | toolkit selected/created if prompted | Preconditions | — | **clarification** — precondition doesn't gate this path; already established (TC-032/TC-036), not independently re-verified fresh on a non-first-time shared account |
| Step 1: navigate to chat | input toolbar visible | steps 1, 3 | step 3 | asserted *(decomposed — AFS opens a fresh isolated conversation instead of reusing an existing thread, to avoid cross-test/cross-analyst collision on the shared account)* |
| Step 2: wait 2s for stabilization | interface loaded | step 3 verify | step 3 | asserted *(translated to a condition-wait — no fixed sleep, per `.agents/testing.md` § Conventions)* |
| Step 3: locate paperclip icon | icon visible/clickable | step 4 | step 4 | **clarification** *(decomposed into 2 clicks — "plus menu" then "attach files" — the app's actual control is a 2-level menu, not a single always-clickable paperclip button; same finding as TC-032/036)* |
| Step 4: click paperclip icon | file picker opens | step 4 | step 4 | asserted |
| Step 5: select file via `setInputFiles()` | thumbnail/preview appears | step 5 | step 5 | asserted *(re-authored: `page.waitForEvent('filechooser')` + `fileChooser.setFiles()`, not raw `setInputFiles` targeting — 2 ambiguous `input[type=file]` elements exist in the DOM)* |
| Step 6: verify preview thumbnail with filename visible | thumbnail shown | step 5 | step 5 | asserted |
| Step 7: type message text | text entered | step 6 | step 6 | asserted |
| Step 8: click Send | message + attachment posted | step 7 | step 7 (network 201 + URL) | asserted |
| Step 9: wait for message with attachment (10s timeout) | message + thumbnail appear | steps 8–9 | step 8 (message/thumbnail), step 9 (AI reply) | asserted *(translated to condition-wait; enriched — also asserts the AI reply demonstrably describes the image content, not just that a reply exists)* |
| Step 10: verify thumbnail clickable/previewable | preview opens | step 10 | step 10 | **clarification** — preview modal genuinely exists and opens, but only via a forced click; a plain `getByRole('img',...).click()` times out due to a pointer-intercepting overlay (GH#117) |
| Step 11: navigate to `/app/artifacts` | bucket list loads | step 11 | step 11 | asserted |
| Step 12: wait 3s for bucket list | buckets visible | step 11 verify | step 11 | asserted *(translated to condition-wait; this run needed materially longer than the previously-documented ~1.2s under batch load — see § Automation Hints)* |
| Step 13: click "attachments" bucket | bucket detail opens at `?bucket=attachments` | step 12 | step 12 | asserted |
| Step 14: wait 10s with scroll trigger for lazy loading | all items loaded | step 13 verify | step 13 | asserted *(translated to condition-wait; the `attachments` bucket's rail-nested UUID-folder list did not require scrolling to reach the new upload in this run — 13 entries visible without a scroll trigger — but automation should still wait on the list's loaded state, not a fixed 10s)* |
| Step 15: verify file appears in artifacts list | file row visible | step 13 | step 13 | asserted |
| Step 16: verify dynamic count badge shows ≥1 | count > 0 displayed | step 14 | step 14 | **clarification** — the "badge" is actually the "Bucket info" icon's tooltip text (`Number of files: N`), not a persistently visible element (GH#117) |
| Expected Final State: uploaded, message shown, stored in bucket, no errors | see case | steps 7–15 | steps 7, 8, 9, 13, 15 | asserted, **with one known-defect exception** — GH#116's stray 404 is a real console error on this exact happy path, allow-listed per step 15 |
| Teardown 1: navigate to `/app/artifacts` | — | step 16 setup | — | asserted |
| Teardown 2: wait 3s for bucket list | — | step 16 setup | — | asserted *(condition-wait)* |
| Teardown 3: click "attachments" bucket | — | step 16 setup | — | asserted |
| Teardown 4: wait 10s for lazy loading within bucket | — | step 16 setup | — | asserted *(condition-wait)* |
| Teardown 5: close overlays/dialogs | — | n/a | n/a | out-of-scope — none present at teardown time in this run |
| Teardown 6: locate file item (may appear with UUID name) | — | step 13 (folder keyed by UUID, confirmed) | step 13 | asserted |
| Teardown 7: click delete/trash icon OR delete from chat | file removal initiated | step 16 | step 16 | asserted *(re-authored: used the Artifacts-UI row-checkbox + toolbar-delete path, not the chat-inline path; case explicitly allows either)* |
| Teardown 8: confirm deletion in dialog | file deleted | step 17 | step 17 (network 200) | asserted, **with a wording clarification** — dialog text says "delete all files" for a single-file selection; verified request scope is correctly single-file (GH#117) |
| Teardown 9: wait for file to be removed from list | file gone | step 18 | step 18 | asserted |

### Axis 2 — Analyst additions

- Step 9 asserts the AI reply's content demonstrably describes the actual uploaded image (not just "a reply exists") — *added: the strongest available proof the image was genuinely processed server-side rather than silently accepted-then-ignored; matches the same enrichment pattern already used in TC-032's text-file AFS.*
- Step 10 documents and asserts the forced-click requirement for the preview modal — *added: the case only asks "is it clickable", the AFS captures both that the feature works AND the specific automation workaround needed, since a naive implementation would otherwise burn its full retry budget on a hanging `click()`.*
- Step 14 asserts the exact count-surfacing mechanism (tooltip on an icon button) rather than assuming a generic "badge" element exists — *added: without this, an implementer would search for a nonexistent badge selector and stall.*
- Step 15 allow-lists exactly one specific console error (GH#116) rather than either ignoring all console errors or failing on this known one — *added: keeps the zero-console-errors discipline meaningful (still catches new errors) while not perpetually red on a known, filed, non-blocking defect.*
- Step 18 asserts sibling files in the shared bucket are untouched after this test's own delete — *added: given the shared-account concurrency in this batch and the misleading "delete all files" dialog wording, this is the one assertion that would catch a real regression turning that wording bug into an actual data-loss bug.*
- Pre-flight (not a numbered step): discovered and cleaned up an orphaned upload from a previously dead analyst dispatch for this same case before starting the case's own fresh execution — *added: explicitly instructed by the dispatch, and good account hygiene given the shared `${TEST_USER}` account.*

## Cleanup
1. **Orphan cleanup (one-time, pre-existing from a dead prior dispatch, not a repeatable case step)**: removed the attachment `test-image-small.png` from conversation id 99 (message "Test image upload"), with "Also delete from attachment storage" checked — confirmed via `DELETE .../attachments/prompt_lib/21/99?filename=%2Fattachments%2F39ebbb3a-c9f2-4a62-8683-8959c7e3da5f%2Ftest-image-small.png&keep_in_storage=0` → **204**, thumbnail no longer renders in that message afterward. The orphan conversation itself (id 99) was left in place — consistent with this suite's established "chat history persists, no full-conversation cleanup" convention (`.agents/testing.md` § Test data strategy).
2. **This run's own fixture**: removed the attachment `test-image-small.png` (folder `edc50a03-ee9d-4454-b75c-ee5e601ded7a`) from the `attachments` bucket via the Artifacts UI's row-checkbox + toolbar-delete flow — confirmed via `DELETE https://next.elitea.ai/api/v2/artifacts/artifacts/default/21/attachments?fname[]=edc50a03-ee9d-4454-b75c-ee5e601ded7a%2Ftest-image-small.png` → **200**, folder absent from the subsequent bucket listing (confirmed via the raw `GET /artifacts/s3/attachments?...` JSON — sibling files from other concurrent analysts in this batch remained present and untouched).
3. This run's own conversation (id 102, "Test image upload") was left in place — same established "chat history persists" convention as above; only the attachment was purged, not the message/conversation.
4. Browser session closed (`playwright-cli -s=TC-030 close`) at the end of the run; the temporary `--profile=` directory used for isolation was also removed.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| New/isolated conversation button | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` | — (confirmed project-wide handle) |
| Announcement banner close | `getByRole('button', { name: 'close' })` (scope to the banner region) | `.filter({ has: page.getByText('Announcing ELITEA') })` on an ancestor |
| Attach-menu trigger ("+") | `getByRole('button', { name: 'plus menu' })` | `[aria-label="plus menu"]` |
| Attach Files menu item | `getByRole('button', { name: 'attach files' })` **— only actionable after the plus-menu trigger is clicked** | `getByText('Attach Files')` scoped to the opened menu |
| Hidden file input(s) | not directly targetable — use `page.waitForEvent('filechooser')` + `fileChooser.setFiles()` | `input[type="file"]` (2 present in DOM, no disambiguating attribute — last resort) |
| Message textarea | `getByTestId('chat-input')` | `getByRole('textbox', { name: 'Type your message...' })` |
| Send button | `getByTestId('chat-send-button')` (stable regardless of accessible-name state — **prefer this**) | `getByRole('button', { name: 'send your question' })` — dynamic name, only present once text is typed |
| Pre-send attachment chip (composer) | `getByText('test-image-small.png')` scoped to the composer container | none disambiguated this run |
| Sent message row | `getByTestId('chat-message-item')` | — (confirmed project-wide handle) |
| Sent attachment thumbnail | `getByRole('img', { name: 'test-image-small.png' })` | reuse `[data-testid="chat-message-item"]` to scope first if multiple attachments exist in one conversation |
| Thumbnail preview modal | `page.getByRole('dialog')` — opened via **`{ force: true }`** click on the thumbnail | n/a |
| Preview modal Close | `getByRole('button', { name: 'Close modal' })` | n/a |
| Artifacts nav (sidebar) | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Artifacts' })` | `getByText('Artifacts')` in sidebar |
| Artifacts bucket row ("attachments") | `getByText('attachments', { exact: true })` scoped to the bucket rail | — (no `data-testid` per-bucket-row observed) |
| Bucket-info icon (file count) | `getByRole('button', { name: /Retention Policy.*Number of files/ })` | n/a — this is the only live surface for "Number of files: N" |
| Artifacts file row | `getByTestId('artifacts-file-row').filter({ hasText: 'test-image-small.png' })` | — |
| Artifacts file-row checkbox | `getByTestId('artifacts-file-row').getByRole('checkbox')` | n/a |
| Artifacts toolbar delete button | `getByRole('button', { name: 'delete entity' })` — **accessible name is "delete entity", not "Delete"** (GH#87) | n/a |
| Delete-confirmation dialog | `page.getByRole('dialog')` (only one mounted at a time, heading "Delete confirmation") | `page.locator('[role="dialog"]')` |
| Dialog "Delete" / "Cancel" buttons | `page.getByRole('dialog').getByRole('button', { name: 'Delete' \| 'Cancel' })` | n/a |
| "Attach Files (N left)" counter | `getByText(/Attach Files \(\d+ left\)/)` | n/a |

## Network Behavior
- `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` — fires on Send click when an attachment is present; `multipart/form-data`; **201** on success; JSON body `[{"filepath": "/attachments/{uuid}/{fileName}", "file_size": <bytes>}]`. Authoritative "was it accepted" signal.
- `GET ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` (no query params) — **fires unexpectedly, shortly after the AI reply finishes, and 404s**. Filed as **GH#116**. Not part of the documented create/delete contract; allow-list this specific request in any console-error assertion, don't let it mask other real errors.
- `GET ${BASE_URL}artifacts/s3/?project_id={projectId}&format=json` — bucket list; returns all buckets with size/retention. Useful for out-of-band verification (bypassing UI render-timing flakiness — see § Automation Hints).
- `GET ${BASE_URL}artifacts/s3/attachments?project_id={projectId}&format=json` — bucket contents (S3-style `contents[]` with `key`/`size`/`lastModified`). Ground truth for "is my file really there/gone" independent of UI rendering state.
- `DELETE ${BASE_URL}api/v2/artifacts/artifacts/default/{projectId}/attachments?fname[]={urlencoded uuid/filename}` — fires on confirming the Artifacts-UI delete dialog. **200** on success. Correctly scoped to only the checked file(s) despite the dialog's misleading "delete all files" wording (GH#117).
- `DELETE ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}?filename={urlencoded path}&keep_in_storage=0|1` — the chat-inline delete path (used for this run's orphan cleanup, not for the case's own primary teardown). `204` on success. `keep_in_storage=0` = fully purged from storage too.

## Known Defects Found During Exploration
- **[MINOR]** Filed as [`GH#116`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/116) — a stray, unqualified `GET .../attachments/prompt_lib/{projectId}/{conversationId}` (no query params) 404s shortly after every attachment-bearing message's AI reply finishes rendering. Real, reproducible console error on this case's exact happy path; no visible functional impact observed (message, thumbnail, and AI reply all render correctly regardless). Confirmed once this run at a deterministic position in the request sequence; likely fires on every attachment upload across the module (worth other artifacts-module cases corroborating).
- **[INFO / CLARIFICATION]** Filed as [`GH#117`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/117) — bundles three documentation/automation-hint findings, none functional defects (reverse-masking guard: live product works correctly, case text / UI wording is imprecise):
  1. Chat-message thumbnail is only previewable via a **forced** click — a plain `getByRole('img',...).click()` times out due to the same pointer-intercepting hover overlay already documented for TC-036's Download/Remove buttons.
  2. The case's "dynamic count badge" (step 16) is actually the "Bucket info" icon's tooltip text (`Number of files: N`), not a persistently visible badge element.
  3. The delete-confirmation dialog's body text says "Are you sure to delete all files?" even when only a single file's row checkbox was checked. Verified this is wording-only — the resulting `DELETE` request is correctly scoped to just the selected file(s); no data-safety issue.
  Also noted (not separately filed, corroborates an existing tracked pattern): the Artifacts bucket rail took materially longer than the previously-documented ~1.2s to render under this batch's heavy concurrent load — see `.agents/memory/test-automation-lead/live_env_asset_load_timeout_under_heavy_volume.md`.

## Blocked Steps
None. All Setup steps and all 16 numbered case steps (plus Teardown) were executed end-to-end against the live system, using a disposable fixture created specifically for this run (conversation id 102, attachment fully purged by the end of the run) — plus one incidental pre-flight cleanup of an orphaned upload left behind by a previously dead analyst dispatch for this same case.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` / `.agents/test-automation.yaml`. This case belongs in `tests/artifacts.spec.ts` (module: artifacts), batched with the rest of TC-030..043 per the module's one-PR delivery plan.
- Page object: strong candidate case for `tests/pages/artifacts.page.ts` (already anticipated in `.agents/testing.md` § Structure) — encapsulate: the plus-menu→attach-files sequencing, file-chooser-based upload, forced-click thumbnail preview, bucket/folder navigation, the "Bucket info" tooltip-based file-count read, and the row-checkbox delete flow. TC-036/TC-037 (this same module) share several of these primitives — reuse, don't re-derive.
- Wait strategy: no `waitForTimeout` anywhere in this spec — `waitForResponse` for the create (`201`)/delete (`200`) endpoints, web-first `expect(...).toBeVisible()` polling for the rendered thumbnail/AI reply/bucket rail. **Give the bucket-rail-populated wait a generous timeout** (this run needed materially longer than the ~1.2s baseline documented pre-batch, likely due to this batch's heavy concurrent automation load per `.agents/memory/test-automation-lead/live_env_asset_load_timeout_under_heavy_volume.md`) — prefer polling the rendered bucket-rail state or the underlying `GET /artifacts/s3/...` response over a short fixed timeout.
- Console-error assertion: allow-list the one known GH#116 404 specifically (by URL pattern), don't blanket-disable console-error checking for this spec — it should still catch new regressions.
- Out-of-band verification tip: `GET ${BASE_URL}artifacts/s3/attachments?project_id={projectId}&format=json` gives ground-truth bucket contents independent of UI render timing — useful for a robust "is my file really there/gone" assertion that doesn't depend on the sometimes-slow UI.
- Analyst execution note (process/tooling, not product): ran via `playwright-cli -s=TC-030`, a genuinely isolated persistent-profile browser (confirmed via a fresh, unauthenticated Keycloak redirect at session start). Pre-flight discovered and cleaned up a stale, still-open `TC-030`-named session left by a previously dead dispatch attempt for this exact case — see the dedicated note near the top of this file.
- Per this batch's process fix, this AFS file is left **uncommitted/untracked** on disk — the artifacts-module implementer bundles it (and the other 13 cases' AFS files) into one PR alongside the test code, per `.agents/workflow.md` § Test delivery pattern.
