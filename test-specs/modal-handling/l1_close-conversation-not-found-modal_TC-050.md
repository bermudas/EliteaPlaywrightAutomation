# Test Case: Close "Conversation not found" Modal

## Metadata
- **TMS ID**: TC-050
- **Linked Story**: GH#59 (own tracking issue, parent epic GH#16 — WebQAPreExecuted batch, module: modal-handling)
- **Priority**: l1 (case-authored priority: critical)
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`) — isolated `playwright-cli -s=TC-050` session (own in-memory Chrome profile). `window.location.href` re-verified after every navigation/interaction per `.agents/memory/qa-engineer/parallel_analyst_browser_isolation.md`; no cross-talk observed with the 6 concurrently-dispatched sibling analysts (TC-051..056).
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User is authenticated as `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) — verified via Keycloak SSO flow landing on `${BASE_URL}app/chat` with no further redirect
- Case's own precondition "browser window maximized" was **not** explicitly set this run (no `resize` call issued; default `playwright-cli --browser=chrome` viewport was used and was sufficient to observe the full modal/backdrop). Recommend the implementer use the project's standard `chromium` Desktop-Chrome project viewport (`.agents/testing.md` — no other viewport is in scope) rather than a bespoke "maximized" setting.
- No test-specific fixture/data precondition — the account's existing conversation history (already present from TC-001/TC-002 and prior sibling-case runs) is what the app falls back to after the modal closes (see Step 4). Nothing needs to be seeded for the modal itself to trigger.

## Test Data

### Existing (re-use)
- `${TEST_USER}` = `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`

### Must Generate (in test setup)
- None. This case is purely a navigation-triggered client-side state — no fixture/data creation needed.

### Must Clean Up (in teardown)
- None. Confirmed live: modal dismissal is non-persistent (matches the case's own Teardown claim) and the interactivity spot-check (Step 5) typed into the chat input and cleared it again **without submitting** — no message was sent, no app state was mutated.

## Test Steps

1. Navigate to `${BASE_URL}app/chat/all`
   - **Verify**: page loads the chat shell (sidebar `navigation` with the "Conversations" list already showing this account's existing history; main panel shows the "Hello, {user}! What can I do for you today?" empty-composer state) — confirmed live, page settles in ~1–2s
2. Wait (condition wait, not fixed sleep) for `page.getByRole('dialog')` to attach to the DOM
   - **Verify**: dialog is present with accessible heading text exactly "Conversation not found"; body text "The conversation you are looking for does not exist in your project or you don't have access to it. For sharing links, please use the Share option in the conversation menu."
   - **Timing note**: case allows "up to 15 seconds." Observed live latency is **~1–3 seconds** after the `goto` navigation settles (confirmed via 1-second polling: absent immediately post-navigation, present within the next poll). A `waitForSelector`/`toBeVisible()` timeout of 15s (per case) is safe headroom; do not shrink it below ~5s given normal network variance, but do not expect it to actually take that long.
3. Verify "Got it" button is present and enabled inside the dialog
   - **Verify**: `page.getByRole('dialog').getByRole('button', { name: 'Got it' })` is visible, not `disabled`. Confirmed via DOM inspection — this is the dialog's **only** action (`MuiDialogActions-root` contains exactly one button); there is no separate close-X icon.
4. Click the "Got it" button
   - **Verify**: `page.getByRole('dialog')` count drops to `0` (confirmed via `document.querySelectorAll('[role="dialog"]').length === 0`); no lingering backdrop (`document.querySelectorAll('.MuiBackdrop-root, .MuiModal-backdrop').length === 0`)
   - **Behavioral note (not a defect — see Known Defects)**: clicking "Got it" does not leave the user parked on `/app/chat/all`. The app immediately navigates to an existing conversation it owns — confirmed live: `https://next.elitea.ai/app/chat/37?name=New+conversation+test` (an account conversation created by an earlier smoke-suite run, TC-002). This id/name **will differ per account/run** — do not assert on the specific conversation id or name, only that the URL is no longer `/app/chat/all` and no longer carries the "not found" dialog.
5. Verify the chat interface is interactive (no invisible backdrop intercepting pointer events)
   - Click `page.getByTestId('chat-input')`, type a short probe string, confirm it lands in the field's value/text, then select-all + delete to clear it — **do not submit/send** (keeps this case read-only, no persisted side effect)
   - **Verify**: probe text appears in the input immediately after typing (pointer + keyboard events reach the underlying app, proving no dialog/backdrop remnant is intercepting), and the field is empty again after clearing

## Expected Results
- `[role="dialog"]` with accessible name "Conversation not found" appears within ~1–3s of navigating to `${BASE_URL}app/chat/all` (well inside the case's 15s allowance)
- The dialog has exactly one action ("Got it"), no separate close icon — matches the case's own `overlay_types` front-matter tags (`OVR-INFO`, `TRG-DELAY`, `CLOSE-BTN-SINGLE`)
- Clicking "Got it" removes the dialog and any backdrop from the DOM and navigates the user into a real, existing conversation (app-selected — not a fixed/predictable id)
- Chat interface is fully interactive immediately after dismissal (verified by successful text entry)
- Zero console errors across the entire flow
- No network request is responsible for the "not found" determination — see Network Behavior

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Precondition: browser window maximized | all UI elements visible | precondition | not explicitly set; default viewport sufficed | asserted *(re-authored: recommend using the project's standard Desktop-Chrome viewport instead of a literal "maximize", per `.agents/testing.md`)* |
| Precondition: user authenticated | logged-in session | precondition | SSO login, no redirect back to Keycloak | asserted |
| Test Data: Navigation URL `${base_url}/app/chat/all` triggers the modal | modal appears | steps 1–2 | step 2: dialog attaches | asserted — **case's own hypothesis confirmed live on first attempt**, no fallback (nonexistent-UUID) navigation was needed |
| 1 Navigate to `/app/chat/all` | page loads, chat list view appears | step 1 | step 1: chat shell renders | asserted |
| 2 Wait up to 15s for modal via `[role="dialog"]` | modal with text "Conversation not found" visible | step 2 | step 2: dialog heading text | asserted *(re-authored: observed actual latency ~1–3s, well under the 15s allowance — see Timing note)* |
| 3 Verify "Got it" button present | button visible and clickable | step 3 | step 3: button visible, not disabled | asserted |
| 4 Click "Got it" via `button:has-text("Got it")` | modal closes, `[role="dialog"]` no longer in DOM | step 4 | step 4: dialog count 0 | asserted *(re-authored: recommend `page.getByRole('dialog').getByRole('button', { name: 'Got it' })` over the case's CSS `:has-text` hint — role+name is higher on this project's locator ladder and both were confirmed to work)* |
| 5 Verify chat interface accessible / no backdrop intercepts pointer events | page is interactive | step 5 | step 5: text entry succeeds | asserted |
| Expected Final State: modal dismissed, chat list fully accessible without overlay, no `[role="dialog"]` in DOM | all conditions hold | steps 4–5 | step 4 (DOM count), step 5 (interactivity) | asserted *(clarification: "chat list interface" reads as remaining on `/app/chat/all`; live product instead routes into an existing conversation — see Step 4 Behavioral note and Known Defects. The case's core intent — overlay gone, page usable — is fully satisfied; only the specific landing route differs from a literal reading of the case text)* |
| Teardown: none required (dismissal is non-persistent) | n/a | — | — | asserted — confirmed live, no app state mutated (probe text typed then cleared, never sent) |

### Axis 2 — Analyst additions
- Step 2 confirms the modal's trigger mechanism is **purely client-side route validation**, not a failed network call — see Network Behavior. *Added: this changes the correct implementer wait strategy from "wait for a 404 response" (a plausible but wrong guess) to "wait for `[role="dialog"]` to attach," which is what's actually documented in Step 2.*
- Step 4 records the post-dismissal navigation target and explicitly flags it as non-deterministic (account/run-dependent). *Added: without this note, an implementer would likely hard-code an assertion on `/app/chat/all` remaining the URL after dismissal, which would fail — the case is silent on this but the live behavior is a real navigation.*
- Step 5 verifies actual interactivity via a live text-entry probe rather than only checking DOM absence of the dialog/backdrop. *Added: DOM absence alone doesn't rule out a still-intercepting invisible overlay; a real pointer+keyboard round-trip is the stronger guarantee the case's own Step 5 intent ("attempting to interact with page") calls for.*
- Confirmed zero console errors and zero related network errors (no 404/500 tied to `/app/chat/all`) across two full repro passes. *Added: the case doesn't ask for a console/network check, but this app's other modals (agents/pipelines module) have shipped defects specifically in dialog wiring (broken ids, missing accessible names) — worth ruling out here too. None found for this modal.*

## Cleanup
1. None required. Confirmed live: no fixture created, no message sent (probe text cleared before dismissal check), the post-dismissal navigation lands on a pre-existing conversation the account already owned — nothing to tear down.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Modal container | `page.getByRole('dialog')` — confirmed exactly one dialog mounted at a time; `role="dialog"`, `aria-modal="true"`, `aria-labelledby="alert-dialog-title"` / `aria-describedby="alert-dialog-description"` **both correctly resolve** to real elements in this dialog (unlike the broken `aria-labelledby` wiring found on the Agents delete-confirm dialog, GH#33 — this one is wired correctly) | `page.locator('[role="dialog"]')` (case's own selector — works identically, `getByRole` preferred per `.agents/testing.md` § Locator strategy) |
| Modal heading/name | `page.getByRole('dialog', { name: 'Conversation not found' })` | `page.getByRole('heading', { name: 'Conversation not found', level: 2 })` |
| "Got it" button | `page.getByRole('dialog').getByRole('button', { name: 'Got it' })` | `page.locator('button:has-text("Got it")')` (case's own selector, also confirmed working — no ambiguity since only one button exists in this dialog) |
| Chat input (interactivity probe, Step 5) | `page.getByTestId('chat-input')` — same handle as TC-001/TC-002's smoke suite | `page.getByPlaceholder('Type your message...')` |

No blocked handles — every element needed for this case resolved cleanly to a stable role/testid-based locator; no CSS/XPath fallback was required.

## Network Behavior
- No dedicated request is made for "does conversation `all` exist." Confirmed by full request-log inspection across two repro passes: the only conversation-shaped request observed is `GET /api/v2/support_assistant/conversation/{fixed-uuid}` (200) — an unrelated, always-present support-widget call, not driven by the `/app/chat/all` route param.
- The "not found" state is resolved **client-side**: the app already holds the account's conversation list (fetched separately) and treats the `all` route segment as a conversation-id lookup that simply doesn't match any entry in that list — no 404/error response is produced or expected.
- **Implementer wait strategy**: wait on `page.getByRole('dialog')` becoming visible (web-first `expect().toBeVisible()` poll, timeout ~15s per case headroom), not on any network response. There is nothing to `waitForResponse()` on for this trigger.

## Known Defects Found During Exploration
None found. This case's live behavior fully satisfies its own Expected Final State; the only deviation from a literal reading of the case text is the post-dismissal navigation target (see Step 4 Behavioral note / Coverage Map), which is a helpful, deliberate product behavior (routing the user into a real conversation instead of leaving them stranded on a broken route) rather than a defect — not filed as a clarification/bug, only documented here and in Automation Hints so the implementer doesn't assert on staying at `/app/chat/all`.

## Blocked Steps
None. All 5 case steps plus the Expected Final State were executed end-to-end against the live system, reproduced twice for consistency (identical dialog text/handles/timing both times).

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — this case joins `tests/modal-handling.spec.ts` (module: modal-handling, per `.agents/test-automation.yaml` and EPIC GH#16's module-by-module delivery plan). Per `.agents/testing.md` § Structure, modal-handling-module specs are not assumed serial by default; this case has no observed dependency on sibling cases (TC-051..056) and is purely read-only/non-destructive.
- Do **not** assert the URL remains `/app/chat/all` after clicking "Got it" — assert only that it is no longer `/app/chat/all` and the dialog is gone. Assert on the dialog's absence and on chat-input interactivity, not on a specific destination conversation id/name (see Step 4 / Coverage Map).
- Wait strategy: `expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 })` for appearance (per case headroom; typically resolves in 1–3s), `expect(page.getByRole('dialog')).toHaveCount(0)` for dismissal. No `waitForResponse` needed for this case — see Network Behavior.
- This is the first case executed in the modal-handling module. The MUI dialog infrastructure pattern already noted in `.agents/testing.md` (role="dialog", no data-testid) holds here too, and — unusually for this app's modals so far (compare the Agents delete-confirm dialog, GH#33) — the ARIA wiring (`aria-labelledby`/`aria-describedby`) is correctly resolved on this one. Worth a quick spot-check by the TC-052/TC-053 (delete-confirmation modal) analysts on whether that dialog's ARIA wiring is likewise correct or repeats the GH#33 pattern.
- Analyst execution note (process/tooling, not product): ran via `playwright-cli -s=TC-050`, an isolated in-memory Chrome profile. `window.location.href` was re-verified after every navigation/interaction; no cross-talk with the 6 concurrently-dispatched sibling analysts (TC-051..056) was observed. Evidence captured: `test-results/screenshots/TC-050-step-2-modal-appeared.png`, `test-results/screenshots/TC-050-step-4-modal-closed.png`, `test-results/screenshots/TC-050-step-2-modal-reappear-check.png` (second repro pass).
