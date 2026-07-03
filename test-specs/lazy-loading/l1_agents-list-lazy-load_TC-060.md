# Test Case: Agents List Loads After 10+ Second Wait with Scroll Trigger

## Metadata
- **TMS ID**: TC-060
- **Source**: `Elitea-testing-WebQAPreExecuted/lazy-loading/TC-060_agents-list-lazy-load.md`
- **Module**: lazy-loading (WebQAPreExecuted batch, parent epic #16, tracking issue #73)
- **Priority**: l1 (critical)
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`), isolated session `playwright-cli -s=TC-060`
- **Status**: ready-for-automation

## User selection
- `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — standard smoke-suite account, same as TC-001–TC-005/TC-003. No elevated role or second user needed; this case is read-only observation of the Agents list.

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` — verified via landing directly on `${BASE_URL}/app/agents/all` post-login (no redirect to Keycloak), sidebar profile control showing "Alita Yoko"
- Browser viewport maximized — explored at 1920×1080 (case's own Setup step); grid column count is viewport-dependent (4 columns observed at 1920×1080 — already filed as #12 Finding 3, re-confirmed here, no new issue)
- Test account contains agents — **observed 213 → 214 during this exploration** (count increased mid-run; see Known Defects), comfortably exceeding the case's stated baseline of "at least 1 agent"

## Test data inventory
### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`
- Agents list at `${BASE_URL}/app/agents/all`, owned by `owner_id=21` — read-only, no fixture needed
- Total agent count is **live and not deterministic across a run** (confirmed again here, same phenomenon TC-003's AFS first documented for this shared account): footer badge read `"Agents:213"` partway through this exploration; DOM count and a freshly-fetched API `total` both read `214` ~20s later after full lazy-load exhaustion. Automated assertions must compare DOM count against a **freshly-fetched** total captured immediately before the final assertion, never a value captured earlier in the same test.

### Must Generate
- None (read-only test)

### Must Clean Up
- None (read-only test — matches case's own Teardown: "None required (read-only test)")

## Test Steps

1. Navigate to `${BASE_URL}/app/agents/all`
   - **Verify**: URL is `${BASE_URL}/app/agents/all`; page title contains "Agents" (`"Agents: all - Private"` observed)
2. Wait for the initial agents page to load — condition wait, not a fixed 3s sleep: wait for the `GET /api/v2/elitea_core/applications/prompt_lib/21?...agents_type=classic...offset=0...` response (200), then wait for at least one card (`#EliteACustomTabPanel .MuiCard-root`) to be visible
   - **Verify**: at least 1 `.MuiCard-root` visible inside `#EliteACustomTabPanel`
   - **Note**: on this 1920×1080 viewport, a **second** page auto-fetches (`offset=20`) immediately on mount with no scroll interaction — 40 cards rendered before any scroll action, identical mechanism to TC-003's finding. Automation must not assume "only page 1 (20 items) is loaded after initial render."
3. Read expected count from the "Agents: N" footer badge
   - **Verify**: badge text matches `/^Agents:\s*\d+/`; capture as `expectedCountAtStart` for reference only — **do not** use this value for the final equality assertion (see step 10 and Known Defects: this count can drift upward mid-run on this shared account)
4. Scroll the list container to its bottom to trigger lazy-loading of the next page
   - **Action**: scroll `#EliteACustomTabPanel` (NOT `document.body`/`window.scrollTo` — confirmed no-op, see Known Defects / #12) to `scrollHeight`
   - **Verify**: a new `GET .../applications/prompt_lib/21?...offset={previousOffset+20}...` request fires and returns 200
5. Wait for the lazy-loaded page to render — condition wait on the response from step 4, not a fixed 2s sleep
   - **Verify**: `.MuiCard-root` count inside `#EliteACustomTabPanel` increases from the pre-scroll count (40 → 60 confirmed live)
6. Repeat steps 4–5 until no new `applications/prompt_lib` request fires on scroll (card count stabilizes across two consecutive scroll-to-bottom attempts)
   - **Verify**: final DOM card count equals a freshly-fetched API `.total` (confirmed live: 214 cards after 9 scroll cycles from the 40-card starting point, offset progression 40→60→80→100→120→140→160→180→200, last page returning 14 rows: `200 + 14 = 214`)
   - **Note (re-authored beyond the case's literal single-scroll step)**: the case's steps 4–5 describe exactly ONE scroll-to-bottom cycle and its own "Expected Final State" claims "All N agents...are visible" and "~10 seconds" total wait — neither holds for this account's real volume (213+ agents, ~20s to fully exhaust via repeated scrolling). See Known Defects / #81. This step re-authors the case's intent (verify the lazy-load mechanism reaches the true total) into a scroll-until-exhausted loop, which is the only way to honor the case's own "Expected Final State" claim against live data.
7. Scroll the list container back to top
   - **Action**: scroll `#EliteACustomTabPanel` to `scrollTop = 0`
   - **Verify**: `#EliteACustomTabPanel.scrollTop === 0`; all previously loaded cards remain in the DOM (count unchanged by scrolling up)
8. Wait for page stabilization — **no additional wait needed**: scrolling up triggers no network fetch (confirmed — no new `applications/prompt_lib` request fires on scroll-up)
9. Check for loading indicators (`[role="progressbar"]` / `[aria-busy="true"]`)
   - **Verify**: assert the count of matching elements is `0` — **do not gate a wait on their presence**; never observed present at any point during this exploration (initial load, mid-scroll-triggered-fetch, post-exhaustion, or post-scroll-to-top). Reconfirms TC-003's finding for this same page.
10. Count agent cards and verify against a freshly-fetched total
    - **Assertion**: `#EliteACustomTabPanel .MuiCard-root` count equals a **freshly re-read** "Agents: N" footer badge value (or a fresh `GET .../applications/prompt_lib/21?...limit=1&offset=0` response's `.total` field) captured immediately before this assertion — **not** the value captured in step 3
    - **Do NOT use `[role="button"]`** — confirmed to match 12 elements (9 sidebar nav items + 3 tag-filter chips: "docsbot_library", "agent_demo", "w"), zero of which are agent cards. Reconfirms #12 Finding 2 for this case.

## Expected Final State
- All agents matching a freshly-read total-count value are visible in a CSS grid inside `#EliteACustomTabPanel` after scroll-to-bottom is repeated until exhaustion (4 columns observed at 1920×1080 — case's "3-column" claim already filed as #12 Finding 3, no new issue)
- Each card shows: a small icon (SVG), the agent name (`.MuiTypography-headingSmall` text), and an owner avatar (`.MuiAvatar-root`)
- No loading spinners or progress indicators visible at any point (`[role="progressbar"]`/`[aria-busy="true"]` count is always 0 on this page)
- Total wall-clock time from navigation to full lazy-load exhaustion is **volume-dependent, not a fixed ~10s** — 40 cards load in the first ~2-3s (auto-fetch, no scroll needed); reaching all 214 required ~18-20s of repeated scroll-to-bottom cycles. Automation should condition-wait on exhaustion (no new request fires / count stabilizes), never assert a fixed duration.
- No console errors during load, scroll, or lazy-load fetches
- No `4xx`/`5xx` responses from `/api/v2/elitea_core/applications/prompt_lib/**`

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Precondition: app accessible, user authenticated | authenticated session at `/app/agents/all` | precondition | confirmed pre-navigation: direct landing on `/app/agents/all`, no Keycloak redirect | asserted |
| Precondition: browser maximized | all UI elements visible | precondition | viewport set 1920×1080 before navigation | asserted |
| Precondition: test account has ≥1 agent | ≥1 agent exists | step 3 / step 10 | footer badge / fresh total ≥ 1 (observed 213-214) | asserted |
| 1 Navigate to `/app/agents/all` | "Agents" header visible | step 1 | step 1: URL + title | asserted |
| 2 Wait 3s for initial render | page not blank, layout visible | step 2 | step 2: first card visible via condition wait | asserted *(re-authored: condition wait on network response + card visibility, not a fixed 3s sleep — see Automation Hints)* |
| 3 Read expected count from "Agents: N" badge, store as N | expected count captured | step 3 | step 3: badge regex match, captured for reference only | asserted *(re-authored: this AFS explicitly does NOT use this captured value for the final equality check — see step 10 and Known Defects/#81, the value can go stale during the scroll-exhaustion sequence on this shared account)* |
| 4 Scroll to bottom via `window.scrollTo(0, document.body.scrollHeight)` | scroll executed, triggers lazy load | step 4 | step 4: `#EliteACustomTabPanel` scrolled, new request fires | asserted *(re-authored: case's literal `document.body`/`window.scrollTo` target is a no-op on this page — confirmed live, `window.scrollY` stays 0, `document.body.scrollHeight` stays pinned to viewport height; already filed as #12 Finding 1, reconfirmed here — no new issue)* |
| 5 Wait 2s, additional cards may appear | cards appear | step 5 | step 5: card count increases (40→60 confirmed) | asserted *(re-authored: condition wait on network response, not fixed 2s sleep)* |
| 6 Scroll back to top | scroll executed, cards remain visible | step 7 | step 7: `scrollTop === 0`, card count unchanged | asserted |
| 7 Wait 1s | page stabilizes | step 8 | — | asserted *(no-op needed: scroll-up triggers no fetch, confirmed live)* |
| 8 Check for progress indicators, wait 3s more if present | indicators gate extra wait if present | step 9 | step 9: indicator count === 0 | asserted *(re-authored: indicators never observed present at any point in this exploration — reconfirms TC-003's finding for this same page; don't gate a wait on presence)* |
| 9 Wait 2 more seconds for stabilization | page fully loaded | — | superseded by step 10's own fresh-total assertion | asserted (no-op) |
| 10 Count agent cards with `[role="button"]`, expect exactly N (from step 3) | exactly N cards visible | step 10 | step 10: `.MuiCard-root` count vs. freshly-fetched total | asserted *(re-authored twice: (a) case's `[role="button"]` selector matches 12 unrelated elements, not cards — reconfirms #12 Finding 2, no new issue; (b) case's implied "exactly N from step 3" equality is re-targeted to compare against a fresh total captured at assertion time, not the step-3 value, because the step-3 value can go stale on this shared, concurrently-mutated account — see Known Defects/#81)* |
| Expected Final State: all N agents visible, 3-column grid, ~10s total | full list loaded, 3 columns, ~10s | step 6 (exhaustion loop), step 10 | 4 columns observed (already filed #12 Finding 3); ~18-20s observed to reach 214 cards via 9 scroll cycles, not achievable via the case's literal single-scroll steps 4-5 | clarification *(filed as #81 — case's single-scroll/~10s assumption does not scale to this account's real data volume; the underlying lazy-load mechanism itself is correct and defect-free)* |
| Expected Final State: card shows icon/avatar, name, owner info | all three present | step 10 (visual) | DOM inspection: SVG icon + `.MuiTypography-headingSmall` name + `.MuiAvatar-root` owner avatar all confirmed present on first card; screenshot `test-results/screenshots/TC-060-step10-final-state.png` | asserted |
| Teardown: none required (read-only) | n/a | — | — | asserted (read-only, no cleanup performed) |

### Axis 2 — Analyst additions
- Step 6 (scroll-until-exhaustion loop) is added beyond the case's literal single scroll-cycle steps 4-5 — *added: the case's own "Expected Final State" claims "All N agents...are visible," which is unreachable via a single scroll on this account's real data volume (213+ agents, 20 items/page). Without this loop, the case's central claim goes unverified. See #81.*
- Step 10's fresh-total comparison (rather than the step-3-captured value) is an analyst correction to the case's own literal instruction — *added: confirmed live that the two values can differ (213 at step 3 vs 214 at step 10) due to concurrent mutation of this shared test account, matching TC-003's independently documented occurrence of the same phenomenon. Asserting equality against the stale step-3 value would make this test intermittently and non-deterministically fail through no fault of the lazy-load mechanism.*
- Expected Results adds "no console errors" and "no 4xx/5xx from the applications endpoint" during the whole load/scroll/exhaustion sequence — *added: verified clean throughout exploration (0 console errors across the full ~20s exhaustion sequence, all 11 `applications/prompt_lib/**` list responses returned 200); guards against a silent regression the case's own steps don't check for.*
- (Nothing else added beyond the case.)

## Cleanup steps
No cleanup required — read-only navigation/scroll test, matches the case's own Teardown section ("None required (read-only test)"). No agents created, edited, or deleted during exploration.

## Concrete Handles (discovered during exploration; reuse `tests/pages/cardGridList.page.ts` as-is, no new page-object methods needed)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Agents list scroll/content container | `page.locator('#EliteACustomTabPanel')` — `CardGridListPage.panel` | `page.getByRole('tabpanel')` (only one tabpanel mounted per route) |
| Individual agent card | `page.locator('#EliteACustomTabPanel .MuiCard-root')` — `CardGridListPage.cards` | `page.locator('#EliteACustomTabPanel .MuiCardContent-root')` — no `data-testid`/role/aria-label exists on cards (product gap, already flagged via #12) |
| Agent card name text | `.MuiTypography-headingSmall` nested span inside the card | `.textContent` of the card root (trimmed) |
| Agent card owner avatar | `.MuiAvatar-root` nested inside the card | n/a — confirmed present on every inspected card |
| Total agent count (footer badge) | `page.getByText(/^Agents:\s*\d+/)` — `CardGridListPage.totalCountBadge()` / `.totalCount()` | Direct API check: `GET /api/v2/elitea_core/applications/prompt_lib/21?...limit=1&offset=0` → response `.total` |
| Loading indicator (case's hint — confirmed NOT present) | `[role="progressbar"], [aria-busy="true"]` — `CardGridListPage.loadingIndicators()` | n/a — do not build a wait strategy on this selector for this page; never observed present |
| Tag filter chips (case's `[role="button"]` hint incorrectly implies these are cards) | `[role="button"]` — matches 9 sidebar nav items + 3 chips ("docsbot_library", "agent_demo", "w") = 12 elements | n/a — unrelated to card count |
| Scroll-to-bottom / scroll-to-top actions | `CardGridListPage.scrollToBottom()` / `.scrollToTop()` (already implemented, sets `el.scrollTop`) | manual `panel.evaluate(el => el.scrollTop = el.scrollHeight)` |
| Next-page response wait | `CardGridListPage.waitForNextPageResponse('agents_type=classic', offsetAtLeast)` (already implemented) | manual `page.waitForResponse(...)` matching `/applications/prompt_lib/` + offset |

## Network Behavior
- `GET /api/v2/elitea_core/applications/prompt_lib/21?tags=&sort_by=created_at&sort_order=desc&query=&agents_type=classic&limit=20&offset={N}` — the paginated agents list, identical endpoint TC-003 documented. Fires automatically on mount (`offset=0`); on this 1920×1080 viewport a **second** page auto-fires (`offset=20`) immediately with no user interaction (40 cards before any scroll). Further pages (`offset=40, 60, ..., 200`) require scrolling `#EliteACustomTabPanel` toward its bottom, one page per scroll-to-bottom action — confirmed NOT to batch-load multiple pages per single scroll. Last page for this account (`offset=200`) returned `{ total: 214, rows: [...14 items] }` — `200 + 14 = 214`, confirming DOM count (214) matched the API total exactly at exhaustion. All 11 observed list responses (this session) returned `200`.
- Several `limit=1` "count" queries fire alongside the main list call, one per status filter (`draft`, `published`, `on_moderation`, `user_approval`, `rejected`) — used for summary badges elsewhere in the UI, not relevant to this case's assertions.
- `GET /api/v2/elitea_core/tags/prompt_lib/21?offset=0&limit=50&entity_coverage=application` — populates the tag-filter chips (the 3 elements that `[role="button"]` incorrectly matches for card-counting purposes).
- Wait strategy for the implementer: loop `page.waitForResponse(resp => resp.url().includes('/applications/prompt_lib/') && resp.url().includes('agents_type=classic') && resp.status() === 200)` scoped to the next expected `offset`, repeating scroll-to-bottom until no new response fires within a bounded timeout (exhaustion) — reuse `CardGridListPage.waitForNextPageResponse()`, called in a loop with an incrementing `offsetAtLeast`, instead of any fixed-duration sleep.

## Known Defects Found During Exploration
**None found in the product.** The lazy-load/pagination mechanism itself is correct, consistent, and defect-free (11/11 list responses returned 200, 0 console errors, loading indicators correctly absent throughout). Two clarifications were confirmed against the live DOM/network — one already filed (reconfirmed here, no duplicate), one newly filed specific to this case's own assumptions:

- **[INFO / CLARIFICATION] Already filed — [`GH#12`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/12)** (originally filed against TC-003, same product surface `#EliteACustomTabPanel`/`.MuiCard-root`/`/app/agents/all`). TC-060's own steps hit the identical two inaccuracies:
  1. Step 4's `window.scrollTo(0, document.body.scrollHeight)` is a no-op on this page — reconfirmed live, `window.scrollY` stayed `0` and `document.body.scrollHeight` stayed pinned to `1080` (viewport height) regardless of scroll attempts. Real scroll container is `#EliteACustomTabPanel`.
  2. Step 10's `[role="button"]` selector matches 12 unrelated elements (9 sidebar nav items + 3 tag-filter chips), 0 agent cards.
  - No new issue filed for these two — checked `gh issue view 12 --comments` before this exploration per process fix; #12's existing text already covers both findings verbatim for this same product surface. TC-060's tracking comment on #73 references #12 directly instead of duplicating it.

- **[INFO / CLARIFICATION] Newly filed — [`GH#81`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/81)**: TC-060-specific findings not covered by #12:
  1. The case's steps 4-5 describe exactly ONE scroll-to-bottom cycle, and its "Expected Final State" claims "~10 seconds" total wait to reach "all N agents visible." Confirmed live: this account's real volume (213-214 agents) requires **9 scroll-to-bottom cycles** (offset 40→200) to reach exhaustion, taking ~18-20 seconds of active scrolling alone — the case's assumption only holds for small accounts (≤~40 items).
  2. The case's step 10 implies an equality assertion between the count captured in step 3 (start of sequence) and the count visible at the end. Confirmed live: the footer badge read `213` mid-sequence; ~20 seconds later (after full scroll-exhaustion), the DOM and a freshly-fetched API `.total` both read `214` — the account gained an agent mid-run, consistent with TC-003's AFS's independently-documented occurrence of the same shared-account drift (211→212 observed there). An automated test asserting equality against the step-3-captured value would intermittently and non-deterministically fail on this shared account, through no fault of the product.
  - **Filing status**: filed per `.agents/profile.md` § Bug filing (`github-issue`, strict-per-bug) as [`GH#81`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/81), referencing TC-060, linked to #12 (related, same surface) and parent epic #16 / tracking issue #73.
  - **Recommendation for the automation engineer**: implement the scroll-until-exhaustion loop (§ Test Steps 6) and compare final DOM count against a **freshly re-read** total captured immediately before the final assertion (§ Test Steps 10) — not a value captured earlier in the same test run. `CardGridListPage.totalCount()` already supports re-reading the badge at any point.

## Blocked Steps
None. All 10 case steps plus both Setup/Preconditions were executed end-to-end against the live system, including a full scroll-to-exhaustion pass (9 additional scroll cycles beyond the case's literal single-scroll instruction) to genuinely verify the case's own "all N agents visible" claim.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md`. This case joins `tests/lazy-loading.spec.ts` per `.agents/testing.md` § Structure's WebQAPreExecuted module plan (one spec file per module) — **not** the existing serial `@smoke` describe block; this module's cases are independent per their own Preconditions/Teardown (no chained-session dependency), matching `.agents/testing.md`'s stated default of NOT assuming `mode: 'serial'` for WebQAPreExecuted modules unless a module's cases actually share mutable state (this one doesn't — read-only, no state produced for a sibling case to consume).
- Page object: `tests/pages/cardGridList.page.ts` already covers every handle this case needs (`panel`, `cards`, `waitForFirstCard()`, `cardCount()`, `scrollToBottom()`/`scrollToTop()`/`scrollTop()`, `loadingIndicators()`, `totalCountBadge()`/`totalCount()`, `waitForNextPageResponse()`). **No new page-object methods required** — this case is a first-class exercise of the existing pattern, not a new surface. The one net-new technique is the *loop* around `scrollToBottom()` + `waitForNextPageResponse()` (call repeatedly with incrementing `offsetAtLeast` until a bounded-timeout `waitForResponse` times out, signaling exhaustion) — consider adding a `scrollUntilExhausted(urlContains: string)` helper to `cardGridList.page.ts` if a sibling lazy-loading case (TC-061 Pipelines, TC-066 "exact item counts in all lazy-loaded lists") also needs it, per Hard Rule 7's repetition-threshold guidance — flag to the lazy-loading module implementer to check TC-061/TC-066's own AFS before deciding.
- Wait strategy: **no `waitForTimeout` anywhere in this spec** — every "wait N seconds" from the original case has been re-authored into a `waitForResponse` loop or a web-first `expect(...).toBeVisible()` / `expect.poll()` condition wait (see § Test Steps and § Network Behavior).
- Assertion ordering: capture the "fresh total" (§ Test Steps 10) via `CardGridListPage.totalCount()` **after** the exhaustion loop completes, immediately before the final card-count assertion — not before the loop starts (that's step 3's reference-only capture, explicitly not used for the equality check, see Known Defects/#81).
- **Analyst execution note (infrastructure, not product/spec)**: this exploration ran in an isolated `playwright-cli -s=TC-060` session with its own Chrome process (pid 29827) and login, per the dispatch's browser-isolation instruction — `window.location.href` was re-verified before every DOM/network read and consistently confirmed `https://next.elitea.ai/app/agents/all` throughout. No cross-session tab interference was observed (unlike TC-003's original shared-MCP-browser exploration, which predates this per-case isolated-session pattern). This does not affect the correctness of the eventual automated suite, since `npx playwright test` gives each worker its own isolated browser context regardless.
