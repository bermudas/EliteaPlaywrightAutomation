# Test Case: Cancel Button Discards Changes (Pipelines)

## Metadata
- **TMS ID**: TC-025
- **Linked Story**: GH#50 (parent epic GH#16)
- **Priority**: l3
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`)
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via `GET ${BASE_URL}/app/chat/` not redirecting to a login page
- Browser window maximized — translated to the project's fixed `1920×1080` Playwright viewport config (`playwright.config.ts` `use.viewport`), same translation TC-001–TC-005 and the agents-module AFS (TC-015) already use; this analyst's own manual exploration ran at `playwright-cli`'s smaller default viewport (`sr=1280x720`), and the Cancel/Discard flow was unaffected — no card-grid/column-count dependency in this case

## Test Data
### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — standard smoke/regression account
- Pipelines list at `${BASE_URL}/app/pipelines/all`, owner/project id `21` ("Private")

### Must Generate (in test setup)
- Pipeline name: `TEST_Pipeline_Cancel_TC025_${Date.now()}` (used `TEST_Pipeline_Cancel_TC025_1783027329175` during this exploration) — the case's own literal pattern is `TEST_Pipeline_Cancel_${timestamp}`; this AFS adds the `TC025` infix per this batch's cross-analyst collision-avoidance convention (10 sibling analysts, TC-020..TC-029, running concurrently against the same shared account at analysis time). **Note the 32-char truncation defect below** — whatever name is typed, only the first 32 characters persist in the DOM value; budget test-data generators accordingly (this did not block this case since the draft is discarded either way).
- Description: `This pipeline should not be created` (case's literal value)
- Tag: `temp` (case's literal value)
- Welcome message: `Test welcome message` (case's literal value)

### Must Clean Up (in teardown)
- **None.** Confirmed end-to-end: Cancel → Discard genuinely abandons the draft, no pipeline record is created server-side (see § Network Behavior — no `POST` to any pipeline-create endpoint fires; confirmed via the search API returning `pipeline.total: 0` for the generated name after the flow completed). Matches the case's own Teardown ("None required").

## Test Steps
1. Navigate to `${BASE_URL}/app/pipelines/all`
   - **Verify**: URL is `${BASE_URL}/app/pipelines/all`
2. Wait for the pipelines list to finish its initial load — condition wait on the `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?...agents_type=pipeline...offset=0` response (200) plus at least one `.MuiCard-root` visible inside `#EliteACustomTabPanel` (same handles TC-004/TC-015 established for the analogous agents-list pattern) — **not** a fixed 10s sleep
3. Dismiss the release-notes banner if present — **observed on this route during exploration** (the "Announcing ELITEA 2.0.4!" banner appeared on `/app/pipelines/all` immediately post-navigation; dismissed via `button "close"` before proceeding). Unlike TC-015's agents-module run (where the banner was not observed on `/app/agents/all`), this run **did** see it on `/app/pipelines/all` — dismiss-if-present is the correct branch, not "never observed"
4. Read the current count from the "Pipelines: N" badge
   - **Verify**: capture `initial_count` from the badge/API (observed `1` at exploration start, via both the UI badge and the list API's own `.total` field) — **for automation, treat this only as an informational baseline, not a strict pre/post equality gate** (see step 16 and § Known Defects — this account is shared across concurrently-dispatched analysts/tests and the count can change from unrelated concurrent activity independent of this test's own actions; observed live drift `1 → 6` across this single exploration run, entirely from sibling analysts TC-020/TC-021/TC-022/TC-028 concurrently creating pipelines, not from this test)
5. Click the "Create Pipeline" control in the left sidebar
   - **Verify**: URL becomes `${BASE_URL}/app/pipelines/create?viewMode=owner` (case's Expected Result matches exactly) — **re-authored**: the control's accessible name is **"Pipeline"** only, not "Create Pipeline" (see Known Defects / GH#30, same ticket as the Agents module's equivalent drift, now retitled to cover both)
6. Fill `textbox "Name *"` with the generated pipeline name
   - **Verify**: field contains the value — **caveat**: only the first 32 characters actually persist in the DOM (see Known Defects / GH#27)
7. Fill `textbox "Description *"` with `This pipeline should not be created`
   - **Verify**: field contains the value
8. Fill `combobox "Tags"` with `temp` and press `Enter`
   - **Verify**: a `temp` chip renders inside the Tags field
9. Fill `textbox "Input your welcome message"` with `Test welcome message`
   - **Verify**: field contains the value
10. Verify the "Cancel" button (top-right form toolbar) is enabled
    - **Verify**: `getByRole('button', { name: 'Cancel' })` is enabled (NOT `[disabled]`) — confirmed it starts `[disabled]` on a pristine form and becomes enabled once the form is dirtied (already enabled by the time step 9 completed)
11. Click "Cancel"
    - **Verify**: an unsaved-changes confirmation dialog appears — `role="dialog"`, heading accessible name **"Warning Close"** (visible heading text "Warning" plus an adjacent "Close" (×) icon button that both roll into the heading's accessible name), body text **"Are you sure you want to discard changes?"**, with "Cancel" (returns to the form) and "Discard" (confirms) buttons. URL does **not** change yet (still `/app/pipelines/create?viewMode=owner`) — case's Expected Result ("modal appears") is the branch that actually fires; the form-closes-directly branch was not observed. **This is confirmed to be the identical dialog copy/shape as the Agents module's own Cancel-button dialog (TC-015) — NOT the different "There are unsaved changes. Are you sure you want to leave?" / Cancel-Confirm dialog documented for the Back-arrow-navigation trigger (TC-019 in agents; TC-029 is this module's own Back-arrow sibling and was independently NOT assumed to match — verified this case's own dialog directly against the live app instead of inheriting TC-029's shape, per this batch's dispatch instruction and the corroborated lesson from the agents module's TC-015/TC-019 mix-up.**
12. Click "Discard" in the confirmation dialog
    - **Verify**: dialog closes, URL becomes `${BASE_URL}/app/pipelines/all`
13. Verify URL is `${BASE_URL}/app/pipelines/all`
    - **Verify**: exact URL match (already covered by step 12's own assertion — kept as its own checkpoint per the case's own step split)
14. Wait for the pipelines list to reload — condition wait on the re-fetched `GET .../applications/prompt_lib/{ownerId}?...agents_type=pipeline...offset=0` response (200), same handle as step 2 — **not** a fixed 10s sleep
15. Search for a pipeline card with the generated name
    - **Action**: type the generated pipeline name into `textbox "search"` (placeholder `"Let's find something amazing!"`)
    - **Verify (primary, strongest)**: the underlying `GET /api/v2/elitea_core/search_options/prompt_lib/{ownerId}?query={name}&...&entities[]=pipeline&...` response has `pipeline.total === 0` and `pipeline.rows` is empty
    - **Verify (secondary, UI-level)**: the search-suggestion dropdown/tooltip shows "No Pipelines Match" — **note**: this text renders inside a `tooltip`-role autocomplete/suggestion panel triggered by typing into the search box; it does **not** live-filter the main card grid below (the grid still shows all 6 unfiltered cards while the dropdown independently reports zero matches) — assert against the dropdown text or the API, not against the main grid's card count
16. Verify the "Pipelines: N" badge — **re-authored, do not port the case's literal exact-equality assertion as-is**
    - **Verify**: badge count is `>= initial_count` (never assert `=== initial_count` in a run where other concurrent activity on the shared account is possible — same "lower-bound not exact" guard TC-003/TC-004/TC-015 already established for read-only/post-mutation counts on this shared account). The step 15 name-absence check (primary) is what actually proves "no pipeline was created by this test" — the badge is a secondary sanity signal only.

## Expected Results
- Form is closed without saving
- Discard confirmation dialog is the actual mechanism ("Cancel" click always triggers it once the form is dirty — no direct-close-without-modal branch observed)
- No new pipeline named `TEST_Pipeline_Cancel_TC025_*` exists after the flow (confirmed via both the search API's `pipeline.total === 0` and the UI's "No Pipelines Match" suggestion)
- URL returns to `${BASE_URL}/app/pipelines/all`
- No `POST`/`PUT` request to any pipeline-create or pipeline-persist endpoint fires at any point in the flow
- Zero console errors/warnings throughout (confirmed: 0 errors, 0 warnings for the full session)
- All underlying API responses are `2xx` (confirmed: all `applications/prompt_lib` and `search_options/prompt_lib` calls returned `200`)

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Preconditions: app accessible, user authenticated, window maximized | environment ready | precondition | confirmed pre-navigation: no login redirect; viewport handled at project-config level | asserted |
| Setup 1: maximize browser window | all UI elements visible | precondition | translated to fixed `1920×1080` Playwright viewport config, per project convention | asserted *(re-authored — see Preconditions note)* |
| Setup 2: verify authenticated state via `/app/chat/` | no redirect = authenticated | precondition | confirmed: no redirect, landed on `/app/chat/37?name=...` | asserted |
| Test Data: pipeline name/description/tag/welcome-message values | data available for form fill | steps 6–9 | steps 6–9: each field's value | asserted |
| 1 Navigate to `/app/pipelines/all` | pipeline list page loads | step 1 | step 1: URL | asserted |
| 2 Wait 10s for lazy loading | all pipeline cards visible | step 2 | step 2: condition wait on API response + card visibility | asserted *(re-authored: condition wait, not fixed sleep, per `.agents/testing.md` § Conventions)* |
| 3 Close any modal dialogs if present | modal dismissed | step 3 | step 3: release-notes banner observed and dismissed | asserted *(exercised this run — unlike TC-015's agents-module run where no modal appeared, this run DID see the banner)* |
| 4 Read "Pipelines: N" badge, note as `initial_count` | count captured | step 4 | step 4: badge text captured (`1`) | asserted |
| 5 Click "Create Pipeline" button in left sidebar | form opens at `/app/pipelines/create?viewMode=owner` | step 5 | step 5: URL exact match | asserted *(re-authored: button's accessible name is "Pipeline", not "Create Pipeline" — see Known Defects / GH#30)* |
| 6 Fill `textbox "Name *"` | field contains value | step 6 | step 6 | asserted *(caveat: 32-char truncation — see Known Defects / GH#27)* |
| 7 Fill `textbox "Description *"` | field contains value | step 7 | step 7 | asserted |
| 8 Fill `combobox "Tags"` with `temp` + Enter | tag added | step 8 | step 8: chip renders | asserted |
| 9 Fill `textbox "Input your welcome message"` | field contains value | step 9 | step 9 | asserted |
| 10 Verify "Cancel" button enabled | button active/clickable | step 10 | step 10: enabled state | asserted |
| 11 Click "Cancel" | form closes or modal appears | step 11 | step 11: dialog appears (confirmed branch) | asserted *(case anticipated both branches; only the modal branch was observed)* |
| 12 If unsaved changes modal appears, click "Discard" or "Confirm" | modal closes, return to list | step 12 | step 12: dialog closes, URL changes (button clicked was "Discard", not "Confirm" — this dialog variant doesn't have a "Confirm" button; see step 11 note on dialog identity) | asserted |
| 13 Verify URL is `/app/pipelines/all` | navigation returned | step 13 | step 13: exact URL | asserted |
| 14 Wait 10s for lazy loading | cards load | step 14 | step 14: condition wait | asserted *(re-authored: condition wait, not fixed sleep)* |
| 15 Search for pipeline card by name | card NOT found | step 15 | step 15: API `pipeline.total===0` + UI "No Pipelines Match" suggestion | asserted *(strengthened — see Axis 2)* |
| 16 Verify "Pipelines: N" badge equals `initial_count` | count unchanged | step 16 | step 16: `>= initial_count`, not `=== initial_count` | asserted *(re-authored — see Known Defects: exact-equality is not automatable in this shared-account environment; name-absence in step 15 is the authoritative proof)* |
| Expected Final State: form closed, no pipeline created, count unchanged, URL is `/app/pipelines/all` | overall outcome | steps 12–16 | steps 12–16 combined | asserted |
| Teardown: none required | n/a | — | — | asserted (confirmed no pipeline persisted — nothing to clean up) |

### Axis 2 — Analyst additions
- Step 11 independently verifies this case's dialog is the **Cancel-button variant** (heading "Warning Close", body "Are you sure you want to discard changes?", buttons Cancel/Discard) and explicitly rules out the **Back-arrow-navigation variant** (heading "Warning", body "There are unsaved changes. Are you sure you want to leave?", buttons Cancel/Confirm) documented for TC-019 (agents) / expected for TC-029 (this module's own Back-arrow sibling) — *added: this dispatch's own briefing flagged a prior mistake in the agents module where TC-015 initially assumed its dialog matched TC-019's without checking; verifying this independently here prevents repeating that mistake and gives the implementer a confirmed, not assumed, handle.*
- Step 15 asserts the **API-level** `pipeline.total === 0` from `GET .../search_options/prompt_lib/{ownerId}?query=...` in addition to the case's own UI-level "card not found" check — *added: the badge/UI count alone is provably unreliable in this shared, concurrently-mutated test account (see Known Defects); the search API's own `total` field for the exact generated name is a precise, concurrency-immune proof that no matching record exists server-side.*
- Step 15 also documents that the search box's dropdown/suggestion panel ("No Pipelines Match") is a **separate UI surface** from the main card grid, which does not live-filter on typing — *added: observed directly during exploration (grid still showed 6 unfiltered cards while the dropdown reported zero matches); an implementer naively asserting "no card with this name in the grid" without pressing Enter or reading the dropdown could get a false picture depending on which surface they check, so this is called out explicitly.*
- Expected Results adds "no `POST`/`PUT` to any pipeline-create endpoint fires" — *added: directly verified via the network log (zero `POST` calls to any `applications/prompt_lib`-shaped create endpoint across the whole Cancel→Discard flow); this is the strongest possible proof the Cancel action is a true no-op server-side, not just a UI-level illusion.*
- Expected Results adds "zero console errors/warnings" — *added: verified clean (`0 errors, 0 warnings`) across the full session; guards against a silent regression the case's own steps don't check for.*
- **Cross-case note for the reviewer (per dispatch instruction):** this case's dialog is confirmed to use the **identical copy** as the Agents module's own Cancel-button dialog (TC-015) — heading "Warning Close", body "Are you sure you want to discard changes?", Cancel/Discard buttons. This strongly suggests both create forms (Agents, Pipelines) share the same underlying discard-confirmation dialog component, consistent with `.agents/testing.md`'s own note that the two forms are "near-identical" and may eventually share one `entityForm.page.ts`. If a shared `modal-handling` helper exists by the time this is implemented (per the planned `modal-handling` module), this case's dialog interaction should use it and can share the exact same locator set TC-015 already documents — do **not** conflate it with TC-029's (Back-arrow) dialog, which is a structurally different component with different copy and buttons.

## Cleanup
None required — confirmed no pipeline was created (see § Test Data → Must Clean Up and § Network Behavior).

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| "Create Pipeline" sidebar control | `page.locator('nav[aria-label="side-bar"]').getByRole('button', { name: 'Pipeline', exact: true })` — accessible name is **"Pipeline"**, not "Create Pipeline" (see Known Defects / GH#30) | adjacent dropdown-chevron button (unnamed) for alternate creation options — not explored this case |
| Name field | `page.getByRole('textbox', { name: 'Name *' })` | none needed — tier-1 handle (caveat: 32-char DOM-level truncation, GH#27) |
| Description field | `page.getByRole('textbox', { name: 'Description *' })` | none needed — tier-1 handle |
| Tags input | `page.getByRole('combobox', { name: 'Tags' })` | none needed — tier-1 handle |
| Tag chip (after add) | `page.getByRole('button', { name: 'temp' })` (chip renders as a button with its own remove icon) | text match on chip label |
| Welcome message field | `page.getByRole('textbox', { name: 'Input your welcome message' })` | none needed — tier-1 handle |
| Form "Save" button | `page.getByRole('button', { name: 'Save' })` — `[disabled]` on a pristine form, enabled once dirtied | none needed — tier-1 handle |
| Form "Cancel" button (top toolbar) | `page.getByRole('button', { name: 'Cancel' }).first()` — scope to the form toolbar; disambiguate from the in-dialog "Cancel" (see below) by asserting before the dialog is open, or by scoping to the tabpanel's toolbar region | none needed — tier-1 handle, but **must disambiguate** from the dialog's own "Cancel" once the dialog is open (same accessible name, different element) |
| Discard-confirmation dialog | `page.getByRole('dialog').filter({ hasText: 'Are you sure you want to discard changes?' })` | `page.getByRole('heading', { name: /Warning Close/ })` |
| Dialog "Discard" button | `page.getByRole('dialog').getByRole('button', { name: 'Discard' })` | none needed — tier-1 handle |
| Dialog "Cancel" button (returns to form, not exercised this run) | `page.getByRole('dialog').getByRole('button', { name: 'Cancel' })` | none needed — tier-1 handle |
| Dialog "Close" (×) icon (not exercised this run) | `page.getByRole('dialog').getByRole('button', { name: 'Close' })` | none needed — tier-1 handle |
| Pipelines-list search box | `page.getByRole('textbox', { name: 'search' })` (placeholder `"Let's find something amazing!"`) | `page.getByPlaceholder("Let's find something amazing!")` |
| Search "no results" signal (UI, dropdown) | `page.getByRole('tooltip').getByText('No Pipelines Match')` — this is the search-suggestion dropdown, **not** the main card grid (grid does not live-filter on typed input) | none needed — tier-1 handle, but note the surface distinction above |
| Total pipeline count (footer badge) | `page.getByText(/^Pipelines:\s*\d+/)` + regex extraction — same pattern TC-015's Implementer Amendment established for "Agents:" | Direct API check: `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?...agents_type=pipeline&limit=1&offset=0` → response `.total` |
| Pipeline-not-found proof (strongest — API) | `GET /api/v2/elitea_core/search_options/prompt_lib/{ownerId}?query={name}&entities[]=tag&entities[]=pipeline&...` → response `.pipeline.total === 0` | UI "No Pipelines Match" dropdown text (secondary) |

## Network Behavior
- `GET /api/v2/elitea_core/applications/prompt_lib/21?tags=&sort_by=created_at&sort_order=desc&query=&agents_type=pipeline&limit=20&offset=0` — fires on `/app/pipelines/all` mount/re-mount (steps 2 and 14). `200` observed both times; `.total` was `1` (step 2/4) and `6` (step 14/16) — the increase came entirely from sibling analysts (TC-020, TC-021, TC-022, TC-028) concurrently creating pipelines on the same shared account, confirmed by inspecting the returned `rows[].name` values, none of which matched this case's generated name.
- A parallel `limit=1` status-count query (`agents_type=pipeline&limit=1&offset=0`) fires alongside the main list call each time — used for the badge total, same pattern as the agents module.
- `GET /api/v2/elitea_core/search_options/prompt_lib/21?query={name}&sort=id&order=desc&entities[]=tag&entities[]=pipeline&tag_limit=20&tag_offset=0&col_limit=20&col_offset=0` — fires on typing into the search box (step 15). Response shape: `{ application: {...}, collection: {...}, tag: {...}, pipeline: { total, rows }, toolkit: {...}, credential: {...}, skill: {...} }`. Observed `pipeline.total: 0` for the generated name — `200`.
- **No `POST`/`PUT` request to any pipeline-create or pipeline-persist endpoint fires anywhere in the Cancel→Discard flow** — confirmed by full request-log inspection across the entire session (steps 1–16). This is the authoritative server-side proof the Discard action is a genuine no-op, not just a client-side UI reset.
- Analytics beacons (`google-analytics.com/g/collect`, `google.com/g/collect`) and `socket.io` polling fire continuously in the background — unrelated noise, not part of this case's assertions.
- Wait strategy for the implementer: `page.waitForResponse(resp => resp.url().includes('/applications/prompt_lib/') && resp.url().includes('agents_type=pipeline') && resp.status() === 200)` after each navigation to `/app/pipelines/all` (steps 2, 14); `page.waitForResponse(resp => resp.url().includes('/search_options/prompt_lib/') && resp.status() === 200)` after typing into search (step 15) — no fixed-duration sleeps anywhere.

## Known Defects Found During Exploration
The Cancel/Discard flow itself is functionally correct end-to-end: no pipeline is persisted, the confirmation dialog behaves consistently, and no console/network errors occurred. Three case-authoring/product items were surfaced:

- **[MINOR] — corroborated (comment, not a new issue)** on [`GH#27`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/27) (retitled to "Name field silently truncates at 32 characters, no counter or warning (Agents + Pipelines)"): the Pipelines create form's `Name *` field silently truncates to 32 characters at the DOM level (`el.value`), same `maxlength` cap and zero-feedback behavior already documented for the Agents module's Name field by four independent prior analysts (TC-010/011/012/017). This is the first confirmation the same defect exists on the **Pipelines** form too — filed as a corroboration comment rather than a new issue, consistent with this project's own established convention for same-root-cause findings within a shared component.
- **[INFO / CLARIFICATION] — corroborated (comment, not a new issue) on** [`GH#30`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/30) (retitled to "Sidebar 'Create X' button's accessible name drops the 'Create' prefix (Agents: 'Agent'; Pipelines: 'Pipeline')"): case Step 5 says 'Click "Create Pipeline" button in left sidebar' — the live control's accessible name is **"Pipeline"** only (no "Create" prefix). Originally filed as a standalone issue (GH#55) before discovering that a sibling analyst (TC-024, same batch, tracking issue #49) had independently hit the identical finding minutes earlier and deliberately chose not to file it separately, treating it as a low-value duplicate of the already-established GH#30 pattern. Reconciled: closed GH#55, moved the corroboration onto GH#30 instead, consistent with TC-024's precedent and this project's established corroborate-don't-refile convention (see also GH#27).
- **Not filed — documented here directly** (same treatment TC-003/TC-015's AFS gave their own count-instability notes, no separate GH ticket): case Step 16 asserts the "Pipelines: N" badge equals the pre-flow `initial_count` **exactly**. This holds for a single, isolated test run, but is **not safely automatable as a strict equality** in any environment where the account is shared across concurrent test execution — confirmed live during this very exploration, where the badge moved `1 → 6` purely from 4 sibling analysts (TC-020, TC-021, TC-022, TC-028) concurrently creating pipelines on the same account, with zero contribution from this test's own actions. Re-authored in § Test Steps step 16 to `>= initial_count` (never decreases) as a secondary sanity check, with the step 15 name-specific API/UI absence check carrying the actual proof burden. Automation engineer: if/when this suite gets a dedicated, non-shared test account or per-test data isolation, the exact-equality form of step 16 can be safely restored — until then, use the re-authored form.

## Blocked Steps
None. All 2 Setup steps and all 16 case steps were executed end-to-end against the live system (Setup step 1's literal `window.moveTo`/`resizeTo` script itself was not executed verbatim — translated to the project's fixed-viewport config per the established convention, same as every prior AFS in this repo).

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md`. Per the `.agents/testing.md` § Structure module plan, this case lands in `tests/pipelines.spec.ts` (new file, batched with the rest of the `pipelines` module TC-020..029), independent of `tests/smoke.spec.ts` and `tests/agents.spec.ts` — this case has no dependency on any other suite's session state (fresh login is sufficient).
- Page object: reuse `tests/pages/cardGridList.page.ts` (existing, confirmed same `#EliteACustomTabPanel` / `.MuiCard-root` container/card pattern on `/app/pipelines/all` as on `/app/agents/all`) for list-state assertions (steps 2, 4, 14, 16). The create-form fields (steps 6–9) and the discard dialog (steps 11–12) are strong candidates for the planned `tests/pages/agentForm.page.ts` (or a renamed/parametrized `entityForm.page.ts`, per `.agents/testing.md`'s own open question) — this case, TC-020, TC-021, TC-022, TC-024, TC-026, TC-027, TC-028 (all in the same `pipelines` module batch) touch the identical create/edit form, and it is now confirmed near-identical to the Agents form (same discard-dialog copy, same 32-char Name truncation) — strengthens the case for a single shared, parametrized form page object across both modules rather than two independently-duplicated ones.
- Modal handling: the discard-confirmation dialog (steps 11–12) is confirmed to be the **same dialog variant** as TC-015 (Agents' own Cancel button) — reuse the exact same locators/helper if one exists by implementation time, and do **not** merge it with whatever helper TC-029 (this module's own Back-arrow case) ends up needing, since that is a structurally different dialog (per the agents module's TC-019 precedent).
- Wait strategy: no `waitForTimeout` anywhere — every "wait N seconds" in the original case is re-authored into a `waitForResponse` condition wait (see § Network Behavior) or a web-first `expect(...).toBeVisible()`/`expect.poll()`, per `.agents/testing.md` § Conventions.
- Test data uniqueness: use `TEST_Pipeline_Cancel_TC025_${Date.now()}` (or the module's shared naming helper if `tests/pipelines.spec.ts` introduces one across TC-020–029) to avoid name collisions with the other 9 cases in this same module running in the same shared account — but budget for the 32-char DOM truncation (GH#27) when asserting the field's displayed/persisted value.
- **Analyst execution note (process/tooling, not product):** ran in a `playwright-cli -s=TC025` isolated session (own in-memory Chrome profile, own pid) specifically because this batch dispatched 10 concurrent sibling analysts (TC-020–TC-029) against the same shared account/browser-MCP surface — per `.agents/memory/qa-engineer/feedback_parallel_analyst_browser_isolation.md`, the project's default shared MCP browser connection is not isolated across concurrent sessions. Verified isolation by confirming a fresh Keycloak login redirect on first navigation (no inherited cookies) and by re-checking `window.location.href` before trusting every read. No cross-talk observed this run beyond the expected shared-account data mutations from sibling analysts (visible in the pipeline list, correctly excluded from this case's own assertions). Does not affect the eventual automated suite, since `npx playwright test` workers each get their own isolated browser context regardless.
