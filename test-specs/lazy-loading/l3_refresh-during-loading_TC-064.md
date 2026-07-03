# Test Case: Refresh Page During Conversations Lazy Load - Data Loads Correctly

## Metadata
- **TMS ID**: TC-064
- **Linked Story**: GH#16 (EPIC), GH#77 (case tracking issue), GH#89 (case-text-drift clarifications filed this pass)
- **Priority**: l3 (case priority: Medium)
- **Environment Explored**: `https://next.elitea.ai/` — live, isolated session via `playwright-cli -s=TC-064` (dedicated `--profile` dir, own in-memory-free Chrome profile), executed in parallel alongside sibling analysts TC-060..063, TC-065..067 (7 concurrent live browser sessions against the shared account for most of this run)
- **Analyst**: qa-engineer (Sage), 2026-07-03
- **Status**: ready-for-automation

## Preconditions
- App accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) via Keycloak SSO — `getByRole('textbox', {name:'Username or email'})` / `{name:'Password'}` / `getByRole('button', {name:'Sign In'})`
- Browser window maximized — case's own Setup step; not load-bearing for a headless/CI run, same translation prior AFSs in this batch use
- Test account contains at least 1 conversation — confirmed live: this account has **18 conversations** total (`this_week.total=6` + `older.total=12`, `today.total=0`), spread across two date groups (see § Concrete Handles for the exact network shape)

## Test Data
### Existing (re-use)
- `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — `.env`
- Existing account conversations (read-only exploration; no fixture created) — total 18, ids observed 26 down to 1, most-recent id 26 ("Hello, test")

### Must Generate (in test setup)
- None. This case is read-only per its own Teardown, and the "refresh mid-load" trigger is achieved by **delaying the initial list-fetch response** via route interception (see § Automation Hints), not by creating data.

### Must Clean Up (in teardown)
- None — read-only case, confirmed no server-side mutation at any point (only `GET` requests observed throughout the entire flow, see § Network Behavior).

## Test Steps

1. Navigate to `${BASE_URL}app/chat/`.
   - **Verify**: page commits and eventually resolves to a `Chat: <name> - Private` title — **not** a list-only view (see Coverage Map row 1 / Known Defects finding 1: the case's own premise that this URL shows "the list, not a single conversation" does not hold for an account with existing conversations — it auto-redirects client-side to the most-recently-active conversation, e.g. `/app/chat/26?name=Hello%2C+test`, while the sidebar's own "Conversations" list — the actual lazy-load target — renders alongside it regardless).
2. Read the expected total conversation count.
   - **Verify**: no `"Conversations: N"` text/badge exists anywhere in the DOM (confirmed via a full-page-text regex sweep) — unlike Agents/Pipelines' footer badge (`cardGridList.page.ts`'s `totalCountBadge()`). The only authoritative source is the underlying `GET /api/v2/elitea_core/folder/prompt_lib/{owner}?grouped=true` response: sum each `date_groups[].total` (`today` + `this_week` + `older`). Store as `expected_count` (observed: `0 + 6 + 12 = 18`).
3. **(Automation-only step, replaces the case's literal "wait 4 seconds")** Intercept the initial `grouped=true` request (route pattern `**/api/v2/elitea_core/folder/prompt_lib/**`, matched on `grouped=true` **and NOT** `date_group=` in the URL) and delay its fulfillment by ~4s, then reload the page and wait ~1.5s.
   - **Verify**: mid-delay, the page has committed navigation (URL/DOM shell present) but the "Conversations" sidebar text and both group headings (`This Week`, `Older`) are **absent** — confirmed live: `rowCount=0`, `headings=[]`, and **no loading indicator of any kind** appears during this window (`[role="progressbar"]`/`[aria-busy="true"]` count = 0 throughout) — same "no visible loader" pattern `.agents/testing.md` already documents for the Agents list; gate any wait on content-appears, never on a loader appearing.
4. Refresh the page via `page.reload()` **while the delayed request from step 3 is still in flight** (i.e., without waiting for it to resolve).
   - **Verify**: the in-flight delayed request is aborted client-side (confirmed live via the network log: `GET .../folder/prompt_lib/21?sort_by=updated_at&sort_order=desc&grouped=true` → `net::ERR_ABORTED`) — this is the browser's normal, expected reload behavior, not an application error.
5. Wait for the reloaded page's own (now undelayed) initial fetch to complete, using a **condition-based wait** on the first group heading appearing (`getByRole('heading', { name: /This Week|Older|Today/ })`) with a generous timeout — see § Automation Hints for why 10s is not always enough under this batch's concurrent load.
   - **Verify**: the page settles to the correct final title/URL (`Chat: Hello, test - Private` / `/app/chat/26?name=Hello%2C+test` in this account's case) with zero console errors/warnings and zero JS `pageerror` events throughout the entire delay→abort→reload→settle sequence (confirmed: both arrays empty across 3 independent full runs of this sequence).
6. Expand the "Older" group heading (`getByRole('heading', { name: 'Older' }).click()`) and scroll its now-visible scrollable container to the bottom.
   - **Verify**: a second, group-scoped request fires — `GET .../folder/prompt_lib/{owner}?grouped=true&date_group=older&limit=10&offset=10&sort_by=updated_at&sort_order=desc` — returning the remaining 2 conversations (ids `9`, `1`) that the initial payload's `older` group didn't include (it was capped at its first 10 even though `total=12`). This is the module's actual client-side-triggered lazy-load mechanism (see Known Defects finding 4 for why this differs from the Agents/Pipelines flat-list pattern).
7. Count all visible conversation rows in the sidebar (`div[role="button"]` scoped under `.MuiCollapse-wrapperInner` or matching `.active-conversation`, per § Concrete Handles).
   - **Verify**: count equals `expected_count` from step 2 (18) — confirmed live after the full expand+scroll sequence.
8. Verify conversations are grouped by time.
   - **Verify**: only groups with `total > 0` render a heading — this account shows `This Week` and `Older` only; `Today` (total 0) renders **no heading at all**, not an empty "Today" section (see Known Defects finding 3 — case's Step 9 assumes all three are always present).
9. Verify no duplicate conversations exist.
   - **Verify (analyst addition, stronger than a DOM/name diff)**: collect every conversation `id` returned across both `folder/prompt_lib` responses (initial `grouped=true` call + the `date_group=older&offset=10` follow-up) and confirm the two id sets are disjoint and their union has exactly 18 unique members — confirmed live (initial: ids `26,25,24,23,22,21,20,19,18,17,16,15,14,13,12,11`; follow-up: ids `9,1`; no overlap). **Do not** use the DOM's display text for duplicate detection — multiple genuinely distinct conversations legitimately share the same auto-generated name (`"Hello, test"` appears on 7 of the 18 real conversations in this account), so a name-based duplicate check would false-positive.

## Expected Results
- Refreshing the page while the Conversations list's initial fetch is still in flight aborts that fetch cleanly (`net::ERR_ABORTED`, a normal browser navigation artifact) with **zero application-level console errors or unhandled exceptions**.
- The reloaded page's own fresh fetch completes independently and correctly — final state shows all 18 conversations, correctly grouped (`This Week` / `Older`, no `Today` heading since it's empty), with **zero duplicates** (verified via the network responses' `id` fields, not DOM text).
- No stale/partial data from the interrupted first load persists anywhere after the second (successful) load settles.
- Refresh does **not** corrupt lazy-load state or leave the UI in a stuck/partial condition once the network genuinely completes — confirmed across 3 independent full runs of the delay→abort→reload→settle sequence.

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Precondition: app accessible, user authenticated | dashboard/chat loads | precondition | login flow completes | asserted |
| Precondition: browser maximized | all UI elements visible | precondition | not load-bearing headless; omitted from steps, same as sibling AFSs in this batch | out-of-scope *(cosmetic, no functional dependency observed)* |
| Precondition: ≥1 conversation in account | reusable data available | precondition | account has 18 | asserted |
| 1 Navigate to `/app/chat/` → "list, not a single conversation" | clean list-only navigation | step 1 | step 1: URL/title observed | clarification *(bare URL auto-redirects to the most-recent conversation; the list itself — the actual test target — still renders correctly regardless; filed GH#89 finding 1)* |
| 2 Wait 1s for page to stabilize | render complete | steps 1–2 (decomposed into condition-based waits) | step 5: heading-appears wait | asserted *(decomposed; case's fixed "wait 1s" replaced with a condition-based wait per `.agents/testing.md` § Conventions)* |
| 3 Read expected count from UI ("Conversations: N" or badge) | expected_count = N | step 2 | step 2: no such UI text exists — derived from API response instead | clarification *(no count badge exists in the UI at all, unlike Agents/Pipelines; filed GH#89 finding 2)* |
| 4 Wait 4s (partial lazy load) | some items appear, load in progress | step 3 (route-delay substitution) | step 3: DOM empty, no loader, mid-flight state captured | asserted *(decomposed/substituted — see note below)* |
| 5 Count visible conversations at this point (M, may be < N) | partial count M | step 3 | step 3: `rowCount=0` during the artificially-widened delay window | clarification *(under real/undelayed network conditions the initial fetch resolves in ~1.9–3.5s and returns each group's up-to-10-item page in one shot — a real 4s-elapsed wall-clock delay on a normal connection would already show the FULL first-page count, not a genuine M<N partial state; a deterministic partial-load window requires an artificial network delay, which is what step 3 substitutes)* |
| 6 Refresh via `location.reload()` or browser refresh | page reloads completely | step 4 | step 4: `net::ERR_ABORTED` observed on the in-flight request | asserted |
| 7 Wait 10+s with scroll trigger (scroll down/up, check loaders) | full lazy load strategy applied | steps 5–6 | step 5: condition-based heading wait (not fixed 10s); step 6: explicit expand+scroll of the "Older" group (the actual scroll-trigger surface — see Known Defects finding 4) | asserted *(decomposed; case's generic "scroll down/up" translated to this app's real trigger — expand a specific group's heading, then scroll ITS OWN container, not the outer page)* |
| 8 Count all visible conversations = N | exact match | step 7 | step 7: 18 == 18 | asserted |
| 9 Verify grouped by time: "Today"/"This Week"/"Older" | groupings present | step 8 | step 8: only non-empty groups render a heading | clarification *("Today" renders no heading when its total is 0 — case assumes all three always visible; filed GH#89 finding 3)* |
| 10 Verify no duplicates | none found | step 9 | step 9: id-set union check across both network responses | asserted *(decomposed — used API ids, not DOM name text, since names legitimately repeat)* |
| Expected Final State: reload completes full lazy load without errors, N conversations correct, no duplicates/stale data | as described | steps 4–9 | throughout | asserted |
| Key validation: refresh does not corrupt lazy load state | no corruption | steps 4–9 | 3 independent full runs, 0 console/page errors each time | asserted |
| Teardown: none required | nothing to clean up | n/a | read-only throughout, only `GET` requests observed | asserted |

### Axis 2 — Analyst additions

- Discovered and documented the group-scoped, capped-at-10 pagination mechanism (`date_group=older&limit=10&offset=10`) — *added: this is the actual, non-obvious lazy-load trigger surface for this module; the case's authored steps assume a flat infinite-scroll list like Agents/Pipelines, which this list does not have.*
- Verified zero console errors/warnings and zero `pageerror` events across the full delay→abort→reload→settle sequence, run 3 independent times — *added: the case doesn't mention console health; this is the strongest signal that an interrupted fetch doesn't leave the app in a broken JS state.*
- Cross-checked "no duplicates" via the network responses' `id` fields rather than DOM text — *added: a name-based DOM diff would false-positive given this account's data (7 of 18 conversations share the literal name "Hello, test").*
- Noted and cross-referenced a live-environment characteristic already documented by test-automation-lead (`.agents/memory/test-automation-lead/live_env_asset_load_timeout_under_heavy_volume.md`): under this batch's heavy concurrent parallel-analyst load (7 simultaneous live sessions), one run of the settle-wait took 30s+ (vs. ~1.9–3.5s in isolation) before the sidebar rendered — *added: not a new defect, but directly informs the wait-timeout recommendation in § Automation Hints (do not hardcode a 10s ceiling).*
- Verified `window.location.href` before trusting every read, per the project's known parallel-analyst browser-isolation gotcha (`.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`) — ran in a dedicated `playwright-cli -s=TC-064` session with its own `--profile` directory, confirmed isolated via a fresh Keycloak bounce on first navigation.

## Cleanup
1. None required — read-only case; only `GET` requests observed throughout (confirmed via full network log inspection across every run in this session).

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Login username / password / Sign In | `getByRole('textbox', {name:'Username or email'})` / `{name:'Password'}` / `getByRole('button', {name:'Sign In'})` | none needed |
| "Conversations" sidebar section label | `getByText('Conversations', { exact: true })` — plain `<span>`, **not** an ARIA heading | scope by proximity to the "Create folder"/"Search conversations" buttons that sit alongside it |
| Group heading — "This Week" | `getByRole('heading', { name: 'This Week', level: 6 })` — renders **only** when `date_groups.this_week.total > 0` | none needed — tier-1 handle |
| Group heading — "Older" | `getByRole('heading', { name: 'Older', level: 6 })` — renders only when `total > 0`; **clicking this heading directly expands/collapses the group** (confirmed live — no need to target the adjacent chevron icon button, which has no accessible name) | none needed |
| Group heading — "Today" | `getByRole('heading', { name: 'Today', level: 6 })` — **absent from the DOM entirely** when `date_groups.today.total === 0` (this account's current state) | assert conditionally on the API response's `today.total`, not unconditionally |
| Conversation row (generic) | `div[role="button"]` scoped under `.MuiCollapse-wrapperInner` (per-group container) — **not** a real `<button>` tag, a `div[role="button"]` (dnd-kit draggable); accessible name = the conversation's display title (**not unique** — multiple real conversations share the same auto-generated name) | `.active-conversation` class (per `tests/pages/conversation.page.ts`'s existing `activeConversationRow()`) for the currently-open one specifically |
| Conversation-list scroll container (appears only once a group with >10 items is expanded) | Structural: the ancestor `div` whose `scrollHeight > clientHeight` containing `.MuiCollapse-wrapperInner` — **no stable class/testid**; flagged per Locator Ladder stop+flag rule, same gap class as the card-grid's `.MuiCard-root` (GH#12/#13) | `panel.scrollTop = panel.scrollHeight` via `page.evaluate` (used for this exploration) |
| Loading indicators | `[role="progressbar"], [aria-busy="true"]` (same handle as `cardGridList.page.ts`'s `loadingIndicators()`) — **confirmed absent throughout the entire Conversations-list load**, in every run; do not gate a wait on this appearing | gate on content (a group heading, or a conversation row) appearing instead |
| Per-conversation unique identifier (for duplicate detection) | **No DOM-level id/data-attribute exists on the row** (`aria-describedby="DndDescribedBy-N"` is a render-order index, not a content key — confirmed via full attribute sweep) — use the underlying `folder/prompt_lib` network response's `conversations[].id` field instead | none higher-tier available in the DOM |
| Initial list-fetch endpoint (route-intercept target for the mid-load trigger) | `GET /api/v2/elitea_core/folder/prompt_lib/{ownerId}?sort_by=updated_at&sort_order=desc&grouped=true` — match on `grouped=true` present **and** `date_group=` absent to avoid also delaying the per-group pagination calls | none needed |
| Group-scoped pagination endpoint | `GET /api/v2/elitea_core/folder/prompt_lib/{ownerId}?grouped=true&date_group={today\|this_week\|older}&limit=10&offset=10&sort_by=updated_at&sort_order=desc` | none needed |

## Network Behavior
- `GET /api/v2/elitea_core/folder/prompt_lib/{ownerId}?sort_by=updated_at&sort_order=desc&grouped=true` — fires once per full page load. Response: `{ date_groups: [{name, total, conversations: [...up to 10]}], selected_conversation_id }`. **Each group's `conversations` array is capped at its first 10 entries regardless of `total`** — this is the field to sum for "expected total conversation count," since no UI text ever shows it.
- `GET /api/v2/elitea_core/folder/prompt_lib/{ownerId}?grouped=true&date_group={group}&limit=10&offset=10&...` — fires only when a group with `total > 10` is expanded AND its own scrollable container is scrolled to the bottom. Response: `{ date_group, total, limit, offset, conversations: [...] }` (single-group shape, not the full `date_groups` array). Confirmed this account's `older` group requires exactly one such follow-up (`offset=10` → the final 2 of 12).
- `GET /api/v2/elitea_core/conversation/prompt_lib/{ownerId}/{conversationId}?messages_limit=10&sort_order=desc` — fires for whichever conversation the bare `/app/chat/` redirect auto-opens; unrelated to the sidebar list itself but always accompanies a `/app/chat/` navigation on this account.
- `POST /api/v2/elitea_core/select_conversation/prompt_lib/{ownerId}/{conversationId}` — fires alongside the above; server-side "mark as selected" call, not a mutation relevant to this case.
- No `POST`/`PUT`/`DELETE` fired at any point during this case's entire exploration — confirms the read-only Teardown claim.
- Analytics beacons (`google-analytics.com/g/collect`) and `socket.io` polling fire continuously in the background — unrelated noise, same as every other AFS in this batch.

## Known Defects Found During Exploration

**No product defects — refresh-during-load does not corrupt state, and the app recovers cleanly and correctly every time the underlying network genuinely completes.** Findings below are case-authoring drift, all bundled into one clarification ticket per this project's bundling convention for same-case findings:

1. **[INFO/CLARIFICATION] — filed [`GH#89`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/89), finding 1.** Bare `/app/chat/` does not show "the list, not a single conversation" as the case's Step 1 expects — it auto-redirects client-side to the most-recently-active conversation. The sidebar list (the actual lazy-load subject) still renders correctly regardless, so this doesn't block automation, just the literal "clean list-only navigation" framing.
2. **[INFO/CLARIFICATION] — GH#89, finding 2.** No `"Conversations: N"` count badge exists anywhere in the UI, unlike Agents/Pipelines. Expected count must be derived from the `folder/prompt_lib` response's per-group `total` fields.
3. **[INFO/CLARIFICATION] — GH#89, finding 3.** Case Step 9 assumes "Today"/"This Week"/"Older" are always all three present; live, a group with `total=0` renders **no heading at all** (confirmed for "Today" in this account).
4. **[INFO/CLARIFICATION] — GH#89, finding 4, the most consequential.** The Conversations list is **not** a single flat lazily-paginated list like Agents/Pipelines (`cardGridList.page.ts`). It's group-based: the initial call returns every group's first 10 items in one shot; a group's remainder only loads via a second, group-scoped request triggered by expanding that specific group and scrolling ITS OWN container — not the outer page. A generic "keep scrolling" gesture applied to the whole page (as the case's Step 7 literally describes) will not trigger anything unless a specific >10-item group has first been expanded.
5. **[Environment observation, not filed as a defect — already documented precedent]** Settle time after a reload varied from ~1.9–3.5s (isolated) to 30s+ (during this batch's peak concurrent 7-analyst load), consistent with `.agents/memory/test-automation-lead/live_env_asset_load_timeout_under_heavy_volume.md`. Automation should use a generous condition-based wait, not a fixed short timeout.

## Blocked Steps
None. Case executed end-to-end against the live system with no access, data, or environment blockers. The one genuinely slow settle (30s+) was diagnosed as a known, already-documented environment characteristic under heavy concurrent load, not a blocker — re-confirmed recoverable via 2 additional clean runs.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md`. Lands in `tests/lazy-loading.spec.ts` (new file, batched with the rest of the `lazy-loading` module).
- **Do not rely on a fixed real-world "wait N seconds" to produce a genuine partial-load state.** Under normal network conditions this list's initial fetch resolves in ~2–4s and returns each group's full first page in one response — there's no naturally-occurring "M < N mid-load" window wide enough to reliably hit with a fixed delay. Use `page.route()` to artificially delay the `grouped=true` (non-`date_group`) response by a few seconds, matching the pattern this AFS's own step 3 used, to make the interruption deterministic.
- Wait strategy for post-reload settle: condition-based on `getByRole('heading', { name: /This Week|Older|Today/ }).first()` becoming visible, **not** a fixed 10s timeout — this batch observed real settle times from ~2s up to 30s+ under heavy concurrent load. Recommend a timeout in the 20–30s range for this specific wait, consistent with this project's other generous live-backend waits (e.g. `conversationNotFoundDialog()`'s 15s).
- Page object: no dedicated page object exists yet for the Conversations sidebar list itself (`tests/pages/conversation.page.ts` covers the kebab-menu/delete-dialog/row-lookup surface, not the lazy-load/grouping surface this case exercises). Recommend extending `conversation.page.ts` with the handles captured above (group heading locators, expand+scroll-to-load-more, total-count-from-network helper) rather than creating a new file — same module, same underlying sidebar component TC-063/TC-065/TC-066/TC-067's AFSs also touch.
- Assert "expected total" and "no duplicates" primarily via the `folder/prompt_lib` network responses' `total` and `id` fields (race-free), with the DOM row count as a secondary/sanity check — mirrors the pattern established in `l2_dismiss-unsaved-changes-modal_TC-054.md` and the agents/pipelines modules' `search_options`-based assertions.
- **Analyst execution note (process/tooling, not product):** ran in a `playwright-cli -s=TC-064` isolated session with a dedicated `--profile` directory, since this batch dispatched 7 concurrent sibling analysts (TC-060..063, 065..067) against the same shared account — per `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`. Verified isolation via a fresh Keycloak login redirect on first navigation. `playwright-cli run-code` was used (not plain `eval`) to script the precise multi-step delay→reload→settle timing sequence with `page.route()`/`page.on('console'|'pageerror'|'response')` instrumentation in one continuous execution context, since spreading that timing-sensitive sequence across separate CLI invocations (each with its own process-startup overhead) would not reliably land the reload inside the artificial delay window. Note: `page.route()` handler callbacks in this CLI's `run-code` sandbox do **not** have a global `setTimeout` — use `page.waitForTimeout(ms)` inside route handlers instead (confirmed: `setTimeout is not defined` `ReferenceError` on first attempt).
