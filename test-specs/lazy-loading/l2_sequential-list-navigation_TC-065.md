# Test Case: Navigate Through Multiple Lazy-Loaded Lists in Sequence Without Errors

## Metadata
- **TMS ID**: TC-065
- **Linked Story**: GH#16 (EPIC), GH#78 (tracking issue)
- **Priority**: l2
- **Environment Explored**: `https://next.elitea.ai/` (prod-like "next" env), ELITEA 2.0.4
- **Analyst**: qa-engineer (analyst slot, isolated `playwright-cli -s=TC-065` session, dedicated `--profile` dir per browser-isolation instruction)
- **Status**: ready-for-automation

## Preconditions
- User is authenticated via Keycloak SSO: `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` (confirmed handles: `getByRole('textbox', {name:'Username or email'})`, `getByRole('textbox', {name:'Password'})`, `getByRole('button', {name:'Sign In'})`)
- Test account (default "Private" project, owner/project id `21`, author id `42`) contains data in all three sections at time of exploration: **214** agents, **2** pipelines, **6** toolkits (all counts read live from the authoritative list endpoints — see Known Defects, the UI sidebar badges do **not** match these numbers)
- Browser viewport 1920×1080 (confirmed both 1280×720 and 1920×1080 render identically for counting purposes — page size is fixed at `limit=20` regardless of viewport height; only the visible-without-scroll row count differs)

## Test Data
### Existing (re-use)
- `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — from `tests/fixtures/env.ts`
- `${BASE_URL}` — from `tests/fixtures/env.ts`
- No fixtures generated — this is a pure read-only navigation/count case, consistent with `.agents/testing.md` § Test data strategy

### Must Generate (in test setup)
- None.

### Must Clean Up (in teardown)
- None — read-only, matches case's own Teardown ("None required").

**Case's own "Expected counts" note** ("Read from UI badges for each section") is only partially reliable — see Known Defects. Automation must read the **authoritative count from the list network response's own `total` field**, not the sidebar badge, for the pass/fail assertion; the badge is still captured and soft-asserted for visibility/regression-tracking of the known drift.

**Case's own MCPs-exclusion note** (`/app/mcps/all` auto-redirects to `/app/mcps/create` on 0 MCPs) was not re-verified this session — TC-065's own steps never touch `/app/mcps/all`, so this note is out-of-scope documentation carried over from the case's Test Data section, not a requirement to assert.

## Test Steps
1. Navigate to `${BASE_URL}app/agents/all`
   - **Verify**: page loads, title becomes `"Agents: all - Private"`, `#EliteACustomTabPanel` (role=`tabpanel`) becomes visible, 0 console errors/warnings
2. Read the authoritative expected count via network: wait for `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?...&agents_type=classic&limit=1&offset=0` (or the first `limit=20&offset=0` page response) and capture its `total` field → `expected_agents`. Also capture the sidebar "Agents: N" badge text for a soft comparison.
   - **Verify**: `expected_agents` captured (confirmed live: `214`); badge text captured (confirmed live: `"Agents:213Published:1"`, parses to `213`) — the two **do not match**, expected per Known Defects (GH#88)
3. Apply the lazy-load strategy: scroll `#EliteACustomTabPanel` to bottom (`el.scrollTop = el.scrollHeight`), wait 1s, repeat until the `.MuiCard-root` count under the panel stabilizes across 3 consecutive reads (confirmed live: stabilizes at iteration ~14–17 of a 20-iteration budget), then scroll to top and wait for stabilization
   - **Verify**: final `.MuiCard-root` count under `#EliteACustomTabPanel` equals `expected_agents` (**214**, from the network `total`, NOT the 213 badge value) — confirmed reproducible across 2 independent full-reload runs
4. Navigate to `${BASE_URL}app/pipelines/all`
   - **Verify**: page loads, title becomes `"Pipelines: all - Private"`, panel visible, 0 console errors/warnings (confirmed: no errors carried over from the Agents page)
5. Read the authoritative expected count via network (`GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?...&agents_type=pipeline...`, per GH#82's already-confirmed param) → `expected_pipelines`. Also capture the "Pipelines: N" badge.
   - **Verify**: `expected_pipelines` captured (confirmed live: `2`); badge text captured (confirmed live: `"Pipelines:2"`) — these **do match** (no discrepancy observed for Pipelines at this dataset size)
6. Apply the lazy-load strategy — N=2 is well under the `limit=20` page size, so **no scroll/offset request is expected to fire at all** (mirrors GH#82 Finding 3's "assert conditionally on `total > 20`" recommendation)
   - **Verify**: all `expected_pipelines` (2) cards render immediately on mount, no `offset=20+` request observed
7. Navigate to `${BASE_URL}app/toolkits/all`
   - **Verify**: page loads, panel visible, 0 console errors/warnings (confirmed: no errors carried over from the Pipelines page)
8. Read the authoritative expected count via network: `GET /api/v2/elitea_core/tools/prompt_lib/{ownerId}?query=&sort_by=created_at&sort_order=desc&limit=20&offset=0` → `expected_toolkits` (its own `total` field). Also capture the "Toolkits: N" badge.
   - **Verify**: `expected_toolkits` captured (confirmed live: `6`); badge text captured (confirmed live: `"Toolkits:7"`) — these **do not match**, expected per Known Defects (GH#88); direction is inverted vs. Agents (badge over-counts here, under-counts there)
9. Apply the lazy-load strategy (8-iteration scroll-to-bottom loop, same technique as step 3) — N=6 is under `limit=20`, so no additional pagination fires
   - **Verify**: `.MuiCard-root` count under the panel stays at `expected_toolkits` (**6**) across all scroll iterations — never reaches 7, confirmed stable
10. Check browser console for errors, at every step of the sequence (after each navigation, not just once at the end)
    - **Verify**: 0 errors and 0 warnings logged on every one of the 3 page loads (confirmed individually per-page, plus a final re-visit to `/app/agents/all` to rule out anything the Toolkits page left behind)

## Expected Results
- All three pages load successfully in sequence with no console errors or warnings at any point, and no errors carry over from one page to the next
- Agents: 214 cards render after the full 15–20 iteration scroll strategy (not 213 — see Known Defects)
- Pipelines: 2 cards render immediately, no scroll needed
- Toolkits: 6 cards render immediately (scrolling is a no-op — dataset is under the page-size threshold), not 7
- The sidebar count badge is directionally unreliable (off by +1 for Agents, −1 for Toolkits, exact for Pipelines) and must not be used as the automation's pass/fail oracle — use the list endpoint's `total` field instead

## Coverage Map

**Axis 1 — Case coverage**

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Precondition: account has data in agents/pipelines/toolkits | non-empty lists | steps 1–9 | 214/2/6 items confirmed present | asserted |
| Test Data: "Expected counts — Read from UI badges" | badge = ground truth | steps 2, 5, 8 | badge captured but **not** used as the pass/fail oracle | clarification *(GH#88 — badge is unreliable for Agents/Toolkits; use network `total` instead)* |
| Test Data: MCPs excluded (redirect on 0 MCPs) | n/a, documentation only | — | not exercised — TC-065's own steps never touch `/app/mcps/all` | out-of-scope *(carried-over note from case's Test Data table, not a step)* |
| 1 Navigate to `/app/agents/all` | Agents page loads | step 1 | title + panel visibility | asserted |
| 2 Read expected count from "Agents: N" badge | store `expected_agents` | step 2 | network `total` captured as the real `expected_agents`; badge also captured for comparison | asserted *(clarification: badge value (213) is NOT used as `expected_agents` — network total (214) is, per GH#88)* |
| 3 Apply 30s+ lazy load strategy, all N agent cards visible | all cards render | step 3 | final `.MuiCard-root` count === 214 | asserted |
| 4 Navigate to `/app/pipelines/all` | Pipelines page loads | step 4 | title + panel visibility, no residual errors | asserted |
| 5 Read expected count from "Pipelines: N" badge | store `expected_pipelines` | step 5 | network `total` (2) === badge (2) — no drift here | asserted |
| 6 Apply lazy load strategy (adjust iterations for N) | all N pipeline cards visible | step 6 | 2/2 cards render on mount, no offset=20+ call | asserted |
| 7 Navigate to `/app/toolkits/all` | Toolkits page loads | step 7 | title + panel visibility, no residual errors | asserted |
| 8 Read expected count from "Toolkits: N" badge | store `expected_toolkits` | step 8 | network `total` captured as the real `expected_toolkits` (6); badge (7) captured for comparison | asserted *(clarification: badge value (7) is NOT used as `expected_toolkits` — network total (6) is, per GH#88)* |
| 9 Apply lazy load strategy (adjust iterations for N) | all N toolkit cards visible | step 9 | `.MuiCard-root` count stable at 6 across 8 scroll iterations | asserted |
| 10 Check browser console for errors throughout entire sequence | 0 errors/warnings | step 10 | checked individually after each of the 3 navigations + 1 residual re-check | asserted |
| Expected Final State: correct item counts matching UI badges | counts match badges | steps 2–9 | **contradicted for Agents & Toolkits** — counts match the network `total`, not the badge | clarification *(GH#88 — case assumes badge accuracy; live product's badge is wrong for 2 of 3 lists)* |
| Expected Final State: no memory leaks / perf degradation | — | — | not instrumented this session (no perf/memory tooling wired) — visual/functional check only, no jank or slowdown observed across the 3-page sequence | asserted *(soft — see Automation Hints if perf assertions are wanted later)* |
| "Total test time ~90-120s... Pipelines ~5s for 1 item" | timing narrative | — | actual measured: Agents ~20s (17 iterations × ~1s + settle), Pipelines <2s (no scroll needed), Toolkits <2s (no scroll needed); total well under the case's 90-120s estimate | clarification *(stale timing narrative — case assumed 1 pipeline, live account now has 2 (see GH#14/#82 for the same pipeline-count-drift pattern); not re-filed as a new ticket, already covered by GH#14/#82's "live account data drifts" finding)* |
| Teardown: none required | — | — | confirmed, no state mutated | asserted |

**Axis 2 — Analyst additions**

- **Cross-page console-error carryover check** (not explicit in case script beyond step 10's general instruction): re-visited `/app/agents/all` a fourth time, after Toolkits, specifically to rule out any error that Toolkits' page-teardown might have silently left in a global error handler. *Added: step 10 says "throughout entire sequence" — a single end-of-sequence console check wouldn't catch an error that occurred on page 2 and was overwritten by page 3's fresh console buffer (playwright-cli's console log resets per navigation). Checking after every individual navigation is the only way to actually honor "throughout."*
- **Authoritative-count-vs-badge cross-check via network** (not in case script — the case only says "read from badge"): captured the `/api/v2/elitea_core/applications/prompt_lib/{id}` and `/api/v2/elitea_core/tools/prompt_lib/{id}` responses' own `total` fields and cross-referenced them against the DOM's final rendered card count and the sidebar badge, for all three lists. *Added: this is what surfaced GH#88 — without it, an automated test built purely on "assert card count === badge count" would be systematically failing (Agents) or falsely passing early (Toolkits, stopping at 6 thinking 7 is unreachable and treating that as a defect when it's actually correct).*
- **Viewport-independence check** (not in case script): re-measured the Agents badge/card-count pair at both 1280×720 and 1920×1080. *Added: confirms the count discrepancy is not a viewport/layout artifact — same drift at both sizes.*
- **Announcement banner coexistence** (not in case script): the dismissible "Announcing ELITEA 2.0.4!" banner was present across all three pages and did not block panel scrolling or card-count reads. *Added: same non-interference pattern already documented for modal-handling (GH#55's AFS) — worth a `// banner may or may not be present` comment rather than an assertion.*

## Cleanup
None required — read-only test, no data created or mutated. Confirmed: agent/pipeline/toolkit counts unchanged by this session's own actions (any fluctuation observed between reloads is attributable to the other 7 parallel sibling analyst/implementer sessions mutating the same shared test account concurrently, not to this case).

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Agents/Pipelines/Toolkits scrollable panel | `page.locator('#EliteACustomTabPanel')` — confirmed `role="tabpanel"`, `overflow-y: scroll`, identical container id across all three routes | `page.getByRole('tabpanel')` |
| Card grid items (all three lists) | `panel.locator('.MuiCard-root')` — confirmed identical class across Agents, Pipelines, **and now Toolkits** (new confirmation this session; `cardGridList.page.ts`'s existing selector extends cleanly, no new page object needed for the card/scroll mechanics) | none better available — no `role`/`aria-label`/`data-testid` on any of the three card types (GH#12/#13, and now confirmed for Toolkits too) |
| Agents count badge | `page.getByText(/^Agents:\s*\d+/)` — existing `cardGridList.page.ts` `totalCountBadge()`/`totalCount()`, confirmed still live-accurate as a **selector** (matches 1 element) even though its **value** is wrong (GH#88) | — |
| Pipelines count badge | `page.getByText(/^Pipelines:\s*\d+/)` — existing `pipelinesTotalCountBadge()`/`pipelinesTotalCount()` | — |
| Toolkits count badge (**new**) | `page.getByText(/^Toolkits:\s*\d+/)` — confirmed live, single match, text `"Toolkits:7"` (no trailing concatenated text unlike Agents' `"...Published:1"` suffix, so no extra regex care needed beyond the existing `(\d+)` first-match parse pattern) | `page.locator('#EliteACustomTabPanel').locator('..').getByText('Toolkits:')` scoped closer if a second false match ever appears elsewhere on the page (not observed this session) |
| Authoritative Agents/Pipelines total | Network: `GET .../elitea_core/applications/prompt_lib/{ownerId}?...` response body `.total` (existing pattern, `cardGridList.page.ts`'s `waitForNextPageResponse` already waits on this URL family — extend with a "capture the `total` field" helper, e.g. `waitForListTotal(urlContains): Promise<number>`) | — |
| Authoritative Toolkits total (**new**) | Network: `GET .../elitea_core/tools/prompt_lib/{ownerId}?...` response body `.total` — different path segment (`tools`, not `applications`) than Agents/Pipelines, needs its own URL-matching branch, cannot reuse the existing `waitForNextPageResponse`'s `/applications/prompt_lib/` substring check as-is | — |
| Author-stats endpoint (root cause of the badge drift) | Network: `GET /api/v2/elitea_core/author/prompt_lib/{authorId}` response body `.total_applications` / `.public_applications` / `.total_toolkits` — this is what actually backs the sidebar badge text; useful for a diagnostic assertion but NOT the count oracle | — |

## Network Behavior
- Agents initial mount: `GET .../applications/prompt_lib/21?tags=&sort_by=created_at&sort_order=desc&query=&agents_type=classic&limit=20&offset=0` (200) — first 20 cards. Each scroll-to-bottom fires the next `offset=20`, `offset=40`, ... up to `offset=200` (11 total page fetches to cover 214 items at `limit=20`)
- A parallel `limit=1&offset=0` (no `sort_by`) call also fires on mount and is the simplest single-request way to read the authoritative `total` without waiting for the full paginated sequence — confirmed body: `{"total": 214, "rows": [1 item]}`
- Status-filtered companion calls also fire on Agents mount (`statuses=draft|published|on_moderation|user_approval|rejected`, each `limit=1`) — `published` returned `total: 1` matching the badge's own "Published: 1"; `draft` returned `total: 214` which is suspicious (same as the unfiltered total, not `214 - 1 = 213`) — noted as a secondary oddity in GH#88 but not separately pursued, since the primary `total`-vs-badge finding already stands on its own evidence
- Pipelines initial mount: single `GET .../applications/prompt_lib/21?...&agents_type=pipeline&limit=20&offset=0` (200) returns both cards — `total: 2`, no follow-up offset call
- Toolkits initial mount: single `GET .../tools/prompt_lib/21?query=&sort_by=created_at&sort_order=desc&limit=20&offset=0` (200) returns all 6 rows and `total: 6`, no follow-up offset call
- `GET /api/v2/elitea_core/author/prompt_lib/42` fires on every one of the three page mounts (feeds the sidebar author card/badge) — payload is identical across all three visits in this session (`total_applications: 213`, `public_applications: 1`, `total_toolkits: 7`, `total_pipelines: 2`), i.e. it did not self-correct during the ~5 minutes of this session

## Known Defects Found During Exploration
- **[MINOR/DATA-INTEGRITY]** Filed as [`GH#88`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/88): the sidebar "Agents: N" / "Toolkits: N" badges (sourced from `GET /api/v2/elitea_core/author/prompt_lib/{authorId}`'s `total_applications`/`total_toolkits` fields) do not match the authoritative per-list `total` field (`GET .../applications/prompt_lib/{id}` / `GET .../tools/prompt_lib/{id}`), reproduced in both directions: Agents badge under-counts by 1 (213 vs true 214, reproduced across 2 fresh reloads), Toolkits badge over-counts by 1 (7 vs true 6, stable across 8 scroll iterations). Pipelines showed no drift (badge 2 === total 2). Automation uses `expect.soft()` for the badge-vs-total comparison (documents the known, non-blocking discrepancy) and a **hard** assertion for card-count === network `total`, per this project's established pattern for non-blocking product defects (see GH#43/#29 in the agents module).
- Investigated and folded into GH#88 rather than filed separately: the `statuses=draft&limit=1` companion call on the Agents page returns `total: 214` (same as the unfiltered total) instead of the expected `214 - 1 (published) = 213` — a secondary anomaly on the same `author`/status-aggregate family of endpoints, documented as evidence in GH#88 rather than as its own ticket (bundling would need the umbrella-ticket convention this project hasn't adopted — strict-per-bug default, but this is squarely the same root-cause family, not a distinct user-facing defect).

## Blocked Steps
None.

## Automation Hints
- Framework: Playwright/TypeScript (per `.agents/testing.md`), flat/primitive-heavy path. Extend `tests/pages/cardGridList.page.ts` — do not create a new page object for Toolkits; its DOM (`#EliteACustomTabPanel` + `.MuiCard-root`) is identical to Agents/Pipelines, confirmed this session.
- New methods needed on `cardGridList.page.ts`: `toolkitsTotalCountBadge()` / `toolkitsTotalCount()` (mirrors the existing `pipelinesTotalCount*` pair), and a network-based `waitForListTotal(urlContains, matcher?)` helper that resolves the response body's `.total` field — generalize the existing `waitForNextPageResponse` rather than duplicating it, since both Agents/Pipelines (`/applications/prompt_lib/`) and Toolkits (`/tools/prompt_lib/`) need the same "capture `.total`" behavior against two different URL families.
- **Do not assert card count against the sidebar badge for Agents or Toolkits** — assert against the network `total` (hard assertion) and keep the badge comparison as `expect.soft()` with a `// Known defect: GH#88` comment, so the known drift is visible in test output without failing the run.
- Wait strategy: scroll-to-bottom + `waitForResponse` on the next paginated request (preferred over a flat `waitForTimeout(1000)` per list-item, though the case's own manual-execution "wait 1s" language was translated to a stability-check loop during this exploration — 3 consecutive equal `.MuiCard-root` counts as the stop condition worked reliably and completed faster (~17 iterations) than the case's suggested flat 20).
- Pipelines and Toolkits at this account's current data volume (2 and 6 respectively) never trigger a second page fetch — guard any "assert an offset=20 request fires" check behind `total > 20`, same recommendation as GH#82 Finding 3, or the assertion will simply never run and silently pass/skip.
- Reuse the existing `trackConsoleErrors()`-style helper (per `.agents/testing.md`'s planned `chore/test-framework-scale` follow-up) once it lands — this case needs it applied **three times** (once per page), not once at the end, per Axis 2's carryover-check finding.
