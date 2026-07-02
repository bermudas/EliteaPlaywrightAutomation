# Test Case: Create Agent with Minimal Required Fields

## Metadata
- **TMS ID**: TC-010
- **Linked Story**: GH#17 (tracking issue), parent epic GH#16
- **Priority**: l1
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`)
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via login through Keycloak SSO (`auth.elitea.ai`), landing on `${BASE_URL}app/chat/` with the sidebar showing the account's display name ("Alita Yoko")
- Browser viewport: explored at 1280×720 (playwright-cli default headless viewport, not a literal maximize). No viewport-dependent behavior was observed anywhere in this case's flow (unlike the card-grid column count in TC-003) — form-field validation and Save-button enablement are identical regardless of viewport. Automation should still use the project's standard 1920×1080 (`.agents/testing.md` — single `chromium` project) rather than re-deriving a "maximize" hack; the case's own Setup step 1 (`window.moveTo`/`resizeTo`) is a manual-execution artifact, not a functional requirement for this specific case.
- Test account contains ≥12 pre-existing agents — observed **215** at time of exploration (footer counter `page.getByText(/^Agents:\s*\d+/)`, confirmed handle from TC-003's AFS), comfortably exceeding the case's own baseline. Count is live/non-deterministic across a shared account under concurrent parallel test runs — do not assert an exact value.

## Test Data
### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — standard smoke-suite / batch account

### Must Generate (in test setup)
- Unique agent name: `TEST_Agent_Minimal_${Date.now()}` (case's own template). **Constraint discovered during exploration**: the Name field has a silent 32-character cap (see Known Defects — GH#27) — the case's own literal template (`TEST_Agent_Minimal_` = 19 chars + 13-digit ms timestamp = 32 chars) fits **exactly** at the boundary, so implement it verbatim, character-for-character, with no additional prefix/suffix. Do not add extra disambiguation text (e.g. a TC-ID segment) to this specific name without shortening another part first — anything added pushes past 32 and is silently truncated with zero error feedback.
- Description: `Minimal test agent created for QA validation` (case's own literal value, 46 chars — comfortably under the Description field's much larger cap, ~2304 chars, which does show a live "N characters left" counter)

### Must Clean Up (in teardown)
- Delete the created agent via the UI delete flow (see § Cleanup) — this is a mutating case; matches the case's own Teardown section. Do not skip cleanup even on a passing run.

## Test Steps
1. Navigate to `${BASE_URL}app/agents/all`
   - **Verify**: URL is `${BASE_URL}app/agents/all`; page title contains "Agents"
2. Wait for the card grid to render — condition wait on the `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?...agents_type=classic...` response (200) plus at least one `.MuiCard-root` visible inside `#EliteACustomTabPanel`, not a fixed sleep (case's own "wait 10 seconds" is a manual-execution artifact per `.agents/testing.md` § Conventions)
   - **Verify**: at least 1 `.MuiCard-root` visible inside `#EliteACustomTabPanel`
3. Check for blocking modal dialogs (`[role="dialog"]`) and dismiss if present
   - **Note**: none were observed on `/app/agents/all` during this exploration. A non-blocking, dismissible announcement banner ("Announcing ELITEA 2.0.4!") was observed on `/app/chat/` immediately post-login — closed via its own `button "close"` before navigating onward. This banner is NOT a modal (doesn't block interaction with the rest of the page) and was not seen again on `/app/agents/all` or `/app/agents/create`. Automation: check for `[role="dialog"]` defensively per project convention, but don't assume one will be present.
4. Click the "Create Agent" control in the left sidebar
   - **Handle**: `getByRole('button', { name: 'Agent', exact: true })` — a persistent, **global sidebar** control (confirmed identical on `/app/chat/`, `/app/agents/all`, and `/app/agents/create` itself — not page-scoped). Renders as a "+" icon + the text "Agent", immediately followed by a separate chevron-dropdown button (`getByRole('button').filter` by adjacency, or the next sibling `<button>` — not explored further, out of scope for this case) that was not interacted with.
   - **Verify**: URL becomes `${BASE_URL}app/agents/create?viewMode=owner`
5. Verify "Save" button is disabled
   - **Handle**: `getByRole('button', { name: 'Save', exact: true })` — unique on the create-agent page
   - **Verify**: `disabled` attribute is `true` (confirmed via both the ARIA `disabled` state and the underlying DOM `HTMLButtonElement.disabled === true`)
6. Fill `Name *` with the generated agent name
   - **Handle**: `getByRole('textbox', { name: 'Name *' })`
   - **Verify**: field value equals the generated name (read back — do not just trust the fill; see Known Defects re: silent truncation)
7. Verify "Save" button remains disabled (Description still empty)
   - **Verify**: `disabled === true`
8. Fill `Description *` with `Minimal test agent created for QA validation`
   - **Handle**: `getByRole('textbox', { name: 'Description *' })`
   - **Verify**: field value equals the description string; live "N characters left" counter updates (observed: "2260 characters left" after typing the 44-char... i.e. 46-char string — counter counts down from a ~2304 cap)
9. Verify "Save" button is now enabled
   - **Verify**: `disabled === false`
10. Click "Save"
    - **Handle**: `getByRole('button', { name: 'Save', exact: true })` — use a real click (not a synthetic `element.click()` / `dispatchEvent`); see Automation Hints for a process note on this
    - **Underlying request**: `POST /api/v2/elitea_core/applications/prompt_lib/{ownerId}` — fires on click, `201` on success
11. Wait for redirect to the agent detail page — condition wait on `page.waitForURL(/\/app\/agents\/all\/\d+/)`, not a fixed sleep
    - **Verify**: URL matches `${BASE_URL}app/agents/all/{id}?destTab=configuration&...`; page title becomes `Agent: {name} - Private`
    - **Note**: no toast/success-notification element was observed at the moment of screenshot capture (may be transient and already dismissed, or the app may rely on the redirect itself as the success signal — do not gate an assertion on a toast for this flow; assert on the URL/title change instead)
12. Navigate to `${BASE_URL}app/agents/all` and verify the created agent's card is present
    - **Handle**: `#EliteACustomTabPanel .MuiCard-root` containing the agent's (persisted, possibly-truncated) name — the list sorts by `created_at desc` by default, so a freshly created agent appears on the **first** page without needing to scroll/lazy-load
    - **Verify**: exactly one card's text content includes the persisted name; no console errors; no `4xx`/`5xx` from `/api/v2/elitea_core/applications/prompt_lib/**`

## Expected Results
- New agent created and visible at `${BASE_URL}app/agents/all/{id}` (detail page) immediately after Save, and subsequently in the `${BASE_URL}app/agents/all` card grid
- Name and Description persist exactly as entered, **up to the Name field's undocumented 32-character cap** (GH#27) — anything beyond 32 chars is silently dropped, no error surfaced
- No console errors during the whole create → redirect → list-verify flow
- No `4xx`/`5xx` responses from `/api/v2/elitea_core/applications/prompt_lib/**` or the detail-fetch endpoint

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Setup 1: maximize browser window | all UI elements visible | precondition | explored at 1280×720; no viewport-dependent behavior found in this case's flow | asserted *(re-scoped: "maximize" is a manual-execution artifact; automation uses project-standard 1920×1080 per `.agents/testing.md`, not a literal resize hack)* |
| Setup 2: verify authenticated state via `/app/chat/` | no redirect to login = authenticated | precondition | confirmed pre-navigation: full login flow completed, sidebar shows "Alita Yoko" | asserted |
| 1 Navigate to `/app/agents/all` | agent list page loads | step 1 | step 1: URL + title | asserted |
| 2 Wait 10s for lazy loading | all existing cards visible | step 2 | step 2: condition wait on API response + first card visible | asserted *(re-authored: condition wait, not fixed sleep, per `.agents/testing.md` § Conventions)* |
| 3 Close modal dialogs if present | modal dismissed, page interactive | step 3 | step 3: `[role=dialog]` check | asserted *(none present on this page during exploration — see step 3 note)* |
| 4 Click "Create Agent" button in sidebar (+ icon) | form opens at `/app/agents/create?viewMode=owner` | step 4 | step 4: URL match | asserted |
| 5 Verify Save disabled | button appears disabled/grayed | step 5 | step 5: `disabled === true` (DOM-verified, not just visual) | asserted |
| 6 Fill `Name *` | field contains test value | step 6 | step 6: value read-back | asserted *(decomposed: also documents the 32-char silent-truncation risk here — see Known Defects)* |
| 7 Verify Save remains disabled | still disabled (Description required) | step 7 | step 7: `disabled === true` | asserted |
| 8 Fill `Description *` | field contains test value | step 8 | step 8: value read-back + live counter | asserted |
| 9 Verify Save enabled | button becomes clickable | step 9 | step 9: `disabled === false` | asserted |
| 10 Click Save | agent is saved successfully | step 10 | step 10: `POST .../applications/prompt_lib/{id}` → `201` | asserted |
| 11 Wait for redirect / success notification | redirect to detail or list, page loads | step 11 | step 11: URL becomes `/app/agents/all/{id}`, title updates | asserted *(re-scoped: no toast observed — see step 11 note; assert on URL/title, not a notification element)* |
| 12 Verify agent appears in list at `/app/agents/all` | card with generated name visible | step 12 | step 12: card text-content match | asserted |
| Expected Final State: agent visible, URL is `/app/agents/{id}` or `/app/agents/all`, no error messages | agent created and visible, no errors | steps 11–12 | steps 11–12 | asserted *(URL observed as `/app/agents/all/{id}?destTab=...`, a superset of the case's stated `/app/agents/{id}` shape — not a discrepancy worth filing, same route family)* |
| Teardown: navigate to agent detail page | detail page loads | cleanup step 1 | cleanup step 1 | asserted |
| Teardown: click 3-dot menu, click "Delete agent" | delete option available | cleanup steps 2–3 | cleanup steps 2–3: `menuitem "Delete agent"` clicked | asserted *(decomposed: menu is a two-level structure — "VERSION" delete (disabled) vs "AGENT" → "Delete agent" (the correct target); case text doesn't distinguish these, worth noting for the implementer)* |
| Teardown: "Confirm deletion in modal dialog by clicking 'Confirm'" | agent deleted | cleanup step 4 | cleanup step 4: typed exact name into "Delete confirmation" modal, `DELETE .../application/prompt_lib/{ownerId}/{id}` → `204` | clarification *(case text describes a generic "Confirm" button; live modal requires typing the agent's exact name before an initially-disabled "Delete" button enables — already filed by the TC-011 analyst as a comment addendum on GH#28, corroborated independently here rather than re-filed; reverse-masking guard: live behavior is a legitimate, stricter safety pattern, not a defect)* |
| Teardown: verify agent removed from list | agent gone from `/app/agents/all` | cleanup step 5 | cleanup step 5: card absent, `cardCount` re-checked | asserted |

### Axis 2 — Analyst additions
- Step 6 asserts a read-back of the Name field's actual value (not just that `fill()` succeeded) — *added: this is precisely what surfaced the silent 32-char truncation (GH#27); a naive "fill and move on" would have shipped a test that never notices the product silently drops data.*
- Expected Results adds "no console errors" and "no 4xx/5xx" across the whole create→list flow — *added: verified clean throughout exploration (0 console errors, all requests to `/applications/prompt_lib/**` returned 2xx); guards against a silent regression the case's own steps don't check for.*
- Step 10 flags "use a real click, not `element.click()`/`dispatchEvent`" — *added: this analyst's own first Save-click during exploration was performed via a synthetic DOM click (see Automation Hints) rather than a genuine Playwright interaction; flagging so the implementer doesn't repeat it — a synthetic click can mask real event-handler/focus-order bugs a user's actual click would trigger.*
- (Nothing else added beyond the case.)

## Cleanup
1. From the agent's detail page (`${BASE_URL}app/agents/all/{id}?destTab=configuration&viewMode=owner`), click the three-dot "more actions" button in the top-right of the toolbar (next to Save/Save As Version/Discard)
2. In the opened menu, under the **"AGENT"** section (not "VERSION" — that section's own "Delete" item is disabled and deletes a version, not the agent), click **"Delete agent"**
3. In the "Delete confirmation" modal, type the agent's exact current name into the (unlabeled-for-a11y, but uniquely-scoped-within-the-dialog) `Name` textbox
4. Click "Delete" (enabled only once the typed name exactly matches)
5. Verify: `DELETE /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` returns `204`; navigate back to `${BASE_URL}app/agents/all` and confirm no card matches the deleted agent's name

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Sidebar "Create Agent" button (global, all app pages) | `getByRole('button', { name: 'Agent', exact: true })` | none needed — unique per page at time of use; **caution**: an unrelated button also named exactly "Agent" exists inside an *existing* agent's edit form (Tools section → "+ Agent" for adding a linked sub-agent tool) — scope by page/URL context, don't reuse this locator inside an agent-edit page expecting the sidebar control |
| Save button (create form) | `getByRole('button', { name: 'Save', exact: true })` | none needed — unique on `/app/agents/create` |
| Name input | `getByRole('textbox', { name: 'Name *' })` | `input[name="name"]` (confirmed present via DOM; has native `maxLength="32"` — see Known Defects) |
| Description input | `getByRole('textbox', { name: 'Description *' })` | `textarea` inside the region following the Name field's container |
| Agent card grid (list) | `#EliteACustomTabPanel .MuiCard-root` (confirmed handle, established in TC-003's AFS) | `#EliteACustomTabPanel .MuiCardContent-root` — no `data-testid`/role/aria-label on cards (GH#12) |
| Total agent count (footer) | `page.getByText(/^Agents:\s*\d+/)` (confirmed handle, established in TC-003's AFS / PR #15 implementation) | Direct API: `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?...limit=1&offset=0` → response `.total` |
| Three-dot "more actions" menu button (agent detail page) | `#undefined-action` (confirmed live, `aria-haspopup="true"`) — **caution**: the literal id string `"undefined-action"` strongly suggests an unrendered template variable (e.g. `` `${agentId}-action` `` evaluated before `agentId` was available) — only confirmed on agent id 272 in this session; not verified stable/identical across other agent ids. **Recommended** locator avoids depending on this: `page.locator('header, [class*=toolbar]').getByRole('button', { name: '' }).last()` is fragile too — prefer scoping by DOM adjacency to the confirmed `Save`/`Discard`/`Save As Version` button group (the menu-trigger is the next sibling button after that group) | `button[aria-haspopup="true"]` scoped to the page's top toolbar (only one such button observed in that region) |
| "Delete agent" menu item | `getByRole('menuitem', { name: 'Delete agent' })` | none needed — distinct from the disabled "Delete" (version) menuitem in the same menu's "VERSION" section |
| Delete-confirmation modal | `getByRole('dialog', { name: 'Delete confirmation' })` (dialog has an accessible name via its own heading) | `.MuiDialog-root` / `.MuiModal-root` scoped, filtered by text "Delete confirmation" |
| Delete-confirmation name-match textbox | `getByRole('dialog', { name: 'Delete confirmation' }).getByRole('textbox')` — the dialog contains exactly one textbox, so role-scoped-to-dialog is unambiguous despite the textbox itself having **no accessible name** (a11y gap — the visible "Name" label was not confirmed to be programmatically associated via `aria-labelledby`/`for`; worth a follow-up a11y note but not filed separately here, out of this case's scope) | none needed |
| Delete-confirmation "Delete" button | `getByRole('dialog', { name: 'Delete confirmation' }).getByRole('button', { name: 'Delete', exact: true })` | none needed — starts `disabled`, flips to enabled only once the textbox value matches |

## Network Behavior
- `POST /api/v2/elitea_core/applications/prompt_lib/{ownerId}` — fires on Save click, `201` on success. Request/response body includes `id` (used to build the redirect URL), `name` (subject to the 32-char silent cap — the **response body itself already reflects the truncated value**, confirming the cap is enforced client-side before the request is even sent, not a server-side truncation), `description`, `owner_id`, `versions[0]` (default `base` version scaffold), `created_at`.
- `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — fires once on landing on the detail page post-redirect, `200`, returns the full agent record for the edit form.
- `DELETE /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — fires on confirmed delete, `204` on success. Immediately followed by a `GET .../applications/prompt_lib/{ownerId}?agents_type=classic...` refetch of the list (SWR-style auto-refresh) — no manual reload needed to see the card disappear, but on a **fresh navigation** to `/app/agents/all` the standard lazy-load wait (per TC-003) still applies since it's a cold page load.
- Wait strategy for the implementer: `page.waitForResponse(resp => resp.url().includes('/applications/prompt_lib/') && resp.request().method() === 'POST' && resp.status() === 201)` after the Save click, and the equivalent `DELETE`/`204` wait after the confirmed-delete click — no fixed-duration sleep needed for either mutation.

## Known Defects Found During Exploration

- **[MINOR/DEFECT]** Agent Name field silently truncates at 32 characters, no counter or warning — filed by a sibling analyst (TC-011) as [`GH#27`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/27); **independently corroborated from this case** (comment added to GH#27) after the same silent truncation occurred with TC-010's own disambiguated test-data name (`TEST_Agent_Minimal_TC010_${timestamp}`, 38 chars → persisted as 32 chars, `...1783017374082` → `...1783017`). Confirmed via `input.maxLength === 32` and via the `POST .../applications/prompt_lib` response body itself already containing the truncated name. Not blocking — the case's own literal naming template (`TEST_Agent_Minimal_${timestamp}`, exactly 32 chars) fits under the cap; see § Test Data for the exact-character-budget constraint this AFS's own generated name must respect.
- **[INFO/CLARIFICATION]** TC-010's Teardown step text ("Confirm deletion in modal dialog by clicking 'Confirm'") does not match the live product, which requires typing the agent's exact name into a text field before an initially-disabled "Delete" button enables — no button literally named "Confirm" exists in this flow. Already filed by the TC-011 analyst as a comment addendum on [`GH#28`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/28) (a moment before this AFS's own independent hit on the same finding) — corroborated there via a follow-up comment rather than re-filed as a duplicate (an earlier duplicate, GH#32, was opened and then closed in favor of consolidating on #28 once the overlap was found). Reverse-masking guard applies: live behavior is a legitimate, safer UX pattern, not a defect — case text is stale.
- No other defects found. The core create-with-minimal-fields flow (Save disabled → Name alone → still disabled → +Description → enabled → Save → redirect → list membership) behaves exactly as the case describes, modulo the two items above.

## Blocked Steps
None. All case Setup, Steps 1–12, Expected Final State, and Teardown were executed end-to-end against the live system, including a real (not simulated) agent creation and a real (not simulated) deletion.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md`. Per the framework-scale plan in that file, this case joins `tests/agents.spec.ts` (module-per-spec-file, NOT the smoke suite's serial pattern — this case's own Preconditions/Teardown are self-contained, no chained-session dependency on other `agents` module cases observed during this exploration; confirm with sibling AFS files for TC-011..019 whether any of them assume shared mutable state before deciding the module's serial/parallel mode, per `.agents/testing.md`'s "implementer confirms per-module during Phase 1 Absorb" note).
- Page object: `tests/pages/agentForm.page.ts` (planned per `.agents/testing.md` § Structure — this is the first case to exercise the create-agent form; the Name/Description/Save handles above are the seed for that page object). `tests/pages/cardGridList.page.ts` (existing, from TC-003/TC-004) already covers the list-grid assertions in step 12/cleanup step 5 — extend, don't duplicate.
- Wait strategy: no `waitForTimeout` anywhere in this spec — every "wait N seconds" from the original case is re-authored into a `waitForResponse` or a web-first `expect(...).toBeVisible()`/`expect(...).toBeDisabled()`/`toBeEnabled()` condition wait (see § Test Steps and § Network Behavior).
- **Analyst execution note (process deviation, not a product issue):** during exploration, the very first Save-button click (step 10) was performed via a synthetic `element.click()` inside a `page.evaluate()` call rather than a genuine Playwright `locator.click()` — an artifact of this analyst's own tool sequencing, not a recommendation. It happened to produce the same result here, but per `test-case-analysis`'s own "never synthesize the real action" rule, the automation implementation MUST use `page.getByRole('button', { name: 'Save', exact: true }).click()` (a real, dispatched user click), not `.evaluate()`/`dispatchEvent()`. All other interactions in this exploration (form fills, menu clicks, the final Delete click) used genuine ref-based/role-based Playwright actions.
- **Analyst execution note (infrastructure, not product):** this exploration ran in an isolated `playwright-cli -s=TC010` browser session (own in-memory Chrome profile, own port), per the project's corroborated parallel-analyst browser-isolation gotcha (`.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`) — 9 sibling analysts (TC-011..019) were dispatched concurrently against the same shared test account. Confirmed isolation before any credential entry (fresh navigation to `/app/chat/` bounced to Keycloak with no inherited session) and confirmed no cross-talk for the remainder of the session (own tab, own network log, `window.location.href` matched expectations at every check). Sibling analysts' own freshly-created agents (`TEST_Agent_TC011...`, `TC012_Edit...`, `TEST_Agent_Delete_TC013...`) were visible in the shared list during step 12/cleanup verification, as expected — this AFS's own assertions were scoped precisely to the TC-010-generated name, never to a bare "any new card appeared" check, so no risk of mistaking a sibling's card for this case's own.
