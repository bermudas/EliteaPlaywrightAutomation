# Test Case: Distinguish Empty State from Loading State in Artifacts List

## Metadata
- **TMS ID**: TC-062
- **Linked Story**: GH#84 (own clarification — case-text drift: precondition wording, loading-indicator selectors, empty-state regex), GH#85 (own bug — loading state has no accessible semantics), GH#87 (own bug, incidental — "Delete all files" accessible-name mismatch), parent epic #16, tracking issue #75
- **Priority**: l3 (case-authored priority: medium)
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`) — isolated `playwright-cli -s=TC-062` session (own persistent Chrome profile under the scratchpad dir), run in parallel with 7 sibling analysts (TC-060, 061, 063..067). `window.location.href` re-verified after login and after every navigation; every read matched the action just taken, no cross-talk observed.
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) via Keycloak SSO — confirmed handles per `.agents/testing.md` (`getByRole('textbox', { name: 'Username or email' })` / `'Password'` / `getByRole('button', { name: 'Sign In' })`)
- **Case's own precondition "Test account contains 0 artifacts (confirmed empty state)" is imprecise — re-authored from live observation.** The account has **3 pre-existing buckets** (`attach`, `attachments`, `warranty`), each with **0 files** (confirmed via `GET /artifacts/s3/?project_id=${PROJECT_ID}&format=json` → all three buckets report `"size": 0`; `GET /artifacts/s3/attach?project_id=${PROJECT_ID}&format=json` → `"keyCount": 0, "contents": []`). "0 artifacts" means 0 *files*, not 0 buckets — filed as GH#84. This actually matches the case's own Test Data note ("App uses bucket-based organization (not flat list)"), just under-specified in the Preconditions line.
- Browser viewport: default `chromium` Desktop-Chrome viewport used (no literal "maximize" call) — sufficient to observe every UI element in this case, consistent with this batch's established re-authoring of the "maximize window" precondition (see TC-050/TC-051 AFS files).

## Test Data

### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`
- Pre-existing buckets on the account: `attach`, `attachments`, `warranty` — all empty (0 files, 0 B). Do not assume these are seeded by this case; they pre-date this run and are shared with the rest of this batch.

### Must Generate (in test setup)
- None. This is a read-only observation case — no data creation needed to exercise either the loading or the empty state (both occur naturally on every page load/reload).

### Must Clean Up (in teardown)
- None — matches the case's own Teardown ("no teardown required, read-only test"). Confirmed live: no bucket/file was created, modified, or deleted during exploration.

## Test Steps

1. Navigate to `${BASE_URL}app/artifacts` — **re-authored from the case's Test Data URL `{{base_url}}/app/artifacts`, confirmed to match live exactly** (no redirect to `/app/artifacts/all` or any other path; URL and route stay at `/app/artifacts`).
   - **Verify**: page title becomes "Artifacts - Private"; sidebar `navigation "side-bar"` renders; a `data-testid="artifacts-buckets-heading"` element with text "Buckets" is present.
2. Check for loading indicators immediately — **re-authored from the case's proposed selectors.** `[role="progressbar"]`, `[aria-busy="true"]`, `.loading`, `.spinner` **all match 0 elements at any point in the load** (confirmed via scripted DOM polling at ~150–200ms resolution across 3 reload cycles). The live loading UI is two plain-text nodes with no ARIA semantics:
   - `getByText('Loading files...')` — appears next to the currently-selected bucket in the left bucket-rail
   - `getByText('Loading...')` — appears centered in the main content panel
   - **Verify**: at least one of these two text nodes is visible during the load window. Filed as GH#84 (case-text drift) and GH#85 (product accessibility gap — no `aria-busy`/`aria-live` on either node).
   - **Timing (measured, 3 consecutive cold reloads)**: full SPA boot + bucket-list fetch (`GET /artifacts/s3/?project_id=...`, ~1.4–1.5s network duration) → buckets render at ~1.2s post-reload-commit; file-list fetch (`GET /artifacts/s3/attach?project_id=...`, ~1.4s network duration) → "Loading files…"/"Loading…" text appears at ~2.85–3.1s post-reload-commit; empty state resolves at ~4.0s post-reload-commit. The loading text window itself lasts roughly 1.0–1.2s once it appears — short but consistently present and reproducible across all 3 attempts.
3. Wait for the loading indicators to disappear — **re-authored from the case's literal "wait 3 seconds"** per `.agents/testing.md` § Conventions (no `waitForTimeout`): use a condition wait — `expect(page.getByText('Loading files...')).not.toBeVisible()` and `expect(page.getByText('Loading...')).not.toBeVisible()`, or equivalently wait for `getByTestId('artifacts-empty-state')` to attach.
   - **Verify**: condition resolves within a generous timeout (10s is ample headroom; observed live resolution ~4s from reload).
4. Check for loading indicators again.
   - **Verify**: both `getByText('Loading files...')` and `getByText('Loading...')` are absent from the DOM (confirmed via `document.body.innerText` no longer containing either string).
5. Scroll to bottom and back to top (case's "trigger full lazy load" step).
   - **Verify**: page scrolls normally; no console errors; **no additional network requests fire** — confirmed live, this is a 3-item bucket list with a 0-file selected bucket, there's nothing left to lazily fetch. This step is a no-op assertion (proves scrolling doesn't break anything) rather than a load-trigger for this specific empty-account scenario.
6. Wait 5 seconds for delayed loads — **re-authored to a condition-based check**: assert the empty-state message and bucket count remain stable for a short observation window (e.g. re-check after `networkidle` or a single `expect(...).toBeVisible()` poll) rather than a fixed sleep.
   - **Verify**: page remains stable — no new loading indicators reappear, no new content appears.
7. Check for empty state message — **re-authored from the case's regex options.** Live message is exactly **"No files in this bucket"**, exposed via `data-testid="artifacts-empty-state"`. This matches the case's `/No files/` regex hint; it does **not** match the `/Upload.*first/` hint (live button text is "Upload files", not "Upload your first file" or similar) — filed as part of GH#84.
   - **Verify**: `getByTestId('artifacts-empty-state')` is visible, containing text "No files in this bucket".
8. Verify no artifact (file) items are present.
   - **Verify**: no table rows / file-card elements exist under the selected bucket. Note the case's "no items are present" refers to **files within the bucket**, not the 3 bucket entries themselves (which are containers, always present, and are not "artifacts" in the case's sense) — this distinction is what GH#84 clarifies.
9. Check for "Upload" button or file input.
   - **Verify**: two elements share the accessible name "Upload files" — the toolbar button (`data-testid="artifacts-upload-files-button"`, always visible regardless of empty/non-empty state) and a second, larger button inside the empty-state panel body (no `data-testid`, only present when the bucket is empty). Both are visible and enabled in this scenario. See Concrete Handles for disambiguation guidance.

## Expected Results
- Page shows a genuine empty-state UI (`data-testid="artifacts-empty-state"` + enabled "Upload files" control), not a stuck loading spinner, once the ~4s cold-load window completes.
- A real, observable loading window (text-based, ~1–1.2s once visible) occurs before the empty state resolves — confirmed reproducible across 3 consecutive reloads, proving the app genuinely fetches data rather than rendering a hardcoded empty state.
- Zero console errors/warnings across the entire flow (confirmed: `Total messages: 3 (Errors: 0, Warnings: 0)` — the only console entries are an unrelated startup ASCII-art/version banner).
- All 3 pre-existing buckets (`attach`, `attachments`, `warranty`) independently resolve to the same empty state when selected.

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Precondition: "Test account contains 0 artifacts (confirmed empty state)" | account starts empty | precondition | 3 buckets confirmed via API, each `size: 0`/`keyCount: 0` | asserted *(clarification: "0 artifacts" = 0 files across 3 pre-existing buckets, not 0 buckets — GH#84)* |
| Test Data: "App uses bucket-based organization (not flat list)" | UI reflects bucket model | steps 1, 8 | step 1: buckets heading; step 8: per-bucket file emptiness | asserted |
| 1 Navigate to `{{base_url}}/app/artifacts` | "Artifacts"/"Buckets" header visible | step 1 | step 1: `artifacts-buckets-heading` testid | asserted |
| 2 Check for loading indicators immediately (`[role="progressbar"]`, `[aria-busy="true"]`, `.loading`, `.spinner`) | loading indicator visible | step 2 | step 2: `getByText('Loading...')`/`getByText('Loading files...')` (case's proposed selectors match 0 elements) | asserted *(clarification: selectors re-authored to live text nodes — GH#84; underlying product gap that these carry no ARIA semantics — GH#85)* |
| 3 Wait 3 seconds | loading indicators disappear | step 3 | step 3: condition wait replaces fixed sleep | asserted *(re-authored per no-`waitForTimeout` convention)* |
| 4 Check for loading indicators again | indicators no longer present | step 4 | step 4: absence assertion | asserted |
| 5 Scroll to bottom and back to top | page scrolls normally | step 5 | step 5: no errors, no new requests | asserted *(re-authored: this account/scenario has nothing left to lazy-load, so the step verifies scroll doesn't break anything rather than triggering a real load)* |
| 6 Wait 5 seconds for delayed loads | page remains stable | step 6 | step 6: stability re-check | asserted *(re-authored per no-`waitForTimeout` convention)* |
| 7 Check for empty state message (regex `/Still no .* added/`, `/No files/`, `/Upload.*first/`) | empty state message visible | step 7 | step 7: `artifacts-empty-state` testid, text "No files in this bucket" | asserted *(clarification: `/No files/` matches live text; `/Upload.*first/` does not match live button text "Upload files" — GH#84)* |
| 8 Verify no artifact items present | 0 items | step 8 | step 8: no file rows/cards under selected bucket | asserted |
| 9 Check for "Upload" button or file input | upload control visible | step 9 | step 9: `artifacts-upload-files-button` testid (toolbar) + second untagged "Upload files" button (empty-state body) | asserted *(two elements share the same accessible name — see Concrete Handles)* |
| Expected Final State: empty-state UI (message + upload control), not a spinner; loading appeared then disappeared within 3s | matches | steps 2–9 | steps 2 (loading proven), 7–9 (empty state proven) | asserted *(clarification: measured resolution is ~4s from a cold reload, not strictly ≤3s — see Timing note in step 2; still fast and non-blocking, not treated as a defect)* |
| Key distinction: loading = spinner + no content vs. empty = message + action button + no spinner | distinction holds | steps 2, 7–9 | step 2 (no spinner exists at all — text-only loading cue) vs. steps 7–9 (message + button, no loading text) | asserted *(clarification: "spinner" in the case's sense doesn't exist on this app at all — loading is communicated by text only, same pattern already documented for the Agents list in `.agents/testing.md`)* |

### Axis 2 — Analyst additions
- Confirmed the loading→empty transition is **reproducible across 3 independent cold reloads** with consistent timing (buckets ~1.2s, file-list loading text ~2.85–3.1s, resolved ~4.0s). *Added: the case doesn't ask for a reproducibility check, but a single-observation "it loaded once" isn't strong enough evidence for an automated wait-strategy decision — 3 consistent runs de-risks a flaky `expect().toBeVisible()` assertion on the loading text.*
- Captured the exact underlying network contract: `GET /artifacts/s3/?project_id=${PROJECT_ID}&format=json` (bucket list) and `GET /artifacts/s3/{bucket}?project_id=${PROJECT_ID}&format=json` (per-bucket file list, S3-list-objects-shaped response: `keyCount`, `contents`, `isTruncated`). *Added: the case only describes the visual load ing behavior; the implementer benefits from knowing there are two sequential fetches (not one), which is why the loading window has two distinct phases (bucket-list-loaded-but-files-still-loading vs. fully resolved).*
- Verified all 3 pre-existing buckets (`attach`, `attachments`, `warranty`) independently resolve to the same empty state when selected via client-side bucket switch (`?bucket=attachments` query param navigation, no full reload) — *added: the case only exercises the default-selected bucket; confirming all 3 behave identically rules out a per-bucket rendering inconsistency.*
- Zero console errors/warnings confirmed across every reload and bucket switch. *Added: not explicitly requested by the case, but this batch has a standing practice of checking the side channel even when the UI looks correct.*
- Flagged that the app's loading indicators carry no ARIA semantics (no `role="status"`/`aria-busy`/`aria-live`) — filed as GH#85, a genuine accessibility gap, not a case-text issue.
- Incidentally discovered the "Delete all files" toolbar button's accessible name is "delete entity" (generic/templated), not tied to its visible label — filed as GH#87 (not blocking this case; button is correctly disabled when empty).

## Cleanup
1. None required. Confirmed live: no bucket created/modified/deleted, no file uploaded, no app state mutated by this case's execution.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| "Buckets" panel heading | `page.getByTestId('artifacts-buckets-heading')` | `page.getByText('Buckets', { exact: true })` |
| Create-bucket button | `page.getByTestId('artifacts-create-bucket-button')` | `page.getByRole('button', { name: 'Create bucket' })` |
| Search-buckets button | `page.getByTestId('artifacts-search-buckets-button')` | `page.getByRole('button', { name: 'Search buckets' })` |
| Bucket rail item (e.g. `attach`) | **No `data-testid`, no `role`, no accessible name** — same gap pattern as the Agents/Pipelines card grid (`.agents/testing.md` § Locator strategy). Best available: `page.getByText('attach', { exact: true })` scoped under the bucket-rail container (`main` region, left of the file panel) | CSS structural fallback: the item is a `cursor:pointer`-styled `div.MuiBox-root` with an unstable `css-*` hash class — do not hardcode the hash; scope by nearest stable ancestor (`artifacts-buckets-heading`'s panel) plus text match |
| Loading text — bucket item | `page.getByText('Loading files...')` — **text-only, no ARIA role/attribute** (GH#84/GH#85) | none stronger available; do not gate a wait on this being *present* (short-lived, ~1s window) — gate on its *absence* / on `artifacts-empty-state` appearing instead |
| Loading text — main panel | `page.getByText('Loading...', { exact: true })` — same caveat as above | none stronger available |
| Empty-state message | `page.getByTestId('artifacts-empty-state')` — **confirmed, stable, purpose-built testid** | `page.getByText('No files in this bucket')` |
| Upload button (toolbar, always visible) | `page.getByTestId('artifacts-upload-files-button')` | `page.getByRole('toolbar').getByRole('button', { name: 'Upload files' })` (toolbar-scoped, since a second same-named button exists — see below) |
| Upload button (empty-state body, only when bucket is empty) | **No `data-testid`.** `page.getByTestId('artifacts-empty-state').locator('..').getByRole('button', { name: 'Upload files' })` (scope to the empty-state container to disambiguate from the toolbar button) | `page.getByRole('button', { name: 'Upload files' }).last()` (fragile — order-dependent; prefer the scoped locator) |
| Download-files button (disabled when empty) | `page.getByTestId('artifacts-download-files-button')` | `page.getByRole('button', { name: 'Download files' })` |
| Delete-all-files button (disabled when empty) | **Accessible name is "delete entity", not "Delete all files" — GH#87.** `page.getByRole('button', { name: 'delete entity' })` scoped near the toolbar (do not rely on visible-label text match) | none stronger available until GH#87 is fixed |
| Buckets/Size summary footer | `page.getByText('Buckets:').locator('..')` for count; `page.getByText('Size:').locator('..')` for size | text-based only, no testid found |

## Network Behavior
- `GET /artifacts/s3/?project_id=${PROJECT_ID}&format=json` — bucket list, fires on every page load/reload. ~1.4–1.5s observed duration. Response: `{ owner: {...}, buckets: [{ name, creationDate, size, retentionDays, isPinned }, ...] }`.
- `GET /artifacts/s3/{bucketName}?project_id=${PROJECT_ID}&format=json` — file list for the currently-selected bucket (fires for the default-selected bucket on load, and again on bucket switch). ~1.4s observed duration. Response (S3 ListObjects-shaped): `{ name, prefix, delimiter, maxKeys, keyCount, isTruncated, contents: [] }`.
- **Implementer wait strategy**: prefer `page.waitForResponse(resp => resp.url().includes('/artifacts/s3/') && resp.url().includes(bucketName))` combined with `expect(page.getByTestId('artifacts-empty-state')).toBeVisible()` over trying to catch the transient loading text — the loading window is real but short (~1–1.2s) and asserting its *presence* risks flakiness on a fast CI runner; asserting its *absence-then-resolution* is the robust pattern (matches the project's existing "gate on absence, not presence" convention for Agents-list loading indicators).
- Client-side bucket switching (`?bucket=<name>` query param) does **not** trigger a full page reload — confirmed via URL change without a `Page Title` regression and without re-fetching the bucket list, only the per-bucket file-list endpoint re-fires.

## Known Defects Found During Exploration
- **[INFO/documentation]** GH#84 — case-text drift bundle: preconditions ambiguity ("0 artifacts" reads as 0 buckets, is actually 0 files across 3 pre-existing buckets), step 2's proposed loading-indicator selectors (`[role="progressbar"]`, `[aria-busy="true"]`, `.loading`, `.spinner`) match 0 live elements, step 7's `/Upload.*first/` regex doesn't match the live "Upload files" button text. Not filed as a defect — live product is correct, case text is stale (reverse-masking guard).
- **[MINOR]** GH#85 — the loading state (both "Loading files…" and "Loading…" text nodes) carries zero ARIA semantics (no `role="status"`, `aria-busy`, or `aria-live`). Functionally harmless (resolves quickly and correctly) but a real accessibility gap — screen-reader users get no cue that content is loading.
- **[INFO]** GH#87 — incidental finding: the "Delete all files" toolbar button's accessible name is the generic "delete entity", not tied to its visible grouping label. Does not block this case (button is correctly disabled when the bucket is empty).

## Blocked Steps
None. All 9 case steps plus the Expected Final State were executed end-to-end against the live system. Both the LOAD-EMPTY/LOAD-SPINNER window and the CONTENT-EMPTY resolution (the case's own `dyn_types` front-matter tags) were directly observed and are reproducible — this case did **not** need to be deferred pending the artifacts module's (TC-030+) seeded data, contrary to the dispatch brief's anticipated risk. A natural, real ~1–4s loading window exists even with 0 files, driven by the two sequential fetches (bucket list, then per-bucket file list) plus cold SPA boot — no network throttling or route-mocking was needed to trigger it.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — this case joins `tests/lazy-loading.spec.ts` (module: lazy-loading, per `.agents/test-automation.yaml` and EPIC GH#16's module-by-module delivery plan).
- **Page-object flag for the implementer/Tal**: `.agents/testing.md` § Structure currently plans for `tests/pages/cardGridList.page.ts` to be extended for this module's list-scroll cases, and separately calls out TC-063/TC-064 (toolkits/conversations lists) as "the only genuinely new list surfaces" in lazy-loading. **That's incomplete — the Artifacts bucket/file browser (this case) is a third, structurally distinct new surface.** It is not a card grid at all: it's a two-pane bucket-rail + file-panel layout with its own `data-testid` namespace (`artifacts-*`) that shares nothing with `.MuiCard-root`/`#EliteACustomTabPanel`. Recommend creating a dedicated `tests/pages/artifacts.page.ts` for this case rather than extending `cardGridList.page.ts` — this also lines up with `.agents/testing.md`'s own longer-term plan to build `tests/pages/artifacts.page.ts` for the artifacts module (TC-030+); this lazy-loading case can seed that page object early since it only needs the bucket-list/empty-state slice, not the full upload/preview/delete surface.
- Wait strategy: do not assert on the loading text's *presence* as a hard requirement (short-lived, ~1s window, timing-sensitive under CI load) — assert the sequence loosely (optionally observe loading text if timing allows) and firmly assert the resolved state via `getByTestId('artifacts-empty-state')`. If the case's intent (proving a genuine fetch occurred, not a hardcoded empty state) needs to be preserved strongly, use `page.waitForResponse()` on the `/artifacts/s3/{bucket}` endpoint as the authoritative "did it actually fetch" signal instead of relying on catching the transient text.
- This account's 3 pre-existing buckets are shared test data across this whole batch — do not delete/rename them; other modules (and TC-062 itself, if re-run) depend on them staying present and empty.
- Analyst execution note (process/tooling, not product): ran via `playwright-cli -s=TC-062`, an isolated persistent Chrome profile under the scratchpad dir. `window.location.href` re-verified after login and after every navigation. Timing/DOM-state evidence was gathered via `playwright-cli run-code` scripts (polling `document.body.innerText` every 150–200ms across 3 cold reloads) rather than relying on single-shot snapshot timing, since the loading window is sub-2-second and a manual snapshot/screenshot round-trip alone was not reliable enough to catch it consistently (first naive attempt missed the window entirely). Evidence captured: `test-results/screenshots/TC-062-step-1-initial-load.png`, `test-results/screenshots/TC-062-step-2-loading-state.png` (loading text captured mid-flight), `test-results/screenshots/TC-062-step-7-empty-state-resolved.png`, `test-results/screenshots/TC-062-step-9-all-buckets-empty.png`.
