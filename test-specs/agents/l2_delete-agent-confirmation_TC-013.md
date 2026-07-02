# Test Case: Delete Agent with Confirmation

## Metadata
- **TMS ID**: TC-013
- **Linked Story**: GH#20 (own tracking issue, parent epic GH#16)
- **Priority**: l2
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`) — isolated `playwright-cli -s=TC-013` session (own in-memory Chrome profile, confirmed non-shared with the 9 sibling parallel analysts per `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`)
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via `GET ${BASE_URL}/app/chat/` not redirecting to the Keycloak login page
- Browser viewport maximized (case's own Setup step 1)
- **This case is destructive** — it deletes an agent. The analyst created a disposable, uniquely-named fixture agent specifically to delete (see Test Data), rather than deleting any pre-existing/baseline or sibling-analyst fixture.

## Test Data

### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`

### Must Generate (in test setup — case's own Setup step 3)
- A disposable agent via `${BASE_URL}/app/agents/create?viewMode=owner`:
  - Name field input: `TEST_Agent_Delete_TC013_${Date.now()}` (full unix-ms timestamp for uniqueness, per case's own `${timestamp}` convention)
  - Description field input: `Agent to be deleted`
  - **Important constraint discovered**: the Name field has a hard client-side `maxLength="32"` (confirmed via `input.maxLength` DOM property). A `TEST_Agent_Delete_TC013_` prefix is 24 chars, leaving only **8 digits** of budget for the timestamp suffix — the trailing digits of a 13-digit `Date.now()` value get silently dropped by the browser's own maxlength enforcement (confirmed: typed `TEST_Agent_Delete_TC013_1783017343173`, the field/stored value ended up `TEST_Agent_Delete_TC013_17830173` — first 8 digits of the timestamp, last 5 silently truncated).
  - **Parallel-run implication for automation**: because only the leading 8 digits of the ms timestamp survive, two agents created within the same ~100-second window (`10^13 / 10^8 = 10^5 ms`) by different parallel test runs will render an **identical visible name**. Name-text search alone is not a reliable disambiguator for this fixture pattern under parallel execution — automation should capture and match on the **agent id** returned by the create response (see Network Behavior) rather than relying solely on the truncated name string for the "locate my own fixture" step.
  - Observed fixture created this run: id **271**, owner_id **21**, saved name `TEST_Agent_Delete_TC013_17830173`.

### Must Clean Up (in teardown)
- None — deletion via the case's own Steps 7–13 **is** the cleanup. Matches the case's own Teardown section ("agent already deleted in test steps"). Confirmed deleted: `DELETE /api/v2/elitea_core/application/prompt_lib/21/271` → `204`, and the card no longer renders in `#EliteACustomTabPanel` after redirect.

## Test Steps

1. Navigate to `${BASE_URL}/app/agents/create?viewMode=owner`
   - **Verify**: page title contains "Agents"; "New Agent" tab selected
2. Fill `Name *` with `TEST_Agent_Delete_TC013_${Date.now()}` and `Description *` with `Agent to be deleted`
   - **Verify**: "Save" button transitions from `disabled` to enabled once both required fields are non-empty
3. Click "Save"
   - **Verify**: `POST /api/v2/elitea_core/applications/prompt_lib/{ownerId}` returns `201`; navigation lands on `/app/agents/all/{id}?destTab=configuration&name={savedName}&viewMode=owner`; capture `{id}` from the URL/response for later use as the primary disambiguator
4. Navigate to `${BASE_URL}/app/agents/all`
   - **Verify**: URL is `${BASE_URL}/app/agents/all`
5. Wait for the agents list to load — condition wait, not a fixed sleep: wait for `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?...agents_type=classic...offset=0...` (200), then wait for at least one `.MuiCard-root` inside `#EliteACustomTabPanel`
   - **Note**: the list sorts `created_at desc` by default, so a just-created fixture renders on the **first** page (no scroll/lazy-load needed to find it) — confirmed: the fixture card appeared at index 3 of the first 20 cards with zero scrolling.
6. Close any blocking modal/dialog if present (`[role="dialog"]`, "Got it"/"Close"/ESC) — **not observed this run** (only a non-blocking dismissible announcement banner was present after login, closed once; no modal blocked the agents list itself)
7. Locate the fixture's card by matching text content against the saved (truncated) name, or preferably by the id captured in step 3
   - **Verify**: exactly one matching `.MuiCard-root` is visible (see Test Data note on parallel-run name collisions — prefer id-based confirmation when multiple parallel runs may be active)
8. Click the card's name element (the `cursor:pointer` child span/div inside the card — the card root itself has no click handler; see Concrete Handles)
   - **Verify**: navigates to `/app/agents/all/{id}?viewMode=owner&name={savedName}` — **note**: this differs from the case's stated `/app/agents/{id}` pattern (case-text drift, filed as clarification GH#28; live product URL confirmed above is the correct contract)
9. Verify agent name is displayed
   - **Verify**: the page's `tab`/tab-panel accessible name equals the saved (possibly truncated) name; the `Name *` textbox's value equals the saved name
10. Click the overflow-menu (kebab, three-dot) button in the top-right toolbar
    - **Verify**: a `menu` role element opens containing, among other items, a `menuitem` "Delete agent" (enabled) under an "AGENT" section, and a separate, always-`disabled` "Delete" menuitem under a "VERSION" section (do not confuse the two — only "Delete agent" is relevant to this case)
    - **Known defect (GH#33, MINOR, filed)**: this button has no accessible name (no `aria-label`, no visible text — icon-only) and a broken literal `id="undefined-action"` (confirmed on two different agents, ids 253 and 271 — not id-specific, the interpolation variable is never populated). It also has `aria-haspopup="true"`. See Concrete Handles for the recommended (flagged, not ideal) locator.
11. Click "Delete agent" in the menu
    - **Verify**: a `role="dialog"` modal opens with heading "Delete confirmation", body text `Are you sure to delete {agentName}? Enter the name to complete the action.`, a `Name`-labeled text input, and two buttons: "Cancel" (enabled) and "Delete" (**disabled** by default)
    - **Case-text drift (GH#28, filed as CLARIFICATION, reverse-masking guard applies)**: the case (Step 9) expects generic "Confirm"/"Cancel" buttons. The live product instead implements a **type-the-exact-name-to-confirm** pattern — a stricter, deliberate delete-safety UX. Automation must assert against this live contract, not the case's original wording.
12. Type an incorrect value into the Name textbox (e.g. `wrong_name`)
    - **Verify**: "Delete" button remains `disabled` — confirmed live (this is Axis-2 enrichment, see below; not in the original case, but directly validates the type-to-confirm gate actually gates)
13. Clear the textbox and type the exact agent name (`TEST_Agent_Delete_TC013_17830173` for this run's fixture)
    - **Verify**: "Delete" button becomes enabled (`ref` resolves, no `disabled` attribute)
14. Click "Delete"
    - **Verify**: `DELETE /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` fires and returns `204`; page navigates to `${BASE_URL}/app/agents/all` (confirmed: dialog closes and URL becomes exactly `https://next.elitea.ai/app/agents/all`, no query params)
15. Wait for the agents list to reload — condition wait on the list's own `GET .../applications/prompt_lib/...` response, not a fixed sleep
16. Search for the deleted agent's name/id in the reloaded list
    - **Verify**: `[...document.querySelectorAll('#EliteACustomTabPanel .MuiCard-root')].some(c => c.textContent.includes(savedName))` is `false` — confirmed live, immediately after the redirect (no additional wait needed beyond the list's own reload)
17. Check console for errors
    - **Verify**: 0 console errors across the entire flow (steps 1–16) — confirmed (`Total messages: 5 (Errors: 0, Warnings: 0)`, the 5 messages were a benign ASCII-art build-banner log)

## Expected Results
- Fixture agent is created, then permanently deleted via the type-to-confirm dialog
- `DELETE /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` returns `204`
- Final URL is exactly `${BASE_URL}/app/agents/all`, no query params
- Deleted agent's card no longer renders in `#EliteACustomTabPanel` after reload
- No console errors during the entire create → navigate → delete → verify flow
- No error messages/toasts visible post-deletion

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Setup 1: maximize browser window | UI elements visible | precondition | viewport set before navigation | asserted |
| Setup 2: verify authenticated state via `/app/chat/` | no redirect = authenticated | precondition | confirmed pre-navigation, no redirect | asserted |
| Setup 3: create test agent `TEST_Agent_Delete_${timestamp}` | agent created, id noted | steps 1–3 | step 3: `201` response + id captured from URL | asserted *(re-authored: full timestamp gets truncated to 8 digits by a client-side `maxLength=32` on the Name field — see Test Data note; disposition still "asserted" because the case's intent — a uniquely-named disposable fixture — is satisfied, just with a shorter effective suffix than the literal case text implies)* |
| 1 Navigate to `/app/agents/all` | list loads | step 4 | step 4: URL | asserted |
| 2 Wait 10s for lazy loading | all cards visible | step 5 | step 5: condition wait on list response + first card visible | asserted *(re-authored: condition wait, not fixed sleep; fixture rendered on page 1 with zero scrolling since list sorts `created_at desc`)* |
| 3 Close any modal dialogs if present | modal dismissed | step 6 | step 6 | asserted *(no blocking modal observed this run — only a dismissible announcement banner, unrelated to this case, closed once post-login)* |
| 4 Locate agent card for fixture name | card visible | step 7 | step 7: card text match | asserted *(enrichment: recommend id-based match over name-text match under parallel execution — see Test Data)* |
| 5 Click the agent card | detail page loads at `/app/agents/{id}` | step 8 | step 8: URL after click | asserted *(re-authored: actual URL is `/app/agents/all/{id}?...`, not `/app/agents/{id}` — case-text drift, filed GH#28, reverse-masking guard: live product is correct)* |
| 6 Verify agent name displayed | name field shows correct value | step 9 | step 9: tab name + Name textbox value | asserted |
| 7 Click menu button (three-dot) or direct Delete | dropdown opens OR modal appears directly | step 10 | step 10: `menu` role opens with "Delete agent" item | asserted *(this app always shows the menu path, never a direct-delete button — case's "or direct Delete button" branch is not applicable/not observed)* |
| 8 If menu opened: click "Delete agent" | confirmation modal appears with backdrop | step 11 | step 11: `role="dialog"` opens | asserted |
| 9 Verify modal contains confirmation message and "Confirm"/"Cancel" buttons | modal displays Confirm/Cancel | step 11 | step 11: dialog heading/body/buttons | asserted *(re-authored: buttons are "Cancel"/"Delete", not "Confirm"/"Cancel", and "Delete" starts disabled behind a type-the-name gate — case-text drift, filed GH#28, reverse-masking guard: live product's stricter UX is correct, case text is stale)* |
| 10 Click "Confirm" button in modal | modal closes, deletion proceeds | steps 13–14 | step 13: type exact name to enable; step 14: click "Delete", dialog closes | asserted *(decomposed: the case's single "click Confirm" step maps to two live actions — type-to-enable, then click "Delete" — since there is no literal "Confirm" button; see GH#28)* |
| 11 Wait for redirect to agent list page | navigates to `/app/agents/all` | step 14 | step 14: URL after delete | asserted |
| 12 Wait 10s for lazy loading | all remaining cards load | step 15 | step 15: condition wait on list reload, not fixed sleep | asserted *(re-authored per project convention — no `waitForTimeout`)* |
| 13 Search for agent card by name | card NOT found (deleted) | step 16 | step 16: `.some(...)` returns `false` | asserted |
| Expected Final State: agent permanently deleted, list excludes it, URL is `/app/agents/all`, no errors | all four conditions hold | steps 14–17 | steps 14 (URL), 16 (absence), 17 (console) | asserted |
| Teardown: none required (already deleted in steps) | n/a | — | — | asserted — matches case's own Teardown, no additional cleanup performed |

### Axis 2 — Analyst additions
- Step 12 asserts the "Delete" button stays `disabled` when the **wrong** name is typed into the confirm textbox — *added: the case only describes the happy path; this directly validates that the type-to-confirm gate actually gates (not just cosmetically present), which matters because this is the core W-OVR mechanic this case exists to pin down for reuse in TC-052/TC-053 (modal-handling module).*
- Step 3 captures and asserts on the numeric agent `id` from the create response/URL, in addition to the case's own name-based tracking — *added: discovered the Name field's `maxLength=32` silently truncates the case's own full-timestamp uniqueness strategy, which is a real collision risk across parallel test runs sharing this account; id is the only collision-proof handle.*
- Step 17 asserts zero console errors across the whole flow — *added: verified clean throughout; guards against a silent regression the case's own steps don't check for.*
- (Nothing else added beyond the case.)

## Cleanup
1. None required beyond the case's own Steps 7–14 (the delete action) — confirmed via `DELETE .../application/prompt_lib/21/271` → `204` and post-redirect list-absence check (step 16). No orphaned fixture remains.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Create-agent Name input | `getByRole('textbox', { name: 'Name *' })` — **note hard `maxLength="32"`** (confirmed via `el.maxLength` DOM property) | n/a — stable role+name handle |
| Create-agent Description input | `getByRole('textbox', { name: 'Description *' })` | n/a |
| Create-agent Save button | `getByRole('button', { name: 'Save' })` — starts `disabled`, enables once both required fields are non-empty | n/a |
| Agents list container / card (reuse existing) | `page.locator('#EliteACustomTabPanel')` / `page.locator('#EliteACustomTabPanel .MuiCard-root')` — same handle as `tests/pages/cardGridList.page.ts` (TC-003/TC-004) | `.MuiCardContent-root` — no `data-testid`/role/aria-label on cards (GH#12, pre-existing) |
| Card's clickable name element | inner child with inline `cursor:pointer` style, found via `card.querySelector(':scope > div:first-child')` or by text match: `page.locator('#EliteACustomTabPanel').getByText(agentName, { exact: true })` | text-content `.find()` scan of `.MuiCard-root` list (used this run, works but O(n)) |
| Agent detail — Name field | `getByRole('textbox', { name: 'Name *' })` (same role+name as create form, reused on detail page) | n/a |
| Agent detail — overflow/kebab menu trigger | `page.locator('#undefined-action')` — **currently works but is a confirmed product defect** (literal broken `id`, filed GH#33); no `aria-label`/text exists to disambiguate via role+name (Locator Ladder stop+flag rule, `.agents/testing.md` § Locator strategy) | `page.locator('button[aria-haspopup="true"]').last()` scoped to the tab-header toolbar row (the row containing "Save"/"Save As Version"/"Discard"), OR forward-compatible `page.locator('[id$="-action"][aria-haspopup="true"]')` in case the product later fixes the id to something like `271-action` |
| "Delete agent" menu item | `getByRole('menuitem', { name: 'Delete agent' })` — **do not confuse with** the always-`disabled` `getByRole('menuitem', { name: 'Delete' })` under the "VERSION" section of the same menu | n/a — role+name is unambiguous once scoped to "AGENT" section |
| Delete-confirmation dialog | `page.getByRole('dialog')` (there is only ever one dialog mounted at a time in this app) — heading text "Delete confirmation" | `page.locator('[role="dialog"]')` — **note**: the dialog's `aria-labelledby="alert-dialog-title"` references a non-existent element (actual heading `id="variables-dialog-title"`), filed GH#33; do not rely on `aria-labelledby`-derived accessible-name computation, use the heading's visible text instead |
| Delete-confirmation "type name" input | `page.locator('#name')` (input `id="name"`, `name="name"`) — **has no accessible name** (no `aria-label`/`aria-labelledby`/associated `<label>`, filed GH#33), so `getByRole('textbox')` is ambiguous/unnamed; use the `id` selector | `page.getByRole('dialog').locator('input')` (only one input exists inside the dialog) |
| Delete-confirmation Cancel button | `page.getByRole('dialog').getByRole('button', { name: 'Cancel' })` | n/a |
| Delete-confirmation Delete button | `page.getByRole('dialog').getByRole('button', { name: 'Delete' })` — starts `disabled`, enables only when the typed value exactly matches the agent's (possibly truncated) saved name | n/a |

## Network Behavior
- `POST /api/v2/elitea_core/applications/prompt_lib/{ownerId}` — create agent. Fires on Save click. `201` on success. Response includes the new agent's numeric `id` (271 this run) — capture this for later disambiguation.
- `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?...agents_type=classic&sort_by=created_at&sort_order=desc&...offset=0` — the agents list, same handle documented in TC-003's AFS. Sorts `created_at desc` by default, so a freshly created fixture is always on page 1 (offset 0) — no lazy-load/scroll needed to find it.
- `DELETE /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — fires on "Delete" click inside the confirmation dialog once the typed name matches. Returns `204` on success. Wait for this response (not a fixed sleep) before asserting the redirect/list-absence.
- Wait strategy for the implementer: `page.waitForResponse(resp => resp.url().includes(\`/application/prompt_lib/${ownerId}/${id}\`) && resp.request().method() === 'DELETE' && resp.status() === 204)` before asserting on `/app/agents/all`.

## Known Defects Found During Exploration

- **[INFO / CLARIFICATION]** Reverse-masking guard applies — live product is correct, case text is stale:
  1. Step 9's expected "Confirm"/"Cancel" buttons don't exist; live product uses a type-the-exact-name-to-confirm gate with "Cancel"/"Delete" buttons.
  2. Step 5's expected URL `/app/agents/{id}` doesn't match; live product uses `/app/agents/all/{id}?viewMode=owner&name={name}`.
  - **Filing status**: both findings are exact duplicates of the sibling TC-011 analyst's own bundle ticket [`GH#28`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/28) (already corroborated there by TC-010, TC-016, TC-017, TC-012). A fresh ticket (`#37`) was opened first, then found to be a duplicate via `gh issue view 28 --comments` and closed, with a corroboration comment consolidated onto `#28` instead — sixth independent analyst confirming the identical modal contract.
- **[MINOR]** Three related broken id/ARIA attributes in the delete flow:
  1. Overflow-menu (kebab) button carries a literal broken `id="undefined-action"` (confirmed on two different agents, 253 and 271 — not a one-off), with no `aria-label`/text as an alternative handle.
  2. Delete-confirmation dialog's `aria-labelledby="alert-dialog-title"` references a non-existent DOM id (actual heading id is `variables-dialog-title`) — dialog is generic/shared infra reused without updating the ARIA wiring.
  3. The "type the name" confirm input (`id="name"`) has no accessible name at all (no `aria-label`, `aria-labelledby`, or associated `<label>`).
  - **Filing status**: finding 1 is an exact duplicate of the sibling TC-016 analyst's [`GH#33`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/33). Findings 2 and 3 are novel (not previously filed — finding 3 had been independently *observed* by TC-010's analyst but deliberately left unfiled, per their own comment on `#28`). A fresh ticket (`#39`) bundling all three was opened first, then found to duplicate `#33` for finding 1 via `gh issue view 33 --comments`; closed and consolidated as a single comment on `#33` carrying the corroboration plus both novel findings, per `.agents/profile.md` § Bug filing (`github-issue`) and this batch's established bundle-via-comment-addendum convention.
  - **Process note**: this analyst independently hit the exact pre-filing-search blind spot already documented in `.agents/memory/qa-engineer/defect_search_must_include_comments.md` (title/body search doesn't surface comment-only findings) — now a fifth instance of the same trap within this one batch (after TC-010, TC-016, TC-017, TC-012 corroborations already on record). Caught and corrected before handoff; no duplicate tickets remain open.
  - **Impact on automation**: none of these three block the happy-path automation (all elements remain clickable/fillable via `id`/positional selectors); they are accessibility/code-quality defects, not functional blockers. Documented above in Concrete Handles with the currently-working (flagged) selector plus a forward-compatible fallback.

## Blocked Steps
None. All case Setup steps (1–3) and all 13 numbered Steps were executed end-to-end against the live system, using a disposable fixture created specifically for this case (agent id 271, deleted by the end of the run) plus a read-only, non-destructive spot-check against one pre-existing baseline agent (id 253, cancelled before any mutation — used only to confirm the `id="undefined-action"` defect and the dialog's ARIA wiring were not one-off artifacts of the disposable fixture).

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — this case joins `tests/agents.spec.ts` (module: agents, per `.agents/test-automation.yaml` and the EPIC's module-by-module delivery plan, GH#16). Per `.agents/testing.md` § Structure, WebQAPreExecuted-module specs are **not** assumed serial by default — TC-013 has no observed dependency on sibling agents-module cases (TC-010/011/012/014...019), each creates and cleans up its own fixture.
- Page object: reuse `tests/pages/cardGridList.page.ts` for the list/card interactions (steps 4–8). Given this case introduces the first create-agent-form + delete-confirmation-dialog interactions in the agents module, this is a strong candidate to seed `tests/pages/agentForm.page.ts` (create/edit form) and a modal-handling helper for the type-to-confirm dialog pattern — per `.agents/testing.md`'s stated plan, the latter should be built here first and reused by the dedicated `modal-handling` module's later cases (TC-052/TC-053) rather than rebuilt there from scratch.
- Wait strategy: no `waitForTimeout` anywhere in this spec — every wait is a `waitForResponse` on the specific list/create/delete endpoint, or a web-first `expect(...).toBeVisible()` / `expect(...).toBeEnabled()` poll (e.g. polling the "Delete" button's enabled state after typing the name).
- Fixture naming: given the confirmed `maxLength=32` truncation (see Test Data), recommend a **shorter, still-sortable** uniqueness suffix for this module's fixtures generally (e.g. a counter + short random suffix instead of a full 13-digit timestamp) if collision risk under parallel CI runs becomes a real problem — flagging for Tal/framework-scale consideration, not fixing here since this case's own single-fixture flow works correctly with the id-based disambiguation documented above.
- **Analyst execution note (process/tooling, not product)**: ran via `playwright-cli -s=TC-013`, a genuinely isolated in-memory browser profile (confirmed via fresh `/app/chat/` redirecting to Keycloak login with no inherited cookies at session start). No cross-talk with the 9 concurrently-dispatched sibling analysts was observed at any point (verified `window.location.href` after every navigation/interaction per the standing mitigation in `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`) — one sibling fixture (`TEST_Agent_Tags_TC017_1783017501...`, TC-017) was visible in the shared account's agents list during list-scan steps but was never interacted with.
