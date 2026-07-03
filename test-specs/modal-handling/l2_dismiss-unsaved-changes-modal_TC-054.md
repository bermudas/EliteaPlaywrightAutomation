# Test Case: Dismiss Unsaved Changes Modal

## Metadata
- **TMS ID**: TC-054
- **Linked Story**: GH#16 (EPIC), GH#63 (case tracking issue)
- **Priority**: l2 (case priority: High)
- **Environment Explored**: `https://next.elitea.ai/` — live, isolated session via `playwright-cli -s=TC-054` (own in-memory Chrome profile + dedicated `--profile` dir), executed in parallel alongside sibling analysts TC-050..053, TC-055, TC-056
- **Analyst**: qa-engineer (Sage), 2026-07-03
- **Status**: ready-for-automation

## Preconditions
- App accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) via Keycloak SSO — `getByRole('textbox', {name:'Username or email'})` / `{name:'Password'}` / `getByRole('button', {name:'Sign In'})`; lands on `${BASE_URL}app/chat/{id}` on success
- Browser window maximized — case's own Setup step; not load-bearing for a headless/CI run, no functional dependency on viewport observed for this flow (same translation prior agents/pipelines AFSs use)
- At least one existing agent in the account — used the existing, already-present fixture `TestAgent_1772792259904_temp` (id `253`, owner/project id `21` "Private", pinned to top of the list) rather than creating a new one, per the case's own precondition ("use existing data") and the Data-collision guard (dismissing a change is inherently non-destructive to an existing record — no new fixture needed)
- A dismissible "Announcing ELITEA 2.0.4!" release-notes banner appears on `/app/agents/all` and persists into the agent detail view — **not merely cosmetic here**: while open it visually overlaps the header and intercepts pointer events on the Back-arrow icon button (`TimeoutError` / "subtree intercepts pointer events" on first click attempt) — **must be dismissed via its `button "close"` before the Back-arrow is clickable**, not just optionally dismissed

## Test Data
### Existing (re-use)
- `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — `.env`
- Fixture agent: id `253`, name `TestAgent_1772792259904_temp`, owner/project id `21`
- Original Description value (captured live, step 3 below): `Test Description`

### Must Generate (in test setup)
- Modified description: `` `MODIFIED_DESCRIPTION_TEMP_${Date.now()}` `` (used `MODIFIED_DESCRIPTION_TEMP_1783056744` during this exploration) — case's own template matches, no truncation risk observed (Description field showed "2268 characters left" after fill, no `maxlength` cap like the Name field's GH#27)

### Must Clean Up (in teardown)
- **None.** Confirmed via two independent channels the modification was never persisted server-side:
  1. UI: reloading the agent detail page shows `Description *` = `Test Description` (original), not the modified value
  2. API: `GET /api/v2/elitea_core/application/prompt_lib/21/253` response body `.description === "Test Description"` (see § Network Behavior)
- Case's own Teardown ("None — no persistent state was modified") is confirmed accurate.

## Test Steps

1. Navigate to `${BASE_URL}app/agents/all`. Wait for network idle (no fixed 10s sleep — case's "wait 10 seconds for lazy loading" is a manual-execution artifact, per `.agents/testing.md` § Conventions).
   - **Verify**: card grid `#EliteACustomTabPanel` renders `.MuiCard-root` cards; no blocking modal present (no `button:has-text("Got it")` control existed this run — only the dismissible, non-blocking release-notes banner)
2. Click the first agent card in the grid (`TestAgent_1772792259904_temp`).
   - **Verify**: URL becomes `${BASE_URL}app/agents/all/253?viewMode=owner&name=TestAgent_1772792259904_temp` — agent detail/edit page opens
3. Locate `getByRole('textbox', { name: 'Description *' })`.
   - **Verify**: field visible and editable; read `.value` and store as `original_description` (observed: `"Test Description"`)
4. Clear the field and fill with `` `MODIFIED_DESCRIPTION_TEMP_${Date.now()}` ``.
   - **Verify**: field value updated; header `Save` / `Save As Version` / `Discard` buttons transition from `[disabled]` to enabled (dirty-state signal — use as the wait condition before step 6, not a fixed sleep)
5. Dismiss the release-notes banner via its `button "close"` if still present.
   - **Verify**: banner is gone; the Back-arrow icon button (top-left of the form header) is no longer obstructed (a click here failed with a pointer-interception timeout while the banner was open — see Known Defects)
6. Click the Back-arrow icon button (top-left, immediately left of the tab list — no accessible name/label/testid exists, see Concrete Handles / GH#36).
   - **Verify**: a `dialog` appears — `role="dialog"`, `aria-modal="true"`, accessible name **"Warning"**, body text **"There are unsaved changes. Are you sure you want to leave?"**, buttons **"Cancel"** / **"Confirm"**. Matches the case's own `[role="dialog"]` selector, but **not** its expected copy/buttons — see step 7 clarification
7. Verify modal content against the case's own Step 9 expectation ("text like 'Unsaved changes' and buttons 'Discard' and 'Save'").
   - **Verify (clarification, not a defect)**: the dialog's actual heading is "Warning" (not literally "Unsaved changes", though the body text does contain "unsaved changes"), and its buttons are **"Cancel"/"Confirm"** — there is **no button labeled "Discard", "Save", or "Don't Save" anywhere in this dialog**. This is the same dialog TC-019/GH#36 already documented for the agent **create** form's Back-arrow trigger — now confirmed to also fire identically on the agent **edit** form (new trigger surface, same shared component)
8. Click the dialog's `getByRole('button', { name: 'Confirm' })` (the functional equivalent of the case's "Discard").
   - **Verify**: dialog closes; URL becomes `${BASE_URL}app/agents/all?viewMode=owner` — matches the case's expected "navigates away to agents list", with an extra `viewMode=owner` query param vs. the case's bare `/app/agents/all` (same GH#36 finding-3 pattern)
9. Navigate back to the same agent detail page: `${BASE_URL}app/agents/all/253?viewMode=owner` (query string required — see Known Defects).
   - **Verify**: agent detail page reopens (title `"Agent: TestAgent_1772792259904_temp - Private"`); the app itself appends `&name=...` to the URL client-side once it resolves the agent (cosmetic only, not required to load)
10. Read `getByRole('textbox', { name: 'Description *' })` value again.
    - **Verify**: value equals `original_description` (`"Test Description"`), **not** the modified value — confirms the edit was discarded, matching case Step 12 / Expected Final State exactly
11. (Analyst addition — strongest proof) Inspect the `GET /api/v2/elitea_core/application/prompt_lib/21/253` response fired on step 9's reload.
    - **Verify**: response body `.description === "Test Description"` — race-free, server-side confirmation independent of UI rendering/hydration timing

## Expected Results
- Editing an existing agent's Description and clicking the Back-arrow icon with unsaved changes present triggers the app-wide "Warning" confirmation dialog (`role="dialog"`, "Warning" / "There are unsaved changes. Are you sure you want to leave?" / Cancel / Confirm) — the same shared component TC-019/GH#36 documented for the **create**-agent form, now confirmed to also protect the **edit**-agent form
- Clicking "Confirm" discards the in-progress edit and navigates to `${BASE_URL}app/agents/all?viewMode=owner`
- The agent's description is never persisted server-side at any point — confirmed both via UI re-read after reload and via the `application/prompt_lib` API response
- No teardown required — nothing was mutated (case's own Teardown confirmed accurate)
- Zero console errors/warnings throughout the modify → Back-arrow → Confirm → reload → verify flow (checked via `console` at each phase — 0/0)

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Precondition: app accessible, user authenticated | dashboard/chat loads | precondition | login flow completes, lands on `/app/chat/{id}` | asserted |
| Precondition: browser maximized | all UI elements visible | precondition | not load-bearing headless; omitted from steps, same as sibling agents/pipelines AFSs | out-of-scope *(cosmetic, no functional dependency observed)* |
| Precondition: at least one existing agent | reusable fixture available | precondition | used pre-existing `TestAgent_1772792259904_temp` (id 253) | asserted |
| 1 Navigate to `/app/agents/all` | Agents list page loads | step 1 | step 1: card grid renders | asserted |
| 2 Close any modal via `button:has-text("Got it")` | page interactive | step 1 | step 1: no such control existed this run | clarification *(no "Got it" button/modal appeared; only a dismissible non-blocking release-notes banner did — see step 5, which found it IS load-bearing here, unlike prior agents/pipelines runs, because it physically overlaps the Back-arrow button)* |
| 3 Wait 10s for lazy loading, scroll to load all agents | all agents visible | step 1 | step 1: network-idle wait (decomposed, condition-based per `.agents/testing.md` § Conventions) | asserted *(decomposed)* |
| 4 Click first agent card/row | Agent detail/edit page opens | step 2 | step 2: URL assertion | asserted |
| 5 Locate Description field | field visible/editable | step 3 | step 3: field located | asserted |
| 6 Record original description value | value stored | step 3 | step 3: `.value` read, `"Test Description"` | asserted |
| 7 Clear field, enter `MODIFIED_DESCRIPTION_TEMP_${timestamp}` | field contains modified text | step 4 | step 4: value read-back + dirty-state signal | asserted |
| 8 Click "Back" button (top-left arrow) or navigate away | Unsaved changes modal appears with `[role="dialog"]` | steps 5–6 | step 6: dialog appears (decomposed: step 5 dismisses the blocking banner first, a prerequisite the case text doesn't mention) | asserted *(decomposed; also see clarification below)* |
| 9 Verify modal contains "Unsaved changes" text and "Discard"/"Save" buttons | modal content correct | step 7 | step 7: dialog role/heading/body/button text | clarification *(actual: heading "Warning", body "There are unsaved changes. Are you sure you want to leave?", buttons "Cancel"/"Confirm" — no "Discard", "Save", or "Don't Save" button exists in this dialog. Same drift class GH#36 already documents for TC-019; now corroborated on the edit-form surface — see Known Defects)* |
| 10 Click "Discard" (`button:has-text("Discard")` or `button:has-text("Don't Save")`) | Modal closes, navigates to agents list | step 8 | step 8: clicked "Confirm" (live functional equivalent); dialog closes, URL changes | clarification *(no button literally named "Discard"/"Don't Save" in this dialog — "Confirm" is the leave/discard action; see Known Defects for a second, easily-confused control that IS literally labeled "Discard" but behaves differently — Finding 2 below)* |
| 11 Navigate back to the same agent detail page | Agent detail opens again | step 9 | step 9: URL navigation + page reopens | asserted *(clarification: bare `/app/agents/all/253` with no query string 404s — `viewMode=owner` is required; already tracked as GH#28, not re-filed, see Known Defects)* |
| 12 Verify Description field contains the ORIGINAL value, not modified | Changes discarded, original intact | step 10 | step 10: UI value read-back | asserted |
| Expected Final State: modal dismissed via Discard, description NOT saved/retains original, user on agents list | as described | steps 6–10 | throughout | asserted *(the "on agents list" sub-claim is satisfied immediately post-step-8, before the analyst navigates back in for verification in steps 9–10 — sequential, not contradictory)* |
| Teardown: none required | nothing to clean up | step 11 | step 11: API `.description` confirms no persistence | asserted |

### Axis 2 — Analyst additions

- Asserted the reopened-page description via the underlying `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` API response (`.description`), not just the UI textbox — *added: a race-free, server-side proof that survives any client-side rendering/hydration timing, same pattern TC-019/TC-015 used their `search_options` API check for.*
- Verified `window.location.href` before trusting every read, per the project's known parallel-analyst browser-isolation gotcha (`.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`) — this run executed alongside 6 concurrent sibling analysts (TC-050..053, 055, 056) sharing the same test account; ran in a dedicated `playwright-cli -s=TC-054` session with its own `--profile` directory (not the shared default MCP browser profile) for full isolation, not just URL-reads-as-insurance.
- **Explicitly distinguished this case's Back-arrow-triggered dialog from a second, easily-confused control on the same page** — the header toolbar's own **"Discard"** button (next to "Save"/"Save As Version"). Exploring this (not required by the case, but directly relevant since the case's own Test Data table names `button:has-text("Discard")` as the expected selector) revealed the toolbar "Discard" button triggers a **different, third-known dialog variant** ("Warning Close" / "Are you sure you want to discard changes?" / Cancel / **Discard**, matching TC-015/TC-025's Cancel-button dialog signature exactly) — and, critically, clicking that dialog's "Discard" button **does NOT navigate away**; it reverts the field in place and the URL stays on the same agent detail page. This directly contradicts the case's Step 10 expected result ("page navigates away to agents list"). See Known Defects Finding 2 — this is a genuine footgun for an implementer following the case's literal `button:has-text("Discard")` hint.
- Confirmed zero console errors/warnings across the entire modify → Back-arrow → Confirm → reload → verify flow (checked via `console` after each phase) — case text doesn't mention console health.

## Cleanup
1. None required — confirmed no persistent mutation via both UI re-read and API response (`GET application/prompt_lib/21/253` → `.description === "Test Description"`). Fixture agent `TestAgent_1772792259904_temp` (id 253) left exactly as found: `Save`/`Discard` buttons `[disabled]` (pristine state), Description = `Test Description`.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Login username / password / Sign In | `getByRole('textbox', {name:'Username or email'})` / `{name:'Password'}` / `getByRole('button', {name:'Sign In'})` | none needed |
| Agents card grid (existing) | `#EliteACustomTabPanel` / `.MuiCard-root` (per `tests/pages/cardGridList.page.ts`) | none — confirmed floor, no `data-testid` on cards (GH#12) |
| First/target agent card | Card matched by visible text (agent name), e.g. `page.locator('.MuiCard-root').filter({ hasText: agentName })` | positional `.nth(0)` if any card is acceptable |
| Description field | `getByRole('textbox', { name: 'Description *' })` | none needed — tier-1 handle |
| Header dirty-state signal | `getByRole('button', { name: 'Save', exact: true })` — starts `[disabled]`, enabled once the form is dirty | check `getByRole('button', { name: 'Discard', exact: true })`'s `[disabled]` state instead (same transition) |
| Release-notes banner close button | `getByRole('button', { name: 'close' })` — **must be dismissed before the Back-arrow is reliably clickable**, not optional here (see Preconditions/Known Defects) | none needed |
| Back-arrow icon button (top-left) | **No accessible name/label/testid exists** (GH#36, same gap TC-019 found on the create form). Structural fallback: `page.locator('div:has(> .MuiTabs-root) > button')` (first match) — direct-child sibling of the `.MuiTabs-root` tab-header container | none higher-tier available — flagged per Locator Ladder stop+flag rule |
| Back-arrow-triggered dialog ("Warning" variant — **the one this case's flow uses**) | `getByRole('dialog', { name: 'Warning' })` | scope by body text match `"There are unsaved changes. Are you sure you want to leave?"` |
| — dialog "Cancel" (stay) button | `page.getByRole('dialog', { name: 'Warning' }).getByRole('button', { name: 'Cancel' })` | none needed |
| — dialog "Confirm" (leave/discard, navigates away) button | `page.getByRole('dialog', { name: 'Warning' }).getByRole('button', { name: 'Confirm' })` | none needed |
| Toolbar "Discard" button (top-right — **do NOT confuse with the dialog above**, see Known Defects Finding 2) | `getByRole('button', { name: 'Discard', exact: true })` scoped to the form's own toolbar (not inside any dialog) | none needed — but disambiguate: after this click, a **different** dialog opens (see next row) |
| Toolbar-Discard-triggered dialog ("Warning Close" variant — reverts in place, does NOT navigate) | `getByRole('dialog').filter({ hasText: 'Are you sure you want to discard changes?' })` — same component TC-015/TC-025 documented for the Cancel-button trigger | `page.getByRole('heading', { name: /Warning Close/ })` |
| — dialog "Discard" button (this variant only) | `page.getByRole('dialog').filter({ hasText: 'discard changes' }).getByRole('button', { name: 'Discard' })` | none needed |
| Agent detail deep-link URL | `${BASE_URL}app/agents/all/{id}?viewMode=owner` (query string **required** — bare `/app/agents/all/{id}` 404s, GH#28) | click-through from the list card is the app's own internal navigation pattern and always includes the required query params |
| "no persistence" proof (API) | `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{agentId}` → response `.description` | UI textbox re-read (secondary) |

## Network Behavior
- `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{agentId}` (e.g. `.../21/253`) — fires on agent-detail page load/reload. Response body includes `.description`, `.name`, `.version_details.*`. **Use `.description` as the primary, race-free "no edit was persisted" assertion** (analogous to TC-019/TC-015's `search_options.application.total===0` pattern for "no agent created").
- `GET /api/v2/elitea_core/public_application/prompt_lib/{agentId}` — fires **instead of** the correct endpoint above, and returns `400`, when the agent-detail URL is visited **without** `viewMode=owner` in the query string. Produces a client-side "Page not found" page. Already tracked as [`GH#28`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/28) (originally TC-011, corroborated by 9+ subsequent analysts across both agents and pipelines modules) — **not re-filed**, corroborated via comment instead (see Known Defects).
- No `POST`/`PUT` request to any agent-persist endpoint observed at any point during the modify → Back-arrow → Confirm flow — confirms the Discard/Confirm action is a genuine server-side no-op, not just a client-side UI reset.
- Analytics beacons (`google-analytics.com/g/collect`, `google.com/g/collect`) and `socket.io` polling fire continuously in the background — unrelated noise.

## Known Defects Found During Exploration

**No product defects (functionally correct end-to-end)** — the unsaved-changes protection works as intended on both the Back-arrow and toolbar-Discard paths; the description is never persisted through either dismiss path. Findings below are case-authoring drift / clarifications, filed or corroborated per `.agents/profile.md` § Bug filing (github-issue, strict-per-bug):

1. **[INFO/CLARIFICATION] — corroborated, not re-filed.** Added a comment to [`GH#36`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/36) (originally filed by TC-019's analyst for the agent **create** form): the Back-arrow-triggered "Warning" / "There are unsaved changes. Are you sure you want to leave?" / Cancel-Confirm dialog is confirmed to also protect the agent **edit** form (this case), not just create — same shared component, new trigger surface. The case's own Step 9/10 text (expects "Unsaved changes" heading, "Discard"/"Save" buttons) reflects the *other* known dialog variant's copy, not this one — same drift class GH#36 already tracks.
2. **[INFO/CLARIFICATION] — new finding, added to `GH#36`'s thread (disambiguation is that issue's whole purpose).** The agent edit page's header toolbar has its **own, separately-clickable "Discard" button** (next to "Save"/"Save As Version") which is a *third distinct trigger* for a *third-cataloged* dialog variant: clicking it opens the "Warning Close" / "Are you sure you want to discard changes?" / Cancel/**Discard** dialog (the same component TC-015/TC-025 already documented for the **create**-form's explicit "Cancel" button). Critically, confirming that dialog's "Discard" button **reverts the field in place and does NOT navigate away** — the URL stays on the same agent-detail page. This means the case's own Test Data hint (`button:has-text("Discard")` as *the* expected control) points at a real, live button — but following it produces a flow that does **not** match the case's Step 10 expected result ("modal closes, page navigates away to agents list"). Only the Back-arrow → "Warning" → "Confirm" path satisfies the case's actual expected navigation behavior. Flagged explicitly so an implementer doesn't wire automation to the wrong "Discard" button and then get a false failure (or false pass) on the navigation assertion.
3. **[INFO/CLARIFICATION] — corroborated, not re-filed.** Added a comment to [`GH#28`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/28) (bare-URL-without-`viewMode=owner` 404, originally TC-011, already corroborated by 9 prior analysts across agents and pipelines): reproduced identically on the agent-edit reopen step of this flow (`/app/agents/all/253` alone → `public_application/prompt_lib/253` → `400` → "Page not found"; `?viewMode=owner` loads correctly). **Searched `gh issue view 28 --comments` before filing anything new**, per this project's own documented trap (multiple prior analysts independently opened, then closed as duplicate, tickets for this exact same finding before learning to search comments first) — no new ticket opened.

## Blocked Steps
None. Case executed end-to-end against the live system with no access, data, or environment blockers.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md`. Lands in `tests/modal-handling.spec.ts` (new file, batched with the rest of the `modal-handling` module per `.agents/testing.md` § Structure).
- Page object: reuse `tests/pages/cardGridList.page.ts` for the list/card step (step 2). The Back-arrow button, both dialog variants ("Warning" and "Warning Close"), and the toolbar Save/Discard buttons are strong candidates for the module's shared modal-handling helper (`.agents/testing.md` § Structure says extend whichever pattern agents/pipelines establish, not build a separate one) — extend, don't duplicate, `tests/pages/agentForm.page.ts` if/when it exists from the agents-module implementation.
- **Do not build one generic "unsaved changes modal" helper that assumes a single dialog shape.** This case alone surfaces two distinct variants reachable from the same page (see Known Defects Finding 2): key the helper by *trigger* (Back-arrow → "Warning"/Cancel-Confirm/navigates-away; toolbar-Discard → "Warning Close"/Cancel-Discard/stays-in-place), not by a shared "the unsaved-changes dialog" assumption.
- Assert "no edit persisted" primarily via the `application/prompt_lib/{ownerId}/{id}` network response's `.description` field (race-free), with the UI textbox re-read as a secondary/sanity check — mirrors the pattern TC-019/TC-015 established with `search_options.application.total`.
- Wait strategy: gate the Back-arrow click on the header `Save` button's `disabled` attribute clearing (confirms dirty state) rather than a fixed sleep after the fill; gate the reopen-page assertion on the `application/prompt_lib` response rather than a fixed sleep after navigation.
- Reopen the agent via `${BASE_URL}app/agents/all/{id}?viewMode=owner` directly (functionally sufficient — `name` is cosmetic/auto-appended) rather than re-deriving a click-through-from-list path, since the id is already known from step 2's URL.
- **Analyst execution note (process/tooling, not product):** ran in a `playwright-cli -s=TC-054` isolated session with a dedicated `--profile` directory (not the shared default MCP browser profile) specifically because this batch dispatched 6 concurrent sibling analysts (TC-050..053, 055, 056) against the same shared account — per `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`. Verified isolation via a fresh Keycloak login redirect on first navigation and by re-checking `window.location.href` before trusting reads. No cross-talk observed.
