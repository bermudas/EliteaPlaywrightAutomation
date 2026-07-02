# Test Case: Agent Create Form — Required-Field Validation Gates Save

## Metadata
- **TMS ID**: TC-014
- **Linked Story**: GH#21 (case tracking issue), parent epic GH#16
- **Priority**: l2
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`)
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via `GET ${BASE_URL}/app/chat/` not redirecting to a login page
- Browser viewport maximized (case's own Setup step 1) — explored at 1920×1080
- Account has existing agents (baseline data, per `.agents/profile.md` — not relevant to this case's assertions since the Create form is reached directly)

## Test Data
### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — standard smoke/regression account

### Must Generate (in test setup)
- Unique agent Name, e.g. `` `TC014_${Date.now()}` `` — **must stay ≤ 32 characters**. Confirmed via `Name *` input's `maxlength="32"` HTML attribute (silent truncation, not a validation error): the case's own suggested template `` `TEST_Agent_Validation_${timestamp}` `` is **22 chars of literal prefix + a 13-digit ms timestamp = 35 chars**, which **exceeds the field's limit by 3** and gets silently truncated from the right — i.e. the *most-varying* trailing digits of the timestamp are the ones cut off, which is exactly the wrong end to lose for uniqueness. **Automation must use a shorter prefix** (e.g. `TC014_` — 6 chars — leaves 26 chars for the full 13-digit ms timestamp with room to spare) rather than the case's literal template.
- Description text, e.g. `Description for validation test` (32 chars — comfortably inside the `Description *` field's `maxlength="2304"`, no truncation risk)

### Must Clean Up (in teardown)
- None. The form must never reach a saved state — confirmed via the account's network log for the full exploration session: **no `POST` request to any agent-create endpoint fired at any point** (only `GET .../applications/prompt_lib/**` list/count reads and unrelated analytics/socket.io traffic). The form is closed via Cancel → confirm-discard (case's own Teardown) whenever it holds a dirty value, or by direct navigation away when it's still pristine (see Test Steps note on the Cancel button's dirty-state gating).

## Test Steps
1. Navigate to `${BASE_URL}/app/agents/all`
   - **Verify**: page loads, URL is `${BASE_URL}/app/agents/all`
2. Wait for the agents list to finish its initial lazy-load — condition wait (network-idle / first-card-visible), not a fixed 10s sleep (`.agents/testing.md` § Conventions bans `waitForTimeout`)
   - **Verify**: at least one `.MuiCard-root` visible inside `#EliteACustomTabPanel`
3. Dismiss any blocking overlay if present
   - **Note**: on this run, the only overlay encountered was a **dismissible release-notes banner** ("Announcing ELITEA 2.0.4!", `button "close"`) on the Chat landing page prior to navigating to Agents — not a true blocking modal on the Agents page itself. No modal was observed on `/app/agents/all` in this session; keep the dismiss-if-present check defensive, don't assert its presence.
4. Click the agent-creation trigger in the left sidebar
   - **Handle** (re-authored — case-text drift, same pattern as TC-002's GH#9): the case says `"Create Agent" button`; the live control's accessible name is **`"Agent"`** (`getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Agent', exact: true })`), not `"Create Agent"`. No `[aria-label*="Create"]` exists in the DOM.
   - **Verify**: navigates to `${BASE_URL}/app/agents/create?viewMode=owner`
5. Verify "Save" button state on the freshly-opened, pristine form
   - **Verify**: `button "Save"` has the `disabled` attribute
   - **Additional observation (Axis 2)**: `button "Cancel"` is **also disabled** in this pristine (untouched, no field has ever held a value) state — the Cancel button's enablement tracks form *dirtiness*, not just "form is open." This matters for automation: if a test flow ever returns the form to a fully pristine state (e.g. fills then clears every field) and then tries to click Cancel to close, it must be re-verified enabled first, or the implementer should navigate away directly instead.
6. Fill `textbox "Name *"` with the generated unique Name (≤32 chars — see Test Data)
   - **Verify**: `Name *` field contains the value (subject to `maxlength=32` truncation if the value is generated too long — see Test Data)
   - **Verify**: `Save` remains disabled (Description is still empty); `Cancel` becomes **enabled** now that the form is dirty
7. Clear `textbox "Name *"`
   - **Verify**: Name field is empty; a field-level error appears once the field is blurred-empty: `paragraph` with text **"Name is required"**, class `Mui-error` (MUI `FormHelperText`, `Mui-required`) — confirmed handle for asserting inline validation copy, not just Save-button state
8. Fill `textbox "Description *"` with the test description
   - **Verify**: Description field contains the value; `Save` remains disabled (Name is now empty)
9. Fill `textbox "Name *"` again with the generated unique Name
   - **Verify**: both required fields hold non-empty values
10. Verify "Save" button state
    - **Verify**: `button "Save"` no longer has the `disabled` attribute (clickable)
11. Close the form without saving (Teardown)
    - Click `button "Cancel"` (now enabled — form is dirty)
    - A confirm-discard dialog appears: `dialog` with heading "Warning Close", body text "Are you sure you want to discard changes?", buttons `"Cancel"` / `"Discard"`
    - Click `button "Discard"`
    - **Verify**: navigates back to `${BASE_URL}/app/agents/all`; no new agent card with the generated Name appears in the list; no `POST` create-agent request was ever sent

## Expected Results
- `Save` is disabled whenever `Name *` or `Description *` (or both) hold an empty string; `Save` is enabled only once both hold a non-empty string
- `Cancel` is disabled only in the fully pristine (never-touched) state; becomes enabled as soon as any field holds a value
- Field-level inline errors ("Name is required" / "Description is required", `Mui-error` class) appear under each required field once it has been touched-then-left-empty (blur triggers the message; simply being empty from the start does not show the message until touched)
- No console errors during any step
- No agent-create `POST` request fires unless Save is explicitly clicked (never done in this case)
- Form remains at `${BASE_URL}/app/agents/create?viewMode=owner` throughout steps 5–10 (never navigates away until the deliberate Cancel/Discard in step 11)

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Setup 1: maximize browser window | all UI elements visible | precondition | viewport set 1920×1080 before navigation | asserted |
| Setup 2: verify authenticated state via `/app/chat/` | no redirect to login = authenticated | precondition | confirmed pre-navigation: no redirect | asserted |
| 1 Navigate to `/app/agents/all` | Agent list page loads | step 1 | step 1: URL check | asserted |
| 2 Wait 10s for lazy loading | all agent cards visible | step 2 | step 2: condition wait, first card visible | asserted *(re-authored: condition wait, not fixed sleep — see `.agents/testing.md` § Conventions)* |
| 3 Close any modal dialogs if present | modal dismissed | step 3 | step 3: defensive check | asserted *(no modal observed on this page this run; check kept defensive)* |
| 4 Click "Create Agent" button in left sidebar | form opens at `/app/agents/create?viewMode=owner` | step 4 | step 4: URL check | asserted *(re-authored: live control's accessible name is "Agent", not "Create Agent" — case-text drift, see Known Defects)* |
| 5 Verify Save disabled (no fields filled) | Save disabled | step 5 | step 5: `disabled` attribute check | asserted |
| 6 Fill Name | Name field contains value | step 6 | step 6: value check | asserted |
| 7 Verify Save still disabled (Description empty) | Save disabled | step 6 | step 6: `disabled` attribute check | asserted |
| 8 Clear Name field | Name field empty | step 7 | step 7: value + error-message check | asserted *(enriched: also asserts the "Name is required" inline error, not in case text)* |
| 9 Fill Description | Description field contains value | step 8 | step 8: value check | asserted |
| 10 Verify Save still disabled (Name empty) | Save disabled | step 8 | step 8: `disabled` attribute check | asserted |
| 11 Fill Name again | both required fields filled | step 9 | step 9: value check | asserted |
| 12 Verify Save enabled | Save button active/clickable | step 10 | step 10: `disabled` attribute absent | asserted |
| Expected Final State: Save disabled/enabled per required-field presence; form still open at create URL | as described | steps 5–10 | throughout | asserted |
| Teardown: Click Cancel to close without saving | form closes | step 11 | step 11: Cancel click | asserted |
| Teardown: Confirm discard changes if modal appears | modal confirmed | step 11 | step 11: Discard click on confirm-discard dialog | asserted |

### Axis 2 — Analyst additions
- Step 5 asserts `Cancel` is **disabled** in the pristine state, and step 6 asserts it becomes **enabled** once the form is dirty — *added: discovered while exploring; not in the case text, but directly affects whether the case's own Teardown step ("click Cancel") is reliable, so it's promoted to an explicit assertion rather than an incidental note.*
- Step 7 asserts the inline "Name is required" error text (`Mui-error` class) appears on blur-empty, and the AFS separately confirms the symmetric "Description is required" message exists for the Description field (verified in a second pass, not itself a numbered case step) — *added: the dispatch explicitly asked for "the more thorough validation pass" beyond Save-button-only gating (error message copy, field-level error styling), and the case's own Expected Results never mention inline error text at all.*
- Test Data flags the `maxlength=32` truncation risk in the case's own suggested Name template — *added: silent truncation of the case's literal `${timestamp}` pattern would cut the most-significant trailing digits, a real uniqueness/collision risk for automation if implemented literally.*
- Expected Results adds "no console errors during any step" and "no agent-create POST fires" — *added: verified clean throughout exploration (0 console errors; full network log audited, zero create-agent POSTs); guards a silent regression the case's own steps don't check for.*
- (Nothing else added beyond the case.)

## Cleanup
1. Click `Cancel` (only valid when the form is dirty — see step 5/6 note) → confirm `Discard` on the resulting dialog
2. If the form were ever left in a state where `Cancel` is disabled (fully pristine again), navigate away directly (`page.goto('${BASE_URL}/app/agents/all')`) instead of trying to click a disabled Cancel
3. Verify (defense in depth, not required by the case but cheap insurance): no card with the generated test Name appears in the Agents list, and no `POST` to the create-agent endpoint was ever observed in the network log

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Agent-creation trigger (sidebar) | `page.getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Agent', exact: true })` | none needed — accessible name is stable and unique in the sidebar |
| Name field | `page.getByRole('textbox', { name: 'Name *' })` | none needed |
| Description field | `page.getByRole('textbox', { name: 'Description *' })` | none needed |
| Save button | `page.getByRole('button', { name: 'Save' })` — assert via `.isDisabled()` / `toBeDisabled()` / `toBeEnabled()` | none needed |
| Cancel button (footer, closes form) | `page.getByRole('button', { name: 'Cancel', exact: true }).first()` — scope to the form header/footer bar, NOT the confirm-discard dialog's own "Cancel" button (both share the accessible name "Cancel" — see next row) | Scope with `page.locator('main')` ancestor if `exact` name collision with the dialog becomes flaky |
| Confirm-discard dialog | `page.getByRole('dialog').filter({ hasText: 'Are you sure you want to discard changes?' })` | `page.getByRole('heading', { name: 'Warning Close' })` |
| Confirm-discard dialog's "Discard" button | `page.getByRole('dialog').getByRole('button', { name: 'Discard' })` | none needed |
| Name field inline error | `page.getByText('Name is required')` (MUI `FormHelperText`, class includes `Mui-error`) | `page.locator('.Mui-error').filter({ hasText: 'Name is required' })` |
| Description field inline error | `page.getByText('Description is required')` (same MUI pattern) | `page.locator('.Mui-error').filter({ hasText: 'Description is required' })` |
| Name field max length | HTML attribute `maxlength="32"` on the Name input — `expect(await nameInput.getAttribute('maxlength')).toBe('32')` if asserting the constraint itself | n/a |

## Network Behavior
- No `POST` to any agent-create endpoint fires at any point in this case — Save is never clicked. Confirmed via full network-log audit at the end of exploration (only `GET .../applications/prompt_lib/**` list/count reads, `socket.io` polling, and analytics `POST`s to `google-analytics.com` were observed).
- `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?...` — same paginated list-read pattern as TC-003; fires on landing on `/app/agents/all` both before entering and after Cancel/Discard returns to the list. Not otherwise relevant to this case's assertions.

## Known Defects Found During Exploration
- **[MINOR]** Required-field validation on the Agent create form accepts whitespace-only values for both `Name *` and `Description *` — the Save-button gate is a raw truthiness/length check on the untrimmed input value, not a "has real content" check. Confirmed independently for both fields: filling either required field with `"   "` (3 spaces) while the other field holds a valid value leaves `Save` **enabled**. Filed as [`GH#29`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/29), referencing this case and linked to parent epic GH#16.
  - **Automation guidance**: do not assert this as a hard pass/fail inside the main TC-014 flow (it's outside the case's own literal steps and asserting it here would conflate two different behaviors). If the implementer wants a regression guard, add it as a **separate** `test.step()` / soft assertion annotated `// Known defect: GH#29`, so a future fix is caught without blocking this case's own green run today.
- **[INFO / CLARIFICATION]** Case step 4 says `"Create Agent" button`; the live control's accessible name is `"Agent"` — same case-text-drift pattern already seen in TC-002 (GH#9). Not filed as a separate ticket (low-value duplicate of an already-established pattern); re-authored directly into this AFS's step 4 and Concrete Handles.

## Blocked Steps
None. All 12 case steps plus both Setup steps and the Teardown were executed end-to-end against the live system, including a symmetric verification pass on the Description field's inline error message (not itself a numbered case step, but within the case's own "more thorough validation" intent).

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — this case belongs in `tests/agents.spec.ts` alongside the rest of the `agents` module (TC-010..019), per `.agents/testing.md` § Structure's module-batching plan. Per `.agents/testing.md` § Structure, `mode: 'serial'` is **not** assumed for this module by default — TC-014 as explored here has no dependency on another agents-module case's end-state (it opens the create form fresh via direct navigation each time and cleans up after itself), so it can run independently/in parallel with sibling agents-module tests unless the implementer finds a shared-state reason otherwise during Phase 1 Absorb.
- Page object: a `tests/pages/agentForm.page.ts` is anticipated per `.agents/testing.md` § Structure ("New page objects expected... likely reusable for pipelines' near-identical form"). This case's handles (Name/Description fields, Save/Cancel buttons, confirm-discard dialog) are exactly the shape that page object should wrap — implement/extend it here rather than inlining raw locators in the spec, especially since the Cancel-button ambiguity (shared accessible name with the dialog's own Cancel) is easy to get wrong twice if left un-encapsulated.
- Wait strategy: no `waitForTimeout` — gate on `toBeVisible()`/`toBeDisabled()`/`toBeEnabled()` web-first assertions and on the list page's network response, consistent with `.agents/testing.md` § Conventions.
- Test data generation: use a short prefix (`TC014_` or similar) + `Date.now()` for the unique Name — see Test Data section for why the case's literal template overflows the field's `maxlength=32`.
