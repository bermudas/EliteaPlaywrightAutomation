# Test Case: Pipelines List Scroll Trigger Loads Additional Items

## Metadata
- **TMS ID**: TC-061
- **Linked Story**: GH#74 (task), parent epic GH#16 (WebQAPreExecuted batch, module: lazy-loading)
- **Priority**: l2
- **Environment Explored**: production (`https://next.elitea.ai/`)
- **Analyst**: qa-engineer (Sage), analyst slot, 2026-07-03
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`).
- User `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) is authenticated via Keycloak SSO. This session established its own fresh, isolated session (`playwright-cli -s=TC-061`, in-memory profile) rather than trusting an inherited one — confirmed via a Keycloak bounce on first navigate (no pre-existing cookies).
- Test account contains **at least 1 pipeline** in its default/landing project — literally true (case's own precondition). **However**, the case's actual subject — scroll-triggered loading of *additional* batches — is only observable when the selected project has **more pipelines than one page** (`limit=20`, confirmed via network). The default "Private" project (id 21) currently has only **2** pipelines (was 1 at GH#14 filing time) — too few to ever fire a second page. This session switched the project-scope combobox to **"ELITEA Agents for SDLC"** (id 27, `total: 31` at time of testing — a live, shared, growing dataset) specifically to exercise the real mechanic. See § Known Defects Found (GH#82, Finding 3) and § Automation Hints for the implementer decision this implies.
- Browser viewport: `1920×1080` (project's confirmed smoke-suite viewport, per `.agents/testing.md` § Locator strategy) — case's own "maximize browser window" precondition mapped to this fixed viewport.

## Test Data

N/A (read-only test using existing, live, shared account data). No generation, no cleanup. The pipeline counts observed (`2` under "Private", `31` under "ELITEA Agents for SDLC") are **not** fixture data — they drift over time as other parallel automation/manual sessions create/delete pipelines against the same shared account (`alita@elitea.ai`). Do not hardcode either number as an exact assertion; assert `≥1` for the default-scope smoke path, and `rows.length === total` (whatever `total` currently is) for the pagination path.

## Test Steps

1. Navigate to `${BASE_URL}/app/pipelines/all`.
   - **Verify**: URL is `${BASE_URL}/app/pipelines/all`; page title is `Pipelines: all - {project name}`; a `[role="progressbar"]`/`[aria-busy="true"]` may be present momentarily post-navigation (Pipelines shows this indicator, unlike Agents — confirmed prior session, TC-004 AFS).
2. Wait for the loading condition to clear: poll until `document.querySelectorAll('[role="progressbar"], [aria-busy="true"]').length === 0` (condition-wait, **not** a fixed sleep). Observed real settle time on this pass: sub-2s, consistent with TC-004's prior "~1.5–2s" finding (this session's own CLI round-trip latency made it impossible to catch the indicator mid-flight — by the time any follow-up check ran, the fetch had already resolved; treat "~2s" as the ceiling to poll for, not something to assert as *visibly* present).
3. Read the initial batch count (M) by counting rendered pipeline cards.
   - **Verify**: `document.querySelectorAll('#EliteACustomTabPanel .MuiCard-root').length === 20` under the "ELITEA Agents for SDLC" scope (`total: 31 > limit: 20`, so the first page is a full 20-row page). Confirms M = min(total, 20).
4. Read the expected total count (N) from the network response, **not** the case's suggested UI badge.
   - **Verify**: `GET /api/v2/elitea_core/applications/prompt_lib/{project_id}?...agents_type=pipeline&limit=1&offset=0` returns `200` with `{ total: N }`. The case's own suggested handle (a "Pipelines: N" sidebar badge) does **not** exist under every project scope — see § Known Defects Found (GH#82, Finding 2). Confirmed absent entirely under "ELITEA Agents for SDLC" (176-contributor project shows a "Top Contributors" panel in that exact position instead); confirmed present (`"Pipelines:" "2"`) only under the personal "Private" project.
5. Scroll the **actual scrollable container** to its bottom: `document.getElementById('EliteACustomTabPanel').scrollTop = <that element's own scrollHeight>`.
   - **Verify**: the case's own literal step 5 technique (`window.scrollTo(0, document.body.scrollHeight)`) is confirmed a **complete no-op** — `document.body.scrollHeight === window.innerHeight` (720 = 720) and, after calling it, both `window.scrollY` and the panel's own `scrollTop` remain `0`. Do not implement the case literally. See § Known Defects Found (GH#82, Finding 1).
   - **Verify**: scrolling the real container (`#EliteACustomTabPanel.scrollTop = scrollHeight`) clamps to `660` (the container's `clientHeight`, confirming a real scroll occurred against `scrollHeight: 1320`) and triggers `GET .../applications/prompt_lib/27?...&agents_type=pipeline&limit=20&offset=20` (confirmed fired, `200`, returned the remaining 11 pipelines).
6. Wait for the offset-paginated response to resolve (condition-wait on the network response — see `CardGridListPage.waitForNextPageResponse` pattern already in the codebase — not a fixed sleep).
   - **Verify**: response status `200`; `offset=20` query param present.
7. Re-count visible pipeline cards.
   - **Verify**: count is now `31` (`> M`, and `=== N` from step 4) — one single follow-up page fully satisfied the remaining `31 − 20 = 11` rows; no third `offset=40` request was needed or observed for this dataset size.
8. Scroll the container back to top: `#EliteACustomTabPanel.scrollTop = 0`.
   - **Verify**: `scrollTop === 0`.
9. Wait briefly for stabilization (condition-wait, not fixed sleep — poll card count for stability across 2 consecutive reads).
10. Check for loading indicators: `[role="progressbar"]` or `[aria-busy="true"]`.
    - **Verify**: both return `0` matches (already resolved by this point; no additional wait was needed on this pass, but keep the case's own "if present, wait 3 more seconds" as a defensive ceiling in the condition-wait's timeout, not as a fixed extra sleep).
11. (Folded into the same condition-wait as step 10 — see § Automation Hints on translating "wait N seconds" language.)
12. Count all visible pipeline cards.
    - **Verify**: exactly `N` pipeline cards are visible — stable across repeated reads, no further network requests fired. **Do not compare against the `N` value captured in step 4** (a value read *before* the scroll/pagination sequence) — this account is shared across concurrent parallel automation/analyst activity and its counts drift mid-run (confirmed independently twice: TC-003's AFS observed 211→212, TC-060's AFS observed 213→214 mid-sequence; see `.agents/memory/qa-engineer/shared_account_count_drift_breaks_exact_lazy_load_counts.md`, GH#81). This session's own race window was short (~1-2s, one scroll cycle) and did not hit the drift in practice (`31` held steady start to finish), but the *assertion technique* must still re-derive `N` at the point of the final check — either re-read the `total` field from the last-fired paginated response (`offset=20`'s own `total`, not step 4's separately-captured one) or re-issue the `limit=1&offset=0` count fetch immediately before this assertion.

## Expected Results
- Pipelines list page loads at `${BASE_URL}/app/pipelines/all`; no loading indicator remains after the wait condition clears.
- Scrolling the correct container (`#EliteACustomTabPanel`, not `window`/`document.body`) triggers exactly the follow-up page(s) needed to load all `N` pipelines; the case's own literal scroll technique never triggers anything.
- Final visible card count equals `N`, the same `total` reported by the list API — no more, no fewer, no duplicates.
- No console errors during the entire flow (confirmed: 0 errors, 0 warnings across the session — only a version-banner `console.log`).
- All `GET /api/v2/elitea_core/applications/prompt_lib/{project_id}?...&agents_type=pipeline...` calls return `200` with a `{ total, rows }` shape; no unexpected `4xx`/`5xx`; no mutating (`POST`/`PUT`/`DELETE`) calls fired (read-only case, confirmed).

## Coverage Map

**Axis 1 — Case coverage**

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Precondition: test account has ≥1 pipeline | ≥1 pipeline exists | step 3 | step 3: card count ≥1 (trivially true; 20 observed) | asserted |
| Precondition: browser maximized | all UI visible | (pre-step, viewport set) | viewport fixed to 1920×1080 | asserted |
| 1 Navigate to `/app/pipelines/all` | "Pipelines" header visible, page loads | step 1 | step 1: URL + title check | asserted |
| 2 Wait 3s for initial batch | ≥1 card visible | steps 1–2 | step 2: condition-wait for `[role="progressbar"]`/`[aria-busy]` to clear (translated from fixed 3s per `.agents/testing.md` § Conventions) | asserted *(translated to condition-wait)* |
| 3 Read expected count from UI badge "Pipelines: N" | store expected count N | step 4 | step 4: network `total` field used instead — case's own UI-badge handle does not exist under every project scope | asserted *(different handle than the case names)* — clarification, GH#82 Finding 2 |
| 4 Count visible pipeline cards, record M | initial count M | step 3 | step 3: `M = 20` (== `min(total, limit)`) | asserted |
| 5 Scroll to bottom via `window.scrollTo(0, document.body.scrollHeight)` | page scrolls, triggers lazy load | step 5 | step 5: case's literal technique confirmed a no-op; corrected technique (`#EliteACustomTabPanel.scrollTop = scrollHeight`) used instead, confirmed to trigger the `offset=20` fetch | asserted *(different technique than the case names)* — clarification, GH#82 Finding 1 |
| 6 Wait 2 seconds | additional cards may appear | step 6 | step 6: condition-wait on the `offset=20` network response (translated from fixed 2s) | asserted *(translated to condition-wait)* |
| 7 Count visible pipeline cards again | count may be > M | step 7 | step 7: count = 31 > M(20) | asserted |
| 8 Scroll back to top via `window.scrollTo(0, 0)` | page scrolls to top | step 8 | step 8: case's literal `window.scrollTo` is consistent with Finding 1 (no-op on `window`); corrected to `#EliteACustomTabPanel.scrollTop = 0` | asserted *(different technique than the case names)* |
| 9 Wait 1 second | page stabilizes | step 9 | step 9: condition-wait, stability poll | asserted *(translated to condition-wait)* |
| 10 Check loading indicators, wait 3 more seconds if present | indicator handling | step 10 | step 10: both selectors checked, 0 matches by this point | asserted |
| 11 Wait 2 seconds for final stabilization | animations/loading complete | (folded into step 10's condition-wait) | — | asserted *(folded — see § Automation Hints)* |
| 12 Count all visible pipeline cards | exactly N cards visible | step 12 | step 12: count = 31 = N, stable across repeated reads | asserted |
| Expected Final State: cards show icon, name, tags in header, owner info | full card content | step 3/7/12 + screenshot | screenshot `TC-061-final-1920x1080.png` shows icon+name header, tags+owner-avatar footer row (owner avatar is bottom-**left**, not bottom-right as the case states) | asserted *(with a layout-detail correction)* — clarification, GH#82 Finding 5 |
| Expected Final State: single or 2-column card layout | grid layout | screenshot | screenshot shows **4 columns** at the project's own 1920×1080 viewport, not single/2-column | clarification — GH#82 Finding 4 |
| Expected Final State: "scroll triggering successfully loaded all batches" | all batches load via scroll | steps 5–7 | confirmed: one scroll-to-bottom action triggered the one needed follow-up page (`offset=20`), loading the remaining 11 of 31 rows | asserted |

**Axis 2 — Analyst additions**

- Asserts `GET /api/v2/elitea_core/applications/prompt_lib/{project_id}?...agents_type=pipeline...` returns `200` with `{total, rows}` on both the initial and paginated fetch — *added: the real network signal backing "list loaded"/"more loaded," not just a DOM snapshot which can pass on stale/cached markup.*
- Asserts 0 console errors across the full flow (including the project-switch interaction) — *added: standard side-channel discipline; verified clean in this session.*
- Asserts no third `offset=40` request fires once card count reaches `N` — *added: guards against an off-by-one/duplicate-fetch regression in the intersection-observer trigger (the list has exactly 2 pages at `total=31`; a bug that kept re-firing past completion would be silent without this check).*
- Asserts the project-scope combobox interaction itself produces no unexpected navigation/reload of the pipelines list beyond the expected data refresh — *added: confirmed via URL staying at `/app/pipelines/all` throughout the switch, not incidental to the case's own steps but cheap to verify given the switch was already necessary (see Finding 3).*
- Step 12's final-count assertion is required to re-derive `N` at assertion time rather than reuse step 4's early-captured value — *added: directly inherited from a sibling analyst's cross-case finding (TC-060, GH#81) that this shared account's counts can drift mid-run; this session's own race window was short enough not to trigger it, but the technique is guarded regardless, per `.agents/memory/qa-engineer/shared_account_count_drift_breaks_exact_lazy_load_counts.md`.*

## Cleanup
None required (read-only test, matches case's own Teardown section). The project-scope combobox selection is a **per-browser-profile UI preference** (persisted to `localStorage['elitea_ui.project.id']` scoped to that profile only — not shared backend account state), so no reset step is needed for an isolated automated-test browser context; flagging only because a **manual/MCP exploration session sharing a browser profile with concurrent siblings** would need to restore it (see prior sessions' memory notes on this project) — not applicable to the automated suite's own isolated `browser.newContext()` per test file.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback | Note |
|---|---|---|---|
| Pipelines nav item (sidebar) | `page.getByRole('button', { name: 'Pipelines' })` | — | Stable — real `role="button"` + accessible name. |
| Pipeline list container | `page.locator('#EliteACustomTabPanel')` | `page.getByRole('tabpanel')` | Shared with Agents list — same literal DOM id (`tests/pages/cardGridList.page.ts`, already extracted). |
| Pipeline card grid items (for counting) | `page.locator('#EliteACustomTabPanel .MuiCard-root')` (== `CardGridListPage.cards`) | `page.locator('[role="tabpanel"] .MuiGrid-root.MuiGrid-container > .MuiGrid-root')` | No `role`/`aria-label`/`data-testid` on the card root (GH#13, re-confirmed for this session's 31-card dataset). Use the existing `CardGridListPage` page object — do not re-derive. |
| Loading indicators | `page.locator('[role="progressbar"], [aria-busy="true"]')` (== `CardGridListPage.loadingIndicators()`) | — | Page-level, not panel-scoped (existing page object already gets this right). |
| Scroll-to-bottom trigger | `CardGridListPage.scrollToBottom()` — `panel.evaluate(el => { el.scrollTop = el.scrollHeight })` | — | **Do not use `window.scrollTo(...)`** — confirmed no-op (GH#82 Finding 1). The existing page object already implements the correct technique; this AFS just confirms it live for Pipelines specifically at `N=31`. |
| Scroll-to-top | `CardGridListPage.scrollToTop()` | — | Same container, `scrollTop = 0`. |
| Expected-count network handle | `page.waitForResponse` on `GET .../applications/prompt_lib/{id}?...agents_type=pipeline&limit=1&offset=0`, read `.total` from body | UI badge `getByText('Pipelines:').locator('xpath=following-sibling::*[1]')` — **only reliable under a personal/private-type project scope** (GH#82 Finding 2); do not use as the primary handle | Prefer the network `total` — it is the only handle confirmed present under every project scope tested. |
| Next-page response wait | `CardGridListPage.waitForNextPageResponse('agents_type=pipeline', 20)` | manual `page.waitForResponse` matching `offset=20` | Existing helper is generic over `urlContains`/`offsetAtLeast` — reuse directly, pass `'agents_type=pipeline'` (the pipelines-specific query param, vs. `'agents_type=classic'` for Agents). |
| Project-scope combobox (needed only if the team adopts the "switch to a >20-item project" approach — see § Automation Hints) | `page.getByRole('combobox', { name: 'Private' })` then `page.getByRole('option', { name: 'ELITEA Agents for SDLC' })` | — | Confirmed live; the accessible name of the combobox itself changes to match the currently-selected project, so match on current-value at call time, not a hardcoded "Private" if selection may already differ. |

## Network Behavior
- `GET /api/v2/elitea_core/applications/prompt_lib/{project_id}?tags=&sort_by=created_at&sort_order=desc&query=&agents_type=pipeline&limit=20&offset=0` — the initial pipelines-list fetch, fires on navigate/project-switch. Response shape: `{ "total": <int>, "rows": [ { "id", "name", "description", "owner_id", "created_at", "authors": [...], "tags": [...], "status", "is_forked", ... } ] }`.
- `GET /api/v2/elitea_core/applications/prompt_lib/{project_id}?tags=&query=&agents_type=pipeline&limit=1&offset=0` — companion count-only fetch; **this is the stable "expected count" handle**, not the UI badge (see § Concrete Handles).
- `GET /api/v2/elitea_core/applications/prompt_lib/{project_id}?tags=&sort_by=created_at&sort_order=desc&query=&agents_type=pipeline&limit=20&offset=20` — **confirmed live this session** (project id 27, `total=31`): fires on scrolling `#EliteACustomTabPanel` to its bottom, returns the remaining 11 rows. This is the first direct confirmation of pipelines pagination firing (TC-004's AFS could only infer it by analogy with Agents, since the default project had just 1 row at that time).
- No further `offset=40+` request observed or expected — `31` rows fit in exactly 2 pages (`20 + 11`).
- No `POST`/`PUT`/`DELETE` calls fired — confirmed read-only, including through the project-switch interaction.
- All requests during this session returned `200`/`204`; 0 unexpected `4xx`/`5xx`.

## Known Defects Found During Exploration
- **[INFO]** Case step 5's `window.scrollTo(0, document.body.scrollHeight)` is a confirmed no-op on the Pipelines list — same root cause already filed for the Agents list (GH#12 Finding 1). The real scrollable container is `#EliteACustomTabPanel`. Filed as **GH#82** Finding 1 (`documentation` label).
- **[INFO]** Case step 3's "Pipelines: N" UI badge does not exist under every project scope — present only for personal/private-type projects; replaced by a "Top Contributors" panel under multi-contributor project scopes, with no numeric pipeline-count badge anywhere on the page in that case. Filed as **GH#82** Finding 2.
- **[INFO]** The account's default/landing project ("Private") has only 2 pipelines (was 1 at GH#14 filing) — too few to ever exercise this case's actual subject (scroll-triggered *additional*-batch loading). This session switched to "ELITEA Agents for SDLC" (id 27, `total: 31`) to observe the real mechanic. Filed as **GH#82** Finding 3; directly informs the § Automation Hints decision below.
- **[INFO]** "Expected Final State" column-count claim ("single or 2-column") does not match the observed 4-column grid at the project's confirmed 1920×1080 viewport — same drift pattern as GH#12 Finding 3 (Agents). Filed as **GH#82** Finding 4.
- **[INFO]** "Expected Final State" owner-info position claim ("bottom-right") does not match the observed layout (owner avatar bottom-left, pin/fork icon bottom-right). Filed as **GH#82** Finding 5.
- No functional product defects found — all findings are case-text/documentation drift; the product behaves correctly and consistently in every scenario tested.

## Blocked Steps
None. All 12 case steps were executed to completion against the live system (steps 5 and 8 required a corrected technique rather than the case's literal one — documented above, not a blocker). The case's core assertion — "scroll triggering successfully loads all N pipelines, no loading indicators remain" — is satisfiable and was verified true under a project scope large enough to actually exercise it.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — this case belongs in `tests/lazy-loading.spec.ts` (new module spec file per `.agents/testing.md` § Structure's module plan), batched with the rest of the lazy-loading module's AFS set into one PR.
- Page object: reuse `tests/pages/cardGridList.page.ts` (`CardGridListPage`) as-is — every handle this AFS needed (`cards`, `loadingIndicators()`, `scrollToBottom()`/`scrollToTop()`, `waitForNextPageResponse()`) already exists there from the Agents/Pipelines smoke work. No new page-object method required; this case is a pure re-use + a live confirmation of the `waitForNextPageResponse` helper's pipelines path (previously only exercised for Agents' `agents_type=classic`).
- **Decision needed from Tal/implementer**: this case's own subject (scroll loads *additional* batches) cannot be observed at all under the account's current default project (`total ≤ 20`). Two implementation options, pick one explicitly rather than defaulting silently:
  1. **Pin the test to a project scope known to exceed one page** (e.g. select "ELITEA Agents for SDLC" via the combobox before asserting pagination) — exercises the real mechanic every run, at the cost of a project-switch step not in the case's own text and a dependency on that project continuing to exceed 20 pipelines (currently 31, but shared/live — could shrink).
  2. **Make the pagination assertion conditional**: read `total` first: if `total > 20`, assert the `offset=20` request fires and final count `=== total`; if `total ≤ 20`, assert no pagination request fires and count stays at `total` (mirrors TC-004's existing "assert ≥1, no-op-safe" precedent for the default-scope case). This keeps the test valid regardless of which project ends up default, at the cost of the "scroll actually loads more" assertion only running some of the time.
  - This session executed option 1 manually to *produce* the confirmed handles above (a real `offset=20` fetch needs to exist somewhere to document it) — the implementer should decide which option the automated test itself takes. Recommend option 2 as the long-term-stable default (matches the account's read-only, shared, live-data philosophy already established for TC-004), with option 1's project-switch technique kept documented here in case the team later decides pagination coverage is important enough to force via a pinned project.
- **Wait strategy**: replace every "wait N seconds" case step (2, 6, 9, 11) with condition-waits — `[role="progressbar"]`/`[aria-busy="true"]` absence for steps 2/9-11, and `waitForNextPageResponse` for step 6 — per `.agents/testing.md` § Conventions. Do not hardcode `page.waitForTimeout()`.
- Session isolation note: executed via `playwright-cli -s=TC-061` (dedicated in-memory Chrome profile, own pid) per this project's confirmed parallel-analyst hazard (shared default MCP browser profile collides across concurrent sibling analyst sessions — see `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`). Re-verified `window.location.href` before trusting each read. No cross-talk observed with sibling TC-060/062..067 sessions during this run.
