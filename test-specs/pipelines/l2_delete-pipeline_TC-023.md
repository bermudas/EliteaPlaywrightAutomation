# Test Case: Delete Pipeline with Confirmation

## Metadata
- **TMS ID**: TC-023
- **Linked Story**: GH#48 (own tracking issue, parent epic GH#16)
- **Priority**: l2
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`) — isolated `playwright-cli -s=TC023` session (own in-memory Chrome profile, confirmed non-shared with sibling parallel analysts TC-020..022/024..029 per `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`: fresh `/app/chat/` navigation bounced to the Keycloak login page before any login, proving no inherited cookies)
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via `GET ${BASE_URL}/app/chat/` not redirecting to the Keycloak login page
- Browser viewport maximized (case's own Setup step 1)
- **This case is destructive** — it deletes a pipeline. The analyst created a disposable, uniquely-named fixture pipeline specifically to delete (see Test Data), rather than deleting any pre-existing/baseline or sibling-analyst fixture. Confirmed at deletion time that other sibling fixtures (`TC020_Pipe_Min_...`, `TC022_Edit_...`, `TEST_Pipeline_Welcome_TC028_...`) remained untouched in the account.

## Test Data

### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`

### Must Generate (in test setup — case's own Setup step 3)
- A disposable pipeline via `${BASE_URL}/app/pipelines/create?viewMode=owner`:
  - Name field input: `TEST_Pipeline_Delete_TC023_${Date.now()}` (full unix-ms timestamp for uniqueness, per case's own `${timestamp}` convention, plus a `TC023_` disambiguation segment per this batch's parallel-dispatch data-collision guard)
  - Description field input: `Pipeline to be deleted`
  - **Important constraint discovered (cross-module corroboration of GH#27)**: the Name field has the identical hard client-side `maxlength=32` already documented for the Agent create form. Typed `TEST_Pipeline_Delete_TC023_1783027238801` (41 chars); persisted/displayed value was `TEST_Pipeline_Delete_TC023_17830` (32 chars, trailing 9 characters of the timestamp silently dropped) — confirmed identically via the form's own `Name *` field value post-fill, the post-save redirect URL, the page title, AND the `POST /api/v2/elitea_core/applications/prompt_lib/{ownerId}` response body's `name` field.
  - **Parallel-run implication for automation**: same as the Agents-module precedent — only the leading ~8 digits of the ms timestamp survive truncation, so two pipelines created within the same short window by different parallel runs can render an identical visible name. Automation should capture and match on the numeric pipeline `id` from the create response, not rely solely on the truncated name string.
  - Observed fixture created this run: id **356**, owner_id **21**, default version id **381**, saved name `TEST_Pipeline_Delete_TC023_17830`.

### Must Clean Up (in teardown)
- None — deletion via the case's own Steps 7–13 **is** the cleanup. Matches the case's own Teardown section ("pipeline already deleted in test steps"). Confirmed deleted: `DELETE /api/v2/elitea_core/application/prompt_lib/21/356` → `204`, and the card no longer renders in `#EliteACustomTabPanel` after redirect, nor does `GET /api/v2/elitea_core/search_options/prompt_lib/21?query={name}...` return any `pipeline` rows for it.

## Test Steps

1. Navigate to `${BASE_URL}/app/pipelines/create?viewMode=owner`
   - **Verify**: page loads with tab "New Pipeline" selected
   - **Note**: the dismissible "Announcing ELITEA 2.0.4!" release-notes banner renders here too (same component already documented for the Agent create form, GH#42). Dismissed proactively (`getByRole('button', { name: 'close' })`) before interacting with the form — did not empirically re-test whether it would have blocked the Save click if left open (GH#42 already covers that mechanism for the Agent form; not re-verified here since the banner was closed defensively, per `.agents/testing.md`'s known-gotcha guidance, before any Save attempt).
2. Fill `Name *` with `TEST_Pipeline_Delete_TC023_${Date.now()}` and `Description *` with `Pipeline to be deleted`
   - **Verify**: "Save" button transitions from `disabled` to enabled once both required fields are non-empty
3. Click "Save"
   - **Verify**: `POST /api/v2/elitea_core/applications/prompt_lib/{ownerId}` returns `201`; navigation lands on `/app/pipelines/all/{id}?destTab=configuration&name={savedName}&viewMode=owner`; capture `{id}` (356) from the URL/response for later use as the primary disambiguator
4. Navigate to `${BASE_URL}/app/pipelines/all`
   - **Verify**: URL is `${BASE_URL}/app/pipelines/all`
5. Wait for the pipelines list to load — condition wait, not a fixed sleep: wait for `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?...agents_type=pipeline...offset=0` (200), then wait for at least one `.MuiCard-root` inside `#EliteACustomTabPanel`
   - **Note**: list sorted `created_at desc`; the fixture card rendered immediately among the (small, shared, concurrently-mutated) account's 3 pipeline cards with zero scrolling — no lazy-load pagination was actually exercised this run, unlike the case's literal "wait 10 seconds for lazy loading" framing.
6. Close any blocking modal/dialog if present (`[role="dialog"]`, "Got it"/"Close"/ESC) — **not observed at this point** (the only dismissible banner was the release-notes one, already closed in step 1 and confirmed not to reappear)
7. Locate the fixture's card by matching text content against the saved (truncated) name, or preferably by the id captured in step 3
   - **Verify**: exactly one matching `.MuiCard-root` is visible — confirmed via `[...document.querySelectorAll('#EliteACustomTabPanel .MuiCard-root')].map(c => c.textContent)` returning `["TEST_Pipeline_Delete_TC023_17830", "TC022_Edit_027167287", "Analyze GitHub Issuesqapipeline"]` (sibling fixtures visible but untouched)
8. Click the card's name element (the `cursor:pointer` child — the card root's inner name/icon block, same DOM shape as the Agents card)
   - **Verify**: navigates to `/app/pipelines/all/{id}?viewMode=owner&name={savedName}` — same URL shape as the Agent-module equivalent (`/app/agents/all/{id}?...`), not the case's own bare `/app/pipelines/{id}` framing (minor case-text imprecision, not filed separately — the case's Setup step 3 and Step 5's expected result both already imply the `all/{id}` segment is correct, only Step 5's *own* text row is slightly loose; not worth a duplicate clarification of the already-filed GH#28 URL-shape drift, which covers the identical underlying pattern for Agents)
9. Verify pipeline name is displayed
   - **Verify**: the page's tab/tab-panel accessible name equals the saved (truncated) name; the `Name *` textbox's value equals the saved name (`TEST_Pipeline_Delete_TC023_17830`)
10. Click the overflow-menu (kebab, three-dot) button in the top-right toolbar, immediately right of the `Save`/`Save As Version`/`Discard` button group
    - **Verify**: a `menu` role element opens, grouped into a "VERSION" section (`Set as a default` disabled, `Export`, `Share`, `Fork`, and an always-`disabled` `Delete` — version-level only) and a "PIPELINE" section (`Share`, `Pin to top`, and the enabled `Delete pipeline` this case needs — do not confuse the two "Delete"-shaped items)
    - **Known defect (GH#33, MINOR, cross-module corroboration filed)**: this button has no accessible name (icon-only, `aria-haspopup="true"`) and a broken literal `id="undefined-action"` — confirmed identical to the Agent detail page's kebab button (same defect, now confirmed on a second entity type).
11. Click "Delete pipeline" in the menu (PIPELINE section)
    - **Verify**: a `role="dialog"` modal opens with heading "Delete confirmation", body text `Are you sure to delete {pipelineName}? Enter the name to complete the action.`, a `Name`-labeled text input, and two buttons: "Cancel" (enabled) and "Delete" (**disabled** by default)
    - **Case-text drift (reverse-masking guard applies; corroborated on the existing GH#28 thread rather than filed fresh)**: the case's own Step 9 expects generic "Confirm"/"Cancel" buttons. Live product implements the identical type-the-exact-name-to-confirm pattern already documented for Agents (GH#28/#33) — confirms the shared-dialog-component hypothesis from the task briefing.
12. Type an incorrect value into the Name textbox (e.g. `wrong_name`)
    - **Verify**: "Delete" button remains `disabled` — confirmed live (Axis-2 enrichment; the case only describes the happy path, this validates the gate actually gates, not just cosmetically present)
13. Clear the textbox and type the exact pipeline name (`TEST_Pipeline_Delete_TC023_17830` for this run's fixture)
    - **Verify**: "Delete" button becomes enabled (no `disabled` attribute)
14. Click "Delete"
    - **Verify**: `DELETE /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` fires and returns `204`; page navigates to `${BASE_URL}/app/pipelines/all` (confirmed exact URL, no query params)
15. Wait for the pipelines list to reload — condition wait on the list's own `GET .../applications/prompt_lib/...?agents_type=pipeline...` response, not a fixed sleep
16. Search for the deleted pipeline's name/id in the reloaded list
    - **Verify**: `[...document.querySelectorAll('#EliteACustomTabPanel .MuiCard-root')].some(c => c.textContent.includes(savedName))` is `false` — confirmed live immediately after the redirect. Cross-confirmed via the list's own search box: filling `search` with the saved name triggers `GET /api/v2/elitea_core/search_options/prompt_lib/{ownerId}?query={name}&...entities[]=pipeline...`, whose response body's `pipeline.total` is `0` and `pipeline.rows` is `[]` (same authoritative race-free check pattern as `cardGridList.page.ts`'s `searchAndAwaitResults`, but keyed on the `pipeline` field, not `application`).
17. Check console for errors
    - **Verify**: 0 console errors/warnings across the entire flow (steps 1–16) — confirmed (`Total messages: 5 (Errors: 0, Warnings: 0)`, the 5 messages were a benign ASCII-art build-banner log, identical noise pattern to the Agents-module runs)

## Expected Results
- Fixture pipeline is created, then permanently deleted via the type-to-confirm dialog
- `DELETE /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` returns `204`
- Final URL is exactly `${BASE_URL}/app/pipelines/all`, no query params
- Deleted pipeline's card no longer renders in `#EliteACustomTabPanel` after reload, and the `search_options` endpoint's `pipeline.total` is `0` for its name
- No console errors during the entire create → navigate → delete → verify flow
- No error text/toasts visible post-deletion (`/error/i.test(document.body.innerText)` is `false`)

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Setup 1: maximize browser window | UI elements visible | precondition | viewport set before navigation | asserted |
| Setup 2: verify authenticated state via `/app/chat/` | no redirect = authenticated | precondition | confirmed pre-navigation, no redirect | asserted |
| Setup 3: create test pipeline `TEST_Pipeline_Delete_${timestamp}` | pipeline created, id noted | steps 1–3 | step 3: `201` response + id captured from URL | asserted *(re-authored: full timestamp gets truncated to 32 chars by a client-side `maxlength=32` on the Name field — cross-module corroboration of GH#27, previously only observed on the Agent form. Disposition still "asserted" — the case's intent, a uniquely-named disposable fixture, is satisfied with a shorter effective suffix than the literal case text implies)* |
| 1 Navigate to `/app/pipelines/all` | list loads | step 4 | step 4: URL | asserted |
| 2 Wait 10s for lazy loading | all pipeline cards visible | step 5 | step 5: condition wait on list response + first card visible | asserted *(re-authored: condition wait, not fixed sleep; fixture rendered with zero scrolling given the account's small pipeline count)* |
| 3 Close any modal dialogs if present | modal dismissed | step 6 | step 6 | asserted *(no blocking modal observed at this point in the flow — the release-notes banner was already closed in step 1)* |
| 4 Locate pipeline card for fixture name | card visible | step 7 | step 7: card text-content match | asserted *(enrichment: recommend id-based match over name-text match under parallel execution, same rationale as the Agents-module precedent)* |
| 5 Click the pipeline card | detail page loads at `/app/pipelines/{id}` | step 8 | step 8: URL after click | asserted *(re-authored: actual URL is `/app/pipelines/all/{id}?viewMode=owner&name=...`, not the case's bare `/app/pipelines/{id}` — same shape as the already-filed Agents URL clarification; not filed as a separate ticket, see Known Defects)* |
| 6 Verify pipeline name displayed | name field shows correct value | step 9 | step 9: tab name + Name textbox value | asserted |
| 7 Click menu button (three-dot icon) | dropdown menu opens | step 10 | step 10: `menu` role opens with "Delete pipeline" item under PIPELINE section | asserted |
| 8 Click "Delete pipeline" option | confirmation modal appears with backdrop | step 11 | step 11: `role="dialog"` opens | asserted |
| 9 Verify modal contains confirmation message and "Confirm"/"Cancel" buttons | modal displays Confirm/Cancel | step 11 | step 11: dialog heading/body/buttons | asserted *(re-authored: buttons are "Cancel"/"Delete", not "Confirm"/"Cancel", and "Delete" starts disabled behind a type-the-name gate — identical pattern to the already-filed GH#28/#33 for Agents; corroborated via comment, not filed fresh, per reverse-masking guard: live product's stricter UX is correct, case text is stale)* |
| 10 Click "Confirm" button in modal | modal closes, deletion proceeds | steps 13–14 | step 13: type exact name to enable; step 14: click "Delete", dialog closes | asserted *(decomposed: the case's single "click Confirm" step maps to two live actions — type-to-enable, then click "Delete" — since there is no literal "Confirm" button)* |
| 11 Wait for redirect to pipeline list page | navigates to `/app/pipelines/all` | step 14 | step 14: URL after delete | asserted |
| 12 Wait 10s for lazy loading | all remaining pipeline cards load | step 15 | step 15: condition wait on list reload, not fixed sleep | asserted *(re-authored per project convention — no `waitForTimeout`)* |
| 13 Search for pipeline card by name | card NOT found (deleted) | step 16 | step 16: DOM `.some(...)` returns `false`, plus `search_options` `pipeline.total === 0` | asserted *(enrichment: added the authoritative API-level check alongside the DOM check, same pattern as `cardGridList.page.ts`'s `searchAndAwaitResults`)* |
| Expected Final State: pipeline permanently deleted, list excludes it, URL is `/app/pipelines/all`, no errors | all four conditions hold | steps 14–17 | steps 14 (URL), 16 (absence), 17 (console) | asserted |
| Teardown: none required (already deleted in steps) | n/a | — | — | asserted — matches case's own Teardown, no additional cleanup performed |

### Axis 2 — Analyst additions
- Step 12 asserts the "Delete" button stays `disabled` when the **wrong** name is typed into the confirm textbox — *added: the case only describes the happy path; validates the type-to-confirm gate actually gates, mirroring the same enrichment TC-013 made for Agents (this mechanic feeds the `modal-handling` module later, per the task briefing's `W-OVR` tag).*
- Step 16 asserts the authoritative `search_options` API response (`pipeline.total === 0`) in addition to the case's own DOM-absence check — *added: a race-free, concurrency-immune confirmation in a shared, concurrently-mutated test account (9 sibling analysts creating/deleting pipelines at the same time), following the exact pattern `cardGridList.page.ts` already established for Agents.*
- Step 17 asserts zero console errors/warnings across the whole flow — *added: verified clean throughout; guards against a silent regression the case's own steps don't check for.*
- Step 3 captures and asserts on the numeric pipeline `id` from the create response/URL, in addition to the case's own name-based tracking — *added: same truncation-driven collision risk as Agents (GH#27), id is the only collision-proof handle under parallel execution.*
- (Nothing else added beyond the case.)

## Cleanup
1. None required beyond the case's own Steps 7–14 (the delete action) — confirmed via `DELETE .../application/prompt_lib/21/356` → `204` and post-redirect list-absence + `search_options` zero-result check (step 16). No orphaned fixture remains. Verified other sibling analysts' fixtures (`TC020_Pipe_Min_...`, `TC022_Edit_...`, `TEST_Pipeline_Welcome_TC028_...`) were left untouched.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Create-pipeline Name input | `getByRole('textbox', { name: 'Name *' })` — **note hard `maxlength=32`**, identical constraint to the Agent create form (cross-module corroboration of GH#27) | n/a — stable role+name handle |
| Create-pipeline Description input | `getByRole('textbox', { name: 'Description *' })` | n/a |
| Create-pipeline Save button | `getByRole('button', { name: 'Save' })` — starts `disabled`, enables once both required fields are non-empty. Release-notes banner (`getByRole('button', { name: 'close' })`) should be dismissed defensively first in a fresh session — same banner/precaution already documented for the Agent form, GH#42 | n/a |
| Pipelines list container / card (reuse existing) | `page.locator('#EliteACustomTabPanel')` / `page.locator('#EliteACustomTabPanel .MuiCard-root')` — same handle `tests/pages/cardGridList.page.ts` already exposes (confirmed identical container id/class on the Pipelines route, per `.agents/testing.md`) | `.MuiCardContent-root` — no `data-testid`/role/aria-label on cards (GH#13, pre-existing) |
| Card's clickable name element | inner child with inline `cursor:pointer` style (same DOM shape as the Agents card) — `page.locator('#EliteACustomTabPanel').getByText(pipelineName, { exact: true })` | text-content `.find()` scan of `.MuiCard-root` list (used this run, works but O(n)) |
| Pipelines list search box | `getByRole('textbox', { name: 'search' })` — same handle as `cardGridList.page.ts`'s `searchInput`, confirmed present on `/app/pipelines/all` too | placeholder text match: `getByPlaceholder("Let's find something amazing!")` |
| Pipeline detail — Name field | `getByRole('textbox', { name: 'Name *' })` (same role+name as create form, reused on detail page) | n/a |
| Pipeline detail — overflow/kebab menu trigger | `page.locator('#undefined-action')` — **currently works but is a confirmed product defect** (literal broken `id`, cross-module corroboration of GH#33); no `aria-label`/text exists to disambiguate | `page.locator('button[aria-haspopup="true"]').last()` scoped to the tab-header toolbar row (the row containing "Save"/"Save As Version"/"Discard"), same fallback pattern already recommended for Agents |
| "Delete pipeline" menu item | `getByRole('menuitem', { name: 'Delete pipeline' })` — **do not confuse with** the always-`disabled` `getByRole('menuitem', { name: 'Delete' })` under the "VERSION" section of the same menu | n/a — role+name is unambiguous once scoped to "PIPELINE" section |
| Delete-confirmation dialog | `page.getByRole('dialog')` (only one dialog is ever mounted at a time) — heading text "Delete confirmation". Empirically confirmed `page.getByRole('dialog', { name: 'Delete confirmation' })` **does not resolve** (`does not match any elements`) — same broken `aria-labelledby="alert-dialog-title"` (points at a non-existent id; actual heading id is `variables-dialog-title`) already documented for Agents, GH#33 | `page.locator('[role="dialog"]')` |
| Delete-confirmation "type name" input | `page.locator('#name')` (input `id="name"`, `name="name"`) — **has no accessible name** (cross-module corroboration of GH#33), so `getByRole('textbox')` only works because it's the dialog's sole textbox, not via real disambiguation | `page.getByRole('dialog').getByRole('textbox')` (only one input exists inside the dialog) |
| Delete-confirmation Cancel button | `page.getByRole('dialog').getByRole('button', { name: 'Cancel' })` | n/a |
| Delete-confirmation Delete button | `page.getByRole('dialog').getByRole('button', { name: 'Delete' })` — starts `disabled`, enables only when the typed value exactly matches the pipeline's (possibly truncated) saved name | n/a |

## Network Behavior
- `POST /api/v2/elitea_core/applications/prompt_lib/{ownerId}` — create pipeline. Fires on Save click. `201` on success. Response includes the new pipeline's numeric `id` (356 this run) and its default version `id` (381) — capture the pipeline `id` for later disambiguation.
- `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?tags=&sort_by=created_at&sort_order=desc&query=&agents_type=pipeline&limit=20&offset=0` — the pipelines list. Same shape as the Agents list (`agents_type=classic`), confirming both entity types share one list endpoint parametrized by `agents_type`. Sorts `created_at desc`, so a freshly created fixture is always on page 1.
- `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — pipeline detail fetch, fires on navigating to the detail URL with `?viewMode=owner`. `200` on success.
- `GET /api/v2/elitea_core/search_options/prompt_lib/{ownerId}?query={q}&sort=id&order=desc&entities[]=tag&entities[]=pipeline&tag_limit=20&tag_offset=0&col_limit=20&col_offset=0` — the list's search box, debounced. Response body's `pipeline.total`/`pipeline.rows` gives an authoritative, race-free "does a pipeline with this name exist" check — same pattern as `cardGridList.page.ts`'s `searchAndAwaitResults`, but keyed on `pipeline`, not `application`. Confirmed `pipeline.total: 0` after deleting the fixture and searching its exact name.
- `DELETE /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — fires on "Delete" click inside the confirmation dialog once the typed name matches. Returns `204` on success.
- Wait strategy for the implementer: `page.waitForResponse(resp => resp.url().includes(\`/application/prompt_lib/${ownerId}/${id}\`) && resp.request().method() === 'DELETE' && resp.status() === 204)` before asserting on `/app/pipelines/all`.

## Known Defects Found During Exploration

- **[INFO / CLARIFICATION]** Reverse-masking guard applies — live product is correct, case text is stale. Step 9's expected "Confirm"/"Cancel" buttons don't exist; live product uses the identical type-the-exact-name-to-confirm gate already documented for Agents, with "Cancel"/"Delete" buttons.
  - **Filing status**: not filed as a new ticket. Corroborated via comment on the existing [`GH#28`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/28) thread (Agents-module case-text-drift bundle, already carrying 6 prior corroborations) — this is the same shared dialog component, confirmed cross-module by this analysis, per the task briefing's working hypothesis.
- **[MINOR]** Same three related broken id/ARIA attributes already filed for Agents, now confirmed on the Pipeline delete flow:
  1. Overflow-menu (kebab) button carries a literal broken `id="undefined-action"`.
  2. Delete-confirmation dialog's `aria-labelledby="alert-dialog-title"` references a non-existent DOM id (actual heading id is `variables-dialog-title`).
  3. The "type the name" confirm input (`id="name"`) has no accessible name at all.
  - **Filing status**: not filed as a new ticket. Corroborated via comment on the existing [`GH#33`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/33) thread — confirms this is generic/shared dialog infrastructure used across the whole app, not scoped to the Agents feature.
- **[MINOR]** Name field silently truncates at 32 characters (cross-module corroboration of the Agents-module [`GH#27`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/27)), on the **Pipeline** create form.
  - **Filing status**: not filed as a new ticket. Corroborated via comment on `GH#27` — confirms the Pipeline and Agent create forms share the same `Name` field component/validation.
- **Pre-filing duplicate check performed** (per this batch's standing process fix — title/body search alone is known to miss comment-only findings): ran `gh issue list --search "pipeline delete"`, `"Delete confirmation"`, `"kebab"` (all state) — no pipelines-module-specific ticket existed yet; then read `gh issue view {27,28,33} --comments` in full before corroborating, and re-verified all three were still `OPEN` immediately before posting (staleness-variant guard, per `defect_search_must_include_comments.md`'s documented trap in this batch).
- **Impact on automation**: none of the above block the happy-path automation (all elements remain clickable/fillable via `id`/positional selectors); they are accessibility/code-quality defects and a silent-truncation UX gap, not functional blockers. Documented above in Concrete Handles with the currently-working (flagged) selectors plus forward-compatible fallbacks.

## Blocked Steps
None. All case Setup steps (1–3) and all 13 numbered Steps were executed end-to-end against the live system, using a disposable fixture created specifically for this case (pipeline id 356, deleted by the end of the run).

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — this case joins `tests/pipelines.spec.ts` (module: pipelines, per `.agents/test-automation.yaml` and the EPIC's module-by-module delivery plan, GH#16). Per `.agents/testing.md` § Structure, WebQAPreExecuted-module specs are **not** assumed serial by default — TC-023 has no observed dependency on sibling pipelines-module cases (TC-020..022/024..029), each creates and cleans up its own fixture.
- Page object: reuse `tests/pages/cardGridList.page.ts` for the list/card interactions (steps 4–8) — confirmed identical `#EliteACustomTabPanel`/`.MuiCard-root` shape on `/app/pipelines/all`, including the `searchAndAwaitResults`-style API check (keyed on `pipeline`, not `application` — the method may need a small parametrization, or a sibling method, to support both entity keys). This case is a strong candidate to seed `tests/pages/pipelineForm.page.ts` (or a shared `entityForm.page.ts`, per `.agents/testing.md`'s own note that this was flagged as worth evaluating) and a modal-handling helper for the type-to-confirm dialog pattern — reuse whatever TC-013 (Agents) already established for the identical dialog rather than rebuilding it, and this in turn should be the one both modules hand off to the dedicated `modal-handling` module's later cases (TC-054+).
- Wait strategy: no `waitForTimeout` anywhere in this spec — every wait is a `waitForResponse` on the specific list/create/delete/search endpoint, or a web-first `expect(...).toBeVisible()` / `expect(...).toBeEnabled()` poll (e.g. polling the "Delete" button's enabled state after typing the name).
- Fixture naming: given the confirmed `maxlength=32` truncation (see Test Data), the same shorter-suffix recommendation already flagged for Agents applies here too — a framework-scale consideration for Tal, not something to fix in this single case's spec.
- **Analyst execution note (process/tooling, not product)**: ran via `playwright-cli -s=TC023`, a genuinely isolated in-memory browser profile (confirmed via fresh `/app/chat/` redirecting to Keycloak login with no inherited cookies at session start). No cross-talk with the concurrently-dispatched sibling analysts (TC-020..022, TC-024..029) was observed at any point (verified `window.location.href` after every navigation/interaction per the standing mitigation in `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`) — sibling fixtures (`TC020_Pipe_Min_...`, `TC022_Edit_...`, `TEST_Pipeline_Welcome_TC028_...`) were visible in the shared account's pipelines list during list-scan steps but were never interacted with.
