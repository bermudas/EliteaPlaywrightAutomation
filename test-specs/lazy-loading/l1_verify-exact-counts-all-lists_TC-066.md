# Test Case: Verify Exact Item Counts in All Lazy-Loaded Lists After Full Load

## Metadata
- **TMS ID**: TC-066
- **Source**: `Elitea-testing-WebQAPreExecuted/lazy-loading/TC-066_verify-exact-counts-all-lists.md`
- **Linked Story**: #16 (EPIC), #79 (tracking issue)
- **Module**: lazy-loading (WebQAPreExecuted batch, parent epic #16)
- **Priority**: l1 (critical)
- **Environment Explored**: `https://next.elitea.ai/` (prod-like "next" env), ELITEA 2.0.4
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`), isolated session `playwright-cli -s=TC-066`, dedicated `--profile` dir per browser-isolation instruction. `window.location.href` re-verified before every DOM/network read.
- **Status**: ready-for-automation

## User selection
- `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — standard smoke-suite account. No elevated role or second user needed; this case is read-only observation across five list surfaces.

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` via Keycloak SSO (`getByRole('textbox', {name:'Username or email'})`, `getByRole('textbox', {name:'Password'})`, `getByRole('button', {name:'Sign In'})`) — confirmed handles, unchanged from prior modules
- Test account (default "Private" project, owner/project id `21`, author id `42`) contains data in all sections at time of exploration: **214 agents**, **2 pipelines**, **6 toolkits**, **3 artifact buckets (0 files each)**, **18 conversations** (0 pinned + 0 today + 6 this-week + 12 older) — all counts read live from the authoritative source for each list (network response `total` / grouped `total` fields, not the on-screen badge — see Known Defects)
- Browser viewport maximized — explored at 1920×1080

## Test data inventory

### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`
- Five list surfaces, all read-only: `/app/agents/all`, `/app/pipelines/all`, `/app/toolkits/all`, `/app/artifacts` (**not** `/app/artifacts/all` — see Known Defects), `/app/chat/`
- **Per-list authoritative count source (confirmed live, this is what automation must assert against — the case's own "read from UI badge" instruction is only reliable for Pipelines):**

| List | Case's suggested badge | Badge value (observed) | Authoritative source | Authoritative value | Match? |
|---|---|---|---|---|---|
| Agents | "Agents: N" | 213 | `GET /api/v2/elitea_core/applications/prompt_lib/21?...&agents_type=classic&limit=1&offset=0` → `.total` | **214** | **NO** — badge under-counts by 1 (#88) |
| Pipelines | "Pipelines: N" | 2 | `GET /api/v2/elitea_core/applications/prompt_lib/21?...&agents_type=pipeline&limit=1&offset=0` → `.total` | 2 | yes |
| Toolkits | "Toolkits: N" | 7 | `GET /api/v2/elitea_core/tools/prompt_lib/21?...&limit=20&offset=0` → `.total` | **6** | **NO** — badge over-counts by 1 (#88) |
| Artifacts | "Artifacts: N" (does not exist) | n/a | "Buckets: N" badge in the bucket left-rail | 3 | yes (different badge — see Known Defects/#90) |
| Conversations | "Conversations: N" (does not exist) | n/a | `GET /api/v2/elitea_core/folder/prompt_lib/21?...&grouped=true` → sum of `pinned.total` + each `date_groups[].total` | 18 (0+0+6+12) | n/a — no on-screen badge to compare against (see Known Defects/#90) |

- This is a **live, shared, concurrently-mutated account** — 7 sibling analyst sessions (TC-060/061/062/063/064/065/067) ran in parallel during this exploration, per this module's own no-cleanup/no-mutation Teardown convention across all 8 lazy-loading cases (confirmed: counts were stable across repeated re-reads within this session, no drift observed mid-run this time, unlike TC-060's independently-documented 213→214 drift).

### Must Generate
- None (read-only test)

### Must Clean Up
- None (read-only test — matches case's own Teardown: "None required (read-only test)")

## Test Steps

### Agents (`/app/agents/all`)
1. Navigate to `${BASE_URL}/app/agents/all`
   - **Verify**: URL is `${BASE_URL}/app/agents/all`; title contains "Agents" (`"Agents: all - Private"` observed)
2. Read expected count from the "Agents: N" footer badge, **and** capture the authoritative network total (`GET .../applications/prompt_lib/21?...&limit=1&offset=0` → `.total`)
   - **Verify**: badge = `213`, authoritative total = `214` — captured for a documented `expect.soft()` comparison, **not** for the pass/fail oracle (see Known Defects/#88)
3. Apply the lazy-load strategy: scroll `#EliteACustomTabPanel` to bottom, wait for the next `GET .../applications/prompt_lib/21?...offset={N}` response, repeat until `.MuiCard-root` count stabilizes across 3 consecutive reads (confirmed live: reaches exhaustion after ~10 scroll cycles, offset progression 0→20→...→200, final page returns 14 rows: `200+14=214`)
   - **Verify**: no `[role="progressbar"]`/`[aria-busy="true"]` elements present at any point (never observed on this page, matches `.agents/testing.md`'s existing finding)
4. Count agent cards (`#EliteACustomTabPanel .MuiCard-root`) and assert against a **freshly re-read** authoritative total captured immediately before this assertion
   - **Verify**: final count = **214**, matching the network `.total`, NOT the 213 badge value (hard assertion). **Do NOT use `[role="button"]`** — confirmed to match only 3 unrelated elements (sidebar/tag-chip artifacts), zero cards.

### Pipelines (`/app/pipelines/all`)
5. Navigate to `${BASE_URL}/app/pipelines/all`
   - **Verify**: URL correct; title `"Pipelines: all - Private"`
6. Read expected count from the "Pipelines: N" badge and the authoritative network total (`agents_type=pipeline&limit=1&offset=0` → `.total`)
   - **Verify**: badge = `2`, authoritative total = `2` — these **do match** (no discrepancy for Pipelines at this dataset size)
7. Apply the lazy-load strategy — N=2 is well under `limit=20`, so no additional `offset=20+` request is expected
   - **Verify**: no follow-up pagination request fires; both cards render on initial mount
8. Count pipeline cards
   - **Verify**: `.MuiCard-root` count = **2**, stable after a scroll-down/scroll-up cycle (confirmed no change). `[role="button"]` in this panel matches 2 elements too, but they are the two tag-filter chips ("qa", "pipeline") on the second card, not the cards themselves — coincidental count match, do not rely on this selector (same #12/#13-family gap as Agents/Toolkits).

### Toolkits (`/app/toolkits/all`)
9. Navigate to `${BASE_URL}/app/toolkits/all`
   - **Verify**: URL correct; panel visible
10. Read expected count from the "Toolkits: N" badge and the authoritative network total (`GET .../tools/prompt_lib/21?...&limit=20&offset=0` → `.total`)
    - **Verify**: badge = `7`, authoritative total = `6` — these **do not match**, direction inverted vs. Agents (badge over-counts here) — see Known Defects/#88
11. Apply the lazy-load strategy (scroll-to-bottom loop, 4 rounds to 3-consecutive-stable) — N=6 is under `limit=20`, no additional pagination fires
    - **Verify**: `.MuiCard-root` count stays at 6 across all scroll iterations, never reaches 7
12. Count toolkit cards
    - **Verify**: final count = **6**, matching the network `.total`, NOT the 7 badge value

### Artifacts (case says `/app/artifacts/all` — confirmed 404, real route is `/app/artifacts`)
13. Navigate to `${BASE_URL}/app/artifacts/all` **as literally specified by the case**
    - **Verify (case-text drift, not a step to automate as-is)**: this route returns a client-rendered **"Page not found. Try Home page"** state — confirmed reproducibly via both a fresh hard navigation and an explicit `page.reload()`. Zero console errors; the SPA router simply has no match for this path. See Known Defects/#90. **Automation must navigate to `/app/artifacts` (no `/all`) instead** — this is the corrected step used from here on.
14. (Corrected) Navigate to `${BASE_URL}/app/artifacts`
    - **Verify**: URL is `${BASE_URL}/app/artifacts`; title `"Artifacts - Private"`; page renders a two-pane bucket browser (left rail: bucket list + "Buckets: N" counter; right pane: files in the selected bucket)
15. Read expected count — case expects an "Artifacts: N" badge; **no such badge exists**. Use "Buckets: N" instead (the closest live equivalent — see Known Defects/#90)
    - **Verify**: "Buckets: 3" badge text; 3 bucket rows rendered in the left rail (`attach`, `attachments`, `warranty`)
16. Apply the lazy-load strategy — only 3 buckets, well under any pagination threshold; confirmed no additional network fetch fires on scroll
    - **Verify**: bucket-row count stable at 3 before and after a scroll attempt on the bucket rail
17. Count bucket items (case's "count artifacts / verify empty state if 0" maps to: count buckets, and independently note each currently-selected bucket shows "No files in this bucket" — a real empty state, not a loading state)
    - **Verify**: exactly **3** bucket rows; selected bucket ("attach") shows the empty-state text, matching #84's independently-confirmed finding for the same account/buckets

### Conversations (`/app/chat/`)
18. Navigate to `${BASE_URL}/app/chat/`
    - **Verify**: clean navigation, no modal (confirmed — matches case's own expectation); the app auto-selects and opens the most recent conversation (`/app/chat/26?name=Hello%2C+test` observed) while **also** rendering the conversations list in the left sidebar alongside it — both are visible simultaneously, this is not a redirect-away-from-the-list
19. Read expected count — case hedges "may be in sidebar or header as 'Conversations: N'"; **no such badge exists anywhere in the DOM** (confirmed via full-body regex sweep). Use the sum of the grouped-list network response instead: `GET /api/v2/elitea_core/folder/prompt_lib/21?sort_by=updated_at&sort_order=desc&grouped=true` → `pinned.total + Σ date_groups[].total`
    - **Verify**: response captured live: `pinned.total=0`, `date_groups`: `today.total=0`, `this_week.total=6`, `older.total=12` → sum = **18**. Note the response's `this_week`/`older` group payloads may carry **fewer** `conversations` array entries than their own declared `total` (confirmed: `older` returned only 10 of its declared 12 in the initial payload) — this is expected, not a bug; step 20 exercises the mechanism that resolves it.
20. Apply the lazy-load strategy to the conversation sidebar, **scoped to the correct nested scroll container** (not `window`/`document.body`, and not the chat transcript's own "scrollable content" region on the right — scrolling that has zero effect on the sidebar list). The correct target: the nearest ancestor of the "This Week"/"Older" `<h6>` headings with computed `overflow-y: scroll` (observed live as MUI hash class `css-3u51y7`, no stable `data-testid`/`id` — see Concrete Handles for the stop+flag note). Scroll that container to `scrollHeight`, repeat until item count stabilizes.
    - **Verify**: "This Week" group renders all 6 items immediately (no scroll needed — matches its own `total`); "Older" group grows from 10 → 12 within 2 scroll iterations of the correct container, then stabilizes (confirmed via an 8-round scroll-and-recount loop: `10, 10, 12, 12, 12, 12, 12, 12`)
    - **Verify**: total rendered conversation buttons across both groups = **18**, matching the network-derived sum from step 19. **Correction to an earlier draft of this AFS**: conversation rows are **`div[role="button"]`** (a dnd-kit draggable, confirmed via direct tag-name inspection: `document.querySelectorAll('[role="button"]')` filtered to matching text returns `tagName: "DIV"`, class `MuiBox-root ...` / `active-conversation MuiBox-root ...` for the currently-open one) — **not** a literal `<button>` element, though it still carries real `role="button"` accessibility semantics and resolves identically via Playwright's `getByRole('button', ...)`. This matches TC-064's independently-documented finding for the same surface (`conversations_list_is_group_paginated_not_flat_infinite_scroll.md`). `[role="button"]` must still be scoped to the conversation-list container specifically, since the same selector unscoped matches 25 elements globally (includes all 9 sidebar nav buttons and other page chrome).

## Expected Final State
All five list surfaces display item counts matching their own **authoritative** source (network `total` / grouped-sum), not necessarily their on-screen badge:
- Agents: **214** (badge claims 213 — known defect, #88)
- Pipelines: **2** (badge matches, no defect)
- Toolkits: **6** (badge claims 7 — known defect, #88)
- Artifacts (as "Buckets"): **3** (no "Artifacts: N" badge exists; use "Buckets: N" — case-text drift, #90)
- Conversations: **18** (no on-screen badge exists at all; derived from summing the grouped-list network response — case-text drift, #90)

MCPs list is excluded per the case's own note (`/app/mcps/all` auto-redirects to `/app/mcps/create` at 0 MCPs) — not re-verified this session, out of scope for this case's own steps.

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Precondition: account has data in agents/pipelines/toolkits/conversations | non-empty lists | steps 1–20 | 214/2/6/3-buckets/18 confirmed present | asserted |
| Test Data row: Conversations — badge "Read from UI" | count source | step 19 | no badge exists; network grouped-sum used instead | clarification *(#90 — no flat badge for Conversations)* |
| Test Data row: Agents — "Agents: N" badge | count source | step 2 | badge (213) captured but not used as oracle; network total (214) used | clarification *(#88)* |
| Test Data row: Pipelines — "Pipelines: N" badge | count source | step 6 | badge (2) = network total (2), used directly | asserted |
| Test Data row: Artifacts — "Artifacts: N" badge (may be 0) | count source | step 15 | no such badge; "Buckets: N" (3) used instead | clarification *(#90)* |
| Test Data row: Toolkits — "Toolkits: N" badge | count source | step 10 | badge (7) captured but not used as oracle; network total (6) used | clarification *(#88)* |
| Test Data row: MCPs excluded (redirect at 0 MCPs) | n/a, documentation only | — | not exercised — case's own note says excluded | out-of-scope *(per case's own instruction)* |
| 1 Navigate to `/app/agents/all` | page loads | step 1 | title + URL | asserted |
| 2 Read "Agents: N" badge, store N | expected_agents captured | step 2 | badge captured (213) AND network total captured (214); network total is the value actually used downstream | asserted *(re-authored: badge value is not the oracle, see #88)* |
| 3 Apply 10s lazy load strategy | all agents loaded | step 3 | scroll-until-3x-stable loop (re-authored beyond the case's literal fixed-wait single pass — see Automation Hints, same re-authoring TC-060/TC-065 already applied to this identical mechanism) | asserted *(re-authored)* |
| 4 Count agent cards via `[role="button"]`, expect N | exactly N cards | step 4 | `.MuiCard-root` count (214) vs freshly-read total (214); `[role="button"]` confirmed to match 0 cards (3 unrelated elements) | asserted *(re-authored: selector corrected, oracle corrected to network total not step-2 badge — same #12-family + #88 corrections already established by TC-060/TC-065 for this exact surface)* |
| 5 Navigate to `/app/pipelines/all` | page loads | step 5 | title + URL | asserted |
| 6 Read "Pipelines: N" badge, store N | expected_pipelines captured | step 6 | badge (2) = network total (2) | asserted |
| 7 Apply 10s lazy load strategy | all pipelines loaded | step 7 | confirmed no additional page fetch needed/fires (N < page size) | asserted |
| 8 Count pipeline cards via `[role="button"]`, expect N | exactly N cards | step 8 | `.MuiCard-root` count (2) = N; `[role="button"]` coincidentally also counts 2 but matches tag chips, not cards — flagged, not relied upon | asserted *(re-authored: selector correctness flagged despite coincidental count match)* |
| 9 Navigate to `/app/toolkits/all` | page loads | step 9 | title/URL, panel visible | asserted |
| 10 Read "Toolkits: N" badge, store N | expected_toolkits captured | step 10 | badge (7) captured; network total (6) is the value actually used downstream | asserted *(re-authored: badge value is not the oracle, see #88)* |
| 11 Apply 10s lazy load strategy | all toolkits loaded | step 11 | scroll loop, count stable at 6 across all iterations | asserted |
| 12 Count toolkit cards via `[role="button"]`, expect N | exactly N cards | step 12 | `.MuiCard-root` count (6) vs freshly-read total (6), NOT the 7 badge value | asserted *(re-authored: oracle corrected to network total — #88)* |
| 13 Navigate to `/app/artifacts/all` | page loads | step 13 | **404 "Page not found"** — case's literal URL does not exist on the live product | clarification *(#90 — corrected route is `/app/artifacts`, step 14 continues with the corrected URL)* |
| 14 Read "Artifacts: N" badge (may be 0) | expected_artifacts captured | step 15 | no "Artifacts: N" badge exists; "Buckets: N" (3) used as the closest live equivalent | clarification *(#90)* |
| 15 Apply 10s lazy load strategy | artifacts load or empty state | step 16 | confirmed no additional fetch needed (3 buckets, no pagination threshold reached) | asserted |
| 16 Count artifact items or verify empty state if N=0 | exactly N items / empty state | step 17 | 3 bucket rows counted; selected bucket shows genuine "No files in this bucket" empty state (0 files, not 0 buckets) — matches #84's independent confirmation | asserted *(re-scoped: "artifacts" maps to "buckets" at the top level, per #90; per-bucket file emptiness is a secondary, already-covered observation)* |
| 17 Navigate to `/app/chat/` | conversations list loads, clean nav, no modal | step 18 | URL becomes `/app/chat/{id}?name=...` (auto-opens most recent conversation) while the sidebar conversation list renders alongside it; no modal observed | asserted *(with a clarification: case implies a bare "list" page; live product opens list + most-recent-conversation together, still satisfies "clean navigation, no modal")* |
| 18 Read expected count (may be "Conversations: N" or chat count) | expected_conversations captured | step 19 | no such badge exists; network grouped-list response's `pinned.total + Σdate_groups[].total` (=18) used instead | clarification *(#90)* |
| 19 Apply 10s lazy load strategy | all conversations loaded | step 20 | scroll loop **scoped to the sidebar's own nested scrollable ancestor**, not `window`/chat-transcript region; "Older" group 10→12 confirmed | asserted *(re-authored: case's generic "apply lazy load strategy" doesn't specify which of several scrollable regions on this page — this is the one that actually contains the target content)* |
| 20 Count conversation items via `[role="button"]` or appropriate selector, expect N | exactly N items | step 20 | conversation rows carry real `role="button"` semantics (`div[role="button"]`, a dnd-kit draggable — confirmed by tag-name inspection, not a literal `<button>`) unlike Agents/Pipelines/Toolkits `.MuiCard-root` cards, which have no role at all — `[role="button"]` works here, but only when scoped to the conversation-list container (unscoped matches 25 elements incl. 9 sidebar-nav buttons) | asserted *(re-authored: selector is directionally correct per the case, but needs scoping — different correction than the Agents/Pipelines/Toolkits `[role="button"]`-is-simply-wrong finding)* |
| Expected Final State: all five lists match their UI badge counts | counts match badges | steps 2,4,6,8,10,12,15,17,19,20 | **contradicted for Agents, Toolkits, Artifacts, Conversations** (4 of 5) — counts match each list's own authoritative source, not a uniform on-screen "X: N" badge convention | clarification *(#88 for Agents/Toolkits; #90 for Artifacts/Conversations — only Pipelines matches the case's literal badge-based framing)* |
| Teardown: none required (read-only test) | n/a | — | confirmed, no data created/mutated across any of the 5 lists | asserted |

### Axis 2 — Analyst additions
- **Authoritative-count-vs-badge cross-check via network, for all 5 lists** (case only says "read from badge"): captured each list's own network response (`total` field or grouped-sum) and cross-referenced against the DOM's final rendered count and whatever on-screen badge exists. *Added: this is what confirms/corroborates #88 and surfaces #90 — without it, an automated test built purely on "assert count === badge" would be systematically wrong for 4 of the case's 5 rows.*
- **Console-error check on every one of the 5 navigations**, not just once at the end (case doesn't explicitly ask for this at every step): 0 errors/0 warnings confirmed individually after each navigation (Agents, Pipelines, Toolkits, Artifacts-404, Artifacts-corrected, Conversations). *Added: same rationale TC-065's AFS already established for this module — a single end-of-sequence check would miss an error masked by a later page's fresh console buffer.*
- **404 reproducibility check** for the Artifacts `/all` route (not asked by the case): reproduced via both a fresh `goto` and an explicit `page.reload()`, same result both times. *Added: rules out a one-off navigation race before classifying this as a stable case-text drift rather than a flaky observation.*
- (Nothing else added beyond the case.)

## Cleanup steps
No cleanup required — read-only navigation/count test across all five list surfaces, matches the case's own Teardown section ("None required (read-only test)"). No agents, pipelines, toolkits, buckets, files, or conversations were created, edited, or deleted during exploration.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Agents/Pipelines/Toolkits scroll/content container | `page.locator('#EliteACustomTabPanel')` — `CardGridListPage.panel`, identical container id across all three routes | `page.getByRole('tabpanel')` |
| Agents/Pipelines/Toolkits card | `page.locator('#EliteACustomTabPanel .MuiCard-root')` — `CardGridListPage.cards` | none better — no `role`/`aria-label`/`data-testid` on any of the three card types (#12/#13-family gap, reconfirmed for all three here) |
| Agents count badge | `page.getByText(/^Agents:\s*\d+/)` — `CardGridListPage.totalCountBadge()`/`.totalCount()` | Network: `GET /api/v2/elitea_core/applications/prompt_lib/21?...&agents_type=classic&limit=1&offset=0` → `.total` (**use this as the pass/fail oracle**, not the badge — #88) |
| Pipelines count badge | `page.getByText(/^Pipelines:\s*\d+/)` — `CardGridListPage.pipelinesTotalCountBadge()`/`.pipelinesTotalCount()` | Network: same endpoint, `agents_type=pipeline` → `.total` (matches badge here, either works) |
| Toolkits count badge | `page.getByText(/^Toolkits:\s*\d+/)` — confirmed live, needs a new `toolkitsTotalCountBadge()`/`.toolkitsTotalCount()` pair on `cardGridList.page.ts` (already flagged by TC-065's AFS, not yet implemented as of this session) | Network: `GET /api/v2/elitea_core/tools/prompt_lib/21?...&limit=20&offset=0` → `.total` (**use this as the pass/fail oracle**, not the badge — #88) |
| Artifacts bucket rail count | `page.getByText(/Buckets:\s*\d+/)` (renders as two text nodes, "Buckets:" then a newline then the digit — match with a regex spanning both, not `.textContent()` exact-equality) | Network: no dedicated "count" endpoint observed; `GET /artifacts/s3/?project_id=21&format=json` → `buckets` array length (per #84's own finding for this same account) |
| Artifacts bucket row | left-rail bucket list item, no stable selector confirmed — no `data-testid`/`role`/`aria-label` observed on the bucket rows themselves (stop+flag: same handle-gap pattern as the card grid, needs a product-side `data-testid`) | text-content match on the bucket's own name (`attach`/`attachments`/`warranty` for this account — NOT a stable handle across accounts, only usable for a literal count, not identity) |
| Conversations list — scrollable sidebar container | **Stop+flag: no stable handle exists.** Nearest ancestor of the "This Week"/"Older" `<h6>` heading with computed `overflow-y: scroll` (observed as MUI hash class `css-3u51y7` — six DOM levels up, expect this class to churn across builds) | Runtime JS walk-up-from-heading-to-first-`overflow-y:scroll`-ancestor (self-adapting to hash-class churn; see Automation Hints for the exact JS) — **recommend flagging to product for a `data-testid="conversations-list-scroll"` on this container** |
| Conversation row | `page.getByRole('button', { name: /.../ })` scoped to the conversation-list container — resolves via `div[role="button"]` (a dnd-kit draggable, confirmed by tag-name inspection: **not** a literal `<button>` element, but a real `role="button"` on a `<div class="MuiBox-root ...">`, `.active-conversation` variant for the currently-open one — matches TC-064's independently-documented finding for this same surface), unlike Agents/Pipelines/Toolkits cards which carry no role at all — but names are **not unique** (multiple "Hello, test" rows observed, consistent with the conversation-starter naming pattern already flagged at #57 for a different UI area) — use count only, not name-based targeting, for this case's purposes | scoped `[role="button"]` count within the scrollable container identified above, or `.active-conversation`/`.MuiBox-root` structural selector per `conversations_list_is_group_paginated_not_flat_infinite_scroll.md` |
| Conversations grouped-list network response | `GET /api/v2/elitea_core/folder/prompt_lib/21?sort_by=updated_at&sort_order=desc&grouped=true` → `{ pinned: {total}, date_groups: [{name, total, conversations}] }` — sum `pinned.total + Σ date_groups[].total` for the case's "expected_conversations" | none — this is the only count source found; no on-screen badge exists (#90) |
| Loading indicators (Agents/Pipelines/Toolkits) | `[role="progressbar"], [aria-busy="true"]` — `CardGridListPage.loadingIndicators()` | n/a — never observed on Agents; present ~1.5-2s on Pipelines per `.agents/testing.md` (not re-verified at length this session, small dataset loads near-instantly) |

## Network Behavior
- Agents: `GET /api/v2/elitea_core/applications/prompt_lib/21?tags=&sort_by=created_at&sort_order=desc&query=&agents_type=classic&limit=20&offset={N}` — pages of 20, offsets `0,20,...,200` (11 requests) to reach 214 total; a parallel `limit=1&offset=0` call (no `sort_by`) is the fastest single-request way to read the authoritative total (`{"total": 214, "rows": [1 item]}`), confirmed already `214` even on the very first request of the session (rules out "grew mid-run" as the explanation for this session's own 213-vs-214 gap — the network total was already 214 before any scrolling happened).
- Pipelines: `GET .../applications/prompt_lib/21?...&agents_type=pipeline&limit=1&offset=0` → `{"total": 2}`, single page, no follow-up offset call.
- Toolkits: `GET /api/v2/elitea_core/tools/prompt_lib/21?query=&sort_by=created_at&sort_order=desc&limit=20&offset=0` → `{"total": 6, "rows": [6 items]}`, single page, no follow-up offset call. Toolkit **type metadata** (`GET .../toolkit_types/prompt_lib/21`) is a red herring for counting — it lists ~60 available toolkit *types*, not the account's actual toolkit instances; use the `tools/prompt_lib` endpoint, not `toolkit_types`.
- Artifacts: `GET /artifacts/s3/?project_id=21&format=json` → bucket list (3 buckets, `size: 0` each); `GET /artifacts/s3/{bucketName}?project_id=21&format=json` → `{"keyCount": 0, "contents": []}` per bucket (per #84's independent confirmation of the same account state).
- Conversations: `GET /api/v2/elitea_core/folder/prompt_lib/21?sort_by=updated_at&sort_order=desc&grouped=true` fires on `/app/chat/` mount — full grouped payload with per-group `total` fields; the `older` group's own `conversations` array in this initial payload (10 items) is shorter than its declared `total` (12) — confirmed the remaining 2 load client-side once the sidebar's own nested scroll container (not the chat transcript) is scrolled to bottom, no *additional* network request was observed firing for this specific case (the full 12 may already be present in the initial payload's data but rendered progressively, or a follow-up request fires too fast to distinguish from the initial one at this account's small scale — flag for the implementer to double-check via a fresh network capture if a stricter network-level assertion is wanted; the DOM-count assertion in step 20 is confirmed reliable regardless).
- `GET /api/v2/elitea_core/author/prompt_lib/42` — feeds the sidebar author card, source of the incorrect "Agents: 213 / Toolkits: 7" badges (`total_applications: 213`, `total_toolkits: 7`) — root cause per #88, does not self-correct within a session.
- 0 console errors, 0 `4xx`/`5xx` responses observed across all 5 list surfaces this session (the Artifacts `/all` 404 is a soft client-side route-miss, not an HTTP error — confirmed 200 on the underlying document request, the 404 is purely the SPA's own "Page not found" component).

## Known Defects Found During Exploration

- **[MINOR/DATA-INTEGRITY] Already filed — [`GH#88`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/88)** (originally filed against TC-065, same account/surfaces). This session independently reproduced identical numbers with zero coordination: Agents badge 213 vs. true 214 (network total + full-scroll DOM count, both confirmed twice); Toolkits badge 7 vs. true 6 (network total + stable 4-round scroll DOM count); Pipelines badge 2 = true 2 (no discrepancy). Cross-linked via a comment on #88 rather than re-filed (checked `gh issue view 88 --comments` before this exploration per process fix).
- **[INFO/CLARIFICATION] Already filed — [`GH#81`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/81)** (originally filed against TC-060): the case's literal "apply 10s lazy load strategy" (one wait-scroll-wait cycle) does not reach the Agents list's true total (214) — reaching exhaustion requires a scroll-until-stable loop, not a single pass. Cross-linked via a comment on #81, not re-filed.
- **[INFO/CLARIFICATION] Newly filed — [`GH#90`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/90)**: two TC-066-specific case-text-drift findings not covered by any prior issue:
  1. The case's Artifacts row URL (`/app/artifacts/all`) 404s on the live product ("Page not found", reproduced via nav + reload) — the correct, working route is `/app/artifacts` (no `/all` suffix), confirmed via the sidebar's own nav link and independently corroborated by TC-062's case text (#84). No "Artifacts: N" badge exists at all — the UI is a bucket browser with its own "Buckets: N" counter (3, matching 3 rendered bucket rows exactly).
  2. The case's Conversations row assumes a visible "Conversations: N" (or similar) badge "may" exist — none does. The count is only derivable by summing a grouped-list network response's per-group `total` fields (18 = 0 pinned + 0 today + 6 this-week + 12 older). The lazy-load mechanism itself works correctly (10→12 confirmed for the "older" group) but only when scrolling the sidebar's own nested scroll container, not the chat transcript's.
  - **Filing status**: filed per `.agents/profile.md` § Bug filing (`github-issue`, strict-per-bug) as `GH#90`, referencing TC-066, linked to #84 (Artifacts route, independently corroborating) and #88 (same case's other two rows).

**No new product defects filed by this session** — every count discrepancy traced to already-tracked issues (#88, #81); the two novel findings (#90) are case-text drift, not product misbehavior (reverse-masking guard: both routes/behaviors work correctly once the real structure is used).

## Blocked Steps
None. All 20 case steps, across all 5 list surfaces (including the corrected Artifacts route and the corrected Conversations scroll-container targeting), were executed end-to-end against the live system.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md`. Joins `tests/lazy-loading.spec.ts` per the module plan — independent case, no `mode: 'serial'` dependency on sibling lazy-loading cases (read-only, no shared mutable state).
- **Heavy scope overlap with TC-065's AFS** (`test-specs/lazy-loading/l2_sequential-list-navigation_TC-065.md`) for the Agents/Pipelines/Toolkits rows — both cases assert the same three counts against the same #88 badge-vs-total discrepancy, using the same page object. **Recommendation: implement the Agents/Pipelines/Toolkits count-assertion logic once** (e.g. a shared helper or TC-065's test producing the count values TC-066 also needs), and let TC-066's own test add the two rows TC-065 does *not* cover: Artifacts (as "Buckets") and Conversations. TC-066's distinguishing value-add over TC-065 is (a) the two additional list types, and (b) this case's explicit "critical" priority framing as the definitive data-integrity check for "did lazy-load reach the TRUE total" — TC-065's framing is "navigate without errors," with counting as supporting evidence. Don't let the implementer accidentally duplicate the Agents/Toolkits scroll-and-compare logic in two near-identical test bodies.
- Extend `tests/pages/cardGridList.page.ts`: add `toolkitsTotalCountBadge()`/`.toolkitsTotalCount()` (mirrors existing `pipelinesTotalCount*` pair — TC-065's AFS already flagged this same need, not yet implemented as of this session) and a generalized `waitForListTotal(urlContains): Promise<number>` network-based helper (Agents/Pipelines use `/applications/prompt_lib/`, Toolkits uses `/tools/prompt_lib/` — different URL families, both need "capture `.total`").
- **Do not assert card count against the sidebar badge for Agents or Toolkits** — assert against the network `total` (hard assertion) and keep the badge comparison as `expect.soft()` with a `// Known defect: GH#88` comment, per this project's established pattern for non-blocking product defects.
- Artifacts and Conversations are new surfaces for this page object — likely need a small `tests/pages/artifacts.page.ts` (per `.agents/testing.md`'s own module-scale plan, "artifacts" module comes after "lazy-loading") and either a `conversationsSidebar` helper or an extension to whatever page object the `smoke` suite's chat/conversation handling already established. Flag to the lazy-loading module implementer to check whether the artifacts module (next in the plan) will supersede a hand-rolled Artifacts page object here — a minimal, scoped-to-this-case helper is fine for now (bucket count only, no upload/download interaction).
- The Conversations sidebar's scroll container has **no stable selector** — flagged as a stop+flag gap (see Concrete Handles). Recommended runtime approach:
  ```js
  function findScrollableAncestor(el) {
    while (el) {
      if (getComputedStyle(el).overflowY === 'scroll' || getComputedStyle(el).overflowY === 'auto') return el;
      el = el.parentElement;
    }
    return null;
  }
  ```
  applied starting from the "Older" `<h6>` heading — self-adapts if the MUI hash class changes between builds, which a hardcoded `.css-3u51y7` selector would not.
- Wait strategy: no `waitForTimeout` anywhere in this spec — every "apply 10s lazy load strategy" instance re-authored into a scroll + `waitForResponse`-or-DOM-count-stability loop, consistent with TC-060/TC-065's established pattern for this module.
- **Analyst execution note (infrastructure, not product/spec)**: ran in isolated `playwright-cli -s=TC-066` session, own Chrome process, own persistent profile dir, per the dispatch's browser-isolation instruction. `window.location.href` re-verified before every read and consistently matched the intended route throughout (one incidental observation: `window.location.href` briefly read `/app/chat/26?name=Hello%2C+test` during an `eval` call issued right after landing on `/app/`, confirming the app's own auto-redirect-to-last-conversation behavior fires very early post-login — expected, not a cross-session leak, confirmed via the URL's own conversation id staying consistent with this session's own login).
