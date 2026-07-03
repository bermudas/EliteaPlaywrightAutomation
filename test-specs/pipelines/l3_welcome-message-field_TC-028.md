# Test Case: Welcome Message Field Functionality

## Metadata
- **TMS ID**: TC-028
- **Linked Story**: GH#53 (own tracking issue, parent epic GH#16)
- **Priority**: l3
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`) — isolated `playwright-cli -s=TC-028` session (own in-memory Chrome profile, confirmed non-shared with sibling parallel analysts TC-020..027/029 per `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`: fresh `/app/chat/` navigation bounced to the Keycloak login page before any login, proving no inherited cookies)
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via `GET ${BASE_URL}/app/chat/` not redirecting to the Keycloak login page. This run's first navigation DID redirect to the Keycloak login (`https://auth.elitea.ai/realms/nexus/protocol/openid-connect/auth`), fresh isolated session as expected — the case's own "if redirect occurs, login first" branch was genuinely exercised here (not a dead branch), then login was performed with `${ELITEA_EMAIL}`/`${ELITEA_PASSWORD}`.
- Browser viewport: default headless viewport (`1280×720`, confirmed via outbound analytics beacon `sr=1280x720`) was used, not a literal `window.moveTo/resizeTo` maximize (case Setup step 1) — headless has no real "maximize" concept. Recommend automation set an explicit `1920×1080` viewport per this project's existing convention (`.agents/testing.md`, smoke suite) rather than porting the case's literal JS snippet.
- **This case is non-destructive by design but creates disposable fixtures** — three throwaway pipelines were created to isolate the normal-speed vs. fast-speed Welcome Message entry comparison (see Test Data and Known Defects). All three were deleted for real by the end of this run; confirmed sibling fixtures (`TC020_Pipe_Min_...`, `TC022_Edit_...`, `TC022_Edit_...` seen mid-run) were left untouched.

## Test Data

### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`

### Must Generate (in test setup — case's own Setup/Test Data section)
Three disposable pipelines were created via `${BASE_URL}/app/pipelines/create?viewMode=owner`, one for the case's own literal happy-path steps and two to isolate the entry-speed variable per this batch's dispatch instructions (verify GH#43 — a known Welcome Message data-loss defect found on the *Agents* form — against this Pipelines form too):

1. **Case's own fixture (normal-speed entry)** — Name typed `TEST_Pipeline_Welcome_TC028_${Date.now()}` (41 chars: `TEST_Pipeline_Welcome_TC028_1783027328108`); Description `Pipeline for testing welcome message`; Welcome Message the case's own 134-char test string (`Hello and welcome! This is a test pipeline designed to demonstrate the welcome message feature. Feel free to explore the capabilities.`). Filled via separate `playwright-cli` commands (natural CDP/process round-trip between each — a "human-paced" shape).
   - **Known constraint (cross-module corroboration of GH#27)**: Name field has a hard client-side `maxlength=32`. Typed 41 chars; persisted/displayed value was `TEST_Pipeline_Welcome_TC028_1783` (32 chars, trailing `027328108` dropped) — confirmed via the `POST /api/v2/elitea_core/applications/prompt_lib/{ownerId}` response body's `name` field, the post-save redirect URL, and the detail page's `Name *` field value, all four agreeing.
   - Observed fixture: id **358**, owner_id **21**, default version id **383**, saved name `TEST_Pipeline_Welcome_TC028_1783`. **Deleted by end of run.**
2. **Fast/rapid fill fixture** — Name `TC028_Fast_${Date.now()}` (24 chars, deliberately kept under the 32-char cap to avoid a same-prefix collision with fixture 1 and to keep the entry-speed variable isolated from the truncation variable); Description `Pipeline for testing welcome message fast fill`; same 134-char Welcome Message text. Filled via a single scripted `run-code` block: `locator.fill()` on Name, Description, then Welcome Message, immediately followed by `.click()` on Save — no pause between actions (mirrors GH#43's original repro shape).
   - Observed fixture: id **360**, saved name `TC028_Fast_1783027416256` (28 chars, no truncation — confirmed). **Deleted by end of run.**
3. **Fast/rapid keystroke fixture** — Name `TC028_FastType_${Date.now()}` (28 chars); Description `Pipeline for testing welcome message fast type`; same 134-char Welcome Message text, entered via `locator.pressSequentially(text, { delay: 0 })` (character-by-character keystroke simulation, zero delay) instead of `.fill()`, immediately followed by `.click()` on Save.
   - Observed fixture: id **362**, saved name `TC028_FastType_1783027492662` (28 chars, no truncation). **Deleted by end of run.**

### Must Clean Up (in teardown — case's own Teardown section)
- All three pipelines (358, 360, 362) deleted via the kebab menu → "Delete pipeline" → type-exact-name → "Delete" flow. Confirmed via `DELETE /api/v2/elitea_core/application/prompt_lib/21/{id}` → `204` for each, and a final list scan (`document.querySelectorAll('.MuiCard-root')` filtered for `TC028`) returning `[]`.

## Test Steps

1. Navigate to `${BASE_URL}/app/pipelines/all`
   - **Verify**: page loads, title `Pipelines: all - Private`
2. Wait for the pipelines list to finish loading — condition wait, not a fixed sleep: wait for `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?...agents_type=pipeline...` (200), then wait for at least one `.MuiCard-root` inside `#EliteACustomTabPanel`
   - **Note**: the case's literal "wait 10 seconds for lazy loading" was not needed — list rendered immediately with the shared account's small pipeline count and zero scrolling.
3. Close any modal dialogs if present
   - **Verify**: the dismissible "Announcing ELITEA 2.0.4!" release-notes banner (same component already documented for the Agent/Pipeline create forms, GH#42) was present and closed via `getByRole('button', { name: 'close' })` before any further interaction.
4. Click the sidebar quick-create "Pipeline" button
   - **Verify**: navigates to `/app/pipelines/create?viewMode=owner`
   - **Case-text drift (not filed fresh — corroborated on the existing `GH#55` thread)**: the case's Step 4 says 'Click "Create Pipeline" button in left sidebar'. Live accessible name is **"Pipeline"** only (`button "Pipeline" [ref=e43]`, sits in the sidebar's top toolbar alongside the theme toggle, above the nav list) — no "Create" prefix exists in the DOM. Recommended locator: `page.locator('nav[aria-label="side-bar"]').getByRole('button', { name: 'Pipeline', exact: true })`.
5. Fill `textbox "Name *"` with the generated fixture name
   - **Verify**: field contains the typed value up to the 32-char cap (see Test Data / Known Defects — GH#27)
6. Fill `textbox "Description *"` with the fixture description
   - **Verify**: field contains the full value (no truncation observed on Description in this run)
7. Expand "Welcome Message" section if collapsed
   - **Verify**: section is visible
   - **Case-text drift (not filed fresh — corroborated on the existing `GH#28` thread)**: on the live create form, **all four** collapsible sections (General, Welcome message, Conversation starters, Advanced) render already `[expanded]` by default — the "if collapsed" conditional branch never triggers, same pattern GH#28 already documents for the Agents form.
8. Fill `textbox "Input your welcome message"` with the 134-char test welcome message
   - **Verify (normal-speed fixture only)**: `POST /api/v2/elitea_core/applications/prompt_lib/21` (fired on the later Save click) returns `201` with `version_details.welcome_message` equal to the full 134-char string — **confirmed persisted correctly** under this run's pacing (separate CLI commands, natural round-trip delay between Name/Description/Welcome Message fills and the Save click).
9. Verify the text is fully entered and visible in the field
   - **Verify**: `textbox.inputValue()` and a raw `document.querySelector` DOM read both show the complete 134-char string; the field visually expands to show the full text (no visual truncation/scroll-clipping observed)
10. Click "Save" button
    - **Verify**: `POST /api/v2/elitea_core/applications/prompt_lib/21` returns `201`; navigates to `/app/pipelines/all/{id}?destTab=configuration&name={savedName}&viewMode=owner`
11. Wait for redirect to pipeline detail page
    - **Verify**: condition wait on the `201` response + `waitForURL(/\/app\/pipelines\/all\/\d+/)`, not a fixed sleep
12. Navigate to pipeline detail page for the fixture
    - **Verify**: already there post-redirect from step 10; a fresh `GET /api/v2/elitea_core/application/prompt_lib/21/{id}` on page load/reload returns `200`
13. Expand "Welcome Message" section if collapsed
    - **Verify**: same as step 7 — already expanded by default, branch never triggers
14. Verify `textbox "Input your welcome message"` displays the full welcome message text
    - **Verify**: detail-page textbox value equals the complete 134-char string, matching the create-response value exactly — **confirmed, case's own acceptance criterion holds under normal-speed entry** (see Known Defects for the fast-entry divergence found during this analysis's extended investigation)
15. **[Analyst enrichment, beyond the case's own steps — see Known Defects]** Repeat steps 5–10 twice more on two additional disposable fixtures, using fast/rapid entry (scripted `fill()`+immediate-click, then `pressSequentially(delay:0)`+immediate-click) instead of this run's normal-speed pacing
    - **Verify**: both fast-entry fixtures show `version_details.welcome_message === ""` in both the create response AND a fresh `GET` after `page.reload()` — **the case's Step 14 acceptance criterion (full text persists, no truncation) does NOT hold under fast/automated entry timing.** See Known Defects — GH#43 corroboration.
16. Check console for errors (all three fixture flows)
    - **Verify**: 0 console errors/warnings across every flow — confirmed (`Total messages: 1–3` per session, all benign ASCII-art build-banner logs, same noise pattern as other modules)

## Expected Results
- A pipeline is created with a non-empty, non-truncated Welcome Message, **provided it is entered at normal/human-comparable pacing** (separate actions, natural round-trip delay before Save) — confirmed via this run's primary fixture (id 358).
- The Welcome Message field itself accepts and displays the full 134-char string with no client-side truncation or visual clipping, regardless of entry speed (only the *persisted* value is timing-sensitive, not the field's own display/DOM state — see Known Defects).
- Pipeline detail page displays the complete welcome message after Save, matching what was typed, under normal-speed entry.
- URL after Save is `/app/pipelines/all/{id}?destTab=configuration&name={savedName}&viewMode=owner` (case's own "Expected Final State" states the bare `/app/pipelines/{id}` shape — same minor URL-shape looseness already covered by the existing GH#28 clarification thread for the equivalent Agents pattern; not filed separately).
- **Divergent finding (see Known Defects, GH#43)**: under fast/automated back-to-back entry (no pause between filling the form and clicking Save), the Welcome Message value is silently dropped server-side — the create response and a subsequent fresh GET both show `welcome_message: ""`, even though the field's own DOM/`inputValue()` state correctly held the full text immediately before Save was clicked.
- No console errors during any of the three create → verify → (delete) flows.

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Setup 1: maximize browser window | UI elements visible | precondition | default headless viewport used, not literal maximize (see Preconditions) | asserted *(re-authored — headless has no maximize; recommend explicit 1920×1080 viewport per project convention)* |
| Setup 2: verify authenticated state via `/app/chat/` | no redirect = authenticated, else login first | precondition | fresh session redirected to Keycloak login as expected, then logged in — the "else" branch was genuinely exercised | asserted |
| 1 Navigate to `/app/pipelines/all` | list loads | step 1 | step 1: page title | asserted |
| 2 Wait 10s for lazy loading | all cards visible | step 2 | step 2: condition wait on list response + first card, not fixed sleep | asserted *(re-authored per project's no-`waitForTimeout` convention; list rendered with zero scrolling, low pipeline count)* |
| 3 Close any modal dialogs if present | modal dismissed | step 3 | step 3: release-notes banner closed | asserted |
| 4 Click "Create Pipeline" button in left sidebar | form opens at `/app/pipelines/create?viewMode=owner` | step 4 | step 4: URL after click | asserted *(re-authored: button's accessible name is "Pipeline", not "Create Pipeline" — see GH#55 corroboration)* |
| 5 Fill Name field | Name field contains value | step 5 | step 5: field value (up to 32-char cap) | asserted *(re-authored: hard `maxlength=32` truncates the case's own `${timestamp}`-suffixed template — cross-module corroboration of GH#27)* |
| 6 Fill Description field | Description field contains value | step 6 | step 6: field value | asserted |
| 7 Expand Welcome Message section if collapsed | section opens, field visible | step 7 | step 7: section visible | asserted *(re-authored: always pre-expanded, branch never triggers — cross-module corroboration of GH#28)* |
| 8 Fill Welcome Message textbox | field contains full text | step 8 | step 8: create response `welcome_message` (normal-speed fixture) | asserted |
| 9 Verify text fully entered/visible | all text visible, field may expand | step 9 | step 9: `inputValue()` + raw DOM read + visual expansion | asserted |
| 10 Click "Save" | pipeline saved successfully | step 10 | step 10: `201` response + redirect | asserted |
| 11 Wait for redirect | save completes | step 11 | step 11: condition wait, not fixed sleep | asserted |
| 12 Navigate to pipeline detail page | detail page loads | step 12 | step 12: fresh `GET` `200` | asserted |
| 13 Expand Welcome Message section if collapsed | section opens | step 13 | step 13: already expanded, same as step 7 | asserted |
| 14 Verify welcome message textbox shows full text, no truncation | complete message persisted and displayed | step 14 | step 14: detail-page value matches create-response value exactly | asserted *(holds ONLY under this run's normal-speed pacing — see step 15 / Known Defects for the fast-entry divergence, which is the dispatch's own explicitly-requested extra investigation, not part of the case's literal happy path)* |
| Expected Final State: pipeline created with persisted, non-truncated welcome message, URL `/app/pipelines/{id}` | all conditions hold | steps 10–14 | steps 10 (URL), 14 (persistence) | asserted *(URL shape re-authored — see Expected Results note, same class as existing GH#28 clarification)* |
| Teardown: delete pipeline via kebab menu → "Delete pipeline" → "Confirm" → verify removed | pipeline removed | see Cleanup | `DELETE .../application/prompt_lib/21/{id}` → `204` for all 3 fixtures, list scan confirms absence | asserted *(re-authored: button is "Delete", not "Confirm", gated behind a type-exact-name field — cross-module corroboration of GH#28/#33, matching TC-020/TC-023's own prior findings)* |

### Axis 2 — Analyst additions
- Step 15 (fast-entry comparison across two additional disposable fixtures) — *added: explicit dispatch instruction to verify whether GH#43 (a Welcome Message data-loss defect found on the Agents form under fast/automated entry) also reproduces on this Pipelines form, since the case is specifically dedicated to this exact field. This is the single most significant finding of this analysis — see Known Defects.*
- Step 16 asserts zero console errors/warnings across all three fixture flows — *added: guards against a silent regression the case's own steps don't check for, consistent with sibling pipelines-module AFS files' own enrichment.*
- Captured and asserted on the numeric pipeline `id` from each create response, in addition to the case's own name-based tracking — *added: same truncation-driven collision risk documented for GH#27 under parallel batch execution; id is the only collision-proof handle.*
- (Nothing else added beyond the case and the dispatch's explicit GH#43 investigation instruction.)

## Cleanup
1. For each of the three fixtures (358, 360, 362): open the kebab menu (`#undefined-action`) → click "Delete pipeline" (PIPELINE section, not the always-disabled "Delete" under VERSION) → type the fixture's exact (possibly truncated) saved name into the confirm textbox → click "Delete" (enabled only once the name matches exactly).
2. Confirmed via `DELETE /api/v2/elitea_core/application/prompt_lib/21/{id}` → `204` for all three ids, and a final `document.querySelectorAll('.MuiCard-root')` scan on `/app/pipelines/all` filtered for `TC028` returning `[]`.
3. Verified no other sibling analysts' fixtures were touched during this cleanup pass.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Sidebar quick-create "Pipeline" button | `page.locator('nav[aria-label="side-bar"]').getByRole('button', { name: 'Pipeline', exact: true })` (GH#55) | positional: first button inside the sidebar's top toolbar group, before the theme toggle separator |
| Create-pipeline Name input | `getByRole('textbox', { name: 'Name *' })` — **hard `maxlength=32`**, cross-module corroboration of GH#27 | n/a — stable role+name handle |
| Create-pipeline Description input | `getByRole('textbox', { name: 'Description *' })` | n/a |
| Welcome Message section toggle | `getByRole('button', { name: 'Welcome message' })` — always renders `[expanded]` on both create and detail views; the "expand if collapsed" branch is dead code in this app | `page.getByRole('heading', { name: 'Welcome message' })` |
| Welcome Message textbox | `getByRole('textbox', { name: 'Input your welcome message' })` — reuse the exact handle already established in `tests/pages/agentForm.page.ts`'s `welcomeMessageInput` (same accessible name confirmed on both Agents and Pipelines forms) | `page.locator('textarea[name="welcome_message"]')` |
| Create-pipeline Save button | `getByRole('button', { name: 'Save', exact: true })` — only Save/Cancel on the create form (no collision); dismiss the release-notes banner (`getByRole('button', { name: 'close' })`) defensively first | n/a |
| Pipeline detail — Save/Save As Version/Discard group | same context-sensitive pattern as `AgentFormPage.saveButton` (`tests/pages/agentForm.page.ts`) — detail page renders `Save`/`Save As Version`/`Discard`, not just `Save`; if extended to `entityForm.page.ts` this getter should work unchanged for Pipelines | n/a |
| Pipelines list container / card (reuse existing) | `page.locator('#EliteACustomTabPanel')` / `.MuiCard-root` — same handle `tests/pages/cardGridList.page.ts` already exposes | `.MuiCardContent-root` — no `data-testid`/role/aria-label on cards (GH#13, pre-existing) |
| Pipeline detail — overflow/kebab menu trigger | `page.locator('#undefined-action')` — **confirmed product defect**, cross-module corroboration of GH#33 | `page.locator('button[aria-haspopup="true"]').last()` scoped to the toolbar row containing Save/Save As Version/Discard |
| "Delete pipeline" menu item | `getByRole('menuitem', { name: 'Delete pipeline' })` — **do not confuse with** the always-`disabled` `getByRole('menuitem', { name: 'Delete' })` under the "VERSION" section of the same menu | n/a |
| Delete-confirmation dialog | `page.getByRole('dialog')` (only one ever mounted) — `getByRole('dialog', { name: 'Delete confirmation' })` does **not** resolve (broken `aria-labelledby`, cross-module corroboration of GH#33) | `page.locator('[role="dialog"]')` |
| Delete-confirmation "type name" input | `page.getByRole('dialog').getByRole('textbox')` (only input inside the dialog; has no accessible name of its own) | `page.locator('#name')` |
| Delete-confirmation Delete button | `page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true })` — starts `disabled`, enables only on exact name match | n/a |

## Network Behavior
- `POST /api/v2/elitea_core/applications/prompt_lib/{ownerId}` — create pipeline, fires on Save click, `201` on success. Response body's `version_details.welcome_message` is the authoritative persisted value — **this is where GH#43 manifests**: `""` under fast entry, full text under normal-speed entry, even though `version_details.name`/`.description` persist correctly at either speed.
- `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — detail fetch on navigating to the detail URL / on `page.reload()`. Used to confirm the create response's `welcome_message` value isn't a stale/transient artifact — a fresh GET after reload returns the identical (correct or empty) value, confirming genuine server-side persistence either way.
- `DELETE /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — fires on "Delete" click once the typed name matches. `204` on success. Confirmed for all three fixtures (358, 360, 362).
- Wait strategy for the implementer: `page.waitForResponse(r => r.url().includes('/applications/prompt_lib/') && r.request().method() === 'POST' && r.status() === 201)` racing the Save click, then read `(await response.json()).version_details.welcome_message` directly rather than re-reading the DOM post-redirect — this is what surfaced GH#43, a DOM-only assertion would have missed it since the field itself never shows a wrong value (see Known Defects).

## Known Defects Found During Exploration

- **[MINOR — cross-module corroboration, most significant finding of this case]** Welcome Message field value is silently dropped from the create payload under fast/automated entry — **now confirmed on the Pipelines form, not just Agents.**
  - Normal-speed entry (separate `playwright-cli` commands, natural round-trip delay before Save): welcome message persisted correctly (fixture 358) — case's own Step 14 acceptance criterion holds.
  - Fast, scripted `fill()`+immediate-click entry (fixture 360): `version_details.welcome_message` = `""` in both the create response and a fresh post-reload GET, despite `inputValue()` and a raw DOM read both showing the full text immediately before Save was clicked.
  - Fast, character-by-character `pressSequentially(delay:0)`+immediate-click entry (fixture 362): identical result, `welcome_message` = `""`.
  - **Result: 2/2 fast-entry reproductions, 0/1 normal-speed reproduction** — same divergence pattern as the original ticket's Agents-form findings.
  - **Filing status**: not filed as a new ticket. Corroborated in detail via comment on the existing [`GH#43`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/43) thread — this is the first pipelines-module confirmation on that ticket, strengthening the "shared entity-form timing issue" hypothesis over an Agents-specific cause.
  - **Impact on automation**: potentially blocking for a real `tests/pipelines.spec.ts` implementation of this case's Step 8/14 assertion, **because standard Playwright test code (`fill()` immediately followed by `.click()`) is timing-shaped much closer to this analysis's "fast" reproduction than its "normal-speed" one.** Recommend the implementer: (a) write the assertion against the `POST .../applications/prompt_lib/{ownerId}` response body's `version_details.welcome_message` field (not just the DOM, which never shows a wrong value even when the defect triggers), (b) run it once locally to observe whether the framework's own real timing reproduces the drop, and (c) if it does, wrap that specific assertion in `expect.soft()` with a `// Known defect: GH#43` comment — the same established, non-masking pattern already used in `tests/agents.spec.ts` for TC-011/TC-016 — rather than adding an undocumented delay to dodge it (blurring the field does NOT avoid the defect per GH#43's own findings, so a workaround delay is unproven and shouldn't be assumed to fix it silently).
- **[INFO / CLARIFICATION]** Case's Step 4 sidebar button — corroborated on the existing [`GH#55`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/55) thread (accessible name is "Pipeline", not "Create Pipeline"). Not filed as a new ticket.
- **[INFO / CLARIFICATION]** Case's Steps 7/13 "expand if collapsed" — corroborated on the existing [`GH#28`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/28) thread (all sections always pre-expanded; same pattern already documented for Agents, now confirmed on Pipelines' Welcome Message/General/Conversation starters/Advanced sections too). Not filed as a new ticket.
- **[MINOR]** Name field silently truncates at 32 characters — corroborated again on [`GH#27`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/27) (typed 41 chars, persisted 32). Not filed as a new ticket.
- **[MINOR]** Overflow-menu kebab button `id="undefined-action"` + related broken `aria-labelledby`/unlabeled confirm-input — corroborated again on [`GH#33`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/33). Not filed as a new ticket.
- **[INFO / CLARIFICATION]** Teardown's "click Confirm" — corroborated again on the `GH#28` thread (type-exact-name-to-enable-`Delete` pattern, no "Confirm" button exists). Not filed as a new ticket.
- **Pre-filing duplicate check performed** (per this batch's standing process fix — title/body search alone misses comment-only findings): ran `gh issue list --search "welcome message"` / `"welcome_message"` (all state, confirmed GH#43 had **zero** prior comments — this is the first cross-module hit), `"Create Pipeline button"` (found GH#55), and read `gh issue view {27,28,33,43,55} --comments` in full, confirming all five were still `OPEN`, before corroborating on each.
- **Impact on automation**: only the Welcome Message fast-entry defect (GH#43) has a plausible functional impact on this case's own automated implementation (see recommendation above). All other findings are pre-existing, already-filed, non-blocking case-text-drift/accessibility clarifications shared with the rest of the pipelines and agents modules.

## Blocked Steps
None. The case's own Setup and 14 numbered Steps were executed end-to-end against the live system using a disposable fixture (pipeline id 358, deleted by end of run). One additional round of exploration (Step 15, dispatch-requested) used two further disposable fixtures (360, 362), also deleted by end of run.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — this case joins `tests/pipelines.spec.ts` (module: pipelines, per `.agents/test-automation.yaml` and the EPIC's module-by-module delivery plan, GH#16). Per `.agents/testing.md` § Structure, WebQAPreExecuted-module specs are **not** assumed serial by default — TC-028 has no observed dependency on sibling pipelines-module cases (TC-020..027/029), and creates/cleans up its own fixture(s).
- Page object: reuse `tests/pages/cardGridList.page.ts` for list/card interactions and the sidebar quick-create button pattern. This case's form fields (Name, Description, Welcome Message, Save) map directly onto `tests/pages/agentForm.page.ts`'s existing shape — strong candidate to confirm/extend the `entityForm.page.ts` generalization `.agents/testing.md` already flagged as worth evaluating during the pipelines module, since `welcomeMessageInput`'s accessible name (`'Input your welcome message'`) is now confirmed identical on both Agents and Pipelines forms.
- **Critical implementation note**: assert the Welcome Message persistence via the `POST .../applications/prompt_lib/{ownerId}` response body (`version_details.welcome_message`), not just a DOM re-read after navigating to the detail page — a DOM-only check can pass even when GH#43 has silently dropped the value, because the *display* never shows a wrong value, only the persisted record does. See Known Defects for the full recommendation (assert via response, `expect.soft()` + `// Known defect: GH#43` if the real test's timing reproduces the drop).
- Wait strategy: no `waitForTimeout` anywhere in this spec — every wait is a `waitForResponse` on the specific create/detail/delete endpoint, or a web-first `expect(...).toBeVisible()` poll.
- Fixture naming: given the confirmed `maxlength=32` truncation (GH#27), use a name template that stays comfortably under 32 chars (e.g. `TC028_${Date.now()}`-style, ~20 chars) rather than the case's own longer literal template, to avoid re-deriving the truncated value at assertion time.
- **Analyst execution note (process/tooling, not product)**: ran via `playwright-cli -s=TC-028`, a genuinely isolated in-memory browser profile (confirmed via fresh `/app/chat/` redirecting to Keycloak login with no inherited cookies at session start). No cross-talk with the concurrently-dispatched sibling analysts (TC-020..027, TC-029) was observed at any point (verified `window.location.href` after every navigation/interaction per the standing mitigation in `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`) — sibling fixtures were visible in the shared account's pipelines list during list-scan steps but were never interacted with.
