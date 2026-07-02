# Test Case: Conversation Starters Add and Remove

## Metadata
- **TMS ID**: TC-027
- **Linked Story**: GH#52 (case tracking issue, parent epic GH#16)
- **Priority**: l3 (medium)
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`)
- **Status**: ready-for-automation
- **Isolated session**: `playwright-cli -s=TC-027`, persistent profile, dedicated `--profile` dir — `window.location.href` re-verified after every navigation, per the project's parallel-analyst browser-isolation gotcha.

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via `GET ${BASE_URL}/app/chat/` not redirecting to a login page (session was NOT pre-authenticated in this exploration; Keycloak SSO login flow was performed live and confirmed to redirect to `${BASE_URL}/app/chat/{id}?name=...` on success)
- Browser viewport: case's own Setup step 1 ("maximize browser window" via `window.moveTo`/`window.resizeTo`) is a **manual-execution artifact** — Playwright automation controls viewport via `playwright.config.ts` (project default 1920×1080 Desktop Chrome per `.agents/testing.md`), not a runtime `window.resizeTo` call. Explored at a smaller default viewport (1280×720); no field/layout behavior in this case was viewport-dependent.
- Test account is shared with concurrently-running sibling test cases (this project's account has no per-analyst isolation); this case mutates data (creates + deletes one pipeline) so it MUST run in its own isolated browser context, never sharing a session/tab with a parallel case. This exploration ran concurrently with 9 sibling pipelines-module analysts (TC-020..026, TC-028, TC-029) — own isolated session/profile confirmed no cross-talk.

## Test Data
### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` (`alita@elitea.ai`, owner_id `21`, author_id `42`)

### Must Generate (in test setup)
- Unique pipeline name: `TEST_Pipe_TC027_${timestamp}` where `timestamp` is a real unix-ms value (observed: `1783027278901`). **Budget ≤32 chars total** — the Pipeline create form's `Name *` field shares the same silent 32-char `maxLength` truncation already filed for Agents (see Known Defects — GH#27, retitled "(Agents + Pipelines)"). The case's own literal template `TEST_Pipeline_Starters_${timestamp}` (23 + 13 = 36 chars) does NOT fit and would be silently truncated to `TEST_Pipeline_Starters_178` (losing all but the first 3 timestamp digits — a genuine uniqueness/traceability hazard for a parallel-execution suite). This AFS used `TEST_Pipe_TC027_${timestamp}` (16 + 13 = 29 chars) instead — fits under the cap, keeps the full timestamp for uniqueness, and embeds the TC-ID for traceability. **Automation must use an equivalently-budgeted template, not the case's own literal name.**
- Description: `Pipeline for testing conversation starters` (fixed value, per case's Test Data table — 43 chars, well under the Description field's own `maxLength=2304`, no uniqueness needed)
- Starter 1 (added then removed): `What are your capabilities?` (27 chars)
- Starter 2 (added, persisted): `Show me examples` (17 chars)

### Must Clean Up (in teardown)
- Delete the created pipeline via the UI delete flow (see § Cleanup) — confirmed via `DELETE /api/v2/elitea_core/application/prompt_lib/{owner_id}/{pipeline_id}` returning `204`. **Performed for real during this exploration** — pipeline id `361` was created and deleted; verified absent from the list afterward (`document.body.innerText` no longer contains the pipeline name).

## Test Steps

1. Navigate to `${BASE_URL}/app/pipelines/all`
   - **Verify**: URL is `${BASE_URL}/app/pipelines/all`; page loads (per this project's established Pipelines-list pattern, `tests/pages/cardGridList.page.ts` — condition-wait on the `applications/prompt_lib` list response, not a fixed sleep; case's own "wait 10 seconds" (step 2) is a manual-execution artifact per `.agents/testing.md` § Conventions)
2. Check for a blocking modal dialog and dismiss if present (case step 3)
   - **Verify**: none was observed blocking `/app/pipelines/all` itself during this exploration; the non-blocking "Announcing ELITEA 2.0.4!" banner (with its own `button "close"`) appears on the create form after navigating there — dismissed defensively in step 4 below, matching the project's established pattern from the agents module (TC-011)
3. Click the sidebar create-pipeline control
   - **Action**: `page.getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Pipeline', exact: true })`
   - **Verify**: navigates to `${BASE_URL}/app/pipelines/create?viewMode=owner` (matches case step 4's expected URL exactly)
   - **Note**: mirrors the Agents-module finding (TC-011/TC-015) — the control's literal accessible name is just `"Pipeline"`, not "Create Pipeline" as the case text implies. Pipelines-specific corroboration already filed: GH#55/GH#56.
4. Dismiss the "Announcing ELITEA 2.0.4!" banner if present
   - **Action**: `page.getByRole('button', { name: 'close' })`
   - **Verify**: banner is removed; not required for the rest of the flow to function but avoids any pointer-interception risk on later Save clicks (see GH#42, an Agents-module finding for the same banner component)
5. Fill `textbox "Name *"` with the generated unique name (≤32 chars, see Test Data)
   - **Verify**: `page.getByRole('textbox', { name: 'Name *' }).evaluate(el => el.value)` equals the exact input string (guards silent truncation — see Known Defects GH#27)
6. Fill `textbox "Description *"` with `Pipeline for testing conversation starters`
   - **Verify**: field value matches
7. Confirm the "Conversation Starters" section is visible — **no expand action needed**
   - **Verify**: `heading "Conversation starters"` / `button "Conversation starters" [expanded]` and its `button "Starter"` (+ icon) add-control are already visible without any click (see Known Defects — case step 7's "expand if collapsed" branch never triggers; ALL sections — General, Welcome message, Conversation starters, Advanced — render pre-expanded on the live Pipeline create form, same pattern already documented for Agents in GH#28 and independently for Pipelines in GH#56)
8. Click `button "Starter"` (+ icon) to add the first starter row
   - **Action**: `page.getByRole('button', { name: 'Starter', exact: true })` — unique among buttons even with multiple starter rows present (the per-row items are `textbox`/`button "delete starter"`, a different accessible name — see Known Defects GH#57 for the row-level ambiguity)
   - **Verify**: a new `textarea[name="version_details.conversation_starters[0]"]` appears with placeholder "Conversation message"; the add-`Starter` button becomes **disabled** the instant a new empty row exists (re-enables only once that row's text is non-empty — see § Concrete Handles)
9. Fill the first starter field with `What are your capabilities?`
   - **Verify**: field value matches; a live `"N characters left"` counter appears (observed `741 characters left` for a 27-char input against a confirmed `maxlength="768"` — `768 - 27 = 741`, exact match); the add-`Starter` button re-enables
10. Click `button "Starter"` again to add the second starter row
    - **Verify**: a second `textarea[name="version_details.conversation_starters[1]"]` appears; add-button disables again (empty-row gating, same as step 8)
11. Fill the second starter field with `Show me examples`
    - **Verify**: field value matches; add-button re-enables
    - **Evidence**: screenshot `test-results/screenshots/TC-027-step11-both-starters.png`
12. Locate the remove/delete button for the first starter
    - **Action**: the row containing `textarea[name="version_details.conversation_starters[0]"]` has an adjacent `button "delete starter"` (icon-only, X/trash glyph) — see Known Defects GH#57 for why role+name alone cannot disambiguate which row's delete button this is once 2+ rows exist; scope by the row container or by array index/position (confirmed empirically: visual/DOM order matches `conversation_starters[N]` array order)
    - **Verify**: button is visible, not disabled
13. Click the remove button for the first starter
    - **Verify**: the row containing "What are your capabilities?" is removed from the DOM; only one starter row remains
14. Verify only one starter field remains with text `Show me examples`
    - **Verify**: exactly one `textarea[name^="version_details.conversation_starters"]` exists; its `name` attribute has **re-indexed to `[0]`** (confirmed live: after removing the original `[0]`, the surviving row's `name` became `version_details.conversation_starters[0]`, not left at `[1]`) and its value is `Show me examples`
    - **Evidence**: screenshot `test-results/screenshots/TC-027-step14-one-starter-remains.png`
15. Click `button "Save"`
    - **Action**: `page.getByRole('button', { name: 'Save', exact: true })`
    - **Verify**: `POST /api/v2/elitea_core/applications/prompt_lib/{owner_id}` returns `201`; response body's `version_details.conversation_starters` is exactly `["Show me examples"]` (a 1-element array — confirmed live, see § Network Behavior)
16. Wait for redirect after save — condition wait on `page.waitForURL(/\/app\/pipelines\/all\/\d+/)`, not a fixed sleep
    - **Verify**: URL matches `${BASE_URL}/app/pipelines/all/{id}?destTab=configuration&name={encodedName}&viewMode=owner` (observed: `/app/pipelines/all/361?destTab=configuration&name=TEST_Pipe_TC027_1783027278901&viewMode=owner`) — see Known Defects: case's exact `/app/pipelines/{id}` shape does not match; assert the `/app/pipelines/all/{id}` prefix / extract `id` via regex instead (already documented for Pipelines: GH#56)
17. Pipeline detail page is already loaded post-redirect — case's own step 17 ("navigate to pipeline detail page") is a no-op here; Save redirects directly into the detail/configuration view, no separate navigation required
18. Confirm the "Conversation Starters" section is visible on the detail page — **no expand action needed** (same pre-expanded pattern as step 7)
    - **Verify**: section renders expanded by default
19. Verify exactly one conversation starter is displayed with text `Show me examples`
    - **Verify**: exactly one `textbox "Starter"` under the Conversation starters region, value `Show me examples`; **additionally observed** (Axis 2): the same text renders as a clickable conversation-starter suggestion chip in the live chat-preview panel on the right half of the detail page (`generic [cursor=pointer]: Show me examples`) — confirms the field's actual product purpose (chat-entry-point suggestion), not just a stored string
    - **Evidence**: full detail-page snapshot captured; starter row confirmed via `textarea[name="version_details.conversation_starters[0]"]` value match

## Expected Results
- New pipeline created and persisted with `id` allocated by the API (observed: `361`, version id `386`; not stable across runs — use the API response's own `id` field, never hardcode)
- Exactly one conversation starter (`"Show me examples"`) persists after the add-two/remove-first sequence — no trace of the removed starter anywhere (DOM, API response, or detail-page reload)
- `POST /api/v2/elitea_core/applications/prompt_lib/{ownerId}` → `201`; `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` → `200`; `DELETE /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` → `204`
- New pipeline's `status` is `draft` (observed in the create response) — not asserted by the case, safe non-flaky fact if useful elsewhere
- No console errors or warnings at any point (confirmed clean throughout: login, navigation, form-fill, add/remove starters, save, verify, delete — only a benign one-time ASCII-art version-banner `[LOG]`, no `[ERROR]`/`[WARNING]`)
- **Hard cap discovered (Axis 2, not in the case)**: the Conversation Starters list is capped at **exactly 4** rows. Attempting a 5th add is blocked — the add-`Starter` button becomes `disabled` and is wrapped in a `generic` element whose accessible description is the literal string `"You have reached the limit of conversation starters"`. Confirmed via a live probe (added starters up to 4, observed the cap message, then discarded via page reload — never saved, so the throwaway pipeline's final persisted state remained the case's intended single starter). This is almost certainly intentional product behavior (not a defect) but is undocumented anywhere in the case text — a valuable one-off assertion for a dedicated boundary-value case if this module ever adds one.

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Preconditions: app accessible, user authenticated, browser maximized | environment ready | precondition | confirmed pre-navigation: no login redirect | asserted *(maximize re-authored — see Preconditions note)* |
| Setup 1: maximize browser window | all UI elements visible | precondition | n/a — manual-execution artifact | asserted *(re-authored: Playwright viewport config replaces runtime resize)* |
| Setup 2: verify authenticated via `/app/chat/` | no redirect = authenticated | precondition | confirmed pre-navigation (live login performed) | asserted |
| 1 Navigate to `/app/pipelines/all` | list loads | step 1 | step 1: URL | asserted |
| 2 Wait 10s for lazy loading | cards visible | step 1 | step 1: condition wait, not fixed sleep | asserted *(re-authored per `.agents/testing.md` § Conventions — no `waitForTimeout`)* |
| 3 Close modal dialogs if present | modal dismissed | step 2 | step 2: dialog check | asserted *(none blocking observed on the list route; banner dismissed defensively on the create form instead — step 4)* |
| 4 Click "Create Pipeline" button | form opens at `/app/pipelines/create?viewMode=owner` | step 3 | step 3: URL match (exact) | asserted *(re-authored: literal accessible name is "Pipeline", not "Create Pipeline" — GH#55/#56)* |
| 5 Fill Name | value set | step 5 | step 5: `.value` read-back | asserted *(re-authored: assert exact value to guard silent truncation, GH#27; case's own name template does not fit the 32-char cap — see Test Data)* |
| 6 Fill Description | value set | step 6 | step 6: value match | asserted |
| 7 Expand "Conversation Starters" section if collapsed | section opens, Starter+ button visible | step 7 | step 7: visibility check | asserted *(re-authored: never collapsed on the live form — GH#56)* |
| 8 Click Starter + button | first starter input appears | step 8 | step 8: DOM appearance + add-button disable-state | asserted |
| 9 Fill first starter field | text entered | step 9 | step 9: value match + counter check | asserted |
| 10 Click Starter + button again | second starter input appears | step 10 | step 10: DOM appearance | asserted |
| 11 Fill second starter field | text entered | step 11 | step 11: value match | asserted |
| 12 Locate remove button for first starter | remove button visible | step 12 | step 12: visibility + disambiguation note | asserted *(re-authored: role+name alone is ambiguous once 2+ rows exist — GH#57 — scope by row/position)* |
| 13 Click remove button for first starter | first starter removed, only second remains | step 13 | step 13: DOM removal check | asserted |
| 14 Verify only one starter field remains with correct text | 1 starter, correct text | step 14 | step 14: count + value + re-indexed `name` attribute | asserted |
| 15 Click Save | pipeline saved | step 15 | step 15: `POST .../applications/prompt_lib/{ownerId}` → 201, response body `conversation_starters` | asserted |
| 16 Wait for redirect | redirects to detail or list | step 16 | step 16: URL condition wait | asserted *(re-authored: condition wait, not fixed sleep)* |
| 17 Navigate to pipeline detail page | detail page loads | step 17 | — | asserted *(no-op — Save already redirects into detail view)* |
| 18 Expand Conversation Starters section | section opens | step 18 | step 18: visibility check | asserted *(re-authored: never collapsed — same as step 7)* |
| 19 Verify exactly one starter displayed with correct text | 1 starter, correct text, persisted | step 19 | step 19: value match + chat-preview chip observation | asserted |
| Expected Final State: pipeline created with one starter, first removed before save, detail page shows remaining starter | full persistence | steps 15, 19 | steps 15, 19 | asserted |
| Expected Final State: URL is `/app/pipelines/{id}` | exact URL shape | step 16 | step 16: URL prefix/regex assertion | clarification *(observed `/app/pipelines/all/{id}?destTab=configuration&name=...&viewMode=owner` — see GH#56)* |
| Teardown: open 3-dot menu | menu opens | cleanup 1 | cleanup step | asserted *(re-authored: button has literal broken `id="undefined-action"`, not a named/labeled control — GH#33, corroborated for Pipelines by TC-020/023/028/this case)* |
| Teardown: click "Delete pipeline" option | delete flow starts | cleanup 2 | cleanup step: `menuitem "Delete pipeline"` | asserted |
| Teardown: confirm via "Confirm" button | pipeline deleted | cleanup 3 | cleanup step: `DELETE .../application/prompt_lib/{ownerId}/{id}` → 204 | clarification *(no "Confirm" button exists; live flow requires typing the exact pipeline name into an unlabeled `Name` textbox before a `Delete` button becomes enabled — GH#28/GH#56, corroborated for Pipelines by multiple sibling analysts and by this case)* |
| Teardown: verify pipeline removed from list | pipeline gone | cleanup 4 | cleanup step: DOM text-content check returns false | asserted |

### Axis 2 — Analyst additions
- Step 14 asserts the surviving starter's underlying `name` attribute re-indexes to `[0]` (not left at `[1]`) — *added: confirms the form's array-serialization is correct after a mid-list removal, not just that the visible text is right; a naive text-only assertion could pass even if the backend received a sparse/misordered array.*
- Step 15 asserts the structured `POST` response body's `version_details.conversation_starters` array (exactly `["Show me examples"]`), not just HTTP status — *added: the create call is the authoritative source of what actually persisted, catching a server-side data-shape regression before the UI even re-renders.*
- Step 19 notes the starter also renders as a clickable suggestion chip in the live chat-preview panel — *added: confirms the feature's actual product purpose (a chat entry-point shortcut), useful context for anyone extending this suite to also click the chip and assert it populates the chat input.*
- Expected Results documents the exact `maxlength="768"` per-starter character cap (confirmed via a Playwright strict-mode-violation error's own DOM dump, cross-checked against the `"N characters left"` counter arithmetic: `768 - 27 = 741`, exact match) — *added: refines a sibling analyst's (TC-021) own approximate "≈769" observation on GH#27 with an exact, directly-DOM-confirmed value; useful boundary-value data if a future case tests the starter field's own max-length validation.*
- Expected Results documents the previously-undiscovered **hard cap of 4 conversation starters**, including the exact UI message shown once reached (`"You have reached the limit of conversation starters"`) — *added: genuinely new information not in the case text at all; the case only exercises add-2/remove-1, never approaches the cap. Recommend a dedicated boundary-value case (e.g. TC-027b) if this module gets extended.*
- Filed a new defect (GH#57) for the row-level accessible-name ambiguity (`"Starter"` / `"delete starter"` shared across all rows, no per-row index) — *added: this is the case's own "deep dive" mandate (documenting add-row/remove-row controls thoroughly) surfacing a genuine automation/accessibility gap that no prior case in this batch had occasion to find, since this is the first repeatable add/remove list pattern in the suite.*
- (Nothing else added beyond the case.)

## Cleanup
1. On the pipeline detail/configuration page, click the header kebab/3-dot menu button — **no stable accessible name/role query exists**; the button carries a literal broken `id="undefined-action"` (GH#33, confirmed cross-module for Pipelines). Recommended locator: `page.locator('#undefined-action')`; positional fallback: the icon-button immediately to the right of the `Save`/`Save As Version`/`Discard` group in the page header.
2. In the opened menu, click `menuitem "Delete pipeline"` (**not** the disabled `menuitem "Delete"` under the "VERSION" group — that one deletes the current *version* and is disabled when the pipeline has only one version; "Delete pipeline" under the "PIPELINE" group deletes the whole application)
3. In the "Delete confirmation" dialog, fill the (accessible-name-less) `Name` textbox with the exact pipeline name, then click the (now-enabled) `Delete` button. **Note**: `page.getByRole('dialog', { name: 'Delete confirmation' })` does NOT resolve — the dialog's `aria-labelledby` points at a non-existent element id (GH#33) — use unscoped `page.getByRole('dialog')` instead (only one is ever mounted).
4. Verify: `DELETE /api/v2/elitea_core/application/prompt_lib/{owner_id}/{id}` → `204`; redirected to `/app/pipelines/all`; the pipeline's name no longer appears anywhere in the page's text content (confirmed live via `document.body.innerText.includes(name) === false`)

**Performed for real during this exploration** — pipeline id `361` created and deleted; all four cleanup steps executed and verified against the live system, not simulated.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Sidebar create-pipeline control | `page.getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Pipeline', exact: true })` | none needed — stable role+name on `/app/pipelines/*` routes |
| Release-notes banner close button | `page.getByRole('button', { name: 'close' })` | dismiss defensively before interacting with the Save button (GH#42 precedent) |
| Name field | `page.getByRole('textbox', { name: 'Name *' })` | none needed; `maxlength="32"` native attribute (GH#27) |
| Description field | `page.getByRole('textbox', { name: 'Description *' })` | none needed; `maxlength="2304"` native attribute |
| Conversation starters section toggle | `page.getByRole('button', { name: 'Conversation starters' })` | already `[expanded]` by default — no click needed in normal flow |
| Add-starter control | `page.getByRole('button', { name: 'Starter', exact: true })` | unique among buttons even with multiple rows present; disabled while the last row is empty or the 4-row cap is reached |
| Starter textarea (row N, 0-indexed) | `page.locator('textarea[name="version_details.conversation_starters[' + n + ']"]')` | `page.getByRole('textbox', { name: 'Starter' }).nth(n)` — role+name alone is ambiguous with 2+ rows (GH#57); `maxlength="768"` native attribute on every row |
| Delete-starter control (row N) | scope to the row containing `textarea[name="version_details.conversation_starters[n]"]`, then `.getByRole('button', { name: 'delete starter' })` within that row's container | `page.getByRole('button', { name: 'delete starter' }).nth(n)` — confirmed empirically that visual/DOM order matches array index order, but this is positional, not semantic (GH#57) |
| Starter "N characters left" counter | `page.getByText(/\d+ characters left/)` scoped to the active row | only appears once the row's text is non-empty; not present on an empty new row |
| "Limit reached" message | `page.getByText('You have reached the limit of conversation starters')` | appears wrapping the disabled add-`Starter` control once 4 rows exist |
| Save button (create form) | `page.getByRole('button', { name: 'Save', exact: true })` | none needed |
| Pipeline detail kebab/3-dot menu button | `page.locator('#undefined-action')` (literal broken templated id, confirmed — GH#33) | icon-button immediately right of the `Save`/`Save As Version`/`Discard` group in the page header |
| "Delete pipeline" menu item | `page.getByRole('menuitem', { name: 'Delete pipeline', exact: true })` | disambiguates from the disabled `menuitem "Delete"` (version-delete) in the same menu |
| Delete-confirmation dialog | `page.getByRole('dialog')` (unscoped — name-scoped query fails, GH#33) | only one dialog is ever mounted at a time in this flow |
| Delete-confirmation name textbox | `page.getByRole('dialog').getByRole('textbox')` | no accessible name exists on this input (GH#33) — dialog-scoping is required since it's otherwise unqualified |
| Delete-confirmation Delete button | `page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true })` | disabled until the name textbox contains the exact pipeline name |

## Network Behavior
- `POST /api/v2/elitea_core/applications/prompt_lib/{ownerId}` — fires on Save click. Response `201` body includes `id` (new pipeline id, observed `361`), `version_details.id` (new version id, observed `386`), `version_details.conversation_starters` (array of strings, observed `["Show me examples"]` — confirms the removed first starter never reached the payload), `version_details.instructions`, `version_details.welcome_message`, `version_details.meta.step_limit`, `status: "draft"`. This is the authoritative source for post-save assertions.
- `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — fires once on landing on the detail/configuration page; `200`, returns the same shape as the create response.
- `DELETE /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — fires on confirmed delete; `204` on success, then redirects to `/app/pipelines/all`.
- Wait strategy for the implementer: `page.waitForResponse(resp => resp.url().includes('/applications/prompt_lib/') && resp.request().method() === 'POST' && resp.status() === 201)` after clicking Save, instead of a fixed-duration sleep; `page.waitForResponse(resp => resp.url().includes('/application/prompt_lib/') && resp.request().method() === 'DELETE' && resp.status() === 204)` after clicking the confirmation `Delete` button.

## Known Defects Found During Exploration

- **[MINOR] — cross-module corroboration, no new ticket** — Name field silently truncates at 32 characters with no counter or warning. Confirmed on the Pipeline create form: a 43-char attempted name (`TEST_Pipeline_TC027_Starters_1783027278901`) was silently truncated to a 32-char value (`TEST_Pipeline_TC027_Starters_178`) with zero visual feedback. Already filed and extensively cross-module-corroborated as [`GH#27`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/27) (retitled "(Agents + Pipelines)" after TC-025's pipelines corroboration; further corroborated by TC-021). No new comment added by this analysis — the finding is already saturated with pipelines-specific data points; this AFS's own Test Data section documents the budgeting workaround used (`TEST_Pipe_TC027_${timestamp}`, 29 chars).
- **[INFO / CLARIFICATION] — cross-module corroboration, no new ticket** — This case's own authored expectations don't match the live product in the same three ways already documented for both Agents ([`GH#28`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/28)) and Pipelines ([`GH#56`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/56), filed by the TC-021 analyst and independently corroborated for Pipelines by TC-020/TC-023/TC-026/TC-028): (1) steps 7/18's "expand if collapsed" branches never trigger — all sections including Conversation starters render pre-expanded; (2) Expected Final State's `/app/pipelines/{id}` URL shape does not match the live `/app/pipelines/all/{id}?destTab=configuration&name=...&viewMode=owner`; (3) Teardown's "Confirm" button does not exist — the live delete-confirmation dialog requires typing the exact pipeline name to enable a `Delete` button. This case reproduces the identical drift on its own throwaway pipeline (id `361`) but adds no new information beyond what GH#56 already documents for Pipelines — no new comment filed, consistent with this project's corroborate-sparingly convention once a finding is already well-established for the relevant module.
- **[MINOR] — cross-module corroboration, no new ticket** — Pipeline detail page's overflow/kebab menu button carries a literal broken `id="undefined-action"` (a templated id whose interpolated segment evaluates to `undefined`), plus the Delete-confirmation dialog's `aria-labelledby` points at a non-existent element and its Name textbox has no accessible name. Already filed for Agents and extensively corroborated for Pipelines as [`GH#33`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/33) (TC-020, TC-023, TC-028 all independently confirmed the identical pipeline-side behavior). This case's own teardown reproduced the same `id="undefined-action"` selector (Playwright's own generated locator for the clicked ref resolved to `page.locator('#undefined-action')`) — fourth+ pipelines-side confirmation; no new comment filed given saturation.
- **[MINOR] — NEW, filed** — Conversation-starter list rows (textareas and their delete buttons) share identical accessible names across all rows (`"Starter"` / `"delete starter"`), with no per-row index or distinguishing label. Confirmed via a live Playwright strict-mode violation once 2+ rows exist. This is a genuine accessibility gap (screen readers cannot distinguish rows) and a testability gap (role+name locators are unusable once 2+ starters exist; automation must fall back to the `name="version_details.conversation_starters[N]"` form-serialization attribute or positional `.nth()`). Filed as [`GH#57`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/57) per `.agents/profile.md` § Bug filing (github-issue, strict-per-bug — checked #12/#13/#33 first, genuinely new finding). Referencing TC-027, linked to parent epic GH#16 / case tracking issue GH#52.

## Blocked Steps
None. All case Preconditions, Setup steps, Steps 1–19, Expected Final State assertions, and Teardown steps were executed end-to-end against the live system, including a real create + add-2-starters + remove-1-starter + save + verify + delete cycle, plus an additional live probe of the 4-starter hard cap (discarded via reload before the real Save, so it did not affect the case's own final persisted state).

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md`. This module (`pipelines`) is a fresh spec file (`tests/pipelines.spec.ts`) per the framework-scale plan — TC-027's own Preconditions/Teardown are self-contained (no chained-session dependency on other pipelines-module cases observed during this exploration).
- Page object: this case exercises a genuinely new UI pattern for this batch — a repeatable add/remove field-array (Conversation Starters) — not covered by the existing `tests/pages/cardGridList.page.ts` or any agents-module page object. Recommend a small dedicated helper (e.g. `conversationStarters` section of a shared `tests/pages/entityForm.page.ts`, per `.agents/testing.md`'s own note that Agents/Pipelines forms may converge into one parametrized page object) exposing: `addStarter(text)`, `removeStarterAt(index)`, `starterCount()`, `starterTextAt(index)` — all built on the `textarea[name="version_details.conversation_starters[N]"]` handle, not the ambiguous role+name query (GH#57).
- Wait strategy: no `waitForTimeout` anywhere in this spec — every wait is a `waitForResponse` (create/delete) or a `waitForURL` (post-save redirect) condition wait, per `.agents/testing.md` § Conventions. The add/remove-starter DOM mutations are synchronous (no network round-trip until Save), so no explicit wait is needed between add/remove actions beyond Playwright's own auto-waiting.
- The kebab/3-dot menu button's `#undefined-action` selector (see Concrete Handles) is shared with the Agents module implementation — reuse whatever teardown helper the agents module implementer already built (per `.agents/testing.md` § Structure's modal-handling extraction note), rather than re-deriving it for pipelines.
- If this module later adds a dedicated boundary-value case for the Conversation Starters field (e.g. testing the 4-row cap or the 768-char per-starter limit), this AFS's § Expected Results and § Concrete Handles already document both exact thresholds — no re-exploration needed.
