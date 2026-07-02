# Test Case: Edit Existing Agent

## Metadata
- **TMS ID**: TC-012
- **Linked Story**: GH#19 (case tracking issue), part of EPIC GH#16
- **Priority**: l2
- **Environment Explored**: `https://next.elitea.ai/` (live "next" environment)
- **Analyst**: qa-engineer (Sage), via isolated `playwright-cli -s=TC012` session (see § notes on parallel-analyst browser isolation below)
- **Status**: ready-for-automation

## Preconditions
- App reachable at `${BASE_URL}` (`https://next.elitea.ai/`)
- User `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) is a valid, authenticatable account
- No pre-existing agent needs to exist — this AFS creates its own throwaway
  fixture agent in Setup rather than mutating one of the account's ≥12
  baseline agents (safer for parallel/CI runs; avoids collision with other
  specs' fixtures)

## Test Data
### Existing (re-use)
- `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — stored in `.env`, loaded via `tests/fixtures/env.ts`

### Must Generate (in test setup)
- Unique original agent name: `TC012_Edit_${last9DigitsOfDateNow}` (e.g.
  `TC012_Edit_017267110`) — **budget ≤ 24 chars so the `_UPDATED` suffix
  still fits under the confirmed 32-char Name cap, see § Known Defects**
- Original description: `Original description`
- Updated name: `${originalName}_UPDATED` (e.g. `TC012_Edit_017267110_UPDATED`, 28 chars — under the 32-char cap)
- Updated description: `Updated description for edit test case`

### Must Clean Up (in teardown)
- Delete the fixture agent created in Setup (now carrying the `_UPDATED` name) via the Delete-agent flow

## Test Steps

0. **[Setup — fixture creation, not in original case's Steps table]**
   Navigate to `${BASE_URL}app/agents/create?viewMode=owner`. Dismiss the
   "Announcing ELITEA 2.0.4!" banner if present (`button[name="close"]`).
   Fill `Name *` with the generated original name, `Description *` with
   `Original description`. Click `Save`.
   - **Verify**: URL becomes `${BASE_URL}app/agents/all/{id}?destTab=configuration&name={urlencodedName}&viewMode=owner` — capture `{id}` via regex for later direct navigation.
1. Navigate to `${BASE_URL}app/agents/all`
   - **Verify**: page loads, no redirect to Keycloak login
2. Wait for the card grid to populate — **condition wait, not a fixed sleep**: poll `#EliteACustomTabPanel .MuiCard-root` until `count() > 0` (confirmed: first page loads 20 cards via `GET .../applications/prompt_lib/21?agents_type=classic&...&limit=20&offset=0`)
   - **Verify**: at least one card renders; the fixture agent's card is present (`cards.filter({ hasText: originalName })` visible)
3. Check for a blocking modal (`[role="dialog"]`) and dismiss if present
   - **Verify**: `document.querySelector('[role="dialog"]')` is null before proceeding (none was observed this run, but check defensively — this app is known to show blocking overlays post-navigation per `.agents/testing.md`)
4. Click the fixture agent's card: `locator('#EliteACustomTabPanel .MuiCard-root').filter({ hasText: originalName })`
   - **Verify**: navigates to `${BASE_URL}app/agents/all/{id}?viewMode=owner&name={originalName}` (confirmed live shape — **not** the bare `/app/agents/{id}` the case text implies; consistent with the drift already filed under GH#28 for TC-011)
5. Read `Name *` field value
   - **Verify**: equals the generated original name
6. Read `Description *` field value
   - **Verify**: equals `Original description`
7. Click into `Name *` textbox (`getByRole('textbox', { name: 'Name *' })`)
8. Fill it with the updated name (`.fill()` clears-and-types in one call; a separate "clear" step is unnecessary with Playwright's `fill`)
   - **Verify**: field's `.value` equals the updated name (not silently truncated — stay under the 32-char cap, see § Known Defects)
9. Click into `Description *` textbox (`getByRole('textbox', { name: 'Description *' })`)
10. Fill it with `Updated description for edit test case`
    - **Verify**: field's `.value` equals the updated description
11. Check the Save button's enabled state
    - **Verify**: `getByTestId('agent-save-button')` is NOT disabled — **do not use `getByRole('button', { name: 'Save' })` here, see § Known Defects (GH#34) — it strict-mode-violates against "Save As Version"**
12. Click `getByTestId('agent-save-button')`
    - **Verify**: `PUT .../api/v2/elitea_core/application/prompt_lib/21/{id}` fires and returns a 2xx (observed: `201`)
13. Wait for save completion — **confirmed live signal: URL's `name` query param updates to the URL-encoded new name AND `getByTestId('agent-save-button')` becomes disabled again**. No success toast/snackbar was observed in the DOM at any point during or after save (checked via `[role="alert"], .MuiSnackbar-root, [class*=snackbar i], [class*=toast i]` — all empty) — do not gate on a toast; gate on the URL/testid signal above.
14. Read `Name *` field value again
    - **Verify**: equals the updated name
15. Read `Description *` field value again
    - **Verify**: equals the updated description
    - **Additional (beyond the case)**: reload the page (`page.reload()`) and re-read both fields from the freshly-fetched DOM to confirm server-side persistence, not just client-side form state — see § Coverage Map Axis 2
16. Navigate to `${BASE_URL}app/agents/all`
17. Wait for the card grid (same condition wait as step 2)
18. Locate the card for the updated name
    - **Verify**: `cards.filter({ hasText: updatedName })` is visible; `cards.filter({ hasText: originalName })` (exact old name, no `_UPDATED` suffix) is NOT present — i.e., no stale duplicate card

## Expected Results
- Agent's Name and Description are updated both on the detail page (client
  state) and confirmed via a full page reload (server-side persistence)
- Agent list shows the card under the new name only; no error messages,
  toasts, or console errors appear at any point in the flow
- `PUT .../application/prompt_lib/21/{id}` returns 2xx on save
- URL after save reflects `name={urlencoded-updated-name}`

## Coverage Map

**Axis 1 — Case coverage**

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Preconditions: app accessible at `{{base_url}}` | app loads | step 1 | navigation succeeds, no error page | asserted |
| Preconditions: user authenticated with `{{ELITEA_EMAIL}}` | authenticated session | Setup (login, not shown as its own numbered step — reused isolated-session login) | `/app/chat/` doesn't redirect to Keycloak | asserted |
| Preconditions: browser window maximized | full UI visible | — | — | out-of-scope *(headless/CI viewport is fixed via `playwright.config.ts`; case's `window.moveTo/resizeTo` is a manual-execution artifact, not applicable to automation)* |
| Setup 1: maximize browser window via `window.moveTo/resizeTo` | all UI elements visible | — | — | out-of-scope *(same as above)* |
| Setup 2: verify authenticated state via `/app/chat/` redirect check | authenticated (expected), else login first | Setup / precondition check | isolated session's first navigation | asserted |
| Setup 3: create test agent (Name/Description), save, note agent ID | fixture agent exists | step 0 | URL regex capture of `{id}` after create-Save | asserted |
| Test Data: Name original → updated value pair | both values used correctly | steps 5,8,14 | field `.value` reads | asserted *(clarification: literal case pattern `TEST_Agent_Edit_${timestamp}` / `..._UPDATED` exceeds the confirmed 32-char cap — see GH#34/#27; AFS uses a shortened pattern that fits)* |
| Test Data: Description original → updated value pair | both values used correctly | steps 6,9-10,15 | field `.value` reads | asserted |
| Step 1: Navigate to `/app/agents/all` | list page loads | step 1 | page load, no redirect | asserted |
| Step 2: Wait 10s for lazy loading | all cards visible | step 2 | condition wait on `.MuiCard-root` count, not a fixed sleep | asserted *(decomposed: case's literal "wait 10 seconds" replaced with a condition wait per `.agents/testing.md` § Conventions — "translate every wait-N-seconds into a condition wait")* |
| Step 3: Close modal dialogs if present | modal dismissed | step 3 | `[role="dialog"]` absence check | asserted |
| Step 4: Click agent card for original name | detail page loads at `/app/agents/{id}` | step 4 | URL check | asserted *(clarification: live URL is `/app/agents/all/{id}?viewMode=owner&name=...`, not the bare `/app/agents/{id}` the case states — consistent with GH#28's TC-011 finding, same product route shape)* |
| Step 5: Verify current Name field value | shows original value | step 5 | field `.value` | asserted |
| Step 6: Verify current Description field value | shows original value | step 6 | field `.value` | asserted |
| Step 7: Click into Name field and clear it | field empty | step 7-8 | n/a — `.fill()` clears+types atomically | asserted *(decomposed: "click, clear" collapsed into one `.fill()` call, standard Playwright practice, no separate empty-field assertion needed)* |
| Step 8: Fill Name field with updated value | field contains updated value | step 8 | field `.value` | asserted |
| Step 9: Click into Description field and clear it | field empty | step 9-10 | n/a — `.fill()` clears+types atomically | asserted *(decomposed, same as step 7 above)* |
| Step 10: Fill Description field with updated value | field contains updated value | step 10 | field `.value` | asserted |
| Step 11: Verify Save button is enabled | button active/clickable | step 11 | `disabled` property false via `getByTestId('agent-save-button')` | asserted *(clarification: case's implicit `getByRole('button', {name:'Save'})` strict-mode-violates against "Save As Version" — see GH#34)* |
| Step 12: Click Save button | changes saved | step 12 | `PUT .../application/prompt_lib/21/{id}` → 2xx | asserted |
| Step 13: Wait for success notification or page reload | save completes | step 13 | URL `name` param update + save-button re-disable | asserted *(clarification: no toast/notification was ever observed in the DOM — the case's "or" is satisfied by the URL/button-state signal, not a notification)* |
| Step 14: Verify Name field shows updated value | updated name persisted | step 14 | field `.value` | asserted |
| Step 15: Verify Description field shows updated value | updated description persisted | step 15 | field `.value` (+ added reload check) | asserted |
| Step 16: Navigate back to `/app/agents/all` | list page loads | step 16 | page load | asserted |
| Step 17: Wait 10s for lazy loading | all cards visible | step 17 | condition wait (same as step 2) | asserted *(decomposed, same rationale as step 2)* |
| Step 18: Locate agent card for updated name | card displays updated name | step 18 | `cards.filter({hasText})` visibility + old-name-card absence | asserted |
| Expected Final State: name/description updated in both detail + list views, no errors, URL is `/app/agents/all` | full end state | steps 14,15,18 | see above | asserted |
| Teardown: navigate to updated-name agent detail page | detail page loads | Teardown step 1 | direct navigation via captured `{id}` | asserted |
| Teardown: click 3-dot menu, "Delete agent" | delete dialog opens | Teardown step 2 | dialog `[role="dialog"]` heading "Delete confirmation" | asserted *(clarification: menu button has no accessible name — DOM id observed as literal `undefined-action`; see § Concrete Handles)* |
| Teardown: confirm deletion by clicking "Confirm" | agent deleted | Teardown step 3 | `DELETE .../application/prompt_lib/21/{id}` → 204 | asserted *(clarification: live dialog has no "Confirm" button — it requires typing the exact agent name into a `Name` textbox to enable a `Delete` button; same dialog already flagged under GH#32 for TC-010, corroborated here — see GH#34)* |
| Teardown: verify agent removed from list | agent gone from list | Teardown step 4 | re-navigate to list, `cards.filter({hasText: updatedName})` count 0 | asserted |

**Axis 2 — Analyst additions**

- Step 15 (extended): reload the page and re-read Name/Description from the
  freshly-fetched DOM — *added: proves server-side persistence, not just
  client-side form/React state, which the case's own step wording doesn't
  distinguish.*
- Console-error check after every major action (create-save, edit-save,
  delete) — *added: standard side-channel discipline; none found this run
  (0 errors, 0 warnings via `playwright-cli console error/warning`), but
  the gate should exist in automation regardless.*
- Network-level status assertions on the save `PUT` (2xx) and the teardown
  `DELETE` (204) — *added: the case only asserts UI-visible outcomes; the
  underlying API contract can silently diverge from the UI's apparent
  success (e.g. optimistic UI update masking a failed write) without a
  network-level check.*
- Assert the *old*-name card is absent from the list post-edit (step 18),
  not just that the new-name card is present — *added: catches a
  duplicate-card bug (stale + updated both rendering) that "new card
  present" alone would miss.*

## Cleanup
1. Navigate directly to the fixture agent's detail page via its captured `{id}` (`${BASE_URL}app/agents/all/{id}?viewMode=owner`) rather than re-finding it in the list — faster and avoids a second lazy-load wait
2. Click the overflow menu button, then `getByRole('menuitem', { name: 'Delete agent' })`
3. In the resulting dialog, fill the `Name` textbox with the agent's **current** name (the `_UPDATED` name, since the edit already happened) — the `Delete` button stays disabled until this exact match
4. Click the dialog's `getByRole('button', { name: 'Delete' })` (scope to the dialog to avoid the menu's own "Delete agent" item, which shares a similar name)
5. Verify `DELETE .../application/prompt_lib/21/{id}` → `204`, then re-navigate to `/app/agents/all` and confirm the agent's card no longer appears

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Login username | `getByRole('textbox', { name: 'Username or email' })` | — |
| Login password | `getByRole('textbox', { name: 'Password' })` | — |
| Login submit | `getByRole('button', { name: 'Sign In' })` | — |
| Announcement banner close | `getByRole('button', { name: 'close' })` | — |
| Agent card (list, by name) | `page.locator('#EliteACustomTabPanel .MuiCard-root').filter({ hasText: name })` | none stable exists — no `role`/`aria-label`/`data-testid` on the card root (GH#12, confirmed still true on this pass) |
| Name field (create + edit forms) | `getByRole('textbox', { name: 'Name *' })` | `input[name="name"]` |
| Description field (create + edit forms) | `getByRole('textbox', { name: 'Description *' })` | `textarea[name="description"]` |
| Save button — **create** page | `getByRole('button', { name: 'Save' })` | — *(safe here: create page only has Save/Cancel, no "Save As Version" to collide with)* |
| Save button — **edit/detail** page | `getByTestId('agent-save-button')` | `getByRole('button', { name: 'Save', exact: true })` — confirmed via live `.count() === 1` check; do **not** use non-exact `name: 'Save'` here, it strict-mode-violates against "Save As Version" (GH#34) |
| Agent overflow (⋮) menu button | `page.locator('#undefined-action')` — **flag**: this is the element's literal live DOM `id`, not a placeholder in this doc; likely an unintended default-id fallback in the product's menu-button component (harmless, but recommend the product team give it a real id/aria-label) | position-based: the icon-only button following Save/Save As Version/Discard in the detail-page toolbar |
| "Delete agent" menu item | `getByRole('menuitem', { name: 'Delete agent' })` | — |
| Delete-confirm dialog | `getByRole('dialog')` (heading text "Delete confirmation") | — |
| Delete-confirm name textbox | `getByRole('dialog').getByRole('textbox')` | — |
| Delete-confirm submit button | `getByRole('dialog').getByRole('button', { name: 'Delete' })` | — |

## Network Behavior
- `POST .../api/v2/elitea_core/application/prompt_lib/21` — fires on create-Save (Setup step 0); 2xx expected
- `PUT .../api/v2/elitea_core/application/prompt_lib/21/{id}` — fires on edit-Save (step 12); observed `201` (unusual for an update — typically `200` — but functionally correct, not treated as a defect; automation should assert `status() < 300`, not an exact `200`)
- `GET .../api/v2/elitea_core/applications/prompt_lib/21?agents_type=classic&...&limit=20&offset=0` — fires on every `/app/agents/all` load; the list's first page (20 cards) — wait for this response before asserting card visibility
- `DELETE .../api/v2/elitea_core/application/prompt_lib/21/{id}` — fires on Teardown delete confirm; observed `204`
- The numeric `21` segment in all the above is the account's workspace/project id (matches the "Private" project scope selector) — a fixed value for `${TEST_USER}` on this environment, not something this case needs to vary

## Known Defects Found During Exploration
- No functional/blocking defects — the edit flow itself (open → read →
  edit → save → persist → verify → delete) works correctly end-to-end,
  confirmed via both client-state and full-reload (server-side) checks,
  with zero console errors and correct 2xx/204 network responses throughout.
- **3 case-authoring clarifications filed as [GH#34](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/34)** (bundled per the project's existing case-text-drift convention — see GH#9, #10, #12, #14, #28, #30, #31, #32):
  1. Delete-confirmation dialog requires typing the exact agent name into a `Name` textbox to enable a `Delete` button — no "Confirm" button exists as the case's Teardown states. Corroborates pre-existing [GH#32](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/32) (same dialog, originally filed from TC-010).
  2. The Name field's 32-char `maxLength` (pre-existing [GH#27](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/27)) breaks this case's own literal naming pattern (`TEST_Agent_Edit_${timestamp}` → `..._UPDATED` would run 30–38 chars). AFS uses a shortened pattern that fits.
  3. **New**: `getByRole('button', { name: 'Save' })` strict-mode-violates on the edit/detail page (matches both "Save" and "Save As Version"); use `getByTestId('agent-save-button')` instead — confirmed present and unique.

## Blocked Steps
None.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md`
- Extend `tests/pages/cardGridList.page.ts` with a `clickCardByName(name: string)` helper (`this.cards.filter({ hasText: name }).click()`) — this is the third spec needing "click a specific card," after the two list-only cases (TC-003/TC-004) that only needed counts
- New page object expected per `.agents/testing.md` § Structure roadmap: `tests/pages/agentForm.page.ts` (or `entityForm.page.ts` if shared with pipelines) — should wrap the Name/Description fields and the context-sensitive Save button (`getByRole('button',{name:'Save'})` on create, `getByTestId('agent-save-button')` on edit) as one `save()` method so callers don't need to know which page they're on
- Wait strategy for save completion: `page.waitForResponse` matching `.../application/prompt_lib/21/` + method `PUT` + `status() < 300`, not a fixed timeout and not a toast-visibility wait (no toast exists)
- Wait strategy for list load: `page.waitForResponse` matching `.../applications/prompt_lib/21` + `agents_type=classic`, then `expect(cards.filter({hasText})).toBeVisible()`
- Capture the numeric agent `{id}` from the post-create-save URL via `/\/agents\/all\/(\d+)/` and reuse it for direct Teardown navigation instead of re-locating the card in the list
- Track the agent's *current* name through the test (it changes mid-test from original → `_UPDATED`) — the Teardown delete dialog requires whichever name is current at that point, not the original

## Parallel-analyst execution note
Executed via an isolated `playwright-cli -s=TC012` session (own in-memory
Chrome profile) rather than the shared `mcp__playwright__*` MCP connection,
per this project's corroborated parallel-analyst browser-isolation gotcha —
confirmed clean isolation throughout (fresh Keycloak redirect on first
navigate, no cross-talk observed with the 9 sibling analysts running
concurrently on TC-010/011/013–019). A second short-lived isolated session
(`TC012v2`) was used post-teardown solely to verify the `exact: true` Save-
button fallback against a read-only baseline agent, without touching this
case's own fixture.
