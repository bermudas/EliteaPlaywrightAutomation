# Test Case: Download an Image File from Chat Message

## Metadata
- **TMS ID**: TC-036
- **Linked Story**: GH#101 (own tracking issue, parent epic GH#16)
- **Priority**: l2
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`) — isolated `playwright-cli -s=TC-036` session with a unique `--persistent --profile=` directory (not the shared default MCP profile — see `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`). Confirmed non-shared: the very first navigation to `${BASE_URL}app/chat/` bounced to the Keycloak login page before any login, proving no inherited cookies from any of the 13 sibling analysts (TC-030..035, TC-037..043) dispatched in parallel this batch. Re-verified `window.location.href` after every navigation/interaction per that memory entry's standing mitigation.
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via `GET ${BASE_URL}/app/chat/` not redirecting to the Keycloak login page (this run's isolated profile started unauthenticated, so login through Keycloak SSO was performed first — confirmed handles below match `.agents/testing.md`'s existing SSO leads)
- Browser viewport maximized (case's own Setup step 1)
- The "Announcing ELITEA 2.0.4!" release-notes banner (non-modal, top-of-page, dismissible via a `getByRole('button', { name: 'close' })`) was present on first load and dismissed before interacting further — same recurring banner already documented for the Agents/Pipelines create forms (GH#42). It is not a `[role="dialog"]`, so the case's Setup step 3 guidance ("check for `[role="dialog"]` ... close with Got it/ESC/click outside") does not literally match it, but the intent (clear blocking overlays first) is the same.
- Test image file `test-download-image.png` exists locally at `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-download-image.png` (gitignored, pre-generated, shared across the artifacts-module batch) — confirmed: 8,692 bytes, valid 800×600 PNG, SHA-256 `f1d244cfa1adcb7cde0e2cb7a95900c2a646203da8b412a136f8b79d78cc899`
- **At least 1 image file uploaded to a chat message** — the case allows reusing "previous test or setup" state. Given the dispatch's flagged module-specific collision risk (14 parallel sibling analysts uploading concurrently against the same shared `${TEST_USER}` account), this run deliberately did **not** depend on or search for another analyst's shared conversation/attachment. It created its own disposable fixture in a freshly-started, isolated conversation instead (see Test Data → Must Generate). This satisfies the precondition's intent without any risk of racing a sibling's concurrent upload/delete.
- Download directory accessible for verification — satisfied via `page.waitForEvent('download')` + `download.saveAs()` to a scratch directory (analyst-local, not part of the repo); the automation engineer should use Playwright's per-test `downloadsPath` / the default `context` download handling instead of a hardcoded path.

## Test Data

### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`
- `${TEST_IMAGE_PATH}` = `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-download-image.png` (existing, local, gitignored fixture — already generated per the task briefing, re-used as-is, not modified)

### Must Generate (in test setup)
- A disposable chat message carrying the attachment, in a **brand-new, isolated conversation**:
  1. Click sidebar "Conversation" button to start a fresh conversation (avoids touching/racing any sibling analyst's existing conversation)
  2. Attach `${TEST_IMAGE_PATH}` via **direct `setInputFiles` on the hidden file input** (see Concrete Handles — clicking the visible paperclip icon is unreliable, see Known Defects/Automation Hints)
  3. Type accompanying message text `"TC-036 download test image"` (required — the app rejects/won't send attachment-only messages, corroborating the case's own Test Data note and the module's documented "text prompt REQUIRED" rule)
  4. Send
  - Observed fixture this run: conversation id **89** (owner/project id **21**), server-side attachment path `/attachments/050ebbc9-f8a4-4e67-97cc-df41267b283b/test-download-image.png`

### Must Clean Up (in teardown)
- Delete the downloaded local file from the download directory
- Delete the uploaded attachment **with the "Also delete from attachment storage" checkbox checked** — see Known Defects/Concrete Handles; leaving it unchecked likely only detaches the attachment from the message while the file persists in the artifact bucket (not independently re-tested in the unchecked state, since every run here needs full cleanup of the shared account)

## Test Steps

1. Navigate to `${BASE_URL}/app/chat/`
   - **Verify**: if not authenticated, redirected to `https://auth.elitea.ai/realms/nexus/protocol/openid-connect/auth`; login via `getByRole('textbox', { name: 'Username or email' })`, `getByRole('textbox', { name: 'Password' })`, `getByRole('button', { name: 'Sign In' })` (confirmed handles, matches `.agents/testing.md`); post-login lands on `${BASE_URL}app/chat/`
2. Dismiss the release-notes banner: `getByRole('button', { name: 'close' })`
   - **Note**: dismissing it triggered this shared account's known post-login auto-redirect into an existing conversation (`/app/chat/87?name=New+conversation+test`) — a manual-execution/shared-account artifact already documented for other cases in this batch, not a functional issue. Automation should navigate to the target flow rather than assert on the immediate post-login/post-dismiss URL.
3. Click the sidebar "Conversation" button — `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` (confirmed handle, `.agents/testing.md`) — starts a brand-new, empty conversation
   - **Verify**: URL becomes `${BASE_URL}app/chat` (no id yet)
4. Attach the test image directly via the hidden file input — `page.setInputFiles('input[type="file"]', '${TEST_IMAGE_PATH}')`. Do **not** attempt to click the visible "attach files" paperclip button first (see Known Defects — the click is unreliably intercepted by an adjacent "plus menu" button/overlay)
   - **Verify**: an inline preview appears in the composer with accessible text `test-download-image.png`; the "Attach Files (N left)" counter decrements from `10` to `9`
5. Type the required accompanying text into the chat input — `getByTestId('chat-input')` (confirmed project handle, `.agents/testing.md`; DOM-level this resolves to the MUI textarea `#standard-multiline-static` — do not select by that id directly, it's an implementation detail)
   - **Verify**: send button's accessible name flips from `"enter speaking mode"` to `"send your question"` once text is present (confirmed dynamic-name pattern, `.agents/testing.md`)
6. Click the send button — `getByTestId('chat-send-button')`
   - **Verify**: `POST /api/v2/elitea_core/attachments/prompt_lib/{ownerId}/{conversationId}` returns `201`; URL updates to `${BASE_URL}app/chat/{newId}?name=TC-036+download+test+image`
7. Wait — condition-based, not a fixed sleep — for the message to render with its attachment: poll for `getByRole('img', { name: 'test-download-image.png' })` inside the new message list item
   - **Verify**: message row shows the sent text, the image thumbnail, and (asynchronously) the AI's reply acknowledging the attached file's server-side path (`/attachments/{uuid}/test-download-image.png`)
8. Hover over the attachment thumbnail — `getByRole('img', { name: 'test-download-image.png' })` — to reveal the hover-only action buttons
   - **Verify**: `getByRole('button', { name: 'Download image' })` and `getByRole('button', { name: 'Remove attachment' })` both become visible/interactable (both live inside a `.attachActionButtons` container that only mounts interaction on hover)
9. Click "Download image" while listening for the browser's native download event — `page.waitForEvent('download')` alongside the click, **not** a fixed "wait N seconds" (case's Step 6 literal text)
   - **Verify**: download event fires with `download.suggestedFilename() === 'test-download-image.png'`; `download.failure()` is `null`; `download.url()` is a `blob:` URL (confirms no fresh network round-trip at click time — the already-fetched image bytes are re-saved client-side, see Network Behavior); saved file is **byte-identical** to the source fixture (confirmed SHA-256 `f1d244cfa1adcb7cde0e2cb7a95900c2a646203da8b412a136f8b79d78cc899` on both sides); saved file opens as a valid 800×600 PNG (confirmed via `file`/`sips`)
10. Check for error messages/toasts in the UI and for console errors
    - **Verify**: no error text/toast visible anywhere on the page; console shows `Total messages: 8 (Errors: 0, Warnings: 0)` — the only entries are a benign ASCII-art build-version banner (`VERSION: 0.4.1833`), the same noise pattern already documented elsewhere in this batch, not app errors
11. Confirm the chat remains functional after the download (case's own "Expected Final State")
    - **Verify**: page URL unchanged (`${BASE_URL}app/chat/89?name=TC-036+download+test+image`); the chat composer textbox is still present and accepts input; no unexpected navigation/reload occurred as a side effect of the download

### Teardown

12. Delete the locally downloaded file from the download directory
    - **Verify**: file no longer present on disk
13. Hover the attachment thumbnail again → click "Remove attachment" → in the "Delete confirmation" dialog, **check** the "Also delete from attachment storage" checkbox → click "Delete"
    - **Verify**: `DELETE /api/v2/elitea_core/attachments/prompt_lib/21/89?filename=%2Fattachments%2F050ebbc9-f8a4-4e67-97cc-df41267b283b%2Ftest-download-image.png&keep_in_storage=0` returns `204`; the attachment thumbnail no longer renders in the message row afterward (message text itself is left intact — matches this suite's established "chat history persists, no full-message cleanup" convention)

## Expected Results
- `test-download-image.png` downloads successfully via the chat message's hover-revealed "Download image" control
- Downloaded file is present, byte-identical to the source fixture, and opens as a valid PNG
- No error messages/toasts anywhere in the UI during the flow
- Zero console errors/warnings across the entire login → upload → download → cleanup flow
- Chat remains fully functional (composer interactive, no forced navigation) after the download
- Teardown leaves the account clean: attachment purged from both the chat message and attachment storage (`keep_in_storage=0`), local downloaded file removed

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Precondition: test image exists (< 1MB) | fixture available for upload | Test Data | pre-flight `ls`/hash of `${TEST_IMAGE_PATH}` (8,692 bytes, valid PNG) | asserted |
| Precondition: at least 1 image uploaded to artifacts (from previous test/setup) | an attachment exists to download | steps 3–6 | step 6: `201` create response + rendered thumbnail | asserted *(re-authored: generated a fresh, isolated fixture in a brand-new conversation instead of depending on/searching for a sibling analyst's shared state — see Preconditions note on the parallel-collision risk)* |
| Precondition: download directory accessible | download can be verified | step 9 | step 9: `page.waitForEvent('download')` + `saveAs()` succeeds | asserted |
| Setup 1: maximize browser window | UI elements visible | precondition | viewport set before navigation | asserted |
| Setup 2: verify authenticated state via `/app/chat/` | no redirect = authenticated (else login first) | step 1 | step 1: login performed (fresh isolated profile started unauthenticated) | asserted |
| Setup 3: close open modals/overlays | no blocking overlay | step 2 | step 2: release-notes banner dismissed | asserted *(re-authored: the only overlay present was a non-modal banner, not a `[role="dialog"]`, but the intent — clear blockers first — is satisfied)* |
| Setup 4: ensure test image exists / upload via TC-030 steps 1–10 if none | image available in a chat message | steps 3–6 | step 6: `201` response, thumbnail renders | asserted *(decomposed: performed the equivalent upload-and-send flow directly rather than literally re-running TC-030's steps, using the same paperclip→attach→type→send mechanic TC-030 exercises)* |
| 1 Navigate to chat / find conversation with attachment | chat loads with message history | steps 1, 3 | step 3: new conversation URL | asserted *(re-authored: created a fresh conversation with its own fixture rather than "finding" a pre-existing one, per the collision-risk precondition above)* |
| 2 Wait 2 seconds for page to stabilize | messages fully loaded | step 7 | step 7: condition wait on image role, not fixed sleep | asserted *(re-authored per `.agents/testing.md` § Conventions — no `waitForTimeout`)* |
| 3 Locate message containing attachment | thumbnail visible inline | step 7 | step 7: `getByRole('img', { name: 'test-download-image.png' })` | asserted |
| 4 Right-click OR hover over attachment to reveal download control | context menu OR download button visible | step 8 | step 8: hover reveals `.attachActionButtons` | asserted *(only the hover path was exercised — it satisfies the case's own "OR" framing; the right-click/native-context-menu alternative was not separately verified, see Blocked Steps note below is not needed since one full path was confirmed)* |
| 5 Click "Download" option (context menu / download icon / three-dot menu) | download starts | step 9 | step 9: click `getByRole('button', { name: 'Download image' })` | asserted *(re-authored: exact control is a dedicated hover-revealed icon button named "Download image", not a context menu or three-dot menu — case's own phrasing already anticipated a "download icon" as one valid form, so this is a confirmation, not a contradiction)* |
| 6 Wait 5 seconds for download to complete | download completes | step 9 | step 9: `page.waitForEvent('download')`, resolves near-instantly (blob re-save, no new network fetch) | asserted *(re-authored per `.agents/testing.md` § Conventions — condition wait, not fixed sleep; the case's "5 seconds" is a manual-execution artifact, actual completion is sub-second)* |
| 7 Verify file exists in download directory with correct filename | file present in download folder | step 9 | step 9: `download.suggestedFilename()` + on-disk file after `saveAs()` | asserted *(enrichment: also verified byte-for-byte SHA-256 equality with the source fixture, beyond mere existence)* |
| 8 Verify no error messages during download | no errors visible in UI | step 10 | step 10: no error text/toast; 0 console errors/warnings | asserted |
| Expected Final State: file downloaded, intact/openable, no errors, chat functional | all conditions hold | steps 9–11 | step 9 (integrity), step 10 (errors), step 11 (functional) | asserted |
| Teardown: delete downloaded file | local file removed | step 12 | step 12 | asserted |
| Teardown: delete uploaded image from chat/artifacts (either chat-inline delete OR navigate to `/app/artifacts`) | account left clean | step 13 | step 13: `DELETE .../attachments/...?keep_in_storage=0` → `204` | asserted *(re-authored: used the chat-inline "Remove attachment" path with the "Also delete from attachment storage" checkbox checked, which satisfies both of the case's listed alternatives in one action — full storage purge, not just message-level detach; the `/app/artifacts` UI path was not separately exercised since the inline path already achieves full cleanup, confirmed via the `keep_in_storage=0` response)* |

### Axis 2 — Analyst additions
- Step 9 asserts byte-for-byte SHA-256 equality between the downloaded file and the source fixture, and confirms the file opens as a valid 800×600 PNG — *added: the case only asks for "file exists / intact and openable"; this is a stronger, unambiguous integrity guarantee cheap to assert given the fixture is a known-good file.*
- Step 9 asserts `download.url()` is a `blob:` URL and `download.failure()` is `null` — *added: distinguishes a genuine client-side re-save (expected, fast) from a failed/retried network-backed download, which the case's generic "wait for download" language doesn't address.*
- Step 13 asserts the exact `DELETE` request's `keep_in_storage=0` query param and its `204` response — *added: the case's teardown never mentions the storage-purge checkbox at all; without asserting this, a downstream implementer could tick the box off, leave orphaned files in the shared account's artifact bucket across every future automated run, and never notice (filed as a clarification, GH#110).*
- Step 10 asserts zero console errors/warnings across the **entire** flow (login through cleanup), not just around the download click — *added: guards against a silent regression anywhere in the sequence, not only the step the case calls out.*
- Steps 3–6 use a freshly created, isolated conversation instead of a shared/pre-existing one — *added: execution-strategy choice made specifically to avoid racing the 14 parallel sibling analysts also uploading/deleting attachments in the same shared account this batch; not a new assertion, but the reason precondition #4 above is satisfied via generation rather than reuse.*

## Cleanup
1. Delete the locally downloaded `test-download-image.png` from the scratch download directory — confirmed removed.
2. Remove the chat attachment with "Also delete from attachment storage" checked — confirmed via `DELETE /api/v2/elitea_core/attachments/prompt_lib/21/89?filename=%2Fattachments%2F050ebbc9-f8a4-4e67-97cc-df41267b283b%2Ftest-download-image.png&keep_in_storage=0` → `204`, and the thumbnail no longer renders in the message afterward. The message text itself ("TC-036 download test image") and its now-attachment-less conversation are left in place — consistent with this suite's established "chat history persists, no full-message/conversation cleanup" convention (`.agents/testing.md` § Test data strategy).
3. Browser session closed (`playwright-cli -s=TC-036 close`) at the end of the run.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Sidebar "Conversation" (new chat) button | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` (confirmed pre-existing project handle, `.agents/testing.md`) | n/a |
| Attachment file input (hidden) | `page.locator('input[type="file"]')` — single instance on the page | **Not** `#file-upload-input<timestamp>` — the `id` carries a live timestamp suffix (`file-upload-input1783088959809`) and is **not stable** across page loads/sessions; do not select by id |
| Composer text input | `getByTestId('chat-input')` (confirmed pre-existing project handle, `.agents/testing.md`) | `getByPlaceholder('Type your message...')` |
| Send button | dynamic accessible name — `getByRole('button', { name: 'enter speaking mode' })` before text, `getByRole('button', { name: 'send your question' })` after text is typed (confirmed pre-existing dynamic-name pattern) | `getByTestId('chat-send-button')` — stable regardless of accessible-name state, **prefer this over the name-based locator** to avoid the dynamic-name race entirely |
| Pre-send attachment preview (in composer) | `getByText('test-download-image.png')` scoped to the composer region | none disambiguated this run — not needed (no pre-send removal was exercised) |
| Sent message's attachment thumbnail | `getByRole('img', { name: 'test-download-image.png' })` (accessible name = filename) | reuse `[data-testid="chat-message-item"]` (pre-existing project handle from the smoke suite, `.agents/testing.md`) to scope to the specific message row first, if disambiguating among multiple attachments in one conversation — **not independently re-verified in this run**, carried over from the existing confirmed-handles table |
| "Download image" button (hover-revealed) | `getByRole('button', { name: 'Download image' })` — only interactable after hovering the attachment thumbnail; container class `.attachActionButtons` | scope with `.filter({ has: page.getByRole('img', { name: filename }) })` on the ancestor message row if multiple attachments exist in one conversation |
| "Remove attachment" button (hover-revealed) | `getByRole('button', { name: 'Remove attachment' })` — same hover container as Download | same scoping fallback as above |
| Delete-confirmation dialog | `page.getByRole('dialog')` (only one dialog mounted at a time, heading "Delete confirmation") | `page.locator('[role="dialog"]')` |
| "Also delete from attachment storage" checkbox | `page.getByRole('dialog').getByRole('checkbox')` (only one checkbox in this dialog) | n/a |
| Dialog "Delete" button | `page.getByRole('dialog').getByRole('button', { name: 'Delete' })` | n/a |
| Dialog "Cancel" button | `page.getByRole('dialog').getByRole('button', { name: 'Cancel' })` (starts focused by default) | n/a |
| "Attach Files (N left)" counter | `getByText(/Attach Files \(\d+ left\)/)` — useful assertion that a slot was consumed after attaching | n/a |

## Network Behavior
- `POST /api/v2/elitea_core/attachments/prompt_lib/{ownerId}/{conversationId}` — fires on Send click when the message carries an attachment. `201` on success. (`ownerId=21`, `conversationId=89` this run.)
- `GET /api/v2/artifacts/artifact/default/{ownerId}/attachments/{uuid}%2F{filename}` — fires when the message with an attachment renders; fetches the actual image bytes used both for the inline thumbnail **and** reused for the "Download image" action. `200` on success.
- Clicking "Download image" fires **no new network request** — `download.url()` is a `blob:` URL, confirming the already-fetched image bytes (from the `GET .../attachments/...` above) are re-saved client-side. Wait strategy is therefore `page.waitForEvent('download')`, not `page.waitForResponse(...)`.
- `DELETE /api/v2/elitea_core/attachments/prompt_lib/{ownerId}/{conversationId}?filename={urlencoded path}&keep_in_storage=0|1` — fires on confirming the delete dialog. `204` on success. The `keep_in_storage` param directly reflects the "Also delete from attachment storage" checkbox (`0` = checked = fully purged; presumably `1` if left unchecked — not independently re-tested, since full cleanup was required every run).

## Known Defects Found During Exploration
- **[INFO / CLARIFICATION]** Filed as [`GH#110`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/110) — bundles three documentation findings, none of which are functional defects (reverse-masking guard: live product behaves correctly, case text is under-specified):
  1. The composer's visible "attach files" paperclip button is not reliably clickable via `getByRole` at the moment the composer first renders (click intercepted by an adjacent "plus menu" button / transient overlay divs, ~5 retries, never resolved in this run) — inconclusive whether this is a real user-facing defect or an automation-only timing artifact, so **not filed as a functional bug**. Documented so the implementer doesn't waste time debugging the same click before falling back to `setInputFiles` (see Concrete Handles).
  2. Confirmed exact accessible names for the hover-revealed controls ("Download image", "Remove attachment") — the case only says "download button/icon" and doesn't mention a remove/delete option at all.
  3. The delete-confirmation dialog's "Also delete from attachment storage" checkbox is not mentioned anywhere in the case's teardown text, but materially changes cleanup semantics (full purge vs. message-level-only detach) — flagged as the most implementer-relevant of the three, since silently leaving it unchecked would leave orphaned files in the shared account across every future automated run.
- No functional/product defects found. The case executed successfully end-to-end against the live system on the first attempt (upload → render → hover-reveal → download → integrity-verify → cleanup), with zero console errors/warnings throughout.

## Blocked Steps
None. All Setup steps and all 8 numbered case steps (plus Teardown) were executed end-to-end against the live system, using a disposable fixture created specifically for this case (conversation id 89, attachment fully purged by the end of the run).

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — this case joins `tests/artifacts.spec.ts` (module: artifacts, per `.agents/test-automation.yaml` and the EPIC's module-by-module delivery plan, GH#16). Per `.agents/testing.md` § Structure, WebQAPreExecuted-module specs are not assumed serial by default — TC-036 creates and cleans up its own fixture conversation/attachment and has no observed dependency on sibling artifacts-module cases (TC-030..035, TC-037..043) beyond read-only reuse of the same local `test-download-image.png` fixture file.
- Page object: this is a strong seed case for the planned `tests/pages/artifacts.page.ts` (already anticipated in `.agents/testing.md` § Structure) — encapsulate: direct-`setInputFiles` upload (bypassing the unreliable paperclip click), hover-reveal of `.attachActionButtons`, `waitForEvent('download')` capture + integrity check, and delete-with-purge-checkbox. TC-037 (delete) and any other artifacts-module case touching the same hover-action-button pattern should reuse this object rather than re-deriving it.
- Wait strategy: no `waitForTimeout` anywhere in this spec — `waitForResponse` for the create (`201`)/delete (`204`) attachment endpoints, `waitForEvent('download')` for the download itself (not a response wait, since it's a client-side blob re-save), and web-first `expect(...).toBeVisible()` polling for the rendered thumbnail and hover-revealed buttons.
- Analyst execution note (process/tooling, not product): ran via `playwright-cli -s=TC-036`, a genuinely isolated persistent-profile browser (confirmed via a fresh, unauthenticated Keycloak redirect at session start — no inherited cookies from any of the 13 parallel sibling analysts). Used a brand-new conversation rather than a shared one specifically to avoid the dispatch's flagged module-specific upload-collision risk; no cross-talk with sibling analysts was observed at any point.
- Per this batch's process fix, this AFS file is left **uncommitted/untracked** on disk — the artifacts-module implementer bundles it (and the other 13 cases' AFS files) into one PR alongside the test code, per `.agents/workflow.md` § Test delivery pattern.
