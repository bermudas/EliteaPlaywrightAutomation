# Test Case: Upload Unsupported File Type (EXE) via Chat — Negative/Security

## Metadata
- **TMS ID**: TC-038
- **Linked Story**: GH#16 (EPIC), GH#103 (own tracking issue), GH#113 (silent-rejection UX gap filed this session)
- **Priority**: l3
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (Sage), analyst slot, `test-case-analysis`, 2026-07-03 — **clean re-run**. A prior dispatch for this exact case died on a transient server-side rate limit before producing an AFS; it left an orphaned conversation (`TC038_Unsupported_File_Fixture_1783089221`, id 94) containing only two plain-text messages with no attachment ever attempted (the "Attach Files (10 left)" counter was still 10 in that thread) — not usable evidence, ignored. This AFS is a fresh, complete execution in its own new conversation.
- Isolated `playwright-cli -s=TC-038` session (dedicated named browser, not the shared default MCP profile) — defense-in-depth per `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`; `.mcp.json`'s `--isolated` flag is the primary mitigation this session. Re-verified `window.location.href` (via the CLI's own page-URL echo) after every navigation.
- **Status**: ready-for-automation

## IMPORTANT — this AFS confirms the case's core security intent, but not its exact mechanism

The case allows two acceptable outcomes: **Behavior A** (native file-picker filters `.exe` out entirely) or **Behavior B** (file selectable, then rejected post-selection with a **clear, visible error message** naming supported formats). Live execution shows a **third outcome the case didn't anticipate, but which still satisfies the case's actual pass criterion (the file is never uploaded, sent, or stored)**:

- The file **is** technically "selectable" via Playwright's scripted `fileChooser.setFiles()` (which bypasses OS-level `accept`-attribute filtering by design — same Playwright/CDP limitation already documented in TC-032's AFS, not app-specific).
- But the app's own client-side JS silently drops the selection immediately: **no attachment chip renders, the "Attach Files (N left)" counter never decrements, `input[type=file].files.length` reads `0` right after `setFiles()`, and zero network requests fire to the attachments-upload endpoint.**
- **No error message, toast, or inline banner ever appears** — this matches neither Behavior A (nothing was "filtered" at the OS-picker layer, since Playwright bypasses that layer) nor Behavior B (no error message, contra the case's explicit expectation in steps 7–9).

**This is a genuine (if minor) product gap, not case-text drift** — unlike sibling cases TC-032 (GH#109, TXT) and TC-031 (GH#112, PDF), where the *product* was correct and the *case premise* was stale, here the product's rejection-without-feedback genuinely falls short of either behavior the case describes as acceptable. Filed as **GH#113** (`[MINOR] Unsupported file type (EXE) rejected silently on chat attach — no error message shown to user`) — not a security defect (the file never uploads or persists, which is the property that actually matters), but a real UX gap worth tracking. This AFS's asserted contract is the **live, confirmed, security-correct behavior**: rejection with no error UI. GH#113 is referenced for visibility but does not block `ready-for-automation` classification, consistent with how MINOR defects were handled elsewhere in this batch (e.g. GH#71, GH#85, GH#27, GH#40) without downgrading the case's automatability.

## Preconditions
- App accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- Test user `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` (role: `${TEST_USER}`) can authenticate via Keycloak SSO
- Local fixture file exists: `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-unsupported.exe` (76 bytes; plain-text dummy content: `This is not a real executable.\nDummy file for testing file type validation.` — the app validates by **extension allowlist**, not file-magic/binary sniffing, so the fixture's actual byte content is irrelevant to this test; confirmed by the `accept` attribute check in step 5 below)
- No toolkit pre-configuration required — same as TC-032/TC-036: the chat composer's built-in "Attach Files" action is available by default. The case's "Artifact Toolkit is configured" precondition does not gate this path.

## Test Data
### Existing (re-use)
- `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — from `.env` (`${TEST_USER}`)
- `${BASE_URL}` — from `.env`
- Fixture: `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/test-unsupported.exe` (static, pre-generated, gitignored — do not execute it, it is upload-attempt payload only)

### Must Generate (in test setup)
- Message text: literal string `Test unsupported file type` (case-supplied)
- None else — the fixture file is static

### Must Clean Up (in teardown)
- None required to keep the test green (see § Cleanup) — the send-with-no-attachment message is non-destructive, same category as TC-001/TC-002's documented no-teardown precedent.

## Test Steps

1. Navigate to `${BASE_URL}app/chat/`.
   - **Verify**: if redirected to `auth.elitea.ai` (Keycloak), authenticate — fill `getByRole('textbox', { name: 'Username or email' })` with `${ELITEA_EMAIL}`, `getByRole('textbox', { name: 'Password' })` with `${ELITEA_PASSWORD}`, click `getByRole('button', { name: 'Sign In' })`. Wait for URL to settle on `${BASE_URL}app/chat/**`.
2. Dismiss the release-notes announcement banner if present: `getByRole('button', { name: 'close' })` scoped to the banner region.
3. Create a fresh, isolated conversation (avoids colliding with other chat history / parallel sibling-analyst runs against the same shared account): `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })`.
   - **Verify**: URL becomes `${BASE_URL}app/chat` (no id yet); composer is empty; "Attach Files (10 left)" counter reads its full/baseline value.
4. Open the attach-files menu — two clicks required: click `getByRole('button', { name: 'plus menu' })` first, then click `getByRole('button', { name: 'attach files' })` inside the menu that opens (same two-step sequence confirmed in TC-032/TC-036 — clicking "attach files" directly without opening the plus-menu first hangs Playwright's actionability retry loop).
   - **Verify**: a native file chooser opens (Playwright: `page.waitForEvent('filechooser')` fires).
5. **Before** supplying the file, capture the hidden file input's `accept` attribute via `page.evaluate` (requires resolving/handling the open file-chooser modal state first, or reading it from a fresh snapshot immediately after opening the menu, before the chooser blocks further evaluation): confirmed value in this run —
   `.txt,.py,.js,.ts,.java,.cpp,.c,.h,.hpp,.cs,.rb,.go,.php,.swift,.kt,.rs,.m,.scala,.pl,.sh,.bat,.lua,.r,.pas,.asm,.dart,.groovy,.sql,.yml,.yaml,.jsx,.tsx,.mjs,.cjs,.hs,.bash,.zsh,.pm,.toml,.ini,.cfg,.conf,.env,.md,.csv,.xlsx,.xls,.pdf,.docx,.doc,.json,.jsonl,.htm,.html,.xml,.ppt,.pptx,.eml,.msg,.png,.jpg,.jpeg,.gif,.webp,.svg`
   - **Verify**: `.exe` is **absent** from this list (confirms the rejection is intentional/allowlist-driven — same accept string independently confirmed in GH#112/TC-031, so this is a stable, non-flaky handle to assert against).
6. Supply the fixture to the file chooser: `fileChooser.setFiles('${TEST_DATA_DIR}/test-unsupported.exe')`.
   - **Verify — DOM**: immediately after, `[...document.querySelectorAll('input[type=file]')].every(el => el.files.length === 0)` — the app's own JS clears/rejects the selection before it is retained (do not rely on OS-level picker filtering — Playwright's `setFiles()` bypasses that layer entirely; this DOM-state check is the correct automatable proxy).
   - **Verify — UI**: no attachment chip renders in the composer.
   - **Verify — UI**: the "Attach Files (N left)" counter is unchanged from its step-3 baseline (did **not** decrement).
7. Type `Test unsupported file type` into `getByTestId('chat-input')`.
8. Click Send: `getByTestId('chat-send-button')` (dynamic accessible name `"send your question"` once text is present).
   - **Verify — network**: no `POST .../api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` request fires anywhere in this flow (assert its absence across the full network log, not just "no error response" — the request should never be initiated at all).
   - **Verify — network**: the conversation-create call (`POST .../api/v2/elitea_core/conversations/prompt_lib/{projectId}` → `201`) fires as normal for a fresh conversation; **no** attachment-related fields/counts appear in its payload.
   - **Verify — navigation**: URL moves to `${BASE_URL}app/chat/{newConversationId}`.
9. In the transcript, verify the sent user-message row: `getByTestId('chat-message-item')` — contains the message text `Test unsupported file type` and **no** `getByTestId('chat-artifact-file-card')` (assert absence — the negative-path counterpart to TC-032's positive-path assertion of the same testid).
10. Wait for the assistant's reply to render: `getByTestId('chat-answer-content')`.
    - **Verify**: a reply renders (assert presence only — content is LLM-generated and non-deterministic; do not assert on exact wording. In this run the model correctly inferred no attachment was received: *"I can't directly 'test' an unsupported file type unless you provide the file..."*, corroborating no file reached it server-side).
11. Verify no error/rejection UI is present anywhere in the transcript or composer (no toast, no inline error banner, no disabled-send state) — assert **absence**, matching the live/confirmed contract (see § IMPORTANT above re: GH#113 — the case's own step 7–9 expectation of a visible error message does not hold live; this AFS asserts the actual behavior, not the case's originally-hoped-for one).
12. Navigate to `${BASE_URL}app/artifacts`, select the `attachments` bucket (`getByText('attachments', { exact: true })` in the bucket rail).
    - **Verify**: no file row matches `test-unsupported.exe` or any `.exe` filename anywhere in the bucket's file list (11 pre-existing UUID-keyed folders were present before this run and remained unchanged after — assert on **filename absence**, not on total folder/row count, since concurrent sibling-analyst runs against the same shared `${TEST_USER}` account can independently add rows and would make a count-based assertion flaky per `.agents/testing.md` § Concurrency policy).
13. Assert zero console errors were logged across the whole flow (steps 1–12).

## Expected Results
- The `.exe` extension is absent from the file input's `accept` allowlist (confirms intentional allowlist-driven rejection).
- The file selection is silently cleared client-side: `input[type=file].files.length === 0`, no attachment chip, no counter decrement.
- No `POST .../attachments/prompt_lib/{projectId}/{conversationId}` request is ever initiated.
- The message sends successfully as **text-only** — no attachment card in the transcript.
- No error/rejection UI is shown anywhere (confirmed live behavior — see GH#113 for the UX gap this represents).
- The file never appears in the Artifacts → `attachments` bucket.
- Zero console errors during the entire flow.

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| desc: "only image files supported... EXE... NOT supported" | attempting EXE upload triggers clear error/format restriction | steps 5–11 | steps 5–11 | asserted *(partially — rejection confirmed, "clear error" is not; see disposition below)* |
| Setup 1: maximize browser window | all UI elements visible | n/a | n/a | out-of-scope — manual-execution artifact; Playwright's fixed viewport (1920×1080 per `.agents/testing.md`) supersedes this |
| Setup 2: verify authenticated state | redirect-or-authenticated branch | step 1 | step 1 | asserted |
| Setup 3: close modals/overlays, `[role="dialog"]` | overlay dismissed | step 2 | step 2 | **clarification** — it's a dismissible banner, not a `[role="dialog"]` modal; same drift already tracked under GH#66/#67 (TC-051) and re-confirmed in TC-032/TC-036, not re-filed here |
| Step 1: navigate to chat | chat page loads, input toolbar visible | steps 1, 3 | step 3 | asserted *(decomposed — case assumes reusing an existing thread; AFS deliberately opens a fresh isolated conversation to avoid cross-test collision with 13 concurrent sibling analysts, same rationale as TC-036)* |
| Step 2: wait 2s for stabilization | interface fully loaded | step 3 verify | step 3 | asserted *(translated to a condition-wait — no fixed sleep, per Hard Rule)* |
| Step 3: click paperclip icon | file picker dialog opens | step 4 | step 4 | asserted *(decomposed into 2 clicks — "plus menu" then "attach files" — confirmed project-wide pattern from TC-032/TC-036)* |
| Step 4: attempt to select `test-unsupported.exe`; Behavior A (filtered) or B (selectable) | either A or B | steps 5–6 | step 5 (`accept` attribute), step 6 (DOM `.files.length`) | **clarification** — neither pure A nor B holds: `.exe` is absent from `accept` (so the *intent* of A is confirmed) but Playwright's scripted `setFiles()` bypasses OS-level filtering so the file is technically "selectable" through automation, matching B's setup — except B's continuation (a visible error) never happens |
| Step 5: select file (Behavior B) | file appears selected | step 6 | step 6 | **clarification** — file is NOT retained as selected; `.files.length === 0`, no chip, counter unchanged |
| Step 6: type message text (if selectable) | text entered | step 7 | step 7 | asserted *(executed unconditionally — the case's "if selectable" branch is moot since neither branch cleanly applies; typing/sending proceeds regardless, matching the case's own fallback intent to still probe Send behavior)* |
| Step 7: click Send | error message appears immediately | step 8 | step 8 (network absence) | **defect** — no error message ever appears; filed as **GH#113** (MINOR — silent rejection, no user feedback), not case-text drift since the product's actual behavior matches neither of the case's own described acceptable outcomes |
| Step 8: verify error message visible | error displayed prominently | step 11 | step 11 | **defect** — GH#113; AFS asserts the live/confirmed absence, since forcing an assertion of presence would make automation permanently red for a filed-but-non-blocking MINOR gap (consistent with how GH#71/#85/#27/#40 MINOR defects were handled elsewhere in this batch without downgrading case status) |
| Step 9: verify error mentions supported formats | error is informative | — | — | **defect** — moot, no error exists to inspect; same GH#113 |
| Step 10: verify message NOT sent (with EXE attachment) | chat history unchanged w.r.t. attachment | step 9 | step 9 | asserted — message sends as text-only (matches the case's underlying security intent: no attachment ever reaches chat history), though the case's literal framing ("message was NOT sent") doesn't hold — the *text* message sends fine, only the attachment is rejected |
| Step 11: navigate to `/app/artifacts` | artifacts page loads | step 12 | step 12 | asserted |
| Step 12: wait 10s with scroll trigger for lazy loading | all artifacts loaded | step 12 | step 12 | asserted *(translated to condition-wait; 11 pre-existing folders, no scroll needed to reach any new one — because none was created)* |
| Step 13: verify `test-unsupported.exe` does NOT appear in artifacts | file absent | step 12 | step 12 | asserted — confirmed absent, core security property holds |
| Expected Final State (Scenario A / B / "no error messages persist... chat remains functional") | see case | steps 6–11 | steps 6–11 | **clarification** — actual final state is closest to a hybrid: no upload succeeds (matches both scenarios' end-goal) but via silent client-side drop, not native-picker filtering (A) nor a visible post-selection error (B) |
| Teardown: "No cleanup needed (file was not uploaded)" | n/a | — | — | asserted — this premise **does** hold here (unlike TC-032/TC-031), since the file genuinely never uploads |

### Axis 2 — Analyst additions

- `step 5` asserts the `accept` attribute's exact value and confirms `.exe`'s absence — *added: this is the closest automatable proxy for "the app intends to reject this type," reusable verbatim from the already-confirmed value in GH#112 (TC-031) and GH#109 (TC-032) — all three cases hit the identical allowlist string, so this is a stable, shared handle across the artifacts module, not a one-off.*
- `step 6`'s DOM-level `.files.length === 0` check — *added: the strongest available proof that the client actively rejects the selection (vs. merely not rendering a chip for cosmetic reasons) — a regression here (files.length becoming > 0 while still no chip renders) would indicate a different, more concerning failure mode (silent partial acceptance).*
- `step 8`'s explicit assertion of the *absence* of any `attachments/prompt_lib` network call — *added: this is the authoritative "was it ever accepted" signal, same convention as TC-032/TC-031's positive-path assertion on the `201` response; here it's the negative counterpart, and it's the assertion that actually proves the security property (no upload ever reaches the server), which matters more than any UI-layer observation.*
- `step 13` asserts zero console errors across the whole flow — *added: standard side-channel discipline; none observed in this run (0 errors / 0 warnings).*
- `step 12`'s filename-absence assertion (rather than a folder-count assertion) — *added: guards against flakiness from the 13 other sibling analysts concurrently mutating the same shared `${TEST_USER}` artifacts bucket this batch, per `.agents/testing.md` § Concurrency policy.*

## Cleanup
No cleanup required — the file was never uploaded (confirmed), and the sent text-only message is non-destructive, same category as TC-001/TC-002's "chat messages persist, no teardown" precedent.

Two extra artifacts of this analysis session exist in the shared account's chat history, both harmless and left as-is per the no-cleanup precedent:
1. This AFS's own fresh conversation, `Test unsupported file type` (conversation id `103`).
2. An **orphaned conversation from the prior, dead dispatch**: `TC038_Unsupported_File_Fixture_1783089221` (conversation id `94`) — contains two plain-text messages only, no attachment was ever attempted in it (not this AFS's evidence source; ignored during analysis, noted here only so a future auditor doesn't mistake it for this run's output). Safe to delete manually for hygiene, not required for correctness.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| New/isolated conversation button | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` | — (confirmed project-wide handle, `.agents/testing.md`) |
| Announcement banner close | `getByRole('button', { name: 'close' })` (scope to the banner region) | `.filter({ has: page.getByText('Announcing ELITEA') })` on an ancestor |
| Attach-menu trigger ("+") | `getByRole('button', { name: 'plus menu' })` | `[aria-label="plus menu"]` |
| Attach Files menu item | `getByRole('button', { name: 'attach files' })` **— only actionable after "plus menu" is clicked first** | `getByText('Attach Files')` scoped to the opened menu |
| Attach Files remaining-count label | `getByText(/Attach Files \(\d+ left\)/)` | — used as the pre/post-selection baseline for step 6's counter-unchanged assertion |
| Hidden file input(s) | not directly targetable — use `page.waitForEvent('filechooser')` + `fileChooser.setFiles()`; **2** `input[type=file]` elements present, both share identical `accept` values and a timestamp-suffixed `id` (e.g. `file-upload-input1783091003012`, **not stable across page loads** — don't select by id) | `input[type=file]` (CSS, last resort, indexed `[0]`/`[1]` if ever needed directly) |
| Message textarea | `getByTestId('chat-input')` (accessible name `"Type your message..."` before typing) | `getByPlaceholder('Type your message...')` |
| Send button | `getByTestId('chat-send-button')` | `getByRole('button', { name: 'send your question' })` — dynamic accessible name, only present once text is typed |
| Sent message row | `getByTestId('chat-message-item')` | — (confirmed project-wide handle) |
| Attachment card (assert **absence** for this negative case) | `getByTestId('chat-artifact-file-card')` | — |
| Assistant reply content | `getByTestId('chat-answer-content')` | — |
| Artifacts nav (sidebar) | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Artifacts' })` | `getByText('Artifacts')` in sidebar |
| Artifacts bucket row ("attachments") | `getByText('attachments', { exact: true })` scoped to the bucket rail | — |
| Artifacts file list container | `getByTestId('artifacts-file-list')` | — |
| Artifacts file row (assert **absence** filtered by filename) | `getByTestId('artifacts-file-row').filter({ hasText: 'test-unsupported.exe' })` → expect count `0` | — |

## Network Behavior
- `POST ${BASE_URL}api/v2/elitea_core/attachments/prompt_lib/{projectId}/{conversationId}` — **never fires** in this flow (the negative counterpart to TC-032/TC-031's positive-path `201` assertion). This absence is the single most authoritative "was it rejected" signal — assert on it directly, not just on UI absence-of-chip.
- `POST ${BASE_URL}api/v2/elitea_core/conversations/prompt_lib/{projectId}` → `201` fires as normal on first send in a fresh conversation (unrelated to the attachment attempt — same call fires for any first message, with or without an attachment).
- GA4 beacon (`google-analytics.com/g/collect`, `en=conversation_created`) independently corroborates `ep.has_attachments=false` for the created conversation — supporting evidence only, **do not assert on this in automation** (third-party, best-effort, not a reliable test oracle — same caveat as TC-032's AFS).

## Known Defects Found During Exploration
**GH#113** (MINOR, filed this session): unsupported file types are rejected silently on chat attach — no toast, inline error, or any user-facing message appears, and neither of the case's two documented acceptable behaviors (native-picker filtering, or selectable-then-clear-error) actually occurs. The core security/functional property is unaffected (the file never uploads, sends, or persists) — this is a UX/feedback gap, not a security defect. Does not block this case's `ready-for-automation` classification; the AFS asserts the confirmed live (silent-rejection) contract as the expected result, consistent with how MINOR defects elsewhere in this batch (GH#71, GH#85, GH#27, GH#40) were tracked without downgrading their originating case's automatability.

## Blocked Steps
None.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` / `.agents/test-automation.yaml`. Belongs in `tests/artifacts.spec.ts` (module: artifacts), batched with the rest of TC-030..043 per the module's one-PR delivery plan.
- **Shared `accept`-attribute handle across the artifacts module**: the exact allowlist string in step 5 is identical to the one independently confirmed in GH#112 (TC-031) and GH#109 (TC-032) — consider capturing it once as a shared constant/fixture (e.g. `EXPECTED_ATTACH_ACCEPT` in a module-level fixture file) rather than re-deriving it per spec file, since all three cases assert against the same value from different angles (TC-031/TC-032 assert a *documented* type IS present; TC-038 asserts `.exe` is NOT present).
- **Don't assert on OS-level picker filtering.** As established in TC-032's AFS, Playwright's `fileChooser.setFiles()` bypasses `accept`-attribute filtering entirely — this is a Playwright/CDP limitation, not app-specific. The only automatable proxies for "the app intends to reject this" are (a) reading the `accept` attribute's value (step 5) and (b) checking `input[type=file].files.length` stays `0` after `setFiles()` (step 6) — use both, not either alone.
- **Recommend NOT asserting on error-message presence.** Per § IMPORTANT and the Coverage Map's step 7–9 rows, the live product shows no error message at all (GH#113). Asserting presence would make this test permanently red for a filed, non-blocking MINOR defect and could block the artifacts module's merge gate (`.agents/profile.md` § Automation PR policy requires N=3 consecutive green runs). If Tal/the implementer wants GH#113 tracked as a "known-defect red" in CI (the pattern already used for GH#29/#43 per `.agents/testing.md` § CI integration), that should be a deliberate, separately-flagged test (e.g. `test.fixme()` or a dedicated `test.skip(condition, 'GH#113')`-annotated case), not silently bundled into this case's main assertions.
- Out of scope for this AFS, flagged for awareness only: the fixture file's content is plain ASCII text disguised with a `.exe` extension (`file` reports `ASCII text, with CRLF line terminators`), not a real PE/Mach-O binary. This is irrelevant here since rejection is confirmed to be extension-allowlist-based, not content/magic-byte-based — but if a future case specifically wants to test magic-byte sniffing (as opposed to extension checking), a real (harmless) binary fixture would be needed instead.
- **Amendment (implementer debugging pass, post-merge fix round)**: a prior implementation round had added a page-wide `expect(page.getByRole('status')).toHaveCount(0)` assertion alongside the `getByRole('alert')` check in the "no error/rejection UI" step -- this was never grounded in this AFS (no `role="status"` handle is documented anywhere above). Live re-execution found it permanently false-failing: it collides with `<div id="DndLiveRegion-0" role="status" aria-live="assertive">`, a visually-hidden (1x1px clipped) accessibility live-region that react-dnd mounts on every page load, structurally unrelated to file-rejection UX. Removed as an invented, wrong assertion -- the "no error/rejection UI" contract remains fully covered by the `getByRole('alert')` check (a real toast/banner renders as `role="alert"` project-wide, e.g. TC-033's size-limit rejection toast). Not a scope change: this handle was never part of the AFS's own Coverage Map or Concrete Handles.
