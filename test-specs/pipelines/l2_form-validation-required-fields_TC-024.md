# Test Case: Pipeline Create Form — Required-Field Validation Gates Save

## Metadata
- **TMS ID**: TC-024
- **Linked Story**: GH#49 (case tracking issue), parent epic GH#16
- **Priority**: l2
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`)
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via `GET ${BASE_URL}/app/chat/` not redirecting to a login page
- Browser viewport maximized (case's own Setup step 1) — explored at 1920×1080
- Account has at least one existing pipeline (baseline data — confirmed live: exactly 1 pipeline, "Analyze GitHub Issues", under the default project scope; not relevant to this case's assertions since the Create form is reached directly). Note: `.agents/profile.md`'s "≥11 pipelines" baseline only holds under a non-default project scope — already flagged as GH#14, not re-flagged here.

## Test Data
### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — standard smoke/regression account

### Must Generate (in test setup)
- Unique pipeline Name, e.g. `` `TC024_${Date.now()}` `` — **must stay ≤ 32 characters**. Confirmed via `Name *` input's `maxlength="32"` HTML attribute (silent truncation, not a validation error) — identical constraint to the Agents form (TC-014). The case's own suggested template `` `TEST_Pipeline_Validation_${timestamp}` `` is **26 chars of literal prefix + a 13-digit ms timestamp = 39 chars**, which **exceeds the field's limit by 7** and would be silently truncated from the right — cutting the most-varying trailing digits, exactly the wrong end to lose for uniqueness. **Automation must use a shorter prefix** (e.g. `TC024_` — 6 chars — leaves 26 chars for the full 13-digit ms timestamp with room to spare) rather than the case's literal template.
- Description text, e.g. `Description for validation test` (32 chars — comfortably inside the `Description *` field's `maxlength="2304"`, confirmed identical to the Agents form, no truncation risk)

### Must Clean Up (in teardown)
- None. The form must never reach a saved state — confirmed via the account's network log for the full exploration session: **no `POST` request to any pipeline-create endpoint fired at any point** (only `GET .../applications/prompt_lib/**` and `GET .../tags/prompt_lib/**` list/count reads, `socket.io` polling, and analytics traffic to `google-analytics.com`/`google.com` were observed). The form is closed via Cancel → confirm-discard (case's own Teardown) whenever it holds a dirty value. Confirmed post-teardown: `document.body.innerText` does not contain the generated test Name, and the pipelines list still shows exactly 1 pipeline (unchanged from precondition state).

## Test Steps
1. Navigate to `${BASE_URL}/app/pipelines/all`
   - **Verify**: page loads, URL is `${BASE_URL}/app/pipelines/all`
2. Wait for the pipelines list to finish its initial lazy-load — condition wait (network-idle / first-card-visible / the "Pipelines: N" count element resolving), not a fixed 10s sleep (`.agents/testing.md` § Conventions bans `waitForTimeout`)
   - **Verify**: `tabpanel` content is rendered inside the pipelines tab; the "Pipelines: N" summary text resolves to a number
3. Dismiss any blocking overlay if present
   - **Handle**: the same dismissible release-notes banner as the Agents/Chat pages ("Announcing ELITEA 2.0.4!", `button "close"`) renders on `/app/pipelines/all` too — confirmed present this run (unlike the Agents-module TC-014 exploration, where it was only observed on Chat). Dismiss defensively; not a true blocking modal (page underneath is still interactive).
4. Click the pipeline-creation trigger in the left sidebar
   - **Handle** (re-authored — case-text drift, same pattern as TC-014's Agent-form finding and TC-002's GH#9): the case says `"Create Pipeline" button`; the live control's accessible name is **`"Pipeline"`** (`getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Pipeline', exact: true })`), not `"Create Pipeline"`. No `[aria-label*="Create"]` exists in the DOM — this is the identical sidebar toolbar control pattern as the Agents form's `"Agent"` button.
   - **Verify**: navigates to `${BASE_URL}/app/pipelines/create?viewMode=owner`
5. Verify "Save" button state on the freshly-opened, pristine form
   - **Verify**: `button "Save"` has the `disabled` attribute
   - **Additional observation (Axis 2)**: `button "Cancel"` is **also disabled** in this pristine (untouched, no field has ever held a value) state — identical dirty-state gating behavior to the Agents form (TC-014). Confirmed twice in this session: once on initial form load, and again after filling then fully clearing the Name field (returns to fully-pristine → Cancel re-disables). Automation must not assume Cancel is always clickable to close the form; re-verify enabled first, or navigate away directly if the form is pristine.
6. Fill `textbox "Name *"` with the generated unique Name (≤32 chars — see Test Data)
   - **Verify**: `Name *` field contains the value (subject to `maxlength=32` truncation if the value is generated too long — see Test Data)
   - **Verify**: `Save` remains disabled (Description is still empty); `Cancel` becomes **enabled** now that the form is dirty
7. Clear `textbox "Name *"`, then blur it (click into `Description *`)
   - **Verify**: Name field is empty; a field-level error appears once the field is blurred-empty: `paragraph` with text **"Name is required"**, class `MuiFormHelperText-root Mui-error MuiFormHelperText-sizeMedium Mui-required` (MUI `FormHelperText`) — confirmed handle for asserting inline validation copy, not just Save-button state. Also confirmed: `Cancel` re-disables if the field is cleared back to a fully-pristine form (see step 5 note) — not applicable here since Description gets filled next, keeping the form dirty.
8. Fill `textbox "Description *"` with the test description
   - **Verify**: Description field contains the value; `Save` remains disabled (Name is now empty)
9. Fill `textbox "Name *"` again with the generated unique Name
   - **Verify**: both required fields hold non-empty values
10. Verify "Save" button state
    - **Verify**: `button "Save"` no longer has the `disabled` attribute (`el.disabled === false`, clickable)
11. Close the form without saving (Teardown)
    - Click `button "Cancel"` (now enabled — form is dirty)
    - A confirm-discard dialog appears: `dialog` with heading "Warning Close", body text "Are you sure you want to discard changes?", buttons `"Cancel"` / `"Discard"` — byte-for-byte identical component to the Agents form's discard dialog
    - Click `button "Discard"`
    - **Verify**: navigates back to `${BASE_URL}/app/pipelines/all`; no new pipeline card with the generated Name appears in the list; no `POST` create-pipeline request was ever sent

## Expected Results
- `Save` is disabled whenever `Name *` or `Description *` (or both) hold an empty string; `Save` is enabled only once both hold a non-empty string
- `Cancel` is disabled only in the fully pristine (never-touched, or returned-to-pristine) state; becomes enabled as soon as any field holds a value
- Field-level inline errors ("Name is required" / "Description is required", `Mui-error` class) appear under each required field once it has been touched-then-left-empty (blur triggers the message; simply being empty from the start does not show the message until touched)
- No console errors during any step (confirmed: 0 errors, 0 warnings for the full session)
- No pipeline-create `POST` request fires unless Save is explicitly clicked (never done in this case)
- Form remains at `${BASE_URL}/app/pipelines/create?viewMode=owner` throughout steps 5–10 (never navigates away until the deliberate Cancel/Discard in step 11)

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Setup 1: maximize browser window | all UI elements visible | precondition | viewport set 1920×1080 before navigation | asserted |
| Setup 2: verify authenticated state via `/app/chat/` | no redirect to login = authenticated | precondition | confirmed pre-navigation: no redirect | asserted |
| 1 Navigate to `/app/pipelines/all` | Pipeline list page loads | step 1 | step 1: URL check | asserted |
| 2 Wait 10s for lazy loading | all pipeline cards visible | step 2 | step 2: condition wait, "Pipelines: N" count resolves | asserted *(re-authored: condition wait, not fixed sleep — see `.agents/testing.md` § Conventions)* |
| 3 Close any modal dialogs if present | modal dismissed | step 3 | step 3: release-notes banner dismissed | asserted *(banner WAS observed present on this page this run, unlike the Agents-module equivalent — see step 3 handle note)* |
| 4 Click "Create Pipeline" button in left sidebar | form opens at `/app/pipelines/create?viewMode=owner` | step 4 | step 4: URL check | asserted *(re-authored: live control's accessible name is "Pipeline", not "Create Pipeline" — case-text drift, see Known Defects/Clarifications)* |
| 5 Verify Save disabled (no fields filled) | Save disabled | step 5 | step 5: `disabled` attribute check | asserted |
| 6 Fill Name | Name field contains value | step 6 | step 6: value check | asserted |
| 7 Verify Save still disabled (Description empty) | Save disabled | step 6 | step 6: `disabled` attribute check | asserted |
| 8 Clear Name field | Name field empty | step 7 | step 7: value + error-message check | asserted *(enriched: also asserts the "Name is required" inline error, not in case text)* |
| 9 Fill Description | Description field contains value | step 8 | step 8: value check | asserted |
| 10 Verify Save still disabled (Name empty) | Save disabled | step 8 | step 8: `disabled` attribute check | asserted |
| 11 Fill Name again | both required fields filled | step 9 | step 9: value check | asserted |
| 12 Verify Save enabled | Save button active/clickable | step 10 | step 10: `disabled` attribute absent, `el.disabled === false` | asserted |
| Expected Final State: Save disabled/enabled per required-field presence; form still open at create URL | as described | steps 5–10 | throughout | asserted |
| Teardown: Click Cancel to close the form without saving | form closes | step 11 | step 11: Cancel click | asserted |
| Teardown: Confirm discard changes if modal appears | modal confirmed | step 11 | step 11: Discard click on confirm-discard dialog | asserted |

### Axis 2 — Analyst additions
- Step 5 asserts `Cancel` is **disabled** in the pristine state, and step 6 asserts it becomes **enabled** once the form is dirty — *added: same discovery as TC-014 on the Agents form; not in the case text, but directly affects whether the case's own Teardown step ("click Cancel") is reliable, so it's promoted to an explicit assertion. Re-confirmed on this form independently rather than assumed from the sibling case.*
- Step 7 asserts the inline "Name is required" error text (`Mui-error` class) appears on blur-empty — *added: verified live on the Pipeline form (byte-for-byte same MUI `FormHelperText` classes as the Agents form); the case's own Expected Results never mention inline error text at all.*
- **Whitespace-only required-field bypass, tested and corroborated as a known defect (not re-filed — see Known Defects Found)** — *added: dispatch explicitly asked to verify whether TC-014's GH#29 finding (Agent form accepts whitespace-only required values) reproduces on the Pipeline form. Confirmed independently in both directions: `Name *` = `"   "` + valid Description → Save stays enabled; valid Name + `Description *` = `"   "` → Save stays enabled. Not part of the case's own numbered steps; corroborated on the existing GH#29 ticket rather than treated as a new case assertion, per the dispatch's explicit "corroborate, don't re-file" instruction.*
- Expected Results adds "no console errors during any step" and "no pipeline-create POST fires" — *added: verified clean throughout exploration (0 console errors/warnings; full network log audited via `playwright-cli requests`, zero create-pipeline POSTs); guards a silent regression the case's own steps don't check for.*
- (Nothing else added beyond the case.)

## Cleanup
1. Click `Cancel` (only valid when the form is dirty — see step 5/6 note) → confirm `Discard` on the resulting "Warning Close" dialog
2. If the form were ever left in a state where `Cancel` is disabled (fully pristine again), navigate away directly (`page.goto('${BASE_URL}/app/pipelines/all')`) instead of trying to click a disabled Cancel
3. Verify (defense in depth, not required by the case but cheap insurance): no card with the generated test Name appears in the Pipelines list, and no `POST` to the create-pipeline endpoint was ever observed in the network log. Confirmed live in this session via `document.body.innerText` (Name string absent) and a full `playwright-cli requests` audit (only `GET`, `socket.io`, and analytics traffic — zero `applications/prompt_lib` `POST`).

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Pipeline-creation trigger (sidebar) | `page.getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Pipeline', exact: true })` | none needed — accessible name is stable and unique in the sidebar |
| Name field | `page.getByRole('textbox', { name: 'Name *' })` | none needed |
| Description field | `page.getByRole('textbox', { name: 'Description *' })` | none needed |
| Save button | `page.getByRole('button', { name: 'Save' })` — assert via `.isDisabled()` / `toBeDisabled()` / `toBeEnabled()`. On the create form this is unambiguous (no "Save As Version" collision like the Agents edit page, per `agentForm.page.ts`'s `saveButton` getter note) — confirmed only one "Save"-named button exists at any point on this create-only form. | none needed |
| Cancel button (footer, closes form) | `page.getByRole('button', { name: 'Cancel', exact: true }).first()` — scope to the form header/footer bar, NOT the confirm-discard dialog's own "Cancel" button (both share the accessible name "Cancel" — see next row). Identical ambiguity to the Agents form, same mitigation. | Scope with `page.locator('main')` ancestor if `exact` name collision with the dialog becomes flaky |
| Confirm-discard dialog | `page.getByRole('dialog').filter({ hasText: 'Are you sure you want to discard changes?' })` | `page.getByRole('heading', { name: 'Warning Close' })` |
| Confirm-discard dialog's "Discard" button | `page.getByRole('dialog').getByRole('button', { name: 'Discard' })` | none needed |
| Name field inline error | `page.getByText('Name is required')` (MUI `FormHelperText`, class includes `Mui-error`) | `page.locator('.Mui-error').filter({ hasText: 'Name is required' })` |
| Description field inline error | `page.getByText('Description is required')` (same MUI pattern; not independently re-verified this run — inferred symmetric to Name per the identical form component, consistent with TC-014's own symmetric confirmation on the Agents form) | `page.locator('.Mui-error').filter({ hasText: 'Description is required' })` |
| Name field max length | HTML attribute `maxlength="32"` on the Name input — `expect(await nameInput.getAttribute('maxlength')).toBe('32')` if asserting the constraint itself | n/a |
| Release-notes banner close button | `page.getByRole('button', { name: 'close' }).first()` — reuse `dismissAnnouncementBanner()` from `tests/pages/agentForm.page.ts` (or the shared/renamed page object, see Automation Hints) rather than re-implementing | n/a |

## Network Behavior
- No `POST` to any pipeline-create endpoint fires at any point in this case — Save is never clicked. Confirmed via full network-log audit (`playwright-cli requests`) at the end of exploration (only `GET .../applications/prompt_lib/{ownerId}?...agents_type=pipeline...` and `GET .../tags/prompt_lib/{ownerId}?...entity_coverage=pipeline` list/count reads, `socket.io` polling, and analytics `POST`s to `google-analytics.com`/`google.com` were observed).
- `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?tags=&sort_by=created_at&sort_order=desc&query=&agents_type=pipeline&limit=20&offset=0` — paginated list-read, fires on landing on `/app/pipelines/all`.
- `GET /api/v2/elitea_core/tags/prompt_lib/{ownerId}?offset=0&limit=50&entity_coverage=pipeline` — tag-list read, same page.
- Not otherwise relevant to this case's assertions.

## Known Defects Found During Exploration
- **[MINOR — CORROBORATED, not re-filed]** Required-field validation on the Pipeline create form accepts whitespace-only values for both `Name *` and `Description *`, identically to the Agents form. Confirmed independently for both fields on this form: filling either required field with `"   "` (3 spaces) while the other field holds a valid value leaves `Save` **enabled**. This is the same defect already filed as [`GH#29`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/29) against the Agents form (TC-014) — corroborated via comment on that ticket rather than re-filed, per the shared client-side validation component (`.agents/testing.md` notes the Pipeline form is "near-identical" to the Agent form).
  - **Automation guidance**: same as TC-014's own guidance — do not assert this as a hard pass/fail inside the main TC-024 flow (outside the case's own literal steps). If the implementer wants a regression guard, add it as a **separate** `test.step()` / soft assertion annotated `// Known defect: GH#29`.
- **[INFO / CLARIFICATION]** Case step 4 says `"Create Pipeline" button`; the live control's accessible name is `"Pipeline"` — same case-text-drift pattern already seen in TC-014 (Agents form) and TC-002 (GH#9). Not filed as a separate ticket (low-value duplicate of an already-established pattern); re-authored directly into this AFS's step 4 and Concrete Handles.
- **[INFO / CLARIFICATION]** Case Preconditions implicitly assume the default baseline of "≥11 pipelines" (per `.agents/profile.md`); live exploration observed exactly 1 pipeline ("Analyze GitHub Issues") under the default project scope. Already tracked as GH#14 (filed during the Pipelines-module smoke exploration) — not re-filed, and not load-bearing for this case since the Create form is reached via direct navigation regardless of list contents.

## Blocked Steps
None. All 12 case steps plus both Setup steps and the Teardown were executed end-to-end against the live system, including a whitespace-only bypass verification pass on both required fields (not itself a numbered case step, but explicitly requested by the dispatch to verify whether TC-014's known defect generalizes to this form).

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — this case belongs in `tests/pipelines.spec.ts` alongside the rest of the `pipelines` module (TC-020..029), per `.agents/testing.md` § Structure's module-batching plan. `mode: 'serial'` is **not** assumed for this module by default — TC-024 as explored here has no dependency on another pipelines-module case's end-state (it opens the create form fresh via direct navigation each time and cleans up after itself), so it can run independently/in parallel with sibling pipelines-module tests unless the implementer finds a shared-state reason otherwise during Phase 1 Absorb.
- Page object: `.agents/testing.md` anticipated `tests/pages/agentForm.page.ts` would likely be reusable for the pipelines form, suggesting a possible rename to `entityForm.page.ts`. Confirmed live in this exploration: the Pipeline create form's structure (Name/Description/Tags/Welcome message/Conversation starters/Advanced-Step limit sections, Save/Cancel button pair, identical "Warning Close" discard dialog, identical release-notes banner interception) is **structurally identical** to `AgentFormPage` — same accessible names, same MUI classes, same `maxlength` constraints. Recommend the implementer either (a) rename/generalize `agentForm.page.ts` to `entityForm.page.ts` parametrized by entity type (`agent` | `pipeline`) for the URL segments (`/app/agents/...` vs `/app/pipelines/...`), or (b) create a thin `PipelineFormPage` that composes/extends `AgentFormPage`'s logic — either avoids duplicating the whitespace-bug-prone Save-button-state assertions and the Cancel/discard-dialog handling twice.
- Wait strategy: no `waitForTimeout` — gate on `toBeVisible()`/`toBeDisabled()`/`toBeEnabled()` web-first assertions and on the list page's network response, consistent with `.agents/testing.md` § Conventions.
- Test data generation: use a short prefix (`TC024_` or similar) + `Date.now()` for the unique Name — see Test Data section for why the case's literal template overflows the field's `maxlength=32` (same failure mode as TC-014, worse overflow margin: 7 chars over vs. TC-014's 3).
