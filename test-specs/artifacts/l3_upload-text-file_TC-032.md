# Test Case: Upload a Text File (.txt) via Chat — Documented Non-Image Attachment Path

## Metadata
- **TMS ID**: TC-032
- **Linked Story**: GH#16 (EPIC), GH#97 (tracking), GH#109 (case-premise clarification filed this session)
- **Priority**: l3
- **Environment Explored**: `https://next.elitea.ai/` (prod-like "Next" env)
- **Analyst**: qa-engineer (Sage), analyst slot, 2026-07-03
- **Status**: ready-for-automation

## IMPORTANT — this AFS inverts the original case's expected outcome

TC-032 as authored is a **negative** test: it expects `.txt` to be rejected
(file-picker filtered, or selected-then-rejected with an error, message not
sent, file absent from Artifacts). Live execution against `next.elitea.ai`
shows the opposite at every layer — file-picker accepts it, client shows no
validation error, server returns `201`, the message sends, the assistant
reads the file's content via a `read_multiple_files` tool call, and the file
persists in the Artifacts bucket. Current official docs
(`https://docs.elitea.ai/how-tos/chat-conversations/attach-files.md`)
confirm `.txt` is a documented, supported "non-image" attachment format
(indexed for semantic search, distinct from the image-only vision-input
tier). Per the reverse-masking guard, this is the **case text being stale**,
not a product defect — filed as a documentation clarification, **GH#109**,
not a bug. This AFS asserts the live/correct contract: a **successful**
upload-and-read round trip, not a rejection. Flagging for whoever owns
TC-032's source-case text to correct the premise (retarget at a genuinely
unsupported type, e.g. `.exe`/TC-038, or repurpose as a positive
non-image-attachment test — see GH#109's recommendation).

## Preconditions
- App accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- Test user `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` (role: `${TEST_USER}`) can authenticate via Keycloak SSO
- Local fixture file exists: `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-notes.txt` (45 bytes; content: `This is a test text file.\n\nLine 2.\nLine 3.`)
- No toolkit pre-configuration required — the chat composer's built-in "Attach Files" action is available by default; the case's "Artifact Toolkit is configured" precondition does not gate this path (confirmed live: attach worked with no separate toolkit setup)

## Test Data
### Existing (re-use)
- `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — from `.env` (`${TEST_USER}`)
- `${BASE_URL}` — from `.env`

### Must Generate (in test setup)
- None — the fixture file is static and pre-generated (gitignored,
  `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-notes.txt`).
  The automation engineer should copy/reference this fixture into whatever
  the framework's fixtures convention is (`.agents/testing.md` has no
  `tests/fixtures/files/`-style dir yet for the artifacts module — flag if
  one needs creating).
- Message text: literal string `Test text file upload attempt` (case-supplied, no uniqueness needed — this is an additive, non-destructive action; see Cleanup)

### Must Clean Up (in teardown)
- None required to keep the test green (see § Cleanup) — flagged as optional for account hygiene only.

## Test Steps

1. Navigate to `${BASE_URL}app/chat/`.
   - **Verify**: if redirected to `auth.elitea.ai` (Keycloak), authenticate — fill `getByRole('textbox', { name: 'Username or email' })` with `${ELITEA_EMAIL}`, `getByRole('textbox', { name: 'Password' })` with `${ELITEA_PASSWORD}`, click `getByRole('button', { name: 'Sign In' })`. Wait for URL to settle on `${BASE_URL}app/chat/**`.
2. Dismiss the release-notes announcement banner if present: `getByRole('button', { name: 'close' })` scoped to the banner region.
   - Note: this is a plain dismissible banner, **not** a `[role="dialog"]` modal as the case's Setup step 3 assumes — same drift already on file for the chat welcome overlay in GH#66/#67 (TC-051). Not re-filed here.
3. Create a fresh, isolated conversation (avoids colliding with other chat history / parallel test runs): `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })`.
   - **Verify**: URL becomes `${BASE_URL}app/chat` (no id yet); composer is empty; "Hello, {user}!" greeting visible.
4. Open the attach-files menu — **two clicks required**, not one: click `getByRole('button', { name: 'plus menu' })` first, THEN click `getByRole('button', { name: 'attach files' })` inside the menu that opens. (Clicking "attach files" directly, without opening "plus menu" first, times out — the element is present in the DOM but a sibling node intercepts pointer events until the menu is opened. See § Automation Hints.)
   - **Verify**: a native file chooser opens (Playwright: `page.waitForEvent('filechooser')` fires).
5. Supply the fixture to the file chooser: `fileChooser.setFiles('${TEST_DATA_DIR}/test-notes.txt')` (no OS-level picker filtering to defeat — Playwright's `setFiles` bypasses the OS dialog entirely; see § Automation Hints for what this means for Behavior-A-style assertions).
   - **Verify**: an attachment chip labeled `test-notes.txt` renders above the composer; the "Attach Files (N left)" counter decrements by exactly 1 (10 → 9 in this run).
6. Type `Test text file upload attempt` into `getByTestId('chat-input')`.
7. Click Send: `getByTestId('chat-send-button')` (accessible name is dynamic — `"send your question"` once text is present; see `.agents/testing.md` confirmed handle).
   - **Verify — network**: `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` resolves **201**, JSON body `[{"filepath": "/attachments/{uuid}/test-notes.txt", "file_size": 45}]`. Capture `{uuid}` from this response for step 11.
   - **Verify — navigation**: URL moves to `${BASE_URL}app/chat/{newConversationId}`.
8. In the transcript, verify the sent user-message row: `getByTestId('chat-message-item')` — contains the message text `Test text file upload attempt` AND an attachment card `getByTestId('chat-artifact-file-card')` showing `test-notes.txt`.
9. Wait for the assistant's reply to render: `getByTestId('chat-answer-content')`.
   - **Verify**: reply text contains the fixture's literal content (e.g. matches `/This is a test text file/`) — proof the file was actually read via the model's `read_multiple_files` tool, not silently dropped or ignored.
10. Verify no error/rejection UI anywhere in the transcript or composer (no toast, no inline error banner, no disabled-send state) — assert absence, don't just assert presence of the happy path.
11. Navigate to `${BASE_URL}app/artifacts`, select the `attachments` bucket (`getByText('attachments')` in the bucket rail), open the folder named `{uuid}` captured in step 7.
    - **Verify**: `getByTestId('artifacts-file-row')` lists a row for `test-notes.txt`, Type `Text`, Size `45 B`.
12. Assert zero console errors were logged across the whole flow (steps 1–11).

## Expected Results
- No rejection at any layer: file-picker `accept` filtering, client-side pre-send validation, server response, or chat transcript UI.
- `POST .../attachments/prompt_lib/{projectId}/{conversationId}` → `201`, response includes `filepath` and `file_size`.
- Sent message displays the attachment card; assistant's reply demonstrably quotes/uses the file's actual content.
- File appears in the Artifacts → `attachments` bucket, in a folder keyed by the upload's returned UUID.
- Zero console errors during the entire flow.

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| desc: "only image files supported... TXT... NOT supported" | attempting TXT upload triggers clear error/format restriction | — | GH#109 | **clarification** — live product + current official docs both confirm `.txt` is a documented, supported non-image attachment format; case premise is stale |
| Setup 1: maximize browser window | all UI elements visible | n/a | n/a | out-of-scope — manual-execution artifact; Playwright's fixed viewport (1920×1080 per `.agents/testing.md`) supersedes this |
| Setup 2: verify authenticated state | redirect-or-authenticated branch | step 1 | step 1 | asserted |
| Setup 3: close modals/overlays, `[role="dialog"]` | overlay dismissed | step 2 | step 2 | **clarification** — it's a dismissible banner, not a `[role="dialog"]` modal; same drift already tracked under GH#66/#67 (TC-051), not re-filed |
| Step 1: navigate to chat | chat page loads, input toolbar visible | steps 1, 3 | step 3 | asserted *(decomposed — case assumes reusing an existing thread; AFS deliberately opens a fresh isolated conversation to avoid cross-test collision, see step 3 rationale)* |
| Step 2: wait 2s for stabilization | interface fully loaded | step 3 verify | step 3 | asserted *(translated to a condition-wait per Hard Rule — no fixed sleep)* |
| Step 3: click paperclip icon | file picker dialog opens | step 4 | step 4 | asserted *(decomposed into 2 clicks — "plus menu" then "attach files" — the app's actual attach control is a 2-level menu, not a single paperclip button)* |
| Step 4: attempt to select `test-notes.txt`; Behavior A (filtered out) or B (selectable) | either A or B | step 5 | eval of `input[type=file]`'s `accept` attribute | **clarification** — neither pure A nor B: the `accept` attribute is NOT image-only (lists `.txt` + dozens of doc/code extensions alongside the 6 image types), so Behavior A's premise ("ideal UX" = image-only filter) doesn't hold; Behavior B partially holds (file IS selectable) but its follow-on ("validation fails after selection") does not |
| Step 5: select file via `setInputFiles()` | file appears selected | step 5 | step 5 | asserted |
| Step 6: type message text | text entered | step 6 | step 6 | asserted |
| Step 7: click Send | error message appears | steps 7–8 | step 7 (network 201), step 8 (transcript) | **clarification** — no error; message sends successfully with attachment |
| Step 8: verify error message visible | error displayed prominently | step 10 | step 10 | **clarification** — asserts absence of any error, since none occurs |
| Step 9: verify error mentions supported formats | error is informative | — | — | **clarification** — moot, no error exists to inspect |
| Step 10: verify message NOT sent | chat history unchanged | steps 7–9 | steps 7–9 | **clarification** — message WAS sent; transcript shows it plus a substantive assistant reply that reads the file |
| Step 11: navigate to `/app/artifacts` | artifacts page loads | step 11 | step 11 | asserted |
| Step 12: wait 10s with scroll trigger for lazy loading | all artifacts loaded | step 11 | step 11 | asserted *(translated to condition-wait; the `attachments` bucket had only 6 folder entries in this run — no scroll needed to reach the new one, but automation should still wait on the list's loaded state, not a fixed 10s)* |
| Step 13: verify `test-notes.txt` does NOT appear in artifacts | file absent | step 11 | step 11 | **clarification** — file IS present (`Text`, `45 B`) in `attachments/{uuid}/` |
| Expected Final State (Behavior A / B / "no errors persist") | see case | — | — | **clarification** — actual final state is a fully successful, silent, first-class upload; neither described behavior occurred |
| Teardown: "No cleanup needed (file was not uploaded...)" | n/a | — | — | **clarification** — the premise ("file was not uploaded") is false; see § Cleanup below for the corrected teardown guidance |

### Axis 2 — Analyst additions

- `step 9` asserts the assistant's reply actually quotes the file's content (not just that a reply exists) — *added: this is the strongest possible proof the attachment was genuinely processed server-side, not merely accepted-then-silently-dropped; a reply-exists-only assertion would be too weak to catch a regression where upload succeeds but the RAG/read pipeline silently fails.*
- `step 12` asserts zero console errors across the whole flow — *added: standard side-channel discipline; none observed in this run (0 errors / 0 warnings), but this guards a future regression.*
- Response-body shape assertion on the `201` (`filepath` + `file_size` fields) in step 7 — *added: the filepath's UUID segment is the only way to deterministically locate the file in the Artifacts UI in step 11 without a full-bucket text search; capturing it is necessary plumbing, not scope creep.*

## Cleanup
The uploaded file and the conversation it lives in are **not destructive** —
same category as TC-001/TC-002's "chat messages persist, no teardown" precedent
already documented in `.agents/testing.md` § Test data strategy. Recommended:
**no automated cleanup**, for consistency with that precedent and because 14
sibling analysts are concurrently mutating the same shared `${TEST_USER}`
account this session (see `.agents/testing.md` § Concurrency policy) — a
delete-after-test step here adds one more concurrent mutation for no
correctness benefit.

If strict account hygiene is later required:
1. Delete the conversation named `Test text file upload attempt` (conversation id captured at step 7).
2. Delete the artifact folder `attachments/{uuid}/` (from step 7's response) via the Artifacts UI's row-level delete action, or `DELETE` equivalent if the API exposes one (not explored this session — out of scope for TC-032).

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| New/isolated conversation button | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` | — (confirmed project-wide handle, `.agents/testing.md`) |
| Announcement banner close | `getByRole('button', { name: 'close' })` (scope to the banner region — this role/name pair also matches other close buttons on the page) | `getByRole('img')` inside the banner's close button, or scope via `.filter({ has: page.getByText('Announcing ELITEA') })` on an ancestor |
| Attach-menu trigger ("+") | `getByRole('button', { name: 'plus menu' })` | `[aria-label="plus menu"]` |
| Attach Files menu item | `getByRole('button', { name: 'attach files' })` **— only actionable after the plus-menu trigger above is clicked** | `getByText('Attach Files')` scoped to the opened menu/tooltip |
| Hidden file input(s) | not directly targetable — use Playwright's `page.waitForEvent('filechooser')` + `fileChooser.setFiles()`, not `input[type=file].setInputFiles()` | if direct targeting is ever needed: `input[type=file]` (2 present in DOM; no `id`/`label`/`data-testid` disambiguates them — CSS-only, last resort) |
| Message textarea | `getByTestId('chat-input')` | `getByPlaceholder('Type your message...')` |
| Send button | `getByTestId('chat-send-button')` | `getByRole('button', { name: 'send your question' })` — dynamic accessible name, only present once text is typed (`.agents/testing.md` confirmed) |
| Attachment chip, pre-send (composer) | `getByText('${FILE_NAME}')` scoped to the composer container | none found — **no `data-testid` on the pre-send chip** (see § Automation Hints gap) |
| Attachment chip, post-send (transcript) | `getByTestId('chat-artifact-file-card')` | `getByText('${FILE_NAME}')` scoped to `getByTestId('chat-message-item')` |
| Sent message row | `getByTestId('chat-message-item')` | — (confirmed project-wide handle, `.agents/testing.md`) |
| Assistant reply content | `getByTestId('chat-answer-content')` | — |
| Artifacts nav (sidebar) | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Artifacts' })` | `getByText('Artifacts')` in sidebar |
| Artifacts bucket row ("attachments") | `getByText('attachments', { exact: true })` scoped to the bucket rail | — (no `data-testid` per-bucket-row observed; only page-level `artifacts-*` testids exist) |
| Artifacts file list container | `getByTestId('artifacts-file-list')` | — |
| Artifacts file row | `getByTestId('artifacts-file-row').filter({ hasText: '${FILE_NAME}' })` | — |

## Network Behavior
- `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` — fires on Send click when an attachment is present; `multipart/form-data`; **201** on success; JSON body `[{"filepath": "/attachments/{uuid}/{fileName}", "file_size": <bytes>}]`. This is the authoritative "was it accepted" signal — assert on this, not just UI absence-of-error.
- GA4 beacons (`google-analytics.com/g/collect`) independently fire `attachment_uploaded` (`ep.attachment_type=text/plain`) and `toolkit_usage` (`ep.tool_name=read_multiple_files`) events — corroborating evidence only, **do not assert on these in automation** (third-party, best-effort, not a reliable test oracle).

## Known Defects Found During Exploration
None found as a **product defect**. One case-premise/documentation drift found and filed as a clarification (not a bug, per the reverse-masking guard): **GH#109** — "TC-032: case premise stale — TXT is a documented, supported chat-attachment format (not rejected)".

## Blocked Steps
None.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` / `.agents/test-automation.yaml`. This case belongs in `tests/artifacts.spec.ts` (module: artifacts), batched with the rest of TC-030..043 per the module's one-PR delivery plan.
- **Pointer-events gotcha**: `getByRole('button', { name: 'attach files' })` exists in the DOM at all times but is only clickable after `getByRole('button', { name: 'plus menu' })` is clicked first — attempting the direct click without opening the menu hangs in Playwright's actionability retry loop (a sibling node intercepts pointer events). Always sequence: click plus-menu → click attach-files.
- **File chooser, not raw `setInputFiles`**: use `page.waitForEvent('filechooser')` around the attach-files click, then `fileChooser.setFiles(...)`. There are 2 `input[type=file]` elements in the DOM with no distinguishing attributes; targeting them directly is fragile. The file-chooser event approach sidesteps disambiguating between the two.
- **No OS-level picker filtering to test.** Playwright's file-chooser API bypasses OS-level `accept`-attribute filtering entirely (this is a Playwright/CDP limitation, not app-specific) — so "Behavior A" (native picker restricting selection) can only be verified indirectly, by reading the `accept` attribute value via `page.evaluate`, never by attempting an actual OS-level blocked selection. This AFS captures the `accept` attribute's actual value (documented in the Coverage Map) as the closest automatable proxy for Behavior A.
- Out of scope for this AFS, flagged for awareness only: the `accept` attribute's extension list doesn't perfectly match the docs' image-tier list (missing `.bmp`, `.tiff/.tif`, `.ico`, `.apng`, `.avif`, `.css` versus what `attach-files.md` documents as supported) — docs explicitly say supported types are "configured dynamically per ELITEA deployment," so this reads as expected variance, not a contradiction. Not filed; noted here only so a future analyst on an image-format case (TC-030/033/035/etc.) doesn't need to rediscover it.
- Sibling case TC-031 (PDF rejection, GH#96) likely shares this exact stale "images only" premise — `.pdf` is also in the documented non-image supported tier. Flagged in GH#109 for whoever analyses TC-031; not independently verified here (out of scope for TC-032).
