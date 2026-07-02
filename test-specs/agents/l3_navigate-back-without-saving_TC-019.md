# Test Case: Navigate Back Without Saving Shows Confirmation

## Metadata
- **TMS ID**: TC-019
- **Linked Story**: GH#16 (EPIC), GH#26 (case tracking issue)
- **Priority**: l3
- **Environment Explored**: `https://next.elitea.ai/` — live, shared test account (`alita@elitea.ai`), executed in parallel alongside sibling analysts TC-010..018
- **Analyst**: qa-engineer (Sage), 2026-07-02, isolated session via `playwright-cli -s=TC-019`
- **Status**: ready-for-automation

## Preconditions
- App accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — confirmed via `getByRole('textbox', {name:'Username or email'})` / `{name:'Password'}` / `getByRole('button', {name:'Sign In'})` on the Keycloak SSO page (`auth.elitea.ai`); lands on `${BASE_URL}app/chat/` on success
- Browser window maximized (case's own Setup step 1 — cosmetic for a headed run; not load-bearing for a headless CI run, no functional dependency observed on viewport size for this flow)
- A dismissible, non-blocking "Announcing ELITEA X.X.X" release-notes banner may appear post-login — not a modal, does not block interaction; safe to leave or dismiss via its "close" button

## Test Data
### Existing (re-use)
- `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — stored in `.env`
- Description text: `This data should be discarded` (literal, 31 chars — well under the Description field's limit)
- Tag: `unsaved` (literal)
- Guidelines text: `Test unsaved guidelines` (literal)

### Must Generate (in test setup)
- Unique agent Name — **must stay ≤ 32 characters**. The `Name *` field has a hard client-side `maxlength="32"` HTML attribute (confirmed via `el.maxLength`); this is a pre-existing, already-filed defect (GH#27, found by TC-011's analyst). The case's own template `TEST_Agent_UnsavedChanges_${timestamp}` is 26 literal chars + a 13-digit ms timestamp = 39+ chars, which silently truncates to exactly `TEST_Agent_UnsavedChanges_TC019_` (32 chars) with **zero digits of the timestamp surviving** — i.e. the uniqueness suffix is lost entirely. **Use a short prefix instead**, e.g. `` `TC019_${Date.now()}` `` (6 + 13 = 19 chars, comfortably under the cap).

### Must Clean Up (in teardown)
- None. Confirmed via two independent channels that no agent was created:
  1. Network: `GET .../search_options/prompt_lib/{ownerId}?query={generatedName}&...&entities[]=application...` → response `{"application": {"total": 0, "rows": []}, ...}`
  2. UI: filtering the agents list by the generated name renders the empty state — **[Implementer amendment, 2026-07-02]** re-verified live during automation and corrected: the search-results empty state actually renders `"No Agents Match"` (a `listitem` inside the search dropdown's results panel, alongside a sibling `"No Tags Match"` for the Tags section), the same text TC-015's AFS already documented for the identical `search_options` empty-result scenario. `"No agents yet" / "Create your first agent to get started..."` (this AFS's original claim) was not reproduced against the live app and appears to be a different empty state (a zero-agents-in-account state, not a zero-search-results state) — reverse-masking guard applies, asserting the live-verified `"No Agents Match"` text instead of the stale claim. See `tests/pages/cardGridList.page.ts`'s `noAgentsMatchText()`.
  - Case's own Teardown ("None required — no agent was created") is confirmed accurate.

## Test Steps
1. Navigate to `${BASE_URL}app/agents/all`. Wait for network idle (no fixed sleep — the case's "wait 10 seconds" is a manual-execution artifact, see `.agents/testing.md` § Conventions). Dismiss the release-notes banner if present (not a blocking modal — no dialog appeared blocking this flow in this run).
   - **Verify**: card grid container `#EliteACustomTabPanel` renders `.MuiCard-root` cards (existing handle, `tests/pages/cardGridList.page.ts`)
2. Capture `initial_count` from the "Agents: N" text badge (best-effort scrape — no stable selector exists, see Concrete Handles).
   - **Verify**: badge parses to a positive integer (observed `213` at start of this run)
3. Click the sidebar agent-create control: `getByRole('navigation', {name:'side-bar'}).getByRole('button', {name:'Agent', exact:true})`.
   - **Verify**: URL becomes `${BASE_URL}app/agents/create?viewMode=owner`
4. Fill `getByRole('textbox', {name:'Name *'})` with the generated name (≤32 chars, see Test Data).
   - **Verify**: read the field's `.value` back and assert it equals the generated name in full (don't assume the literal input survived — GH#27)
5. Fill `getByRole('textbox', {name:'Description *'})` with `This data should be discarded`.
   - **Verify**: field value matches
6. Click `getByRole('combobox', {name:'Tags'})`, type `unsaved`, press `Enter`.
   - **Verify**: a chip `getByRole('button', {name:'unsaved', exact:true})` appears in the Tags region
7. Fill `getByRole('textbox', {name:'Guidelines for the AI agent'})` with `Test unsaved guidelines`.
   - **Verify**: field value matches; the header's `Save`/`Cancel` buttons transition from `disabled` to enabled (confirms the form is now registered as dirty — use this as the wait condition before step 8, not a fixed sleep)
8. Click the Back arrow icon button (top-left of the form header, immediately left of the tab list — no accessible name exists, see Concrete Handles / GH#36 for the locator).
   - **Verify**: a `dialog` appears with `role="dialog"`, `aria-modal="true"`, accessible name **"Warning"**, body text **"There are unsaved changes. Are you sure you want to leave?"**, containing two buttons: **"Cancel"** and **"Confirm"**
9. Click the dialog's `getByRole('button', {name:'Confirm'})`.
   - **Verify**: dialog closes
10. Wait for navigation / network idle.
    - **Verify**: URL matches `${BASE_URL}app/agents/all` as a prefix/contains check (observed live: `?viewMode=owner` query param appended — do not assert exact string equality, see Known Defects)
11. Assert no agent was created — two channels:
    a. Type the generated name into `getByRole('textbox', {name:'search'})`; wait for the `GET .../search_options/...&entities[]=application...` response.
       - **Verify**: response body `application.total === 0` (primary, race-free assertion — see Network Behavior)
    b. Observe the filtered card list.
       - **Verify**: empty state `"No Agents Match"` renders (corrected 2026-07-02 per implementer live re-verification — see § Test Data Must Clean Up amendment; original AFS text said `"No agents yet"`); no card with the generated name exists
12. (Informational only — see Known Defects) Clear the search box and re-read the "Agents: N" badge.
    - **Note**: do not hard-assert exact equality to `initial_count` when this suite runs concurrently with other test sessions against the same shared account — see environmental note below.

## Expected Results
- Clicking the Back arrow on a dirty create-agent form shows a native-feeling MUI confirmation dialog ("Warning" / "There are unsaved changes. Are you sure you want to leave?" / Cancel / Confirm) before allowing navigation away
- Clicking "Confirm" discards the in-progress form and returns to `/app/agents/all` (with a `viewMode=owner` query param carried over)
- No `POST` create-agent request fires at any point in the flow (confirmed via full network log for the session — none observed)
- The generated agent name never appears anywhere in the account: `search_options` API returns `application.total: 0`, and the UI's own "No Agents Match" filtered empty state confirms it (corrected 2026-07-02, see § Test Data Must Clean Up amendment)
- No console errors or warnings at any point (checked via `console error`/`console warning` — 0/0 across the whole run)
- No teardown/cleanup required — nothing was persisted

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Precondition: app accessible, user authenticated | dashboard/chat loads | step (precondition) | login flow completes, lands on `/app/chat/` | asserted |
| Setup 1: maximize window | all UI elements visible | — | not load-bearing for headless CI; omitted from AFS steps | out-of-scope *(cosmetic, no functional dependency observed)* |
| Setup 2: verify authenticated state | no redirect to login | precondition | `window.location.href` check post-login | asserted |
| 1 Navigate to `/app/agents/all` | list page loads | step 1 | step 1: card grid renders | asserted |
| 2 Wait 10s for lazy loading | cards visible | step 1 | step 1: network-idle wait (decomposed — condition-based, not fixed sleep per `.agents/testing.md` § Conventions) | asserted *(decomposed)* |
| 3 Close any modal dialogs if present | modal dismissed | step 1 | step 1: banner check | asserted *(no blocking modal appeared this run — only a dismissible non-blocking release-notes banner)* |
| 4 Read "Agents: N" badge, note `initial_count` | count captured | step 2 | step 2: badge scrape | asserted |
| 5 Click "Create Agent" button in sidebar | form opens at `/app/agents/create?viewMode=owner` | step 3 | step 3: URL assertion | clarification *(button's accessible name is "Agent", not "Create Agent" — already filed as GH#30 by TC-015's analyst, same control, not re-filed)* |
| 6 Fill Name field | value set | step 4 | step 4: value read-back | clarification *(Name field silently truncates at 32 chars — already filed as GH#27 by TC-011's analyst; case's own `${timestamp}` template loses all uniqueness digits)* |
| 7 Fill Description field | value set | step 5 | step 5: value read-back | asserted |
| 8 Fill Tags combobox, press Enter | tag "unsaved" added | step 6 | step 6: chip button appears | asserted |
| 9 Fill Guidelines textarea | value set | step 7 | step 7: value read-back | asserted |
| 10 Click Back arrow button (top-left) | unsaved-changes modal appears with backdrop | step 8 | step 8: dialog appears | asserted *(also: Back button has no accessible name — filed as GH#36)* |
| 11 Verify modal shows message about discarding, "Discard"/"Cancel" (or similar) buttons | modal content confirmed | step 8 | step 8: dialog role/heading/body/button text | clarification *(actual dialog: heading "Warning" (not "Warning Close" — that's the OTHER modal, shown by TC-014/015's explicit Cancel button), body "There are unsaved changes. Are you sure you want to leave?", buttons "Cancel"/"Confirm" — not "Discard"/"Cancel". Filed as GH#36, distinguishing this from TC-014's dialog)* |
| 12 Click "Discard" button in modal | modal closes, form closed without saving | step 9 | step 9: click "Confirm" (live equivalent), dialog closes | clarification *(no button literally named "Discard" in this dialog variant — GH#36)* |
| 13 Verify URL is `/app/agents/all` | navigation returned to list | step 10 | step 10: URL prefix/contains assertion | clarification *(observed `/app/agents/all?viewMode=owner` — extra query param, GH#36 finding 3)* |
| 14 Wait 10s for lazy loading | cards load | step 10 | step 10: network-idle wait (decomposed) | asserted *(decomposed)* |
| 15 Search for agent card with generated name | card NOT found | step 11 | step 11a/b: `search_options` API `application.total===0` + UI empty state | asserted |
| 16 Verify "Agents: N" badge shows same count as `initial_count` | count unchanged | step 12 | step 12: informational re-read only | clarification *(badge count is not stable in a shared account under concurrent test execution — observed 213→217 during this very run, caused by sibling analysts TC-010..018 creating/deleting their own test agents in parallel. Not a product defect; an environmental/test-strategy caveat. Primary "no agent created" proof is step 11's network assertion, which is race-free; the badge check is demoted to informational — see Known Defects)* |
| Expected Final State (prose): modal appeared, form closed without saving, count/agents unchanged, URL is `/app/agents/all` | as described | steps 8–12 | throughout | asserted *(via the above, with the noted clarifications)* |
| Teardown: none required (no agent created) | nothing to clean up | step 11 | step 11a/b confirms no persistence | asserted |

### Axis 2 — Analyst additions

- Verified `window.location.href` immediately after login and at each major navigation, to guard against the project's known parallel-browser-session-hijack failure mode (`.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`) — *added: this run executed alongside 9 concurrent sibling analysts sharing the same test account; confirming URL identity after every navigate is cheap insurance against silently asserting on a sibling's page state.*
- Asserted zero console errors/warnings across the entire flow (`console error` / `console warning` → 0/0) — *added: standard side-channel discipline; the case text doesn't mention console health.*
- Asserted no `POST` create-agent request fired at any point (full network log reviewed) — *added: a stronger, request-level guarantee than "card not visible in UI," which could theoretically miss a created-but-unrendered agent.*
- Used the `search_options` API response (`application.total`) as the primary "no agent created" check rather than only the UI/DOM — *added: discovered this endpoint fires as a debounced side-effect of typing in the search box; it's authoritative and immune to the lazy-loaded card grid's pagination/rendering timing, and immune to the concurrent-account-mutation noise that makes the "Agents: N" badge unreliable in this environment.*
- (state "none" beyond the above.)

## Cleanup
1. None required — no agent was created (confirmed via `search_options` API + UI empty state, see Test Data § Must Clean Up)

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Login username | `getByRole('textbox', { name: 'Username or email' })` | none needed |
| Login password | `getByRole('textbox', { name: 'Password' })` | none needed |
| Sign In button | `getByRole('button', { name: 'Sign In' })` | none needed |
| Sidebar agent-create control | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Agent', exact: true })` | none — accessible name is `"Agent"`, not `"Create Agent"` (GH#30) |
| Name field | `getByRole('textbox', { name: 'Name *' })` | none — has `maxLength=32`, GH#27 |
| Description field | `getByRole('textbox', { name: 'Description *' })` | none needed |
| Tags input | `getByRole('combobox', { name: 'Tags' })` | none needed |
| Tag chip (post-add) | `getByRole('button', { name: 'unsaved', exact: true })` | none needed |
| Guidelines textarea | `getByRole('textbox', { name: 'Guidelines for the AI agent' })` | none needed |
| Header Save/Cancel (dirty-state signal) | `getByRole('button', { name: 'Save', exact: true })` — check `disabled` attribute clears | none needed |
| Back arrow icon button | **No accessible name/label/testid exists** (GH#36). Structural fallback: `page.locator('div:has(> .MuiTabs-root) > button')` (first match) — the button is a direct-child sibling of the `.MuiTabs-root` tab-header container. Positionally: "icon-button immediately left of the tab list in the form header." | none higher-tier available — flagged per Locator Ladder stop+flag rule, not silently used without documentation |
| Unsaved-changes dialog (Back-arrow trigger variant) | `getByRole('dialog', { name: 'Warning' })` | scope by `aria-describedby="alert-dialog-description"` + text match `"There are unsaved changes. Are you sure you want to leave?"` |
| Dialog "Cancel" (stay) button | `page.getByRole('dialog', { name: 'Warning' }).getByRole('button', { name: 'Cancel' })` | none needed |
| Dialog "Confirm" (leave/discard) button | `page.getByRole('dialog', { name: 'Warning' }).getByRole('button', { name: 'Confirm' })` | none needed |
| Agents-list search box | `getByRole('textbox', { name: 'search' })` | `getByPlaceholder("Let's find something amazing!")` |
| "Agents: N" badge | No stable selector (no `data-testid`/role/label). Best-effort: `page.evaluate(() => document.body.innerText.match(/Agents:(\d+)/)?.[1])`, scoped near the author-facet panel (sibling text nodes `"Agents:"` + count). | none higher-tier — treat as **informational only** under concurrent execution (see Known Defects); do not gate CI on exact-count equality |
| Card grid container / cards (existing) | `#EliteACustomTabPanel` / `.MuiCard-root` (per `tests/pages/cardGridList.page.ts`, GH#12) | none — confirmed floor, no `data-testid` exists on cards |

## Network Behavior
- `GET /api/v2/elitea_core/search_options/prompt_lib/{ownerId}?query={name}&sort=id&order=desc&entities[]=tag&entities[]=application&tag_limit=20&tag_offset=0&col_limit=20&col_offset=0` — fires (debounced, ~1s) as the user types in the agents-list search box. Response shape: `{"application": {"total": N, "rows": [...]}, ...}`. **Use `application.total === 0` as the primary, race-free "no agent created" assertion** — this is the recommended replacement for a badge-count-diff or DOM-card-count check in a shared/concurrently-mutated account.
- `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?tags=&sort_by=created_at&sort_order=desc&query=&agents_type=classic&limit=20&offset=0` — paginated agent-list fetch on `/app/agents/all` load; subsequent scroll triggers `offset` increments (existing `cardGridList.page.ts` pattern, unchanged by this case)
- No `POST` to any agent-create endpoint observed at any point in this flow — confirmed via full session network log

## Known Defects Found During Exploration
- **[INFO/CLARIFICATION]** Filed as [`GH#36`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/36) — bundles three related findings from this case's Back-arrow navigation flow (steps 8–13):
  1. The Back-arrow-triggered unsaved-changes dialog is a **different** dialog than the one TC-014/TC-015 documented for the form's own explicit "Cancel" button (heading "Warning" vs "Warning Close"; body "...are you sure you want to leave?" vs "...discard changes?"; buttons "Cancel"/"Confirm" vs "Cancel"/"Discard"). Case text (TC-019 steps 11–12) assumed the Cancel-button variant's copy.
  2. The Back arrow button has no accessible name, `aria-label`, tooltip, or `data-testid` — same class of gap as GH#12/#13.
  3. Post-confirm URL carries an extra `?viewMode=owner` query param vs. the case's exact `/app/agents/all`.
- **Already filed, not duplicated**: [`GH#30`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/30) — sidebar button's accessible name is `"Agent"` not `"Create Agent"` (found independently by TC-015's analyst on the same control; applies identically here).
- **Already filed, not duplicated**: [`GH#27`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/27) — Name field silently truncates at 32 characters (found by TC-011's analyst; this run's generated name lost 100% of its timestamp suffix as a direct consequence).
- **Environmental note (not a product defect, not filed)**: the "Agents: N" badge is not a reliable "unchanged" signal when this suite runs concurrently with other sessions against the same shared test account — observed the badge move 213 → 217 mid-run due to 9 concurrent sibling analysts (TC-010..018) creating/deleting their own agents in parallel. This is expected given `.agents/testing.md`'s own "reuse-existing, shared account" test-data strategy; it just means step 16's literal "same count" check is CI-environment-dependent. Recommend the implementer gate the exact-count assertion behind confirmation that the `agents.spec.ts` suite runs serially/in isolation in CI; otherwise rely on the step-11 network assertion as the authoritative check.

## Blocked Steps
- None. Case executed end-to-end with no access, data, or environment blockers.

## Automation Hints
- Framework: Playwright (TypeScript), confirmed per `.agents/testing.md`
- Page object: extend the planned `tests/pages/agentForm.page.ts` (per `.agents/testing.md` § Structure — shared create/edit form object for the agents module) with: the Back-arrow button locator, the "Warning" dialog locator + Cancel/Confirm buttons. Keep this distinct from whatever helper TC-014/015 add for the "Warning Close" (Cancel-button) dialog variant — they are not the same component instance.
- Wait strategy: gate the Back-arrow click on the header `Save` button's `disabled` attribute clearing (confirms the form is registered dirty) rather than a fixed sleep after the last fill.
- Generate the test agent name as `` `TC019_${Date.now()}` `` (19 chars) — do not use the case's literal `TEST_Agent_UnsavedChanges_${timestamp}` template, which exceeds the 32-char field cap (GH#27) and loses its uniqueness suffix entirely.
- Assert "no agent created" primarily via the `search_options` network response (`application.total === 0`), not via badge-count diffing — see Known Defects environmental note. This makes the test robust to running in parallel with other suites/workers against the same shared account.
- This module's `modal-handling` sibling (TC-054) should treat the "Warning" (router/Back-triggered) and "Warning Close" (Cancel-button-triggered) dialogs as two distinct, separately-keyed modal patterns, not one shared helper — see GH#36.
