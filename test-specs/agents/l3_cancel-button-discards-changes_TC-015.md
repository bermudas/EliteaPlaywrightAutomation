# Test Case: Cancel Button Discards Changes

## Metadata
- **TMS ID**: TC-015
- **Linked Story**: GH#22 (parent epic GH#16)
- **Priority**: l3
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`)
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via `GET ${BASE_URL}/app/chat/` not redirecting to a login page
- Browser window maximized — translated to the project's fixed `1920×1080` Playwright viewport config (`playwright.config.ts` `use.viewport`), same translation TC-001–TC-005 already use; this analyst's own manual exploration ran at `playwright-cli`'s smaller default viewport (`sr=1280x720`, seen in analytics network params) and the Cancel/discard flow was unaffected — this case has no card-grid/column-count dependency the way TC-003/TC-004 do, so the smaller exploration viewport does not put the findings below at risk

## Test Data
### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — standard smoke/regression account
- Agents list at `${BASE_URL}/app/agents/all`, owner/project id `21` ("Private")

### Must Generate (in test setup)
- Agent name: `TEST_Agent_Cancel_TC015_${Date.now()}` (used `TEST_Agent_Cancel_TC015_1783017470778` during this exploration) — the case's own literal pattern is `TEST_Agent_Cancel_${timestamp}`; this AFS adds the `TC015` infix per this batch's cross-analyst collision-avoidance convention (10 sibling analysts, TC-010..TC-019, running concurrently against the same shared account at analysis time)
- Description: `This agent should not be created` (case's literal value)
- Tag: `temp` (case's literal value)
- Guidelines: `Test guidelines` (case's literal value)

### Must Clean Up (in teardown)
- **None.** Confirmed end-to-end: Cancel → Discard genuinely abandons the draft, no agent record is created server-side (see § Network Behavior — no `POST` to the agent-create endpoint fires; confirmed via the search API returning `application.total: 0` for the generated name after the flow completed). Matches the case's own Teardown ("None required").

## Test Steps
1. Navigate to `${BASE_URL}/app/agents/all`
   - **Verify**: URL is `${BASE_URL}/app/agents/all`
2. Wait for the agents list to finish its initial load — condition wait on the `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?...agents_type=classic...offset=0` response (200) plus at least one `.MuiCard-root` visible inside `#EliteACustomTabPanel` (same handles TC-003 established) — **not** a fixed 10s sleep
3. Dismiss any blocking overlay if present — **not observed on this route during exploration** (the "Announcing ELITEA 2.0.4!" release banner appears on `/app/chat/` post-login, not on `/app/agents/all`; if it persists across navigation in a given run, dismiss via its `button "close"` before proceeding)
4. Read the current count from the "Agents: N" badge
   - **Verify**: capture `initial_count` from the badge (observed `211` at exploration start) — **for automation, treat this only as an informational baseline, not a strict pre/post equality gate** (see step 16 and § Known Defects — this account is shared across concurrently-dispatched analysts/tests and the badge count can change from unrelated concurrent activity independent of this test's own actions; observed live drift `211 → 217` across this single exploration run, entirely from sibling analysts' concurrent agent-creation cases, not from this test)
5. Click the "Create Agent" control in the left sidebar
   - **Verify**: URL becomes `${BASE_URL}/app/agents/create?viewMode=owner` (case's Expected Result matches exactly)
6. Fill `textbox "Name *"` with the generated agent name
   - **Verify**: field contains the value
7. Fill `textbox "Description *"` with `This agent should not be created`
   - **Verify**: field contains the value
8. Fill `combobox "Tags"` with `temp` and press `Enter`
   - **Verify**: a `temp` chip renders inside the Tags field
9. Fill `textbox "Guidelines for the AI agent"` with `Test guidelines`
   - **Verify**: field contains the value
10. Verify the "Cancel" button (top-right form toolbar) is enabled
    - **Verify**: `getByRole('button', { name: 'Cancel' })` is enabled (NOT `[disabled]`) — confirmed it starts `[disabled]` on a pristine form and becomes enabled only after the form is dirtied (first observed enabled immediately after step 8's tag entry)
11. Click "Cancel"
    - **Verify**: an unsaved-changes confirmation dialog appears — `role="dialog"`, heading "Warning", body text "Are you sure you want to discard changes?", with "Cancel" (returns to the form) and "Discard" (confirms) buttons, plus a "Close" (×) icon button. URL does **not** change yet (still `/app/agents/create?viewMode=owner`) — case's Expected Result ("modal appears") is the branch that actually fires; the form-closes-directly branch was not observed
12. Click "Discard" in the confirmation dialog
    - **Verify**: dialog closes, URL becomes `${BASE_URL}/app/agents/all`
13. Verify URL is `${BASE_URL}/app/agents/all`
    - **Verify**: exact URL match (already covered by step 12's own assertion — kept as its own checkpoint per the case's own step split)
14. Wait for the agents list to reload — condition wait on the re-fetched `GET .../applications/prompt_lib/{ownerId}?...offset=0` response (200), same handle as step 2 — **not** a fixed 10s sleep
15. Search for an agent card with the generated name
    - **Action**: type the generated agent name into `textbox "search"` (placeholder `"Let's find something amazing!"`)
    - **Verify (primary, strongest)**: the underlying `GET /api/v2/elitea_core/search_options/prompt_lib/{ownerId}?query={name}&...&entities[]=application&...` response has `application.total === 0` and `application.rows` is empty
    - **Verify (secondary, UI-level)**: the search results panel shows "No Agents Match" and no card with the generated name renders anywhere in the grid
16. Verify the "Agents: N" badge — **re-authored, do not port the case's literal exact-equality assertion as-is**
    - **Verify**: badge count is `>= initial_count` (never assert `=== initial_count` in a run where other concurrent activity on the shared account is possible — same "lower-bound not exact" guard TC-003/TC-004 already established for read-only counts; here the guard applies to a post-mutation-attempt count instead). The step 15 name-absence check (primary) is what actually proves "no agent was created by this test" — the badge is a secondary sanity signal only, since it is legitimately mutable by other actors on this shared account.

## Expected Results
- Form is closed without saving
- Discard confirmation dialog is the actual mechanism ("Cancel" click always triggers it once the form is dirty — no direct-close-without-modal branch observed)
- No new agent named `TEST_Agent_Cancel_TC015_*` exists after the flow (confirmed via both the search API's `application.total === 0` and UI "No Agents Match")
- URL returns to `${BASE_URL}/app/agents/all`
- No `POST` request to any agent-create endpoint fires at any point in the flow
- Zero console errors/warnings throughout (confirmed: 0 errors, 0 warnings for the full session)
- All underlying API responses are `2xx` (confirmed: all `applications/prompt_lib` and `search_options/prompt_lib` calls returned `200`)

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Preconditions: app accessible, user authenticated, window maximized | environment ready | precondition | confirmed pre-navigation: no login redirect; viewport handled at project-config level | asserted |
| Setup 1: maximize browser window | all UI elements visible | precondition | translated to fixed `1920×1080` Playwright viewport config, per TC-001–005 convention | asserted *(re-authored — see Preconditions note)* |
| Setup 2: verify authenticated state via `/app/chat/` | no redirect = authenticated | precondition | confirmed: no redirect, landed on `/app/chat/` | asserted |
| Test Data: agent name/description/tag/guidelines values | data available for form fill | steps 6–9 | steps 6–9: each field's value | asserted |
| 1 Navigate to `/app/agents/all` | agent list page loads | step 1 | step 1: URL | asserted |
| 2 Wait 10s for lazy loading | all agent cards visible | step 2 | step 2: condition wait on API response + card visibility | asserted *(re-authored: condition wait, not fixed sleep, per `.agents/testing.md` § Conventions)* |
| 3 Close any modal dialogs if present | modal dismissed | step 3 | step 3: no modal observed on this route; dismiss-if-present branch documented | asserted *(conditional — not exercised this run, no modal appeared)* |
| 4 Read "Agents: N" badge, note as `initial_count` | count captured | step 4 | step 4: badge text captured (`211`) | asserted |
| 5 Click "Create Agent" button in left sidebar | form opens at `/app/agents/create?viewMode=owner` | step 5 | step 5: URL exact match | asserted *(re-authored: button's accessible name is "Agent", not "Create Agent" — see Known Defects / GH#30)* |
| 6 Fill `textbox "Name *"` | field contains value | step 6 | step 6 | asserted |
| 7 Fill `textbox "Description *"` | field contains value | step 7 | step 7 | asserted |
| 8 Fill `combobox "Tags"` with `temp` + Enter | tag added | step 8 | step 8: chip renders | asserted |
| 9 Fill `textbox "Guidelines for the AI agent"` | field contains value | step 9 | step 9 | asserted |
| 10 Verify "Cancel" button enabled | button active/clickable | step 10 | step 10: enabled state | asserted |
| 11 Click "Cancel" | form closes or modal appears | step 11 | step 11: dialog appears (confirmed branch) | asserted *(case anticipated both branches; only the modal branch was observed — see Automation Hints)* |
| 12 If modal appears, click "Discard"/"Confirm" | modal closes, return to list | step 12 | step 12: dialog closes, URL changes | asserted |
| 13 Verify URL is `/app/agents/all` | navigation returned | step 13 | step 13: exact URL | asserted |
| 14 Wait 10s for lazy loading | cards load | step 14 | step 14: condition wait | asserted *(re-authored: condition wait, not fixed sleep)* |
| 15 Search for agent card by name | card NOT found | step 15 | step 15: API `total===0` + UI "No Agents Match" | asserted *(strengthened — see Axis 2)* |
| 16 Verify "Agents: N" badge equals `initial_count` | count unchanged | step 16 | step 16: `>= initial_count`, not `=== initial_count` | asserted *(re-authored — see Known Defects: exact-equality is not automatable in this shared-account environment; name-absence in step 15 is the authoritative proof)* |
| Expected Final State: form closed, no agent created, count unchanged, URL is `/app/agents/all` | overall outcome | steps 12–16 | steps 12–16 combined | asserted |
| Teardown: none required | n/a | — | — | asserted (confirmed no agent persisted — nothing to clean up) |

### Axis 2 — Analyst additions
- Step 15 asserts the **API-level** `application.total === 0` from `GET .../search_options/prompt_lib/{ownerId}?query=...` in addition to the case's own UI-level "card not found" check — *added: the badge/UI count alone is provably unreliable in this shared, concurrently-mutated test account (see Known Defects); the search API's own `total` field for the exact generated name is a precise, concurrency-immune proof that no matching record exists server-side.*
- Expected Results adds "no `POST` to any agent-create endpoint fires" — *added: directly verified via the network log (zero `POST` calls to any `applications/prompt_lib`-shaped create endpoint across the whole Cancel→Discard flow); this is the strongest possible proof the Cancel action is a true no-op server-side, not just a UI-level illusion.*
- Expected Results adds "zero console errors/warnings" — *added: verified clean (`0 errors, 0 warnings`) across the full session; guards against a silent regression the case's own steps don't check for.*
- **Cross-case note for the reviewer (per dispatch instruction):** clicking the top-toolbar "Cancel" button on the agent create form triggers the **same** "Are you sure you want to discard changes?" dialog (`role="dialog"`, heading "Warning") that TC-019 documents for the *browser-back / route-navigation* trigger. This is the app conflating two distinct trigger paths (explicit Cancel-click vs. navigate-away) into one shared confirmation component — not a defect (both paths correctly protect unsaved work), but worth the reviewer's attention if TC-015's and TC-019's automated specs end up asserting against the identical dialog handles. Recommend the two tests share one dialog-interaction helper if/when a `modal-handling` utility exists (per `.agents/testing.md` § Structure's planned `modal-handling` module), rather than each re-deriving the same locators independently.

## Cleanup
None required — confirmed no agent was created (see § Test Data → Must Clean Up and § Network Behavior).

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| "Create Agent" sidebar control | `page.locator('nav[aria-label="side-bar"]').getByRole('button', { name: 'Agent', exact: true })` — accessible name is **"Agent"**, not "Create Agent" (see Known Defects / GH#30) | adjacent dropdown-chevron button (unnamed) for alternate creation options — not explored this case |
| Name field | `page.getByRole('textbox', { name: 'Name *' })` | none needed — tier-1 handle |
| Description field | `page.getByRole('textbox', { name: 'Description *' })` | none needed — tier-1 handle |
| Tags input | `page.getByRole('combobox', { name: 'Tags' })` | none needed — tier-1 handle |
| Tag chip (after add) | `page.getByRole('button', { name: 'temp' })` (chip renders as a button with its own remove icon) | text match on chip label |
| Guidelines field | `page.getByRole('textbox', { name: 'Guidelines for the AI agent' })` | none needed — tier-1 handle |
| Form "Save" button | `page.getByRole('button', { name: 'Save' })` — `[disabled]` on a pristine form, enabled once dirtied | none needed — tier-1 handle |
| Form "Cancel" button (top toolbar) | `page.getByRole('button', { name: 'Cancel' }).first()` — scope to the form toolbar; disambiguate from the in-dialog "Cancel" (see below) by asserting before the dialog is open, or by scoping to `page.getByRole('tabpanel', { name: 'New Agent' }).locator('..')`'s toolbar region | none needed — tier-1 handle, but **must disambiguate** from the dialog's own "Cancel" once the dialog is open (same accessible name, different element) |
| Discard-confirmation dialog | `page.getByRole('dialog').filter({ hasText: 'Are you sure you want to discard changes?' })` | `page.getByRole('heading', { name: /Warning/ })` |
| Dialog "Discard" button | `page.getByRole('dialog').getByRole('button', { name: 'Discard' })` | none needed — tier-1 handle |
| Dialog "Cancel" button (returns to form, not exercised this run) | `page.getByRole('dialog').getByRole('button', { name: 'Cancel' })` | none needed — tier-1 handle |
| Dialog "Close" (×) icon (not exercised this run) | `page.getByRole('dialog').getByRole('button', { name: 'Close' })` | none needed — tier-1 handle |
| Agents-list search box | `page.getByRole('textbox', { name: 'search' })` (placeholder `"Let's find something amazing!"`) | `page.getByPlaceholder("Let's find something amazing!")` |
| Search "no results" signal (UI) | `page.getByText('No Agents Match')` | none needed — tier-1 handle |
| Total agent count (footer badge) | `page.getByText('Agents:').locator('xpath=following-sibling::*[1]')` — same handle TC-003 confirmed; TC-003's own Implementer Amendment notes the shipped code instead used `page.getByText(/^Agents:\s*\d+/)` + regex extraction (higher locator-ladder tier) — prefer that form here too for consistency | Direct API check: `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?...limit=1&offset=0` → response `.total` |
| Agent-not-found proof (strongest — API) | `GET /api/v2/elitea_core/search_options/prompt_lib/{ownerId}?query={name}&entities[]=application&...` → response `.application.total === 0` | UI "No Agents Match" text (secondary) |

## Network Behavior
- `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?tags=&sort_by=created_at&sort_order=desc&query=&agents_type=classic&limit=20&offset=0` — fires on `/app/agents/all` mount/re-mount (steps 2 and 14). `200` observed both times.
- Four `limit=1` status-count queries (`draft`, `published`, `on_moderation`, `user_approval`, `rejected`) fire alongside the main list call each time — unrelated to this case's assertions.
- `GET /api/v2/elitea_core/search_options/prompt_lib/{ownerId}?query={name}&sort=id&order=desc&entities[]=tag&entities[]=application&tag_limit=20&tag_offset=0&col_limit=20&col_offset=0` — fires on typing into the search box (step 15). Response shape: `{ application: { total, rows }, collection: {...}, tag: {...}, pipeline: {...}, toolkit: {...}, credential: {...}, skill: {...} }`. Observed `application.total: 0` for the generated name — `200`.
- **No `POST`/`PUT` request to any agent-create or agent-persist endpoint fires anywhere in the Cancel→Discard flow** — confirmed by full request-log inspection across the entire session (steps 1–16). This is the authoritative server-side proof the Discard action is a genuine no-op, not just a client-side UI reset.
- Analytics beacons (`google-analytics.com/g/collect`, `google.com/g/collect`) and `socket.io` polling fire continuously in the background — unrelated noise, not part of this case's assertions.
- Wait strategy for the implementer: `page.waitForResponse(resp => resp.url().includes('/applications/prompt_lib/') && resp.url().includes('agents_type=classic') && resp.status() === 200)` after each navigation to `/app/agents/all` (steps 2, 14); `page.waitForResponse(resp => resp.url().includes('/search_options/prompt_lib/') && resp.status() === 200)` after typing into search (step 15) — no fixed-duration sleeps anywhere.

## Known Defects Found During Exploration
**None found in the product.** The Cancel/Discard flow is functionally correct end-to-end: no agent is persisted, the confirmation dialog behaves consistently, and no console/network errors occurred. Two case-authoring/test-strategy items were surfaced, one filed, one documented here only (not filed, per the same non-filing precedent TC-003 set for its own count-instability note):

- **[INFO / CLARIFICATION] — filed** [`GH#30`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/30): case Step 5 says 'Click "Create Agent" button' — the live control's accessible name is **"Agent"** only (no "Create" prefix), same class of drift as GH#9 (TC-002). Filed per `.agents/profile.md` § Bug filing (github-issue, strict-per-bug), referencing TC-015 and linked to parent epic GH#16 / case tracking issue GH#22.
- **Not filed — documented here directly** (same treatment TC-003's AFS gave its own count-instability note, no GH ticket): case Step 16 asserts the "Agents: N" badge equals the pre-flow `initial_count` **exactly**. This holds for a single, isolated test run, but is **not safely automatable as a strict equality** in any environment where the account is shared across concurrent test execution — confirmed live during this very exploration, where the badge moved `211 → 217` purely from 6 sibling analysts (TC-010–TC-014, TC-016–TC-019) concurrently creating/editing/deleting agents on the same account, with zero contribution from this test's own actions. Re-authored in § Test Steps step 16 to `>= initial_count` (never decreases) as a secondary sanity check, with the step 15 name-specific API/UI absence check carrying the actual proof burden. Automation engineer: if/when this suite gets a dedicated, non-shared test account or per-test data isolation, the exact-equality form of step 16 can be safely restored — until then, use the re-authored form.

## Blocked Steps
None. All 2 Setup steps and all 16 case steps were executed end-to-end against the live system (Setup step 1's literal `window.moveTo`/`resizeTo` script itself was not executed verbatim — translated to the project's fixed-viewport config per the established TC-001–005 convention, same as every prior AFS in this repo).

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md`. Per the `.agents/testing.md` § Structure module plan, this case lands in `tests/agents.spec.ts` (new file, batched with the rest of the `agents` module TC-010..019), **not** appended to the existing `tests/smoke.spec.ts` serial chain — this case has no dependency on TC-001–005's session state (fresh login is sufficient).
- Page object: reuse `tests/pages/cardGridList.page.ts` (existing, confirmed same `#EliteACustomTabPanel` / `.MuiCard-root` container/card pattern on `/app/agents/all`) for list-state assertions (steps 2, 4, 14, 16). The create-form fields (steps 6–9) and the discard dialog (steps 11–12) are strong candidates for a new `tests/pages/agentForm.page.ts` per `.agents/testing.md`'s own stated plan — this case, TC-010, TC-011, TC-012, TC-014, TC-016, TC-017, TC-018 (all in the same `agents` module batch) all touch the identical create/edit form, so extracting the page object now (rather than after all land separately) avoids ~8-way duplicate locator definitions.
- Modal handling: the discard-confirmation dialog (steps 11–12) is the same component TC-019 documents for its own (different) trigger — see Axis 2 cross-case note. If a shared `modal-handling` helper exists by the time this is implemented (per `.agents/testing.md`'s planned module), use it instead of a bespoke dialog interaction in `tests/agents.spec.ts`.
- Wait strategy: no `waitForTimeout` anywhere — every "wait N seconds" in the original case is re-authored into a `waitForResponse` condition wait (see § Network Behavior) or a web-first `expect(...).toBeVisible()`/`expect.poll()`, per `.agents/testing.md` § Conventions.
- Test data uniqueness: use `TEST_Agent_Cancel_TC015_${Date.now()}` (or the module's shared naming helper if `tests/agents.spec.ts` introduces one across TC-010–019) to avoid name collisions with the other 9 cases in this same module running in the same shared account.
- **Analyst execution note (process/tooling, not product):** ran in a `playwright-cli -s=TC015` isolated session (own in-memory Chrome profile, own pid) specifically because this batch dispatched 10 concurrent sibling analysts (TC-010–TC-019) against the same shared account/browser-MCP surface — per `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`, the project's default `mcp__playwright__*` MCP connection is a single shared, non-isolated profile across concurrent sessions. Verified isolation by confirming a fresh Keycloak login redirect on first navigation (no inherited cookies) and by re-checking `window.location.href` before trusting every read. No cross-talk observed this run. Does not affect the eventual automated suite, since `npx playwright test` workers each get their own isolated browser context regardless.
