# Test Case: Agent "Step Limit" Advanced Field — Value Validation & Persistence

## Metadata
- **TMS ID**: TC-018
- **Linked Story**: GH#25 (case tracking issue), parent epic GH#16
- **Priority**: l3
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`)
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via `GET ${BASE_URL}app/chat/` not redirecting to a login page
- Browser viewport maximized (case's own Setup step 1) — explored at 1920×1080
- No account baseline data needed — this case creates and deletes its own throwaway agent

## Test Data
### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — standard smoke/regression account

### Must Generate (in test setup)
- Unique agent Name — **the case's own template `TEST_Agent_StepLimit_${timestamp}` overflows the Name field's confirmed 32-char cap** (GH#27, already filed by a sibling case): `TEST_Agent_StepLimit_` (21 chars) + a 13-digit ms timestamp = 34 chars, silently truncated. Observed live: generated `TEST_Agent_StepLimit_TC018_1783017425979` (40 chars, includes the `TC018_` collision-guard token per this dispatch's data-collision policy) was silently truncated by the browser to exactly `TEST_Agent_StepLimit_TC018_17830` (32 chars) — losing the trailing, most-distinguishing digits of the timestamp. **Automation must use a shorter prefix** (e.g. `TC018_` — 6 chars — leaves 26 chars for the full 13-digit timestamp with room to spare) rather than the case's literal template, exactly as TC-014's AFS (GH#21) already established for its own Name generation.
- Description: `Agent for testing step limit values` (36 chars — comfortably inside the Description field's much larger cap, no truncation risk)
- Step limit test values: `25` (confirmed default, never explicitly entered), `50`, `100` — matches case's Test Data exactly

### Must Clean Up (in teardown)
- Delete the fixture agent created in Setup via the Delete-agent flow (case's own Teardown) — performed for real during this exploration; agent id `275` (owner/project id `21`) confirmed removed (see Cleanup section)

## Test Steps
1. Navigate to `${BASE_URL}app/agents/all`
   - **Verify**: page loads, no redirect to Keycloak login
2. Wait for the card grid to populate — **condition wait, not the case's literal fixed 10s sleep** (`.agents/testing.md` § Conventions bans `waitForTimeout`): poll `#EliteACustomTabPanel .MuiCard-root` until `count() > 0`
   - **Verify**: at least one card renders inside `#EliteACustomTabPanel`
3. Check for a blocking modal (`[role="dialog"]`) and dismiss if present; **additionally, dismiss the "Announcing ELITEA 2.0.4!" release-notes banner if this is a fresh session** (`getByRole('button', { name: 'close' })`) — confirmed this banner is NOT purely cosmetic: see Known Defects (GH#42), it can intercept pointer events on the create form's Save button until closed
   - **Verify**: no `[role="dialog"]` present; banner closed (or absent, if already dismissed earlier in the session)
4. Click the agent-creation trigger in the left sidebar
   - **Handle** (re-authored — case-text drift, already filed under GH#30, originally from TC-015): the case says `"Create Agent" button`; the live control's accessible name is **`"Agent"`** (`getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Agent', exact: true })`)
   - **Verify**: navigates to `${BASE_URL}app/agents/create?viewMode=owner`
5. Fill `textbox "Name *"` with the generated unique Name (≤32 chars — see Test Data)
   - **Verify**: field contains the (possibly truncated) value
6. Fill `textbox "Description *"` with the test description
   - **Verify**: field contains the value
7. Locate the "Advanced" section
   - **Re-authored — case-text drift, same pattern as GH#28 (TC-011)**: the case says "Expand ... if collapsed"; observed live, ALL sections including Advanced render **already expanded** by default on both the create form and the detail page — no collapsed state was ever observed. Assert visibility directly; do not implement a conditional expand-if-needed branch (it will never execute)
   - **Verify**: `region` containing `textbox "Step limit"` is visible without any click
8. Verify `textbox "Step limit"` default value
   - **Verify**: field value is `"25"` — confirmed both via DOM (`el.value`) and via the input's own `min`/`max` HTML attributes (`min="0"`, `max="999"` — see Concrete Handles; these are inert for native validation since the input's `type` is `"text"`, not `"number"`, but the app enforces the same bounds in JS, see step 9's note and Known Defects)
9. Clear `textbox "Step limit"` and fill with `50`
   - **Verify**: field displays `"50"`
   - **Action detail**: use `locator.fill()`, not simulated keystroke-by-keystroke typing — this field re-renders (React controlled input) on every keystroke, and rapid automated `keyboard.type()` character sequences were observed to silently lose keystrokes against a stale element reference during this exploration (see Automation Hints); `fill()` does not exhibit this problem and correctly triggers the app's own onChange-driven clamping logic
10. Click "Save" button
    - **Verify**: `PUT`/`POST` succeeds; page navigates to the agent detail URL
    - **Note — case-text drift, same pattern as GH#28**: the case's own Expected Final State claims the URL becomes `/app/agents/{id}`; observed live: `${BASE_URL}app/agents/all/{id}?destTab=configuration&name={urlencodedName}&viewMode=owner` (confirmed: `.../app/agents/all/275?destTab=configuration&name=TEST_Agent_StepLimit_TC018_17830&viewMode=owner`)
11. Wait for redirect to agent detail page
    - **Verify**: URL matches the pattern in step 10; page title is `Agent: {truncatedName} - Private`
12. (Already on agent detail page from the step-10 redirect; case step 12's "navigate to agent detail page for {name}" is satisfied by the same navigation, not a separate action)
    - **Verify**: URL and title as above
13. Verify "Advanced" section is visible
    - **Verify**: same as step 7 — already expanded, no click needed
14. Verify `textbox "Step limit"` displays `50`
    - **Verify**: DOM value `"50"`; cross-checked against `GET ${BASE_URL}api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` response field `version_details.meta.step_limit === 50`
15. Clear `textbox "Step limit"` and fill with `100`
    - **Verify**: field displays `"100"`
16. Click "Save" button
    - **Handle**: on the detail page, `getByRole('button', { name: 'Save', exact: true })` disambiguates from the adjacent `"Save As Version"` button (both partially match a loose `"Save"` text selector — see GH#34/TC-012's documented Save/Save-As-Version accessible-name collision)
    - **Verify**: `PUT ${BASE_URL}api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` returns `201`
17. Wait for save confirmation
    - **Verify**: no fixed sleep — poll for the `PUT` response above, then re-read the field
18. Verify `textbox "Step limit"` still displays `100`
    - **Verify**: DOM value `"100"`; cross-checked against the `GET` response — `version_details.meta.step_limit === 100`
19. Navigate back to `${BASE_URL}app/agents/all` then back to agent detail
    - **Handle — new finding, already documented under GH#28**: navigating to the *bare* URL `${BASE_URL}app/agents/all/{id}` (no query string) 400s (`GET .../public_application/prompt_lib/{id}`) and renders "Page not found." The app's own internal navigation (clicking the agent's card from the list) always lands on a URL that includes `?viewMode=owner` — use that click-through pattern, not a hand-constructed bare-ID URL, to get back to agent detail
    - **Verify**: after navigating to `${BASE_URL}app/agents/all`, locate and click the card whose text contains the agent's (truncated) Name; confirm URL becomes `.../app/agents/all/{id}?viewMode=owner&name={truncatedName}`
20. Verify "Advanced" section is visible
    - **Verify**: same as steps 7/13 — already expanded, no click needed
21. Verify `textbox "Step limit"` displays `100`
    - **Verify**: DOM value `"100"` persists across the full navigate-away-and-back round trip

## Expected Results
- Step limit field defaults to `25` on a brand-new agent
- Field accepts and persists `50` and then `100` across explicit Save actions, survives a full detail-page reload, and survives a navigate-away-then-back-via-UI round trip
- Field is HTML `type="text"` (not `type="number"`) with `min="0"`, `max="999"`, `pattern="[0-9]*"`, `inputMode="numeric"` — the app enforces these bounds itself in JS rather than relying on native input validation:
  - Values above 999 clamp down to 999 (`fill('1234')` → `"999"`)
  - Negative values clamp up to 0 (`fill(' -5')` → `"0"`, i.e. `parseInt`-then-clamp semantics, not literal-character filtering)
  - Non-numeric input is stripped entirely (`fill('abc')` → `""`)
  - Decimal input truncates to its integer part (`fill('12.5')` → `"12"`)
  - **Exception (defect, GH#40)**: clearing the field to empty and clicking Save does NOT keep it empty/reject it — the backend silently substitutes its own default (`25`), but the on-screen field keeps showing empty until a full reload
- Persisted server-side at `version_details.meta.step_limit` (integer) in the agent's `application/prompt_lib` resource, confirmed via direct `GET`
- No console errors during any state-change/save/reload/navigation step, **except**: (a) the deliberately-triggered `public_application` 400 in step 19's negative-navigation probe (GH#28, expected/documented, not asserted as a pass condition), and (b) none at all during the case's own literal 21-step flow

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Precondition: app accessible at base URL | app loads | precondition | pre-navigation check | asserted |
| Precondition: user authenticated | authenticated session | precondition | `GET /app/chat/` no redirect | asserted |
| Precondition: browser window maximized | all UI visible | precondition | viewport set 1920×1080 | asserted |
| Setup 1: maximize browser window (`window.moveTo`/`resizeTo` script) | all UI elements visible | precondition | re-authored as `setViewportSize(1920,1080)` — equivalent effect, standard Playwright API instead of an in-page script | asserted *(re-authored)* |
| Setup 2: verify authenticated via `/app/chat/` | no redirect = authenticated | precondition | confirmed pre-navigation, no redirect | asserted |
| Test Data: Name/Description/Step-limit values | as specified | Test Data section | generated Name adjusted for 32-char cap (GH#27) | asserted *(re-authored — case's literal Name template overflows the field cap)* |
| 1 Navigate to `/app/agents/all` | list loads | step 1 | step 1: URL/no-redirect check | asserted |
| 2 Wait 10s for lazy loading | all cards visible | step 2 | step 2: condition wait, first card visible | asserted *(re-authored: condition wait, not fixed sleep)* |
| 3 Close modal dialogs if present | modal dismissed | step 3 | step 3: `[role="dialog"]` check + banner dismiss | asserted *(enriched: also dismisses the release-notes banner, which is NOT purely cosmetic — see GH#42)* |
| 4 Click "Create Agent" button | form opens at `/app/agents/create?viewMode=owner` | step 4 | step 4: URL check | asserted *(re-authored: live control's accessible name is "Agent" — case-text drift, GH#30)* |
| 5 Fill Name field | Name field contains value | step 5 | step 5: value check | asserted |
| 6 Fill Description field | Description field contains value | step 6 | step 6: value check | asserted |
| 7 Expand "Advanced" section if collapsed | section opens, Step limit visible | step 7 | step 7: visibility check, no click performed | asserted *(re-authored: always pre-expanded — case-text drift, GH#28)* |
| 8 Verify Step limit default is 25 | field shows "25" | step 8 | step 8: DOM value check | asserted |
| 9 Clear and fill 50 | field shows "50" | step 9 | step 9: DOM value check via `fill()` | asserted |
| 10 Click Save | agent saved, Step Limit = 50 | step 10 | step 10: network 201 + URL change | asserted *(case's own Expected Final State URL claim re-authored — see step 10 note, GH#28 pattern)* |
| 11 Wait for redirect to detail/list | save completes | step 11 | step 11: URL/title check | asserted |
| 12 Navigate to agent detail page for the agent | detail page loads | step 12 | step 12: same navigation as step 10's redirect satisfies this — no separate action needed | asserted *(decomposed/merged with step 10-11's redirect)* |
| 13 Expand Advanced if collapsed | section opens | step 13 | step 13: visibility check | asserted *(re-authored, same as step 7)* |
| 14 Verify Step limit displays 50 | value persisted | step 14 | step 14: DOM value + API cross-check | asserted |
| 15 Clear and fill 100 | field shows "100" | step 15 | step 15: DOM value check | asserted |
| 16 Click Save | changes saved | step 16 | step 16: network 201 | asserted *(handle note: disambiguate from "Save As Version", GH#34 pattern)* |
| 17 Wait for save confirmation | save completes | step 17 | step 17: condition wait on PUT response | asserted *(re-authored: condition wait, not fixed sleep)* |
| 18 Verify Step limit still displays 100 | value persisted | step 18 | step 18: DOM value + API cross-check | asserted |
| 19 Navigate back to `/app/agents/all` then back to agent detail | detail page reloads | step 19 | step 19: click-through via card, not bare-URL nav | asserted *(re-authored: bare-URL navigation 400s — case-text drift, GH#28; use UI click-through instead)* |
| 20 Expand Advanced section | section opens | step 20 | step 20: visibility check | asserted *(re-authored, same as step 7/13)* |
| 21 Verify Step limit displays 100 | value remains persisted after navigation | step 21 | step 21: DOM value check | asserted |
| Expected Final State: field accepts 25/50/100 and persists them | as described | steps 8, 9/14, 15/18/21 | throughout | asserted |
| Expected Final State: URL is `/app/agents/{id}` | URL shape | — | — | clarification *(observed `/app/agents/all/{id}?viewMode=owner&name=...` — same drift already filed under GH#28, not re-filed)* |
| Teardown: click menu button (three-dot icon) | menu opens | Cleanup step 1 | menu opened via `#undefined-action` locator (GH#33 — button has no accessible name) | asserted *(handle gap already filed by a sibling, referenced not re-filed)* |
| Teardown: click "Delete agent" in dropdown | delete flow starts | Cleanup step 2 | `getByRole('menuitem', { name: 'Delete agent' })` clicked | asserted |
| Teardown: confirm deletion via "Confirm" button in modal | agent deleted | Cleanup step 3 | re-authored — modal is type-to-confirm (fill agent name, then click "Delete", not "Confirm") — pattern already documented under GH#28 | asserted *(case-text drift, not re-filed)* |
| Teardown: verify agent removed from list | agent gone | Cleanup step 4 | card absence check + `GET` returns 400 for the deleted id | asserted |

### Axis 2 — Analyst additions
- Step 8/9/15 add explicit numeric-boundary probes beyond the case's literal 25→50→100 happy path — *added: the case is tagged `advanced` and its own crux (per dispatch) is "pin down the exact min/max and off-by-one behavior," which the case's own three Test Data values never exercise. Probed: `fill('1234')` → clamps to `"999"` (max); `fill('0')` → `"0"` (min, accepted); `fill(' -5')` → clamps to `"0"` (parseInt-then-clamp, not literal char-stripping); `fill('abc')` → `""` (non-numeric fully stripped); `fill('12.5')` → `"12"` (decimal truncated to integer). All five clamping behaviors are internally consistent with a single `parseInt(raw, 10)` → `isNaN ? '' : clamp(parsed, 0, 999)` implementation — documented in Expected Results and Concrete Handles for the automation engineer to assert directly, without needing to re-derive them.*
- Step 8/9/15 additionally assert against the persisted API field (`version_details.meta.step_limit`) alongside the DOM value, for steps 14/18 — *added: the case's own steps only ever check the DOM textbox; cross-checking the actual persisted backend value catches exactly the kind of UI/backend desync found in GH#40 (empty-save case) rather than only ever trusting client-rendered state.*
- Discovered and filed as a new defect (not asked for by the case, but found during execution of it): GH#40 (empty Step-limit save silently defaults server-side without updating the UI). Corroborated onto GH#42 (release-notes banner intercepts the create form's Save button — already independently found by TC-016, no new ticket needed) and onto GH#28 (bare agent-detail URL 400s — already independently found by TC-016 as a comment there; an initial duplicate ticket, GH#41, was opened and closed in favor of GH#28 during this same analysis pass) — *added: none of these are literal case steps; all three surfaced from probing realistic edge cases around the case's own literal path (clearing the field entirely, following the case's own claimed URL pattern literally, and executing the flow in a state the case's Setup doesn't rule out — a fresh, not-yet-dismissed banner).*
- Step 9 documents a `fill()` vs `keyboard.type()` reliability difference — *added: this exploration's own tooling (`playwright-cli` sending individual keystrokes) intermittently failed to register changes against this specific field's every-keystroke React re-render, while `fill()` worked reliably every time; this is an automation-implementation note, not a product defect, but material enough to block a future implementer from repeating the same false-negative.*

## Cleanup
1. From the agent detail page, click the overflow ("kebab") menu button — no accessible name (`#undefined-action`, GH#33) — top-right of the detail header
2. Click `getByRole('menuitem', { name: 'Delete agent' })`
3. In the resulting "Delete confirmation" dialog, fill the `Name` textbox with the exact (truncated) agent name, then click `getByRole('button', { name: 'Delete' })` (type-to-confirm pattern, GH#28 — NOT a simple "Confirm" button as the case text states)
4. Verify: redirected to `${BASE_URL}app/agents/all`; the deleted agent's card no longer appears (`.MuiCard-root` text scan); `GET ${BASE_URL}api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` now returns `400`

All four steps executed for real during this exploration against agent id `275` (owner/project id `21`) — confirmed removed via both the list-card check and the direct API check.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Agent-creation trigger (sidebar) | `page.getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Agent', exact: true })` | none needed |
| Name field | `page.getByRole('textbox', { name: 'Name *' })` | none needed |
| Description field | `page.getByRole('textbox', { name: 'Description *' })` | none needed |
| Advanced section content | `page.getByRole('region').filter({ has: page.getByRole('textbox', { name: 'Step limit' }) })` | assert `getByRole('textbox', { name: 'Step limit' })` visible directly — section is always pre-expanded, no toggle interaction needed |
| Step limit field | `page.getByRole('textbox', { name: 'Step limit' })` — use `.fill(value)`, not sequential `keyboard.type()` (see Test Steps 9 note) | none needed |
| Save button (create form) | `page.getByRole('button', { name: 'Save' })` | none needed — only one "Save" on the create form |
| Save button (detail/edit page) | `page.getByRole('button', { name: 'Save', exact: true })` — **must be `exact`**, disambiguates from adjacent `"Save As Version"` (GH#34 pattern) | none needed |
| Release-notes banner close | `page.getByRole('button', { name: 'close' })` | dismiss defensively before any Save click in a fresh session — see GH#42 |
| Overflow ("kebab") menu button (detail page) | `page.locator('#undefined-action')` — **no accessible name exists** (GH#33, confirmed broken `id` attribute) | positional: last icon-only button in the detail header's action row |
| "Delete agent" menu item | `page.getByRole('menuitem', { name: 'Delete agent' })` | none needed |
| Delete-confirmation dialog Name input | `page.getByRole('dialog').getByRole('textbox')` (single unlabeled textbox inside the "Delete confirmation" dialog) | **no `getByLabel` fallback exists** — confirmed via GH#33 (comment) the input has no `aria-label`/`aria-labelledby`/associated `<label>` at all; `page.locator('input[name="name"]')` is the only other option |
| Delete-confirmation dialog itself | `page.getByRole('dialog')` (unscoped — only one is ever mounted at a time) — **do NOT use `page.getByRole('dialog', { name: 'Delete confirmation' })`**, confirmed via GH#33 (comment) the dialog's `aria-labelledby` points at a non-existent element id, so it has no computed accessible name and a name-scoped query resolves to zero matches | `page.getByText('Delete confirmation')` (heading text match) if unscoped `dialog` is ever ambiguous |
| Delete-confirmation dialog Delete button | `page.getByRole('dialog').getByRole('button', { name: 'Delete' })` — disabled until the Name textbox contains the exact agent name | none needed |
| Agent card in list (click-through to detail) | `page.locator('#EliteACustomTabPanel .MuiCard-root').filter({ hasText: agentName })` | same pattern as TC-003/TC-012 — no `data-testid`/role/aria-label exists on cards (GH#12) |
| Step limit field HTML attributes (for asserting the constraint itself, not just behavior) | `min="0"`, `max="999"`, `pattern="[0-9]*"`, `inputMode="numeric"` on the underlying `<input>` — note `type="text"`, so these do NOT trigger native browser validation; the app enforces them in JS | n/a |
| Persisted step limit (API) | `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` → `response.version_details.meta.step_limit` (integer) | n/a |

## Network Behavior
- `POST /api/v2/elitea_core/applications/prompt_lib/{ownerId}` — fires on initial create-form Save. Returns `201` with the new agent's `id` in the response body; the browser then redirects to `/app/agents/all/{id}?destTab=configuration&name={urlencodedName}&viewMode=owner`.
- `PUT /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — fires on every subsequent detail-page Save. Returns `201` (not `200`) on success in this app.
- `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — fires on detail-page load/reload; response includes `version_details.meta.step_limit` as the authoritative persisted value. **Use this to cross-check the DOM value after every save** — the case's own steps only ever check the DOM, which is exactly what let GH#40 (empty-save desync) go unnoticed until an explicit API cross-check was added.
- `GET /api/v2/elitea_core/public_application/prompt_lib/{id}` — fires (and returns `400`) if the agent detail route is visited **without** `?viewMode=owner` in the query string (GH#28). Do not construct bare `/app/agents/all/{id}` URLs in automation; always click through from the list or preserve the full query string captured from a prior navigation.
- Wait strategy for the implementer: `page.waitForResponse(resp => resp.url().includes('/application/prompt_lib/') && [200,201].includes(resp.status()))` scoped appropriately per step, instead of the case's literal fixed-duration waits.

## Known Defects Found During Exploration

**One genuinely new defect filed** (discovered by probing a realistic edge case beyond the case's own literal 25→50→100 happy path — does not block the case's own steps from completing, so this AFS is `ready-for-automation` with it documented as an `expect.soft()` regression guard, not a blocker):

- **[MINOR]** [`GH#40`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/40) — Clearing the Step limit field to empty and clicking Save silently persists the backend default (`25`) via a successful `201` `PUT`, but the on-screen field keeps showing empty with no error/toast until a full page reload. UI and backend disagree about the agent's actual step limit in the interim.

**Two more edge cases were found during this exploration but turned out to already be tracked** (corroborated onto the existing tickets rather than filed as new ones — a full comment-body search, not just issue title/text, is required before filing on this project; see the note on GH#41 below):

- The "Announcing ELITEA 2.0.4!" release-notes banner, if not yet dismissed this session, intercepts pointer events on the Agent create form's Save button (confirmed via Playwright's own actionability-retry log), even though it doesn't visually overlap the button. Automation must dismiss the banner defensively before any Save click in a fresh session; a sibling case's AFS (TC-010, GH#18) incorrectly characterizes this banner as non-blocking — this exploration's evidence (an actual intercepted-click retry log) contradicts that for the Save button specifically. **Already independently found and documented by TC-016** (`test-specs/agents/l3_agent-detail-displays-correctly_TC-016.md` step 10 — same "subtree intercepts pointer events" retry, timed ~1.7s); tracked at [`GH#42`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/42) (filed by this case before that prior documentation was found; corroboration comment added there rather than opening a second ticket).
- Navigating directly to the bare `/app/agents/all/{id}` URL (no query string) — which is what the case's own "Expected Final State" (`/app/agents/{id}`) implies exists — 400s against `public_application/prompt_lib/{id}` and renders "Page not found." The app's own internal navigation never produces this bare URL (always includes `?viewMode=owner`), so automation must click through the UI rather than constructing the URL from the case text. **Not filed as a new ticket** — already documented as a comment on [`GH#28`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/28) by TC-016's analyst (independently found and corroborated here); an initial duplicate ticket (GH#41) was opened before a full comment-body search surfaced the existing finding, then closed in favor of GH#28.

**Pre-existing defects/clarifications referenced (not re-filed — already covered by sibling analysts' findings, same root cause confirmed again during this case's own execution):**

- [`GH#27`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/27) — Name field silently truncates at 32 characters (confirmed again: this case's own generated Name was truncated from 40 to 32 chars).
- [`GH#28`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/28) — Advanced/other sections always pre-expanded; detail URL shape differs from `/app/agents/{id}`; delete-confirmation dialog is type-the-name-to-confirm (Delete/Cancel), not a simple Confirm/Cancel; bare-URL 404 (see above) — this is the consolidated umbrella ticket (multiple sibling analysts' corroborations bundled via comment; a duplicate ticket, GH#37, was opened independently and closed in favor of this one during this same batch) — confirmed again during this case's own Teardown and step 10/19.
- [`GH#30`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/30) — "Create Agent" button's accessible name is just "Agent" (confirmed again).
- [`GH#33`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/33) — Detail-page overflow-menu button has literal `id="undefined-action"`, no accessible name (confirmed again, used during this case's own Teardown); umbrella ticket also carries (via comment, not re-verified live by this case but incorporated into Concrete Handles above) the Delete-confirmation dialog's broken `aria-labelledby` and its Name input's total lack of an accessible name.
- [`GH#34`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/34) — "Save" / "Save As Version" accessible-name collision on the detail page (relevant to this case's step 16 — required `exact: true`).

## Blocked Steps
None. All 21 case steps plus both Setup steps and the full Teardown were executed end-to-end against the live system, including additional numeric-boundary probes (Axis 2) beyond the case's own literal three test values.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — this case belongs in `tests/agents.spec.ts` alongside the rest of the `agents` module (TC-010..019), per `.agents/testing.md` § Structure's module-batching plan. No cross-case shared-state dependency was observed (this case creates and tears down its own fixture agent), so it does not require `mode: 'serial'` with sibling agents-module cases.
- Page object: use/extend `tests/pages/agentForm.page.ts` (anticipated per `.agents/testing.md` § Structure) for the Name/Description/Step-limit fields and Save button — the Step limit field's `fill()`-not-`type()` requirement (Test Steps 9 note) and the create-vs-detail Save button disambiguation (`exact: true` on the detail page) are exactly the kind of quirks a page object should encapsulate once, rather than every spec re-deriving them.
- Wait strategy: no `waitForTimeout` anywhere — every "wait N seconds"/"wait for save confirmation" from the original case is re-authored into a `waitForResponse` scoped to the relevant `application/prompt_lib` endpoint, or a web-first `expect(...).toHaveValue(...)` poll.
- Numeric-boundary assertions (Axis 2) are good candidates for a small parametrized `test.describe` block (`[1234, '999'], [0, '0'], [' -5', '0'], ['abc', ''], ['12.5', '12']`) rather than five separate hand-written tests — the underlying clamp logic is a single function, and a table-driven test communicates that directly.
- `expect.soft()` + `// Known defect: GH#40` for the empty-save-desync regression guard, if the implementer chooses to encode it as a guard rather than leaving it purely documented here (case text doesn't ask for it, so it is optional per project convention, same treatment as GH#29 in TC-014's AFS).
