# Test Case: Navigate Back Without Saving Shows Confirmation

## Metadata
- **TMS ID**: TC-029
- **Linked Story**: GH#16 (EPIC), GH#54 (case tracking issue)
- **Priority**: l3
- **Environment Explored**: `https://next.elitea.ai/` — live, shared test account (`alita@elitea.ai`), executed in an isolated `playwright-cli -s=TC-029` session in parallel alongside sibling analysts TC-020..028
- **Analyst**: qa-engineer (Sage), 2026-07-02
- **Status**: ready-for-automation

## Preconditions
- App accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — confirmed via `getByRole('textbox', {name:'Username or email'})` / `{name:'Password'}` / `getByRole('button', {name:'Sign In'})` on the Keycloak SSO page (`auth.elitea.ai`); lands on `${BASE_URL}app/chat/` on success, then navigate to `${BASE_URL}app/pipelines/all`
- Browser window maximized (case's own Setup step 1 — cosmetic for a headed run; not load-bearing for a headless CI run, no functional dependency observed on viewport size for this flow)
- A dismissible, non-blocking "Announcing ELITEA 2.0.4!" release-notes banner may appear on `/app/pipelines/all` — not a modal, does not block interaction; safe to leave or dismiss via its "close" button

## Test Data
### Existing (re-use)
- `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — stored in `.env`
- Description text: `This data should be discarded` (case's literal value)
- Tag: `unsaved` (case's literal value)
- Welcome message: `Test unsaved welcome` (case's literal value)

### Must Generate (in test setup)
- Unique pipeline Name — **must stay ≤ 32 characters**. The `Name *` field has a hard client-side `maxlength="32"` HTML attribute, confirmed live on the Pipelines create form (same defect class as GH#27, originally filed against the Agents form — corroborated for Pipelines from this case, see § Known Defects). The case's own template `TEST_Pipeline_UnsavedChanges_${timestamp}` is 30 literal chars + a 13-digit ms timestamp = 43 chars, which silently truncates to `TEST_Pipeline_UnsavedChanges_178` (32 chars) with only 3 digits of the timestamp surviving — the uniqueness suffix is effectively lost. **Use a short prefix instead**, e.g. `` `TC029_${Date.now()}` `` (6 + 13 = 19 chars, comfortably under the cap) — confirmed to survive intact.

### Must Clean Up (in teardown)
- None. Confirmed via two independent channels that no pipeline was created:
  1. Network: `GET .../search_options/prompt_lib/{ownerId}?query={generatedName}&...&entities[]=pipeline...` → response `{"pipeline": {"total": 0, "rows": []}, ...}`
  2. UI: typing the generated name into the pipelines-list search box renders the empty-state text `"No Pipelines Match"` (confirmed via `document.body.innerText` scan; renders inside the search results panel, same UX pattern as the Agents module's `"No Agents Match"` — see `test-specs/agents/l3_navigate-back-without-saving_TC-019.md` § Test Data)
  - Case's own Teardown ("None required — no pipeline was created") is confirmed accurate.

## Test Steps
1. Navigate to `${BASE_URL}app/pipelines/all`. Wait for network idle (no fixed sleep — the case's "wait 10 seconds" is a manual-execution artifact, see `.agents/testing.md` § Conventions). Dismiss the release-notes banner if present.
   - **Verify**: card grid container `#EliteACustomTabPanel` renders `.MuiCard-root` cards (existing handle, `tests/pages/cardGridList.page.ts`)
2. Capture `initial_count` from the "Pipelines: N" text badge (best-effort scrape — no stable selector exists, see Concrete Handles).
   - **Verify**: badge parses to a positive integer (observed `3` at start of this run — see Known Defects for why this is not a stable baseline under concurrent execution)
3. Click the sidebar pipeline-create control: `getByRole('button', {name:'Pipeline', exact:true})` (top of side-bar, above the nav list).
   - **Verify**: URL becomes `${BASE_URL}app/pipelines/create?viewMode=owner`
4. Fill `getByRole('textbox', {name:'Name *'})` with the generated name (≤32 chars, see Test Data).
   - **Verify**: read the field's `.value` back and assert it equals the generated name in full (don't assume the literal input survived — same truncation defect as GH#27)
5. Fill `getByRole('textbox', {name:'Description *'})` with `This data should be discarded`.
   - **Verify**: field value matches
6. Click `getByRole('combobox', {name:'Tags'})`, type `unsaved`, press `Enter`.
   - **Verify**: a chip `getByRole('button', {name:'unsaved', exact:true})` appears in the Tags region
7. Fill `getByRole('textbox', {name:'Input your welcome message'})` with `Test unsaved welcome`.
   - **Verify**: field value matches (read back via `textContent`); the header's `Save`/`Cancel` buttons transition from `disabled` to enabled (confirms the form is now registered as dirty — use this as the wait condition before step 8, not a fixed sleep)
8. Click the Back arrow icon button (top-left of the form header, immediately left of the tab list — no accessible name exists, see Concrete Handles).
   - **Verify**: a `dialog` appears with `role="dialog"`, `aria-modal="true"`, `aria-labelledby="alert-dialog-title"`, `aria-describedby="alert-dialog-description"`, a `.MuiBackdrop-root` backdrop element, accessible name **"Warning"**, body text **"There are unsaved changes. Are you sure you want to leave?"**, containing two buttons: **"Cancel"** and **"Confirm"**
9. Click the dialog's `getByRole('button', {name:'Confirm'})`.
   - **Verify**: dialog closes
10. Wait for navigation / network idle.
    - **Verify**: URL matches `${BASE_URL}app/pipelines/all` as a prefix/contains check (observed live: `?viewMode=owner` query param appended — do not assert exact string equality, see Known Defects)
11. Assert no pipeline was created — two channels:
    a. Type the generated name into `getByRole('textbox', {name:'search'})`; wait for the `GET .../search_options/...&entities[]=pipeline...` response.
       - **Verify**: response body `pipeline.total === 0` (primary, race-free assertion — see Network Behavior)
    b. Observe the search results panel.
       - **Verify**: empty state `"No Pipelines Match"` renders; no card with the generated name exists anywhere in the grid
12. (Informational only — see Known Defects) Clear the search box and re-read the "Pipelines: N" badge.
    - **Note**: do not hard-assert exact equality to `initial_count` when this suite runs concurrently with other test sessions against the same shared account — see environmental note below.

## Expected Results
- Clicking the Back arrow on a dirty create-pipeline form shows a native-feeling MUI confirmation dialog ("Warning" / "There are unsaved changes. Are you sure you want to leave?" / Cancel / Confirm) before allowing navigation away, with a backdrop present
- Clicking "Confirm" discards the in-progress form and returns to `/app/pipelines/all` (with a `viewMode=owner` query param carried over)
- Clicking the dialog's "Cancel" button instead returns to the form with all field values intact and does **not** navigate away (verified independently — see Coverage Map Axis 2)
- No `POST` create-pipeline request fires at any point in the flow (confirmed via full network log for the session — none observed, only analytics beacons)
- The generated pipeline name never appears anywhere in the account: `search_options` API returns `pipeline.total: 0`, and the UI's own "No Pipelines Match" empty state confirms it
- No console errors or warnings at any point (checked via `console` command — 0 errors / 0 warnings across the whole run)
- No teardown/cleanup required — nothing was persisted

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Precondition: app accessible, user authenticated | dashboard/chat loads | precondition | login flow completes, lands on `/app/chat/`, confirmed via `window.location.href` | asserted |
| Setup 1: maximize window (`window.moveTo`/`resizeTo`) | all UI elements visible | — | not load-bearing for headless CI; not executed verbatim | out-of-scope *(cosmetic, no functional dependency observed, same treatment as TC-015/TC-019)* |
| Setup 2: verify authenticated state via `/app/chat/` | no redirect = authenticated | precondition | confirmed: no redirect | asserted |
| 1 Navigate to `/app/pipelines/all` | list page loads | step 1 | step 1: card grid renders | asserted |
| 2 Wait 10s for lazy loading | cards visible | step 1 | step 1: network-idle wait (decomposed — condition-based, not fixed sleep per `.agents/testing.md` § Conventions) | asserted *(decomposed)* |
| 3 Close any modal dialogs if present | modal dismissed | step 1 | step 1: banner dismissed (non-blocking release-notes banner, not a modal) | asserted |
| 4 Read "Pipelines: N" badge, note `initial_count` | count captured | step 2 | step 2: badge scrape (`3` observed) | asserted |
| 5 Click "Create Pipeline" button in left sidebar | form opens at `/app/pipelines/create?viewMode=owner` | step 3 | step 3: URL assertion | clarification *(button's accessible name is "Pipeline", not "Create Pipeline" — same drift class as GH#30, corroborated for Pipelines from this case)* |
| 6 Fill Name field | value set | step 4 | step 4: value read-back | clarification *(Name field silently truncates at 32 chars — same defect class as GH#27, corroborated for Pipelines from this case; case's own `${timestamp}` template loses most of the uniqueness digits)* |
| 7 Fill Description field | value set | step 5 | step 5: value read-back | asserted |
| 8 Fill Tags combobox, press Enter | tag "unsaved" added | step 6 | step 6: chip button appears | asserted |
| 9 Fill Welcome message textarea | value set | step 7 | step 7: value read-back | asserted |
| 10 Click Back arrow button (top-left) | unsaved-changes modal appears with backdrop | step 8 | step 8: dialog + backdrop appear | asserted *(also: Back button has no accessible name — same gap class as GH#36, corroborated for Pipelines from this case)* |
| 11 Verify modal shows message about discarding, "Discard"/"Cancel" (or similar) buttons | modal content confirmed | step 8 | step 8: dialog role/heading/body/button text | clarification *(actual dialog: heading "Warning", body "There are unsaved changes. Are you sure you want to leave?", buttons "Cancel"/"Confirm" — not "Discard"/"Cancel". Same dialog copy independently verified as identical to the Agents-module Back-arrow dialog (TC-019/GH#36) — see Known Defects)* |
| 12 Click "Discard" button in modal | modal closes, form closed without saving | step 9 | step 9: click "Confirm" (live equivalent), dialog closes | clarification *(no button literally named "Discard" in this dialog — same as agents-module finding)* |
| 13 Verify URL is `/app/pipelines/all` | navigation returned to list | step 10 | step 10: URL prefix/contains assertion | clarification *(observed `/app/pipelines/all?viewMode=owner` — extra query param, same as agents-module finding)* |
| 14 Wait 10s for lazy loading | cards load | step 10 | step 10: network-idle wait (decomposed) | asserted *(decomposed)* |
| 15 Search for pipeline card with generated name | card NOT found | step 11 | step 11a/b: `search_options` API `pipeline.total===0` + UI "No Pipelines Match" empty state | asserted |
| 16 Verify "Pipelines: N" badge shows same count as `initial_count` | count unchanged | step 12 | step 12: informational re-read only | clarification *(badge count is not stable in a shared account under concurrent test execution — observed 3→5 during this run, caused by sibling analysts TC-020/021/027/028 creating their own test pipelines in parallel. Not a product defect; an environmental/test-strategy caveat identical to the one documented in `test-specs/agents/l3_navigate-back-without-saving_TC-019.md`. Primary "no pipeline created" proof is step 11's network assertion, which is race-free; the badge check is demoted to informational)* |
| Expected Final State (prose): modal appeared, form closed without saving, count/pipelines unchanged, URL is `/app/pipelines/all` | as described | steps 8–12 | throughout | asserted *(via the above, with the noted clarifications)* |
| Teardown: none required (no pipeline created) | nothing to clean up | step 11 | step 11a/b confirms no persistence | asserted |

### Axis 2 — Analyst additions

- Verified `window.location.href` immediately after login and at each major navigation, to guard against the project's known parallel-browser-session-hijack failure mode (`.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`) — *added: this run executed alongside 9 concurrent sibling analysts (TC-020..028) sharing the same test account; confirming URL identity after every navigate is cheap insurance against silently asserting on a sibling's page state.*
- Asserted zero console errors/warnings across the entire flow (`console` command → 0/0) — *added: standard side-channel discipline; the case text doesn't mention console health.*
- Asserted no `POST` create-pipeline request fired at any point (full network log reviewed) — *added: a stronger, request-level guarantee than "card not visible in UI," which could theoretically miss a created-but-unrendered pipeline.*
- Used the `search_options` API response (`pipeline.total`) as the primary "no pipeline created" check rather than only the UI/DOM — *added: discovered this endpoint fires as a debounced side-effect of typing in the search box; it's authoritative and immune to the lazy-loaded card grid's pagination/rendering timing, and immune to the concurrent-account-mutation noise that makes the "Pipelines: N" badge unreliable in this environment.*
- Independently re-triggered the entire dirty-form → Back-arrow → dialog flow a **second time** on a fresh navigation, specifically to (a) confirm the dialog's exact copy is deterministic/repeatable, not a one-off render, and (b) exercise the dialog's **"Cancel" (stay)** button, which the case's own steps never test (the case only exercises the "leave" branch via "Discard") — *added: confirmed clicking "Cancel" keeps the user on `/app/pipelines/create?viewMode=owner` with all field values intact (re-read `Name *` value after clicking Cancel — unchanged), and does not fire any navigation or create request. This closes a gap the case itself doesn't cover and is a natural extension for the implementer to assert alongside the "leave" branch.*
- Confirmed the dialog's `aria-modal="true"`, `aria-labelledby="alert-dialog-title"`, `aria-describedby="alert-dialog-description"`, and `.MuiBackdrop-root` presence via direct DOM inspection while the dialog was open — *added: the case's own step 10 says "with backdrop" but doesn't specify how to verify it; captured the concrete selector for the implementer.*
- (state "none" beyond the above.)

## Cleanup
1. None required — no pipeline was created (confirmed via `search_options` API + UI "No Pipelines Match" empty state, see Test Data § Must Clean Up)

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Login username | `getByRole('textbox', { name: 'Username or email' })` | none needed |
| Login password | `getByRole('textbox', { name: 'Password' })` | none needed |
| Sign In button | `getByRole('button', { name: 'Sign In' })` | none needed |
| Sidebar pipeline-create control | `getByRole('button', { name: 'Pipeline', exact: true })` (top of side-bar, above the Chat/Agents/Skills/Pipelines nav list) | none — accessible name is `"Pipeline"`, not `"Create Pipeline"` (corroborated GH#30) |
| Name field | `getByRole('textbox', { name: 'Name *' })` | none — has `maxLength=32` (corroborated GH#27) |
| Description field | `getByRole('textbox', { name: 'Description *' })` | none needed |
| Tags input | `getByRole('combobox', { name: 'Tags' })` | none needed |
| Tag chip (post-add) | `getByRole('button', { name: 'unsaved', exact: true })` | none needed |
| Welcome message textarea | `getByRole('textbox', { name: 'Input your welcome message' })` | none needed |
| Header Save/Cancel (dirty-state signal) | `getByRole('button', { name: 'Save', exact: true })` — check `disabled` attribute clears | none needed |
| Back arrow icon button | **No accessible name/label/testid exists** (corroborated GH#36). Structural fallback: first unnamed icon-button inside the form header, direct sibling of the `tablist` element (`page.locator('button').filter({ hasText: '' })` scoped to the form-header container, or positionally "icon-button immediately left of the tab list in the form header," identical DOM shape to the Agents-module Back arrow) | none higher-tier available — flagged per Locator Ladder stop+flag rule |
| Unsaved-changes dialog (Back-arrow trigger) | `getByRole('dialog', { name: 'Warning' })` | scope by `aria-describedby="alert-dialog-description"` + text match `"There are unsaved changes. Are you sure you want to leave?"` |
| Dialog "Cancel" (stay) button | `page.getByRole('dialog', { name: 'Warning' }).getByRole('button', { name: 'Cancel' })` | none needed |
| Dialog "Confirm" (leave/discard) button | `page.getByRole('dialog', { name: 'Warning' }).getByRole('button', { name: 'Confirm' })` | none needed |
| Pipelines-list search box | `getByRole('textbox', { name: 'search' })` | `getByPlaceholder("Let's find something amazing!")` |
| "No Pipelines Match" empty state | `page.getByText('No Pipelines Match')` | none needed |
| "Pipelines: N" badge | No stable selector (no `data-testid`/role/label). Best-effort: `page.evaluate(() => document.body.innerText.match(/Pipelines:\s*(\d+)/)?.[1])` | none higher-tier — treat as **informational only** under concurrent execution (see Known Defects); do not gate CI on exact-count equality |
| Card grid container / cards (existing) | `#EliteACustomTabPanel` / `.MuiCard-root` (per `tests/pages/cardGridList.page.ts`, GH#13) | none — confirmed floor, no `data-testid` exists on cards |

## Network Behavior
- `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?tags=&sort_by=created_at&sort_order=desc&query=&agents_type=pipeline&limit=20&offset=0` — fires on `/app/pipelines/all` mount. `200` observed.
- `GET /api/v2/elitea_core/search_options/prompt_lib/{ownerId}?query={name}&sort=id&order=desc&entities[]=tag&entities[]=pipeline&tag_limit=20&tag_offset=0&col_limit=20&col_offset=0` — fires (debounced, ~1s) as the user types in the pipelines-list search box. Response shape: `{"application": {...}, "pipeline": {"total": N, "rows": [...]}, "collection": {...}, "tag": {...}, "toolkit": {...}, "credential": {...}, "skill": {...}}`. **Use `pipeline.total === 0` as the primary, race-free "no pipeline created" assertion.**
- No `POST` to any pipeline-create endpoint observed at any point in this flow — confirmed via full session network log (only Google Analytics beacons and socket.io polling, both unrelated background noise).

## Known Defects Found During Exploration
- **[INFO/CLARIFICATION] — corroborated, not filed as new** on [`GH#36`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/36) (originally filed against TC-019/Agents module): the Pipelines module's Back-arrow-triggered unsaved-changes dialog has the **identical** shape as the Agents module's — heading "Warning", body "There are unsaved changes. Are you sure you want to leave?", buttons "Cancel"/"Confirm", `.MuiBackdrop-root` present. TC-029's own case text (steps 11–12) assumed "Discard"/"Cancel" copy, which does not match. The Back arrow button also has no accessible name/label/testid on the Pipelines form, same gap as the Agents form. Post-Confirm URL carries an extra `?viewMode=owner` query param vs. the case's exact `/app/pipelines/all`. Comment added to GH#36 with this corroboration (see issue for detail).
- **[INFO/CLARIFICATION] — corroborated, not filed as new** on [`GH#27`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/27) (originally filed against the Agents create form): the Pipelines create form's `Name *` field has the identical 32-char `maxLength` silent-truncation behavior. Comment added with repro detail.
- **[INFO/CLARIFICATION] — corroborated, not filed as new** on [`GH#30`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/30) (originally filed against the Agents sidebar control): the Pipelines sidebar create-control's accessible name is `"Pipeline"` only, not `"Create Pipeline"` as the case text says — same drift class. Comment added.
- **Environmental note (not a product defect, not filed)**: the "Pipelines: N" badge is not a reliable "unchanged" signal when this suite runs concurrently with other sessions against the same shared test account — observed the badge move 3 → 5 mid-run due to concurrent sibling analysts (TC-020, TC-021, TC-027, TC-028) creating their own pipelines in parallel. This mirrors the identical environmental caveat already documented in `test-specs/agents/l3_navigate-back-without-saving_TC-019.md`. Recommend the implementer gate the exact-count assertion behind confirmation that `pipelines.spec.ts` runs serially/in isolation in CI; otherwise rely on the step-11 network assertion as the authoritative check.
- **No new product bugs found beyond the above (all already tracked/corroborated).** The unsaved-changes-guard flow (Back arrow → dialog → Confirm/Cancel) is functionally correct end-to-end for Pipelines: no pipeline is persisted on Confirm, the dialog's Cancel button correctly preserves the draft and stays on the form, and no console/network errors occurred anywhere in the flow.

## Blocked Steps
None. Case executed end-to-end (twice, to independently verify both dialog buttons) with no access, data, or environment blockers.

## Automation Hints
- Framework: Playwright (TypeScript), confirmed per `.agents/testing.md`. Lands in `tests/pipelines.spec.ts` (module batch), not `tests/smoke.spec.ts`.
- Page object: extend the planned `tests/pages/agentForm.page.ts` / `entityForm.page.ts` (per `.agents/testing.md` § Structure — the team was already evaluating parametrizing this across Agents and Pipelines; this case's finding that Name-field-truncation, sidebar-button-naming, and the unsaved-changes dialog are ALL identical between the two modules is strong evidence in favor of the `entityForm.page.ts` parametrized-name direction over building two near-duplicate page objects) with: the Back-arrow button locator, the "Warning" dialog locator + Cancel/Confirm buttons. This can share the exact same dialog-interaction helper the Agents module's TC-019/TC-015 use — the dialog is byte-for-byte identical in copy and structure.
- Wait strategy: gate the Back-arrow click on the header `Save` button's `disabled` attribute clearing (confirms the form is registered dirty) rather than a fixed sleep after the last fill.
- Generate the test pipeline name as `` `TC029_${Date.now()}` `` (19 chars) — do not use the case's literal `TEST_Pipeline_UnsavedChanges_${timestamp}` template, which exceeds the 32-char field cap and loses its uniqueness suffix entirely.
- Assert "no pipeline created" primarily via the `search_options` network response (`pipeline.total === 0`), not via badge-count diffing — see Known Defects environmental note. This makes the test robust to running in parallel with other suites/workers against the same shared account.
- Consider asserting BOTH dialog branches (Confirm→leave AND Cancel→stay) in the automated test, since this AFS's Axis 2 addition found the "stay" branch is untested by the original case but is cheap to add and closes a real behavioral gap.
- This module's `modal-handling` sibling should treat this "Warning" (router/Back-triggered) dialog the same way the Agents module's plan already treats it — one dialog-interaction helper shared across Agents and Pipelines' Back-arrow triggers, since the copy/structure is confirmed identical.
