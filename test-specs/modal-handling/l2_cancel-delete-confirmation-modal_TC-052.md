# Test Case: Cancel Delete Confirmation Modal

## Metadata
- **TMS ID**: TC-052
- **Linked Story**: GH#61 (own tracking issue, parent epic GH#16 — WebQAPreExecuted batch, module: modal-handling)
- **Priority**: l2 (case-authored priority: high)
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`) — isolated `playwright-cli -s=TC-052` session (own in-memory Chrome profile). `window.location.href` re-verified after every navigation/interaction per `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`; no cross-talk observed with the 6 concurrently-dispatched sibling analysts (TC-050/051/053..056) — one sibling fixture (`TC055 fixture <unix-ms>`) was visible in the shared account's conversation list as the "next" conversation after this session's own teardown-delete redirect, but was never interacted with.
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via Keycloak SSO flow landing on `${BASE_URL}app/chat` with no further redirect
- Case's own precondition "browser window maximized" was not explicitly set this run (no `resize` call issued; default `playwright-cli --browser=chrome` viewport sufficed) — same as sibling TC-050's note; recommend the implementer use the project's standard `chromium` Desktop-Chrome project viewport, not a bespoke "maximized" setting
- **At least one existing conversation exists** — confirmed: the shared account already carries 16+ pre-existing conversations ("New conversation test", 15× "Hello, test", "Test image upload") before this session started. Case's own instruction is "use existing data, do not create new."

## Test Data

### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`
- Pre-existing conversation **"New conversation test"** (id **37**, project/owner id **21**) — the account's own baseline conversation (originally created by the smoke suite's TC-002). Used for a **read-only** spot-check of the Cancel path per the case's own "use existing data" instruction — opened its delete dialog twice (once dismissed via "Cancel" click, once via `Escape` key) and cancelled both times; never deleted.

### Must Generate (in test setup)
- **A disposable conversation fixture**, created specifically so the full cancel-survives → real-delete lifecycle could be exercised without any risk to shared/pre-existing data (per this batch's data-collision guard convention):
  - Clicked sidebar `getByRole('button', { name: 'Conversation', exact: true })` → new blank chat composer
  - Typed `TC052_Cancel_Fixture_${Date.now()}` into `getByTestId('chat-input')` and sent via `getByTestId('chat-send-button')` (dynamic accessible name `"send your question"` once text is present, per `.agents/testing.md`)
  - The app auto-names the conversation from the first message's literal text — no separate "name" field exists for conversations (unlike Agents/Pipelines' dedicated Name input)
  - Observed fixture created this run: conversation id **38**, project/owner id **21**, name `TC052_Cancel_Fixture_1783056929867`
  - `POST /api/v2/elitea_core/conversations/prompt_lib/21` → `201`, followed by `PUT /api/v2/elitea_core/conversation/prompt_lib/21/38` → `200` (auto-rename from "New Conversation" placeholder to the sent message text)

### Must Clean Up (in teardown)
- **The disposable fixture (id 38) required real deletion in Teardown** — since the entire point of this case is that Cancel does *not* delete, the fixture survives the test body and must be explicitly removed afterward (this case's own cleanup responsibility; the case's own Teardown section says "None" because it assumes deletion of a *pre-existing* conversation was never attempted in the first place — for a fresh disposable fixture, "no persistent state was modified" only holds if the fixture itself is cleaned up).
  - Performed: kebab → "Delete" menuitem → dialog → **this time clicked "Delete" for real** → `DELETE /api/v2/elitea_core/conversation/prompt_lib/21/38` → `204` → confirmed absent from the sidebar list on the very next snapshot.
  - The pre-existing baseline conversation (id 37, "New conversation test") required **no** cleanup — it was only ever cancelled/escaped out of, never mutated.

## Test Steps

1. Navigate to `${BASE_URL}app/chat/all`
   - **Verify**: page loads the chat shell; sidebar "Conversations" list is present
   - **Known behavior (not a defect, see Known Defects)**: this route deterministically triggers the "Conversation not found" dialog documented by sibling case TC-050/GH#67 — the client treats the literal `all` segment as a conversation-id lookup that doesn't match anything. Confirmed on both navigations to this URL during this session.
2. Close the "Conversation not found" modal via its `getByRole('dialog').getByRole('button', { name: 'Got it' })` (case's own step 2 instruction, using its `"Got it"` hint, which is correct here — this is a different modal than this case's own subject, but the case's own step 2 correctly anticipates dismissing *something* first)
   - **Verify**: dialog removed from DOM; app auto-navigates into an existing conversation (this run: `/app/chat/37?name=New+conversation+test`) — per TC-050's AFS, do not assert on the specific landing conversation id/name, only that the "not found" dialog is gone
3. Wait (condition wait — `expect(...).toBeVisible()` polling on the conversation list container, not a fixed sleep) for the sidebar conversation list to render
   - **Verify**: all pre-existing conversations visible under date-group headings ("Today"/"This Week"/"Older"); confirmed via `GET /api/v2/elitea_core/folder/prompt_lib/21?grouped=true&date_group=this_week&limit=10&offset=10&sort_by=updated_at&sort_order=desc` (200)
4. Identify the first/topmost conversation in the list and note its name
   - **Verify**: "New conversation test" (id 37) was the topmost pre-existing conversation this run, confirmed by sidebar order
5. Locate the delete control for that conversation — **hover** reveals a per-row kebab/three-dot button (not visible in the default, non-hovered accessibility tree)
   - **Verify**: hovering `getByRole('button', { name: <conversationName> })` reveals a child button resolving to `#conversation-menu-action` (Playwright's own generated locator: `page.getByRole('button', { name: <conversationName> }).locator('#conversation-menu-action')`)
6. Click the kebab control, then click "Delete" in the resulting menu
   - **Verify**: a `menu` role opens with items `Delete`, `Edit`, `Move to`, `Export` (disabled), `Playback`, `Pin on top`; clicking `getByRole('menuitem', { name: 'Delete' })` opens `role="dialog"` — matches the case's own step 5 hint ("3-dot menu → Delete") that this is a two-action interaction, not a single click
7. Verify modal content
   - **Verify**: `page.getByRole('dialog', { name: 'Delete conversation?' })` resolves (heading "Delete conversation?", body paragraph "Are you sure to delete conversation? It can't be restored." — satisfies the case's "like 'Are you sure?'" expectation, just phrased as a body sentence rather than the heading), buttons `Cancel` (enabled) and `Delete` (enabled, **no** type-name gate — this is a materially simpler dialog than the Agent/Pipeline entity delete-confirmation, see Known Defects)
8. Click the "Cancel" button (`getByRole('dialog').getByRole('button', { name: 'Cancel' })`)
   - **Verify**: dialog removed from DOM (`page.getByRole('dialog')` count → 0); no navigation occurred (URL unchanged); **no** `DELETE` request fired (confirmed via request-log diff before/after)
9. Verify the conversation still exists
   - **Verify**: "New conversation test" still present in the sidebar list and still resolvable at `/app/chat/37?name=New+conversation+test` — confirmed both from the live DOM snapshot immediately after Cancel *and* after a full hard page **reload** (server round-trip, not client-cache), ruling out a client-only illusion of persistence

## Expected Results
- Clicking "Cancel" in the conversation delete-confirmation dialog closes the dialog without deleting the conversation
- The targeted conversation remains fully resolvable (sidebar list + direct URL + survives a hard reload) after Cancel
- No `DELETE /api/v2/elitea_core/conversation/prompt_lib/{ownerId}/{id}` request fires on the Cancel path
- A second, independent dismiss mechanism (`Escape` key) produces the identical non-destructive outcome
- Zero console errors across the entire flow

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Precondition: browser maximized | all UI elements visible | precondition | default viewport sufficed, not explicitly maximized | asserted *(re-authored, same as TC-050 — recommend project's standard Desktop-Chrome viewport, not a literal "maximize")* |
| Precondition: user authenticated | logged-in session | precondition | SSO login, no redirect back to Keycloak | asserted |
| Precondition: at least one existing conversation | conversation available to target | precondition | 16+ pre-existing conversations confirmed in sidebar | asserted |
| Test Data: Confirm button `"Confirm"` or `"Delete"` | one of these labels exists | step 7 | step 7: dialog buttons | asserted *("Delete" variant confirmed; no literal "Confirm" button exists anywhere in this app's delete dialogs — consistent with the Agent/Pipeline pattern already documented in GH#28, and independently confirmed for conversations in GH#69)* |
| 1 Navigate to `/app/chat/all` | chat list page loads, conversations visible | steps 1–3 | step 1 (page loads), step 3 (list renders) | asserted *(decomposed: a "Conversation not found" dialog deterministically intervenes first — see step 1 note and Known Defects; case's own step 2 already anticipates dismissing *a* modal, it just doesn't name this specific one)* |
| 2 Close any modal if present (`"Got it"`) | page interactive, no overlay | step 2 | step 2: dialog count 0, app navigates into an existing conversation | asserted *(re-authored: the case's `"Got it"` hint is correct, but the modal it dismisses is TC-050's "Conversation not found" dialog, not this case's own delete-confirmation dialog — a different overlay than a literal reading suggests)* |
| 3 Wait 10s for lazy loading | all conversations visible | step 3 | step 3: condition wait on `GET .../folder/prompt_lib/21?grouped=true...` | asserted *(re-authored: condition wait on the list endpoint, not a fixed 10s sleep, per `.agents/testing.md` § Conventions)* |
| 4 Identify first conversation, note name | name recorded | step 4 | step 4: "New conversation test" (id 37) | asserted |
| 5 Locate delete icon/button (trash or 3-dot menu → Delete) | delete control visible | step 5 | step 5: hover reveals kebab button | asserted |
| 6 Click the Delete control | delete confirmation modal appears (`[role="dialog"]`) | step 6 | step 6: kebab click → menu → "Delete" menuitem click → dialog opens | asserted *(decomposed: case's single "click Delete control" step maps to two live actions — open kebab, then click "Delete" in the menu — matching the case's own step 5 parenthetical hint)* |
| 7 Verify modal contains "Are you sure?" text and Cancel/Confirm-Delete buttons | modal content correct | step 7 | step 7: dialog heading/body/buttons | asserted *("Are you sure" text present in the body paragraph rather than the heading; buttons are literally "Cancel"/"Delete" — both within the case's own hedged wording ("like…", "or…"), no case-text drift filed, low enough deviation to just document here)* |
| 8 Click "Cancel" button | modal closes, `[role="dialog"]` no longer exists | step 8 | step 8: dialog count 0, URL unchanged, no DELETE fired | asserted |
| 9 Verify conversation still exists | conversation NOT deleted, still visible | step 9 | step 9: sidebar presence + direct URL + post-reload persistence | asserted |
| Expected Final State: modal dismissed, targeted conversation still exists, no data changed | all conditions hold | steps 8–9 | step 8 (dialog gone), step 9 (persistence, reload-confirmed) | asserted |
| Teardown: none (no persistent state modified) | n/a | — | — | asserted for the **pre-existing** conversation (id 37, never mutated) — **not** asserted as-is for the analyst's own disposable fixture (id 38), which required real deletion in this AFS's own Teardown since the case's "no modification" premise only holds for data the test didn't itself create; see § Cleanup |

### Axis 2 — Analyst additions
- Step 8 additionally asserts **zero `DELETE` requests fire** on the Cancel path (via before/after request-log diff), not just DOM absence of the dialog — *added: DOM-level dialog removal alone doesn't rule out a fire-and-forget delete call racing the UI transition; confirming no DELETE request at all is the stronger guarantee.*
- Step 9 additionally verifies persistence via a **hard page reload** (full server round-trip), not just a live DOM snapshot — *added: a client-side-only "looks still there" check wouldn't catch a delete that succeeded server-side but hadn't yet re-rendered the list; the reload proves the conversation is genuinely intact server-side.*
- A **second, independent dismiss path** (pressing `Escape` while the dialog is open) was tested against the same pre-existing conversation (id 37) and produced the identical non-destructive outcome (dialog closes, no DELETE fires, conversation persists) — *added: this case and sibling TC-053 both carry the `CLOSE-BTN-DUAL` overlay-type tag; for the conversation-delete dialog specifically, "dual close" means the explicit Cancel button plus MUI's native Escape/backdrop `onClose` handling — not a separate header "X" icon (confirmed absent from this dialog's markup, unlike the Agent/Pipeline dialog per TC-053's own AFS finding). This directly resolves the tag's ambiguity for whichever dialog this case actually exercises.*
- Confirmed the dialog's `aria-labelledby`/`aria-describedby` ARIA wiring **correctly resolves** (unlike the broken Agent/Pipeline dialog, GH#33) — *added: TC-050's own AFS explicitly flagged this as an open question for the TC-052/TC-053 analyst to spot-check; answered here.*
- Confirmed the per-row kebab trigger's `id="conversation-menu-action"` is **duplicated across all 27 rendered conversation rows** (not unique) — *added: discovered while capturing the handle for step 5/6; a genuine (MINOR) HTML-validity defect, filed as a corroboration/addendum on GH#69 rather than a fresh ticket.*
- Confirmed zero console errors across the entire flow (fixture creation, both cancel paths, real teardown delete) — *added: guards against a silent regression the case's own steps don't check for.*

## Cleanup
1. Disposable fixture conversation (id 38, `TC052_Cancel_Fixture_1783056929867`) was **deleted for real** at the end of this session: kebab → "Delete" menuitem → dialog → "Delete" button → `DELETE /api/v2/elitea_core/conversation/prompt_lib/21/38` → `204`. Confirmed absent from the sidebar list immediately after.
2. The pre-existing baseline conversation (id 37, "New conversation test") required no cleanup — only ever cancelled/escaped out of its own delete dialog, never mutated. Confirmed intact (sidebar + direct URL + post-reload) at the end of the session.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| New-conversation control (fixture setup) | `page.getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` — same handle already confirmed by the smoke suite (TC-002) | n/a |
| New-conversation textarea/send | `page.getByTestId('chat-input')` / `page.getByTestId('chat-send-button')` — same handles as TC-002 | `page.getByPlaceholder('Type your message...')` |
| "Conversation not found" dialog (intervenes on `/app/chat/all`) | `page.getByRole('dialog').getByRole('button', { name: 'Got it' })` — see TC-050's AFS for full handle set, not re-derived here | n/a |
| Conversation list container | sidebar `navigation` region containing date-group headings ("Today"/"This Week"/"Older") | n/a — no `data-testid` on the list container itself |
| Conversation row (by name) | `page.getByRole('button', { name: <conversationName> })` | n/a — confirmed unique per name in this account's data |
| Per-row kebab/menu trigger (**hover-revealed**) | `page.getByRole('button', { name: <conversationName> }).locator('#conversation-menu-action')` — **must be scoped to the parent row**; the bare `id` is duplicated across all rows (confirmed 27 occurrences via `document.querySelectorAll('#conversation-menu-action').length`), so `page.locator('#conversation-menu-action')` alone strict-mode-violates for any list with >1 row | none needed once scoped — role+name on the parent is a stable, unique anchor |
| Row menu — "Delete" item | `page.getByRole('menuitem', { name: 'Delete' })` | n/a — unambiguous once the row's own menu is open (menu is modal/single-instance) |
| Row menu — other items (context, not this case) | `Edit`, `Move to`, `Export` (disabled), `Playback`, `Pin on top` — same `menuitem` role pattern | n/a |
| Delete-confirmation dialog (conversation-specific — **distinct from the Agent/Pipeline dialog**, see Known Defects) | `page.getByRole('dialog', { name: 'Delete conversation?' })` — ARIA wiring is correct here (`aria-labelledby="alert-dialog-title"` resolves to the real heading `id`), unlike GH#33's Agent/Pipeline dialog | `page.locator('[role="dialog"]')` (only one dialog ever mounted at a time in this app) |
| Delete-confirmation Cancel button | `page.getByRole('dialog').getByRole('button', { name: 'Cancel' })` | n/a |
| Delete-confirmation Delete button | `page.getByRole('dialog').getByRole('button', { name: 'Delete' })` — **enabled immediately**, no type-the-name gate (unlike the Agent/Pipeline dialog) | n/a |
| Second dismiss path | `page.keyboard.press('Escape')` while the dialog is focused/open — confirmed equivalent to clicking Cancel (no DELETE fires, dialog closes, entity persists) | n/a |

## Network Behavior
- `POST /api/v2/elitea_core/conversations/prompt_lib/{ownerId}` — creates a new conversation (fixture setup). `201` on success; response/subsequent URL carries the new numeric conversation id.
- `PUT /api/v2/elitea_core/conversation/prompt_lib/{ownerId}/{id}` — fires once the first message is sent, renaming the conversation from its "New Conversation" placeholder to the sent message text. `200` on success.
- `GET /api/v2/elitea_core/folder/prompt_lib/{ownerId}?grouped=true&date_group={today|this_week|older}&limit={n}&offset={n}&sort_by=updated_at&sort_order=desc` — paginated, date-grouped conversation list fetch. Wait on this (not a fixed sleep) before asserting the sidebar list is populated.
- `DELETE /api/v2/elitea_core/conversation/prompt_lib/{ownerId}/{id}` — fires **only** when "Delete" is actually clicked and confirmed. `204` on success. **Confirmed this does NOT fire** on either dismiss path (Cancel button or `Escape` key) — verified via before/after request-log diff on both.
- Implementer wait strategy: `page.waitForResponse(resp => resp.url().includes('/conversation/prompt_lib/') && resp.request().method() === 'DELETE' && resp.status() === 204)` only in the teardown/real-delete path; for the Cancel-path assertion itself, assert the **absence** of any such request within a short settle window, plus `expect(page.getByRole('dialog')).toHaveCount(0)` and `expect(page.getByRole('button', { name: conversationName })).toBeVisible()`.

## Known Defects Found During Exploration

- **[INFO / CLARIFICATION]** The conversation delete-confirmation dialog is a **materially different, simpler component** than the Agent/Pipeline entity delete-confirmation dialog (GH#28): heading "Delete conversation?" (not "Delete confirmation"), body "Are you sure to delete conversation? It can't be restored." (not "Enter the name to complete the action."), `Delete` button **enabled immediately** (no type-the-exact-name gate), no header "X" close icon (unlike the Agent/Pipeline dialog per TC-053's finding). **Do not assume one dialog's contract applies to the other** — this was the dispatch brief's working assumption (reuse GH#28/#33's Agent/Pipeline handles) and it does not hold for conversations.
  - **Filing status**: this exact finding was already filed by the TC-055 (sibling modal-handling case) analyst as [`GH#69`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/69), independently, from the same dialog. Corroborated there via comment rather than re-filed, adding three findings this session uncovered that GH#69 didn't yet cover: (1) the dialog's ARIA wiring is correct (unlike GH#33), directly answering an open question TC-050's own AFS raised for this case; (2) the per-row kebab trigger's `id="conversation-menu-action"` is duplicated across all 27 rendered rows (MINOR HTML-validity defect); (3) `Escape` key dismissal works as a confirmed second non-destructive close path, resolving the `CLOSE-BTN-DUAL` tag's meaning for this specific dialog.
  - **Impact on automation**: none of these block the Cancel-path automation — all elements resolve to stable, working locators (see Concrete Handles). The duplicate-id finding requires scoping the kebab locator to its parent row (already reflected above) rather than using the bare `id` selector.
- **[INFO]** Navigating to `${BASE_URL}app/chat/all` deterministically triggers the "Conversation not found" dialog (TC-050/GH#67's finding) before the conversation list becomes interactive — already documented, not re-filed; this case's own step 2 already anticipated dismissing *some* modal first, it just doesn't name this specific one.

## Blocked Steps
None. All case Preconditions and all 9 numbered Steps were executed end-to-end against the live system: the literal case scenario (Cancel path against an existing, pre-existing conversation) was run read-only against "New conversation test" (id 37, cancelled twice — once via "Cancel" click, once via `Escape`, never mutated), and the full disposable-fixture lifecycle (create → cancel-survives → real-delete teardown) was additionally run against a purpose-built fixture (id 38) per this batch's data-collision guard.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — this case joins `tests/modal-handling.spec.ts` (module: modal-handling, per `.agents/test-automation.yaml` and EPIC GH#16's module-by-module delivery plan). Per `.agents/testing.md` § Structure, modal-handling-module specs are not assumed serial by default; this case creates and tears down its own fixture and has no observed dependency on sibling cases.
- This case and TC-053 (`lcovered_confirm-delete-action-via-modal_TC-053.md`) both carry the `CLOSE-BTN-DUAL` tag but were run against **different entity types** (this case: conversation; TC-053: Agent, dedup'd against the already-merged `tests/agents.spec.ts:422` TC-013 test). Do not conflate their dialogs when building a shared modal-handling helper — see Known Defects for the concrete contract differences.
- The modal-handling shared helper `.agents/testing.md` anticipates should branch on entity type (conversation vs. Agent/Pipeline) rather than assume one delete-confirmation contract for all three.
- Wait strategy: no `waitForTimeout` anywhere in this spec — list-load waits on the `folder/prompt_lib` response, dialog waits are web-first `expect(...).toBeVisible()` / `toHaveCount(0)` polls, and the Cancel-path "nothing was deleted" assertion is a request-log absence check over a short settle window rather than a fixed sleep.
- Analyst execution note (process/tooling, not product): ran via `playwright-cli -s=TC-052`, a genuinely isolated in-memory browser profile (confirmed via fresh `/app/chat` redirecting to Keycloak with no inherited cookies at session start). `window.location.href` re-verified after every navigation/interaction; no cross-talk with the 6 concurrently-dispatched sibling analysts was observed, though one sibling's own disposable fixture (`TC055 fixture <unix-ms>`) was passively visible as the "next" conversation the app redirected to after this session's own teardown-delete — never interacted with.
