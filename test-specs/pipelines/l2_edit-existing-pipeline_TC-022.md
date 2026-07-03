# Test Case: Edit Existing Pipeline

## Metadata
- **TMS ID**: TC-022
- **Linked Story**: GH#47 (case tracking issue), part of EPIC GH#16
- **Priority**: l2
- **Environment Explored**: `https://next.elitea.ai/` (live "next" environment)
- **Analyst**: qa-engineer (Sage), via isolated `playwright-cli -s=TC022` session (own in-memory Chrome profile — see § Parallel-analyst execution note)
- **Status**: ready-for-automation

## Preconditions
- App reachable at `${BASE_URL}` (`https://next.elitea.ai/`)
- User `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) is a valid, authenticatable account
- No pre-existing pipeline needs to exist — this AFS creates its own throwaway
  fixture pipeline in Setup rather than mutating one of the account's ≥11
  baseline pipelines (safer for parallel/CI runs; avoids collision with 9
  concurrent sibling analysts' own mutations in this batch)

## Test Data
### Existing (re-use)
- `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — stored in `.env`, loaded via `tests/fixtures/env.ts`

### Must Generate (in test setup)
- Unique original pipeline name: `TC022_Edit_${last9DigitsOfDateNow}` (e.g.
  `TC022_Edit_027167287`) — **budget ≤ 24 chars so the `_UPDATED` suffix
  still fits under the confirmed 32-char Name cap, see § Known Defects
  (corroborates GH#27, now confirmed on Pipelines too)**
- Original description: `Original description`
- Updated name: `${originalName}_UPDATED` (e.g. `TC022_Edit_027167287_UPDATED`, 29 chars — under the 32-char cap)
- Updated description: `Updated description for edit test case`

### Must Clean Up (in teardown)
- Delete the fixture pipeline created in Setup (now carrying the `_UPDATED` name) via the "Delete pipeline" menu flow

## Test Steps

0. **[Setup — fixture creation, not in original case's Steps table]**
   Navigate to `${BASE_URL}app/pipelines/create?viewMode=owner`. Dismiss the
   "Announcing ELITEA 2.0.4!" banner if present (`getByRole('button', { name: 'close' })`).
   Fill `Name *` with the generated original name, `Description *` with
   `Original description`. Click `Save` (`getByRole('button', { name: 'Save' })` — safe on the create page, only Save/Cancel exist).
   - **Verify**: URL becomes `${BASE_URL}app/pipelines/all/{id}?destTab=configuration&name={urlencodedName}&viewMode=owner` — capture `{id}` via regex for later direct navigation. Confirmed live: `POST .../api/v2/elitea_core/applications/prompt_lib/21` → `201`.
1. Navigate to `${BASE_URL}app/pipelines/all`
   - **Verify**: page loads, no redirect to Keycloak login
2. Wait for the card grid to populate — **condition wait, not a fixed sleep**: poll `#EliteACustomTabPanel .MuiCard-root` until `count() > 0` (confirmed: first page loads 20 cards via `GET .../applications/prompt_lib/21?tags=&sort_by=created_at&sort_order=desc&query=&agents_type=pipeline&limit=20&offset=0`)
   - **Verify**: at least one card renders; the fixture pipeline's card is present (`cards.filter({ hasText: originalName })` visible)
3. Check for a blocking modal (`[role="dialog"]`) and dismiss if present
   - **Verify**: `document.querySelector('[role="dialog"]')` is null before proceeding (none was observed this run, but check defensively per `.agents/testing.md`)
4. Click the fixture pipeline's card: `locator('#EliteACustomTabPanel .MuiCard-root').filter({ hasText: originalName })`
   - **Verify**: navigates to `${BASE_URL}app/pipelines/all/{id}?viewMode=owner&name={originalName}` (confirmed live shape — **not** the bare `/app/pipelines/{id}` the case text implies; same drift already filed for Agents under GH#28/GH#34)
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
    - **Verify**: `getByTestId('agent-save-button')` is NOT disabled — **do not use `getByRole('button', { name: 'Save' })` here, see § Known Defects — it strict-mode-violates against "Save As Version" (corroborates GH#34 item 3, the *same* `data-testid` is reused verbatim on the Pipeline entity form)**
12. Click `getByTestId('agent-save-button')`
    - **Verify**: `PUT .../api/v2/elitea_core/application/prompt_lib/21/{id}` fires and returns a 2xx (observed: `201`)
13. Wait for save completion — **confirmed live signal: URL's `name` query param updates to the URL-encoded new name AND `getByTestId('agent-save-button')` becomes disabled again**. No success toast/snackbar was observed in the DOM at any point during or after save (checked via `[role="alert"], .MuiSnackbar-root, [class*=snackbar i], [class*=toast i]` — all empty) — do not gate on a toast; gate on the URL/testid signal above.
14. Read `Name *` field value again
    - **Verify**: equals the updated name
15. Read `Description *` field value again
    - **Verify**: equals the updated description
    - **Additional (beyond the case)**: reload the page (`page.reload()`) and re-read both fields from the freshly-fetched DOM to confirm server-side persistence, not just client-side form state — see § Coverage Map Axis 2
16. Navigate to `${BASE_URL}app/pipelines/all`
17. Wait for the card grid (same condition wait as step 2)
18. Locate the card for the updated name
    - **Verify**: `cards.filter({ hasText: updatedName })` is visible; `cards.filter({ hasText: originalName })` (exact old name, no `_UPDATED` suffix) is NOT present — i.e., no stale duplicate card

## Expected Results
- Pipeline's Name and Description are updated both on the detail page (client
  state) and confirmed via a full page reload (server-side persistence)
- Pipeline list shows the card under the new name only; no error messages,
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
| Setup 3: create test pipeline (Name/Description), save, note pipeline ID | fixture pipeline exists | step 0 | URL regex capture of `{id}` after create-Save | asserted |
| Test Data: Name original → updated value pair | both values used correctly | steps 5,8,14 | field `.value` reads | asserted *(clarification: literal case pattern `TEST_Pipeline_Edit_${timestamp}` / `..._UPDATED` exceeds the confirmed 32-char cap — see GH#27/#34; AFS uses a shortened pattern that fits)* |
| Test Data: Description original → updated value pair | both values used correctly | steps 6,9-10,15 | field `.value` reads | asserted |
| Step 1: Navigate to `/app/pipelines/all` | list page loads | step 1 | page load, no redirect | asserted |
| Step 2: Wait 10 seconds for lazy loading to complete | all pipeline cards visible | step 2 | condition wait on `.MuiCard-root` count, not a fixed sleep | asserted *(decomposed: case's literal "wait 10 seconds" replaced with a condition wait per `.agents/testing.md` § Conventions — "translate every wait-N-seconds into a condition wait")* |
| Step 3: Close any modal dialogs if present | modal dismissed | step 3 | `[role="dialog"]` absence check | asserted |
| Step 4: Click the pipeline card for original name | detail page loads at `/app/pipelines/{id}` | step 4 | URL check | asserted *(clarification: live URL is `/app/pipelines/all/{id}?viewMode=owner&name=...`, not the bare `/app/pipelines/{id}` the case states — same product route shape already documented for Agents under GH#28/GH#34)* |
| Step 5: Verify current Name field value is original | shows original value | step 5 | field `.value` | asserted |
| Step 6: Verify current Description field value is original | shows original value | step 6 | field `.value` | asserted |
| Step 7: Click into Name field and clear it | field empty | step 7-8 | n/a — `.fill()` clears+types atomically | asserted *(decomposed: "click, clear" collapsed into one `.fill()` call, standard Playwright practice, no separate empty-field assertion needed)* |
| Step 8: Fill Name field with updated value | field contains updated value | step 8 | field `.value` | asserted |
| Step 9: Click into Description field and clear it | field empty | step 9-10 | n/a — `.fill()` clears+types atomically | asserted *(decomposed, same as step 7 above)* |
| Step 10: Fill Description field with updated value | field contains updated value | step 10 | field `.value` | asserted |
| Step 11: Verify "Save" button is enabled | button active/clickable | step 11 | `disabled` property false via `getByTestId('agent-save-button')` | asserted *(clarification: case's implicit `getByRole('button', {name:'Save'})` strict-mode-violates against "Save As Version" — corroborates GH#34 item 3, now confirmed on Pipelines)* |
| Step 12: Click "Save" button | changes are saved successfully | step 12 | `PUT .../application/prompt_lib/21/{id}` → 2xx | asserted |
| Step 13: Wait for success notification or page reload | save operation completes | step 13 | URL `name` param update + save-button re-disable | asserted *(clarification: no toast/notification was ever observed in the DOM — the case's "or" is satisfied by the URL/button-state signal, not a notification)* |
| Step 14: Verify Name field now displays updated value | updated name persisted | step 14 | field `.value` | asserted |
| Step 15: Verify Description field now displays updated value | updated description persisted | step 15 | field `.value` (+ added reload check) | asserted |
| Step 16: Navigate back to `/app/pipelines/all` | list page loads | step 16 | page load | asserted |
| Step 17: Wait 10 seconds for lazy loading | all cards visible | step 17 | condition wait (same as step 2) | asserted *(decomposed, same rationale as step 2)* |
| Step 18: Locate the pipeline card for updated name | card displays updated name | step 18 | `cards.filter({hasText})` visibility + old-name-card absence | asserted |
| Expected Final State: name/description updated in both detail + list views, no errors, URL is `/app/pipelines/all` | full end state | steps 14,15,18 | see above | asserted |
| Teardown: navigate to updated-name pipeline detail page | detail page loads | Cleanup step 1 | direct navigation via captured `{id}` | asserted |
| Teardown: click 3-dot menu, "Delete pipeline" option | delete dialog opens | Cleanup step 2 | dialog `[role="dialog"]` heading "Delete confirmation" | asserted *(clarification: menu button has no accessible name — DOM id observed as literal `undefined-action`; already tracked under GH#33, corroborated cross-module for Pipelines by TC-023, now re-confirmed independently by TC-022 on a different pipeline id — see § Concrete Handles)* |
| Teardown: confirm deletion in modal dialog by clicking "Confirm" | pipeline deleted | Cleanup step 3-4 | `DELETE .../application/prompt_lib/21/{id}` → 204 | asserted *(clarification: live dialog has no "Confirm" button — it requires typing the exact pipeline name into a `Name` textbox to enable a `Delete` button; same dialog already canonically tracked under GH#28, corroborated cross-module for Pipelines by TC-023, now re-confirmed independently by TC-022)* |
| Teardown: verify pipeline is removed from list | pipeline gone from list | Cleanup step 5 | re-navigate to list, `cards.filter({hasText: updatedName})` count 0 | asserted |

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
- Confirmed the Pipeline `Name *` field's `maxLength="32"` HTML attribute
  matches Agents' cap exactly — *added: cross-entity-type corroboration of
  GH#27, not asked for by the case, but load-bearing for any test-data
  generator shared between the agents and pipelines modules.*

## Cleanup
1. Navigate directly to the fixture pipeline's detail page via its captured `{id}` (`${BASE_URL}app/pipelines/all/{id}?viewMode=owner`) rather than re-finding it in the list — faster and avoids a second lazy-load wait
2. Click the overflow menu button (`page.locator('#undefined-action')`), then `getByRole('menuitem', { name: 'Delete pipeline' })` — **not** the sibling version-level "Delete" menuitem, which stays disabled (same grouping pattern as Agents: a "VERSION" section with a disabled per-version Delete, and a "PIPELINE" section with the enabled entity-level "Delete pipeline")
3. In the resulting dialog, fill the `Name` textbox with the pipeline's **current** name (the `_UPDATED` name, since the edit already happened) — the `Delete` button stays disabled until this exact match
4. Click the dialog's `getByRole('button', { name: 'Delete' })` (scope to the dialog to avoid the menu's own "Delete pipeline" item, which shares a similar name)
5. Verify `DELETE .../application/prompt_lib/21/{id}` → `204`, then re-navigate to `/app/pipelines/all` and confirm the pipeline's card no longer appears

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Login username | `getByRole('textbox', { name: 'Username or email' })` | — |
| Login password | `getByRole('textbox', { name: 'Password' })` | — |
| Login submit | `getByRole('button', { name: 'Sign In' })` | — |
| Announcement banner close | `getByRole('button', { name: 'close' })` | — |
| Pipeline card (list, by name) | `page.locator('#EliteACustomTabPanel .MuiCard-root').filter({ hasText: name })` | none stable exists — no `role`/`aria-label`/`data-testid` on the card root (GH#13, confirmed still true on this pass) |
| Name field (create + edit forms) | `getByRole('textbox', { name: 'Name *' })` | `input[name="name"]` |
| Description field (create + edit forms) | `getByRole('textbox', { name: 'Description *' })` | `textarea[name="description"]` |
| Save button — **create** page | `getByRole('button', { name: 'Save' })` | — *(safe here: create page only has Save/Cancel, no "Save As Version" to collide with)* |
| Save button — **edit/detail** page | `getByTestId('agent-save-button')` | `getByRole('button', { name: 'Save', exact: true })` — confirmed via live `.count() === 1` check; do **not** use non-exact `name: 'Save'` here, it strict-mode-violates against "Save As Version". **Confirmed: this is the literal same `data-testid` value as the Agents edit page** — one shared entity-form component, not a coincidence (corroborates GH#34 item 3) |
| Pipeline overflow (⋮) menu button | `page.locator('#undefined-action')` — **flag**: this is the element's literal live DOM `id`, confirmed again on pipeline id 355; same broken template interpolation already tracked under [GH#33](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/33) (canonical, corroborated cross-module for Pipelines by TC-023 on pipeline id 356) | position-based: the icon-only button following Save/Save As Version/Discard in the detail-page toolbar |
| "Delete pipeline" menu item | `getByRole('menuitem', { name: 'Delete pipeline' })` — note the sibling version-scoped `menuitem "Delete"` (disabled) under a "VERSION" heading; do not confuse the two | — |
| Delete-confirm dialog | `getByRole('dialog')` (heading text "Delete confirmation") — **do not** scope by accessible name, `aria-labelledby` points at a non-existent element id (GH#33) so the dialog has no computed accessible name | — |
| Delete-confirm name textbox | `getByRole('dialog').getByRole('textbox')` | — |
| Delete-confirm submit button | `getByRole('dialog').getByRole('button', { name: 'Delete' })` | — |

## Network Behavior
- `POST .../api/v2/elitea_core/applications/prompt_lib/21` — fires on create-Save (Setup step 0); observed `201`
- `PUT .../api/v2/elitea_core/application/prompt_lib/21/{id}` — fires on edit-Save (step 12); observed `201` (unusual for an update — typically `200` — but functionally correct, not treated as a defect, matches the identical Agents-side observation; automation should assert `status() < 300`, not an exact `200`)
- `GET .../api/v2/elitea_core/applications/prompt_lib/21?tags=&sort_by=created_at&sort_order=desc&query=&agents_type=pipeline&limit=20&offset=0` — fires on every `/app/pipelines/all` load; the list's first page (20 cards) — wait for this response before asserting card visibility. Note the `agents_type=pipeline` discriminator (vs. `agents_type=classic` for the Agents list — same underlying `applications` endpoint, filtered by type)
- `DELETE .../api/v2/elitea_core/application/prompt_lib/21/{id}` — fires on Cleanup delete confirm; observed `204`
- The numeric `21` segment in all the above is the account's workspace/project id (matches the "Private" project scope selector) — a fixed value for `${TEST_USER}` on this environment, not something this case needs to vary
- Note: the pipeline entity carries two distinct numeric ids — a `Pipeline ID` (355, the `application_id` used in all REST paths above) and a separate `Version ID` (380, used only in version-scoped endpoints like `.../pipeline_trigger/prompt_lib/21/pipeline/380/trigger` and `.../application_skills/prompt_lib/21/380`). Automation should capture and use the `Pipeline ID` (from the post-create-save URL) for all CRUD operations in this case — the `Version ID` is not needed here.

## Known Defects Found During Exploration
- No functional/blocking defects — the edit flow itself (open → read →
  edit → save → persist → verify → delete) works correctly end-to-end,
  confirmed via both client-state and full-reload (server-side) checks,
  with zero console errors and correct 2xx/204 network responses throughout.
- **All findings are corroborations of already-tracked, already-canonical Agents-module defects — no new tickets filed**, per this project's corroborate-don't-refile convention (`defect_search_must_include_comments` memory) and the reverse-masking guard (live product is self-consistent; the case text is what's stale):
  1. **[GH#27](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/27) — 32-char Name `maxLength`.** Confirmed identical on the Pipeline `Name *` field (`maxLength="32"`), not just Agents'. First cross-entity-type corroboration for this ticket — commented directly on #27.
  2. **[GH#28](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/28) — type-to-confirm delete dialog, no literal "Confirm" button.** The case's own Teardown text says "Confirm deletion in modal dialog by clicking 'Confirm'"; live dialog requires typing the exact pipeline name into a `Name` textbox to enable a `Delete` button. Already corroborated cross-module for Pipelines by TC-023 (#48) on pipeline id 356 — independently re-confirmed here on pipeline id 355. No new comment posted (would be pure duplication of TC-023's already-thorough cross-module note); referenced here for traceability.
  3. **[GH#33](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/33) — kebab/overflow menu button `id="undefined-action"`, plus the dialog's broken `aria-labelledby` and the unnamed confirm-name textbox.** Already corroborated cross-module for Pipelines by TC-023 on pipeline id 356 — independently re-confirmed here on pipeline id 355. No new comment posted, same reasoning as above.
  4. **[GH#34](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/34) item 3 — `getByRole('button', {name:'Save'})` strict-mode-violates on the edit/detail page.** Confirmed the *exact same* `data-testid="agent-save-button"` is reused verbatim on the Pipeline entity form (not a pipeline-specific id) — first corroboration of this specific item for Pipelines; commented directly on #34.

## Blocked Steps
None.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md`
- Extend `tests/pages/cardGridList.page.ts` with a `clickCardByName(name: string)` helper if not already added by a sibling case in this batch (TC-012 flagged the same need for Agents) — `this.cards.filter({ hasText: name }).click()`
- Reuse (don't duplicate) whatever `tests/pages/entityForm.page.ts` / `agentForm.page.ts` the Agents-module implementer produced for TC-012 — the Name/Description fields and the context-sensitive Save button (`getByRole('button',{name:'Save'})` on create, `getByTestId('agent-save-button')` on edit) are now **confirmed identical** between Agents and Pipelines forms (same `data-testid`, same 32-char Name cap, same disabled-state gating). This case is strong evidence to name the shared page object `entityForm.page.ts` (parametrized) rather than forking a pipelines-specific copy, per TC-012's own open question in `.agents/testing.md` § Structure roadmap.
- Wait strategy for save completion: `page.waitForResponse` matching `.../application/prompt_lib/21/` + method `PUT` + `status() < 300`, not a fixed timeout and not a toast-visibility wait (no toast exists)
- Wait strategy for list load: `page.waitForResponse` matching `.../applications/prompt_lib/21` + `agents_type=pipeline`, then `expect(cards.filter({hasText})).toBeVisible()`
- Capture the numeric pipeline `{id}` (the `Pipeline ID`, e.g. 355 — **not** the separate `Version ID`, e.g. 380) from the post-create-save URL via `/\/pipelines\/all\/(\d+)/` and reuse it for direct Cleanup navigation instead of re-locating the card in the list
- Track the pipeline's *current* name through the test (it changes mid-test from original → `_UPDATED`) — the Cleanup delete dialog requires whichever name is current at that point, not the original
- The kebab menu exposes two visually-similar "Delete" items — a disabled version-scoped `menuitem "Delete"` and the enabled entity-scoped `menuitem "Delete pipeline"`. Always target by the full accessible name `"Delete pipeline"`, never bare `"Delete"`, to avoid ambiguity/mis-click.

## Parallel-analyst execution note
Executed via an isolated `playwright-cli -s=TC022` session (own in-memory
Chrome profile) rather than the shared `mcp__playwright__*` MCP connection,
per this project's corroborated parallel-analyst browser-isolation gotcha —
confirmed clean isolation throughout (fresh Keycloak redirect on first
navigate; the pipelines list showed sibling analysts' own in-flight
fixtures — e.g. `TC020_Pipe_Min_*`, `TEST_Pipeline_Delete_TC023_*`,
`TC028_Fast_*`, `TC021_Pipeline_*`, `TEST_Pipe_TC027_*` — appearing and
disappearing across list reloads, confirming 9 concurrent sibling
analysts were mutating the same account's pipeline set with zero
collision against this case's own fixture, id 355). Session closed
cleanly at the end of the run.
