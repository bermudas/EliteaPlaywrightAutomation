# Test Case: Create Pipeline with All Fields Filled

## Metadata
- **TMS ID**: TC-021
- **Linked Story**: GH#46 (own tracking issue, parent epic GH#16)
- **Priority**: l2
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`) — isolated `playwright-cli -s=TC021` session (own in-memory Chrome profile, confirmed non-shared with sibling parallel analysts TC-020/TC-022..029 per `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`: fresh `/app/chat/` navigation bounced to the Keycloak login page before any login, proving no inherited cookies; `window.location.href` re-verified after every navigation/interaction)
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via `GET ${BASE_URL}/app/chat/` not redirecting to the Keycloak login page
- Browser viewport: case's own Setup step 1 ("maximize browser window" via `window.moveTo`/`window.resizeTo`) is a manual-execution artifact — Playwright automation controls viewport via `playwright.config.ts` (project default 1920×1080 Desktop Chrome per `.agents/testing.md`), not a runtime resize call. Explored in a headless default viewport (1280×720); no field/layout behavior in this case was viewport-dependent.
- **This case is mutating** (creates then deletes one pipeline) and the test account is shared with concurrently-running sibling test cases (this project's account has no per-analyst isolation) — MUST run in its own isolated browser context, never sharing a session/tab with a parallel case. Confirmed at deletion time that sibling fixtures observed elsewhere in the batch's daily log (e.g. `TC020_Pipe_Min_...`) were not touched by this run.

## Test Data

### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` (`alita@elitea.ai`, owner_id `21`, author_id `42`)
- Tags `test` (id `8`), `automation` (id `9`), `pipeline` (id `3`) — typing + Enter in the Tags combobox re-uses an existing tag by exact-name match rather than creating a duplicate. **Notable cross-entity finding**: `test` (id `8`) and `automation` (id `9`) are the **identical tag ids** already used by the Agents-module cases (TC-011's AFS) — confirms tags are a single shared/global entity namespace scoped to the account (`owner_id=21`), not partitioned per entity-type (Agent vs Pipeline). `pipeline` (id `3`) was itself a pre-existing tag on the account's own "Analyze GitHub Issues" pipeline, visible in the Tags filter on `/app/pipelines/all` before this case ran.

### Must Generate (in test setup)
- Unique pipeline name: case's own template is `TEST_Pipeline_Full_${timestamp}` — `TEST_Pipeline_Full_` is exactly 19 chars, + a 13-digit ms timestamp = **32 chars, landing exactly at** the Name field's confirmed hard `maxLength="32"` cap (cross-module corroboration of [`GH#27`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/27) — confirmed live via `document.querySelector('input#name').maxLength === 32` on this Pipeline create form, identical to the Agent form). Per this batch's parallel-dispatch data-collision guard (10 sibling analysts creating/editing/deleting pipelines concurrently on the same account), a `TC021_` disambiguation segment was needed — appending it to the case's own template would overflow the cap and get silently truncated (same trap TC-010/TC-017 hit for Agents). Used a shortened, budgeted template instead: **`TC021_Pipeline_${Date.now()}`** (15-char prefix + 13-digit ms timestamp = 28 chars, comfortably under the cap) — confirmed persisted byte-for-byte identical after fill and again in the `POST` response body (`TC021_Pipeline_1783027296991`, 28 chars, zero truncation).
- Description: `Full test pipeline with all fields populated` (case's own literal value, 46 chars — comfortably under the Description field's own `maxLength="2304"`, confirmed via DOM read; no truncation)
- Tags: `test`, `automation`, `pipeline` (case's own literal values — all three resolved to pre-existing account-level tags, no new tag entities created)
- Welcome Message: `Hello! This is a test pipeline. How can I help you?` (53 chars; field's own `maxLength="768"`, confirmed via a live "N characters left" counter that appears immediately on typing — unlike Name/Description, which show no counter at all, see § Known Defects)
- Conversation Starter 1: `What can this pipeline do?` (27 chars)
- Conversation Starter 2: `Show me an example workflow` (28 chars)
- Step Limit: `60` (field's own pre-filled default was observed as `25`, no `maxLength` on this input — it's a numeric control, not text-length-capped)

### Must Clean Up (in teardown)
- Delete the created pipeline via the UI delete flow (see § Cleanup) — confirmed via `DELETE /api/v2/elitea_core/application/prompt_lib/{owner_id}/{pipeline_id}` returning `204`
- No tag cleanup needed — tags are shared/reusable account-level entities, not created per-run (all three tags used here already existed)

## Test Steps
1. Navigate to `${BASE_URL}/app/pipelines/all`
   - **Verify**: URL is `${BASE_URL}/app/pipelines/all`; page title becomes `Pipelines: all - Private`
2. Wait for the card grid to render — condition wait on the `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?...agents_type=pipeline...` response (200) plus at least one `.MuiCard-root` visible inside `#EliteACustomTabPanel`, not a fixed sleep (case's own "wait 10 seconds" is a manual-execution artifact per `.agents/testing.md` § Conventions)
3. Check for a blocking modal dialog (`[role="dialog"]`) and dismiss if present
   - **Verify**: the dismissible "Announcing ELITEA 2.0.4!" release-notes banner (`getByRole('button', { name: 'close' })`) was the only overlay observed on this route during exploration — closed defensively before interacting with the sidebar. No `[role="dialog"]` was present.
4. Click the sidebar create-pipeline control
   - **Action**: `page.getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Pipeline', exact: true })`
   - **Verify**: navigates to `${BASE_URL}/app/pipelines/create?viewMode=owner` (matches case step 4's expected URL exactly)
   - **Note**: the case's own wording ("Create Pipeline button") describes intent, not the literal accessible name — the live control's accessible name is just `"Pipeline"`, identical pattern to the Agents sidebar's `"Agent"` control. Tracked on a single cross-module ticket, [`GH#30`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/30) ("Sidebar 'Create X' button's accessible name drops the 'Create' prefix (Agents: 'Agent'; Pipelines: 'Pipeline')"), independently corroborated by this case — a Pipelines-specific ticket (#55) was briefly opened by a sibling analyst and then closed as a duplicate of GH#30, per this batch's established one-ticket-per-pattern convention.
5. Fill `Name *` with the generated unique name (≤32 chars, see Test Data)
   - **Verify**: `page.getByRole('textbox', { name: 'Name *' }).evaluate(el => el.value)` equals the exact input string (guards silent truncation — see Known Defects, GH#27)
6. Fill `Description *` with `Full test pipeline with all fields populated`
   - **Verify**: field value matches
7. Add Tags: click the Tags combobox, type `test`, press `Enter`; repeat for `automation`, then `pipeline`
   - **Verify**: after each Enter, a chip `button` with that exact tag name appears in the Tags region (`page.getByRole('combobox', { name: 'Tags' }).locator('..').getByRole('button', { name: tagName, exact: true })`)
8. Confirm General / Welcome message / Conversation starters / Advanced sections are visible — **no expand action needed**
   - **Verify**: `Welcome message`'s `Input your welcome message` textbox, the `Conversation starters` section's `Starter` add-button, and the `Advanced` section's `Step limit` textbox are all already visible without any click (case steps 10, 12, 17's "expand if collapsed" branches never trigger on the live form — all sections render pre-expanded, identical pattern to the Agents create form's GH#28 item 1; corroborated for Pipelines and bundled into [`GH#56`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/56))
9. Fill `Input your welcome message` with the case's welcome text
   - **Verify**: field value matches; a live counter (`"N characters left"`, confirmed `maxLength="768"`) is visible and decrements as expected — not required by the case, but a useful non-flaky guard that the field is genuinely accepting input
10. Click `button "Starter"` (with `+` icon) to add the first conversation-starter field
    - **Verify**: a new `textbox "Starter"` appears (empty, focused), plus a `button "delete starter"` next to it and a live `"N characters left"` counter once text is entered
11. Fill the first starter textbox with `What can this pipeline do?`
    - **Verify**: field value matches. **Handle note**: the underlying `<textarea>` carries a stable `name="version_details.conversation_starters[0]"` — use this (or index-scoped `nth(0)`) rather than `getByRole('textbox', { name: 'Starter' })` once a second starter exists, since both share the identical unnamed accessible name "Starter" (see § Concrete Handles)
12. Click `button "Starter"` again to add the second conversation-starter field
    - **Verify**: a second `textbox "Starter"` appears; the first starter's value is unaffected
13. Fill the second starter textbox with `Show me an example workflow`
    - **Verify**: field value matches. **Handle**: `name="version_details.conversation_starters[1]"`
14. Fill `Step limit` with `60` (field pre-fills `25`; a single `.fill()` call replaces the existing value — case's own step 18 says "clear ... and fill", both satisfied by one `fill()` call, no separate clear step needed)
    - **Verify**: field value is `60`
15. Click `Save`
    - **Action**: `page.getByRole('button', { name: 'Save', exact: true })` — unambiguous on the **create** page (only `Save`/`Cancel` exist here, no `Save As Version` sibling yet; that only appears post-creation on the detail/edit page, see § Concrete Handles). Disabled until Name+Description are both non-empty; confirmed enabled once both were filled.
    - **Verify**: `POST /api/v2/elitea_core/applications/prompt_lib/{owner_id}` returns `201`; response body's `version_details.tags` array contains exactly `test`, `automation`, `pipeline`; `version_details.welcome_message` matches the Welcome Message text; `version_details.conversation_starters` is `["What can this pipeline do?", "Show me an example workflow"]` (array of strings, order preserved); `meta.step_limit` (both at `versions[0].meta.step_limit` and `version_details.meta.step_limit`) is `60`
16. Wait for redirect after save — condition wait on `page.waitForURL(/\/app\/pipelines\/all\/\d+/)`, not a fixed sleep
    - **Verify**: URL matches `${BASE_URL}/app/pipelines/all/{id}?destTab=configuration&name={encodedName}&viewMode=owner` (see Known Defects — the case's exact `/app/pipelines/{id}` shape does not match; assert the `/app/pipelines/all/{id}` prefix / extract `{id}` via regex instead)
17. Pipeline detail page is already loaded post-redirect — case's own step 21 ("navigate to pipeline detail page") is a no-op here; Save redirects directly into the detail/configuration view, no separate navigation required
18. Verify all field values persisted on the detail page
    - **Verify**: `Name *` = generated name; `Description *` = case value; Tags chips = `test`, `automation`, `pipeline` (all three, exact); `Input your welcome message` = case value; both `Starter` textboxes = the two case values, in order; `Step limit` = `60`. Additionally cross-verified via a fresh `GET /api/v2/elitea_core/application/prompt_lib/{owner_id}/{id}` (fires automatically on landing) returning the identical `version_details` shape as the create response.
    - **Evidence**: full detail-page accessibility snapshot captured during this exploration; full `POST`/`GET` response bodies captured and diffed field-by-field against the Test Data table — no field missing or truncated.

## Expected Results
- New pipeline created and persisted with `id` allocated by the API (observed: `359`; not stable across runs, use the API response's own `id` field, never hardcode) and a default `version_details.id` (observed: `384`)
- All 7 test-data fields (Name, Description, 3 Tags, Welcome Message, 2 Conversation Starters, Step Limit) display exactly as entered on the detail/configuration page — no truncation, no missing fields (confirmed field-by-field against both the `POST` response body and the subsequent `GET`)
- `POST /api/v2/elitea_core/applications/prompt_lib/{owner_id}` → `201`; `GET /api/v2/elitea_core/application/prompt_lib/{owner_id}/{id}` → `200`
- New pipeline's `status` is `draft` (observed in both the create response and each version entry) — not asserted by the case, but a safe non-flaky fact if automation wants to guard against accidental publish-on-create
- No console errors or warnings at any point (confirmed clean throughout: login, navigation, form-fill, save, verify, delete — `Total messages: 6 (Errors: 0, Warnings: 0)`, the only logged message was a benign ASCII-art build-version banner)
- No `4xx`/`5xx` responses anywhere in the flow (confirmed via a full network-log scan)

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Preconditions: app accessible, user authenticated, browser maximized | environment ready | precondition | confirmed pre-navigation: no login redirect | asserted *(maximize re-authored — see Preconditions note)* |
| Setup 1: maximize browser window | all UI elements visible | precondition | n/a — manual-execution artifact | asserted *(re-authored: Playwright viewport config replaces runtime resize, per `.agents/testing.md` precedent)* |
| Setup 2: verify authenticated via `/app/chat/` | no redirect = authenticated | precondition | confirmed pre-navigation | asserted |
| 1 Navigate to `/app/pipelines/all` | list loads | step 1 | step 1: URL + title | asserted |
| 2 Wait 10s for lazy loading | all existing pipeline cards visible | step 2 | step 2: condition wait, not fixed sleep | asserted *(re-authored per `.agents/testing.md` § Conventions — no `waitForTimeout`)* |
| 3 Close modal dialogs if present | modal dismissed | step 3 | step 3: dialog check | asserted *(none observed on this route beyond the release-notes banner, closed defensively)* |
| 4 Click "Create Pipeline" button | form opens at `/app/pipelines/create?viewMode=owner` | step 4 | step 4: URL match (exact) | asserted *(re-authored: literal accessible name is "Pipeline", not "Create Pipeline" — case describes intent; GH#30)* |
| 5 Fill Name | value set | step 5 | step 5: `.value` read-back | asserted *(re-authored: assert exact value to guard silent truncation, GH#27)* |
| 6 Fill Description | value set | step 6 | step 6: value match | asserted |
| 7 Add tag "test" | tag added | step 7 | step 7: chip appears | asserted |
| 8 Add tag "automation" | tag added | step 7 | step 7: chip appears | asserted |
| 9 Add tag "pipeline" | tag added | step 7 | step 7: chip appears | asserted |
| 10 Expand "Welcome Message" section if collapsed | section opens | step 8 | step 8: visibility check | asserted *(re-authored: never collapsed on live form — see GH#56 item 1)* |
| 11 Fill Welcome message | text entered | step 9 | step 9: value match | asserted |
| 12 Expand "Conversation Starters" section if collapsed | section opens | step 8 | step 8: visibility check | asserted *(re-authored, same as step 10)* |
| 13 Click "Starter" button | new starter field appears | step 10 | step 10: field appears | asserted |
| 14 Fill first starter field | text entered | step 11 | step 11: value match | asserted |
| 15 Click "Starter" button again | second starter field appears | step 12 | step 12: field appears | asserted |
| 16 Fill second starter field | text entered | step 13 | step 13: value match | asserted |
| 17 Expand "Advanced" section if collapsed | section opens | step 8 | step 8: visibility check | asserted *(re-authored, same as step 10)* |
| 18 Clear Step limit and fill 60 | value set to 60 | step 14 | step 14: value match | asserted *(re-authored: single `.fill()` covers clear+set)* |
| 19 Click "Save" button | pipeline saved | step 15 | step 15: `POST .../applications/prompt_lib/{ownerId}` → 201, response body fields | asserted |
| 20 Wait for redirect or success notification | redirects to detail or list view | step 16 | step 16: URL condition wait | asserted *(re-authored: condition wait, not fixed sleep; no toast/notification element was observed at the moment of redirect — assert on URL/title change instead, same re-scoping as TC-020's Agent/Pipeline-minimal finding)* |
| 21 Navigate to pipeline detail page | detail page loads | step 17 | — | asserted *(no-op — Save already redirects into detail view; see AFS step 17)* |
| 22 Verify all field values persisted | all 7 fields match, no truncation | step 18 | step 18: field-by-field assertions | asserted |
| Expected Final State: new pipeline visible, all data correct, no missing/truncated fields | full persistence | step 18 | step 18 | asserted |
| Expected Final State: URL is `/app/pipelines/{id}` | exact URL shape | step 16 | step 16: URL prefix/regex assertion | clarification *(observed `/app/pipelines/all/{id}?destTab=configuration&name=...&viewMode=owner` — see GH#56 item 2)* |
| Teardown: open 3-dot menu, click "Delete pipeline" | delete flow starts | cleanup 1–2 | cleanup steps | asserted *(menu item's own name matches case text exactly — "Delete pipeline" is the correct live label, no drift there)* |
| Teardown: confirm via "Confirm" button | pipeline deleted | cleanup 3 | cleanup step: `DELETE .../application/prompt_lib/{ownerId}/{id}` → 204 | clarification *(no "Confirm" button exists; live flow requires typing the exact pipeline name into a `Name` textbox before a `Delete` button becomes enabled — see GH#56 item 3, same shared-dialog mechanics as GH#33)* |
| Teardown: verify pipeline removed from list | pipeline gone | cleanup 4 | cleanup step: DOM text-content check returns false | asserted |

### Axis 2 — Analyst additions
- Step 5 asserts the Name field's exact `.value` (not just "is visible" or "is non-empty") — *added: the case's own template lands exactly at the confirmed 32-char cap (GH#27, cross-module), and any disambiguation prefix added for parallel-run safety pushes over it; without this exact-value assertion, automation would silently pass while saving a truncated name.*
- Step 11 documents the stable `name` attribute (`version_details.conversation_starters[0]`/`[1]`) for the two "Starter" textboxes — *added: both share the identical, non-unique accessible name "Starter" once a second one exists, so `getByRole('textbox', { name: 'Starter' })` alone cannot disambiguate; discovered only by inspecting the DOM `name` attribute directly, not from the case text. Filed as [`GH#57`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/57) by TC-027's analyst (dedicated conversation-starters deep-dive), independently corroborated from this case's own two-starter fill.*
- Step 15 asserts structured response-body fields (`tags`, `welcome_message`, `conversation_starters`, `meta.step_limit`) from the `POST` response, not just the HTTP status — *added: the create call is the single source of truth for what actually persisted; verifying it here catches a server-side data-shape regression before the UI even re-renders the detail page. Also directly relevant to GH#43 (see Known Defects) — the response body is the only way to confirm `welcome_message` genuinely round-tripped, not just that the DOM showed it pre-Save.*
- Expected Results adds "no console errors/warnings" and "no 4xx/5xx responses" throughout — *added: confirmed clean across the entire login→create→verify→delete flow; guards a silent regression the case's own steps don't check for.*
- Expected Results notes the new pipeline's `status: "draft"` — *added: observed and stable across the single run; useful non-flaky guard if a future case needs to distinguish draft vs published pipelines, not required by this case's own assertions.*
- Test Data notes the shared tag-id namespace across Agents and Pipelines (`test`=8, `automation`=9 identical to the Agents module) — *added: a genuinely new cross-entity observation not previously documented; relevant if a future case ever needs to reason about tag cleanup or collision across both entity types.*
- (Nothing else added beyond the case.)

## Cleanup
1. On the pipeline detail/configuration page, click the header kebab/3-dot menu button (`#undefined-action` — see Concrete Handles for the recommended non-literal fallback)
2. In the opened menu, click `menuitem "Delete pipeline"` under the **"PIPELINE"** section (**not** the disabled `menuitem "Delete"` under the "VERSION" section — that one deletes the current *version* and is disabled when the pipeline has only one version; "Delete pipeline" deletes the whole application)
3. In the "Delete confirmation" dialog, fill the `Name` textbox (`#name`) with the exact pipeline name, then click the (now-enabled) `Delete` button
4. Verify: `DELETE /api/v2/elitea_core/application/prompt_lib/{owner_id}/{id}` → `204`; redirected to `/app/pipelines/all`; the pipeline's name no longer appears anywhere in the page's text content (`document.body.innerText.includes(name) === false`, confirmed)

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Sidebar create-pipeline control | `page.getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Pipeline', exact: true })` | none needed — stable role+name on `/app/pipelines/*` routes; same DOM slot renders `"Agent"`/`"Conversation"` on other routes |
| Name field | `page.getByRole('textbox', { name: 'Name *' })` | `input[name="name"]` — carries native `maxLength="32"`, see Known Defects |
| Description field | `page.getByRole('textbox', { name: 'Description *' })` | `textarea` inside the region following the Name field's container — `maxLength="2304"`, no live counter |
| Tags combobox | `page.getByRole('combobox', { name: 'Tags' })` | none needed |
| Tag chip (committed) | `page.getByRole('button', { name: tagName, exact: true })` scoped to the Tags field's container | `.MuiChip-root:has-text(tagName)` |
| Welcome message textarea | `page.getByRole('textbox', { name: 'Input your welcome message' })` | `textarea#welcome_message` — `maxLength="768"`, live "N characters left" counter |
| Conversation Starter — add button | `page.getByRole('button', { name: 'Starter', exact: true })` — becomes `disabled` immediately after click until re-enabled once the just-added field has content; re-query after each add | none needed |
| Conversation Starter — field N (0-indexed) | `page.locator('textarea[name="version_details.conversation_starters[0]"]')` / `[1]` — **do not** use `getByRole('textbox', { name: 'Starter' })` once a second starter exists, both share the identical non-unique accessible name "Starter" | `page.getByRole('textbox', { name: 'Starter' }).nth(0)` / `.nth(1)` (position-based, works but fragile if starters are ever reordered/deleted) |
| Conversation Starter — delete button | `button "delete starter"` scoped to that starter's row | positional: the icon button adjacent to each starter textbox |
| Step limit input | `page.getByRole('textbox', { name: 'Step limit' })` | none needed — pre-fills `"25"`, no `maxLength` |
| Save button (**create** form only) | `page.getByRole('button', { name: 'Save', exact: true })` | none needed — unique on `/app/pipelines/create`; **no `data-testid`** exists on this page (confirmed: `document.querySelectorAll('[data-testid]')` returns zero elements here) — do not reach for `getByTestId('agent-save-button')` on the create form, it won't resolve |
| Save button (**detail/edit** page, post-creation) | `page.getByTestId('agent-save-button')` — **required**, not optional: the detail page's toolbar renders `Save`/`Save As Version`/`Discard` together, and `getByRole('button', { name: 'Save' })` (non-`exact`) strict-mode-violates against `Save As Version` (cross-module corroboration of [`GH#34`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/34) — confirmed live: the exact same `data-testid="agent-save-button"` value is reused verbatim on the Pipeline entity form, not a pipeline-specific id, confirming Agents and Pipelines share one underlying entity-form component) | `page.getByRole('button', { name: 'Save', exact: true })` (also disambiguates, but the testid is the more stable, clearly-intentional handle) |
| Pipeline detail kebab/3-dot menu button | **No stable handle exists.** `id="undefined-action"` (a templated id whose interpolated segment evaluated to `undefined` — cross-module corroboration of [`GH#33`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/33), confirmed identical on this Pipeline detail page). Used positionally during exploration: the icon-button immediately right of the `Save`/`Save As Version`/`Discard` group. | `page.locator('button[aria-haspopup="true"]').last()` scoped to the tab-header toolbar row — verify uniqueness before relying on this in CI |
| "Delete pipeline" menu item | `page.getByRole('menuitem', { name: 'Delete pipeline', exact: true })` | disambiguates from the disabled `menuitem "Delete"` (version-delete) under the "VERSION" section of the same menu |
| Delete-confirmation dialog | `page.getByRole('dialog')` (**unscoped** — `getByRole('dialog', { name: 'Delete confirmation' })` does **not** resolve; confirmed `aria-labelledby="alert-dialog-title"` points at a non-existent DOM id, cross-module corroboration of GH#33) | `.MuiDialog-root` filtered by text "Delete confirmation" |
| Delete-confirmation name textbox | `page.locator('#name')` (input `id="name"`/`name="name"`, **no accessible name** — cross-module corroboration of GH#33) | `page.getByRole('dialog').getByRole('textbox')` — works only because it's the dialog's sole textbox |
| Delete-confirmation Delete button | `page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true })` | disabled until the name textbox contains the exact pipeline name |

## Network Behavior
- `POST /api/v2/elitea_core/applications/prompt_lib/{ownerId}` — fires on Save click. Request is the full form payload; response `201` body includes `id` (new pipeline id, `359`), `versions[0].id` (new version id, `384`), `versions[0].meta.step_limit` (`60`), `version_details.tags: [{id, name, data:{color}}]` (`test`=8, `automation`=9, `pipeline`=3), `version_details.welcome_message`, `version_details.conversation_starters` (array of strings, in entry order), `version_details.meta.step_limit`, `version_details.pipeline_settings` (a default empty flow graph — `{edges: [], nodes: [{id: "END", ...}]}`, not part of this case's own assertions but present and worth knowing exists for any future pipeline-flow-editing case), `status: "draft"`. This is the authoritative source for post-save assertions — prefer it over re-parsing the re-rendered DOM.
- `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — fires once on landing on the detail/configuration page; `200`, returns the same shape as the create response.
- `DELETE /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — fires on confirmed delete; `204` on success, then redirects to `/app/pipelines/all`.
- Wait strategy for the implementer: `page.waitForResponse(resp => resp.url().includes('/applications/prompt_lib/') && resp.request().method() === 'POST' && resp.status() === 201)` after clicking Save, instead of a fixed-duration sleep; `page.waitForResponse(resp => resp.url().includes('/application/prompt_lib/') && resp.request().method() === 'DELETE' && resp.status() === 204)` after clicking the confirmation `Delete` button.

## Known Defects Found During Exploration

- **[MINOR, pre-existing]** Name field silently truncates at 32 characters with no counter or warning — cross-module corroboration of [`GH#27`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/27) (already retitled "Agents + Pipelines" by prior sibling analysts TC-022/TC-023/TC-025 in this same batch). This case's own template lands exactly at the 32-char cap before any disambiguation is even added — commented on GH#27 with a new supplementary data point: `Description` also has **no** live counter on the Pipelines form (unlike the counter reported for Agents' Description field), while `Welcome message` and `Starter` fields **do** show one — the counter-omission is specific to `Name`/`Description`, not systemic.
- **[MINOR, pre-existing]** Overflow-menu (kebab) button `id="undefined-action"`, delete-confirmation dialog's broken `aria-labelledby="alert-dialog-title"` (resolves to nothing), and the confirm-name textbox's missing accessible name — cross-module corroboration of [`GH#33`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/33), already confirmed on Pipelines by TC-023's analyst pass. Independently reconfirmed here on a second pipeline id (359) — no new comment posted (already thoroughly corroborated), documented here for this AFS's own completeness.
- **[INFO, pre-existing]** `getByRole('button', { name: 'Save' })` (non-`exact`) strict-mode-violates against `Save As Version` on the Pipeline detail/edit page — cross-module corroboration of [`GH#34`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/34), already confirmed on Pipelines by TC-022. Independently reconfirmed here (pipeline id 359, same `data-testid="agent-save-button"` reused verbatim) — no new comment posted (already thoroughly corroborated).
- **[INFO / CLARIFICATION]** TC-021's case text drifts from the live product in three ways — filed as [`GH#56`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/56) (reverse-masking guard: live product is correct, case text is stale), the Pipelines-module counterpart of GH#28 (Agents):
  1. Steps 10/12/17's "expand ... if collapsed" branches never trigger — all sections (General, Welcome message, Conversation starters, Advanced) render pre-expanded on the live create form.
  2. Expected Final State's exact URL `/app/pipelines/{id}` does not match the live shape `/app/pipelines/all/{id}?destTab=configuration&name={name}&viewMode=owner`.
  3. Teardown's "Confirm" button does not exist — the live delete-confirmation dialog requires typing the exact pipeline name into a `Name` textbox to enable a `Delete` button; there is no button literally named "Confirm". (The menu item's own label, "Delete pipeline", is correct as-authored — no drift there.)
  - **Filing status**: filed per `.agents/profile.md` § Bug filing (`github-issue`, strict-per-bug, bundled as one case-text-drift ticket per existing convention — see GH#9, #10, #12, #14, #28, #30). Referencing TC-021 and linked to parent epic GH#16 / tracking issue GH#46. Pre-filing duplicate check performed per this batch's standing process fix (`defect_search_must_include_comments.md`): ran `gh issue list --search` across several keyword variants, confirmed no existing pipelines-module ticket covered items 1/2/3, then re-verified GH#27/#33/#34 were all still `OPEN` immediately before filing/commenting (staleness-variant guard). **Post-filing staleness hit anyway**: the sidebar-button-name ticket (#55, item 4's analogue, tracked separately from this bundle) was closed as a duplicate of GH#30 within minutes of my own corroboration comment landing on it — corrected via a follow-up comment on #55 and a fresh corroboration on GH#30 instead; this AFS's step-4 reference above already points at GH#30, not the closed #55.
- **[INFO / CLARIFICATION] — flagging a risk, not a confirmed defect, for the automation implementer**: [`GH#43`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/43) documents that the Agents create form's Welcome Message value is silently dropped from the create payload under **fast, back-to-back programmatic** field entry (confirmed 3/3 under `npx playwright test`'s real `.fill()` calls), but does **not** reproduce under slower, human-paced manual exploration. This analysis used `playwright-cli`'s natural per-command round-trip pacing (not a tight automated loop) and the Welcome Message field **did** persist correctly here (`version_details.welcome_message` in the `POST` response exactly matched the typed value) — consistent with, not contradicting, GH#43's own finding that the defect is timing-sensitive. Since the Pipelines create form shares the identical Welcome Message component/field name (`textarea#welcome_message`) with the Agents form (same shared entity-form component already established by GH#34's testid reuse), the same risk likely applies here under fast automated `.fill()` sequencing. **Recommendation for the implementer**: when writing `tests/pipelines.spec.ts`, watch for this specific field; if it reproduces, use `expect.soft()` with a `// Known defect: GH#43` comment on the `version_details.welcome_message` assertion, per the pattern already established in `tests/agents.spec.ts` for TC-011/TC-016 — do not weaken or drop the assertion silently.
- **Impact on automation**: none of the above block the happy-path automation (all elements remain clickable/fillable via the documented handles); they are pre-existing, cross-module-corroborated accessibility/UX defects and case-text drift, not new functional blockers for this case.

## Blocked Steps
None. All case Preconditions, Setup steps, Steps 1–22, Expected Final State assertions, and Teardown steps were executed end-to-end against the live system, including a real create + verify + delete cycle (pipeline id 359, fully cleaned up).

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md`. This case joins `tests/pipelines.spec.ts` (module: pipelines, per the EPIC's module-by-module delivery plan, GH#16). Per `.agents/testing.md` § Structure, WebQAPreExecuted-module specs are **not** assumed serial by default — TC-021 has no observed dependency on sibling pipelines-module cases (TC-020, TC-022..029); it creates and cleans up its own fixture end-to-end.
- Page object: build/extend a `pipelineForm.page.ts` (or a shared `entityForm.page.ts` parametrized for Agents vs Pipelines, per `.agents/testing.md`'s own note that this was flagged as worth evaluating during this batch) — this case exercises the full create-form surface (General/Tags/Welcome message/Conversation starters/Advanced) that sibling cases (TC-022 edit, TC-024 validation, TC-025 cancel, TC-027 conversation starters, TC-028 welcome message) will also need. `tests/pages/cardGridList.page.ts` (existing) already covers the list/card interactions if this case's own navigation ever needs to scan the grid (not required by this case's own steps, which navigate by direct URL/redirect).
- Unique-name generator: reuse whatever `≤32-char, timestamp-suffixed` name-generation helper the Agents module already centralized (per TC-011's own Automation Hints) — extend it to cover Pipelines rather than re-deriving; the same cap applies verbatim (GH#27, cross-entity-confirmed).
- Conversation-starter locator: use the `name="version_details.conversation_starters[N]"` attribute (or `.nth(N)` on the role query) for any starter beyond the first — the accessible name "Starter" is not unique once more than one exists (see § Concrete Handles).
- Wait strategy: no `waitForTimeout` anywhere in this spec — every wait is a `waitForResponse` (create/delete) or a `waitForURL` (post-save redirect) condition wait, per `.agents/testing.md` § Conventions.
- Watch GH#43 (Welcome Message drop under fast automated entry) when this case's real Playwright implementation runs — see § Known Defects for the recommended `expect.soft()` handling if it reproduces here the way it did for Agents.
- The kebab/3-dot menu button's lack of a stable handle (GH#33) and the create-vs-detail Save button handle split (GH#34) are the two soft spots this spec inherits from the shared entity-form component — already flagged extensively across the Agents and Pipelines modules; nothing new to add beyond what's documented in § Concrete Handles.
