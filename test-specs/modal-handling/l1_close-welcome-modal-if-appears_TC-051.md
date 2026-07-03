# Test Case: Close Welcome Modal If Appears

## Metadata
- **TMS ID**: TC-051
- **Linked Story**: GH#66 (own clarification — no live `[role="dialog"]` welcome modal exists), GH#67 (own clarification — Step 1 URL drift, collides with TC-050/#59), parent epic #16, tracking issue #60
- **Priority**: l1
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`) — isolated `playwright-cli -s=TC-051` session (own persistent Chrome profile under the scratchpad dir), run in parallel with 6 sibling analysts (TC-050, TC-052..056). Re-verified `window.location.href` after every navigation per the standing parallel-analyst-isolation mitigation; every read matched the action just taken.
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) via Keycloak SSO — confirmed handles as established in prior modules (`getByRole('textbox', { name: 'Username or email' })` / `'Password'` / `getByRole('button', { name: 'Sign In' })`)
- Browser viewport: use this project's existing convention (1920×1080 / smoke-suite default) rather than the case's literal "maximize window" instruction — headless has no real "maximize" concept (same re-authoring already applied by sibling AFS files in this batch, e.g. TC-028's Preconditions)
- **This case's own precondition ("user may be in a state where welcome/onboarding modal has not been dismissed") could not be independently forced or verified true** — see Known Defects / GH#66. `${TEST_USER}` is the only sample user configured in `.agents/profile.md`, and it is a shared account reused continuously across this entire batch, so a genuine first-time-account state is not reachable with the current test-data setup.

## Test Data

### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`

### Must Generate (in test setup)
- None.

### Must Clean Up (in teardown)
- None — matches the case's own Teardown ("modal dismissal persists for session but does not affect other tests").

## Test Steps

1. After login, navigate to `${BASE_URL}/app/chat/` — **re-authored from the case's literal `${BASE_URL}/app/chat/all`**, see Known Defects / GH#67: that literal URL does not match the app's real route (confirmed live: `all` is parsed as a conversation id, not a list-view keyword, and produces sibling case TC-050's own "Conversation not found" `[role="dialog"]` instead of a clean chat view). `${BASE_URL}/app/chat/` is the confirmed handle already established in `.agents/testing.md` and used by TC-001/TC-002 — it auto-redirects to the user's most recent conversation (observed: `/app/chat/37?name=New+conversation+test` for this account).
   - **Verify**: page loads successfully, no navigation error
2. Wait for the page to stabilize — **re-authored from the case's literal "wait 3 seconds"** per this project's no-`waitForTimeout` convention (`.agents/testing.md` § Conventions): wait for the chat view's own load signal (e.g. `networkidle`, or the first `.MuiCard-root`/conversation-history render) instead of a fixed sleep.
   - **Verify**: page render completes (condition-based, not timed)
3. Check for presence of a modal using the `[role="dialog"]` selector
   - **Verify**: either branch is valid — modal present, or (confirmed live, this run) no modal exists
4. If modal is present: identify the close button text (`"Got it"`, `"Close"`, `"Start"`, or similar) and click it
   - **Verify**: modal closes, `[role="dialog"]` no longer exists
   - **Not exercised live this run** — see Known Defects / GH#66. Implement defensively per the case's own conditional design (this is a completely standard "dismiss-if-present" pattern), but do not treat this branch as proven coverage — it never triggered under any of the three conditions tested (fresh load, reload, full `localStorage.clear()`).
5. Verify page is interactive by checking for clickable elements (sidebar icons, "Create" button)
   - **Verify**: confirmed live — sidebar `nav[aria-label="side-bar"]` renders with all its icon buttons (Chat, Agents, Skills, Pipelines, Credentials, Toolkits, Applications, MCPs, Artifacts), and the sidebar's quick-create button (`getByRole('button', { name: 'Conversation', exact: true })` — accessible name is `"Conversation"`, not `"Create"`, already tracked under existing `GH#9`, not re-filed here) is `enabled`, not just visible.

## Expected Results
- If a welcome modal appeared, it has been dismissed and `[role="dialog"]` no longer exists.
- If no welcome modal appeared (the confirmed live state for `${TEST_USER}` as of this run), the page is still fully interactive — no bare-omission "did nothing" outcome.
- Sidebar navigation buttons are visible AND enabled after either branch.
- No console errors in either branch.

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Preconditions: "user may be in a state where welcome/onboarding modal has not been dismissed" | modal reachable under some condition | — | tried fresh load, page reload, AND full `localStorage.clear()` + reload — none surfaced a `[role="dialog"]` | clarification *(GH#66 — premise doesn't hold for the only configured test account; not a defect, case's own step 3 already treats "no modal" as valid)* |
| 1 Navigate to `{{base_url}}/app/chat/all` | page loads successfully | step 1 | step 1: re-authored to `${BASE_URL}/app/chat/` | clarification *(GH#67 — literal URL collides with TC-050's dialog instead of loading cleanly)* |
| 2 Wait 3 seconds for page to stabilize | page render completes | step 2 | step 2: condition wait, not fixed sleep | asserted *(re-authored per project's no-`waitForTimeout` convention)* |
| 3 Check for presence of modal via `[role="dialog"]` | either present or absent, both valid | step 3 | step 3: `document.querySelectorAll('[role="dialog"]').length` — confirmed `0` this run, across 3 independent checks | asserted |
| 4 If present: identify close button text | button visible inside modal | step 4 | not exercised live (branch never triggered) | clarification *(GH#66 — implemented defensively per case design, unverified against live product)* |
| 5 If present: click close button | modal closes, `[role="dialog"]` gone | step 4 | not exercised live (branch never triggered) | clarification *(GH#66, same as above)* |
| 6 Verify page interactive (sidebar icons, "Create" button) | elements responsive, no overlay blocking | step 5 | step 5: sidebar nav rendered, "Conversation" quick-create button confirmed `enabled` | asserted *("Create" button naming already tracked under existing `GH#9`, not re-filed)* |
| Expected Final State: modal dismissed if it appeared, no `[role="dialog"]` exists, page fully interactive | all conditions hold | steps 3–5 | step 3 (absence confirmed), step 5 (interactivity confirmed) | asserted |

### Axis 2 — Analyst additions
- Investigated and ruled out the "Announcing ELITEA 2.0.4!" release-notes banner as a match for this case's premise — *added: the banner is a superficially similar post-login "welcome-style" overlay already documented in `GH#42` and handled by `dismissAnnouncementBanner()` in `tests/pages/entityForm.page.ts`, but it is confirmed to be a structurally different element (no `role="dialog"` anywhere in its DOM ancestor chain; close button accessible name is exactly `"close"`, not `"Got it"`/`"Close"`; dismissed-state persists via a distinct `localStorage` key, `maintenance_banner_dismissed`, not any onboarding/welcome flag). Documented in full on GH#66 so no future analyst re-investigates this same question for the modal-handling module.
- Asserted the sidebar quick-create button is specifically `enabled` (not just present/visible) after the flow completes — *added: the case's own Step 6 says "responsive"/"no overlay blocking interaction", which a bare presence check doesn't prove; an `enabled` assertion does.*
- Checked console messages for errors after both the initial load and the (unreachable) modal-dismiss branch — *added: standard side-channel check per this batch's convention; 0 errors/warnings observed (1 benign ASCII-art build-banner `[LOG]` entry, same noise pattern as every other module).*

## Cleanup
None — matches the case's own Teardown. No fixtures were created; `localStorage.clear()` performed during investigation was undone by the natural re-render of the banner (harmless, and the account's other settings — `elitea_ui.project.id`/`elitea_ui.project.name` — repopulate from the session on next interaction/reload).

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Modal (if present) | `page.getByRole('dialog')` | `page.locator('[role="dialog"]')` — **unverified live**, no instance ever observed to confirm against; both are the case's own selector, kept as the best-available fallback |
| Modal close button (if present) | `dialog.getByRole('button', { name: /got it\|close\|start/i })` | `dialog.getByRole('button').first()` — **unverified live**, same caveat as above |
| Sidebar nav landmark | `page.getByRole('navigation', { name: 'side-bar' })` — confirmed handle, already established in `.agents/testing.md` | `page.locator('nav[aria-label="side-bar"]')` |
| Sidebar quick-create button | `page.getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` — confirmed handle from `.agents/testing.md`; case's own `"Create"` hint does not exist (`GH#9`) | n/a |
| Sidebar icon buttons (Agents / Pipelines / etc.) | `page.getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Agents' \| 'Pipelines' \| ... })` | n/a — role+name resolves cleanly, no test IDs needed |
| Announcement banner (ruled out, NOT this case's modal — do not conflate) | `page.getByRole('button', { name: 'close' })` via existing `dismissAnnouncementBanner()` helper | n/a — documented for disambiguation only, see GH#66 |

## Network Behavior
No mutating network traffic in scope — this is a pure UI presence/dismiss check. `GET`/`POST` calls fire as part of normal chat-page load (support-assistant config, chat config, model config) but none are specific to this case's assertions; no wait strategy beyond the page's own load/render completion is needed.

## Known Defects Found During Exploration

- **[INFO / CLARIFICATION]** No `[role="dialog"]` welcome/onboarding modal exists in the live product for `${TEST_USER}` under any of 3 independently-tested conditions (fresh load, reload, full `localStorage.clear()` + reload). The only post-login "welcome-style" overlay is the non-modal "Announcing ELITEA 2.0.4!" banner (`GH#42`), which is a **different element with a different contract** (no dialog role, different close-button name, different persistence key). Filed as [`GH#66`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/66). Not a product defect — the case's own Step 3 already treats "no modal exists" as a fully valid outcome; this is a case-authoring premise that doesn't hold for the only configured test account, handled per the reverse-masking guard (assert the live contract, don't force a "defect").
- **[INFO / CLARIFICATION]** Case's Step 1 URL (`{{base_url}}/app/chat/all`) does not match the confirmed real chat route (`{{base_url}}/app/chat/`) and instead triggers sibling case TC-050's own "Conversation not found" `[role="dialog"]` (`all` is parsed as a literal conversation id on this route, unlike `/app/agents/all`/`/app/pipelines/all` where `all` is a valid list-view segment). Filed as [`GH#67`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/67).
- **[INFO / CLARIFICATION — not re-filed]** Case's Step 6 "Create" button — accessible name is `"Conversation"`, no `"Create"` prefix exists, already tracked under existing `GH#9` (case-text drift, same root cause as TC-002's finding). No new ticket filed.
- **Pre-filing duplicate check performed** (per this batch's standing process fix): ran `gh issue list --state all --search "chat/all"`, `"Conversation not found"`, `"TC-050"`, `"TC-051"` and read `gh issue view 59 --comments` (TC-050's own tracking issue — zero comments at time of check) before filing either GH#66 or GH#67, confirming no prior/duplicate coverage.
- **Impact on automation**: none blocking. The case is fully automatable as a defensive conditional exactly as authored; only the "modal present" branch is currently unverified against the live product (see Concrete Handles) and should not be reported as proven coverage until/unless a real occurrence is observed (e.g. CI should not fail if this branch never triggers — that is the expected steady state, not a gap).

## Blocked Steps
None. The case's own 6 numbered steps (plus its own Precondition) were executed end-to-end against the live system. The "modal present" branch (Steps 4–5) could not be *triggered* (not a blocker — it's a confirmed absence, not an access/data/env wall), so it is implemented defensively but unverified; documented above and on GH#66 rather than left as a silent gap.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — this case joins `tests/modal-handling.spec.ts` per the module-by-module delivery plan (`.agents/testing.md` § Structure, GH#16). Not assumed serial with sibling modal-handling cases (TC-050, TC-052..056) — confirm per-module during implementation per the standing convention; this case creates/mutates nothing and has no observed shared-state dependency.
- Suggested shared helper: a `closeWelcomeModalIfPresent(page)` function, structurally identical to `dismissAnnouncementBanner()` in `tests/pages/entityForm.page.ts` but targeting `page.getByRole('dialog')` instead — keep it **separate** from `dismissAnnouncementBanner()`, they are different elements (see Known Defects/GH#66); do not merge them into one helper.
- Wait strategy: no `waitForTimeout` — wait on `networkidle` or the first stable chat-page element (e.g. the message textarea `getByPlaceholder('Type your message...')`, confirmed handle from `.agents/testing.md`) instead of the case's literal "wait 3 seconds".
- Since the "modal present" branch is unreachable with current test data, write the assertion so it passes cleanly on the "absent" branch (the actual, confirmed steady state) while still containing the presence-check/dismiss/re-check logic for forward compatibility — do not `test.fail()` or skip the conditional logic just because it's currently a no-op branch.
- This is a good "regression guard" candidate: cheap to run, high value if the product ever does introduce a dialog-based onboarding modal (it would be caught and correctly handled rather than blocking a later step in the suite).
