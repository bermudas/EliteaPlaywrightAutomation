# Test Case: Handle Stale Elements During Dynamic Content Update in Agents List

## Metadata
- **TMS ID**: TC-067
- **Linked Story**: GH#80 (tracking issue), parent epic GH#16 (WebQAPreExecuted batch — module: lazy-loading)
- **Priority**: l3
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`)
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via landing on `/app/agents/all` directly with no Keycloak redirect
- Browser viewport maximized (case's own Precondition) — explored at 1920×1080
- **Case's stated precondition "test account contains 12 agents (confirmed count)" is stale** — live account had ~213 agents throughout this exploration (footer badge read "Agents:213" both before and after the run). This is the same shared-account organic-growth drift already documented by TC-003's and TC-060's AFS/issues (#12, #81) — not filed as a new issue, automation must not hardcode a specific total.
- Read-only case (no agent creation/deletion) — safe against the shared, concurrently-used test account.

## Test Data
### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — standard test account
- Whichever agent card is actually first in the list at run time (the case's own steps say "first visible agent card" generically — see Known Defects for why the case's own "Sample agent name: docsbot_library" is not a hard requirement)

### Must Generate
- None — read-only case.

### Must Clean Up
- None — read-only case. Teardown is navigational only (return to list view).

## Test Steps

1. Navigate to `${BASE_URL}/app/agents/all`
   - **Verify**: URL is `${BASE_URL}/app/agents/all`; no redirect to the Keycloak login page (confirms authenticated precondition)
2. Wait for the first agent card to become visible (`cardGridList.waitForFirstCard()`)
   - **Verify**: at least 1 `.MuiCard-root` element is visible inside `#EliteACustomTabPanel`
   - *(re-authored: case's literal "wait 3 seconds" replaced with a condition wait, per `.agents/testing.md` § Conventions)*
3. Read the initial card count and the first card's visible name
   - **Verify**: initial card count = 20 (first auto-loaded page at this viewport — see TC-003 AFS's "tall-viewport auto-fetch" note, same mechanism observed live here); first card's `textContent` captured for later comparison
   - **Clarification**: the case's own step 3 says to locate the card via a `[role="button"]` selector — confirmed live this selector matches **12 elements, zero of which are agent cards** (9 sidebar nav buttons + 3 tag-filter chips: `docsbot_library`, `agent_demo`, `w`). Corrected selector: `#EliteACustomTabPanel .MuiCard-root` (already GH#12/GH#81, re-confirmed here, no new issue filed)
4. Capture a genuine pinned reference to the first card: `await cardGridList.firstCard().elementHandle()`
   - **Verify**: handle is non-null; `await handle.textContent()` equals the name captured in step 3
   - **Automation note**: this must be a real Playwright `ElementHandle`, not a `Locator`. A `Locator` re-resolves lazily on every action and structurally cannot go stale — using one here would make the test unable to exercise what the case is actually about (see § Automation Hints)
5. Scroll `#EliteACustomTabPanel` to bottom (`cardGridList.scrollToBottom()`) to trigger the next paginated fetch
   - **Verify**: `GET .../applications/prompt_lib/{ownerId}?...&agents_type=classic&limit=20&offset=20` fires and returns `200` — wait via `cardGridList.waitForNextPageResponse('agents_type=classic', 20)`
6. Wait for the newly-fetched cards to render (condition wait on the step 5 response, not a fixed sleep)
   - **Verify**: card count strictly increases (confirmed live: 20 → 40 after one scroll cycle, → 60 after a second)
   - *(re-authored: case's literal "wait 2 seconds" replaced with a condition wait)*
7. Attempt to click the handle captured in step 4
   - **Verify (Scenario A — confirmed deterministic against the live app)**: the click succeeds directly, no stale-element exception is thrown. Confirmed live across **two independent scroll/lazy-load cycles** (20→40 and 40→60 cards): the pinned node's `isConnected` stayed `true` and its identity (`===`) matched the live-queried first card throughout — this app's scroll-triggered pagination is **append-only**; it never removes or replaces already-rendered card nodes. See GH#83 for the full write-up of why Scenario B is not reproducible via this trigger.
8. **Defensive fallback (not expected to execute against current app behavior)**: if step 7 throws a stale-element exception, catch it, re-query via `cardGridList.firstCard()`, and click the re-queried locator instead
   - **Verify**: if this branch is ever entered, the click succeeds on the re-queried element. Recommend a log/soft-fail marker if this branch fires in CI — per GH#83, that would mean the app's list rendering changed to a remounting pattern, which is worth a human noticing, not silently absorbing
9. Verify navigation to the agent detail page
   - **Verify**: URL matches `${BASE_URL}/app/agents/all/{id}?viewMode=owner&name={encoded-name}` where `{id}` is the clicked agent's numeric id (**not** the case's originally-authored `${BASE_URL}/app/agents/{id}` pattern — see Known Defects / GH#28, re-confirmed here: navigating to that literal pattern does not reach a detail view)
10. Verify the agent detail page displays correctly
    - **Verify**: `textbox "Name *"` has a value equal to the name captured in step 3/4 (confirms the SAME agent was navigated to, not a different one shifted into first position by concurrent account activity); General/Instructions/Welcome message/Advanced sections render already-expanded (same confirmed contract as TC-016); no console errors

## Expected Results
- A card reference captured *before* a scroll-triggered lazy-load event remains clickable afterward — confirmed deterministic (Scenario A) against the live Agents list; Scenario B (stale-element error) is not reproducible via scroll-triggered lazy load or search-box typing against this app's current implementation (see GH#83)
- Click navigates to `${BASE_URL}/app/agents/all/{id}?viewMode=owner&name={encoded-name}`
- Agent detail page's Name field matches the originally-captured card's name; no console errors
- All `GET .../applications/prompt_lib/...` pagination requests return `200`

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Precondition: test account contains 12 agents (confirmed count) | fixed known agent count | — | — | clarification *(live account has ~213 agents, not 12 — same shared-account growth already documented by #12/#81; not filed separately, automation must not hardcode a total)* |
| Precondition: browser maximized | all UI elements visible | precondition | viewport set 1920×1080 before navigation | asserted |
| Test Data: sample agent name `docsbot_library` | — | — | — | out-of-scope *(case's own steps say "first visible agent card" generically; `docsbot_library` was observed live only as a tag-filter chip, not confirmed as a page-1 card name — not required by the steps, so not a defect; automation uses whatever card is actually first)* |
| 1 Navigate to `/app/agents/all` | Agents page loads | step 1 | step 1 | asserted |
| 2 Wait 3s (partial lazy load) | ≥1 card visible | step 2 | step 2: condition wait on first-card visibility | asserted *(re-authored: condition wait, not fixed sleep)* |
| 3 Locate first card via `[role="button"]` | element found | step 3 | step 3 | clarification *(selector matches 0 cards — see GH#12/GH#81; corrected to `.MuiCard-root`)* |
| 4 Store reference to first card | reference captured | step 4 | step 4: `ElementHandle` captured | asserted *(decomposed: locate (step 3) + capture (step 4) as two AFS steps)* |
| 5 Scroll down to trigger lazy load | more cards appear | step 5 | step 5: network response wait | asserted |
| 6 Wait 2s (new cards loading) | additional cards appear | step 6 | step 6: card-count-increase assertion | asserted *(re-authored: condition wait, not fixed sleep)* |
| 7 Click stored reference | click succeeds OR stale error | step 7 | step 7: click succeeds (Scenario A) | asserted; clarification *(Scenario B never observed against the live app in 2/2 scroll cycles — see GH#83; test asserts Scenario A as the confirmed, deterministic contract)* |
| 8 If stale error, re-locate and click | click succeeds on re-located element | step 8 | step 8: defensive fallback | asserted as dead-but-safe code *(currently unreachable against live app behavior — see GH#83)* |
| 9 Verify navigation to `/app/agents/{id}` | agent detail page loads | step 9 | step 9: URL assertion | clarification *(corrected to `/app/agents/all/{id}?viewMode=owner&name=...` — see GH#28, re-confirmed here)* |
| 10 Verify agent detail page displays correctly | name, form fields visible | step 10 | step 10 | asserted |
| Expected Final State: Scenario A/B narrative + "Key learning" (tests must re-query or use stable selectors) | test handles both scenarios | steps 7–8 | — | asserted, with clarification *(only Scenario A is reachable against the current app; Scenario B's re-query path is implemented but confirmed dead code — see GH#83)* |
| Teardown: navigate back to `/app/agents/all` | return to list view | Cleanup step 1 | Cleanup step 1 | asserted |

### Axis 2 — Analyst additions
- Step 3/4 captures the first card's *name* (not just a generic "reference exists") — *added: needed as a baseline so step 10 can confirm the SAME agent was navigated to, not a different one shifted into first position by concurrent account activity (this account is shared with 7 sibling analysts running in parallel at exploration time).*
- Step 6 asserts card count **strictly increases** (not just "additional cards appear") — *added: makes the lazy-load trigger's effect quantifiable/verifiable rather than qualitative.*
- Step 10 adds an explicit "no console errors" check — *added: per `.agents/testing.md`'s always-check-console discipline; none observed during this exploration (only a benign app-version ASCII-art `console.log`, not an error).*
- Steps 5/9 add explicit network-response assertions (`200` on the pagination fetch, correct id/URL shape on navigation) — *added: the case's own steps only describe visual/DOM behavior; the backing network contract makes future failures easier to diagnose.*
- (Nothing else added beyond the case.)

## Cleanup
1. Navigate back to `${BASE_URL}/app/agents/all` (case's own Teardown) — confirmed live, no side effects to undo since this is a read-only case
2. Dispose the captured `ElementHandle` (`await handle.dispose()`) to avoid leaking a page-bound reference across test runs

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Agents list container | `page.locator('#EliteACustomTabPanel')` | none needed — confirmed stable |
| Agent cards | `page.locator('#EliteACustomTabPanel .MuiCard-root')` (via `cardGridList.cards`) | none better available — no `role`, `aria-label`, or `data-testid` on cards (GH#12); case's own `[role="button"]` hint matches 0 cards |
| First card, pinned reference (for genuinely exercising stale-element semantics) | `await cardGridList.firstCard().elementHandle()` | n/a — a plain `Locator` (`cardGridList.firstCard()`) is NOT an acceptable substitute here: it re-resolves lazily and can never go stale by construction, which would make the test unable to exercise what the case is about |
| Agent detail Name field | `page.getByRole('textbox', { name: 'Name *' })` — confirmed reused from TC-016's AFS | none needed |
| Agent detail page URL pattern | `/app/agents/all/{id}?viewMode=owner&name={encoded-name}` (confirmed live, e.g. `.../app/agents/all/253?viewMode=owner&name=TestAgent_1772792259904_temp`) | n/a |

## Network Behavior
- `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?tags=&sort_by=created_at&sort_order=desc&query=&agents_type=classic&limit=20&offset={N}` — pagination fetch; fires on scroll-to-bottom of `#EliteACustomTabPanel`. Confirmed offsets fired during this exploration: `0` (initial mount), `20`, `40` — each returned `200` with ≤20 rows. Wait via `cardGridList.waitForNextPageResponse('agents_type=classic', offset)`.
- `GET /api/v2/elitea_core/application/prompt_lib/{ownerId}/{id}` — single-agent detail fetch backing the destination page (same endpoint already documented in TC-016's AFS); returned `200` in this run, no console errors.
- `GET /api/v2/elitea_core/search_options/prompt_lib/{ownerId}?query=...` — fires on search-box typing; confirmed this does **not** cause the main `.MuiCard-root` grid to remount (exploratory check, beyond the case's own scope — see Known Defects).

## Known Defects Found During Exploration
- **[INFO/CLARIFICATION] — filed as [GH#83](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/83).** The case's core premise ("SPA lazy loading can cause DOM re-renders that invalidate element references") does not hold for this list's live implementation. Confirmed via direct DOM-node identity checks (`isConnected`, strict `===` re-check) across two independent scroll-triggered lazy-load cycles: the pre-scroll first-card node was never removed or replaced — this app's pagination is strictly append-only. A genuine Playwright click against the pre-scroll accessibility-tree reference for the first card succeeded, unmodified, after both scroll cycles. Scenario B (stale-element error) was not reproducible via the case's own trigger, nor via an additional exploratory trigger (search-box typing). Recommendation: assert Scenario A deterministically; keep the Scenario B re-query path as defensive/dead code with a comment referencing GH#83, and consider flagging (not silently swallowing) if it ever actually fires in CI.
- **[INFO] — already filed, re-confirmed, no new issue.** Case step 3's `[role="button"]` selector matches 0 agent cards (12 elements: 9 sidebar nav buttons + 3 tag-filter chips) — see [GH#12](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/12) (TC-003) and [GH#81](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/81) (TC-060, same product surface).
- **[INFO] — already filed, re-confirmed, no new issue.** Case step 9's `/app/agents/{id}` URL pattern does not resolve to a detail view — see [GH#28](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/28) (TC-011/TC-016/TC-013). Confirmed live pattern here: `/app/agents/all/{id}?viewMode=owner&name={encoded-name}`.
- **[INFO] — not filed, informational only.** Case Precondition states "test account contains 12 agents (confirmed count)"; live account had ~213 agents throughout this run. Consistent with the shared-account organic-growth drift already discussed in TC-003's and TC-060's AFS/issues (#12, #81) — automation must not hardcode a specific total.
- **[INFO] — not filed, informational only.** Case Test Data's "Sample agent name: docsbot_library" was not observed as a visible card name on the list's first page at exploration time (only present as a tag-filter chip). Not a defect — the case's own steps never require clicking specifically this agent.

## Blocked Steps
None. All Preconditions, all 10 case Steps (decomposed into 10 AFS steps — a 1:1 mapping, no step required splitting into more than one AFS step except step 3→3/4 for locate-vs-capture), and the Teardown were executed end-to-end against the live system, including two full scroll-triggered lazy-load cycles and a real navigation to an agent detail page.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — this case joins `tests/lazy-loading.spec.ts` (module: lazy-loading), batched with the rest of TC-060..066 in one PR per `.agents/testing.md` § Structure.
- Page object: reuse `tests/pages/cardGridList.page.ts` as-is — `firstCard()`, `scrollToBottom()`, `waitForNextPageResponse()`, `waitForFirstCard()`, `cardCount()` are all directly applicable. No extension needed for this case specifically.
- **The core automation nuance for this case**: capture the "stored reference" as a genuine Playwright `ElementHandle` (`await cardGridList.firstCard().elementHandle()`), not a `Locator`. A plain `Locator` re-resolves lazily on every action and structurally cannot go stale — using one here would silently make the test unable to exercise what the case is actually about, regardless of the app's real behavior.
- Suggested assertion strategy: assert Scenario A explicitly (the pinned-handle click succeeds without throwing) as the primary, expected-every-run path. Implement the Scenario B catch/re-query fallback for completeness, but treat its execution as noteworthy (log/soft-fail marker) rather than an equally-valid outcome — per GH#83, if this app's list ever switches to a remounting/virtualized rendering pattern, that branch firing is a signal worth a human seeing, not something to hide behind a blanket try/catch.
- Serial vs parallel: per `.agents/testing.md` § Structure, lazy-loading-module cases are not assumed serial by default. This case is fully read-only (no create/delete) — safe to run in parallel with sibling lazy-loading-module tests.
- Wait strategy: no `waitForTimeout` anywhere in this spec — the case's own "wait 3 seconds" / "wait 2 seconds" are re-authored into `waitForFirstCard()` / `waitForNextPageResponse()` condition waits, per `.agents/testing.md` § Conventions.
- **Analyst execution note (process/tooling, not a product or spec issue):** this exploration ran in a dedicated, isolated `playwright-cli -s=TC-067` browser session (own in-memory Chrome profile, own port) specifically to avoid the shared-MCP-browser cross-talk documented in `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md` — this AFS was authored while 7 sibling analysts (TC-060..066) were dispatched in parallel against the same account. Confirmed isolated throughout: fresh navigation required a real Keycloak login (no inherited cookies), and `window.location.href` was re-verified after every navigation with no cross-talk observed. The account's total agent count ("Agents:213") was re-checked at both the start and end of this session and had not drifted during this specific run — though the account is confirmed (per GH#81) to grow from concurrent sibling activity in general, this did not manifest as node-level DOM staleness (the mechanism this case is actually about), which is the central finding of this AFS.
