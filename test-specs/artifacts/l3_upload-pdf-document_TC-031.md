# Test Case: Upload a PDF Document via Chat — Documented Non-Image Attachment Path

## Metadata
- **TMS ID**: TC-031
- **Linked Story**: GH#16 (EPIC), GH#96 (tracking), GH#112 (case-premise clarification, filed by an earlier dispatch of this same case that crashed on a transient rate limit before emitting an AFS)
- **Priority**: l3
- **Environment Explored**: `https://next.elitea.ai/` (prod-like "Next" env)
- **Analyst**: qa-engineer (Sage), analyst slot, 2026-07-03 (this session is a clean re-run of TC-031 — the prior dispatch died mid-flow after filing GH#112 but before writing this AFS)
- **Status**: ready-for-automation

## IMPORTANT — this AFS inverts the original case's expected outcome

TC-031 as authored is a **negative** test: it expects `.pdf` to be rejected
(file-picker filtered to images-only, or selected-then-rejected with an
error naming "JPEG, JPG, PNG, GIF, WebP", message not sent, file absent
from Artifacts). Live execution against `next.elitea.ai` shows the
opposite at every layer — file-picker's `accept` attribute is not
image-only and explicitly lists `.pdf`, the client shows no validation
error, the server returns `201`, the message sends, the assistant reads
the PDF's text content via a `read_multiple_files` tool call, and the
file persists in the Artifacts bucket. This exactly mirrors sibling case
TC-032's finding for `.txt` (GH#109) — both `.pdf` and `.txt` sit in the
same documented "non-image" attachment tier
(`https://docs.elitea.ai/how-tos/chat-conversations/attach-files.md`),
distinct from the image-only vision-input tier the case's premise
describes. Per the reverse-masking guard, this is the **case text being
stale**, not a product defect — already filed as a documentation
clarification, **GH#112**, not a bug. This AFS asserts the live/correct
contract: a **successful** upload-and-read round trip, not a rejection.

**Independent double confirmation**: this exact behavior was observed
twice, in two separate conversations, by two separate analyst dispatches
— GH#112's run (conversation 93, folder `74d517c5-65ca-4586-bb02-7f0c6113f4a5`)
and this session's fresh run (conversation 101, folder
`28be48fe-ab24-42d0-98f3-bc98e47cbfd2`). Both uploads returned `201`,
both reported `file_size: 606` (byte-identical to the local fixture),
and both elicited an assistant reply quoting the fixture's literal text.
Not a fluke — reproducible.

Flagging for whoever owns TC-031's source-case text to correct the
premise (retarget at a genuinely unsupported type, e.g. `.exe`/TC-038,
or repurpose as a positive non-image-attachment test — same
recommendation GH#109 made for TC-032).

## Preconditions
- App accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- Test user `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` (role: `${TEST_USER}`) can authenticate via Keycloak SSO
- Local fixture file exists: `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-document.pdf` (606 bytes, 1-page PDF v1.4; embedded text: "Test PDF Document - TC-031" / "PDFs not supported via chat upload" — an intentionally ironic fixture, given the finding below)
- No toolkit pre-configuration required — the chat composer's built-in "Attach Files" action is available by default; the case's "Artifact Toolkit is configured" precondition does not gate this path (confirmed live, same as TC-032)

## Test Data
### Existing (re-use)
- `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — from `.env` (`${TEST_USER}`)
- `${BASE_URL}` — from `.env`

### Must Generate (in test setup)
- None — the fixture file is static and pre-generated (gitignored,
  `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-document.pdf`).
  The automation engineer should copy/reference this fixture into
  whatever the framework's fixtures convention is (same gap flagged in
  TC-032's AFS — no `tests/fixtures/files/`-style dir yet for the
  artifacts module).
- Message text: literal string `Test PDF upload attempt` (case-supplied, no uniqueness needed — additive, non-destructive; see Cleanup)

### Must Clean Up (in teardown)
- None required to keep the test green (see § Cleanup) — flagged as optional for account hygiene only.

## Test Steps

1. Navigate to `${BASE_URL}app/chat/`.
   - **Verify**: if redirected to `auth.elitea.ai` (Keycloak), authenticate — fill `getByRole('textbox', { name: 'Username or email' })` with `${ELITEA_EMAIL}`, `getByRole('textbox', { name: 'Password' })` with `${ELITEA_PASSWORD}`, click `getByRole('button', { name: 'Sign In' })`. Wait for URL to settle on `${BASE_URL}app/chat/**`.
2. Dismiss the release-notes announcement banner if present: `getByRole('button', { name: 'close' })` scoped to the banner region.
   - Note: plain dismissible banner, **not** a `[role="dialog"]` modal as the case's Setup step 3 assumes — same drift already on file (GH#66/#67, TC-051; re-confirmed by TC-032). Not re-filed here.
3. Create a fresh, isolated conversation (avoids colliding with other chat history / parallel test runs sharing this account): `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })`.
   - **Verify**: URL becomes `${BASE_URL}app/chat` (no id yet); composer is empty; "Attach Files (10 left)" counter reads full.
4. Open the attach-files menu — **two clicks required**, not one: click `getByRole('button', { name: 'plus menu' })` first, THEN click `getByRole('button', { name: 'attach files' })` inside the menu that opens. (Same pointer-events gotcha TC-032 documented — clicking "attach files" directly, without opening "plus menu" first, hangs Playwright's actionability retry loop.)
   - **Verify**: a native file chooser opens (Playwright: `page.waitForEvent('filechooser')` fires).
5. Before supplying the file, capture the file input's `accept` attribute for the Coverage Map / Behavior-A proxy: `page.evaluate(() => [...document.querySelectorAll('input[type=file]')].map(i => i.accept))`.
   - **Observed value** (both `input[type=file]` elements, identical): `.txt,.py,.js,.ts,.java,.cpp,.c,.h,.hpp,.cs,.rb,.go,.php,.swift,.kt,.rs,.m,.scala,.pl,.sh,.bat,.lua,.r,.pas,.asm,.dart,.groovy,.sql,.yml,.yaml,.jsx,.tsx,.mjs,.cjs,.hs,.bash,.zsh,.pm,.toml,.ini,.cfg,.conf,.env,.md,.csv,.xlsx,.xls,.pdf,.docx,.doc,.json,.jsonl,.htm,.html,.xml,.ppt,.pptx,.eml,.msg,.png,.jpg,.jpeg,.gif,.webp,.svg` — `.pdf` present, list is not image-only.
6. Supply the fixture to the file chooser: `fileChooser.setFiles('${TEST_DATA_DIR}/test-document.pdf')`.
   - **Verify**: an attachment chip labeled `test-document.pdf` renders above the composer; the "Attach Files (N left)" counter decrements by exactly 1 (10 → 9, confirmed live).
7. Type `Test PDF upload attempt` into `getByTestId('chat-input')` (rendered as `getByRole('textbox', { name: 'Type your message...' })` pre-focus).
8. Click Send: `getByTestId('chat-send-button')` (accessible name is dynamic — `"send your question"` once text is present; `.agents/testing.md` confirmed handle).
   - **Verify — network**: `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` resolves **201**, JSON body `[{"filepath": "/attachments/{uuid}/test-document.pdf", "file_size": 606}]`. Capture `{uuid}` from this response for step 12. (This session: `filepath: /attachments/28be48fe-ab24-42d0-98f3-bc98e47cbfd2/test-document.pdf`, `file_size: 606` — byte-identical to the local fixture.)
   - **Verify — navigation**: URL moves to `${BASE_URL}app/chat/{newConversationId}`.
9. In the transcript, verify the sent user-message row: `getByTestId('chat-message-item')` — contains the message text `Test PDF upload attempt` AND an attachment card `getByTestId('chat-artifact-file-card')` showing `test-document.pdf`.
10. Wait for the assistant's reply to render: `getByTestId('chat-answer-content')`.
    - **Verify**: reply text contains the fixture's literal embedded content (e.g. matches `/Test PDF Document/` and/or `/PDFs not supported via chat upload/`) — proof the PDF was actually parsed and read via the model's `read_multiple_files` tool, not silently dropped or ignored. Observed live reply: *"I can see the embedded PDF text. It contains: Test PDF Document - TC-031; PDFs not supported via chat upload."*
11. Verify no error/rejection UI anywhere in the transcript or composer (no toast, no inline error banner, no disabled-send state) — assert absence, don't just assert presence of the happy path.
12. Navigate to `${BASE_URL}app/artifacts`, select the `attachments` bucket (`getByText('attachments', { exact: true })` in the bucket rail), open the folder named `{uuid}` captured in step 8.
    - **Verify**: `getByTestId('artifacts-file-row')` lists a row for `test-document.pdf`, Type `PDF Document`, Size `606 B`.
13. Assert zero console errors were logged across the whole flow (steps 1–12) that are attributable to the app itself (not to test-harness-only probes — see § Known Defects for a note on a self-induced 404 observed during exploration, not present in the AFS's own step sequence).

## Expected Results
- No rejection at any layer: file-picker `accept` filtering, client-side pre-send validation, server response, or chat transcript UI.
- `POST .../attachments/prompt_lib/{projectId}/{conversationId}` → `201`, response includes `filepath` and `file_size` (606, matching the fixture's byte size exactly).
- Sent message displays the attachment card; assistant's reply demonstrably quotes/uses the file's actual embedded text.
- File appears in the Artifacts → `attachments` bucket, in a folder keyed by the upload's returned UUID, Type `PDF Document`, Size `606 B`.
- Zero console errors during the entire flow (excluding self-induced test-harness probes outside the AFS's own step sequence).

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| desc: "only image files... PDF NOT supported" | attempting PDF upload triggers clear error/format restriction | — | GH#112 | **clarification** — live product + current official docs both confirm `.pdf` is a documented, supported non-image attachment format; case premise is stale (same finding pattern as TC-032/GH#109 for `.txt`) |
| Setup 1: maximize browser window | all UI elements visible | n/a | n/a | out-of-scope — manual-execution artifact; Playwright's fixed viewport supersedes this |
| Setup 2: verify authenticated state | redirect-or-authenticated branch | step 1 | step 1 | asserted |
| Setup 3: close modals/overlays, `[role="dialog"]` | overlay dismissed | step 2 | step 2 | **clarification** — it's a dismissible banner, not a `[role="dialog"]` modal; drift already tracked (GH#66/#67, re-confirmed TC-032) |
| Step 1: navigate to chat | chat page loads, input toolbar visible | steps 1, 3 | step 3 | asserted *(decomposed — case assumes reusing an existing thread; AFS deliberately opens a fresh isolated conversation to avoid cross-test collision)* |
| Step 2: wait 2s for stabilization | interface fully loaded | step 3 verify | step 3 | asserted *(translated to a condition-wait — no fixed sleep)* |
| Step 3: click paperclip icon | file picker dialog opens | step 4 | step 4 | asserted *(decomposed into 2 clicks — "plus menu" then "attach files" — the app's actual attach control is a 2-level menu, not a single paperclip button)* |
| Step 4: attempt to select `test-document.pdf`; Behavior A (filtered out) or B (selectable) | either A or B | steps 5–6 | step 5 (`accept` attribute eval), step 6 (chooser accepts file) | **clarification** — neither pure A nor B holds: `accept` is not image-only (lists `.pdf` alongside dozens of doc/code extensions), so Behavior A's premise doesn't hold; Behavior B partially holds (file IS selectable) but its follow-on ("validation fails after selection") does not |
| Step 5: select file via `setInputFiles()` | file appears selected | step 6 | step 6 | asserted |
| Step 6: type message text | text entered | step 7 | step 7 | asserted |
| Step 7: click Send | error message appears | steps 8–9 | step 8 (network 201), step 9 (transcript) | **clarification** — no error; message sends successfully with attachment |
| Step 8: verify error message visible | error displayed prominently | step 11 | step 11 | **clarification** — asserts absence of any error, since none occurs |
| Step 9: verify error mentions supported formats | error is informative | — | — | **clarification** — moot, no error exists to inspect |
| Step 10: verify message NOT sent | chat history unchanged | steps 8–10 | steps 8–10 | **clarification** — message WAS sent; transcript shows it plus a substantive assistant reply that reads the file's embedded text |
| Step 11: navigate to `/app/artifacts` | artifacts page loads | step 12 | step 12 | asserted |
| Step 12: wait 10s with scroll trigger for lazy loading | all artifacts loaded | step 12 | step 12 | asserted *(translated to condition-wait; the `attachments` bucket's folder list rendered fully without a scroll trigger in this run — automation should still wait on the list's loaded state, not a fixed 10s)* |
| Step 13: verify `test-document.pdf` does NOT appear in artifacts | file absent | step 12 | step 12 | **clarification** — file IS present (`PDF Document`, `606 B`) in `attachments/{uuid}/` |
| Expected Final State (Behavior A / B / "no errors persist") | see case | — | — | **clarification** — actual final state is a fully successful, silent, first-class upload; neither described behavior occurred |
| Teardown: "No cleanup needed (file was not uploaded...)" | n/a | — | — | **clarification** — the premise ("file was not uploaded") is false; see § Cleanup below for the corrected teardown guidance |

### Axis 2 — Analyst additions

- `step 5` captures the file input's `accept` attribute value explicitly, before selection — *added: this is the closest automatable proxy for "Behavior A" (native picker restricting selection), since Playwright's `setFiles` bypasses OS-level `accept` filtering entirely (a CDP/Playwright limitation, not app-specific, already documented in TC-032's Automation Hints). Recording the actual value lets a reviewer see for themselves that `.pdf` was never filtered, rather than taking the analyst's word for it.*
- `step 10` asserts the assistant's reply actually quotes the file's embedded text (not just that a reply exists) — *added: strongest available proof the attachment was genuinely processed server-side via `read_multiple_files`, not merely accepted-then-silently-dropped.*
- `step 13` asserts zero console errors across the whole flow — *added: standard side-channel discipline. One console error WAS observed during this exploration session, but it was self-induced (a manual `GET` probe this analyst issued against the POST-only `/attachments/...` endpoint to double-check the response body, unrelated to the actual AFS step sequence) — see § Known Defects for the full explanation. Automation following the AFS's own steps verbatim will not reproduce it.*
- Response-body shape assertion on the `201` (`filepath` + `file_size` fields) in step 8 — *added: the filepath's UUID segment is the only way to deterministically locate the file in the Artifacts UI in step 12 without a full-bucket text search; capturing it is necessary plumbing, not scope creep.*
- Byte-size cross-check (`file_size: 606` matches the local fixture's actual size) — *added: cheap, high-value integrity assertion that the server stored the exact bytes sent, not a truncated/corrupted upload.*

## Cleanup
The uploaded file and the conversation it lives in are **not destructive** —
same category as TC-001/TC-002's "chat messages persist, no teardown"
precedent in `.agents/testing.md` § Test data strategy, and the same
precedent TC-032 established for its own `.txt` upload. Recommended:
**no automated cleanup**, for consistency and because multiple sibling
analysts are concurrently mutating the same shared `${TEST_USER}` account
this session (`.agents/testing.md` § Concurrency policy) — a
delete-after-test step here adds one more concurrent mutation for no
correctness benefit. Note: this account now carries **two** PDF-upload
conversations named "Test PDF upload attempt" (GH#112's run, conversation
93, and this session's fresh run, conversation 101) — both are harmless
duplicates, not a collision, since each was an isolated fresh conversation
per the analyst-isolation convention.

If strict account hygiene is later required:
1. Delete the conversation(s) named `Test PDF upload attempt` (conversation ids 93 and 101).
2. Delete the artifact folders `attachments/74d517c5-65ca-4586-bb02-7f0c6113f4a5/` and `attachments/28be48fe-ab24-42d0-98f3-bc98e47cbfd2/` via the Artifacts UI's row-level delete action, or `DELETE` equivalent if the API exposes one (not explored this session — out of scope, same as TC-032).

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| New/isolated conversation button | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` | — (confirmed project-wide handle, `.agents/testing.md`) |
| Announcement banner close | `getByRole('button', { name: 'close' })` (scope to the banner region) | `getByRole('img')` inside the banner's close button, or `.filter({ has: page.getByText('Announcing ELITEA') })` on an ancestor |
| Attach-menu trigger ("+") | `getByRole('button', { name: 'plus menu' })` | `[aria-label="plus menu"]` |
| Attach Files menu item | `getByRole('button', { name: 'attach files' })` **— only actionable after the plus-menu trigger above is clicked** | `getByText('Attach Files')` scoped to the opened menu/tooltip |
| Hidden file input(s) | not directly targetable — use Playwright's `page.waitForEvent('filechooser')` + `fileChooser.setFiles()`, not `input[type=file].setInputFiles()` | if direct targeting is ever needed: `input[type=file]` (2 present in DOM, identical `accept` value, no `id`/`label`/`data-testid` disambiguates them — CSS-only, last resort) |
| Message textarea | `getByTestId('chat-input')` | `getByPlaceholder('Type your message...')` / `getByRole('textbox', { name: 'Type your message...' })` |
| Send button | `getByTestId('chat-send-button')` | `getByRole('button', { name: 'send your question' })` — dynamic accessible name, only present once text is typed |
| Attachment chip, pre-send (composer) | `getByText('${FILE_NAME}')` scoped to the composer container | none found — no `data-testid` on the pre-send chip (same gap TC-032 flagged) |
| Attachment chip, post-send (transcript) | `getByTestId('chat-artifact-file-card')` | `getByText('${FILE_NAME}')` scoped to `getByTestId('chat-message-item')` |
| Sent message row | `getByTestId('chat-message-item')` | — (confirmed project-wide handle) |
| Assistant reply content | `getByTestId('chat-answer-content')` | — |
| Artifacts nav (sidebar) | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Artifacts' })` | `getByText('Artifacts')` in sidebar |
| Artifacts bucket row ("attachments") | `getByText('attachments', { exact: true })` scoped to the bucket rail | — (no `data-testid` per-bucket-row observed) |
| Artifacts folder row (by UUID) | `getByText('${UUID}', { exact: true })` scoped to the bucket's folder tree/list | — (folders keyed by UUID, no other stable identifier observed) |
| Artifacts file list container | `getByTestId('artifacts-file-list')` | — |
| Artifacts file row | `getByTestId('artifacts-file-row').filter({ hasText: '${FILE_NAME}' })` | — |

## Network Behavior
- `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` — fires on Send click when an attachment is present; `multipart/form-data`; **201** on success; JSON body `[{"filepath": "/attachments/{uuid}/{fileName}", "file_size": <bytes>}]`. This is the authoritative "was it accepted" signal — assert on this, not just UI absence-of-error. (This session: `21/101` → `201`, `{"filepath": "/attachments/28be48fe-ab24-42d0-98f3-bc98e47cbfd2/test-document.pdf", "file_size": 606}`.)
- GA4 beacons (`google-analytics.com/g/collect`) independently fire `attachment_uploaded` (`ep.attachment_type=application/pdf`, `ep.upload_source=chat`) and `toolkit_usage` (`ep.toolkit_name=Attachments`, `ep.toolkit_type=artifact`, `ep.tool_name=read_multiple_files`) events — corroborating evidence only, **do not assert on these in automation** (third-party, best-effort, not a reliable test oracle). Same pattern TC-032 observed for `.txt`.

## Known Defects Found During Exploration
None found as a **product defect**. One case-premise/documentation drift
found and filed as a clarification (not a bug, per the reverse-masking
guard): **GH#112** — "TC-031: case-text drift — PDF (and most document
types) IS supported via chat attachment, not rejected" (filed by an
earlier, crashed dispatch of this same case; independently re-confirmed
live in this session with a fresh conversation and a second upload,
byte-identical `file_size: 606`).

**Test-harness note, not a product defect**: during exploration this
analyst issued a manual `fetch(..., { method: 'GET' })` probe against
`/api/v2/elitea_core/attachments/prompt_lib/21/101` (a POST-only
endpoint) to inspect the response body via an alternate path; this
self-induced call 404'd and surfaced as a console error in that browser
session. It is **not** part of this AFS's step sequence (steps 1–13
above use only the actions the case itself specifies) and will not
reproduce when an implementer follows the AFS verbatim. Noted here only
so a reviewer who spots "1 console error" in this session's raw
evidence doesn't mistake it for an app-side regression.

## Blocked Steps
None.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` / `.agents/test-automation.yaml`. This case belongs in `tests/artifacts.spec.ts` (module: artifacts), batched with the rest of TC-030..043 per the module's one-PR delivery plan.
- **Pointer-events gotcha**: `getByRole('button', { name: 'attach files' })` exists in the DOM at all times but is only clickable after `getByRole('button', { name: 'plus menu' })` is clicked first — attempting the direct click without opening the menu hangs in Playwright's actionability retry loop (a sibling node intercepts pointer events). Always sequence: click plus-menu → click attach-files. (Same gotcha TC-032 documented; re-confirmed live in this session.)
- **File chooser, not raw `setInputFiles`**: use `page.waitForEvent('filechooser')` around the attach-files click, then `fileChooser.setFiles(...)`. There are 2 `input[type=file]` elements in the DOM with identical `accept` values and no distinguishing attributes; targeting them directly is fragile. The file-chooser event approach sidesteps disambiguating between the two.
- **No OS-level picker filtering to test.** Playwright's file-chooser API bypasses OS-level `accept`-attribute filtering entirely (Playwright/CDP limitation, not app-specific) — "Behavior A" (native picker restricting selection) can only be verified indirectly by reading the `accept` attribute's actual value via `page.evaluate`, never by attempting an actual OS-level blocked selection. This AFS captures that value (step 5) as the closest automatable proxy.
- This case shares essentially its entire automation shape with TC-032 (`test-specs/artifacts/l3_upload-text-file_TC-032.md`) — same menu-open sequence, same file-chooser pattern, same network assertion shape, same Artifacts-bucket verification. An implementer building `tests/artifacts.spec.ts` should strongly consider a shared helper (e.g. `attachFileAndSend(page, filePath, messageText)`) parametrized by fixture path and expected extracted-text substring, rather than duplicating the full step sequence per format. Flag this to Tal if a third non-image-format case (beyond TC-031/TC-032) turns up in the same module — three near-identical sequences is this project's own extraction threshold (`.agents/testing.md` "Hard Rule 7's 3rd-repetition").
- Two upload runs of this exact case now exist in the shared test account (conversations 93 and 101, see § Cleanup) — an implementer writing the actual `.spec.ts` should create its own fresh conversation per the AFS's step 3, not reuse either manual-exploration conversation.
