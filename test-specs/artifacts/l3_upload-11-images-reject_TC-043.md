# Test Case: Attempt to Upload 11 Images — Verify Rejection (Negative Boundary)

## Metadata
- **TMS ID**: TC-043
- **Linked Story**: GH#16 (EPIC), GH#108 (own tracking issue)
- **Priority**: l3
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (Sage), analyst slot, `test-case-analysis`, 2026-07-03 — **clean re-run**. A prior dispatch for this exact case died on a transient server-side rate limit before producing an AFS; it left one orphaned evidence screenshot (`test-results/screenshots/TC-043-step05-10-attached-11th-truncated.png`, no accompanying AFS or written analysis). That screenshot visually matches this run's own independently-reproduced result byte-for-byte in composition (same 2-chip + "+8" overflow layout), so it's kept as corroborating evidence, but every finding in this AFS was re-derived fresh, not inherited.
- Isolated `playwright-cli -s=TC-043` session with a dedicated `--profile` directory (own pid 44401, own on-disk profile — not the shared default MCP profile) — defense-in-depth per `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`; `.mcp.json`'s `--isolated` flag is the primary mitigation this session. Confirmed fresh (Keycloak login bounce on first navigate, no inherited cookies). Re-verified `window.location.href` after every navigation.
- **Own new conversation created** per dispatch instruction (this case shares `test-batch-01..10.png` filenames with the concurrently-running TC-042 sibling analyst) — never reused an existing thread for the authoritative run.
- **Status**: ready-for-automation

## IMPORTANT — confirms the case's own documented "Behavior B" fallback almost exactly, with one nuance

The case allows two outcomes: **Behavior A** (blocking error message, nothing sent) or **Behavior B** (silent/automatic truncation to 10, message sent with 10 images, 11th absent everywhere). Live execution shows **Behavior B, confirmed at every layer** (DOM/composer state, network, transcript UI, and server-side Artifacts persistence) — this is a **pass**, not a defect:

- Selecting all 11 files (`fileChooser`/`setInputFiles` with the 11-path array) results in exactly **10** files retained by the composer, in file-selection order (`test-batch-01.png` .. `test-batch-10.png`); `test-batch-11.png` is dropped before it is ever added to the DOM, the network, or storage.
- The composer's ambient state changes the instant the cap is hit: the always-visible "Attach Files (N left)" label becomes **"Max 10 attachments"**, its button becomes `disabled`, and the plus-menu's own "Attach Files" menu item switches to **"0 left"** and is also `disabled`. This **is** real, if passive, user feedback — distinct from and stronger than the complete silence documented for the unrelated unsupported-file-type case (GH#113, TC-038), where selecting a rejected type produces **zero** DOM change at all (no counter movement, no disabled state). This case's ambient disabled-state satisfies the case's own Behavior-B allowance ("11th image rejected silently **or with warning**") — the persistent "Max 10 attachments" text and disabled controls constitute the "warning," even though no transient toast/snackbar was observed.
- **No blocking dialog or toast ever appears** (Behavior A does not occur) — checked the full page snapshot immediately after truncation (well within ~1-2s) for `[role=alert]`, `[role=status]`, and toast/snackbar-class elements: none present. Console: 0 errors / 0 warnings throughout.
- Sending proceeds normally with exactly 10 attachments. All 10 succeed server-side (`201` each); the transcript renders exactly 10 thumbnails; the Artifacts bucket persists exactly 10 files (UI pagination footer explicitly reads **"1 - 10 of 10"** — the single most authoritative confirmation available).

No new tracker issue filed. This is a genuine pass matching the case's own accepted fallback outcome, not case-text drift and not a product defect — checked GH#108/#16 comments and the sibling GH#113 (TC-038)/GH#109/GH#112 (TC-032/TC-031) clarification tickets before writing this AFS; none apply here since the app's behavior matches the case's own stated expectations.

## Preconditions
- App accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- Test user `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` (role: `${TEST_USER}`) can authenticate via Keycloak SSO
- 11 local fixture files exist: `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-batch-01.png` .. `test-batch-11.png` (all valid PNGs, well under 1 MB — actual sizes 6.9–10.9 KB each, confirmed via `stat`)
- No toolkit pre-configuration required — same as TC-032/TC-036/TC-038: the chat composer's built-in "Attach Files" action is available by default
- **Shared-fixture caution**: `test-batch-01.png`..`test-batch-10.png` are also used by sibling cases TC-039 and TC-042 (both "max 10" boundary variants). Always run this case in its **own fresh conversation** (never reuse an existing thread) to avoid cross-case attachment-count contamination when run concurrently with siblings against the same shared `${TEST_USER}` account.

## Test Data
### Existing (re-use)
- `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — from `.env` (`${TEST_USER}`)
- `${BASE_URL}` — from `.env`
- Fixtures: `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-batch-01.png` .. `test-batch-11.png` (static, pre-generated, gitignored)

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
| test-batch-11.png (must be absent from the final result) | 7925 |

### Must Generate (in test setup)
- Message text: literal string `Test batch upload of 11 images - expect rejection` (case-supplied)
- None else — fixtures are static

### Must Clean Up (in teardown)
- None required to keep the test green (see § Cleanup) — sending a 10-image message is non-destructive, same category as TC-001/TC-002's documented no-teardown precedent.

## Test Steps

1. Navigate to `${BASE_URL}app/chat/`.
   - **Verify**: if redirected to `auth.elitea.ai` (Keycloak), authenticate — fill `getByRole('textbox', { name: 'Username or email' })` with `${ELITEA_EMAIL}`, `getByRole('textbox', { name: 'Password' })` with `${ELITEA_PASSWORD}`, click `getByRole('button', { name: 'Sign In' })`. Wait for URL to settle on `${BASE_URL}app/chat/**`.
   - **Note**: the bare `/app/chat/` route auto-redirects server-side to the account's most-recently-active conversation (confirmed benign, documented account behavior — see `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`). Do not treat this redirect as a browser-isolation failure; it is expected and irrelevant once step 3 creates a fresh conversation.
2. Dismiss the release-notes announcement banner if present: `getByRole('button', { name: 'close' })` scoped to the banner region.
3. Create a fresh, isolated conversation (mandatory for this case — see § Preconditions shared-fixture caution): `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })`.
   - **Verify**: URL becomes `${BASE_URL}app/chat` (no id yet); composer empty; "Attach Files (10 left)" baseline visible.
4. Open the attach-files menu — two clicks required: click `getByRole('button', { name: 'plus menu' })` first, then click `getByRole('button', { name: 'attach files' })` inside the menu that opens (same two-step sequence confirmed across TC-032/TC-036/TC-038 — clicking "attach files" directly without opening the plus-menu first hangs Playwright's actionability retry loop).
   - **Verify**: a native file chooser opens (Playwright: `page.waitForEvent('filechooser')` fires).
5. Supply **all 11** fixtures to the file chooser in one call: `fileChooser.setFiles([...11 absolute paths, test-batch-01.png through test-batch-11.png, in that order])`.
   - **Verify — composer chips**: exactly 2 chips render inline (`test-batch-01.png`, `test-batch-02.png`) plus a `getByRole('button', { name: 'Show more files' })` overflow control reading **"+8"** (2 + 8 = 10 total attached — confirmed, not 11).
   - **Verify — overflow list**: click "Show more files"; the revealed menu lists exactly `test-batch-03.png` through `test-batch-10.png` (8 items) — `test-batch-11.png` is **absent** from this list.
   - **Verify — ambient disabled state**: the static composer control flips from `"Attach Files (10 left)"` to **`"Max 10 attachments"`**, its `attach files` button becomes `disabled`; the plus-menu's own `attach files` menu item shows **`"0 left"`** and is also `disabled`.
   - **Verify — no blocking UI**: no `[role="dialog"]`, `[role="alert"]`, or `[role="status"]` element appears; console remains at 0 errors / 0 warnings.
6. Type `Test batch upload of 11 images - expect rejection` into `getByTestId('chat-input')` (or `getByRole('textbox', { name: 'Type your message...' })` pre-type).
   - **Verify**: `getByTestId('chat-send-button')` becomes enabled (dynamic accessible name `"send your question"` once text is present).
7. Click Send: `getByTestId('chat-send-button')`.
   - **Verify — network**: exactly **10** `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` requests fire, each resolving **201**, one per retained file (`test-batch-01.png` .. `test-batch-10.png`); response body shape `[{"filepath": "/attachments/{uuid}/{fileName}", "file_size": <bytes>}]`, all sharing the **same** `{uuid}` folder segment. Assert the count is exactly 10, not 11 and not fewer — this is the authoritative "was the 11th ever sent" signal, stronger than any UI-layer check.
   - **Verify — navigation**: URL moves to `${BASE_URL}app/chat/{newConversationId}`.
8. In the transcript, verify the sent user-message row: `getByTestId('chat-message-item')` — contains the message text and exactly **10** image elements/attachment thumbnails (`img` elements or `getByTestId('chat-artifact-file-card')`, whichever the module's confirmed handle resolves to — see § Concrete Handles), named `test-batch-01.png` through `test-batch-10.png`. Assert `test-batch-11.png` does **not** appear anywhere in the row.
9. Wait for the assistant's reply to render: `getByTestId('chat-answer-content')` (assert presence only — content is LLM-generated/non-deterministic).
10. Navigate to `${BASE_URL}app/artifacts`, select the `attachments` bucket (`getByText('attachments', { exact: true })` in the bucket rail), open the folder named `{uuid}` captured in step 7.
    - **Verify**: the file-list pagination footer reads **"1 - 10 of 10"** (`getByText(/1\s*-\s*10 of 10/)` or the equivalent structured count if the implementer prefers reading it from the underlying `GET` response's `total` field instead of the UI string) — the strongest, most direct confirmation that exactly 10 files persisted.
    - **Verify**: the file list contains rows for `test-batch-01.png` through `test-batch-10.png` and **no** `test-batch-11.png` row.
11. Assert zero console errors were logged across the whole flow (steps 1–10).

## Expected Results
- Selecting 11 files results in exactly 10 retained (in original selection order); the 11th is dropped before reaching the DOM, network, or storage layer.
- Composer surfaces ambient (non-blocking) feedback: `"Attach Files (10 left)"` → `"Max 10 attachments"`, attach controls disabled at cap — no blocking dialog/toast.
- Exactly 10 `POST .../attachments/prompt_lib/{projectId}/{conversationId}` calls fire, all `201`.
- Sent message transcript shows exactly 10 thumbnails; `test-batch-11.png` never appears.
- Artifacts → `attachments/{uuid}/` bucket persists exactly 10 files ("1 - 10 of 10").
- Zero console errors during the entire flow.

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| header: "Max 10 images per message... 11+ should error or auto-truncate" | boundary enforced | steps 5–10 | steps 5, 7, 10 | asserted — Behavior B (auto-truncate) confirmed at every layer |
| Setup 1: maximize browser window | all UI elements visible | n/a | n/a | out-of-scope — manual-execution artifact; Playwright's fixed viewport supersedes this |
| Setup 2: verify authenticated state | redirect-or-authenticated branch | step 1 | step 1 | asserted |
| Setup 3: close modals/overlays, `[role="dialog"]` | overlay dismissed | step 2 | step 2 | **clarification** — it's a dismissible banner, not a `[role="dialog"]` modal; same drift already tracked under GH#66/#67 (TC-051) and reconfirmed in TC-032/TC-036/TC-038, not re-filed here |
| Step 1: navigate to chat | chat page loads, input toolbar visible | steps 1, 3 | step 3 | asserted *(decomposed — case assumes reusing an existing thread; AFS deliberately opens a fresh isolated conversation to avoid collision with concurrent sibling analysts TC-039/TC-042 sharing the same fixture filenames, same rationale as TC-032/TC-036/TC-038)* |
| Step 2: wait 2s for stabilization | interface fully loaded | step 3 verify | step 3 | asserted *(translated to condition-wait, no fixed sleep, per Hard Rule)* |
| Step 3: click paperclip icon | file picker dialog opens | step 4 | step 4 | asserted *(decomposed into 2 clicks — "plus menu" then "attach files" — confirmed project-wide pattern)* |
| Step 4: select all 11 files via multi-select; file picker shows "11 files selected" | all 11 selected | step 5 | step 5 (DOM chip/overflow count) | **clarification** — the case's "picker shows 11 selected" premise describes native-OS-dialog UI, which Playwright automation bypasses entirely (`setFiles()` operates below the OS-picker layer, same documented limitation as TC-032/TC-038); the app's own post-selection JS is what enforces the cap, immediately truncating the retained set to 10 regardless of how many were "selected" upstream |
| Step 5: close/confirm picker; Behavior A (error) or B (10 thumbnails, 11th truncated) | A or B | step 5 | step 5 | asserted — **Behavior B occurs**: exactly 10 retained (2 chips + "+8" overflow), 11th absent |
| Step 6: if error appears, verify clear message | error text visible | — | — | **not applicable** — no error/dialog appears; see § IMPORTANT |
| Step 7: if 10 thumbnails appear, verify only 10 visible not 11 | 10 visible, not 11 | step 5 | step 5 (chip + overflow-list check) | asserted |
| Step 8: type message text | text entered | step 6 | step 6 | asserted |
| Step 9: if Send enabled, click Send | error OR sent-with-10 | step 7 | step 7 (network: exactly 10× `201`) | asserted — sent with 10 images, no error |
| Step 10: verify clear error or truncation behavior occurred | system enforces limit with feedback | steps 5, 7 | steps 5, 7 | asserted — enforcement confirmed at DOM + network layers; feedback is the ambient disabled-state, not a toast (see § IMPORTANT nuance) |
| Step 11: if sent (Behavior B), verify message contains exactly 10 images not 11 | 10 thumbnails | step 8 | step 8 | asserted |
| Step 12: navigate to `/app/artifacts` to verify only 10 uploaded | artifacts page loads | step 10 | step 10 | asserted |
| Step 13: wait 10s with scroll trigger for lazy loading | all artifacts loaded | step 10 | step 10 | asserted *(translated to condition-wait on the file-list's loaded state / pagination footer; the new folder is a single page of 10, no scroll needed to reach it)* |
| Step 14: verify only 10 files from batch appear (01–10), not 11 | exactly 10, 11 absent | step 10 | step 10 (pagination footer "1 - 10 of 10" + row-name check) | asserted |
| Expected Final State — Ideal (Behavior A) | rejected, nothing sent | — | — | **not applicable** — live product implements Behavior B, not A (case explicitly allows either) |
| Expected Final State — Fallback (Behavior B) | truncate to 10, 11th rejected silently/with warning, 10 files uploaded | steps 5–10 | steps 5–10 | asserted — matches almost exactly; the "warning" takes the form of a persistent disabled/ambient composer state, not a transient toast |
| Teardown: "if uploaded (B), delete files 01–10 from artifacts" | cleanup performed | — | outer `finally` teardown, `deleteArtifactAndVerify()` | **asserted** *(amended post-merge review, 2026-07-06 — see § Cleanup; originally deferred as out-of-scope by the TC-001/TC-002/TC-032/TC-036/TC-038 no-cleanup precedent, but that precedent doesn't transfer to a real 10-file storage footprint left on every run with no expiry — automation now deletes this run's own uuid folder)* |
| Teardown: "if not uploaded (A), no cleanup needed" | n/a | — | — | **not applicable** — Behavior B occurred, files were uploaded; see prior row for the applicable teardown guidance |

### Axis 2 — Analyst additions

- `step 5`'s DOM-level chip-count + overflow-list check (2 chips + "+8", exact filenames `03`–`10`) — *added: the strongest available proof that truncation happens at exactly n=10, not merely "fewer than 11" — a regression that truncated to, say, 9 or let through 11 would be caught by asserting the specific filenames present, not just a count.*
- `step 5`'s ambient disabled-state assertion (`"Max 10 attachments"`, `"0 left"`, both attach controls `disabled`) — *added: this is the only user-facing feedback that exists for this boundary; asserting it protects against a future regression that silently drops the ambient state entirely, which would make the truncation indistinguishable from a bug (per the GH#113/TC-038 comparison, total silence on a rejection path has already been flagged as a UX gap once in this module — this ambient state is what keeps this case from being the same gap).*
- `step 7`'s exact-count network assertion (10, not "at least 1" or "no error") — *added: same convention as TC-032/TC-038's authoritative network-layer checks; this is the signal that actually proves server-side enforcement, independent of anything the UI renders.*
- `step 10`'s pagination-footer assertion (`"1 - 10 of 10"`) — *added: the single most direct, hardest-to-fake confirmation available; a count derived from the underlying list response's `total` field (per `.agents/memory/qa-engineer/shared_account_count_drift_breaks_exact_lazy_load_counts.md` and `count_badge_is_project_scope_dependent.md`) is preferred over any DOM node count for exactly this reason — it is scoped to the single fresh UUID folder this test created, immune to the shared account's unrelated concurrent mutations.*
- `step 11` asserts zero console errors across the whole flow — *added: standard side-channel discipline; 0 errors / 0 warnings observed in this run.*
- Explicit no-toast check (`[role=alert]`, `[role=status]`, toast/snackbar-class selectors, sampled immediately post-truncation) — *added: rules out a transient warning this AFS's snapshots might otherwise have missed; none found. Documented as a deliberate absence-check, not an omission.*

## Cleanup
The sent 10-image message is **not destructive** — same category as TC-001/TC-002's "chat messages persist, no teardown" precedent, and consistent with TC-032/TC-036/TC-038's cleanup decisions elsewhere in this module. Originally recommended **no automated cleanup**, especially given other sibling analysts (TC-039, TC-042) are concurrently mutating the same shared `${TEST_USER}` account this session — an extra delete-after-test step adds one more concurrent mutation for no correctness benefit.

**Amendment (post-merge review, 2026-07-06, implementer): this recommendation is superseded — automation now deletes the 10 retained files in a `finally` teardown, matching TC-042's pattern.** The "no cleanup" reasoning above was sound for a bare chat message (TC-001/002/032/036/038's category: additive, non-destructive, no *storage* cost beyond the message row itself) but doesn't transfer to this case's own Behavior-B path: a real, successful 10-image upload leaves 10 files sitting in the shared, finite Artifacts bucket on every automated run (CI + local + the orchestrator's repeat independent-gate runs), with no compensating expiry — a permanent per-run leak, not a merely-additive record. The concurrency concern that motivated skipping cleanup still doesn't apply: this test's delete only ever touches its OWN uuid folder (captured from its own upload responses), never a sibling's, so it carries no more concurrent-mutation risk than TC-039/TC-042's own teardowns already accept for the identical reason. If a future case in this module ever needs a genuinely non-destructive, no-storage-footprint variant of this scenario, prefer read-only assertions against already-uploaded fixtures over reintroducing an uncleaned batch upload.

If strict account hygiene is later required beyond the above:
1. Delete the conversation named `Test batch upload of 11 images - expect rejection` (conversation id captured at step 7).
2. Delete the artifact folder `attachments/{uuid}/` (from step 7's response) via the Artifacts UI's row-level delete action.

No other cleanup was needed this session — the one incidental side-check that attached a single draft file into an unrelated sibling conversation ("Test large file rejection", conversation id 111) was never sent (confirmed 0 network calls to that conversation's attachments endpoint) and was abandoned by navigating away; the draft was client-side only and did not persist.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| New/isolated conversation button | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` | — (confirmed project-wide handle, `.agents/testing.md`) |
| Announcement banner close | `getByRole('button', { name: 'close' })` (scope to the banner region) | `.filter({ has: page.getByText('Announcing ELITEA') })` on an ancestor |
| Attach-menu trigger ("+") | `getByRole('button', { name: 'plus menu' })` | `[aria-label="plus menu"]` |
| Attach Files menu item | `getByRole('button', { name: 'attach files' })` inside the opened menu — **only actionable after "plus menu" is clicked first** | `getByText('Attach Files')` scoped to the opened menu |
| Attach-remaining-count label (pre-cap) | `getByText(/Attach Files \(\d+ left\)/)` | — baseline value is `10` on a fresh conversation |
| Attach-at-cap label (post-cap, NEW handle this case) | `getByText('Max 10 attachments')` | — replaces the "(N left)" label once 10 is reached; composer's `attach files` button carries `disabled` alongside it |
| Attach Files menu item at cap (NEW handle this case) | `getByRole('button', { name: 'attach files' }).filter({ hasText: '0 left' })`, expect `disabled` | — |
| Composer chip (pre-send) | `getByText('${FILE_NAME}')` scoped to the composer's attachment row | no `data-testid` on the pre-send chip (same gap noted in TC-032's AFS) |
| Overflow control (NEW handle this case) | `getByRole('button', { name: 'Show more files' })` — accessible name/text reads `"+N"` where `N = total - 2` (e.g. `"+8"` for 10 total) | — |
| Overflow file list item | `getByRole('menuitem', { name: '${FILE_NAME}' })` (rendered in a `menu`/`tooltip`-scoped popover after clicking "Show more files") | `getByText('${FILE_NAME}')` scoped to the popover |
| Hidden file input(s) | not directly targetable via role/text — use `page.waitForEvent('filechooser')` + `fileChooser.setFiles([...])` in real Playwright test code; **2** `input[type=file]` elements present, `accept="*/*"` on both (no extension filtering for this path — distinct from the extension-allowlist confirmed for non-image types in TC-031/TC-032/TC-038), `multiple` attribute present, no `id`/`name` | `page.locator('input[type=file]').first().setInputFiles([...])` — confirmed working direct-DOM alternative that bypasses the native chooser event entirely (used for this AFS's own authoritative run; equally valid, slightly more robust against tooling races than the `filechooser`-event path) |
| Message textarea | `getByTestId('chat-input')` | `getByPlaceholder('Type your message...')` / `getByRole('textbox', { name: 'Type your message...' })` |
| Send button | `getByTestId('chat-send-button')` | `getByRole('button', { name: 'send your question' })` — dynamic accessible name, only present once text is typed |
| Sent message row | `getByTestId('chat-message-item')` | — (confirmed project-wide handle) |
| Attachment thumbnails, post-send (transcript) | `img[alt='${FILE_NAME}']` scoped to `getByTestId('chat-message-item')` (image attachments render as `img` elements with the filename as `alt`, confirmed live — distinct from TC-032's non-image `getByTestId('chat-artifact-file-card')` pattern; verify which testid/role this module's implementer settles on for image cards specifically) | `getByText('${FILE_NAME}')` scoped to the message row |
| Artifacts nav (sidebar) | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Artifacts' })` | `getByText('Artifacts')` in sidebar |
| Artifacts bucket row ("attachments") | `getByText('attachments', { exact: true })` scoped to the bucket rail | — |
| Artifacts folder row (by UUID) | `getByText('${UUID}')` scoped to the bucket's folder list | — folders sort by recency; the newest upload's UUID is at/near the top |
| Artifacts file list pagination footer (NEW handle this case) | `getByText(/1\s*-\s*10 of 10/)` | Read the underlying `GET .../folder/prompt_lib/{projectId}?...` response's `total` field directly instead of the rendered string, for a more robust assertion |
| Artifacts file row | `getByTestId('artifacts-file-row').filter({ hasText: '${FILE_NAME}' })` | — |

## Network Behavior
- `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` — fires **exactly 10 times** on Send (one per retained file), each **201**, JSON body `[{"filepath": "/attachments/{uuid}/{fileName}", "file_size": <bytes>}]`. All 10 share the same `{uuid}` folder segment (confirmed this run: `d7934d3d-63cb-4843-aa55-72ff045d82f8`). This exact-count assertion is the authoritative "was the 11th ever sent" signal — assert count === 10, not "at least 1" or "no error".
- `POST ${BASE_URL}api/v2/elitea_core/conversations/prompt_lib/{projectId}` → `201` fires once, on first send in a fresh conversation (standard, unrelated to the attachment count).
- `GET ${BASE_URL}api/v2/elitea_core/folder/prompt_lib/{projectId}?...` (Artifacts folder listing) — its response includes a `total` field; prefer this over the rendered "1 - 10 of 10" string for a less UI-fragile assertion, per `.agents/memory/qa-engineer/count_badge_is_project_scope_dependent.md` and `shared_account_count_drift_breaks_exact_lazy_load_counts.md`'s guidance to always assert against the list endpoint's own total, not a rendered/derived count.
- GA4 beacons (`google-analytics.com/g/collect`, `en=conversation_created`) independently report `ep.has_attachments=true` for the created conversation — corroborating evidence only, **do not assert on this in automation** (third-party, best-effort — same caveat as TC-032/TC-038's AFS).

## Known Defects Found During Exploration
None. The app correctly enforces the 10-image cap (client-side truncation confirmed at DOM, network, and storage layers) and surfaces ambient (non-blocking) feedback via the composer's "Max 10 attachments" / disabled-controls state — this satisfies the case's own Behavior-B fallback ("rejected silently or with warning"). No new tracker issue filed; checked GH#108 (this case's own tracking issue, 0 prior comments) and the module's existing clarification/defect tickets (GH#109, GH#112, GH#113) before concluding — none apply, since this case's live behavior matches its own documented expectations rather than diverging from them.

## Blocked Steps
None.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` / `.agents/test-automation.yaml`. Belongs in `tests/artifacts.spec.ts` (module: artifacts), batched with the rest of TC-030..043 per the module's one-PR delivery plan.
- **`fileChooser.setFiles()` accepts an array natively in real Playwright test code** — pass all 11 paths in one call (`await fileChooser.setFiles([path01, ..., path11])`); there is no need to attach in batches. This was verified two ways in this session: (a) the standard `page.waitForEvent('filechooser')` + `fileChooser.setFiles([11 paths])` pattern, and (b) a direct `page.locator('input[type=file]').first().setInputFiles([11 paths])` call that bypasses the chooser-event plumbing entirely. Both produce the identical truncate-to-10 result (confirmed by re-running the flow independently via each path). Prefer (a) for the actual test code — it's the documented, natural Playwright API and matches how a real user's multi-select would be modeled; (b) is a useful debugging fallback if a CLI/tooling layer ever intercepts or races the `filechooser` event (encountered exactly this race using `playwright-cli`'s own file-chooser tracking mid-session — not a concern for a real Playwright test file, which owns the event exclusively).
- **Don't assert on OS-level picker filtering or an "11 files selected" native-dialog string** — the case's own step 4 describes native-OS-dialog UI that Playwright's `setFiles()` bypasses by design (same documented limitation as TC-032/TC-038). The only automatable proxies for "the app enforces the cap" are the retained-chip/overflow-list state (step 5), the exact network call count (step 7), and the Artifacts pagination total (step 10) — use all three, not any one alone.
- **The `accept="*/*"` attribute on both `input[type=file]` elements confirms count-limiting and type-limiting are two independent validation layers** in this app: TC-031/TC-032/TC-038 found a populated extension-allowlist for the *type* check (rejecting `.exe`, accepting `.txt`/`.pdf`), while this case's `accept` is unrestricted (`*/*`) because the count cap is enforced by different in-app JS logic entirely (a simple "slice to 10" on the selected/dropped FileList), not by the `accept` attribute. Don't conflate the two mechanisms when writing a shared fixture/helper for the artifacts module.
- **Shared fixture files, isolate by conversation, not by filename.** `test-batch-01.png`..`test-batch-10.png` are reused verbatim by TC-039 and TC-042 (both other "max 10" boundary variants). Concurrent execution is safe because each case creates its own fresh conversation (a fresh `{conversationId}`/`{uuid}` folder pair per send) — never assert against a shared/global attachments count, always scope assertions to the specific conversation/UUID this test's own Send action produced.
- Reuse the `EXPECTED_ATTACH_ACCEPT` / accept-attribute shared-constant idea already flagged in TC-038's AFS if the implementer builds one — this case's `*/*` value is a useful contrasting data point for that same fixture/helper (image-count-limit path vs. type-allowlist path).
- **Amendment (implementer debugging pass, pre-first-execution fix, ported from TC-039's own debugging)**: after opening the "Show more files" overflow menu to verify the retained/rejected file names, the menu must be explicitly closed (`ArtifactsPage.closeOverflowMenu()`, i.e. `Escape`) before the next step's `typeMessage()` click -- confirmed live in TC-039 (same overflow-open-then-type shape) that the menu's own invisible `MuiBackdrop-root` stays mounted and intercepts pointer events on the composer indefinitely otherwise. Applied here preemptively before this case's first-ever execution, since the shape is identical.
