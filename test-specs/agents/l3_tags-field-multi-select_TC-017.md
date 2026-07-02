# Test Case: Tags Field Multi-Select Functionality

## Metadata
- **TMS ID**: TC-017
- **Linked Story**: GH#24 (parent epic GH#16)
- **Priority**: l3
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`)
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via `GET ${BASE_URL}/app/chat/` not redirecting to a login page
- Browser window maximized — translated to the project's fixed `1920×1080` Playwright viewport config (`playwright.config.ts` `use.viewport`), same translation TC-001–005/TC-015 already use; this analyst's own manual exploration ran at `playwright-cli`'s smaller default viewport and the Tags-field flow was unaffected — no card-grid/column-count dependency for the create-form steps

## Test Data
### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — standard smoke/regression account
- Agents list at `${BASE_URL}/app/agents/all`, owner/project id `21` ("Private")
- Tag `automation` — **pre-existing** tag entity in this account (id `9`, confirmed via the create-response's `tags: [{id, name, data:{color}}]`; same entity TC-011 also reused). Typing `automation` into the Tags combobox surfaces it as a live suggestion (`listbox "Tags"` → `option "automation"`) before Enter is even pressed — confirms the combobox is backed by `GET /api/v2/elitea_core/tags/prompt_lib/{ownerId}` account-level tag suggestions, not a purely free-text field.

### Must Generate (in test setup)
- Agent name: `TEST_Agent_Tags_TC017_${timestamp}` — **must stay ≤ 32 characters** (see § Known Defects — GH#27, silent truncation, independently corroborated again by this exploration). The case's own literal template plus a 13-digit ms timestamp (`TEST_Agent_Tags_TC017_1783017501511`, 35 chars) **exceeds the cap by 3** and was silently truncated to `TEST_Agent_Tags_TC017_1783017501` (32 chars) during this exploration — confirmed both in the form field's post-fill value and in the `POST .../applications/prompt_lib` response body. **Automation must budget the prefix** (`TEST_Agent_Tags_TC017_` = 22 chars) so only a 10-digit-max timestamp segment fits under the cap, or use a shorter prefix/hash suffix instead of a raw `Date.now()` string.
- Description: `Agent for testing multi-select tags` (case's literal value, 36 chars — comfortably inside the Description field's much larger `maxlength`, no truncation risk)
- Tag 1: `automation` (case's literal value — pre-existing account tag, reused not duplicated)
- Tag 2: `testing` (case's literal value — new tag, no existing-suggestion match observed)
- Tag 3: **`qa_suite`, NOT the case's literal `qa-suite`** — see § Known Defects / [`GH#35`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/35). The case's own test data uses a hyphen, which the live Tags field's own validation rejects ("Only alphanumeric characters, white space, comma and underscore allowed"). This is case-text drift, not a product defect (reverse-masking guard) — the live, correct contract is asserted here with an underscore substitute that preserves the case's intent (a third, distinct multi-word tag).

### Must Clean Up (in teardown)
- Delete the generated agent via the UI delete flow (see § Cleanup) — confirmed via `DELETE /api/v2/elitea_core/application/prompt_lib/{ownerId}/{agentId}` → `204`
- No tag cleanup needed — tags are shared/reusable account-level entities (same as TC-011's finding), not created/owned per-agent; deleting the agent does not delete the `testing`/`qa_suite` tag entities from the account's tag pool, and that's correct/expected (confirmed the Tags filter panel on `/app/agents/all` still listed `testing`/`qa_suite` immediately after this agent's deletion — not re-verified after, out of scope for this case's teardown)

## Test Steps

1. Navigate to `${BASE_URL}/app/agents/all`
   - **Verify**: URL is `${BASE_URL}/app/agents/all`
2. Wait for the agents list to finish its initial load — condition wait on the `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?...agents_type=classic...offset=0` response (200) plus at least one `.MuiCard-root` visible inside `#EliteACustomTabPanel` (established TC-003/TC-010/TC-015 handle) — **not** a fixed 10s sleep (re-authored from the case's literal "wait 10 seconds", per `.agents/testing.md` § Conventions)
3. Dismiss any blocking overlay if present — **not observed on this route during exploration** (the "Announcing ELITEA 2.0.4!" release banner appears on `/app/chat/` post-login, dismissed there via its `button "close"`; did not reappear on `/app/agents/all` or the create form)
4. Click the "Create Agent" control in the left sidebar
   - **Verify**: URL becomes `${BASE_URL}/app/agents/create?viewMode=owner` — the control's accessible name is **"Agent"**, not "Create Agent" (same drift already filed as [`GH#30`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/30) by the TC-015 analyst; not re-filed here)
5. Fill `textbox "Name *"` with the generated agent name (≤32 chars — see § Test Data)
   - **Verify**: read back the field's actual value — guards the GH#27 silent-truncation risk (do not just trust `fill()` succeeded)
6. Fill `textbox "Description *"` with `Agent for testing multi-select tags`
   - **Verify**: field contains the value
7. Click into `combobox "Tags"`
   - **Verify**: combobox receives focus (`[active]` in the accessibility tree)
8. Type `automation`
   - **Verify**: a `listbox "Tags"` renders (outside the normal DOM tree — MUI Popper pattern, query it via `page.getByRole('listbox', { name: 'Tags' })` not a CSS descendant selector) containing `option "automation"` — confirms the pre-existing account tag is surfaced as a live suggestion while typing
9. Press `Enter`
   - **Verify**: tag "automation" renders as a chip — `button "automation"` containing the label text plus a delete-icon `img` — inside the Tags field's container; the standalone suggestion listbox closes
10. Click into `combobox "Tags"` again
    - **Verify**: combobox regains focus/expanded state; the "automation" chip remains visible (unaffected)
11. Type `testing` and press `Enter`
    - **Verify**: tag "testing" renders as a second chip (`button "testing"`); the first "automation" chip remains visible. **No suggestion listbox appeared for this value** during exploration (unlike step 8) — `testing` has no matching pre-existing account tag, so the freeSolo/new-tag path renders no dropdown; do not assert listbox presence unconditionally, treat it as conditional on an existing-tag match
12. Click into `combobox "Tags"` again, type the case's literal third-tag value `qa-suite`
    - **Verify (CLARIFICATION — case-text drift, not a defect)**: a red inline validation message renders directly under the Tags field: `"Only alphanumeric characters, white space, comma and underscore allowed"`. See [`GH#35`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/35).
13. Press `Enter` with the invalid value still in the field
    - **Verify**: no third chip is created; the combobox's typed text is silently cleared (the invalid string is discarded, not submitted) — this is the live, correct contract; automation must NOT expect a chip here
14. Clear residual state if any (`combobox.fill('')`) and type the validation-compliant substitute `qa_suite`, then press `Enter`
    - **Verify**: no validation message renders while typing (underscore is accepted); after Enter, tag "qa_suite" renders as a third chip; "automation" and "testing" chips remain
15. Verify all three tags are visible in the Tags field
    - **Verify**: exactly three chip `button`s render with names `automation`, `testing`, `qa_suite` (order = insertion order, not alphabetical)
16. **(Deep-dive addition, not in the original case's step list)** Click the "testing" chip button directly (its entire clickable area, not just the inner delete icon)
    - **Verify**: the "testing" chip is removed; the Tags field now shows exactly two chips (`automation`, `qa_suite`); no page reload/navigation occurs. Confirms the chip's own `button` element — not a separate nested icon-only control — is the removal trigger; `page.getByRole('button', { name: tagName, exact: true }).click()` alone is sufficient, no need to sub-target the icon
17. Re-add `testing` (click combobox, type `testing`, press `Enter`) to restore the full three-tag set before saving
    - **Verify**: three chips present again (`automation`, `qa_suite`, `testing` — note the re-add changes insertion order, `testing` now renders last)
18. Click "Save" button
    - **Verify**: `POST /api/v2/elitea_core/applications/prompt_lib/{ownerId}` returns `201`; response body's `version_details.tags` array contains exactly three entries — `{name:"automation",...}`, `{name:"qa_suite",...}`, `{name:"testing",...}` (each with its own `id`/`data.color`); response `name` field reflects the (possibly GH#27-truncated) agent name
19. Wait for redirect to the agent detail page — condition wait on `waitForURL(/\/app\/agents\/all\/\d+/)`, **not** a fixed sleep
    - **Verify**: URL matches `${BASE_URL}/app/agents/all/{id}?destTab=configuration&name={name}&viewMode=owner` — note this is `/app/agents/all/{id}`, **not** the case's stated `/app/agents/{id}`. Already-filed, corroborated case-text drift — see [`GH#28`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/28) (filed by TC-011's analyst, independently corroborated by TC-010/TC-016; not re-filed here)
20. Verify `combobox "Tags"` on the detail page displays all three tags
    - **Verify**: three chip `button`s (`automation`, `qa_suite`, `testing`) render identically to the create-form's pre-save state
21. **(Deep-dive addition)** Hard-reload the detail page (`page.reload()`)
    - **Verify**: after reload, the same three chips render in the same order, sourced from a fresh `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{agentId}` (200) — proves server-side persistence, not just client-side state retained across a soft navigation
22. Navigate to `${BASE_URL}/app/agents/all`
    - **Verify**: URL is `${BASE_URL}/app/agents/all`
23. Wait for lazy loading — same condition wait as step 2
24. Locate the agent card for the generated name
    - **Verify**: card is visible inside `#EliteACustomTabPanel .MuiCard-root` (established handle)
25. Verify the agent card displays tags
    - **Verify**: the card design **does** include tags — confirmed rendering two of the three tag names as inline chips (`testing`, `qa_suite` observed) plus an overflow indicator (`"+1"`) for the third (`automation`), matching the same 2-visible+overflow pattern TC-011's sibling agent card already established. Card tag order is not guaranteed to match the field's insertion order (observed as `testing`, `qa_suite`, "+1" here — the field itself had `automation, qa_suite, testing` at save time)

## Expected Results
- Agent is created with three tags (`automation`, `qa_suite`, `testing` — the case's own `qa-suite` value is unautomatable as literal test data, see § Known Defects) successfully
- Tags persist across: form → save → detail page → hard reload → list-card display
- Tag chips are individually removable via a single click on the chip's own `button` element (no need to sub-target a nested icon)
- The Tags combobox surfaces live suggestions for pre-existing account-level tags while typing (a MUI Popper `listbox`, rendered outside the normal form DOM subtree)
- Tags field enforces a client-side character-set validation (alphanumeric, whitespace, comma, underscore) with a clear, real-time inline error message — no silent data corruption, but also no toast/snackbar after the fact, so a user who doesn't watch the field live has no persistent record of the rejection
- Agent cards on the list view render tags (2 visible + `"+N"` overflow), confirming the case's own conditional Expected Result ("if tags are displayed on agent cards") — they are
- URL after the full flow (post-teardown-navigation) is `/app/agents/all`
- Zero console errors/warnings throughout (confirmed: 0 errors, 0 warnings for the full session)
- All underlying API responses are `2xx` except the deliberately-invalid step 12–13 interaction, which produces no network request at all (client-side-only rejection, confirmed via the request log — no `POST`/validation-endpoint call fires for the rejected `qa-suite` attempt)

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Preconditions: app accessible, user authenticated, window maximized | environment ready | precondition | confirmed pre-navigation: no login redirect; viewport handled at project-config level | asserted |
| Setup 1: maximize browser window | all UI elements visible | precondition | translated to fixed `1920×1080` viewport config, per TC-001–005/TC-015 convention | asserted *(re-authored)* |
| Setup 2: verify authenticated state via `/app/chat/` | no redirect = authenticated | precondition | confirmed: no redirect, landed on `/app/chat/` | asserted |
| Test Data: Name/Description/Tag 1–3 values | data available for form fill | steps 5–6, 8–17 | each field's fill + verify | asserted *(Tag 3 substituted — see Known Defects/GH#35)* |
| 1 Navigate to `/app/agents/all` | agent list page loads | step 1 | step 1: URL | asserted |
| 2 Wait 10s for lazy loading | all agent cards visible | step 2 | step 2: condition wait on API response + card visibility | asserted *(re-authored: condition wait, not fixed sleep)* |
| 3 Close any modal dialogs if present | modal dismissed | step 3 | step 3: not observed on this route this run; dismiss-if-present branch documented | asserted *(conditional — not exercised)* |
| 4 Click "Create Agent" button in left sidebar | form opens at `/app/agents/create?viewMode=owner` | step 4 | step 4: URL exact match | asserted *(re-authored: accessible name is "Agent", not "Create Agent" — GH#30, not re-filed)* |
| 5 Fill `textbox "Name *"` | field contains value | step 5 | step 5: value read-back | asserted *(decomposed: also documents GH#27 32-char cap — see Known Defects)* |
| 6 Fill `textbox "Description *"` | field contains value | step 6 | step 6 | asserted |
| 7 Click into `combobox "Tags"` | Tags combobox receives focus | step 7 | step 7: `[active]` state | asserted |
| 8 Type `automation` and press Enter | tag "automation" appears as a chip | steps 8–9 | step 8: suggestion listbox; step 9: chip renders | asserted *(decomposed — discovered live-suggestion behavior, see Axis 2)* |
| 9 Click into `combobox "Tags"` again | combobox receives focus, previous tag remains visible | step 10 | step 10: focus + chip persistence | asserted |
| 10 Type `testing` and press Enter | tag "testing" appears as a second chip | step 11 | step 11: chip renders, no suggestion for new value | asserted |
| 11 Click into `combobox "Tags"` again | combobox receives focus, both previous tags remain visible | step 12 (partial — click covered; case doesn't split click from type at this position) | step 12: focus verified before typing `qa-suite` | asserted |
| 12 Type `qa-suite` and press Enter | tag "qa-suite" appears as a third chip/badge | steps 12–14 | step 12: validation error observed (CLARIFICATION); step 13: Enter rejected, no chip; step 14: valid substitute `qa_suite` accepted and chips | clarification *(GH#35 — case's own test data violates the live field's own validation rule; live/correct contract asserted with substitute value)* |
| 13 Verify all three tags are visible | Tags displayed: "automation", "testing", "qa-suite" | step 15 | step 15: three chips, with `qa_suite` substituted for `qa-suite` | asserted *(substituted value, see GH#35)* |
| 14 Click "Save" button | Agent is saved successfully | step 18 | step 18: `POST` → `201`, response body tags array | asserted |
| 15 Wait for redirect to agent detail or list page | Save operation completes | step 19 | step 19: `waitForURL` condition wait | asserted *(re-authored: condition wait, not fixed sleep)* |
| 16 Navigate to agent detail page if not already there | Agent detail page loads at `/app/agents/{id}` | step 19 (already there post-redirect) | step 19: URL is `/app/agents/all/{id}?...`, not `/app/agents/{id}` | asserted *(re-authored — URL shape drift, documented, not filed — see step 19 note)* |
| 17 Verify `combobox "Tags"` displays all three tags | All tags persisted: "automation", "testing", "qa-suite" | step 20 | step 20: three chips (substituted `qa_suite`) | asserted |
| 18 Navigate to `/app/agents/all` | Agent list page loads | step 22 | step 22: URL | asserted |
| 19 Wait 10s for lazy loading | All agent cards load | step 23 | step 23: condition wait | asserted *(re-authored: condition wait, not fixed sleep)* |
| 20 Locate agent card | Agent card is visible | step 24 | step 24: `.MuiCard-root` visible | asserted |
| 21 Verify agent card displays the tags (if visible in card UI) | Tags appear on the agent card (if card design includes tags) | step 25 | step 25: 2 visible chips + "+1" overflow | asserted *(conditional resolved: card design DOES include tags)* |
| Expected Final State: agent created with 3 tags, tags visible on detail page + persist, tags on card if applicable, URL `/app/agents/all` | overall outcome | steps 18–25 | steps 18–25 combined | asserted |
| Teardown: navigate to detail, menu → Delete agent → confirm → verify removed | agent deleted, removed from list | § Cleanup | `DELETE .../application/prompt_lib/{ownerId}/{agentId}` → `204`; card absent post-deletion | asserted *(re-authored: confirm mechanism is type-exact-name + "Delete" button, not "Confirm" — already-filed drift, see GH#28)* |

### Axis 2 — Analyst additions

- Step 8 asserts the **live suggestion listbox** (`role="listbox"`, MUI Popper pattern rendered outside the form's DOM subtree) appearing for `automation` — *added: the case doesn't mention this UI behavior at all; discovered it's driven by `GET /api/v2/elitea_core/tags/prompt_lib/{ownerId}` account-level tag data (pre-existing tags get suggested, novel ones don't) — a meaningful behavioral distinction an implementer needs to know before writing a flaky "listbox always appears" assertion.*
- Step 16 (chip removal) — *added entirely: the original case has no removal step at all. Per this analyst's dispatch brief ("deep dive: add multiple tags, remove one, verify chip rendering"), this is required scope, not scope creep. Discovered the chip's own `button` wrapper is the full click target for removal (no need to target a nested icon specifically) — a materially simpler automation handle than assuming icon-only removal.*
- Step 21 (hard reload before navigating away) — *added: the case's own step 16→17 only checks the detail page loads with tags after the *save redirect* (a client-side navigation, which could theoretically retain stale in-memory state). A hard `page.reload()` forces a fresh server round-trip, which is the stronger, dispatch-requested "verify persistence" proof — confirms server-side storage, not just client cache.*
- Expected Results adds "zero console errors/warnings" — *added: verified clean (0 errors, 0 warnings) across the full session; guards against a silent regression the case's own steps don't check for.*
- Expected Results adds "no network request fires for the rejected `qa-suite` attempt" — *added: confirms the Tags validation is purely client-side (no wasted round-trip, no risk of a half-created server-side tag entity from a rejected value).*
- Bonus discovery (not asserted as a required step — informational only, see § Automation Hints): the Agents list page has a **Tags filter panel** (right-hand sidebar, `Tags` heading + one `button` per known account tag) that includes newly-created tags immediately after save, and clicking one filters the grid via `?tags[]={tagName}` query param. Not part of this case's scope; flagged for a future dedicated tag-filtering case if one doesn't already exist in the batch.

## Cleanup
1. Navigate to the agent detail page (`/app/agents/all/{id}?destTab=configuration&name={name}&viewMode=owner`)
2. Click the (unnamed, `#undefined-action`) three-dot menu button in the top-right toolbar
3. Click "Delete agent" menuitem (distinct from the disabled "AGENT" section's grayed-out `Delete` item, which belongs to the *version*, not the agent — see § Concrete Handles)
4. In the "Delete confirmation" dialog, type the agent's exact (possibly GH#27-truncated) name into the Name textbox — the "Delete" button stays `[disabled]` until the value matches exactly (case's Teardown text says click "Confirm" — already-filed drift, see [`GH#28`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/28))
5. Click "Delete"
6. Verify redirect to `${BASE_URL}/app/agents/all`
7. Verify the agent card is no longer present in the list
8. Verify `DELETE /api/v2/elitea_core/application/prompt_lib/{ownerId}/{agentId}` returned `204`

Confirmed executed end-to-end during this exploration — agent id `277` created and deleted, zero residue.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| "Create Agent" sidebar control | `page.locator('nav[aria-label="side-bar"]').getByRole('button', { name: 'Agent', exact: true })` — accessible name is **"Agent"**, not "Create Agent" (GH#30) | adjacent dropdown-chevron button (unnamed) |
| Name field | `page.getByRole('textbox', { name: 'Name *' })` | none needed — tier-1 handle |
| Description field | `page.getByRole('textbox', { name: 'Description *' })` | none needed — tier-1 handle |
| Tags combobox | `page.getByRole('combobox', { name: 'Tags' })` | none needed — tier-1 handle |
| Tags live-suggestion listbox (conditional — only for tags matching an existing account tag) | `page.getByRole('listbox', { name: 'Tags' })` then `.getByRole('option', { name: tagName })` — renders via MUI Popper **outside** the form's DOM subtree, do not scope to a form container | none needed — but must not assert unconditional presence (see step 11 note) |
| Tag chip (after add) | `page.getByRole('button', { name: tagName, exact: true })` scoped to the Tags field's container — **the whole button is the delete trigger**, clicking anywhere on it (not just the inner icon) removes the chip | `.MuiChip-root:has-text(tagName)` |
| Tag chip's inner delete icon (not required to target directly) | `page.getByRole('button', { name: tagName }).locator('img')` | n/a — targeting the parent button is sufficient and simpler |
| Tags field inline validation message | `page.getByText('Only alphanumeric characters, white space, comma and underscore allowed')` | CSS: red-colored text node immediately below the Tags field's container |
| Tags field "Clear" (clears all tags at once — not exercised as a removal path this run, only individual-chip removal was) | `page.getByRole('button', { name: 'Clear' })` scoped to the Tags field | none needed — tier-1 handle, low priority |
| Form "Save" button | `page.getByRole('button', { name: 'Save' })` — `[disabled]` on a pristine form, enabled once dirtied | none needed — tier-1 handle |
| Agent detail page Tags combobox (post-save) | same `page.getByRole('combobox', { name: 'Tags' })` — re-renders read/write-identical to the create form | none needed |
| Detail page three-dot menu button | **No accessible name** — Playwright resolves it as `page.locator('#undefined-action')` (the app's own id template appears to concatenate `${x}-action` with `x` evaluating to `undefined` — cosmetic DOM defect, see GH#38 minor note, not blocking) | position-based: last icon-only `button` in the version-toolbar row |
| "Delete agent" menuitem | `page.getByRole('menuitem', { name: 'Delete agent' })` — distinct from the disabled "AGENT"-section grayed-out `Delete` item (that one targets the *version*, is `[disabled]` on the sole/default version) | none needed — tier-1 handle |
| Delete confirmation dialog (drift from case's "Confirm" wording — GH#28) | `page.getByRole('dialog').filter({ hasText: 'Delete confirmation' })` | `page.getByRole('heading', { name: 'Delete confirmation' })` |
| Delete confirmation Name textbox | `page.getByRole('dialog').getByRole('textbox')` (single unlabeled textbox in this dialog) | scope by dialog + element order |
| Delete confirmation "Delete" button | `page.getByRole('dialog').getByRole('button', { name: 'Delete' })` — `[disabled]` until Name textbox exactly matches the agent name | none needed — tier-1 handle, but assert enabled-state transition |
| Agents-list Tags filter panel entry (bonus discovery, informational) | `page.getByRole('complementary').getByRole('button', { name: tagName, exact: true })` — not scoped/verified precisely this run (informational only, out of case scope) | n/a |
| Agent card tag chips (list view) | text-match within the located `.MuiCard-root` — no dedicated `data-testid`, same GH#12 floor TC-003/TC-010/TC-011 already documented for the card root itself | n/a — inherits the card-level fallback already on file |

## Network Behavior
- `GET /api/v2/elitea_core/tags/prompt_lib/{ownerId}?offset=0&limit=50` — fires on the create-form mount (feeds the Tags combobox's live-suggestion source); returns the account's existing tag pool (id/name/color per tag)
- `POST /api/v2/elitea_core/applications/prompt_lib/{ownerId}` — fires on Save click, `201` on success. Response body includes `id` (new agent id, `277` this run), `version_details.id` (new version id, `302`), `version_details.tags: [{id, name, data:{color}}]` — confirmed all three committed tags present with server-assigned ids (`automation`→9, `qa_suite`→12, `testing`→11), `name` (subject to GH#27's 32-char cap — response already reflects the truncated value, confirming client-side-before-request truncation, not server-side)
- `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{agentId}` — fires on detail-page mount and on hard reload; response shape identical to the create response, same `version_details.tags` array — this is the authoritative persistence proof for step 21 (hard reload)
- No request fires for the rejected `qa-suite` Enter attempt (step 13) — confirmed via full request-log inspection around that interaction; the validation is purely client-side
- `DELETE /api/v2/elitea_core/application/prompt_lib/{ownerId}/{agentId}` — fires on the confirmed delete, `204` on success (teardown)
- Analytics beacons (`google-analytics.com/g/collect`) and `socket.io` polling fire continuously in the background — unrelated noise, not part of this case's assertions
- Wait strategy for the implementer: `page.waitForResponse(resp => resp.url().includes('/applications/prompt_lib/') && resp.request().method() === 'POST' && resp.status() === 201)` after Save (step 18); `page.waitForURL(/\/app\/agents\/all\/\d+/)` for the post-save redirect (step 19); `page.waitForResponse(resp => resp.url().match(/\/application\/prompt_lib\/\d+\/\d+$/) && resp.status() === 200)` after `page.reload()` (step 21) — no fixed-duration sleeps anywhere

## Known Defects Found During Exploration

No *new* blocking product defects. One genuinely novel CLARIFICATION was filed; two other findings turned out to already be on file and were corroborated via comments instead of duplicate tickets (one of those required a correction — see note):

- **[INFO/CLARIFICATION] — filed, novel** [`GH#35`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/35): the case's own Test Data for Tag 3 (`qa-suite`) contains a hyphen, which the live Tags field's own client-side validation rejects ("Only alphanumeric characters, white space, comma and underscore allowed"). Confirmed **not** a product defect — the validation is intentional and clearly surfaced in real time (a persistent red inline message while the invalid text is present); it's the case's own test data that's stale against the live contract. This AFS substitutes `qa_suite` (underscore) for Tag 3 throughout, per the reverse-masking guard. Confirmed novel via a full comment-body search across all open issues (not just title/body) before filing — see the near-duplicate-filing trap note below.
- **[INFO/CLARIFICATION] — not filed, already on file, corroborating comment added**: the case's Teardown says "Confirm deletion in modal dialog by clicking 'Confirm'" — the live dialog's button is labeled **"Delete"**, is `[disabled]` until the agent's exact name is typed into a Name textbox, and there is no button literally labeled "Confirm" anywhere in the flow. **Self-correction**: this analyst initially filed this as a new ticket (`GH#38`) before discovering — via the team's daily-log memory, not the pre-filing `gh issue search` — that TC-011's analyst had already filed this exact finding as an **addendum comment** on [`GH#28`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/28) (corroborated further by TC-010 and TC-016). Closed `GH#38` as a duplicate and consolidated a fourth corroboration onto `GH#28` instead. This is the **third** independent instance of the exact same "`gh issue search` doesn't match comment bodies" trap in this batch (TC-010, TC-016, now TC-017) — see this analyst's memory write-up for the escalation recommendation.
- **[MINOR] — not filed, corroborating comment added to existing ticket**: Agent Name field's silent 32-character truncation cap, already filed as [`GH#27`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/27) by the TC-011 analyst and independently corroborated by TC-010. This exploration hit it a third+ time (`TEST_Agent_Tags_TC017_1783017501511`, 35 chars → persisted as `TEST_Agent_Tags_TC017_1783017501`, 32 chars, dropping the trailing `511`). Added a corroborating comment to GH#27 rather than filing a duplicate. See § Test Data for the exact-character-budget constraint this AFS's own generated name must respect.

## Blocked Steps
None. All Preconditions/Setup steps and all 21 case steps (plus the deep-dive additions requested in this analyst's dispatch brief — chip removal, hard-reload persistence check) were executed end-to-end against the live system, along with full Teardown (agent id `277` created and deleted, verified via both UI and the `DELETE` network response).

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md`. Per the `.agents/testing.md` § Structure module plan, this case lands in `tests/agents.spec.ts` (batched with the rest of the `agents` module TC-010..019) — no dependency on TC-001–005's session state, a fresh login is sufficient.
- Page object: reuse `tests/pages/cardGridList.page.ts` for list-state assertions (steps 1–3, 22–25). The create-form fields and Tags-combobox interactions (steps 4–21) are strong candidates for the shared `tests/pages/agentForm.page.ts` that TC-010/TC-011/TC-014/TC-015 all recommend extracting — this case's Tags-specific methods (`addTag(name)`, `removeTag(name)`, `expectChips([...])`) should live there so TC-011 (smoke-touches tags) and any future tag-related case reuse them instead of re-deriving locators.
- Test-data helper: this case is one more (of at least TC-010, TC-011, TC-014, TC-015, now TC-017) that needs the "≤32-char, timestamp-suffixed unique name" budget from GH#27 — strongly reinforces TC-011's own recommendation to centralize this in `tests/fixtures/testData.ts` rather than each spec re-deriving the character math independently.
- Tag-add helper should accept a "expect validation error" flag/variant so the same helper can express both the happy path (steps 8–9, 11) and the deliberately-invalid path (steps 12–14) without duplicating the click→type→Enter sequence.
- Wait strategy: no `waitForTimeout` anywhere — every "wait N seconds" in the original case is re-authored into a `waitForResponse` condition wait (see § Network Behavior) or a web-first `expect(...).toBeVisible()`, per `.agents/testing.md` § Conventions.
- **Analyst execution note (process/tooling, not product):** ran in a `playwright-cli -s=TC017` isolated session (own in-memory Chrome profile, own pid) — per `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`, this batch dispatched up to 10 concurrent sibling analysts (TC-010–TC-019) against the same shared account/browser-MCP surface, and the project's default `mcp__playwright__*` MCP connection is a single shared, non-isolated profile across concurrent sessions. Verified isolation by confirming a fresh Keycloak login redirect on first navigation (no inherited cookies). No cross-talk observed this run (sibling agents TC-011/TC-012/TC-013/TC-019/TC-010 visible in the shared account's agent list, as expected, but no tab/session hijacking occurred). Does not affect the eventual automated suite, since `npx playwright test` workers each get their own isolated browser context regardless.
