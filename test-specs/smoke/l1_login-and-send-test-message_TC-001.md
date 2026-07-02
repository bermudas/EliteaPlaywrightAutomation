# Test Case: Login and Send Test Message

## Metadata
- **TMS ID**: TC-001
- **Linked Story**: GH#3 (task) — parent EPIC GH#1
- **Priority**: l1
- **Environment Explored**: `https://next.elitea.ai/` (the project's sole configured environment — `.agents/profile.md` names no separate stage/uat)
- **Analyst**: qa-engineer (Sage), analyst-slot sub-agent dispatched by test-automation-lead, 2026-07-02
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- Test user credentials are valid: `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`
- Browser is in a clean state (no active SSO session on `auth.elitea.ai`) — confirmed by navigating to `${BASE_URL}/app/chat/` and observing the redirect to the Keycloak login page

## Test Data
### Existing (re-use)
- `${ELITEA_EMAIL}` = `alita@elitea.ai` — stored in `.env`
- `${ELITEA_PASSWORD}` = stored in `.env`
- Test message text: literal string `Hello, QA test` (fixed by the case, not generated — repeated runs will accumulate additional identical messages in the account's chat history; this is expected, see § Cleanup)

### Must Generate (in test setup)
- None

### Must Clean Up (in teardown)
- None — matches the case's own Teardown note; the account's chat history is intentionally allowed to accumulate (confirmed live: the account already carried 3+ prior conversations — "Test image upload", two "Hello, test" threads — before this run)

## Test Steps
1. Set viewport to a large fixed size (1920×1080) — see § Automation Hints re: the case's `window.moveTo`/`resizeTo` Setup step
2. Navigate to `${BASE_URL}/app/chat/`
   - **Verify**: redirected to `auth.elitea.ai` (Keycloak SSO login page), title "Sign in to Next"
3. Fill the Username/email field with `${ELITEA_EMAIL}`
   - **Verify**: field value is set (plain text)
4. Fill the Password field with `${ELITEA_PASSWORD}`
   - **Verify**: input is `type="password"`; screenshot confirms visual dot-masking
5. Click the "Sign In" button
   - **Verify**: navigates to `${BASE_URL}/app/chat/` (redirect completes; no fixed sleep — wait on URL change)
6. Wait for the app shell to finish loading (network-idle / textarea visible — condition-based, not a fixed delay)
   - **Verify**: URL matches `${BASE_URL}app/chat/*` (app may auto-redirect into the user's most recent conversation, e.g. `/app/chat/21?name=...`); no console errors
7. Verify the left sidebar is visible
   - **Verify**: `nav[aria-label="side-bar"]` visible, containing Chat/Agents/Skills/Pipelines/etc.
8. Verify the message input textarea is visible
   - **Verify**: `#standard-multiline-static` (placeholder "Type your message...") visible
9. Click the message textarea
   - **Verify**: `document.activeElement` is the textarea (focused)
10. Type `Hello, QA test` into the textarea
    - **Verify**: textarea value equals `Hello, QA test`; the send button's accessible name changes from "enter speaking mode" to "send your question" once text is present
11. Click the send button (`getByRole('button', { name: 'send your question' })`)
    - **Verify**: a new row `[data-testid="chat-message-item"]` appears containing "Hello, QA test", attributed to the logged-in user (avatar/name "Alita Yoko")

## Expected Results
- User is authenticated; URL matches `${BASE_URL}app/chat/*`
- Sidebar and message textarea are visible and interactive
- Sent message "Hello, QA test" appears in a `[data-testid="chat-message-item"]` row attributed to the user
- No console errors at any point in the flow
- AI response row may appear afterward (optional per case; observed live — see Coverage Map)

## Coverage Map

### Axis 1 — Case coverage

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Setup 1: Maximize browser window (`window.moveTo`/`resizeTo`) | All UI elements visible | step 1 | viewport set 1920×1080 | asserted *(translated — see Automation Hints)* |
| Setup 2: Verify logout state, navigate to `/app/chat/` | Redirect to `auth.elitea.ai` (fresh session) or already logged in | step 2 | step 2: URL/title check | asserted |
| Precondition: app accessible at `${BASE_URL}` | n/a (implicit) | step 2 | step 2: navigation succeeds | asserted |
| Precondition: test credentials valid | n/a (implicit) | steps 3–5 | step 5: redirect to app succeeds | asserted |
| Precondition: clean browser state (no active session) | n/a (implicit) | step 2 | step 2: redirect to login confirms logged-out | asserted |
| 1 Navigate to `${base_url}/app/chat/` | Redirect to SSO login page | step 2 | step 2 | asserted |
| 2 Fill Username field | Value set in input | step 3 | step 3 | asserted |
| 3 Fill Password field | Password input masked with dots | step 4 | step 4: screenshot evidence | asserted |
| 4 Click "Sign In" | Redirect back to app (2–3s) | step 5 | step 5: URL change to `/app/chat/` | asserted *(no fixed 2–3s wait — condition-based)* |
| 5 Wait for page load | URL contains `/app/chat/`, chat interface ready | step 6 | step 6 | asserted *(translated — condition-based wait, not fixed 3s)* |
| 6 Verify sidebar visible | Left sidebar with nav icons present | step 7 | step 7 | asserted |
| 7 Verify message textarea visible | Textarea at bottom, ready for input | step 8 | step 8 | asserted |
| 8 Click message textarea | Textarea focused, cursor visible | step 9 | step 9 | asserted |
| 9 Type "Hello, QA test" | Text appears in input | step 10 | step 10 | asserted |
| 10 Click Send button | Message sent, appears in list as user message **(right-aligned)** | step 11 | step 11: message row appears with correct text/sender | **clarification** — filed GH#11: live UI renders a full-width transcript row (avatar+name, left-aligned content), not a right-aligned bubble. Message-send *functionality* is fully asserted; only the "right-aligned" visual claim is stale case text |
| Expected Final State: authenticated, URL matches `${base_url}/app/chat/*` | — | step 6 | step 6 | asserted |
| Expected Final State: message visible as right-aligned bubble | — | step 11 | step 11 | **clarification** (same as row above, GH#11) |
| Expected Final State: AI response may appear (optional) | — | step 11 (observed) | step 11: response row "Hello! What would you like to test or verify?" appeared ~1 min after send | asserted *(optional-per-case, but occurred and was confirmed live)* |

### Axis 2 — Analyst additions

- Step 6 asserts **no console errors** through login + app-shell load — *added: silent auth/SPA errors would otherwise ship unnoticed; checked directly via console capture, zero errors observed across two full runs.*
- Step 4 asserts the password input's `type` attribute is literally `password` (not just visually masked via CSS) — *added: confirms real masking, not a cosmetic-only dot overlay; observed via DOM query (`type: "password"` on `#password`).*
- Step 10 asserts the send button's accessible name is **dynamic** (`enter speaking mode` before text entry → `send your question` after) — *added: critical automation detail — a locator built before the textarea has content will not find "send your question" and must be sequenced after typing.*
- Step 11 soft-asserts an AI response eventually appears — *added: confirms the full round-trip (not just message persistence) works end-to-end, even though the case marks this optional.*
- (Nothing else added beyond the case.)

## Cleanup
- None — matches the case's own Teardown ("no teardown required, chat history persists in account")

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| Username/email input (SSO login) | `page.getByRole('textbox', { name: 'Username or email' })` | `page.locator('#username')` |
| Password input (SSO login) | `page.getByRole('textbox', { name: 'Password' })` | `page.locator('#password')` |
| Sign In button (SSO login) | `page.getByRole('button', { name: 'Sign In' })` | `page.locator('#kc-login')` |
| Left sidebar | `page.getByRole('navigation', { name: 'side-bar' })` | `page.locator('nav[aria-label="side-bar"]')` |
| Message input textarea | `page.getByPlaceholder('Type your message...')` | `page.locator('#standard-multiline-static')` |
| Send button (**after** text is typed) | `page.getByRole('button', { name: 'send your question' })` | `page.locator('button[aria-label="send your question"]')` — note: before typing, the same slot renders as `aria-label="enter speaking mode"`; do not locate by that name expecting it to send |
| Sent message row | `page.locator('[data-testid="chat-message-item"]').filter({ hasText: 'Hello, QA test' })` | `page.getByText('Hello, QA test', { exact: true })` |
| Sender name within a message row | *(not stable enough to recommend — see note)* | MUI-generated class `.MuiTypography-bodySmall` inside the row; do not use directly, assert on row `hasText` instead |

Elements observed but **not exercised** by this case (present on the login page, out of scope): "Show password" toggle button, "EPAM"/"ForeFront" federated-login links.

## Network Behavior
- No REST endpoint for message-send was reliably captured during exploration — the app appears to use `socket.io` (websocket, with polling fallback) for chat traffic rather than a single discrete `POST`, and the CDP network buffer used during analysis reset across the SSO→app full-page navigation before the send action. **Recommendation for implementer**: assert on the UI outcome (`[data-testid="chat-message-item"]` row appearing) rather than a network response; if a network-level wait is wanted, use `page.waitForEvent('websocket')` / inspect `socket.io` frames rather than `page.waitForResponse`.
- Standard REST calls fire on app-shell load (`/api/v2/projects/...`, `/api/v2/configurations/...`, `/api/v2/elitea_core/...`, etc.) — all returned `200` during exploration, none block the case's assertions.

## Known Defects Found During Exploration
- **[INFO] CLARIFICATION** — filed as `GH#11` (github-issue, strict-per-bug). Case text (Step 10 / Expected Final State) says the sent message appears as a "right-aligned bubble"; the live UI renders a full-width transcript row (avatar + sender name, left-aligned content) instead. Not a functional defect — message send/persist/display all work correctly with clear sender attribution. Recommendation: **soft-assert** — automate against the actual row-appearance/sender-attribution contract (`[data-testid="chat-message-item"]` + text + sender name), not literal "right-aligned" positioning. No product code change expected; the fix is to Step 10's case text.

## Blocked Steps
- None.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — flat/primitive-heavy path at bootstrap, no page objects yet. TC-001 and TC-005 (logout) share the login/logout chrome (sidebar, avatar menu) per `.agents/testing.md` § Structure — expect a shared page object to emerge once TC-005 is also analyzed; don't pre-build one speculatively for TC-001 alone.
- **Setup step 1 translation**: the case's `window.moveTo(0,0); window.resizeTo(screen.availWidth, screen.availHeight)` is a manual-execution artifact (an in-page script a human pastes into DevTools) — it has no equivalent inside an automated Playwright-controlled browser. Translate to a fixed large viewport in `playwright.config.ts` (the project already runs a single `chromium`/Desktop Chrome project) rather than executing that script via `page.evaluate`.
- **Wait strategy**: the case's "wait 3 seconds" (step 5) and "2-3 seconds" (step 4) language is manual-execution language only, per `.agents/testing.md` § Conventions — translate both to `page.waitForURL(/\/app\/chat/)` + `expect(textarea).toBeVisible()`, never `waitForTimeout`.
- **Sequencing hazard**: the send button's accessible name only becomes "send your question" *after* the textarea has content — locate it only after the `type` step, not before (see Concrete Handles note).
- The app auto-redirects `/app/chat/` into the account's most recent conversation (observed: `/app/chat/21?name=Test+image+upload`) rather than staying on a bare `/app/chat/` URL — assert against the `/app/chat/*` wildcard pattern the case's own Expected Final State already specifies, not an exact path.
- The test account carries pre-existing chat history (multiple prior conversations) by design (`.agents/testing.md` § Test data strategy) — don't assert an empty conversation list or a specific conversation count.
- This is the framework's first test and the case *is* the login flow under test — per `.agents/testing.md` § Hooks, do not hide login behind a `beforeEach`/shared fixture for this specific test.
- Consider promoting the confirmed selectors above (`#username`, `#password`, `#kc-login`, `nav[aria-label="side-bar"]`, `#standard-multiline-static`, `[data-testid="chat-message-item"]`) from "leads" to "confirmed" in `.agents/testing.md` § Locator strategy on the next scout/testing.md update pass — that file currently only lists TC-003/TC-004 leads as unverified.

## Implementer Amendment (Phase 2 exploration, 2026-07-02)

Re-verified all Concrete Handles live via `playwright-cli` before writing `tests/smoke.spec.ts`. Three corrections to this AFS's own recommended locators, each confirmed against the running app:

1. **Message input textarea** — the recommended `page.getByPlaceholder('Type your message...')` does **not** match live: the textarea's `placeholder` attribute is the empty string (`""`), not that text. `#standard-multiline-static` (already listed as this row's own Fallback) is confirmed unique (`document.querySelectorAll` → 1 match) and is used as the implementation's primary handle instead.
2. **Send button** — rather than sequencing on the dynamic accessible name (`enter speaking mode` → `send your question`, still valid and still present), the implementation uses `page.getByTestId('chat-send-button')`. Confirmed live: this `data-testid` is present on the button element in BOTH states (before and after typing), so it removes the sequencing hazard entirely rather than merely documenting it. `aria-label` on that same element still flips as described.
3. **Sent-message row uniqueness** — the AFS's own Test Data section already flags that `"Hello, QA test"` is a fixed, non-uniquified literal that accumulates across runs. Confirmed live: the account's persisted conversation already carried 2+ prior identical rows before this implementation's first run, so `page.locator('[data-testid="chat-message-item"]').filter({ hasText: 'Hello, QA test' })` is a Playwright strict-mode violation (multiple matches) without `.last()`. Implementation adds `.last()` to select the row this test run just created.

No scope change — all three are technique-level (the *how*), not coverage changes (the *what*). See `tests/smoke.spec.ts` TC-001 for the implementation.
