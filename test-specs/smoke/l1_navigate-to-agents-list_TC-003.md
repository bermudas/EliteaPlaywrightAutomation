# Test Case: Navigate to Agents Section — List Loads

## Metadata
- **TMS ID**: TC-003
- **Linked Story**: GH#5 (parent epic GH#1)
- **Priority**: l1
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`)
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via `GET ${BASE_URL}/app/chat/` not redirecting to a login page, and the sidebar profile control showing the account's display name ("Alita Yoko")
- Browser viewport maximized (case's own Setup step 1) — explored at 1920×1080; the grid's column count is viewport-dependent (see Known Defects — case says 3 columns, 1920×1080 renders 4)
- Test account contains agents — **observed 211–212** (see Test Data), comfortably exceeding the case's stated baseline of "≥12"

## Test Data
### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — standard smoke-suite account
- Agents list at `${BASE_URL}/app/agents/all`, owned by `owner_id=21` (the account's project id) — read-only, no fixture needed
- Total agent count is **live and not deterministic across a run**: observed `211` at first check, `212` moments later during this same exploration session (another concurrent process — e.g. a sibling smoke case — created an agent mid-session in this shared test account). Automated assertions must use a **lower-bound** check (`>= 12`, per the case's own stated baseline), never an exact-count equality.

### Must Generate
- None (read-only test)

### Must Clean Up
- None (read-only test — no teardown required, matches case's own Teardown section)

## Test Steps
1. Navigate to `${BASE_URL}/app/agents/all`
   - **Verify**: URL is `${BASE_URL}/app/agents/all`, page title contains "Agents"
2. Wait for the initial agents page to load — condition wait, not a fixed sleep: wait for the `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?...agents_type=classic...offset=0...` response (200), then wait for at least one card (`#EliteACustomTabPanel .MuiCard-root`) to be visible
   - **Verify**: at least 1 `.MuiCard-root` element visible inside `#EliteACustomTabPanel`
   - **Note**: on a tall viewport (1920×1080, as explored), a **second** page auto-fetches (`offset=20`) immediately after mount with no scroll interaction at all — 40 cards were already rendered before any scroll action was performed. Automation should not assume "only page 1 (20 items) is loaded after initial render."
3. Scroll the list container to its bottom to trigger lazy-loading of the next page
   - **Action**: scroll `#EliteACustomTabPanel` (NOT `document.body` — see Known Defects) to `scrollHeight`
   - **Verify**: a new `GET .../applications/prompt_lib/{ownerId}?...offset={previousOffset+20}...` request fires and returns 200
4. Wait for the lazy-loaded page to render — condition wait on the triggered response from step 3, not a fixed sleep
   - **Verify**: `.MuiCard-root` count inside `#EliteACustomTabPanel` increases from the pre-scroll count
5. Scroll the list container back to top
   - **Action**: scroll `#EliteACustomTabPanel` to `scrollTop = 0`
   - **Verify**: `#EliteACustomTabPanel.scrollTop === 0`
6. Wait for page stabilization — **no additional wait needed**: scrolling up does not trigger any network fetch (confirmed — no new `applications/prompt_lib` request fires on scroll-up); step 5's own scroll-position assertion is sufficient
7. Check for loading indicators (`[role="progressbar"]` / `[aria-busy="true"]`)
   - **Verify**: assert the count of matching elements is `0` at this point — **do not gate a wait on their presence**; they were not observed to appear at any point during this exploration (initial load, mid-scroll-triggered-fetch, or post-scroll), even when checked immediately after firing the lazy-load request. See Known Defects.
8. Final stabilization — **no additional wait needed**, superseded by step 9/10's own assertions
9. Count agent cards
   - **Assertion**: `#EliteACustomTabPanel .MuiCard-root` count `>= 1` (matches case's step-level expected result). Separately assert the footer total-count text (`"Agents: " + count`) is `>= 12` to honor the case's Precondition-level baseline claim.
   - **Do NOT use `[role="button"]`** — see Known Defects; it matches the 3 tag-filter chips, not agent cards.
10. Verify first agent card contains text content
    - **Assertion**: first `.MuiCard-root`'s text content is non-empty (observed: `"TestAgent_1772792259904_temp"`)

## Expected Results
- Agents list page fully loaded at `${BASE_URL}/app/agents/all`
- Agent cards render in a CSS grid inside `#EliteACustomTabPanel` (column count is viewport-dependent — 4 columns observed at 1920×1080, see Known Defects re: case's "3-column" claim)
- Each card shows: a small icon, the agent name (`.MuiTypography-headingSmall`), and an owner avatar
- At least 1 card visible; total account agent count `>= 12` (observed 211–212, far exceeding baseline)
- No console errors during load, scroll, or lazy-load fetches
- No `4xx`/`5xx` responses from `/api/v2/elitea_core/applications/prompt_lib/**`

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Setup 1: maximize browser window | all UI elements visible | precondition | viewport set 1920×1080 before navigation | asserted |
| Setup 2: verify authenticated state via `/app/chat/` | no redirect to login = authenticated | precondition | confirmed pre-navigation: no redirect, sidebar shows "Alita Yoko" | asserted |
| Precondition: test account contains ≥12 agents (baseline) | ≥12 agents exist | step 9 | step 9: footer "Agents: N" text `>= 12` | asserted |
| 1 Navigate to `/app/agents/all` | list begins loading | step 1 | step 1: URL + title | asserted |
| 2 Wait 3s for initial render | structure visible, loading indicators may be present | step 2 | step 2: first card visible via condition wait | asserted *(re-authored: condition wait, not fixed sleep — see Known Defects re: progressbar never observed)* |
| 3 Scroll to bottom to trigger lazy load (`window.scrollTo(0, document.body.scrollHeight)`) | scroll executed | step 3 | step 3: `#EliteACustomTabPanel` scrolled, new request fires | asserted *(re-authored: case's literal `document.body` scroll target is a no-op on this page — see Known Defects)* |
| 4 Wait 2s for lazy load to fetch items | additional cards may appear | step 4 | step 4: card count increases | asserted *(re-authored: condition wait on network response, not fixed sleep)* |
| 5 Scroll back to top | scroll executed | step 5 | step 5: `scrollTop === 0` | asserted |
| 6 Wait 1s for stabilization | page stops moving | step 6 | — | asserted *(no-op needed: scroll-up triggers no fetch)* |
| 7 Check for loading indicators, wait 3s more if present | indicators gate an extra wait | step 7 | step 7: indicator count === 0 | asserted *(re-authored: indicators never observed present in this app; do not gate a wait on them)* |
| 8 Wait additional 2s for final stabilization | all cards fully rendered | step 8 | — | asserted *(superseded by steps 9–10's own assertions)* |
| 9 Count cards with `[role="button"]` in grid | ≥1 card visible | step 9 | step 9: `.MuiCard-root` count | asserted *(re-authored: case's `[role="button"]` selector does not match cards — see Known Defects; correct handle is `.MuiCard-root`)* |
| 10 Verify first card contains text | agent name visible | step 10 | step 10: non-empty text content | asserted |
| Expected Final State: 3-column grid layout | 3 columns | — | — | clarification *(observed 4 columns at the exact 1920×1080 viewport the case's own Setup instructs — see Known Defects)* |
| Expected Final State: card shows icon/avatar, name, owner info | all three elements present | step 10 (visual) | screenshot `test-results/screenshots/TC-003-step10-final-state.png` | asserted |
| Teardown: no teardown required | n/a | — | — | asserted (read-only, no cleanup performed) |

### Axis 2 — Analyst additions
- Step 9 asserts the footer `"Agents: N"` total-count text (`>= 12`), in addition to the case's own DOM-card-count check — *added: the case's Precondition section makes a baseline-count claim ("≥12 agents") that the case's own Steps never actually assert; the footer counter is a direct, reliable handle for it and is backed by the API's `total` field.*
- Expected Results adds "no console errors" and "no 4xx/5xx from the applications endpoint" during the whole load/scroll/lazy-load sequence — *added: verified clean throughout exploration (0 console errors, all observed requests to `/api/v2/elitea_core/applications/prompt_lib/**` returned 200); guards against a silent regression the case's own steps don't check for.*
- (Nothing else added beyond the case.)

## Cleanup
No cleanup required — read-only navigation test, matches the case's own Teardown section.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Agents list scroll/content container | `page.locator('#EliteACustomTabPanel')` (stable `id`, confirmed via DOM inspection — this is the actual `overflow-y: scroll` element, NOT `document.body`) | `page.getByRole('tabpanel')` (only one tabpanel is mounted per route at a time in this app) |
| Individual agent card | `page.locator('#EliteACustomTabPanel .MuiCard-root')` | `page.locator('#EliteACustomTabPanel .MuiCardContent-root')` — **no `data-testid`, no ARIA `role`, no `aria-label` exists on cards; this is the most stable handle available.** See Known Defects — flagging per Locator Ladder stop+flag rule (`.agents/testing.md` § Locator strategy). |
| Agent card name text | `.MuiTypography-headingSmall` nested span inside the card | `.textContent` of the card root (trimmed) |
| Total agent count (footer) | `page.getByText('Agents:').locator('xpath=following-sibling::*[1]')` (adjacent count `<span>`, next to the "Agents:" label near the account avatar) | Direct API check: `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?...agents_type=classic&limit=1&offset=0` → response `.total` |
| Loading indicator (case's hint — confirmed NOT present) | `[role="progressbar"], [aria-busy="true"]` | n/a — do not build a wait strategy on this selector for this page; see Known Defects |
| Tag filter chips (case incorrectly implied these were cards) | `[role="button"]` (MUI `Chip` components — "docsbot_library", "agent_demo", "w" observed) | n/a — unrelated to card count |

## Network Behavior
- `GET /api/v2/elitea_core/applications/prompt_lib/{ownerId}?tags=&sort_by=created_at&sort_order=desc&query=&agents_type=classic&limit=20&offset={N}` — the paginated agents list. Fires once automatically on mount (`offset=0`); on a tall viewport (1920×1080 explored) a **second page auto-fires** (`offset=20`) immediately with no user interaction, because the pagination trigger element is already within the intersection threshold. Further pages (`offset=40`, `offset=60`, ...) require scrolling `#EliteACustomTabPanel` toward its bottom. Response shape: `{ total: <int>, rows: [{ id, name, description, owner_id, created_at, authors: [{id, email, name, avatar}], tags: [...], status, agent_type, is_pinned, ... }] }`. All observed responses returned `200`.
- Several `limit=1` "count" queries fire alongside the main list call, one per status filter (`draft`, `published`, `on_moderation`, `user_approval`, `rejected`) — used for summary badges elsewhere in the UI, not relevant to this case's assertions.
- `GET /api/v2/elitea_core/tags/prompt_lib/{ownerId}?offset=0&limit=50&entity_coverage=application` — populates the tag-filter chips.
- Wait strategy for the implementer: `page.waitForResponse(resp => resp.url().includes('/applications/prompt_lib/') && resp.url().includes('agents_type=classic') && resp.status() === 200)` scoped to the expected `offset` value, instead of any fixed-duration sleep.

## Known Defects Found During Exploration
**None found in the product.** Three case-authoring inaccuracies were found and confirmed against the live DOM — filed as a single CLARIFICATION (not a product bug; reverse-masking guard applies — the live app is correct and self-consistent, the case text is stale):

- **[INFO / CLARIFICATION]** TC-003's authored technique doesn't match the live app in three ways — filed as [`GH#12`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/12):
  1. Step 3's `window.scrollTo(0, document.body.scrollHeight)` is a **no-op** on this page. `document.body.scrollHeight` stays pinned to the viewport height (1080px observed) and `window.scrollY` never moves — the actual scrollable region is the inner `#EliteACustomTabPanel` div (`overflow-y: scroll`). Following the case literally would silently skip lazy-loading entirely.
  2. Step 9's `[role="button"]` selector does **not** match agent cards. Confirmed via DOM inspection: it matches exactly the 3 MUI `Chip` tag-filter buttons ("docsbot_library", "agent_demo", "w") elsewhere in the same panel. Agent cards (`.MuiCard-root`) have no ARIA role, no `data-testid`, and no `aria-label` — recommend the product team add a `data-testid="agent-card"` (or similar) to the card root for durable automation; until then, `.MuiCard-root` scoped to `#EliteACustomTabPanel` is the best available handle.
  3. "Expected Final State" describes a 3-column grid; at the exact 1920×1080 resolution the case's own Setup step instructs ("maximize browser window"), the observed grid renders **4 columns** (screenshot: `test-results/screenshots/TC-003-step10-final-state.png`).
  - **Filing status**: filed per `.agents/profile.md` § Bug filing (`github-issue`, strict-per-bug) as [`GH#12`](https://github.com/bermudas/EliteaPlaywrightAutomation/issues/12), referencing TC-003 and linked to parent epic GH#1 / GH#5.
  - Recommendation for the automation engineer: `expect.soft()` is not needed here since these are re-authored directly into this AFS's Test Steps (§ Test Steps 3, 7, 9) — implement against the confirmed handles above, not the case's original literal instructions.

## Blocked Steps
None. All 10 case steps plus both Setup steps were executed end-to-end against the live system.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — this case joins `tests/smoke.spec.ts` as `TC-003`, inside the existing serial `@smoke` describe block (per `.agents/testing.md` § Structure — TC-003 depends on TC-001/TC-002's session, do not extract into its own file).
- Page object: none exists yet (`tests/pages/` not created at bootstrap). Given `#EliteACustomTabPanel` + `.MuiCard-root` is shared by TC-003 (agents) and TC-004 (pipelines) — both use the identical lazy-load grid pattern with the identical `id="EliteACustomTabPanel"` — this is the first strong signal to extract a shared `tests/pages/lazy-load-list.page.ts` (or similar) per `.agents/testing.md` § Structure's "add a page object the first time a locator block repeats 3+ times" guidance; TC-003 + TC-004 is 2 of the 3, worth flagging to the implementer/Tal now rather than after TC-004 lands separately.
- Wait strategy: **no `waitForTimeout` anywhere in this spec** — every "wait N seconds" from the original case has been re-authored into a `waitForResponse` or a web-first `expect(...).toBeVisible()` / `expect.poll()` condition wait (see § Test Steps and § Network Behavior).
- **Analyst execution note (process/tooling gap, not a product or spec issue):** this exploration ran against a Playwright MCP browser session that was found already-authenticated as `${TEST_USER}` (persisted MCP profile state) rather than via an explicit credential-entry login — consistent with the correct account ("Alita Yoko" / `alita@elitea.ai`) throughout. The MCP browser was also confirmed to be **shared** with concurrently-dispatched sibling analysts (tab-focus was twice hijacked mid-exploration by what was observably the TC-004/pipelines analyst opening/selecting its own tab in the same browser instance; the network-request log is also global/interleaved across tabs, which produced one unreliable index-based lookup during exploration — worked around by re-verifying `window.location.href` before trusting every DOM/network read). All data in this AFS was re-verified against the confirmed `/app/agents/all` URL after each interference episode. This is an infrastructure gap in the current parallel-analyst dispatch pattern (single shared MCP browser instance, no per-analyst isolated context) worth Tal's attention before scaling to more parallel UI analysts — it does not affect the correctness of the eventual **automated** Playwright suite, since `npx playwright test` gives each test worker its own isolated browser context independent of this MCP tool.
