# Test Case: Pipeline Detail Page Displays Correct Data

## Metadata
- **TMS ID**: TC-026
- **Linked Story**: GH#51 (tracking issue), parent epic GH#16 (WebQAPreExecuted batch — module: pipelines)
- **Priority**: l3
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`)
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via `GET ${BASE_URL}/app/chat/` not redirecting to a login page
- Browser viewport maximized (case's own Setup step 1) — explored at 1280×720 (isolated CLI session default; the case's own "maximize" instruction has no observable effect on this page's rendering — no responsive breakpoint difference found)
- **This is a mutating case**, same shape as its agents-module analogue TC-016: the case's own Setup requires *creating* a throwaway pipeline first with exact authored field values, then its own Steps assert against that pipeline's detail page, then its own Teardown deletes it. No pre-existing baseline pipeline can substitute — the assertions are against exact authored field values (name, description, tags, welcome message, step limit), which only a purpose-built fixture guarantees. Read-only-by-default (Hard Rule 10) does not apply to the mutating core of this case; a **read-only pre-check** was still performed first (see § Automation Hints — Analyst execution note) against a pre-existing baseline pipeline to cheaply confirm the URL-pattern hypothesis before committing to a throwaway fixture.

## Test Data
### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — standard smoke-suite account

### Must Generate (in test setup)
- Pipeline name: `TEST_Pipeline_Detail_${Date.now()}` (unique per run — avoids collision with a sibling parallel run's fixture of the same case)
- Description: `Pipeline for detail page verification`
- Tags: `detail`, `test`, `qa` (entered as three separate chips — same MUI free-solo autocomplete pattern as the agents module's Tags field, not a single delimited string)
- Welcome Message: `Welcome to the detail test pipeline`
- Step Limit: `80`
- The pipeline's numeric ID is assigned server-side on Save and is **not predictable in advance** — capture it from the post-Save redirect URL (`/app/pipelines/all/{id}?...`), do not hardcode it
- Note: unlike the agents module's equivalent case (TC-016), the pipeline create form has **no Guidelines/Instructions field** — the case's own Test Data table correctly omits it; do not add one

### Must Clean Up (in teardown)
- Delete the generated pipeline via the detail page's overflow menu → "Delete pipeline" → type the exact pipeline name into the confirmation field → click "Delete" (see § Concrete Handles and Finding 1 below — the case's own Teardown text is inaccurate here, identical drift to the agents module)
- Verify deletion by re-navigating to the pipeline's own detail URL and confirming "Page not found" (or equivalently, confirming the pipeline no longer appears in `/app/pipelines/all`)

## Test Steps

1. Navigate to `${BASE_URL}/app/chat/`
   - **Verify**: page does not redirect to the Keycloak login page (confirms authenticated precondition)
2. Navigate to `${BASE_URL}/app/pipelines/all`
   - **Verify**: URL is `${BASE_URL}/app/pipelines/all`
3. Dismiss the "Announcing ELITEA 2.0.4!" release-banner (`button "close"`) if present, **before** interacting with the sidebar "Pipeline" button
   - **Note**: same banner/intercept risk documented for the agents module (GH#42) — dismiss unconditionally rather than assume absence
4. Click the sidebar "Pipeline" button (`getByRole('button', { name: 'Pipeline', exact: true })`) to open the create form
   - **Verify**: URL becomes `${BASE_URL}/app/pipelines/create?viewMode=owner`; form sections (General, Welcome message, Conversation starters, Advanced) are all visible and **already expanded by default** — see Coverage Map re: case steps 6/8's "expand if collapsed" framing
5. Fill `textbox "Name *"` with the generated pipeline name
   - **Verify**: field echoes the typed value
6. Fill `textbox "Description *"` with `Pipeline for detail page verification`
7. Click `combobox "Tags"`, type `detail`, press `Enter`; repeat for `test` and `qa`
   - **Verify**: three tag chips (`button "detail"`, `button "test"`, `button "qa"`) render next to the Tags combobox after each Enter
8. Fill `textbox "Input your welcome message"` with `Welcome to the detail test pipeline`
9. Fill `textbox "Step limit"` (pre-filled with a default `"25"`) with `80` — use `.fill()` (which clears first), not `.type()`, to avoid leaving `"2580"` (same pitfall documented for the agents module)
10. Click `button "Save"`
    - **Verify**: navigation to `/app/pipelines/all/{id}?destTab=configuration&name={encoded-name}&viewMode=owner` where `{id}` is a newly-assigned numeric pipeline ID; page title becomes `Pipeline: {name} - Private`
    - **Capture**: `{id}` from the URL for use in step 11 and Cleanup
11. Navigate directly (fresh `page.goto`, not a client-side link click) to `${BASE_URL}/app/pipelines/all/{id}?viewMode=owner`
    - **Verify**: page loads (NOT the case's originally-authored `${BASE_URL}/app/pipelines/{id}` — see Coverage Map Finding 1 / Known Defects; that literal pattern redirects to the list page and never reaches a detail view)
    - **Wait condition**: `page.waitForResponse` on `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` returning `200` (the actual data-fetch backing this async-rendered page — see § Network Behavior), THEN assert field values (web-first assertions with their own auto-retry cover the brief pre-fetch render gap; no fixed sleep needed)
12. Verify `textbox "Name *"` has value equal to the generated pipeline name
13. Verify `textbox "Description *"` has value `Pipeline for detail page verification`
14. Verify the Tags area's sibling chip buttons contain exactly `detail`, `test`, `qa` (order as entered)
15. Verify the "Welcome message" section is expanded (by default — no click needed) and `textbox "Input your welcome message"` has value `Welcome to the detail test pipeline`
16. Verify the "Advanced" section is expanded (by default — no click needed) and `textbox "Step limit"` has value `"80"`

## Expected Results
- Pipeline detail page at `${BASE_URL}/app/pipelines/all/{id}?viewMode=owner` (case's originally-authored `/app/pipelines/{id}` pattern does not work — see Known Defects)
- All fields (Name, Description, Tags ×3, Welcome Message, Step limit) display exactly the values entered at creation — no truncation, no missing values
- All relevant sections (General, Welcome message, Advanced) render already-expanded; no manual expand action is ever needed on this page
- No console errors attributable to the page's own data load for a freshly-created, non-forked pipeline (see § Known Defects for a distinct, out-of-scope observation about *forked* pipelines specifically)
- `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` returns `200`

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Preconditions: app accessible, user authenticated | precondition holds | step 1 | step 1: no redirect | asserted |
| Setup 1: maximize browser window | all UI elements visible | precondition | viewport set before navigation | asserted *(no observable rendering difference found at the explored viewport — see § Preconditions)* |
| Setup 2: verify authenticated state via `/app/chat/` | no redirect to login = authenticated | step 1 | step 1: no redirect | asserted |
| Setup 3: create test pipeline with specific data (Name, Description, Tags, Welcome Message, Step Limit) | pipeline created, ID noted | steps 4–10 | step 10: URL capture of `{id}` | asserted *(decomposed into 7 AFS steps — form has no single "fill all" action; banner-dismiss step 3 added, see Axis 2)* |
| 1 Navigate directly to `/app/pipelines/{id}` | pipeline detail page loads | step 11 | step 11: page loads via corrected URL | clarification *(case's literal `/app/pipelines/{id}` pattern redirects to the list page — see Known Defects Finding 1; asserted against the corrected `/app/pipelines/all/{id}?viewMode=owner` pattern instead)* |
| 2 Wait 2–3s for page to fully load | all sections and fields visible | step 11 | step 11: condition wait on `application/prompt_lib` response, not a fixed sleep | asserted *(re-authored: condition wait, not fixed sleep, per `.agents/testing.md` § Conventions)* |
| 3 Verify Name field | shows correct value | step 12 | step 12 | asserted |
| 4 Verify Description field | shows correct value | step 13 | step 13 | asserted |
| 5 Verify Tags combobox contains 3 tags | all three tags displayed | step 14 | step 14 | asserted |
| 6 Expand Welcome Message section if collapsed | section opens | step 15 | step 15: confirmed already-expanded, no click needed | asserted *(condition never true in practice — see Expected Results)* |
| 7 Verify Welcome message field | text correct | step 15 | step 15 | asserted |
| 8 Expand Advanced section if collapsed | section opens | step 16 | step 16: confirmed already-expanded, no click needed | asserted *(condition never true in practice)* |
| 9 Verify Step limit field | value correct | step 16 | step 16 | asserted |
| Expected Final State: all sections show correct data, nothing missing/truncated/incorrect | full-page correctness | steps 12–16 | all field assertions | asserted |
| Expected Final State: URL is `/app/pipelines/{id}` | final URL shape | — | — | clarification *(same Finding 1 as case step 1 — the live, correct URL is `/app/pipelines/all/{id}?viewMode=owner`, not `/app/pipelines/{id}`)* |
| Teardown: open menu, click "Delete pipeline" option, confirm via "Confirm" button, verify removal | pipeline deleted and gone from list | Cleanup steps 1–4 | Cleanup step 4: re-navigate to detail URL, confirm "Page not found" | clarification *(case's "Confirm" button does not exist — see Known Defects Finding 2; actual flow requires typing the pipeline's exact name into a field before an initially-disabled "Delete" button becomes clickable — identical to the agents-module drift already tracked on GH#28)* |

### Axis 2 — Analyst additions
- Step 3 asserts the release-announcement banner must be dismissed before form interaction — *added: this is the same banner/intercept risk already documented and filed for the agents module (GH#42); the case's own steps never mention it (incidental UI, not case-specific), so making the dismiss explicit here removes an equivalent timing dependency for pipelines.*
- Step 9 calls out `.fill()` over `.type()` for the Step-limit field specifically — *added: the field is pre-populated with a default `"25"` on the create form (not empty), so an append-only `.type()` would silently produce `"2580"` instead of `"80"`. Confirmed live: the field's default value is `"25"`, identical to the agents module's equivalent field.*
- Expected Results adds "no console errors attributable to the page's own data load, for a freshly-created, non-forked pipeline" — *added: a separate, out-of-scope observation surfaced during the read-only URL-pattern pre-check against a pre-existing **forked** baseline pipeline (id 3, "Analyze GitHub Issues") — opening that pipeline's detail page in owner view auto-fired `PUT /api/v2/elitea_core/version/prompt_lib/{ownerId}/{applicationId}/{versionId}` (201, silently creates a new draft version) followed by `GET .../version_validator/.../{versionId}` (400, a toolkit-configuration validation error specific to that pipeline's forked GitHub toolkit). Confirmed this does NOT occur for this case's own freshly-created, non-forked fixture (no such PUT/validator calls fired for pipeline id 363) — so it's not a general defect in this case's own scope, just a fork-specific behavior flagged for the benefit of any other pipelines-module case that opens an existing forked pipeline (e.g. an Edit case). Not filed as a new ticket — pre-existing seed-data/toolkit-config issue on an account pipeline outside this case's control, not reproducible with a controlled fixture. Also worth flagging: this PUT was made without any explicit "edit" action from me — merely opening a forked pipeline's detail page in `viewMode=owner` mutates data. If another pipelines-module case opens `application_id=3` in owner mode expecting a pure read, it will trigger a native `beforeunload` confirmation dialog on subsequent navigation (observed live — see § Automation Hints).*
- (Nothing else added beyond the case.)

## Cleanup
1. On the pipeline detail page, click the overflow menu button (`page.locator('#undefined-action')` — see § Concrete Handles for why role/name locators don't work here; identical broken-id defect already filed against the Agent detail page as GH#33 and cross-module-corroborated against Pipelines by TC-023)
2. Click `menuitem "Delete pipeline"` (under the "PIPELINE" section of the menu — do **not** confuse with the disabled `menuitem "Delete"` under the "VERSION" section, which deletes a version, not the pipeline)
3. In the "Delete confirmation" dialog, fill the unlabeled `textbox` (visually labelled "Name") with the exact pipeline name, then click `button "Delete"` (disabled until the typed name matches)
4. Verify cleanup: re-navigate to `${BASE_URL}/app/pipelines/all/{id}?viewMode=owner` and confirm the page shows "Page not found" (confirmed live — this is the app's actual behavior for a deleted/nonexistent pipeline ID)

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Release-announcement banner close button | `page.getByRole('button', { name: 'close' })` — scoped to the banner containing text "Announcing ELITEA" | n/a |
| Sidebar "create pipeline" trigger | `page.getByRole('button', { name: 'Pipeline', exact: true })` (in the side-bar, next to the workspace switcher) | none needed — stable role+name |
| Name field | `page.getByRole('textbox', { name: 'Name *' })` | none needed |
| Description field | `page.getByRole('textbox', { name: 'Description *' })` | none needed |
| Tags input | `page.getByRole('combobox', { name: 'Tags' })` — MUI free-solo autocomplete; type text then press `Enter` to commit a chip (no dropdown/listbox appears) | n/a |
| Tag chip (rendered) | `page.getByRole('button', { name: '<tag-text>', exact: true })` scoped near the Tags combobox | `.MuiChip-root` containing the tag text |
| Welcome message field | `page.getByRole('textbox', { name: 'Input your welcome message' })` | none needed |
| Step limit field | `page.getByRole('textbox', { name: 'Step limit' })` — **pre-filled with `"25"` by default; use `.fill()`, not `.type()`** | none needed |
| Save button (create form) | `page.getByRole('button', { name: 'Save' })` | none needed |
| Pipeline detail overflow ("kebab") menu button | `page.locator('#undefined-action')` — **the button's real `id` attribute literally renders as the string `"undefined-action"`**, confirmed via direct `el.id` evaluation on pipeline id 363; no accessible name either (`aria-label` is `null`), so no role/name locator can target it — same defect as GH#33 (Agent detail page), cross-module-confirmed | positional: the icon-only button immediately right of the "Save"/"Save As Version"/"Discard" button group in the detail page's header |
| "Delete pipeline" menu item | `page.getByRole('menuitem', { name: 'Delete pipeline' })` — **do not confuse with** `page.getByRole('menuitem', { name: 'Delete' })`, which is a *disabled* item under the menu's "VERSION" section (deletes a version, not the pipeline) | n/a |
| Delete-confirmation dialog | `page.getByRole('dialog')` — **do not scope by accessible name** (`page.getByRole('dialog', { name: 'Delete confirmation' })` will not resolve; the dialog's `aria-labelledby` points at a non-existent `#alert-dialog-title`, a known shared-component defect already documented on GH#33 and cross-module-corroborated for Pipelines by TC-023) | n/a — only one dialog is ever mounted at a time |
| Delete-confirmation name field | `page.getByRole('dialog').getByRole('textbox')` | same — the input has no accessible name (`id="name"`, no label/aria-label), also already documented on GH#33 |
| Delete-confirmation submit button | `page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true })` — **disabled until the typed name exactly matches** | n/a |
| Pipeline ID / Version ID (for debugging) | visible in the detail page's "Information" section: `button "Copy ID"` (pipeline id) and `button "Copy version ID"` (version id) — useful for manual debugging, not needed by any assertion in this case | n/a |

## Network Behavior
- `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — the single-pipeline detail fetch backing this page's field population (the "W-DYN" dynamic-render behavior under test). Fires on mount of `/app/pipelines/all/{id}?viewMode=owner`. Returned `200` in every observed load against a fresh, non-forked pipeline. This is the correct wait target — `page.waitForResponse(r => r.url().includes('/application/prompt_lib/') && r.url().match(/\/application\/prompt_lib\/\d+\/\d+$/) && r.status() === 200)` — before asserting field values. Confirmed identical endpoint shape to the agents module's equivalent (`{ownerId}/{applicationId}`, e.g. `21/363`).
- `GET /api/v2/elitea_core/public_application/prompt_lib/{id}` (note: `public_application`, singular-path variant, NOT the same endpoint as above) — fires instead of the correct endpoint when `viewMode=owner` is **absent** from the URL, and returns `400` for a private/owner-only pipeline, producing the "Page not found" client-side error page. This is the mechanism behind Known Defects Finding 1 below — confirms `viewMode=owner` is not cosmetic for Pipelines either, exactly mirroring the Agents finding.
- `GET /api/v2/elitea_core/application_skills/prompt_lib/{ownerId}/{versionId}` — fires alongside the main detail fetch; not otherwise relevant to this case's assertions.
- `GET /api/v2/elitea_core/pipeline_trigger/prompt_lib/{ownerId}/pipeline/{versionId}/trigger` — pipeline-specific (no agents-module equivalent), fires on mount; not relevant to this case's field assertions.
- **Out-of-scope observation** (do not action for this case, see Axis 2): on a pre-existing **forked** pipeline only, opening the detail page in owner mode also fires `PUT /api/v2/elitea_core/version/prompt_lib/{ownerId}/{applicationId}/{versionId}` (201, creates a new draft version as a side effect of merely viewing) followed by `GET .../version_validator/prompt_lib/{ownerId}/{applicationId}/{versionId}` (400, toolkit-config validation failure specific to that pipeline's fork chain). Did not occur for this case's own non-forked fixture. Flagged for awareness of any other pipelines-module case that opens a forked pipeline.
- No `POST`/`PUT` traffic assertions are needed for this case's own fixture — creation (Setup) and deletion (Teardown) are both out of this case's own Expected Results scope; only the read/display behavior on the detail page is under test per the case's title.

## Known Defects Found During Exploration

**No blocking product defects found.** Case-authoring inaccuracies (CLARIFICATION, not a product bug — reverse-masking guard applies, the live app is correct and self-consistent) — identical drift pattern to the agents module's equivalent case (TC-016), now corroborated for a second entity type:

- **[INFO / CLARIFICATION]** Case step 1's URL pattern `/app/pipelines/{id}` does not resolve to a detail page at all (client-side redirects to `/app/pipelines/all` when the `all/` segment is missing; 404s with a backend `400` from `public_application/prompt_lib/{id}` when the segment is present but `viewMode=owner` is missing). The Teardown's "click Confirm" instruction also does not match the live confirmation dialog (button is labelled "Delete" and stays disabled until the pipeline's exact name is typed into an adjacent, unlabeled field). **This is the same underlying case-authoring drift already tracked on [`GH#28`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/28)** (originally filed by TC-011 for Agents, already cross-module-corroborated for the delete-confirmation-dialog half by TC-020 and TC-023). This AFS is the **first pipelines-module analysis to specifically re-verify the bare-URL-shape half** of that finding — corroborated in a comment on GH#28 (traced the same `public_application/prompt_lib` → `400` mechanism, confirming `viewMode=owner` is functionally required for Pipelines too, not just Agents). No new ticket filed.
- **[INFO]** The pipeline detail page's overflow-menu ("kebab") button renders with a literal, broken `id="undefined-action"` and carries no accessible name — identical to the Agent detail page defect already filed as [`GH#33`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/33) and already cross-module-corroborated for Pipelines by TC-023 (which also independently confirmed the dialog's broken `aria-labelledby` and the unlabeled confirm-name textbox on this same page). Confirmed again here on a third pipeline id (363) — no new comment added to GH#33 since TC-023's corroboration already fully covers this exact page/finding with no new information to add.
- **Filing status**: no new tickets filed by this AFS. One corroborating comment added to `GH#28` (URL-shape drift, first for the pipelines module). `GH#33`'s pipeline-side corroboration by TC-023 already covers the kebab-button/dialog-labelling findings independently confirmed here — deliberately not duplicated per this project's "check comments before filing" convention (5+ prior near-misses in the agents module from title-only searches).
- Recommendation for the automation engineer: implement against the corrected URL/handles in this AFS's § Test Steps and § Concrete Handles directly — no `expect.soft()` workaround is needed since the case text has already been re-authored here, not just annotated.

## Blocked Steps
None. All Setup steps and all 9 case Steps (decomposed into 16 AFS steps) plus the full Teardown were executed end-to-end against the live system, including creating, verifying, and deleting a real throwaway pipeline (id `363` at exploration time — not stable across runs, do not hardcode).

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — this case joins `tests/pipelines.spec.ts` (module: pipelines, per `.agents/testing.md` § Structure "Growing past smoke" plan), batched with the rest of TC-020..029 in one PR.
- Page object: check sibling AFS files in this same batch (`test-specs/pipelines/l1_create-pipeline-minimal_TC-020.md`, `l2_edit-existing-pipeline_TC-022.md`, `l2_delete-pipeline_TC-023.md`, `l2_form-validation-required-fields_TC-024.md`, `l3_cancel-button-behavior_TC-025.md`) before hardcoding duplicate locators — the create/edit form fields (Name/Description/Tags/Welcome-message/Step-limit, Save button, create→detail URL transition) are shared surface across this whole module, same as agents' `agentForm.page.ts` precedent. `.agents/testing.md` predicts a `pipelineForm.page.ts` (or a shared `entityForm.page.ts` parametrized across agents/pipelines) for exactly this reuse.
- Serial vs parallel: per `.agents/testing.md` § Structure, pipelines-module cases are **not** assumed serial by default. This case is fully self-contained (creates its own fixture, cleans it up) — safe to run in parallel with sibling pipelines-module tests, provided the generated pipeline name includes a run-unique timestamp (already specified in § Test Data) so two parallel runs of *this same test* don't collide on name/tag assertions.
- Wait strategy: **no `waitForTimeout` anywhere in this spec** — the case's own "wait for page to fully load (2-3 seconds)" (step 2) has been re-authored into a `waitForResponse` on `/api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` (200) followed by web-first `expect(...).toHaveValue(...)` assertions, which auto-retry through the brief async-render gap without any fixed sleep.
- **Do not reuse `application_id=3` ("Analyze GitHub Issues") or any other pre-existing forked pipeline as a read-only fixture for future pipelines-module cases** without first accounting for the auto-draft-version-creation + `beforeunload` dialog side effect documented in § Network Behavior / Axis 2 above — it is safe to *view* a fresh, non-forked pipeline read-only, but not a forked one.
- **Analyst execution note (process/tooling, not a product or spec issue):** this exploration ran in a dedicated, isolated `playwright-cli -s=TC026` browser session (own in-memory Chrome profile, own port) specifically to avoid the shared-MCP-browser cross-talk documented in `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md` (this AFS was authored while 9 sibling analysts, TC-020..025/TC-027..029, were dispatched in parallel against the same account). Confirmed isolated throughout: fresh navigation to `/app/chat/` at session start correctly bounced to the Keycloak login page (no inherited cookies), `window.location.href`/page-title were re-verified after every navigation with no cross-talk observed, and a sibling's own in-flight fixture pipeline (`TC022_Edit_027167287`, visible in the shared account's pipeline list) was deliberately left untouched throughout this session per the data-collision guard. Before committing to a throwaway fixture, a cheap **read-only pre-check** was run first against a pre-existing baseline pipeline ("Analyze GitHub Issues", id 3) purely to confirm the `/app/pipelines/all/{id}?viewMode=owner` URL-pattern hypothesis — this incidentally surfaced the forked-pipeline auto-draft-version side effect documented above, which is unrelated to this case's own pass/fail but worth the module's awareness. This does not affect the correctness of the eventual automated Playwright suite, since `npx playwright test` gives each worker its own isolated browser context independent of this analysis session's tooling.
