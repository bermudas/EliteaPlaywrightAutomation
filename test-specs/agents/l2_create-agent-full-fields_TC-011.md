# Test Case: Create Agent with All Fields Filled

## Metadata
- **TMS ID**: TC-011
- **Linked Story**: GH#18 (case tracking issue, parent epic GH#16)
- **Priority**: l2
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`)
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via `GET ${BASE_URL}/app/chat/` not redirecting to a login page
- Browser viewport: case's own Setup step 1 ("maximize browser window" via `window.moveTo`/`window.resizeTo`) is a **manual-execution artifact** — Playwright automation controls viewport via `playwright.config.ts` (project default 1920×1080 Desktop Chrome per `.agents/testing.md`), not a runtime `window.resizeTo` call. Explored in a headless default viewport (1280×720); no field/layout behavior in this case was viewport-dependent, so this does not block automation at either size.
- Test account is shared with concurrently-running sibling test cases (this project's account has no per-analyst isolation — see `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`); this case mutates data (creates + deletes one agent) so it MUST run in its own isolated browser context, never sharing a session/tab with a parallel case.

## Test Data
### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` (`alita@elitea.ai`, owner_id `21`, author_id `42`)
- Tags `test` (id `8`), `automation` (id `9`), `qa` (id `2`) — **pre-existing** tag entities in this account/project (confirmed via response body `version_details.tags: [{id, name, data:{color}}]` — **[Implementer amendment, 2026-07-02]** corrected path, see note below); typing+Enter in the Tags combobox re-uses the existing tag by name match rather than creating a fresh duplicate each run — safe to re-run without tag-namespace growth.

### Must Generate (in test setup)
- Unique agent name: `TEST_Agent_${uniqueSuffix}` where `uniqueSuffix` fits the **32-character hard cap** on the Name field (see Known Defects — GH#27). The case's own template (`TEST_Agent_Full_${timestamp}`, 29 chars with a 13-digit ms timestamp) fits comfortably; do NOT prepend additional disambiguation text (e.g. a per-worker/per-case tag) without budgeting the total under 32 chars, or the tail will be **silently** truncated with no error. Explored with `TEST_Agent_TC011_${timestamp}` (30 chars) after the case's own template plus a disambiguation prefix exceeded the cap during exploration (see Known Defects).
- Description: `Full test agent with all fields populated` (fixed value, per case's Test Data table — no uniqueness needed, non-unique description does not collide)
- Guidelines: `You are a QA test agent. Follow all test instructions precisely and report results accurately.` (fixed value)
- Welcome Message: `Hello! I am a test agent. How can I assist you today?` (fixed value)
- Step Limit: `50` (fixed value; field's own pre-filled default was observed as `25`)

### Must Clean Up (in teardown)
- Delete the created agent via the UI delete flow (see § Cleanup) — confirmed via `DELETE /api/v2/elitea_core/application/prompt_lib/{owner_id}/{agent_id}` returning `204`
- No tag cleanup needed — tags are shared/reusable account-level entities, not created per-run

## Test Steps
1. Navigate to `${BASE_URL}/app/agents/all`
   - **Verify**: URL is `${BASE_URL}/app/agents/all`; page loads (per this project's established Agents-list pattern, `tests/pages/cardGridList.page.ts` — condition-wait on the `prompt_lib` list response, not a fixed sleep; case's own "wait 10 seconds" (step 2) is a manual-execution artifact, translate to a condition wait per `.agents/testing.md` § Conventions)
2. Check for a blocking modal dialog (`[role="dialog"]`) and dismiss if present (case step 3)
   - **Verify**: none was observed on `/app/agents/all` during this exploration (a non-blocking "Announcing ELITEA 2.0.4!" banner appears on `/app/chat/` post-login instead, with its own `button "close"` — dismiss defensively before interacting with chat, not required on the Agents route)
3. Click the sidebar create-agent control
   - **Action**: `page.getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Agent', exact: true })`
   - **Verify**: navigates to `${BASE_URL}/app/agents/create?viewMode=owner` (matches case step 4's expected URL exactly)
   - **Note**: this control's accessible name is context-sensitive per route — literally `"Agent"` on `/app/agents/*` routes (this case), `"Conversation"` on `/app/chat/*` routes (per `.agents/testing.md`'s confirmed handle for TC-002). The case's own wording ("Create Agent button") describes intent, not the literal accessible name — automation must use `"Agent"` exact-match.
4. Fill `Name *` with the generated unique name (≤32 chars, see Test Data)
   - **Verify**: `page.getByRole('textbox', { name: 'Name *' }).evaluate(el => el.value)` equals the exact input string (guards silent truncation — see Known Defects GH#27)
5. Fill `Description *` with `Full test agent with all fields populated`
   - **Verify**: field value matches
6. Add Tags: click the Tags combobox, type `test`, press `Enter`; repeat for `automation`, then `qa`
   - **Verify**: after each Enter, a chip `button` with that exact tag name appears in the Tags region (`page.getByRole('combobox', { name: 'Tags' }).locator('..').getByRole('button', { name: tagName, exact: true })`)
7. Confirm Instructions / Welcome message / Advanced sections are visible — **no expand action needed**
   - **Verify**: `Guidelines for the AI agent`, `Input your welcome message`, and `Step limit` textboxes are all already visible without any click (see Known Defects — case steps 10/12/14's "expand if collapsed" branch never triggers on the live form; all sections render pre-expanded)
8. Fill `Guidelines for the AI agent` with the case's guidelines text
   - **Verify**: field value matches
9. Fill `Input your welcome message` with the case's welcome text
   - **Verify**: field value matches
10. Fill `Step limit` with `50` (field pre-fills `25`; use `.fill()` which replaces the existing value, no separate clear step needed for a Playwright `fill()` call — case's own step 15 says "Clear ... and fill", both are satisfied by one `fill()` call)
    - **Verify**: field value is `50`
11. Click `Save`
    - **Action**: `page.getByRole('button', { name: 'Save', exact: true })` (disabled until Name+Description are both non-empty; confirmed enabled once both were filled)
    - **Verify**: `POST /api/v2/elitea_core/applications/prompt_lib/{owner_id}` returns `201`; response body's `version_details.tags` array contains exactly `test`, `automation`, `qa` (**[Implementer amendment, 2026-07-02]** re-verified live: `tags` is nested under `version_details`, not top-level — this AFS's original wording said top-level `tags`; corrected per direct API inspection, no top-level `tags` field exists on this resource); `version_details.instructions` matches Guidelines; `version_details.welcome_message` matches Welcome Message; `version_details.meta.step_limit === 50`
12. Wait for redirect after save — condition wait on `page.waitForURL(/\/app\/agents\/all\/\d+/)`, not a fixed sleep
    - **Verify**: URL matches `${BASE_URL}/app/agents/all/{id}?destTab=configuration&name={encodedName}&viewMode=owner` (see Known Defects — case's exact `/app/agents/{id}` shape does not match; assert the `/app/agents/all/{id}` prefix / extract `id` via regex instead)
13. Agent detail page is already loaded post-redirect — case's own step 18 ("navigate to agent detail page") is a no-op here; Save redirects directly into the detail/configuration view, no separate navigation required
14. Verify all field values persisted on the detail page
    - **Verify**: `Name *` = generated name; `Description *` = case value; Tags chips = `test`, `automation`, `qa` (all three, exact); `Guidelines for the AI agent` = case value; `Input your welcome message` = case value; `Step limit` = `50`
    - **Evidence**: screenshot `test-results/screenshots/TC-011-step14-detail-verified.png`

## Expected Results
- New agent created and persisted with `id` allocated by the API (observed: `274`; not stable across runs, use the API response's own `id` field, never hardcode)
- All 6 test-data fields display exactly as entered on the detail/configuration page — no truncation, no missing fields
- `POST /api/v2/elitea_core/applications/prompt_lib/{owner_id}` → `201`; `GET /api/v2/elitea_core/application/prompt_lib/{owner_id}/{id}` → `200`
- New agent's `status` is `draft` (observed in the create response) — not asserted by the case, but a safe non-flaky fact if the automation wants to guard against accidental publish-on-create
- No console errors or warnings at any point (confirmed clean throughout: login, navigation, form-fill, save, verify, delete)

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Preconditions: app accessible, user authenticated, browser maximized | environment ready | precondition | confirmed pre-navigation: no login redirect | asserted *(maximize re-authored — see Preconditions note)* |
| Setup 1: maximize browser window | all UI elements visible | precondition | n/a — manual-execution artifact | asserted *(re-authored: Playwright viewport config replaces runtime resize, per `.agents/testing.md` precedent)* |
| Setup 2: verify authenticated via `/app/chat/` | no redirect = authenticated | precondition | confirmed pre-navigation | asserted |
| 1 Navigate to `/app/agents/all` | list loads | step 1 | step 1: URL | asserted |
| 2 Wait 10s for lazy loading | cards visible | step 1 | step 1: condition wait, not fixed sleep | asserted *(re-authored per `.agents/testing.md` § Conventions — no `waitForTimeout`)* |
| 3 Close modal dialogs if present | modal dismissed | step 2 | step 2: dialog check | asserted *(none observed on this route — see step 2 note)* |
| 4 Click "Create Agent" button | form opens at `/app/agents/create?viewMode=owner` | step 3 | step 3: URL match (exact) | asserted *(re-authored: literal accessible name is "Agent", not "Create Agent" — case describes intent)* |
| 5 Fill Name | value set | step 4 | step 4: `.value` read-back | asserted *(re-authored: assert exact value to guard silent truncation, GH#27)* |
| 6 Fill Description | value set | step 5 | step 5: value match | asserted |
| 7 Add tag "test" | tag added | step 6 | step 6: chip appears | asserted |
| 8 Add tag "automation" | tag added | step 6 | step 6: chip appears | asserted |
| 9 Add tag "qa" | tag added | step 6 | step 6: chip appears | asserted |
| 10 Expand Instructions if collapsed | section opens | step 7 | step 7: visibility check | asserted *(re-authored: never collapsed on live form — see GH#28 item 1)* |
| 11 Fill Guidelines | text entered | step 8 | step 8: value match | asserted |
| 12 Expand Welcome Message if collapsed | section opens | step 7 | step 7: visibility check | asserted *(re-authored, same as step 10)* |
| 13 Fill Welcome Message | text entered | step 9 | step 9: value match | asserted |
| 14 Expand Advanced if collapsed | section opens | step 7 | step 7: visibility check | asserted *(re-authored, same as step 10)* |
| 15 Clear Step limit and fill 50 | value set to 50 | step 10 | step 10: value match | asserted *(re-authored: single `.fill()` covers clear+set)* |
| 16 Click Save | agent saved | step 11 | step 11: `POST .../applications/prompt_lib/{ownerId}` → 201, response body fields | asserted |
| 17 Wait for redirect/success notification | redirects to detail or list | step 12 | step 12: URL condition wait | asserted *(re-authored: condition wait, not fixed sleep)* |
| 18 Navigate to agent detail page | detail page loads | step 13 | — | asserted *(no-op — Save already redirects into detail view; see AFS step 13)* |
| 19 Verify all field values persisted | all 6 fields match, no truncation | step 14 | step 14: field-by-field assertions | asserted |
| Expected Final State: new agent visible, all data correct, no missing/truncated fields | full persistence | step 14 | step 14 | asserted |
| Expected Final State: URL is `/app/agents/{id}` | exact URL shape | step 12 | step 12: URL prefix/regex assertion | clarification *(observed `/app/agents/all/{id}?destTab=configuration&name=...&viewMode=owner` — see GH#28 item 2)* |
| Teardown: open 3-dot menu, click "Delete agent" | delete flow starts | cleanup 1–2 | cleanup steps | asserted |
| Teardown: confirm via "Confirm" button | agent deleted | cleanup 3 | cleanup step: `DELETE .../application/prompt_lib/{ownerId}/{id}` → 204 | clarification *(no "Confirm" button exists; live flow requires typing the exact agent name into a `Name` textbox before a `Delete` button becomes enabled — see GH#28 addendum)* |
| Teardown: verify agent removed from list | agent gone | cleanup 4 | cleanup step: DOM text-content check returns false | asserted |

### Axis 2 — Analyst additions
- Step 4 asserts the Name field's exact `.value` (not just "is visible" or "is non-empty") — *added: discovered a silent 32-char `maxLength` truncation with zero visual feedback (GH#27); without this exact-value assertion, automation would silently pass while saving a truncated name.*
- Step 11 asserts structured response-body fields (`tags`, `instructions`, `welcome_message`, `meta.step_limit`) from the `POST` response, not just the HTTP status — *added: the create call is the single source of truth for what actually persisted; verifying it here catches a server-side data-shape regression before the UI even re-renders the detail page.*
- Expected Results adds "no console errors/warnings throughout" — *added: confirmed clean across the entire login→create→verify→delete flow; guards a silent regression the case's own steps don't check for.*
- Expected Results notes the new agent's `status: "draft"` — *added: observed and stable across the single run; useful non-flaky guard if a future case needs to distinguish draft vs published agents, not required by this case's own assertions.*
- (Nothing else added beyond the case.)

## Cleanup
1. On the agent detail/configuration page, click the header kebab/3-dot menu button (see Concrete Handles — no stable accessible name; see Blocked/Automation Hints for the recommended selector strategy)
2. In the opened menu, click `menuitem "Delete agent"` (**not** the disabled `menuitem "Delete"` under the "VERSION" group — that one deletes the current *version* and is disabled when the agent has only one version; "Delete agent" under the "AGENT" group deletes the whole application)
3. In the "Delete confirmation" dialog, fill the `Name` textbox with the exact agent name, then click the (now-enabled) `Delete` button
4. Verify: `DELETE /api/v2/elitea_core/application/prompt_lib/{owner_id}/{id}` → `204`; redirected to `/app/agents/all`; the agent's name no longer appears anywhere in the page's text content

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Sidebar create-agent control | `page.getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Agent', exact: true })` | none needed — stable role+name on `/app/agents/*` routes |
| Name field | `page.getByRole('textbox', { name: 'Name *' })` | none needed |
| Description field | `page.getByRole('textbox', { name: 'Description *' })` | none needed |
| Tags combobox | `page.getByRole('combobox', { name: 'Tags' })` | none needed |
| Tag chip (committed) | `page.getByRole('button', { name: tagName, exact: true })` scoped to the Tags field's container | `.MuiChip-root:has-text(tagName)` |
| Guidelines textarea | `page.getByRole('textbox', { name: 'Guidelines for the AI agent' })` | none needed |
| Welcome message textarea | `page.getByRole('textbox', { name: 'Input your welcome message' })` | none needed |
| Step limit input | `page.getByRole('textbox', { name: 'Step limit' })` | none needed |
| Save button (create form) | `page.getByRole('button', { name: 'Save', exact: true })` | none needed — disabled until Name+Description non-empty |
| Agent detail kebab/3-dot menu button | **No stable handle exists.** The button has neither visible text nor a meaningful `aria-label`; DOM inspection showed its `id` attribute literally renders as `"undefined-action"` (a templated id whose interpolated segment evaluated to `undefined` — internal implementation quirk, not user-visible, so not filed as a product bug, but flagged here per the Locator Ladder stop+flag rule). Used positionally during exploration: the icon-button immediately to the right of the `Save`/`Save As Version`/`Discard` button group in the page header. | `page.locator('header, [class*="header"]').getByRole('button').last()` scoped near the version-selector row — verify uniqueness before relying on this in CI; recommend the product team add a real `aria-label` (e.g. `"agent actions menu"`) to this control |
| "Delete agent" menu item | `page.getByRole('menuitem', { name: 'Delete agent', exact: true })` | disambiguates from the disabled `menuitem "Delete"` (version-delete) in the same menu |
| Delete-confirmation dialog | `page.getByRole('dialog', { name: 'Delete confirmation' })` | none needed |
| Delete-confirmation name textbox | `page.getByRole('dialog', { name: 'Delete confirmation' }).getByRole('textbox')` | scoped by dialog heading — only one textbox in this dialog |
| Delete-confirmation Delete button | `page.getByRole('dialog', { name: 'Delete confirmation' }).getByRole('button', { name: 'Delete', exact: true })` | disabled until the name textbox contains the exact agent name |

## Network Behavior
- `POST /api/v2/elitea_core/applications/prompt_lib/{ownerId}` — fires on Save click. Request is the full form payload; response `201` body includes `id` (new agent id), `version_details.id` (new version id, e.g. `299`), `version_details.tags: [{id, name, data:{color}}]` (**[Implementer amendment, 2026-07-02]**: nested under `version_details`, confirmed via direct API inspection — this AFS originally stated a top-level `tags` field, which does not exist on this resource), `version_details.instructions` (= Guidelines), `version_details.welcome_message`, `version_details.meta.step_limit`, `status: "draft"`. This is the authoritative source for post-save assertions — prefer it over re-parsing the re-rendered DOM.
- `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — fires once on landing on the detail/configuration page; `200`, returns the same shape as the create response.
- `DELETE /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — fires on confirmed delete; `204` on success, then redirects to `/app/agents/all`.
- Wait strategy for the implementer: `page.waitForResponse(resp => resp.url().includes('/applications/prompt_lib/') && resp.request().method() === 'POST' && resp.status() === 201)` after clicking Save, instead of a fixed-duration sleep; `page.waitForResponse(resp => resp.url().includes('/application/prompt_lib/') && resp.request().method() === 'DELETE' && resp.status() === 204)` after clicking the confirmation `Delete` button.

## Known Defects Found During Exploration

- **[MINOR]** Agent Name field silently truncates at 32 characters with no counter or warning — filed as [`GH#27`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/27). A 35-char input attempt during exploration produced a stored value 3 characters shorter than what was typed, with zero visual feedback (no counter, no inline message). Not blocking — the case's own naming template fits under the cap; automation must budget any generated unique name to ≤32 chars and assert the exact `.value` post-fill to catch any future regression to an even smaller cap.
- **[INFO / CLARIFICATION]** TC-011's authored technique/expectations don't match the live app in three ways — filed as [`GH#28`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/28) (reverse-masking guard: live product is correct, case text is stale):
  1. Steps 10/12/14's "expand ... if collapsed" branches never trigger — all sections (General, Instructions, Welcome message, Conversation starters, Advanced) render pre-expanded on the live create form.
  2. Expected Final State's exact URL `/app/agents/{id}` does not match the live shape `/app/agents/all/{id}?destTab=configuration&name={name}&viewMode=owner`.
  3. (Addendum) Teardown's "Confirm" button does not exist — the live delete-confirmation dialog requires typing the exact agent name into a `Name` textbox to enable a `Delete` button; there is no button literally named "Confirm".
  - **Filing status**: filed per `.agents/profile.md` § Bug filing (`github-issue`, strict-per-bug, bundled as one case-text-drift ticket per existing project convention — see GH#9, #10, #12, #14), referencing TC-011 and linked to parent epic GH#16 / tracking issue GH#18.
- **[MINOR] — [Implementer amendment, 2026-07-02]** New defect found during automation, not present in the analyst's original exploration: the Welcome Message field's value is silently dropped from the create-agent payload when filled via fast, back-to-back programmatic form entry (confirmed 3/3 times under `npx playwright test`; NOT reproduced under a slower, human-paced manual exploration). The field's client-side value is correct at the moment Save is clicked (confirmed via both the accessible-role locator and a raw DOM query), but the `POST` create response's `version_details.welcome_message` comes back `""`, and this is a genuine server-side data loss (a subsequent fresh `GET`/page reload also shows it empty, not just a stale-UI issue). Filed as [`GH#43`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/43). Non-blocking for this case's own scope — every other field persists correctly — handled via `expect.soft()` with a `// Known defect: GH#43` comment on the `version_details.welcome_message` assertion in `tests/agents.spec.ts`, per this project's established pattern for isolated known defects (see GH#40/TC-018's handling).

## Blocked Steps
None. All case Preconditions, Setup steps, Steps 1–19, Expected Final State assertions, and Teardown steps were executed end-to-end against the live system, including a real create + verify + delete cycle.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md`. This module (`agents`) is a fresh spec file (`tests/agents.spec.ts`) per the framework-scale plan in `.agents/testing.md` § Structure — not part of the existing serial `@smoke` suite; TC-011's own Preconditions/Teardown are self-contained (no chained-session dependency on other agents-module cases observed during this exploration).
- Page object: extend/create `tests/pages/agentForm.page.ts` per the plan already logged in `.agents/testing.md` § Structure ("New page objects expected") — this case exercises the full create-form surface (General/Instructions/Welcome message/Advanced sections) that a sibling case (TC-012 edit, TC-014 validation, TC-015 cancel) will also need; build the shared page object here rather than duplicating raw locators across those specs.
- Unique-name generator: centralize the "≤32 chars, timestamp-suffixed" name-generation logic in one test-data helper (e.g. `tests/fixtures/testData.ts`) so every agents-module case that creates a named agent inherits the cap automatically instead of each spec re-deriving it — TC-017/TC-018 (per the dispatch brief) dig further into Tags and Step limit specifically and will likely also need this helper.
- Wait strategy: no `waitForTimeout` anywhere in this spec — every wait is a `waitForResponse` (create/delete) or a `waitForURL` (post-save redirect) condition wait, per `.agents/testing.md` § Conventions.
- The kebab/3-dot menu button's lack of a stable handle (see Concrete Handles) is the one soft spot in this spec — flagging for Tal/implementer awareness before this pattern gets reused across TC-012/TC-013 (edit/delete cases), which will hit the identical control.
