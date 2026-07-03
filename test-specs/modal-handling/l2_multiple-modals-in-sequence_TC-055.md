# Test Case: Multiple Modals in Sequence

## Metadata
- **TMS ID**: TC-055
- **Linked Story**: GH#16 (EPIC), GH#64 (tracking issue)
- **Priority**: l2
- **Environment Explored**: `https://next.elitea.ai/` (prod-like "next" env)
- **Analyst**: qa-engineer (analyst slot, isolated `playwright-cli -s=TC055` session)
- **Status**: ready-for-automation

## Preconditions
- User is authenticated via Keycloak SSO: `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`
- At least one existing conversation exists in the account (baseline account already has ~18 conversations under "This Week" + an "Older" group — no seeding required for this precondition)
- Browser window maximized (viewport 1280×720 used during exploration; app is responsive down to that size, sidebar conversation list remains visible)

## Test Data
### Existing (re-use)
- `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — from `tests/fixtures/env.ts`
- `${BASE_URL}` — from `tests/fixtures/env.ts` (already trailing-slash-stripped)
- Any pre-existing conversation row in the sidebar list can serve as the delete-cancel target — the flow is non-destructive when Cancel is clicked, so no dedicated fixture is strictly required for step 7–10. Exploration used the account's existing "New conversation test" conversation for the primary walkthrough (confirmed unaffected — still present after the run).

### Must Generate (in test setup) — OPTIONAL, recommended for isolation
- A disposable conversation named `TC055 fixture ${Date.now()}` (created by sending one chat message) if the implementer wants to avoid touching shared/other-suite conversations during the delete-cancel step. Exploration validated this pattern end-to-end (create → trigger delete → cancel → verify still exists → real-delete for cleanup) against `TC055 fixture 1783057005689` (conversation id 39). Not required by the case's own script, but safer under this module's shared-account, high-parallelism conditions (10 modal-handling cases run against the same account).

### Must Clean Up (in teardown)
- If a disposable conversation was created for isolation, delete it for real (kebab menu → "Delete" → dialog → click "Delete") as teardown — do **not** leave throwaway fixtures behind. Exploration did this: created `TC055 fixture 1783057005689`, exercised the Cancel path against it, then deleted it for real once verification was complete.
- No cleanup needed if the implementer reuses an existing conversation and only ever clicks Cancel (case's own Teardown says "None (no persistent state was modified)" — true, confirmed).

## Test Steps
1. Navigate to `${BASE_URL}/app/chat/all`
   - **Verify**: page loads, title becomes "Elitea" / chat list view renders in sidebar
2. Wait up to 15s for the first modal (`[role="dialog"]`, heading "Conversation not found") to appear
   - **Verify**: `getByRole('dialog', { name: 'Conversation not found' })` visible; contains the fixed prompt text and a single "Got it" button
   - **Note**: this modal is **not deterministic on every load** — it's driven by an internal/localStorage "last active conversation" restore attempt that intermittently points at a conversation the app can't resolve on first attempt. Once a session successfully resolves a conversation (via "Got it" or otherwise), a same-session re-navigation to `/app/chat/all` may **not** re-show it (confirmed: reappeared only after ~12s delay on a second occurrence, matching the case's own "wait up to 15 seconds" language — build the wait as an `expect(...).toBeVisible({ timeout: 15000 })`, not a hard assert-immediately)
3. Click "Got it" (`getByRole('button', { name: 'Got it' })`)
   - **Verify**: `[role="dialog"]` count drops to 0 immediately (confirmed via `document.querySelectorAll('[role="dialog"]').length === 0`)
   - **Note**: dismissing this modal navigates the app to whatever conversation it was originally trying to restore (e.g. `/app/chat/{id}?name=...`) — this is expected, not a bug; the sidebar conversation list stays visible regardless of which conversation is open in the main panel, so step 4+ isn't affected
4. Locate the first conversation row in the sidebar list (`getByRole('button', { name: <conversation title> })` scoped to the "This Week"/"Today" group) and hover it to reveal its per-row kebab (⋮) button
   - **Verify**: kebab button becomes visible on hover, `id="conversation-menu-action"` (present, but no `aria-label`/accessible name — see Concrete Handles)
5. Click the kebab button
   - **Verify**: a `menu` (role) opens with items "Delete", "Edit", "Move to", "Export" (disabled), "Playback", "Pin on top"
6. Click the "Delete" menu item (`getByRole('menuitem', { name: 'Delete' })`)
   - **Verify**: second modal appears — `getByRole('dialog', { name: 'Delete conversation?' })`, containing paragraph "Are you sure to delete conversation? It can't be restored.", buttons "Cancel" and **"Delete"** (case text assumed "Confirm" — case-text drift, filed as GH#69)
7. Click "Cancel" (`getByRole('button', { name: 'Cancel' })`)
   - **Verify**: `[role="dialog"]` count is 0; no `DELETE` request fired (confirmed via network trace — only a `PUT /api/v2/elitea_core/conversation/prompt_lib/{project}/{id}` and analytics beacons fired, no destructive call)
8. Verify the conversation row is still present in the sidebar list (`getByRole('button', { name: <same title> })` still resolves)

## Expected Results
- Modal 1 ("Conversation not found") appears (within 15s), is dismissible via "Got it", and leaves 0 `[role="dialog"]` elements after dismissal
- Modal 2 ("Delete conversation?") appears only after an explicit user action (kebab → Delete) — never auto-appears, never overlaps modal 1 (the two are strictly sequential, never simultaneously mounted; confirmed no code path in this app renders two `[role="dialog"]` elements at once — see Coverage Map Axis 2)
- Cancelling modal 2 performs no destructive action and leaves the conversation in the list
- No console errors during the whole sequence (confirmed: 0 errors across the primary walkthrough)

## Coverage Map

**Axis 1 — Case coverage**

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Precondition: ≥1 existing conversation | list renders | step 1 | account already has ~18 conversations, no seeding needed | asserted |
| 1 Navigate to `/app/chat/all` | chat list page loads | step 1 | page title "Elitea", sidebar list visible | asserted |
| 2 Wait ≤15s for "Conversation not found" modal | modal appears with text + "Got it" | step 2 | `getByRole('dialog', {name:'Conversation not found'})` visible within 15s | asserted *(clarification: intermittent trigger, not every navigation — see step 2 note)* |
| 3 Verify modal visible with correct content | overlay present | step 2 | heading + paragraph text asserted | asserted |
| 4 Click "Got it" | modal closes, `[role=dialog]` gone | step 3 | `document.querySelectorAll('[role="dialog"]').length === 0` | asserted |
| 5 Wait 2s for page to stabilize | page interactive | — | translated per `.agents/testing.md` convention: no hard sleep — use `expect(dialog).toBeHidden()` as the stabilization gate instead of a timed wait | asserted *(reworded, no fixed wait)* |
| 6 Wait 10s for lazy load, scroll to load conversations | all conversations visible | step 4 | in practice the first conversation row was already rendered without scrolling (list wasn't lazy-paginated for the visible "This Week"/"Today" group — only the separate "Older" section is collapsed behind its own expander) — scrolling only needed if the target row is inside "Older" | asserted *(clarification: scroll not always necessary — see Known Defects/Clarifications, filed as part of GH#69 discussion is not needed here, this is a behavior note not a defect)* |
| 7 Locate delete control for first conversation | delete icon/button visible | step 4 | kebab (`#conversation-menu-action`) revealed on hover, not a dedicated "delete icon" — see Concrete Handles | asserted *(decomposed: hover-to-reveal-kebab, then kebab menu, not a direct delete icon as case text implies)* |
| 8 Click delete control | second modal appears with Cancel/Confirm | steps 5–6 | `getByRole('dialog', {name:'Delete conversation?'})` | asserted *(clarification: buttons are Cancel/Delete not Cancel/Confirm — GH#69)* |
| 9 Verify second modal visible with confirmation text | overlay present | step 6 | paragraph text asserted | asserted |
| 10 Click "Cancel" | modal closes, conversation NOT deleted | step 7 | dialog count 0, no DELETE network call | asserted |
| 11 Verify no modal exists | `[role=dialog]` count 0 | step 7 | asserted | asserted |
| 12 Verify conversation still exists in list | not deleted | step 8 | row still resolves by name | asserted |
| Expected Final State (two modals handled in sequence, no overlay remains, conversation intact) | — | steps 1–8 | full walkthrough | asserted |
| Teardown: none required | — | — | confirmed — no persistent state changed by the Cancel path | asserted |

**Axis 2 — Analyst additions**

- **Focus-trap / stacking check** (not in case script): while modal 1 ("Conversation not found") was open, attempted to click a background conversation row's kebab menu directly via ref. Playwright's actionability watchdog confirmed `.MuiDialog-container` (inside `.MuiDialog-root.MuiModal-root`, z-index 1300) intercepts pointer events and the click never lands on the background element — *added: this is the core "multiple modals" risk this case exists to catch (a broken focus trap would let a user open modal 2 while modal 1 is still mounted, or click through to unrelated destructive actions); confirmed correct, worth a permanent regression guard.*
- **No true DOM overlap observed**: at no point during exploration did `document.querySelectorAll('[role="dialog"]').length` return `2` — the app's modal system appears to be single-instance (mounting modal 2 implies modal 1 was already unmounted). *Added: this is the single most important observable for a case literally named "Multiple Modals in Sequence" — asserting `[role="dialog"]).count()` is always ≤ 1 throughout the whole flow is a stronger, more general guard than only checking count-is-0 at the two specific points the case names.*
- **Network assertion on Cancel** (not in case script): confirmed no `DELETE` request fires when Cancel is clicked (only `PUT .../conversation/...` + analytics beacons). *Added: directly proves "conversation is NOT deleted" at the network layer, not just via UI re-query — stronger evidence than a DOM-only check.*
- **Delayed-modal timing evidence** (not in case script): reproduced the "Conversation not found" modal via a second, independent trigger path (direct navigation to a known-deleted conversation ID) and confirmed the same ~12s+ delay before the modal mounts, confirming the case's "wait up to 15 seconds" instruction is a real, necessary condition-wait — not manual-execution flavor text to be dropped in automation. *Added: justifies keeping a generous `toBeVisible({timeout: 15000})` rather than trimming it.*
- **Announcement banner coexistence** (not in case script): the dismissible, non-modal "Announcing ELITEA 2.0.4!" banner (known pattern from other modal-handling cases — `overlay_types: OVR-INFO` non-modal type) was present on-screen simultaneously with the sidebar/kebab-menu flow and did not interfere with hover/click targeting of conversation rows. *Added: confirms the non-modal banner and the true `[role="dialog"]` modals don't compete for the same interaction surface — worth a `// banner may or may not be present` comment in the test rather than an assertion, since presence is dismiss-once-per-session and not guaranteed.*

## Cleanup
1. If a disposable conversation was created for isolation (recommended pattern above): hover its row → click kebab (`#conversation-menu-action`) → click "Delete" menu item → click **"Delete"** (not "Confirm") in the confirmation dialog. Confirmed working: deleted `TC055 fixture 1783057005689` (id 39) this way with no residual `[role="dialog"]` afterward.
2. If reusing an existing conversation and only exercising Cancel: no cleanup needed (nothing mutated).

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Modal 1 dialog | `getByRole('dialog', { name: 'Conversation not found' })` | `page.locator('[role="dialog"]').filter({ hasText: 'Conversation not found' })` |
| Modal 1 dismiss button | `getByRole('button', { name: 'Got it' })` | `button:has-text("Got it")` (matches case text) |
| Sidebar conversation row | `getByRole('button', { name: '<conversation title>', exact: true })` scoped under `navigation` main panel's "Conversations" region | `.playwright-cli` confirmed no shared list container test-id; row is a plain `<button>` with the title as its own accessible name |
| Per-row kebab (⋮) menu button | `page.getByRole('button', { name: '<conversation title>' }).locator('#conversation-menu-action')` — **only rendered on hover**, no aria-label of its own | `id="conversation-menu-action"` is reused per-row (same id string on every row's kebab — not unique in the DOM; always scope it under the parent row's locator, never query it bare) |
| Kebab menu "Delete" item | `getByRole('menuitem', { name: 'Delete', exact: true })` | — (exact match needed: menu also has "Export" and other items, no collision observed but keep `exact: true` for safety) |
| Modal 2 dialog | `getByRole('dialog', { name: 'Delete conversation?' })` | `page.locator('[role="dialog"]').filter({ hasText: 'Delete conversation?' })` |
| Modal 2 Cancel button | `getByRole('button', { name: 'Cancel', exact: true })` | `button:has-text("Cancel")` (matches case text) |
| Modal 2 confirm/destructive button | `getByRole('button', { name: 'Delete', exact: true })` | **not** `button:has-text("Confirm")` — that text does not exist in this dialog (case-text drift, GH#69) |
| Dialog count guard (stacking assertion) | `page.locator('[role="dialog"]')` `.count()` — assert `<= 1` throughout, `=== 0` at rest | — |
| New-conversation control (for the optional disposable-fixture pattern) | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` (confirmed handle, GH#9) | — |
| Chat input / send (for seeding the disposable fixture) | `getByTestId('chat-input')` / `getByTestId('chat-send-button')` (confirmed handle from smoke suite) | dynamic accessible name on send button: `"send your question"` post-type |

## Network Behavior
- Clicking "Got it" on modal 1 (when it resolves to a valid conversation): `POST /api/v2/elitea_core/select_conversation/prompt_lib/{project}/{id}` → 200, followed by `GET /api/v2/elitea_core/conversation/prompt_lib/{project}/{id}?messages_limit=10&sort_order=desc` → 200
- Clicking "Got it" on modal 1 (when the underlying id is genuinely gone, e.g. concurrently deleted): the same two calls return 400, but the app has already re-resolved to a *different* valid conversation by the time you observe the UI — no visible breakage, errors are console-only and non-blocking
- Clicking "Cancel" on modal 2: `PUT /api/v2/elitea_core/conversation/prompt_lib/{project}/{id}` → 200 (a metadata touch, not a delete) — **no** `DELETE` request. Assert its absence (`page.waitForRequest` with a timeout that resolves to "not called," or a network-request array snapshot) as the strongest proof cancel didn't delete
- Clicking "Delete" (real deletion, used only in this AFS's optional cleanup step): fires the actual delete call under `/api/v2/elitea_core/conversation/prompt_lib/{project}/{id}` (method not fully captured in this session's short request-list window — implementer should confirm exact verb/path when wiring the cleanup helper, but functionally confirmed: conversation disappears from the list and a subsequent direct navigation to its id shows modal 1 after the ~12s delay)

## Known Defects Found During Exploration
None. One case-text-drift CLARIFICATION filed: **GH#69** — case's Test Data table assumes the second modal's confirm button is "Confirm"; live button is "Delete" (heading "Delete conversation?"), and this conversation-delete dialog is a distinct, simpler component from the Agent/Pipeline entity delete-confirmation (no type-exact-name gate) documented in GH#28 — don't conflate the two when TC-052/TC-053 land.

Investigated and ruled out as *not* a defect (documented here so a future analyst doesn't re-file it): a post-delete client-side redirect once briefly landed on another session's concurrently-deleted conversation id and produced two console 400s with no immediately-visible dialog — retested patiently (~12s wait) and confirmed the "Conversation not found" modal does appear for that exact condition too, just after the same delay as the case's own "wait up to 15 seconds" already anticipates. Initial "silent failure" read was an artifact of checking too early, not a product bug.

## Blocked Steps
None.

## Automation Hints
- Framework: Playwright/TypeScript (per `.agents/testing.md`), flat/primitive-heavy path — no page object exists yet for chat/conversation list; per `.agents/testing.md` § Structure, a modal-handling helper is expected to emerge from this module's implementation — this case is a strong candidate to seed it (`dialogCount()`, `expectNoDialog()`, `expectDialog(name)` helpers would serve TC-050 through TC-056 uniformly)
- Wait strategy: use `expect(page.getByRole('dialog', { name: ... })).toBeVisible({ timeout: 15000 })` for modal 1 — do not shorten below 15s, the delay is real and confirmed via two independent trigger paths
- Recommend asserting `page.locator('[role="dialog"]').count()` stays `<= 1` across the whole test as a standing regression guard for "multiple modals" — this is the case's actual point and the cheapest, most general assertion for it
- If the implementer follows the disposable-fixture pattern (recommended for isolation under this module's high test-parallelism), name it `TC055_${Date.now()}` or similar per this suite's fixture-naming convention, and make deletion the very last step of the test (not just of a Cancel-path variant) so no fixture leaks
