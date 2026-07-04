# Test Case: Upload a Large Image — Client-Side Size-Limit Rejection

## Metadata
- **TMS ID**: TC-033
- **Linked Story**: GH#16 (EPIC), GH#98 (tracking), GH#115 (size-limit-value clarification filed this session)
- **Priority**: l3
- **Environment Explored**: `https://next.elitea.ai/` (prod-like "Next" env)
- **Analyst**: qa-engineer (Sage), analyst slot, 2026-07-03
- **Status**: ready-for-automation

## IMPORTANT — case's specific numeric/per-model claim does not hold; core negative outcome does

TC-033 as authored expects a >5MB image (specifically framed as "exceeds
Anthropic's 5MB limit") to be rejected, with an error message mentioning
"5MB", "size limit", or "Anthropic". Live execution against `next.elitea.ai`
confirms the **core expected outcome** — an oversized raster image IS
rejected, immediately, client-side, with a clear and specific error message,
no attachment ever reaches the message or the Artifacts bucket. However,
the **exact numeric threshold and per-model framing are wrong**:

- Live enforced limit is a flat **3 MB**, not 5MB (Anthropic) or 20MB (OpenAI).
- The limit is **model-agnostic** — confirmed identical behavior (same
  message, same 3MB number) with `GPT-5.4-mini` (OpenAI) and `Anthropic
  Claude 4.5 Sonnet` (Anthropic) both active in the same conversation. There
  is no per-provider tiering on this deployment.
- Current official docs (`https://docs.elitea.ai/how-tos/chat-conversations/attach-files.md`)
  state a third, different number — a flat 5MB default (also model-agnostic,
  also disagreeing with the case's "20MB for OpenAI" claim, which doesn't
  appear in the current doc revision at all). Docs explicitly note the value
  is "configurable per ELITEA deployment," so 3MB may be this environment's
  intentional configured value — but three different sources (case, docs,
  live) each cite a different number, which is worth someone confirming
  intent on.

Per the reverse-masking guard, this is filed as a **clarification**
(**GH#115**), not a product defect — the feature functions correctly and
gives good, specific user feedback; only the exact number/per-model framing
in the case text and current docs is stale relative to the live deployment.
This AFS asserts the live, generalized contract (a size-and-message-shape
check), not a hardcoded "5MB"/"Anthropic" string, so automation won't
silently reverse-mask a future limit change either.

## Preconditions
- App accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- Test user `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` (role: `${TEST_USER}`) can authenticate via Keycloak SSO
- Local fixture file exists: `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-large-image.png` (confirmed live: 27,011,762 bytes = 25.76 MB — exceeds every candidate threshold in play: case's 5MB, docs' 5MB, live's 3MB, and even the case's own cited 20MB OpenAI tier)
- No toolkit pre-configuration required — same as TC-032/036: the chat composer's built-in "Attach Files" action is available by default in a direct-LLM conversation with no agent selected

## Test Data
### Existing (re-use)
- `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — from `.env` (`${TEST_USER}`)
- `${BASE_URL}` — from `.env`

### Must Generate (in test setup)
- None — the fixture file is static and pre-generated (gitignored,
  `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-large-image.png`,
  25.76 MB). The automation engineer should reference this fixture per the
  framework's fixtures convention (same flag as TC-032's AFS: no
  `tests/fixtures/files/`-style dir exists yet for the artifacts module).
- Message text: literal string `Test large file rejection` (case-supplied; sent as a plain text-only message once the attachment is rejected — see step 7 rationale)

### Must Clean Up (in teardown)
- None required to keep the test green (see § Cleanup) — the oversized
  attachment never reaches the server, so there is nothing uploaded to clean
  up. The plain-text follow-up message (step 7) is additive-only, same
  precedent as TC-001/TC-002.

## Test Steps

1. Navigate to `${BASE_URL}app/chat/`.
   - **Verify**: if redirected to `auth.elitea.ai` (Keycloak), authenticate — fill `getByRole('textbox', { name: 'Username or email' })` with `${ELITEA_EMAIL}`, `getByRole('textbox', { name: 'Password' })` with `${ELITEA_PASSWORD}`, click `getByRole('button', { name: 'Sign In' })`. Wait for URL to settle on `${BASE_URL}app/chat/**`. **Re-verify `window.location.href` after any navigation before trusting it** — this app's SPA router can report a stale/prior route for ~1s after `page.goto()`/reload resolves (confirmed live twice this session: a `reload()` and an `app/artifacts` navigation both briefly reported the previous route).
2. Dismiss the release-notes announcement banner if present: `getByRole('button', { name: 'close' })` scoped to the banner region (plain dismissible banner, not a `[role="dialog"]` modal — same drift already on file, GH#66/#67).
3. Create a fresh, isolated conversation (avoids colliding with other chat history / parallel test runs — confirmed live this session that simply reloading or dismissing the banner can silently land you back in a pre-existing conversation from a sibling test run): `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })`.
   - **Verify**: URL becomes `${BASE_URL}app/chat` (no id yet); composer is empty; "Hello, {user}!" greeting visible; "Attach Files (10 left)" shown in the `+` menu.
4. Open the attach-files menu — two clicks required: click `getByRole('button', { name: 'plus menu' })` first, then click `getByRole('menu').getByRole('button', { name: 'attach files' })` inside the opened menu (scoping to the menu is required — a second, disabled/non-actionable "attach files" button with the identical accessible name exists outside the menu at all times, causing a strict-mode violation if unscoped).
   - **Verify**: a native file chooser opens (Playwright: `page.waitForEvent('filechooser')` fires from the click).
5. Supply the oversized fixture to the file chooser: `fileChooser.setFiles('${TEST_DATA_DIR}/test-large-image.png')`.
   - **Verify — client-side rejection, immediate**: a toast/alert appears **within the same tick** (`t≈0ms` in this session's polling), matched via `getByRole('alert')` or `[role="alert"]`, with text matching `/exceeds the \d+(\.\d+)? MB image size limit/i` and containing the file name `test-large-image.png` and its actual computed size (`25.76 MB` in this run). **The toast auto-dismisses after ~2.5–3 seconds** — any assertion must not rely on a delayed snapshot/screenshot round-trip (confirmed live: a ~1–3s gap between the upload action and the next observation reliably misses it entirely; poll at ≤200ms intervals or assert synchronously in the same script step as the upload).
   - **Verify — no attachment accepted**: the "Attach Files (N left)" counter remains unchanged (**10 left**, not decremented to 9); no attachment chip renders above the composer; `document.body.innerText` does not contain the file name after the toast clears.
   - **Verify — no network round trip**: no `POST .../attachments/prompt_lib/{projectId}/{conversationId}` (or any attachments-related request) fires at all — confirmed via full request-log inspection this session. The rejection is pure client-side validation; the file is never sent to the server.
6. Type `Test large file rejection` into `getByTestId('chat-input')` (or `getByRole('textbox', { name: 'Type your message...' })`).
7. Click Send: `getByTestId('chat-send-button')` (dynamic accessible name `"send your question"` once text is present).
   - **Verify — navigation**: URL moves to `${BASE_URL}app/chat/{newConversationId}?name=Test+large+file+rejection`.
   - **Note**: because the oversized file was already rejected at step 5 (before Send), there is nothing attached to strip at Send time — this step confirms the **downstream** consequence (a plain text-only message sends normally, carrying no attachment), not a second independent rejection layer at Send. A future test that manages to get an oversized file *past* client-side selection (e.g. by mutating a valid attachment file in-place after selection, out of scope here) would be the only way to exercise a hypothetical server-side/Send-time size check — not explored this session; not needed since client-side validation already fully prevents the negative scenario the case cares about.
8. In the transcript, verify the sent user-message row: `getByTestId('chat-message-item')` (or the message-row locator confirmed project-wide) — contains the message text `Test large file rejection` and **no** attachment card (`getByTestId('chat-artifact-file-card')` should NOT be present in this row).
9. Navigate to `${BASE_URL}app/artifacts`, select the `attachments` bucket (`getByText('attachments', { exact: true })` in the bucket rail).
   - **Note — native `beforeunload` dialog**: navigating away from the just-sent conversation via `page.goto()` triggered a native (non-DOM) `beforeunload` confirm dialog in this session (register `page.on('dialog', d => d.accept())` **before** calling `goto()` — same mechanism already on file for dirty Agent/Pipeline forms, GH#68/`native_beforeunload_dialog_on_dirty_forms`; first time confirmed on a Chat route rather than a CRUD form).
   - **Verify**: Artifacts page loads; bucket totals (`Buckets: 3`, `Size: ~297 KB` in this run) are nowhere near the 25.76 MB fixture size — corroborating evidence the file was never stored.
10. In the `attachments` bucket's file/folder list (`getByTestId('artifacts-file-row')` or the folder-row equivalent), and via a full-page text search as a fallback, verify `test-large-image.png` does **not** appear anywhere.

## Expected Results
- Selecting an oversized raster image (25.76 MB, exceeding every threshold in play) triggers an **immediate, client-side** rejection — no server round trip.
- The rejection toast is specific and correct: names the exact file, its actual computed size, and the actual enforced threshold (`3 MB` on this deployment as of this run — see § IMPORTANT for the case/docs/live 3-way numeric mismatch, filed as GH#115).
- The oversized file never becomes an attachment: composer counter unchanged, no chip, no message-level attachment card, no Artifacts bucket entry.
- A subsequent plain-text message (no attachment) sends normally — confirms the rejection doesn't corrupt or block the composer for legitimate follow-up use.
- Zero console errors across the entire flow.

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Header/desc: "5 MB max (Anthropic) / 20 MB max (OpenAI)" | size limit is per-model-provider | — | GH#115 | **clarification** — live limit is a flat 3MB regardless of active model (confirmed on both an Anthropic and an OpenAI model); current official docs also disagree with both the case and live (flat 5MB, no tiering) |
| Setup 1: maximize browser window | all UI elements visible | n/a | n/a | out-of-scope — manual-execution artifact; Playwright's fixed viewport supersedes this |
| Setup 2: verify authenticated state | redirect-or-authenticated branch | step 1 | step 1 | asserted |
| Setup 3: close modals/overlays, `[role="dialog"]` | overlay dismissed | step 2 | step 2 | **clarification** — it's a dismissible banner, not a `[role="dialog"]` modal, same drift already tracked under GH#66/#67, not re-filed |
| Step 1: navigate to chat / open existing chat | chat page loads, input toolbar visible | steps 1, 3 | step 3 | asserted *(decomposed — AFS deliberately opens a fresh isolated conversation rather than reusing an existing thread, to avoid cross-test collision; confirmed live this session that reload/banner-dismiss can silently land you in a sibling test's leftover conversation)* |
| Step 2: wait 2s for stabilization | interface fully loaded | step 3 verify | step 3 | asserted *(translated to condition-wait, no fixed sleep)* |
| Step 3: click paperclip icon | file picker dialog opens | step 4 | step 4 | asserted *(decomposed into 2 clicks — "plus menu" then "attach files", scoped to the opened menu to avoid a strict-mode collision with a second identically-named disabled button)* |
| Step 4: select `test-large-image.png` (6MB per case text) via `setInputFiles()` | file is selected | step 5 | step 5 | asserted *(decomposed — actual fixture used is 25.76MB, not the case's stated "6MB"; both exceed every threshold in play so the negative-test intent is unaffected; used `fileChooser.setFiles()` after `page.waitForEvent('filechooser')`, not raw `setInputFiles()`, per the confirmed pattern from TC-032's AFS)* |
| Step 5: wait 2s, expect error OR thumbnail-then-fail-on-send | either error immediately or deferred failure | step 5 | step 5 | asserted — resolves to the immediate-error branch, not deferred; **the error toast is transient (~2.5-3s) and was missed by every naive 1-3s-round-trip check attempted this session** before switching to sub-200ms in-script polling — flagged prominently in step 5 for the implementer |
| Step 6: type message text (required) | text entered | step 6 | step 6 | asserted |
| Step 7: click Send, expect error (if not already shown) | error appears at Send time | steps 5, 7 | step 5 (already shown, pre-Send) | **clarification** — no second error at Send; the rejection already happened at selection time, Send simply proceeds with a plain text-only message since no attachment is present to strip |
| Step 8: wait for error (15s timeout) | error displayed prominently | step 5 | step 5 | asserted — resolves in <1s, not up to 15s; case's timeout budget is generous manual-execution language, translated to an immediate condition-wait |
| Step 9: verify error mentions 5MB/size limit/Anthropic | error is informative | step 5 | step 5 | **clarification** — error IS informative (names file + exact size + exact threshold) but says "3 MB", not "5MB", and never mentions "Anthropic" or any model name (confirmed model-agnostic wording) |
| Step 10: verify message NOT sent with large attachment | chat history unchanged re: the attachment | steps 5, 8 | step 8 | asserted — no attachment ever appears in any sent message; note a plain-text message DOES send in step 7 (case's own step 6/7 asked for this), just with zero attachment content |
| Step 11: navigate to `/app/artifacts` | artifacts page loads | step 9 | step 9 | asserted *(decomposed — a native `beforeunload` dialog intercepts this navigation, must be handled first, see step 9 note)* |
| Step 12: wait 10s with scroll trigger for lazy loading | all artifacts loaded | step 9 | step 9 | asserted *(translated to condition-wait; bucket totals check is a fast corroborating signal that doesn't require scrolling — only 3 buckets, ~297KB total)* |
| Step 13: verify file does NOT appear in artifacts | file absent | step 10 | step 10 | asserted |
| Expected Final State: "Upload rejected... clear error... file NOT uploaded... no message sent... error indicates 5MB/Anthropic" | see case | steps 5, 8–10 | steps 5, 8–10 | **partially asserted / partially clarification** — rejection, no-file-uploaded, and message-has-no-attachment all hold exactly as expected; the specific "5MB/Anthropic" wording does not (see GH#115) |
| Teardown: "No cleanup needed (file was not uploaded)" | n/a | — | — | asserted as-is — this premise DOES hold live (unlike TC-032/036's inverted premises), no correction needed |

### Axis 2 — Analyst additions

- Step 5 asserts the toast's message shape via regex (`/exceeds the \d+(\.\d+)? MB image size limit/i`) rather than a hardcoded "5 MB" substring — *added: given the confirmed 3-way mismatch between case text, current docs, and live behavior (GH#115), hardcoding either "5" or "3" makes this test a landmine for the next deployment-config change; a shape-based assertion validates the mechanism (specific, correctly-computed rejection message) without freezing today's specific number as if it were contractually guaranteed.*
- Step 5 also asserts the **absence** of any `attachments/prompt_lib` network request — *added: this is the strongest proof the rejection is genuinely client-side (fast, no wasted bandwidth/server load for an image that will never be accepted), not a slower server-side rejection that happens to also show a client toast. Distinguishes two very different implementations that would otherwise look identical from the UI alone.*
- Step 5's cross-model re-verification (same fixture against both `GPT-5.4-mini` and `Anthropic Claude 4.5 Sonnet`) — *added: the case's own premise is specifically about Anthropic-vs-OpenAI tiering, so directly falsifying that premise (same limit both ways) is the single most valuable additional check this AFS can make; not decomposed into the numbered steps above since it's a one-time confirmatory check for the clarification ticket, not part of the repeatable automated flow (automation only needs one model, since the limit is confirmed model-agnostic — no need to pay the cost of a model-switch step on every run).*
- Step 9's `beforeunload` dialog handling — *added: first confirmation of this native-dialog mechanism firing on a Chat route (previously only seen on dirty Agent/Pipeline CRUD forms, GH#68) — worth the implementer registering the handler defensively on any same-tab navigation away from an active chat conversation, not just forms.*
- Step 1's `window.location.href` re-verify caution — *added: confirmed twice live this session (once after `page.reload()`, once after a fresh `page.goto('/app/artifacts')`) that an immediate read of the current URL can report the previous route for roughly 1 second after the navigating call resolves. Not unique to this case, but not previously documented in `.agents/testing.md` — flagging here for the implementer and recommending it graduate to a project-wide confirmed-handle note.*

## Cleanup
No cleanup required — matches the case's own teardown premise exactly (unlike
TC-032/036 in this same module, whose "no cleanup needed" premises were
*false* because their files uploaded successfully; here the file genuinely
never reaches the server, so there is nothing to delete).

The one incidental side effect is the plain-text conversation created in
step 7 ("Test large file rejection") — additive-only, non-destructive, same
category as TC-001/TC-002's "chat messages persist, no teardown" precedent
already in `.agents/testing.md` § Test data strategy. No action needed.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| New/isolated conversation button | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` | — (confirmed project-wide handle, `.agents/testing.md`) |
| Announcement banner close | `getByRole('button', { name: 'close' })` (scope to the banner region) | `.filter({ has: page.getByText('Announcing ELITEA') })` on an ancestor |
| Attach-menu trigger ("+") | `getByRole('button', { name: 'plus menu' })` | `[aria-label="plus menu"]` |
| Attach Files menu item | `getByRole('menu').getByRole('button', { name: 'attach files' })` — **must be scoped to the opened menu**; an unscoped query matches 2 elements (a second, non-actionable "attach files" button exists outside the menu at all times) and throws a Playwright strict-mode violation | `getByRole('menu').getByText('Attach Files')` |
| Hidden file input(s) | `page.waitForEvent('filechooser')` + `fileChooser.setFiles()` around the attach-files click | direct `page.setInputFiles('input[type=file]', path)` also confirmed working this session (2 inputs present, no distinguishing attribute; the input's own `id` is timestamp-suffixed and is **regenerated on every menu open/close cycle** — never store/reuse an id across steps) |
| Size-limit rejection toast | `getByRole('alert')` (renders via `role="alert"`) matched on text `/exceeds the .* MB image size limit/i` | `page.locator('[role="alert"]')` — **auto-dismisses after ~2.5–3s, poll at ≤200ms or assert in the same script tick as the upload action, do not rely on a separate snapshot/screenshot round-trip** |
| Attach counter | `getByText(/Attach Files.*\d+ left/)` scoped to the `+` menu / tooltip | — |
| Message textarea | `getByTestId('chat-input')` | `getByPlaceholder('Type your message...')` / `getByRole('textbox', { name: 'Type your message...' })` |
| Send button | `getByTestId('chat-send-button')` | `getByRole('button', { name: 'send your question' })` — dynamic accessible name, only present once text is typed |
| Sent message row | `getByTestId('chat-message-item')` | — (confirmed project-wide handle) |
| Attachment chip, post-send (transcript) — asserting ABSENCE here | `getByTestId('chat-artifact-file-card')` | `getByText('${FILE_NAME}')` scoped to `getByTestId('chat-message-item')` |
| Model selector | `getByRole('button', { name: /^(GPT|Anthropic|Gemini)/ })` inside `group[name="Model Selector Menu"]` | `getByTestId` not observed on this control — role/name is the confirmed handle |
| Artifacts nav (sidebar) | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Artifacts' })` | `getByText('Artifacts')` in sidebar |
| Artifacts bucket row ("attachments") | `getByText('attachments', { exact: true })` scoped to the bucket rail | — |
| Artifacts file/folder row | `getByTestId('artifacts-file-row')` (or folder-row equivalent) `.filter({ hasText: '${FILE_NAME}' })` — expect zero matches | full-page `page.getByText('${FILE_NAME}').count() === 0` as a fallback sweep |

## Network Behavior
- **No** `POST .../attachments/prompt_lib/{projectId}/{conversationId}` fires at any point in this flow — confirmed via full request-log inspection immediately after the oversized file selection. This is the authoritative "was this a client-side-only rejection" signal; assert its absence, don't just assert UI absence-of-chip.
- The plain-text follow-up message (step 7) generates only the ordinary chat-send network activity already documented project-wide (no attachment-related payload).
- GA4 beacons (`google-analytics.com/g/collect`) fire ordinary `page_view`/navigation events throughout — **do not assert on these**, third-party/best-effort per existing project convention.

## Known Defects Found During Exploration
None found as a **functional product defect** — the size-limit rejection mechanism works correctly, quickly, and with a specific, accurate, user-friendly message; no data loss, no orphaned server-side state, no console errors. One case-premise/documentation drift found and filed as a clarification (not a bug, per the reverse-masking guard): **GH#115** — "case/docs cite a 5MB/20MB per-model image limit; live product enforces a flat 3MB limit."

## Blocked Steps
None.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` / `.agents/test-automation.yaml`. This case belongs in `tests/artifacts.spec.ts` (module: artifacts), batched with the rest of TC-030..043 per the module's one-PR delivery plan.
- **Transient toast, sub-200ms window matters**: the rejection toast auto-dismisses in ~2.5–3 seconds. Any implementation that does `setFiles()` then a separate `await expect(...).toBeVisible()` call should be fine (Playwright's web-first assertions poll fast enough), but avoid inserting a manual `screenshot()`/full-page `snapshot()` round trip between the upload action and the toast assertion — that pattern reliably missed the toast entirely during this analysis (confirmed 3 times before switching to synchronous polling).
- **Strict-mode collision on "attach files"**: always scope to `getByRole('menu')` first. The bare `getByRole('button', { name: 'attach files' })` matches 2 elements (one inside the composer's persistent tooltip-wrapped button, one inside the opened menu) and throws.
- **Large local fixture (25.76 MB)**: this file is shared across the module (also referenced by any sibling case exercising the same size-limit boundary). `setFiles()`/`setInputFiles()` on a file this size took ~1 second locally in this session — budget test timeouts accordingly, but no special handling needed beyond that; Playwright handles large local files natively, no chunking/streaming concerns since the file never leaves the client in this flow.
- **Model-agnostic assertion, one model is enough**: confirmed identical rejection behavior on both an OpenAI and an Anthropic model this session — the automated test does not need to repeat the upload across multiple models; asserting once (on whichever model is the account's default, `GPT-5.4-mini` at analysis time) fully covers the mechanism. Don't let the case's per-model framing push the implementer into unnecessary multi-model test parametrization.
- **`beforeunload` native dialog on navigating away from an active chat**: register `page.on('dialog', d => d.accept())` before calling `page.goto('${BASE_URL}app/artifacts')` in step 9 — first confirmation of this mechanism on a Chat route (previously only Agent/Pipeline CRUD forms, see `.agents/memory/qa-engineer/native_beforeunload_dialog_on_dirty_forms.md`).
- **`window.location.href` re-verify**: confirmed twice this session that an immediate read of the current URL can lag ~1s behind the actual route after `reload()` or `goto()` resolves. Prefer `page.waitForURL(...)` over a bare `page.url()`/`evaluate(() => location.href)` read immediately after navigation.
- Sibling cases TC-031/TC-032 (GH#96/#97) in this same module both found their own case-premise-vs-live-product mismatches (PDF and TXT both being *accepted* when the case expected rejection) — this case is the third data point in the same module suggesting the original WebQAPreExecuted case text for the `artifacts` module was authored against a different (likely older or aspirational) product/doc revision than what's live on `next.elitea.ai` today. Worth flagging to whoever owns the source case text for a batch review, rather than re-discovering this pattern case-by-case.
