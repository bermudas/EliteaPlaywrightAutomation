# Test Case: Modal Appears During Form Fill

## Metadata
- **TMS ID**: TC-056
- **Linked Story**: GH#65 (case tracking issue), parent epic GH#16
- **Priority**: l3
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`)
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via login through Keycloak SSO (`auth.elitea.ai`), landing on `${BASE_URL}app/chat/`
- Browser viewport: explored at 1920×1080 (project-standard `chromium` viewport per `.agents/testing.md`). The case's own "browser window is maximized" precondition is a manual-execution artifact — no viewport-dependent behavior was observed in this case's flow (same conclusion as TC-010).

## Test Data
### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — standard batch account

### Must Generate (in test setup)
- Unique agent name: the case's own literal template is `TEST_Agent_Modal_Timing_${timestamp}`, but that template is **38 characters** (`TEST_Agent_Modal_Timing_` = 24 chars + a 13-digit `Date.now()` = 37–38 chars) and the Name field has a confirmed silent 32-character cap (GH#27, "Agents + Pipelines") — using the case's literal template would silently truncate the timestamp suffix, risking a name collision with a sibling parallel run. **Use the project's shared `uniqueEntityName()` helper** (`tests/fixtures/testData.ts`) with a short prefix instead: `uniqueEntityName('TC056_Modal')` → e.g. `TC056_Modal_1783057333385` (25 chars, well under the cap, still unique per-run and traceable to this case). Verified live with two independent full runs during this exploration (agent ids 449 and 450), zero truncation, zero collisions.
- Description: `Test for modal interception during form fill` (case's own literal value, 46 chars — comfortably under the Description field's much larger cap)

### Must Clean Up (in teardown)
- Delete the created agent via the UI delete flow (see § Cleanup) — this is a mutating case; matches the case's own Teardown section. Both fixture agents created during this exploration (ids 449, 450) were deleted and confirmed absent from the list before this AFS was written — nothing left behind.

## Test Steps

**IMPORTANT — read § Known Defects Found During Exploration before implementing.** The case's own step 6 offers two literal trigger mechanisms ("Open new browser tab **or** trigger modal by navigating... in same window"). Both were executed live, end-to-end, and produce **genuinely different, both-deterministic** outcomes — this AFS documents both and recommends the new-tab variant as primary. Do not implement only the literal step-by-step text without reading the branch note at step 6.

1. Navigate to `${BASE_URL}app/agents/all`
   - **Verify**: URL is `${BASE_URL}app/agents/all`; page title contains "Agents"
2. Check for a blocking `[role="dialog"]` modal and dismiss if present; separately, dismiss the non-modal "Announcing ELITEA X.X.X" release-notes banner if present (`dismissAnnouncementBanner()`, existing helper) — it is NOT a `[role="dialog"]` element and the case's own `button:has-text("Got it")` hint does not match it (its close button's accessible name is exactly `"close"`), but it must still be cleared before continuing: it's confirmed (GH#42) to intercept pointer events on the create form's Save button if left up.
   - **Verify**: no `[role="dialog"]` present on this route (confirmed: none observed here during exploration, consistent with prior modules); banner dismissed if it was present
3. Click the sidebar "Create Agent" control
   - **Handle**: `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Agent', exact: true })` — case's own "(+ icon)" hint is correct visually, but the accessible name is exactly `"Agent"`, not `"Create Agent"` (GH#30, already filed against a sibling case, corroborated here)
   - **Verify**: URL becomes `${BASE_URL}app/agents/create?viewMode=owner`
4. Locate the "Name" field
   - **Handle**: `getByRole('textbox', { name: 'Name *' })`
   - **Verify**: field is visible
5. Fill "Name" with the first 5 characters: `TEST_`
   - **Verify**: field value equals `TEST_` (read back)
6. **Trigger the modal — recommended: new-tab variant (primary).** Open a new browser tab/page in the same context and navigate it to `${BASE_URL}app/chat/all`. Do **not** navigate the original tab in-place for this step (see the same-window variant note below and GH#68 for why).
   - **Verify**: new tab's URL is `${BASE_URL}app/chat/all`; **original tab is untouched** — no navigation event fires on it
   - **Alternative (documented, not recommended as the default path): same-window navigation.** `page.goto('${BASE_URL}app/chat/all')` in the **same** tab while the form is dirty triggers a **native browser `beforeunload` confirmation dialog first** (not an app-rendered `[role="dialog"]` — Playwright surfaces this via its dialog-state API, not the DOM). The navigation promise will not resolve until this native dialog is accepted (`page.on('dialog', d => d.accept())`, registered *before* calling `goto`). Once accepted, navigation completes and the "Conversation not found" modal appears identically to the new-tab variant — but the create-form component is now **fully unmounted**, and returning to it later (step 10/11) yields a **fresh, empty** Name field (form state genuinely lost, not preserved-under-overlay). This is a legitimate, fully deterministic outcome (confirmed across a full run, agent id 449) and matches the case's own step 11 "state lost due to navigation" branch — but it cannot also satisfy step 8 (see below), since the create-agent page no longer exists in the DOM at that point. Full writeup: GH#68.
7. Wait for the "Conversation not found" modal in the tab that navigated to `/app/chat/all` (2–5s observed) and verify it is present
   - **Handle**: `page.getByRole('dialog')` (unscoped — only one dialog is ever mounted; accessible name is "Conversation not found" via its own heading) — matches the case's own `[role="dialog"]` selector
   - **Verify**: dialog visible, heading "Conversation not found", body text "The conversation you are looking for does not exist in your project or you don't have access to it. For sharing links, please use the Share option in the conversation menu.", button "Got it" present — byte-for-byte identical to TC-050's own confirmed handles (GH#59)
8. Switch back to the **original** tab (still on `/app/agents/create?viewMode=owner`, untouched) and verify the "Name" field still contains `TEST_`
   - **Verify**: field value equals `TEST_` exactly (confirmed live, twice — the original tab's React component tree is completely unaffected by navigation in an unrelated tab)
9. In the tab showing the modal, click "Got it"
   - **Handle**: `getByRole('button', { name: 'Got it' })`
   - **Verify**: modal closes (`getByRole('dialog')` count → 0). Note: clicking "Got it" redirects that tab to an arbitrary pre-existing conversation (`/app/chat/{id}?name=...`) — irrelevant to this case, that tab can be closed immediately after
10. Close the second tab (new-tab variant) — no navigation ever occurred in the original tab, so there is nothing to "navigate back" to (the case's own step 10 "if navigation occurred" condition is not met for this variant)
    - **Verify**: original tab remains on `${BASE_URL}app/agents/create?viewMode=owner`
11. Verify the "Name" field in the original tab still contains `TEST_` (the "form state was preserved" branch of the case's own step 11 — confirmed reachable and reproducible via the new-tab variant; the alternative "field is empty" branch is reachable only via the same-window variant, see step 6 note and GH#68)
    - **Verify**: field value equals `TEST_`
12. Re-fill "Name" with the full generated value (`uniqueEntityName('TC056_Modal')`, e.g. `TC056_Modal_1783057333385`)
    - **Verify**: field value equals the generated name (read back)
13. Fill "Description" with `Test for modal interception during form fill`
    - **Verify**: field value equals the description string
14. Wait for "Save" to become enabled
    - **Handle**: `getByRole('button', { name: 'Save', exact: true })` (create-page context — unique on `/app/agents/create`)
    - **Verify**: `disabled === false`
15. Click "Save"
    - **Underlying request**: `POST /api/v2/elitea_core/applications/prompt_lib/{ownerId}` → `201` on success
    - **Verify**: URL matches `${BASE_URL}app/agents/all/{id}...`; page title becomes `Agent: {name} - Private`
16. Navigate to `${BASE_URL}app/agents/all` and wait for the card grid (condition wait on the list GET response + first `.MuiCard-root` visible, not a fixed 10s sleep — the case's own "wait 10s" is a manual-execution artifact per `.agents/testing.md` § Conventions; freshly created agents sort first under `created_at desc`, so no scroll/lazy-load is actually needed)
    - **Verify**: at least one `.MuiCard-root` visible inside `#EliteACustomTabPanel`
17. Verify the new agent's card is present in the list
    - **Handle**: `#EliteACustomTabPanel .MuiCard-root` containing the generated name
    - **Verify**: exactly one card's text content includes the generated name; no console errors throughout steps 1–17; no `4xx`/`5xx` from `/api/v2/elitea_core/applications/prompt_lib/**`

## Expected Results
- Agent is successfully created despite a modal (`[role="dialog"]`, "Conversation not found") appearing during the mid-fill window — confirmed reachable via the new-tab variant with the form's in-progress data fully intact throughout
- New agent visible at `${BASE_URL}app/agents/all/{id}` immediately after Save, and subsequently in the `${BASE_URL}app/agents/all` card grid
- No console errors during the whole flow
- No `4xx`/`5xx` responses from `/api/v2/elitea_core/applications/prompt_lib/**`
- (Documented, not asserted by the primary path) if triggered instead via same-window navigation, the create form is fully unmounted and its data is genuinely lost, not preserved-under-overlay — see step 6 alternative and GH#68

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Preconditions: browser maximized | all UI elements visible | precondition | explored at project-standard 1920×1080; no viewport-dependent behavior found | asserted *(re-scoped: manual-execution artifact, per `.agents/testing.md`)* |
| Test Data: Agent name `TEST_Agent_Modal_Timing_${timestamp}` | name used for the created agent | Test Data section | — | clarification *(the case's own literal template silently truncates under the confirmed 32-char cap, GH#27 — replaced with `uniqueEntityName('TC056_Modal')`, same spirit, collision-safe, documented in § Test Data)* |
| 1 Navigate to `/app/agents/all` | agents list page loads | step 1 | step 1: URL + title | asserted |
| 2 Close any modal if present via `button:has-text("Got it")` | page is interactive | step 2 | step 2: `[role=dialog]` check + banner dismissal | asserted *(decomposed/clarified: no `[role=dialog]` was ever observed on this route; the case's own selector doesn't match the actual blocking element here, the non-modal announcement banner — GH#42 already covers that banner separately)* |
| 3 Click sidebar "Create Agent" (+ icon) | form opens at `/app/agents/create?viewMode=owner` | step 3 | step 3: URL match | asserted *(clarification: accessible name is "Agent", not "Create Agent" — GH#30, corroborated)* |
| 4 Locate "Name" field | field visible | step 4 | step 4 | asserted |
| 5 Fill "Name" with `TEST_` | field contains partial text | step 5 | step 5: value read-back | asserted |
| 6 Open new tab OR navigate same window to `/app/chat/all` to trigger modal | "Conversation not found" modal appears, intercepting form | steps 6–7 | step 7: dialog role+heading+body+button | asserted *(both literal branches executed live; new-tab chosen as primary — see step 6's own extensive note and GH#68 for the same-window branch's native-beforeunload-dialog surprise)* |
| 7 Verify modal via `[role="dialog"]` | modal overlay visible, form partially obscured | step 7 | step 7 | asserted *(clarification: under the new-tab variant the modal is in a separate tab, not literally overlaying the original tab's form — "intercepting form" only literally holds under the same-window variant, which then destroys the form instead. GH#68 details why no trigger produces "overlay atop a still-mounted, still-live form" in the live product for this page)* |
| 8 Verify "Name" field still contains `TEST_` | form data preserved during modal appearance | step 8 | step 8: value read-back in the original (untouched) tab | asserted |
| 9 Click "Got it" | modal closes | step 9 | step 9: dialog count → 0 | asserted |
| 10 Navigate back to `/app/agents/create?viewMode=owner` if navigation occurred | form visible again | step 10 | step 10 | asserted *(clarification: under the new-tab variant no navigation ever occurred in the original tab, so this step's own "if navigation occurred" condition is correctly a no-op; the case anticipates this)* |
| 11 Verify Name empty OR contains `TEST_` | form state reflects expected behavior | step 11 | step 11: value read-back — resolves to the "contains `TEST_`" branch under the new-tab variant (both branches individually confirmed reachable, see step 6 note) | asserted |
| 12 Re-fill "Name" with full value | field populated | step 12 | step 12: value read-back | asserted |
| 13 Fill "Description" | field populated | step 13 | step 13: value read-back | asserted |
| 14 Wait for Save to become enabled | Save clickable | step 14 | step 14: `disabled === false` | asserted |
| 15 Click "Save" | agent created, page redirects | step 15 | step 15: `POST .../applications/prompt_lib/{id}` → `201`, URL/title change | asserted |
| 16 Navigate to `/app/agents/all`, wait 10s for lazy load | agents list displays | step 16 | step 16: condition wait, not fixed sleep | asserted *(re-authored per `.agents/testing.md` § Conventions)* |
| 17 Verify new agent appears in list | agent saved despite modal interruption | step 17 | step 17: card text-content match | asserted |
| Expected Final State: agent created despite modal, data preserved or re-entered | agent exists in list | steps 8–17 | steps 8–17 | asserted |
| Teardown: navigate to detail, delete via 3-dot menu + confirm, verify removed | agent removed from list | Cleanup steps 1–5 | Cleanup steps 1–5 | asserted *(decomposed — same broken `id="undefined-action"` menu button (GH#33) and type-to-confirm delete dialog (GH#28/#32) already documented by the agents module; corroborated identical here on both fixture agents, ids 449 and 450)* |

### Axis 2 — Analyst additions
- Steps 6–11 assert **both** of the case's own two literal trigger mechanisms end-to-end (new-tab AND same-window), not just one — *added: the case's step 6 offers a real choice ("open new tab **or** navigate same window") and the two options produce meaningfully different, non-interchangeable outcomes for this specific app (one preserves form state, one destroys it via a native browser dialog neither the case nor any prior module case documents). Picking only one without investigating the other would have missed the native-`beforeunload`-dialog finding (GH#68) entirely.*
- Step 2 explicitly asserts the announcement banner (non-modal) is a *different* element from any `[role="dialog"]` modal, and must still be dismissed for a different reason (GH#42's pointer-interception on Save) — *added: without this, an implementer following the case's literal `button:has-text("Got it")` hint would silently no-op on this page (that button never appears here) and could later see a flaky, unexplained Save-click failure.*
- Step 17 / Expected Results assert "no console errors" and "no 4xx/5xx" across the whole flow — *added: verified clean across two independent full runs (0 console errors both times); guards a silent regression the case's own steps don't check for.*
- (Nothing else added beyond the case.)

## Cleanup
1. From the agent's detail page (`${BASE_URL}app/agents/all/{id}?viewMode=owner`), click the (unnamed, `id="undefined-action"`) three-dot "more actions" button — confirmed live on both fixture agents (ids 449, 450); scope by DOM adjacency to the Save/Save As Version/Discard button group if the literal id ever changes
2. In the opened menu, under "AGENT" (not "VERSION" — that section's own "Delete" item is disabled), click "Delete agent"
3. In the "Delete confirmation" modal, type the agent's exact current name into the dialog's sole (unlabeled) textbox
4. Click "Delete" (enabled only once the typed name exactly matches)
5. Verify: `DELETE /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` → `204`; navigate to `${BASE_URL}app/agents/all` and confirm no card matches the deleted agent's name

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Sidebar "Create Agent" control | `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Agent', exact: true })` | none needed — confirmed unique |
| Name input | `getByRole('textbox', { name: 'Name *' })` | `input[name="name"]` (native `maxLength="32"`, GH#27) |
| Description input | `getByRole('textbox', { name: 'Description *' })` | `textarea` in the container following Name |
| Save button (create form) | `getByRole('button', { name: 'Save', exact: true })` | none needed — unique on `/app/agents/create` |
| Announcement banner close button | `getByRole('button', { name: 'close' }).first()` (existing `dismissAnnouncementBanner()` helper in `tests/pages/entityForm.page.ts`) | none needed |
| "Conversation not found" modal | `getByRole('dialog')` (unscoped — only one dialog ever mounted; matches the case's own `[role="dialog"]`) | `getByRole('dialog', { name: 'Conversation not found' })` — has an accessible name via its own heading |
| Modal "Got it" button | `getByRole('button', { name: 'Got it' })` | scoped: `dialog.getByRole('button', { name: 'Got it' })` |
| Agent card grid (list) | `#EliteACustomTabPanel .MuiCard-root` (confirmed handle, TC-003/TC-010) | `#EliteACustomTabPanel .MuiCardContent-root` |
| Three-dot "more actions" menu button (detail page) | `page.locator('#undefined-action')` (confirmed live, both fixture agents) | DOM-adjacency: the button immediately following the Save/Save As Version/Discard group |
| "Delete agent" menu item | `getByRole('menuitem', { name: 'Delete agent', exact: true })` | none needed |
| Delete-confirmation modal | `getByRole('dialog').filter({ hasText: 'Delete confirmation' })` (unscoped by name — `aria-labelledby` points at a non-existent id, GH#33) | `.MuiDialog-root` filtered by text |
| Delete-confirmation "Delete" button | `dialog.getByRole('button', { name: 'Delete', exact: true })` | none needed — starts disabled |
| Native `beforeunload` dialog (same-window variant only) | `page.on('dialog', d => d.accept())` registered before the `goto()` call — **not** a DOM element, cannot be located via any `getBy*` API | n/a — this is Playwright's own dialog-state API, not a page selector |

## Network Behavior
- `POST /api/v2/elitea_core/applications/prompt_lib/{ownerId}` — fires on Save click, `201` on success (confirmed both fixture runs, ids 449/450)
- `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — fires once on landing on the detail page post-redirect, `200`
- `DELETE /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — fires on confirmed delete, `204` on success (confirmed both fixture runs)
- No network traffic is directly tied to the "Conversation not found" modal's *appearance* beyond the normal `/app/chat/all` page-load requests already documented by TC-050 (GH#59) — this case doesn't add new network behavior on that front, it's purely a timing/state-interaction case

## Known Defects Found During Exploration

- **[INFO/CLARIFICATION]** Filed as [`GH#68`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/68) — the case's own premise (an app-rendered modal appearing as an overlay ON TOP of a still-mounted, still-live create-agent form) is not reproducible in the live product via either of the case's own two literal trigger mechanisms in the way the case's wording implies. The **same-window** variant produces a genuine, previously-undocumented **native browser `beforeunload` confirmation dialog** (not a `[role="dialog"]` app element) that must be handled before the "Conversation not found" modal is even reached, and the create form is fully unmounted by the time that modal appears — form data is genuinely lost, not preserved-under-overlay. The **new-tab** variant avoids the native dialog entirely and does satisfy the case's literal per-step assertions (steps 7, 8) non-destructively, at the cost of the "modal intercepting form" language being technically true only of a *different* tab, not the one the user is actively filling. Not a product defect — reverse-masking guard applies (this is standard SPA route-unmount + data-loss-protection behavior, not broken); this AFS documents both branches and recommends the new-tab variant as the primary automated path. See GH#68 for the full investigation, including why no known modal type in this app has a spontaneous, unprompted trigger while sitting on a blank create-agent form.
- **[MINOR/DEFECT]** Name field 32-char silent truncation — already filed as [`GH#27`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/27) (Agents + Pipelines); independently re-confirmed here as the reason this AFS's own Test Data section deviates from the case's literal naming template (see § Test Data). Not re-filed, corroborates the existing ticket.
- **[INFO/CLARIFICATION]** "Announcing ELITEA X.X.X" banner intercepts Save-button pointer events until dismissed — already filed as [`GH#42`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/42); relevant here because the case's own step 2 hint (`button:has-text("Got it")`) doesn't match this banner's actual close control (accessible name `"close"`), so an implementer following the case text literally would silently skip dismissing it. Not re-filed.
- **[INFO/CLARIFICATION]** Broken `id="undefined-action"` overflow-menu button + type-to-confirm delete dialog with a mislabeled `aria-labelledby` — already filed as [`GH#33`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/33) / [`GH#28`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/28); corroborated identical here on both fixture agents (ids 449, 450) during teardown. Not re-filed.
- No other defects found. Both fixture agents were created and cleanly deleted with zero console errors and zero unexpected `4xx`/`5xx` responses across two independent full end-to-end runs.

## Blocked Steps
None. All case Preconditions, Steps 1–17, Expected Final State, and Teardown were executed end-to-end against the live system, twice (once per trigger variant), including two real (not simulated) agent creations (ids 449, 450) and two real (not simulated) deletions.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md`. This case joins `tests/modal-handling.spec.ts` (module-per-spec-file plan), batched with TC-050..055.
- Page object: extend `tests/pages/entityForm.page.ts` (`EntityFormPage`, existing) for the Name/Description/Save handles — do not duplicate. A new modal-handling helper (per `.agents/testing.md`'s plan to "extend whichever pattern agents/pipelines' delete-confirm and unsaved-changes modals establish") is the right place for a shared `conversationNotFoundDialog()` locator + `dismiss()` method, reusable by TC-050 and this case alike.
- Multi-tab: use Playwright's `context.newPage()` for the new-tab variant (step 6) — `browserContext.on('page', ...)` or just capture the return value of `newPage()` directly; no special context isolation needed since both tabs must share the same authenticated session/context by design (this is testing "another tab in the same session", not a separate user).
- Same-window variant (if ever implemented in addition, e.g. for a dedicated regression test of GH#68's own finding): register `page.on('dialog', dialog => dialog.accept())` **before** calling `page.goto(...)`, not after — Playwright's `goto()` promise will not resolve while a dialog is pending, so a handler registered only after the `goto()` call races the dialog and can deadlock the test.
- Wait strategy: no `waitForTimeout` — `waitForResponse` for the create/delete mutations, `getByRole('dialog').waitFor()` (or web-first `expect(...).toBeVisible()`) for the "Conversation not found" modal (observed 2–5s after navigating to `/app/chat/all`, matching TC-050's own timing).
- Test-data helper: `uniqueEntityName('TC056_Modal')` from `tests/fixtures/testData.ts` (existing, shared with the agents/pipelines modules) — do not reintroduce the case's own literal `TEST_Agent_Modal_Timing_${timestamp}` template, it silently truncates (see § Test Data).
