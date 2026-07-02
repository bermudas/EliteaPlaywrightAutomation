# Test Case: Navigate to Pipelines Section - List Loads

## Metadata
- **TMS ID**: TC-004
- **Linked Story**: GH#6 (task), parent epic GH#1
- **Priority**: l1
- **Environment Explored**: production (`https://next.elitea.ai/`)
- **Analyst**: qa-engineer (Sage), analyst slot, 2026-07-02
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User `${TEST_USER}` (`alita@elitea.ai` / `ELITEA_EMAIL` / `ELITEA_PASSWORD`) is authenticated. **Deviation from case text**: the case's own Setup assumes a carried-over session from a prior test in the same suite run; this analysis session established its own session explicitly instead of trusting an inherited one (see § Automation Hints — Session note).
- Test account contains **at least 1 pipeline** in its default/landing project. The case's documented "baseline: 11 pipelines" does **not** hold under the account's default project scope — see § Known Defects Found (GH#14) and Coverage Map disposition below. Do not assert an exact count; assert `≥1`.

## Test Data

N/A (read-only test using existing data). No generation, no cleanup.

## Test Steps

1. Navigate to `${BASE_URL}/app/pipelines/all`.
   - **Verify**: URL is `${BASE_URL}/app/pipelines/all`; a `[role="progressbar"]` is present momentarily on/just after navigation (confirmed present in 1/1 observation immediately post-navigate).
2. Wait for the loading condition to clear: `[role="progressbar"]` count reaches `0` (poll/condition-wait, **not** a fixed sleep — see § Automation Hints). Observed real settle time: **~1.5–2s**, well under the case's "10+ seconds" framing.
   - **Verify**: `document.querySelectorAll('[role="progressbar"]').length === 0`.
3. (Case steps 3–6: scroll to bottom, wait, scroll to top, wait) — **executed but produced no observable effect** under the default project's data volume (1 pipeline; `document.body.scrollHeight` ≈ viewport height, nothing to lazy-load). Keep the scroll-to-bottom action in automation as a no-op-safe defensive step (harmless if a future project scope has more pipelines and true lazy-load kicks in — see `agents_type=pipeline&limit=20&offset=0` pagination pattern in § Network Behavior) but do not assert on it; there is nothing to verify with only 1 row.
4. Re-check `[role="progressbar"]` and `[aria-busy="true"]` are both absent (final-stabilization check).
   - **Verify**: both selectors return 0 matches. `[aria-busy="true"]` was never observed present at any point in this session (0/2 checks, including mid-load) — treat it as a defensive OR-condition only, not a signal to actively wait for.
5. Count pipeline cards within the list container.
   - **Verify**: card count `≥ 1`. Recommended handle: see § Concrete Handles — the case's own `[role="button"]` hint does **not** match any element inside a card (confirmed 0 matches via direct DOM query) — see § Known Defects Found (GH#13). Use the structural fallback instead.
6. Verify the first pipeline card's text content is non-empty and contains a real pipeline name.
   - **Verify**: first card's `textContent` includes a name string (observed: `"Analyze GitHub Issues"`, plus tag chips `qa`, `pipeline` concatenated in the same text node — assert with a substring/contains check, not exact match, since tags are appended in the same container's text).

## Expected Results
- Pipelines list page is loaded at `${BASE_URL}/app/pipelines/all`.
- At least 1 pipeline card renders in the grid/card layout, each showing an icon, pipeline name, tags, and owner avatar.
- No loading indicator (`[role="progressbar"]`) remains after the wait condition clears.
- No console errors during the entire flow (confirmed: 0 errors, 0 warnings across the session).
- `GET /api/v2/elitea_core/applications/prompt_lib/{project_id}?...&agents_type=pipeline...` returns `200` with a `{ total, rows }` shape; `rows.length ≥ 1` and `rows.length === min(total, limit)`.

## Coverage Map

**Axis 1 — Case coverage**

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Setup 2: verify authenticated state via redirect check | user authenticated | (pre-step, own session) | login verified via API response `authors[0].email == alita@elitea.ai` on the live pipelines-list fetch | asserted |
| Precondition: test account has ≥1 pipeline (baseline: 11) | ≥1 pipeline exists | step 5 | step 5: card count ≥1 | asserted *(≥1 only)*; **baseline "11" claim** | clarification — GH#14 |
| 1 Navigate to `/app/pipelines/all` | list begins loading | step 1 | step 1: URL + progressbar present | asserted |
| 2 Wait 3s for initial render | structure visible, loading indicators may be present | step 1–2 | step 1: progressbar observed present at navigate; step 2: condition-wait for it to clear (~1.5–2s observed, not a fixed 3s) | asserted *(translated to condition-wait per `.agents/testing.md` § Conventions)* |
| 3 Scroll to bottom to trigger lazy load | additional cards may appear | step 3 | step 3: scroll executed; no additional cards observed (only 1 row present, nothing to lazy-load) | asserted *(no-op under current data; see note)* |
| 4 Wait 2s for lazy load fetch | additional cards may appear | step 3 | — (nothing to wait for; no offset-paginated request fired) | out-of-scope *(not reproducible with current data volume — would require a project with >20 pipelines to observe a true `offset=20` follow-up call)* |
| 5 Scroll back to top | scroll executed | step 3 | step 3 | asserted |
| 6 Wait 1s for stabilization | page stops moving | step 4 | step 4: settle check | asserted *(translated to condition-wait)* |
| 7 Check `[role="progressbar"]` / `[aria-busy="true"]`, wait 3s more if present | if present, wait | step 4 | step 4: both selectors checked, progressbar transient (clears ~1.5-2s), aria-busy never observed | asserted |
| 8 Wait additional 2s for final stabilization | cards fully rendered | step 4 | step 4 | asserted *(folded into the same condition-wait as step 7)* |
| 9 Count cards via `[role="button"]` | ≥1 card visible | step 5 | step 5: card count ≥1 via structural fallback (see § Known Defects GH#13 — `[role="button"]` selector itself matches 0 elements inside a card) | asserted *(with a different selector than the case names — clarification)* — GH#13 |
| 10 Verify first card contains pipeline name text | name visible (e.g. "Analyze GitHub Issues") | step 6 | step 6: first card textContent contains a real name | asserted |
| Expected Final State: card shows icon, name, tags in header, owner info | full card content | step 5–6 + screenshot | screenshot `TC-004-step-9-cards-loaded.png` visually confirms icon, name, `qa`/`pipeline` tag chips, owner avatar | asserted |
| Expected Final State: "total wait time approximately 10+ seconds" | — | — | actual settle time observed ~1.5–2s | clarification *(case's wait-time framing is a manual-execution buffer, not a real requirement — see § Automation Hints)* |

**Axis 2 — Analyst additions**

- Asserts `GET /api/v2/elitea_core/applications/prompt_lib/{id}?...agents_type=pipeline...` returns `200` with `{total, rows}` — *added: this is the real network signal backing the "list loaded" state; a UI-only assertion can pass on stale/cached DOM, the network assertion guards against that.*
- Asserts 0 console errors across the full flow — *added: standard side-channel discipline per skill's "silent errors are the worst bugs" guidance; verified clean in this session.*
- Asserts response author identity (`authors[0].email`) matches `${TEST_USER}` on first load — *added: cheap, free verification (already in the fetched payload) that the authenticated-session precondition is real, not assumed — directly relevant since this session discovered the session may be inherited/shared (see § Automation Hints).*

## Cleanup
None required (read-only navigation test, matches case's own Teardown section).

## Concrete Handles (discovered during exploration)

**Card list container / card counting — no stable semantic handle exists; structural fallback only (flagged, not a confident recommendation):**

| Element | Recommended Locator | Fallback | Note |
|---|---|---|---|
| Pipelines nav item (sidebar) | `page.getByRole('button', { name: 'Pipelines' })` | — | Stable — real `role="button"` + accessible name, confirmed via snapshot. |
| Pipeline list container | `page.getByRole('tabpanel')` (scoped to the one active tabpanel on this page) | `page.locator('[role="tabpanel"]')` | Stable — real ARIA role present. |
| Pipeline card grid items (for counting) | **No stable handle** — see GH#13. Best available: `page.locator('[role="tabpanel"] > div > div')` (tabpanel → grid-container → grid-item, by DOM structural position) | `page.locator('[role="tabpanel"] .MuiGrid-root.MuiGrid-container > .MuiGrid-root')` (MUI framework class, not project-specific — moderately more resilient to unrelated markup churn than raw structural nesting, but breaks on a MUI major-version upgrade) | **Flagged gap**: card wrapper (`MuiGrid-root` → `MuiBox-root` → `MuiPaper-root` → `MuiCardContent-root`) has no `role`, `aria-label`, or `data-testid` anywhere. The case's own `[role="button"]` hint matches 0 elements in this subtree (verified). Filed as GH#13 — recommend the implementer treat this selector as provisional and revisit once/if the product adds a testid. |
| First card's name text | `page.getByRole('tabpanel').locator('> div > div').first()` then `.textContent()` contains-check | `getByText('Analyze GitHub Issues')` (works only while this specific pipeline exists — fragile, data-dependent) | Use a contains/non-empty assertion on the first structural card, not an exact hardcoded pipeline name (name is real account data, not fixture data, and can change). |
| Project/workspace switcher (top-left combobox) | `page.getByRole('combobox')` (only one present in that toolbar position) | — | Confirmed via snapshot; used during exploration to establish the project-scope finding (GH#14). Not part of the case's own steps — do not add a project-switch step to the automated test unless the team resolves GH#14 by pinning a specific project. |

## Network Behavior
- `GET /api/v2/elitea_core/applications/prompt_lib/{project_id}?tags=&sort_by=created_at&sort_order=desc&query=&agents_type=pipeline&limit=20&offset=0` — the real pipelines-list fetch. Fires on navigate. Response shape: `{ "total": <int>, "rows": [ { "id", "name", "description", "owner_id", "created_at", "authors": [{ "id", "email", "name", "avatar" }], "tags": [{ "name", "data": {"color"}, "id" }], "status", "is_forked", ... } ] }`.
- `GET /api/v2/elitea_core/applications/prompt_lib/{project_id}?tags=&query=&agents_type=pipeline&limit=1&offset=0` — companion count-only fetch (`limit=1`), likely backs the "Pipelines: N" footer stat in the sidebar. Also fires on navigate, redundant with `total` from the main call — implementer's call whether to wait on this one too or just the primary list call.
- Pagination: `...&limit=20&offset=20`, `offset=40`, etc. fire on scroll **only when `total > 20`** (confirmed via the analogous Agents-page pattern with `agents_type=classic`, same endpoint family; not directly observed for pipelines in this session since the default-project pipeline count is 1). Implementer should wait on this offset-paginated request (if/when it fires) rather than the scroll action itself completing.
- No `POST`/mutating calls — this is a read-only case, confirmed no unexpected writes fired.

## Known Defects Found During Exploration
- **[MINOR]** Pipeline cards expose no `role`, `aria-label`, or `data-testid` — the case's own `[role="button"]` selector hint matches 0 elements inside a card (confirmed via direct DOM query; the 11 site-wide `[role="button"]` matches are all sidebar/toolbar chrome, unrelated to the card grid). Filed as **GH#13** (`bug` label). Automation recommendation: use the structural fallback locator documented in § Concrete Handles, with a code comment referencing GH#13, and revisit once the product adds a stable handle.
- **[INFO]** The case's precondition "baseline: 11 pipelines" (also documented in `.agents/profile.md`) only holds under a non-default project ("ELITEA Agents for SDLC", id 27, observed `total: 31`). The account's default/landing project ("Private", id 21) has only `total: 1` pipeline. The case doesn't specify which project to select, so the *actual, testable* requirement is "≥1 pipeline card visible," which holds true under the default project. Filed as **GH#14** (`documentation` label). Automation recommendation: assert `≥1`, never assert an exact count or "≥11" against the default project.

## Blocked Steps
None. All 10 case steps were executed to completion against the live system; the two findings above are documented deviations (clarification / minor defect), not blockers — the case's core assertion ("at least 1 pipeline card is visible") is satisfiable and was verified true.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — this is TC-004 in the shared serial `tests/smoke.spec.ts` file (`test.describe.configure({ mode: 'serial' })`), not an independent spec file.
- **Wait strategy**: replace all of the case's "wait N seconds" steps (2, 4, 6, 7, 8) with a single condition-wait: poll/`expect.poll` (or `page.waitForFunction`) until `document.querySelectorAll('[role="progressbar"]').length === 0`, with a generous ceiling (e.g. 10s timeout, matching the case's own worst-case framing) but expect real resolution in ~2s. Do **not** hardcode `page.waitForTimeout()` per `.agents/testing.md` § Conventions. `[aria-busy="true"]` can stay in the wait condition as a defensive OR (per the case's own step 7 wording) even though it was never observed firing in this session — cheap to keep, not observed to be load-bearing.
- **Session note**: this analysis session discovered the Playwright MCP browser used for exploration is a **shared, persistent-profile browser** (no `--isolated` flag in `.mcp.json`), and concurrent sibling analyst sessions (TC-001/002/003/005, running in parallel) were observed navigating the same underlying browser's default tab and even the same `localStorage` (project-selection) state. This analysis mitigated by working in a dedicated new tab and re-selecting it before each action, and verified the authenticated identity via the live API response (`authors[0].email == alita@elitea.ai`) rather than trusting the inherited session blindly. **This is an environment/CI-authoring concern for the framework implementer**, not something the AFS's own test needs to handle — a real Playwright test run (via `npx playwright test`) uses its own isolated browser context per the framework's `playwright.config.ts`, so this hazard is specific to concurrent *manual/MCP exploration*, not to the automated suite. Flagging here so Tal/the implementer is aware this was observed during analysis, in case other sibling AFS files mention the same thing (cross-check `test-specs/smoke/l1_*` for corroboration).
- Do not add a project-switching step to automate around GH#14 — that would be scope creep beyond what the case asks for (assert `≥1`, not `≥11`). If the team resolves GH#14 by pinning a project, this AFS's precondition section will need a corresponding update.
- Page object: `tests/pages/` not yet created at bootstrap time (per `.agents/testing.md` § Structure). TC-003 (Agents list) shares the identical lazy-load-list pattern with TC-004 (Pipelines list) — strong candidate for a shared `ListPage`/`CardGridPage` page object once both are implemented, per the "3+ repeats" rule in `.agents/testing.md`. Coordinate with whoever implements TC-003.

## Implementer Amendment (Phase 2 exploration, 2026-07-02)

Re-verified all Concrete Handles live via `playwright-cli` before writing `tests/smoke.spec.ts`. One correction to this AFS's own recommended locator, plus the page-object extraction it (and TC-003's AFS) already anticipated:

1. **Card counting (step 5, GH#13)** — this AFS's own "Recommended Locator" (`page.locator('[role="tabpanel"] > div > div')`) was tested live against the current single-pipeline default project and resolved to **2** elements, not 1: the real card AND an unrelated filter/stats sidebar text node (`"Tags qa pipeline Alita Yoko Pipelines:1"`) that also happens to be a direct child-of-child of the tabpanel. A bare count/`.first()` assertion built on that locator would have silently counted the wrong thing. `#EliteACustomTabPanel .MuiCard-root` — confirmed to be present on this page (same DOM id as the Agents list, TC-003) and to resolve to exactly 1 match with the correct card text — is used instead. This is actually MORE stable than either locator this AFS documented (its own "Fallback," the MUI-class-based `.MuiGrid-root.MuiGrid-container > .MuiGrid-root`, also worked but `.MuiCard-root` is the same handle TC-003 already uses).
2. **Shared page object** — per this AFS's own suggestion (and TC-003's matching one), `tests/pages/cardGridList.page.ts` (`CardGridListPage`) was extracted and is used by both TC-003 and TC-004, given #1 confirms the two pages render into the literal same `#EliteACustomTabPanel` container.

No scope change — both are technique-level (the *how*). See `tests/pages/cardGridList.page.ts` and `tests/smoke.spec.ts` TC-004 for the implementation.
