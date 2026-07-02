# Test Case: Agent Detail Page Displays Correct Data

## Metadata
- **TMS ID**: TC-016
- **Linked Story**: GH#23 (tracking issue), parent epic GH#16 (WebQAPreExecuted batch — module: agents)
- **Priority**: l3
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`)
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via `GET ${BASE_URL}/app/chat/` not redirecting to a login page
- Browser viewport maximized (case's own Setup step 1) — explored at 1920×1080
- **This is a mutating case** (unlike TC-003/TC-004): the case's own Setup requires *creating* a throwaway agent first, then its own Steps assert against that agent's detail page, then its own Teardown deletes it. No pre-existing baseline agent can substitute — the assertions are against exact authored field values (name, description, tags, guidelines, welcome message, step limit), which only a purpose-built fixture agent guarantees. Read-only-by-default (Hard Rule 10) does not apply here; the case is inherently a create → verify → delete round-trip.

## Test Data
### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — standard smoke-suite account

### Must Generate (in test setup)
- Agent name: `TEST_Agent_Detail_${Date.now()}` (unique per run — avoids collision with a sibling parallel run's fixture of the same case)
- Description: `Agent for detail page verification`
- Tags: `detail`, `test`, `qa` (entered as three separate chips — see § Concrete Handles, the Tags control is a MUI free-solo autocomplete, not a single delimited string)
- Guidelines: `Detailed agent guidelines for testing`
- Welcome Message: `Welcome to the detail test agent`
- Step Limit: `75`
- The agent's numeric ID is assigned server-side on Save and is **not predictable in advance** — capture it from the post-Save redirect URL (`/app/agents/all/{id}?...`), do not hardcode it

### Must Clean Up (in teardown)
- Delete the generated agent via the detail page's overflow menu → "Delete agent" → type the exact agent name into the confirmation field → click "Delete" (see § Concrete Handles and Finding 2 below — the case's own Teardown text is inaccurate here)
- Verify deletion by re-navigating to the agent's own detail URL and confirming "Page not found" (or equivalently, confirming the agent no longer appears in `/app/agents/all`)

## Test Steps

1. Navigate to `${BASE_URL}/app/chat/`
   - **Verify**: page does not redirect to the Keycloak login page (confirms authenticated precondition)
2. Navigate to `${BASE_URL}/app/agents/all`
   - **Verify**: URL is `${BASE_URL}/app/agents/all`
3. Click the sidebar "Agent" button (`getByRole('button', { name: 'Agent', exact: true })`) to open the create form
   - **Verify**: URL becomes `${BASE_URL}/app/agents/create?viewMode=owner`; form sections (General, Instructions, Welcome message, Conversation starters, Advanced) are all visible and **already expanded by default** — see Coverage Map re: case steps 6/8/10's "expand if collapsed" framing
4. Fill `textbox "Name *"` with the generated agent name
   - **Verify**: field echoes the typed value
5. Fill `textbox "Description *"` with `Agent for detail page verification`
6. Click `combobox "Tags"`, type `detail`, press `Enter`; repeat for `test` and `qa`
   - **Verify**: three tag chips (`button "detail"`, `button "test"`, `button "qa"`) render next to the Tags combobox after each Enter
7. Fill `textbox "Guidelines for the AI agent"` with `Detailed agent guidelines for testing`
8. Fill `textbox "Input your welcome message"` with `Welcome to the detail test agent`
9. Fill `textbox "Step limit"` (pre-filled with a default `"25"`) with `75` — use `.fill()` (which clears first), not `.type()`, to avoid leaving `"2575"`
10. Close the "Announcing ELITEA 2.0.4!" release-banner (`button "close"`) if present, **before** clicking Save
    - **Note**: this banner is a page-level overlay that intercepts pointer events on the Save button when open — confirmed live: the first Save-click attempt silently retried for ~1.7s ("subtree intercepts pointer events") until the banner was dismissed. Automation must dismiss it unconditionally (or scope the click with `{ force: false }` retry awareness) rather than assume it's absent.
11. Click `button "Save"`
    - **Verify**: navigation to `/app/agents/all/{id}?destTab=configuration&name={encoded-name}&viewMode=owner` where `{id}` is a newly-assigned numeric agent ID; page title becomes `Agent: {name} - Private`
    - **Capture**: `{id}` from the URL for use in step 12 and Cleanup
12. Navigate directly (fresh `page.goto`, not a client-side link click) to `${BASE_URL}/app/agents/all/{id}?viewMode=owner`
    - **Verify**: page loads (NOT the case's originally-authored `${BASE_URL}/app/agents/{id}` — see Coverage Map Finding 1 / Known Defects; that literal pattern redirects to the list page and never reaches a detail view)
    - **Wait condition**: `page.waitForResponse` on `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` returning `200` (the actual data-fetch backing this async-rendered page — see § Network Behavior), THEN assert field values (web-first assertions with their own auto-retry cover the brief pre-fetch render gap; no fixed sleep needed)
13. Verify `textbox "Name *"` has value equal to the generated agent name
14. Verify `textbox "Description *"` has value `Agent for detail page verification`
15. Verify `combobox "Tags"`'s sibling chip buttons contain exactly `detail`, `test`, `qa` (order as entered)
16. Verify the "Instructions" section is expanded (it is, by default — no click needed) and `textbox "Guidelines for the AI agent"` has value `Detailed agent guidelines for testing`
17. Verify the "Welcome message" section is expanded (by default) and `textbox "Input your welcome message"` has value `Welcome to the detail test agent`
18. Verify the "Advanced" section is expanded (by default) and `textbox "Step limit"` has value `"75"`

## Expected Results
- Agent detail page at `${BASE_URL}/app/agents/all/{id}?viewMode=owner` (case's originally-authored `/app/agents/{id}` pattern does not work — see Known Defects)
- All fields (Name, Description, Tags ×3, Guidelines, Welcome Message, Step limit) display exactly the values entered at creation — no truncation, no missing values
- All four relevant sections (General, Instructions, Welcome message, Advanced) render already-expanded; no manual expand action is ever needed on this page
- No console errors attributable to the page's own data load (the two `WebSocket ... ERR_NAME_NOT_RESOLVED` entries observed during this exploration are a sandboxed-network artifact of the analyst's isolated browser profile, not a page defect — see § Known Defects for the distinction)
- `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` returns `200`

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Setup 1: maximize browser window | all UI elements visible | precondition | viewport set 1920×1080 before navigation | asserted |
| Setup 2: verify authenticated state via `/app/chat/` | no redirect to login = authenticated | step 1 | step 1: no redirect | asserted |
| Setup 3: create test agent with specific data (Name, Description, Tags, Guidelines, Welcome Message, Step Limit) | agent created, ID noted | steps 3–11 | step 11: URL capture of `{id}` | asserted *(decomposed into 9 AFS steps — form has no single "fill all" action)* |
| 1 Navigate directly to `/app/agents/{id}` | agent detail page loads | step 12 | step 12: page loads via corrected URL | clarification *(case's literal `/app/agents/{id}` pattern redirects to the list page / 404s — see Known Defects Finding 1; asserted against the corrected `/app/agents/all/{id}?viewMode=owner` pattern instead)* |
| 2 Wait 2–3s for page to fully load | all sections and fields visible | step 12 | step 12: condition wait on `application/prompt_lib` response, not a fixed sleep | asserted *(re-authored: condition wait, not fixed sleep, per `.agents/testing.md` § Conventions)* |
| 3 Verify Name field | shows correct value | step 13 | step 13 | asserted |
| 4 Verify Description field | shows correct value | step 14 | step 14 | asserted |
| 5 Verify Tags combobox contains 3 tags | all three tags displayed | step 15 | step 15 | asserted |
| 6 Expand Instructions section if collapsed | section opens | step 16 | step 16: confirmed already-expanded, no click needed | asserted *(condition never true in practice — see Expected Results)* |
| 7 Verify Guidelines field | text correct | step 16 | step 16 | asserted |
| 8 Expand Welcome Message section if collapsed | section opens | step 17 | step 17: confirmed already-expanded, no click needed | asserted *(condition never true in practice)* |
| 9 Verify Welcome message field | text correct | step 17 | step 17 | asserted |
| 10 Expand Advanced section if collapsed | section opens | step 18 | step 18: confirmed already-expanded, no click needed | asserted *(condition never true in practice)* |
| 11 Verify Step limit field | value correct | step 18 | step 18 | asserted |
| Expected Final State: all sections show correct data, nothing missing/truncated/incorrect | full-page correctness | steps 13–18 | all field assertions | asserted |
| Expected Final State: URL is `/app/agents/{id}` | final URL shape | — | — | clarification *(same Finding 1 as case step 1 — the live, correct URL is `/app/agents/all/{id}?viewMode=owner`, not `/app/agents/{id}`)* |
| Teardown: open menu, click "Delete agent", confirm via "Confirm" button, verify removal | agent deleted and gone from list | Cleanup steps 1–3 | Cleanup step 3: re-navigate to detail URL, confirm "Page not found" | clarification *(case's "Confirm" button does not exist — see Known Defects Finding 2; actual flow requires typing the agent's exact name into a field before an initially-disabled "Delete" button becomes clickable)* |

### Axis 2 — Analyst additions
- Step 10 asserts the release-announcement banner must be dismissed before Save is clickable — *added: observed live that the banner's pointer-event-intercepting subtree caused the first Save click attempt to silently retry for ~1.7s; the case's steps never mention this banner at all (it's incidental UI, not case-specific), but a naive automation would either flake or accidentally rely on Playwright's built-in actionability retry timing out favorably. Making the dismiss explicit removes that timing dependency.*
- Step 9 calls out `.fill()` over `.type()` for the Step-limit field specifically — *added: the field is pre-populated with a default `"25"` on the create form (not empty), so an append-only `.type()` would silently produce `"2575"` instead of `"75"`. Confirmed live: the field's default value is `"25"`, not blank.*
- Expected Results adds "no console errors attributable to the page's own data load," explicitly carving out the WebSocket/socket.io connection-failure entries observed in this run — *added: two `ERR_NAME_NOT_RESOLVED` console errors were observed for `wss://next.elitea.ai/socket.io/...` during this exploration, but they reproduce identically on ordinary list/chat pages regardless of this case and are consistent with the isolated analyst browser profile's network restrictions (per this project's known parallel-analyst sandboxing — see `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`), not a defect in the agent-detail page itself. Flagging the distinction so the automation engineer doesn't chase a false lead if the same benign errors reappear in CI.*
- (Nothing else added beyond the case.)

## Cleanup
1. On the agent detail page, click the overflow menu button (`page.locator('#undefined-action')` — see § Concrete Handles for why role/name locators don't work here)
2. Click `menuitem "Delete agent"` (under the "AGENT" section of the menu — do **not** confuse with the disabled `menuitem "Delete"` under the "VERSION" section, which deletes a version, not the agent)
3. In the "Delete confirmation" dialog, fill the `textbox` (labelled "Name") with the exact agent name, then click `button "Delete"` (disabled until the typed name matches)
4. Verify cleanup: re-navigate to `${BASE_URL}/app/agents/all/{id}?viewMode=owner` and confirm the page shows "Page not found" (confirmed live — this is the app's actual behavior for a deleted/nonexistent agent ID)

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Sidebar "create agent" trigger | `page.getByRole('button', { name: 'Agent', exact: true })` (in the side-bar, next to the workspace switcher) | none needed — stable role+name |
| Name field | `page.getByRole('textbox', { name: 'Name *' })` | none needed |
| Description field | `page.getByRole('textbox', { name: 'Description *' })` | none needed |
| Tags input | `page.getByRole('combobox', { name: 'Tags' })` — MUI free-solo autocomplete; type text then press `Enter` to commit a chip (no dropdown/listbox appears — this is a create-your-own-tag field, not a select-from-list one) | n/a |
| Tag chip (rendered) | `page.getByRole('button', { name: '<tag-text>', exact: true })` scoped near the Tags combobox | `.MuiChip-root` containing the tag text |
| Guidelines field | `page.getByRole('textbox', { name: 'Guidelines for the AI agent' })` | none needed |
| Welcome message field | `page.getByRole('textbox', { name: 'Input your welcome message' })` | none needed |
| Step limit field | `page.getByRole('textbox', { name: 'Step limit' })` — **pre-filled with `"25"` by default; use `.fill()`, not `.type()`** | none needed |
| Release-announcement banner close button | `page.getByRole('button', { name: 'close' })` — scoped to the banner containing text "Announcing ELITEA" (generic name "close" could otherwise collide; confirmed only one such button present at a time) | n/a |
| Save button (create form) | `page.getByRole('button', { name: 'Save' })` | none needed |
| Agent detail overflow ("kebab") menu button | `page.locator('#undefined-action')` — **the button's real `id` attribute literally renders as the string `"undefined-action"`** (confirmed via Playwright's own locator-generation from a live accessibility-tree ref); it also has no accessible name, so no role/name locator can target it — see § Known Defects Found During Exploration. Filed as [`GH#33`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/33). | positional: the last icon-only button in the detail page's header toolbar row, right of "Save As Version"/"Discard" |
| "Delete agent" menu item | `page.getByRole('menuitem', { name: 'Delete agent' })` — **do not confuse with** `page.getByRole('menuitem', { name: 'Delete' })`, which is a *disabled* item under the menu's "VERSION" section (deletes a version, not the agent) | n/a |
| Delete-confirmation dialog name field | `page.getByRole('dialog', { name: /Delete confirmation/ }).getByRole('textbox')` | `page.getByRole('textbox')` scoped to the open dialog |
| Delete-confirmation submit button | `page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true })` — **disabled until the typed name exactly matches** | n/a |

## Network Behavior
- `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — the single-agent detail fetch backing this page's field population (the "W-DYN" dynamic-render behavior under test). Fires on mount of `/app/agents/all/{id}?viewMode=owner`. Returned `200` in every observed load. This is the correct wait target — `page.waitForResponse(r => r.url().includes('/application/prompt_lib/') && r.url().match(/\/application\/prompt_lib\/\d+\/\d+$/) && r.status() === 200)` — before asserting field values.
- `GET /api/v2/elitea_core/public_application/prompt_lib/{id}` (note: `public_application`, singular-path variant, NOT the same endpoint as above) — fires instead of the correct endpoint when `viewMode=owner` is **absent** from the URL, and returns `400` for a private/owner-only agent, producing the "Page not found" client-side error page. This is the mechanism behind Known Defects Finding 1 below — confirms `viewMode=owner` is not cosmetic, it changes which backend endpoint the client calls.
- `GET /api/v2/elitea_core/application_skills/prompt_lib/{ownerId}/{versionId}` — fires alongside the main detail fetch (populates the Skills section, `0/5 skills added` in this fixture's case); not otherwise relevant to this case's assertions.
- No `POST`/`PUT` traffic assertions are needed for this case — creation (Setup) and deletion (Teardown) are both out of this case's own Expected Results scope; only the read/display behavior on the detail page is under test per the case's title.

## Known Defects Found During Exploration

**No blocking product defects found.** Two case-authoring inaccuracies (CLARIFICATION, not a product bug — reverse-masking guard applies, the live app is correct and self-consistent) plus one minor code-quality nit were found and confirmed against the live DOM:

- **[INFO / CLARIFICATION]** Case step 1's URL pattern `/app/agents/{id}` does not resolve to a detail page at all (redirects to `/app/agents/all` when the `all/` segment is missing; 404s with a backend `400` from `public_application/prompt_lib/{id}` when the segment is present but `viewMode=owner` is missing). The Teardown's "click Confirm" instruction also does not match the live confirmation dialog (button is labelled "Delete" and stays disabled until the agent's exact name is typed into an adjacent field). **This is the same underlying case-authoring drift TC-011's analyst already found and filed as [`GH#28`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/28)** — confirmed via memory cross-reference *after* independently filing a duplicate (`GH#31`, now closed as a dup); folded the additional endpoint-level detail found here (the `public_application/prompt_lib` 400 mechanism, and confirming `viewMode=owner` is functionally required, not cosmetic) into a comment on `GH#28` instead of leaving two open tickets for one drift. Referenced to TC-016 and parent epic GH#16.
- **[INFO]** The agent detail page's overflow-menu ("kebab") button renders with a literal, broken `id="undefined-action"` and carries no accessible name — a real (if minor, non-blocking) product code-quality defect, independent of the case-text issue above. TC-011's analyst noted the identical symptom but chose not to file a ticket for it (AFS-only note, "no user-visible impact"); on independent judgment this AFS filed it as [`GH#33`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/33) since it's a genuine (if minor) defect that a future locator refactor could reintroduce silently if left undocumented outside an AFS. No pre-existing ticket existed for it, so this is not a duplicate.
- **Filing status**: `GH#28` (existing, corroborated) + `GH#33` (new) — both per `.agents/profile.md` § Bug filing (`github-issue`, strict-per-bug), referencing TC-016 and linked to parent epic GH#16 / tracking issue GH#23. `GH#31` was filed then closed as a duplicate of `GH#28` in the same analysis pass — see § Automation Hints for the general lesson.
- Recommendation for the automation engineer: implement against the corrected URL/handles in this AFS's § Test Steps and § Concrete Handles directly — no `expect.soft()` workaround is needed since the case text has already been re-authored here, not just annotated.
- **[MINOR] — [Implementer amendment, 2026-07-02]** New defect found during automation (not observed during this case's own analyst exploration): the Welcome Message field's value is silently dropped from the create-agent payload when filled via fast, back-to-back programmatic form entry — confirmed reproducible here too (this case's own Setup fills Welcome Message as part of the full field set). Independently found and filed by TC-011's implementer pass as [`GH#43`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/43); corroborated here rather than re-filed. A subsequent fresh `GET`/page reload also shows the field empty (genuine server-side data loss, not a stale-UI artifact) — this directly affects this case's own step 17 assertion (`Verify Welcome message field`). Non-blocking for the rest of this case's scope; handled via `expect.soft()` with a `// Known defect: GH#43` comment in `tests/agents.spec.ts`.

## Blocked Steps
None. All Setup steps and all 11 case Steps (decomposed into 18 AFS steps) plus the full Teardown were executed end-to-end against the live system, including creating, verifying, and deleting a real throwaway agent (id `276` at exploration time — not stable across runs, do not hardcode).

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — this case joins `tests/agents.spec.ts` (module: agents, per `.agents/testing.md` § Structure "Growing past smoke" plan), batched with the rest of TC-010..019 in one PR.
- Page object: no `agentForm.page.ts` exists yet at analysis time — `.agents/testing.md` predicts this exact page object for the agents module's create/edit form; this case's Concrete Handles table above is a direct input to it (Name/Description/Tags/Guidelines/Welcome-message/Step-limit fields, Save button, and the create→detail URL transition are all shared surface with any other agents-module case that creates/edits an agent — check sibling AFS files in this same batch for the same fields before hardcoding duplicate locators in two places).
- Serial vs parallel: per `.agents/testing.md` § Structure, agents-module cases are **not** assumed serial by default. This case is fully self-contained (creates its own fixture, cleans it up) — safe to run in parallel with sibling agents-module tests, provided the generated agent name includes a run-unique timestamp (already specified in § Test Data) so two parallel runs of *this same test* don't collide on name/tag assertions.
- Wait strategy: **no `waitForTimeout` anywhere in this spec** — the case's own "wait for page to fully load (2-3 seconds)" (step 2) has been re-authored into a `waitForResponse` on `/api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` (200) followed by web-first `expect(...).toHaveValue(...)` assertions, which auto-retry through the brief async-render gap without any fixed sleep.
- **Analyst execution note (process/tooling, not a product or spec issue):** this exploration ran in a dedicated, isolated `playwright-cli -s=TC016` browser session (own in-memory Chrome profile, own port) specifically to avoid the shared-MCP-browser cross-talk documented in `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md` (this AFS was authored while 9 sibling analysts, TC-010..015/TC-017..019, were dispatched in parallel against the same account). Confirmed isolated throughout: fresh navigation to `/app/chat/` at session start correctly bounced to the Keycloak login page (no inherited cookies), and `window.location.href` was re-verified after every navigation with no cross-talk observed. This does not affect the correctness of the eventual automated Playwright suite, since `npx playwright test` gives each worker its own isolated browser context independent of this analysis session's tooling.
