# Test Case: Upload Image via Drag-and-Drop into Chat

## Metadata
- **TMS ID**: TC-040
- **Linked Story**: GH#16 (EPIC), GH#105 (tracking)
- **Priority**: l2
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (Sage), analyst slot, `test-case-analysis` — isolated `playwright-cli -s=TC-040` session with its own in-memory Chrome profile (own pid 43805, confirmed via `open`'s own output). Confirmed non-shared: the very first navigation to `${BASE_URL}app/chat/` bounced to the Keycloak login page before any login, proving no inherited cookies from any concurrent sibling session. Re-verified `window.location.href` after every navigation/interaction per `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`.
- **Status**: ready-for-automation

## Note on this dispatch
A prior dispatch for this exact case died on a transient server-side rate limit before writing an AFS. It did, however, leave live side effects: an orphaned chat message ("Test drag-and-drop upload", conversation id 90) with a fully-uploaded attachment (folder `d27806ac-82d5-4cec-aff7-17802311f30d/test-drag-drop.png` in the `attachments` bucket) that was never torn down. This run found and cleaned that up in addition to its own fixture (see § Cleanup) — not a defect, just prior-run debris specific to this case.

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) via Keycloak SSO — confirmed handles match `.agents/testing.md`
- Local fixture file exists: `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-drag-drop.png` (confirmed: 10,039 bytes / 9.8 KB, valid 800×600 PNG)
- The "Announcing ELITEA 2.0.4!" release-notes banner (non-modal, dismissible via `getByRole('button', { name: 'close' })`) was present on first load and dismissed before interacting further — same recurring banner already documented for other cases (GH#42, GH#110). It is not a `[role="dialog"]`, so the case's own Setup step 3 ("check for `[role="dialog"]`") is a case-text mismatch already tracked elsewhere in this batch — not re-filed here.
- No Artifact Toolkit pre-configuration required — the chat composer's built-in drag-and-drop target is available by default (same finding as TC-032/TC-036: the case's "Artifact Toolkit is configured" precondition does not gate this path).

## Test Data

### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — from `.env`
- `${BASE_URL}` — from `.env`
- `${TEST_IMAGE_PATH}` = `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-drag-drop.png` (existing, local, gitignored fixture; re-used as-is)

### Must Generate (in test setup)
- A brand-new, isolated conversation (avoids racing any sibling analyst's / prior run's shared conversation state): click the sidebar "Conversation" button
  - Observed fixture this run: conversation id **109** (owner/project id **21**), server-side attachment path `/attachments/b1e8a9f9-e445-4989-a3f3-ed53ca01daad/test-drag-drop.png`
- Message text: literal string `Test drag-and-drop upload` (case-supplied, REQUIRED alongside the attachment per the app's documented "text prompt required" rule — confirmed: the Send button only activates, i.e. its accessible name only flips from `"enter speaking mode"` to `"send your question"`, once text is present)

### Must Clean Up (in teardown)
- The uploaded attachment (`test-drag-drop.png` in the `attachments` bucket, folder `b1e8a9f9-e445-4989-a3f3-ed53ca01daad`) — deleted via the Artifacts UI (see § Cleanup). The conversation/message itself is left in place, consistent with this suite's established "chat history persists, no full-message cleanup" convention (`.agents/testing.md` § Test data strategy, and TC-036's precedent).

## Test Steps

1. Navigate to `${BASE_URL}app/chat/`.
   - **Verify**: if redirected to `auth.elitea.ai` (Keycloak), authenticate — fill `getByRole('textbox', { name: 'Username or email' })` with `${ELITEA_EMAIL}`, `getByRole('textbox', { name: 'Password' })` with `${ELITEA_PASSWORD}`, click `getByRole('button', { name: 'Sign In' })`. Wait for URL to settle on `${BASE_URL}app/chat/**`.
2. Dismiss the release-notes announcement banner if present: `getByRole('button', { name: 'close' })`.
3. Create a fresh, isolated conversation: `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })`.
   - **Verify**: URL becomes `${BASE_URL}app/chat` (no id yet); composer is empty; "Hello, {user}!" greeting visible.
4. **Drag the file over the composer** using a synthesized `DataTransfer` + real DOM drag-event sequence (see § Automation Hints for the exact, verified technique — this is the framework-portable equivalent of what a real OS-level file drag produces):
   - Build a `DataTransfer` inside the page context containing a real `File` object (fetch a `data:` URI of the fixture's bytes → `Blob` → `File`, `dataTransfer.items.add(file)`).
   - Dispatch, in order, on the composer textarea (`#standard-multiline-static`, i.e. `getByTestId('chat-input')`): `dragenter`, `dragover` — **both** with the same `dataTransfer`.
   - **Verify**: visual feedback appears — the entire composer box gets a teal/cyan **dashed-border highlight** (confirmed via screenshot, `test-results/screenshots/TC-040-step-04-dragover-visual-feedback.png`). This is a real, assertable CSS state change, not merely case-text aspiration.
5. Dispatch `drop` (same `dataTransfer`) on the same composer target.
   - **Verify**: an attachment preview chip renders above the composer showing the filename `test-drag-drop.png` (with a remove/× icon); the "Attach Files (N left)" counter decrements by exactly 1 (10 → 9 in this run).
6. Verify the preview thumbnail/chip shows the filename `test-drag-drop.png` clearly (case step 6) — same chip as step 5's verify; no separate action needed.
7. Type the required accompanying text into the chat input — `getByTestId('chat-input')`.
   - **Verify**: Send button's accessible name flips from `"enter speaking mode"` to `"send your question"` once text is present (confirmed project-wide dynamic-name pattern, `.agents/testing.md`).
8. Click Send — `getByTestId('chat-send-button')`.
   - **Verify — network**: `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` resolves **201**, JSON body `[{"filepath": "/attachments/{uuid}/test-drag-drop.png", "file_size": 10039}]`. Capture `{uuid}` for step 11. Observed this run: `POST .../attachments/prompt_lib/21/109` → `201`, `filepath: /attachments/b1e8a9f9-e445-4989-a3f3-ed53ca01daad/test-drag-drop.png`, `file_size: 10039`.
   - **Verify — navigation**: URL settles on `${BASE_URL}app/chat/{conversationId}?name=Test+drag-and-drop+upload`.
9. Wait for the message to render with its attachment — poll for `getByRole('img', { name: 'test-drag-drop.png' })` scoped inside `getByTestId('chat-message-item')` (project-confirmed handle).
   - **Verify**: message row shows the sent text `Test drag-and-drop upload`, the image thumbnail, and (asynchronously) the AI's reply describing the image's actual visual content (confirms server-side processing, not a silently-dropped attachment). Observed reply this run: *"Looks like a simple drag-and-drop test image with a purple background and the text 'Drag Drop' centered."* — matches the fixture's real content.
10. Verify the thumbnail is clickable and opens a preview (case step 10).
    - **Verify**: clicking `getByRole('img', { name: 'test-drag-drop.png' })` **via `page.mouse.click(x, y)` at the image's bounding-box center, or `.click({ force: true })`** — see § Known Defects for why a bare `.click()`/`.hover()` on this locator will hang — opens `page.getByRole('dialog')` containing the filename as a heading, the enlarged image, and `Download image` / `Remove attachment` / `Close modal` buttons.
11. Navigate to `${BASE_URL}app/artifacts`, select the `attachments` bucket (`getByText('attachments', { exact: true })` in the bucket rail), open the folder named `{uuid}` captured in step 8: click the sidebar quick-nav item (`generic` wrapper, NOT the in-list row's text span — see § Automation Hints for why).
    - **Verify**: URL becomes `${BASE_URL}app/artifacts?bucket=attachments&folder={uuid}`.
12. Wait for the folder's file list to finish loading — condition-wait on the "Loading..." text disappearing / the file row appearing, not a fixed sleep.
    - **Verify**: `getByTestId('artifacts-file-list')` shows a row for `test-drag-drop.png`, Type `PNG Image`, Size `9.8 KB`.
13. Assert zero console errors/warnings across the whole flow (steps 1–12).

## Expected Results
- Dragging the fixture over the composer produces visible drag-active feedback (dashed-border highlight) before drop.
- Dropping the file attaches it — preview chip with filename renders, attach-slot counter decrements.
- Text message is required and gates the Send button's active state, exactly as documented.
- `POST .../attachments/prompt_lib/{projectId}/{conversationId}` → `201`, response includes `filepath` and `file_size` matching the local fixture's byte size (10,039).
- Sent message displays the attachment thumbnail; assistant's reply demonstrably describes the image's real content.
- Thumbnail is clickable and opens a genuine preview dialog (confirmed with a real mouse click, bypassing a Playwright-only actionability false-positive — see Known Defects).
- File appears in the Artifacts → `attachments` bucket, in a folder keyed by the upload's returned UUID, with correct Type/Size metadata.
- Zero console errors/warnings during the entire flow.

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| desc: drag-and-drop is 1 of 3 documented upload methods | n/a (context) | — | — | out-of-scope — informational only, nothing to assert |
| desc: supported formats JPEG/JPG/PNG/GIF(first frame)/WebP | fixture format accepted | Preconditions | pre-flight `file` check: valid PNG | asserted *(only PNG exercised here; other formats covered by sibling cases TC-030/033/035)* |
| desc: text prompt REQUIRED alongside images | Send disabled/blocked without text | step 7 verify | step 7: Send button's accessible name only flips to active once text present | asserted |
| Setup 1: maximize browser window | all UI elements visible | n/a | n/a | out-of-scope — manual-execution artifact; Playwright's fixed viewport (1920×1080 per `.agents/testing.md`) supersedes this |
| Setup 2: verify authenticated state | redirect-or-authenticated branch | step 1 | step 1 | asserted |
| Setup 3: close modals/overlays, `[role="dialog"]` | overlay dismissed | step 2 | step 2 | **clarification** — it's a dismissible banner, not a `[role="dialog"]` modal; same drift already tracked for other cases (GH#66/#67, GH#110), not re-filed |
| Step 1: navigate to chat / open existing chat | chat page loads, input toolbar visible | steps 1, 3 | step 3 | asserted *(re-authored: opens a fresh isolated conversation rather than reusing an existing thread, to avoid racing sibling/prior-run state — see Preconditions note on the batch's shared-account collision risk)* |
| Step 2: wait 2s for page to stabilize | interface fully loaded | step 3 verify | step 3 | asserted *(translated to a condition-wait — no fixed sleep, per `.agents/testing.md` § Conventions)* |
| Step 3: locate drop target area | drop target visible | step 3 | step 3 (composer rendered) | asserted *(decomposed: the drop target is specifically the composer textarea `#standard-multiline-static` / `getByTestId('chat-input')`, confirmed working — not the whole chat window, which was not independently tested)* |
| Step 4: drag file over drop target; expect visual feedback (highlight/dashed border/overlay) | visual feedback appears | step 4 | step 4: screenshot, dashed teal border confirmed | asserted — genuinely verified, not assumed |
| Step 5: drop file; file accepted, preview appears | preview/thumbnail appears in attachment area | step 5 | step 5: chip + counter decrement | asserted |
| Step 6: verify preview thumbnail visible with filename | filename shown clearly | step 6 | step 5's chip | asserted |
| Step 7: type required message text | text entered | step 7 | step 7 | asserted |
| Step 8: click Send | message + attachment sent | step 8 | step 8: network 201 + URL navigation | asserted |
| Step 9: wait for message with attachment thumbnail (10s timeout) | message appears with text + thumbnail | step 9 | step 9 | asserted *(translated to condition-wait on the `img` role appearing, not a fixed 10s — per `.agents/testing.md` § Conventions; resolved in well under 10s this run)* |
| Step 10: verify thumbnail clickable, opens preview | preview opens on click | step 10 | step 10: dialog appears | asserted — **but only via `page.mouse.click`/`{force:true}`**; see Known Defects for the Playwright-actionability caveat, which does not affect real users |
| Step 11: navigate to `/app/artifacts` to verify storage | artifacts page loads | step 11 | step 11 | asserted |
| Step 12: wait 10s with scroll trigger for lazy loading | all items loaded | step 12 | step 12 | asserted *(translated to condition-wait; the `attachments` bucket bucket was small enough this run — no scroll needed — but automation should still wait on the list's loaded state, not a fixed 10s, per the artifacts-loading-window technique documented in `.agents/memory/qa-engineer/artifacts_loading_window_capture_technique.md`)* |
| Step 13: verify file appears in artifacts list | file visible with correct name | step 12 | step 12: file row, Type/Size confirmed | asserted |
| Expected Final State: uploaded successfully, message in history, file in bucket, no errors | all conditions hold | steps 8–13 | steps 8, 9, 12, 13 | asserted |
| Teardown: delete uploaded file to leave account clean | file removed from bucket | Cleanup | Cleanup: `DELETE` → `200`, folder confirmed empty | asserted |

### Axis 2 — Analyst additions

- Step 4 investigates and confirms the exact **working technique** for simulating a native OS file drag (synthesized `DataTransfer` + `dragenter`/`dragover`/`drop` dispatch) — *added: the case's own step 4 hint (`page.dispatchEvent('dragenter')` + `setInputFiles()`) conflates two different Playwright mechanisms that don't actually combine that way; this AFS verifies and documents the technique that genuinely works end-to-end against the live drop zone, since drag-and-drop file upload is materially harder to automate faithfully than a plain file-picker (`setInputFiles`) and the task explicitly called for investigating this.*
- Step 9 asserts the assistant's reply demonstrably describes the image's real visual content, not just that a reply exists — *added: strongest available proof the attachment was genuinely processed server-side, matching the same enrichment pattern already established in TC-032/TC-036's AFS files.*
- Step 10's `page.mouse.click`/`force:true` requirement is independently investigated and confirmed as an automation-only false positive (not a real UX defect) via a from-first-principles test: computed `visibility:hidden` on the intercepting overlay at rest, and a genuine raw-mouse click landing on the image correctly even while the overlay is properly hover-visible — *added: goes beyond the case's plain "verify clickable" ask to establish WHY the naive automation approach fails and prove the underlying behavior is correct, per this dispatch's explicit ask not to silently fake a passing assertion.*
- Step 13 asserts response-body shape (`filepath` + `file_size` matching the local fixture's exact byte count) on the `201` in step 8 — *added: necessary to deterministically locate the file in the Artifacts UI in step 11 without a full-bucket search, and gives a strong byte-count integrity check "for free."*
- Step 13 (console) asserts zero errors/warnings across the **entire** flow, login through cleanup — *added: standard side-channel discipline; none observed in this run (0/0), guards a future regression.*
- **Bonus teardown**: found and removed an orphaned attachment (`d27806ac-82d5-4cec-aff7-17802311f30d/test-drag-drop.png`) left by a previous, crashed dispatch of this exact case — *added: legitimate hygiene for this case's own debris, not scope creep on another case's data (see § Note on this dispatch and § Cleanup).*

## Cleanup
1. From `${BASE_URL}app/artifacts?bucket=attachments&folder={uuid}`, open the file row's "more actions" (kebab) button — `page.locator('[id="artifact-actions-test-drag-drop.png-action"]')` (see § Known Defects — this button has no accessible name, so `getByRole` cannot target it) → click `menuitem "Delete"` → in the "Delete confirmation" dialog (`Are you sure to delete test-drag-drop.png? It can't be restored.`, no storage-purge checkbox on this from-artifacts-page path — unlike TC-036's from-chat-message delete path) → click `getByRole('button', { name: 'Delete' })`.
   - **Verified this run**: `DELETE ${BASE_URL}api/v2/artifacts/artifact/default/21/attachments?filename=b1e8a9f9-e445-4989-a3f3-ed53ca01daad%252Ftest-drag-drop.png` → `200`; folder confirmed empty afterward ("No files in this bucket").
2. **Bonus**: repeated step 1 for the orphaned folder `d27806ac-82d5-4cec-aff7-17802311f30d` left by the previous crashed dispatch of this same case — `DELETE .../attachments?filename=d27806ac-82d5-4cec-aff7-17802311f30d%252Ftest-drag-drop.png` → `200`. Confirmed both UUID folders absent from the `attachments` bucket's listing afterward.
3. The conversation itself (id 109, "Test drag-and-drop upload") and its message text are left in place — consistent with this suite's established "chat history persists, no full-message/conversation cleanup" convention (`.agents/testing.md` § Test data strategy; TC-036's identical precedent). Note the chat UI renders the thumbnail from an already-fetched inline base64 `data:` URI, so it continues to display the image even after the underlying file is purged from storage — **don't use the chat transcript to verify deletion; verify via the Artifacts bucket listing**, as this AFS's Cleanup step 1 does.
4. Browser session closed (`playwright-cli -s=TC-040 close`) at the end of the run.
5. Confirmed no accidental side-effect buckets were created (an early exploratory click briefly opened `/app/artifacts/create-bucket` by way of a stale element ref; escaped without submitting — bucket count verified unchanged at 3 both before and after: `attach`, `attachments`, `warranty`).

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| New/isolated conversation button | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` | — (confirmed project-wide handle, `.agents/testing.md`) |
| Announcement banner close | `getByRole('button', { name: 'close' })` (scope to the banner region) | `.filter({ has: page.getByText('Announcing ELITEA') })` on an ancestor |
| **Drag-and-drop target (composer)** | `getByTestId('chat-input')` — DOM resolves to `#standard-multiline-static` (implementation detail, do not select by this id directly) | `getByPlaceholder('Type your message...')` |
| Message textarea (typing) | `getByTestId('chat-input')` | `getByPlaceholder('Type your message...')` |
| Send button | `getByTestId('chat-send-button')` | `getByRole('button', { name: 'send your question' })` — dynamic accessible name, only present once text is typed (project-confirmed) |
| Pre-send attachment chip (composer) | `getByText('${FILE_NAME}')` scoped to the composer container | none found — no `data-testid` on the pre-send chip (same gap already noted for TC-032/036) |
| Sent message row | `getByTestId('chat-message-item')` | — (confirmed project-wide handle) |
| Sent attachment thumbnail | `getByRole('img', { name: 'test-drag-drop.png' })`, scoped inside `getByTestId('chat-message-item')` for disambiguation | — |
| Assistant reply content | `getByTestId('chat-answer-content')` | — |
| Hover-revealed "Download image" | `getByRole('button', { name: 'Download image' })` — only interactable after hover; container class `.attachActionButtons` | scope with `.filter({ has: page.getByRole('img', { name: filename }) })` on the ancestor row |
| Hover-revealed "Remove attachment" | `getByRole('button', { name: 'Remove attachment' })` — same hover container | same scoping fallback |
| **Preview dialog trigger** (click thumbnail) | `page.mouse.click(x, y)` at the thumbnail's bounding-box center, or `locator.click({ force: true })` — **do not use a bare `.click()`/`.hover()`**, see Known Defects | — |
| Preview dialog | `page.getByRole('dialog')` (only one dialog mounted at a time) | `page.locator('[role="dialog"]')` |
| Preview dialog "Close modal" | `getByRole('button', { name: 'Close modal' })` | — |
| Artifacts nav (sidebar) | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Artifacts' })` | `getByText('Artifacts')` in sidebar |
| Artifacts bucket row ("attachments") | `getByText('attachments', { exact: true })` scoped to the bucket rail | — |
| **Artifacts UUID-folder open control** | Sidebar quick-nav item — the `generic` wrapper with `cursor: pointer` that contains the folder icon + UUID text (e.g. resolved this run via `page.locator('div').filter({ hasText: /^{uuid}$/ }).nth(2)`) | **Not** the in-list row's own name span (`getByLabel(uuid)` inside `getByTestId('artifacts-file-list')`) — a single click there only toggles the row's checkbox, and a **double-click puts the folder name into inline rename-edit mode** instead of navigating in. Also not reliable: `getByText(uuid, {exact:true})` alone resolves to 3 elements (sidebar + list + a stray tooltip) — scope precisely or use the sidebar wrapper. |
| Artifacts file list container | `getByTestId('artifacts-file-list')` | — |
| Artifacts file row | `getByTestId('artifacts-file-list').getByText('${FILE_NAME}')` | — |
| **File-row "more actions" (kebab) button** | `page.locator('[id="artifact-actions-${FILE_NAME}-action"]')` — **has no accessible name**, `getByRole('button', {name})` will not resolve it (see Known Defects, GH#120) | — |
| Kebab menu "Delete" | `getByRole('menuitem', { name: 'Delete' })` | — |
| Delete-confirmation dialog (from Artifacts page) | `page.getByRole('dialog')` (heading "Delete confirmation") — **no storage-purge checkbox** on this path, unlike the from-chat-message delete dialog documented in TC-036/GH#110 | `page.locator('[role="dialog"]')` |
| Dialog "Delete" button | `page.getByRole('dialog').getByRole('button', { name: 'Delete' })` | — |
| "Attach Files (N left)" counter | `getByText(/Attach Files \(\d+ left\)/)` | — |

## Network Behavior
- `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` — fires on Send click when an attachment is present; `multipart/form-data`; **201** on success; JSON body `[{"filepath": "/attachments/{uuid}/{fileName}", "file_size": <bytes>}]`. This is the authoritative "was it accepted" signal.
- `GET ${BASE_URL}api/v2/artifacts/artifact/default/{projectId}/attachments/{uuid}%2F{fileName}` — fires when the message with an attachment renders; fetches the actual image bytes for the inline thumbnail (consistent with TC-036's documented pattern).
- `DELETE ${BASE_URL}api/v2/artifacts/artifact/default/{projectId}/attachments?filename={uuid}%252F{fileName}` — fires on confirming the delete dialog **from the Artifacts bucket UI** (as opposed to TC-036's from-chat-message delete, which hits a different endpoint: `elitea_core/attachments/prompt_lib/{ownerId}/{conversationId}` with a `keep_in_storage` param). **200** on success. This is a newly-confirmed, distinct endpoint for this from-artifacts-page delete path — no storage-purge checkbox exists on this path because it always fully deletes from storage.
- GA4 beacons (`google-analytics.com/g/collect`) independently fire `attachment_uploaded` (`ep.attachment_type=image/png`, `ep.upload_source=chat`) and `conversation_created` events — corroborating evidence only, do not assert on these in automation (third-party, best-effort).

## Known Defects Found During Exploration

- **[INFO / CLARIFICATION — filed GH#120]** The Artifacts bucket's per-file-row "more actions" (kebab) button (`id="artifact-actions-{filename}-action"`) has **no accessible name at all** — not a generic/wrong one like GH#87's "delete entity", literally empty (`aria-label` is `null`, no text content). Distinct from GH#33's Agent/Pipeline detail-page kebab (`id="undefined-action"`, a different page/surface) and from GH#87 (Artifacts *toolbar* "Delete all files" button). Confirmed on 2 independent file rows this run. Implementer must use the templated `id` selector (`[id="artifact-actions-${fileName}-action"]`), not `getByRole`. Filed as its own ticket per this project's strict-per-bug bundling policy.
- **[Investigated, NOT filed — corroborated on existing GH#110]** Clicking the chat message's attachment thumbnail (`getByRole('img', { name })`) via a bare Playwright `.click()`/`.hover()` times out — `<div class="attachActionButtons">…</div> intercepts pointer events`, matching the same overlay class already documented in GH#110 (TC-036) for a different control. Investigated definitively rather than left as "inconclusive": the overlay's resting `visibility` is `hidden` (confirmed via `getComputedStyle`) with an identical bounding rect to the image; per the CSS spec, `visibility:hidden` elements are excluded from real hit-testing regardless of `pointer-events`. A genuine `page.mouse.click(x, y)` — bypassing Playwright's own (stricter, and in this one case incorrect) actionability pre-check — correctly opens the preview dialog, including with the overlay properly hover-visible and the click landing away from its two icon buttons. **Conclusion: pure Playwright-tooling false positive, not a real user-facing defect** — real users can click the thumbnail and get the preview every time. Documented here and as a corroborating comment on GH#110 rather than filed as a new ticket, per the reverse-masking guard and this project's established precedent for this exact class of finding.
- No functional/product defects found. The case (drag-and-drop upload, send, verify in chat, verify in artifacts bucket, delete) executed successfully end-to-end against the live system, with zero console errors/warnings throughout, including through cleanup of both this run's own fixture and a prior crashed run's orphaned debris.

## Blocked Steps
None. All Setup steps and all 13 numbered case steps (plus Teardown) were executed end-to-end against the live system.

## Automation Hints

- Framework: Playwright (TypeScript), per `.agents/testing.md` / `.agents/test-automation.yaml`. This case joins `tests/artifacts.spec.ts` (module: artifacts, per the EPIC's module-by-module delivery plan, GH#16).

- **The verified, working drag-and-drop technique** (this dispatch's core investigative ask). The case's own step 4 hint (`page.dispatchEvent('dragenter')` combined with `setInputFiles()`) does not reflect how these two Playwright mechanisms actually compose — `setInputFiles()` targets a file `<input>` directly and has nothing to do with drag events. The technique **confirmed working end-to-end** against this app's live drop zone is a synthesized `DataTransfer` + real DOM drag-event sequence, entirely in the page context:

  ```ts
  async function dropFileOnComposer(page: Page, filePath: string) {
    const fs = require('fs');
    const path = require('path');
    const buffer = fs.readFileSync(filePath).toString('base64');
    const fileName = path.basename(filePath);
    const fileType = 'image/png'; // derive from extension in a real helper

    const dataTransfer = await page.evaluateHandle(
      async ({ bufferData, fileName, fileType }) => {
        const dt = new DataTransfer();
        const blob = await fetch(bufferData).then((res) => res.blob());
        const file = new File([blob], fileName, { type: fileType });
        dt.items.add(file);
        return dt;
      },
      { bufferData: `data:${fileType};base64,${buffer}`, fileName, fileType }
    );

    const target = page.getByTestId('chat-input');
    await target.dispatchEvent('dragenter', { dataTransfer });
    await target.dispatchEvent('dragover', { dataTransfer });
    await target.dispatchEvent('drop', { dataTransfer });
  }
  ```

  This is the same technique commonly documented in the Playwright community for testing native file drag-and-drop (there is no public, first-class `Locator` API for simulating an OS-level file drag as of Playwright 1.61 — `locator.setInputFiles()` is for `<input type="file">` only). **Verified twice independently this run**: once via `playwright-cli`'s own `drop <ref> --path=<file>` convenience command (a black-box CDP-level equivalent, useful for manual exploration but not directly portable into `@playwright/test` code since `.drop({ files })` is not part of the public `Locator` API), and once via the literal `dispatchEvent` sequence above run through `playwright-cli run-code` — both produced an identical, correct result (attachment chip renders, counter decrements, upload succeeds end-to-end through to the `201` response). Use the `dispatchEvent` version verbatim in the framework's `.spec.ts` / page-object code.

  For the dragover-only visual-feedback assertion (case step 4), dispatch only `dragenter` + `dragover` (no `drop`) and assert the composer's dashed-border highlight is visible before completing the drop — confirmed via screenshot this run (`test-results/screenshots/TC-040-step-04-dragover-visual-feedback.png`); a real, minimal fake `Blob`/`File` is sufficient for this partial-sequence check since no actual upload occurs until `drop` fires.

- **Preview-click actionability gotcha**: see § Known Defects. Use `page.mouse.click(x, y)` at the thumbnail's `boundingBox()` center, or `locator.click({ force: true })` — never a bare `.click()`/`.hover()` on the thumbnail `img` locator, which will hang for the full actionability timeout every time due to the `.attachActionButtons` sibling's `visibility:hidden`-but-still-flagged-as-intercepting quirk.

- **Artifacts folder-navigation gotcha**: see Concrete Handles. Single-clicking the in-list UUID-folder row's name span only toggles its row checkbox; double-clicking puts it into inline rename-edit mode (a real, if minor, UX surprise — not filed as a defect since it wasn't asked for by this case and didn't block the flow, but worth flagging for whoever automates folder-rename cases later). Navigate into a folder via the sidebar quick-nav item instead.

- Page object: extend the artifacts-module's planned `tests/pages/artifacts.page.ts` (per `.agents/testing.md` § Structure and TC-036's AFS) with: the `dropFileOnComposer` helper above, the preview-click force-click helper, and the kebab-menu-by-id + delete-confirm flow (no storage-purge checkbox on this from-artifacts-page delete path, unlike the from-chat-message path TC-036 already encapsulates).

- Wait strategy: no `waitForTimeout` anywhere in this spec — `waitForResponse` for the create (`201`) / delete (`200`) attachment endpoints, and web-first `expect(...).toBeVisible()` polling for the rendered thumbnail, the dragover visual-feedback state, and the artifacts file row.

- Analyst execution note (process/tooling, not product): ran via `playwright-cli -s=TC-040`, a genuinely isolated in-memory-profile browser (confirmed via a fresh, unauthenticated Keycloak redirect at session start). Created a brand-new conversation rather than reusing any shared/prior-run one, specifically to avoid racing concurrent sibling analysts on the same shared `${TEST_USER}` account; found and cleaned up a prior crashed dispatch's own orphaned debris as a bonus (see § Note on this dispatch).

- Per this batch's process fix, this AFS file is left **uncommitted/untracked** on disk — the artifacts-module implementer bundles it (and the other artifacts-module cases' AFS files) into one PR alongside the test code, per `.agents/workflow.md` § Test delivery pattern.

- **Amendment (implementer debugging pass, post-merge fix round)**: the drag-event-dispatch technique above (verbatim `dispatchEvent` sequence) was reproduced EXACTLY and is confirmed still correct -- that was never the problem. The residual failure was in the visual-feedback ASSERTION TARGET, not the drag technique: this AFS's own screenshot (`test-results/screenshots/TC-040-step-04-dragover-visual-feedback.png`) shows "the entire composer box" getting the dashed-teal highlight, but doesn't name which exact DOM element that is. Live re-investigation (direct ancestor-chain DOM inspection with computed styles, before/after dragover) found the dashed border lands on an OUTER WRAPPING ancestor of `chat-input`, several levels up, whose bounding box matches the screenshot's visible composer box exactly -- `chat-input` itself never changes its own `borderStyle`, so the original implementation's `artifacts.chatInput.evaluate(el => getComputedStyle(el).borderStyle)` check was structurally unable to ever observe the real feedback. That ancestor also carries a MUI/emotion-generated class name confirmed to change between page loads (build-unstable, not a usable handle). Fixed via a new `expectComposerDragActiveBorder()` helper (`tests/pages/artifacts.page.ts`) that walks the ancestor chain from the one stable handle (`chat-input`) upward, checking each ancestor's own computed border-style for "dashed" -- immune to the exact depth or class name. Not a scope change: the same observable ("does the composer show a dashed-border highlight during dragover") is still asserted, just via a technique that can actually see it.
- **Second amendment, same debugging pass**: fixing the above unmasked a second, reproducible bug (2 consecutive clean runs, not a flake) -- driving the dragover-feedback check and the drop as two INDEPENDENT drag gestures (the original implementation called `dragOverComposer()` once, then separately called `dropFileOnComposer()`, which built its OWN second `DataTransfer` and re-dispatched its own `dragenter`/`dragover` before `drop`, with no `dragleave`/`drop` ever ending the first sequence) left the app's own "Attach Files (N left)" counter stuck at its pre-drop value even though the pre-send chip still rendered -- consistent with the app's internal drag-enter/leave-pair tracking getting left inconsistent by the back-to-back double `dragenter`. Fixed by carrying the SAME `DataTransfer` handle from the dragover check into the drop (`dragOverComposer()` now returns the handle; a new `dropDraggedFile()` completes the SAME gesture with just a `drop`) -- one continuous gesture, matching both a real single mouse-drag-and-release and this AFS's own original code sample (which models `dropFileOnComposer` as one atomic `dragenter`->`dragover`->`drop` sequence, not two separate ones).
