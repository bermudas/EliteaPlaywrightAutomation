# Test Case: Create New Conversation

## Metadata
- **TMS ID**: TC-002
- **Linked Story**: GH#4 (task) / GH#1 (epic)
- **Priority**: l1
- **Environment Explored**: production (`https://next.elitea.ai/`)
- **Analyst**: qa-engineer (analyst slot, isolated `playwright-cli` session `tc002`)
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) is authenticated
  - **In the real suite**: this is the carried-over session from TC-001 (serial
    `test.describe.configure({ mode: 'serial' })` chain — TC-002 runs second,
    right after TC-001 leaves the browser on an active conversation).
  - **In this analysis pass**: no prior-test session existed (analyst runs
    standalone, in parallel with sibling analysts on TC-001/003/004/005), so a
    fresh login was performed as a manual-execution substitute for the
    carried-over session, per dispatch instructions. Functionally equivalent —
    both end in "authenticated, chat interface loaded."
- At least one prior conversation exists in the account (observed: "Test image
  upload", "Hello, test" ×2 — pre-existing account data, not seeded by this case)

## Test Data
### Existing (re-use)
- `${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}` — from `.env` (`${TEST_USER}` role)
- `${TEST_MESSAGE}` = `"New conversation test"` — fixed literal from the case, not
  uniquified per run. Re-running this case repeatedly will create multiple
  conversations with the identical name "New conversation test" — this is the
  **documented, accepted** behavior for this suite (see `.agents/testing.md` §
  Test data strategy: TC-001/TC-002 persist sent messages with no cleanup by
  design).

### Must Generate
- None.

### Must Clean Up (in teardown)
- None — see § Cleanup below.

## Test Steps

1. Navigate to `${BASE_URL}/app/chat/`.
   - **Verify**: page does not redirect to the Keycloak login page (`auth.elitea.ai`) → confirms authenticated state. App auto-redirects into the most recent existing conversation (observed: `/app/chat/21?name=Test+image+upload`).
2. Wait for the chat interface to finish loading (`getByTestId('chat-input')` visible and interactable; no fixed sleep).
   - **Verify**: no blocking modal is present. (A dismissible release-notes banner — `button "close"` — is present but does not block interaction; it is not a modal.)
3. Click the new-conversation control in the left sidebar: `getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })`.
   - **Verify**: URL changes to `${BASE_URL}/app/chat` (no id yet — see Coverage Map / Known Defects for why this differs from the case's literal step 4 wording).
4. Wait for the draft conversation view to render (`getByText('Hello, Alita!')` visible — no fixed sleep).
   - **Verify**: message textarea (`getByTestId('chat-input')` → inner `textarea`) is visible and focused/active.
   - **Verify**: message list shows only the welcome state — `"Hello, Alita!"` / `"What can I do for you today?"` — no prior messages (clean conversation state).
5. Fill the textarea with `${TEST_MESSAGE}` (`"New conversation test"`) via `getByTestId('chat-input').locator('textarea')`.
   - **Verify**: textarea value equals `${TEST_MESSAGE}`.
6. Click the send button: `getByTestId('chat-send-button')`.
   - **Verify**: button was enabled (not disabled) immediately before the click.
7. Wait for URL to match `${BASE_URL}/app/chat/{id}` (`page.waitForURL(/\/app\/chat\/\d+/)`) — this is where the new conversation id actually appears (observed: id `22`, distinct from the pre-existing id `21`).
   - **Verify**: `${TEST_MESSAGE}` appears as a right-aligned user message, attributed to the logged-in user ("Alita Yoko"), timestamped "less than a minute ago".
8. Wait for the AI response block: `getByRole('button', { name: /^Thought for \d+ secs?$/ })` visible.
   - **Verify**: response text is visible under the "Thought for N sec(s)" heading (observed: "Hello! How can I help you today?").
   - **Verify (added)**: no console errors were logged during steps 3–8; all conversation-related XHR calls (`POST .../conversations/...`, `PATCH .../entity_settings/...`, `PUT .../conversation/...`, `POST .../select_conversation/...`) returned 2xx.
9. Verify the new conversation now appears in the sidebar conversation list, grouped under "Today", with the name `${TEST_MESSAGE}` (observed: `button "New conversation test"` under `heading "Today"`).

## Expected Results
- New conversation created with a fresh id, URL matches `${BASE_URL}/app/chat/{id}` (id populated only after the first message is sent — not immediately after clicking the create control).
- User message `${TEST_MESSAGE}` visible in the message list, right-aligned, attributed to the user.
- AI response completed (or, on a slower model, still streaming) — "Thought for N sec(s)" indicator visible either way.
- No console errors; no non-2xx responses on any `elitea_core` conversation-lifecycle endpoint.
- New conversation is listed in the sidebar under "Today".

## Coverage Map

**Axis 1 — Case coverage**

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Setup 1: Maximize browser window | All UI elements visible | — | — | out-of-scope *(automation uses a fixed Desktop Chrome viewport per `playwright.config.ts`/`.agents/testing.md`, not manual window maximizing; a manual-execution artifact, not translated 1:1)* |
| Setup 2: Verify authenticated state (nav to `/app/chat/`, check for login redirect) | User authenticated | step 1 | `step 1`: no redirect to `auth.elitea.ai` | asserted |
| Precondition: App accessible at `${BASE_URL}` | — | step 1 | `step 1`: page loads | asserted |
| Precondition: User authenticated as `${ELITEA_EMAIL}` | — | step 1 | `step 1`: no login redirect | asserted |
| Precondition: Browser has active session from previous test or login | — | Preconditions section | n/a (session-establishment mechanism) | asserted *(equivalent substitute used for analysis — see Preconditions note)* |
| Test Data: Test Message = "New conversation test" | — | step 5 | `step 5`: textarea value | asserted |
| 1 Navigate to `${BASE_URL}/app/chat/` | Chat interface loads (redirects to existing conversation) | step 1 | `step 1`: URL becomes `/app/chat/21?...` | asserted |
| 2 Wait for page load (3s), no modal | Chat interface ready | step 2 | `step 2`: `chat-input` visible, no blocking modal | asserted |
| 3 Click "Create" button (`+` icon / `[aria-label*="Create"]`) | New conversation created automatically | step 3 | `step 3`: URL → `/app/chat` (draft state) | clarification *(selector hint is stale — see Known Defects; the real click DOES start a new conversation draft as expected, just not the literal handle described)* |
| 4 Wait (3s); URL changes to `/app/chat/{new_id}` | New id present in URL | steps 3–7 | `step 7`: `waitForURL(/\/app\/chat\/\d+/)` after Send | clarification *(id is assigned on first Send, not on Create-click — see Known Defects)* |
| 5 Verify message input textarea visible | Textarea ready for input | step 4 | `step 4`: `chat-input` textarea visible/active | asserted |
| 6 Verify message list empty or welcome message | Clean conversation state | step 4 | `step 4`: "Hello, Alita!" welcome text, no prior messages | asserted |
| 7 Type "New conversation test" | Text appears in input | step 5 | `step 5`: textarea value assertion | asserted |
| 8 Click Send button (speech bubble icon) | Message sent, right-aligned user bubble | step 6–7 | `step 7`: user message visible, right-aligned | asserted *(icon is a custom send/paper-plane-style SVG, not literally a speech bubble — minor wording drift, folded into the same clarification as steps 3–4, not filed separately)* |
| 9 Wait for streaming indicator ("Thought for N sec") | Indicator visible | step 8 | `step 8`: "Thought for 1 sec" button/heading visible | asserted |
| Expected Final State: URL matches `/app/chat/{id}` | — | step 7 | `step 7` | asserted |
| Expected Final State: user message visible | — | step 7 | `step 7` | asserted |
| Expected Final State: AI response streaming/completed | — | step 8 | `step 8` | asserted |
| Teardown: no teardown required, conversation persists | — | § Cleanup | — | asserted (informational, matches observed account state) |

**Axis 2 — Analyst additions**

- `step 6` asserts the send button is enabled before click — *added: guards against a disabled-state regression that would silently no-op the click and leave the case looking "passed" with no message actually sent.*
- `step 8` asserts zero console errors and 2xx on every conversation-lifecycle XHR (`conversations`, `entity_settings`, `conversation`, `select_conversation`) — *added: none observed during exploration, but this is exactly the kind of silent-failure class (UI looks fine, an API call 500s in the background) worth guarding permanently.*
- `step 9` asserts the new conversation is listed in the sidebar under "Today" — *added: confirms server-side persistence, not just optimistic client-side UI state; the case's own steps never check the sidebar list.*

## Cleanup
No teardown required — conversation persists in the account for further tests
(confirmed: this matches the case's own Teardown note, and reflects real
account behavior observed — the previous conversation "Test image upload"
from an earlier session is still present and untouched).

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| New-conversation control (sidebar) | `page.getByRole('navigation', { name: 'side-bar' }).getByRole('button', { name: 'Conversation', exact: true })` | No `data-testid`/`aria-label` exists on this element — if the accessible name ever changes, scope by position: first child of the third `separator`-delimited group in the side-bar nav (`nav[aria-label="side-bar"] >> nth-match after 2nd separator`). **Do not** use `[aria-label*="Create"]` — no such attribute exists (see Known Defects). |
| Chevron button next to it (creation-type dropdown, unlabeled, untested this pass) | not needed for this case — do not click by accident; it sits immediately right of the create control | n/a |
| Message input textarea | `page.getByTestId('chat-input').locator('textarea')` | `page.locator('#standard-multiline-static')` (MUI-generated id — less stable across builds, use only if `data-testid` regresses) |
| Send button | `page.getByTestId('chat-send-button')` | `page.getByRole('button', { name: 'send your question' })` |
| Sidebar conversation-list entry for the new conversation | `page.getByRole('button', { name: 'New conversation test', exact: true })` scoped under the "Today" heading group | `page.getByText('New conversation test', { exact: true })` (broader match, includes the message bubble copy — scope carefully to avoid double-matching) |
| AI "thinking" / response-ready indicator | `page.getByRole('button', { name: /^Thought for \d+ secs?$/ })` | `page.getByRole('heading', { level: 3 }).filter({ hasText: /^Thought for/ })` |
| Welcome / empty-conversation state | `page.getByText('Hello, Alita!')` | `page.getByText('What can I do for you today?')` |
| User message bubble (sent text) | scoped within `page.getByRole('region', { name: 'scrollable content' })`, last `listitem` containing `getByText('New conversation test')` | — |

## Network Behavior
- `POST /api/v2/elitea_core/conversations/prompt_lib/${PROJECT_ID}` → `201` — fires on **Send click**, not on the create-control click. This is what actually assigns the new conversation id (observed: `22`).
- `PATCH /api/v2/elitea_core/entity_settings/prompt_lib/${PROJECT_ID}/{id}` → `200` — immediately after creation.
- `PUT /api/v2/elitea_core/conversation/prompt_lib/${PROJECT_ID}/{id}` → `200` — fires twice (once right after creation, once shortly after — the second appears to rename the conversation from the placeholder "New Conversation" to the sent-message-derived title).
- `POST /api/v2/elitea_core/select_conversation/prompt_lib/${PROJECT_ID}/{id}` → `200`.
- All observed requests during the full flow (login → click-create → type → send → response) returned `200`/`201`/`204` — zero `4xx`/`5xx`. `${PROJECT_ID}` was `21` for this account/session (account-specific, not a hardcoded global).

## Known Defects Found During Exploration
- **[INFO / CLARIFICATION]** Case text drift, not a product defect — filed as `GH#9`
  ("[INFO][TC-002] Case text drift: 'Create' button selector and new-conversation
  URL/ID timing"). Two related, live-product-is-correct observations:
  1. The case's selector hint `[aria-label*="Create"]` matches nothing — the
     control has no `aria-label` at all; its accessible name is `"Conversation"`
     (context-sensitive to the active left-nav section), not the literal text
     "Create".
  2. The case's step 4 implies the new conversation id appears in the URL right
     after clicking the create control. Actual behavior: the URL stays id-less
     (`/app/chat`) until the first message is sent — id assignment is lazy,
     tied to the `POST .../conversations/...` call that fires on Send.
  Recommendation for automation: use the real handles/timing documented above
  (natural-fail is fine here — these aren't flaky, they're consistently
  reproducible corrections to the case text). No `expect.soft()` needed; assert
  the real contract directly.
- No functional product defects found. Full flow (create → type → send →
  receive AI response → sidebar list update) completed cleanly: zero console
  errors, zero non-2xx network responses across the entire flow.

## Blocked Steps
None.

## Automation Hints
- Framework: Playwright/TypeScript (confirmed, `.agents/testing.md`), flat/default
  scaffold — this case belongs in `tests/smoke.spec.ts` as the second test in
  the serial `@smoke` chain (`test('TC-002: create new conversation', ...)`,
  runs immediately after TC-001, same `describe.configure({ mode: 'serial' })`
  block, `workers: 1`). Do not re-login — TC-001 already leaves the session
  authenticated.
- Wait strategy: no fixed timeouts anywhere in this flow.
  - After step 3 (create-control click): wait for `getByText('Hello, Alita!')`
    to appear, not a URL change (URL doesn't change to a *new* meaningful state
    beyond dropping the id until Send — see Known Defects).
  - After step 6 (Send click): `page.waitForURL(/\/app\/chat\/\d+/)` — this is
    the correct signal for "new conversation id assigned," matching the real
    `POST .../conversations/...` → `201` timing.
  - For step 8 (AI response), `getByRole('button', { name: /^Thought for/ })`
    is a reasonable wait target; on a slow model this may take longer than the
    "3 seconds" the case implies — don't hardcode a short timeout here, use
    Playwright's default/expanded `expect(...).toBeVisible({ timeout: ... })`
    generously (this endpoint streams and can vary).
- Page object: none exists yet in `tests/pages/` (bootstrap state, per
  `.agents/testing.md`). TC-001 and TC-002 share the chat-input/send-button/
  sidebar-chrome locators — if TC-003/TC-004 also end up touching the sidebar
  nav (`Agents`, `Pipelines` items), that's the "locator block repeats 3+
  times" trigger `.agents/testing.md` names for introducing
  `tests/pages/chat.page.ts` — implementer's call, not pre-built here.

## Implementer Amendment (Phase 2 exploration, 2026-07-02)

Re-verified all Concrete Handles live via `playwright-cli` before writing `tests/smoke.spec.ts`. Two corrections beyond what this AFS already documents:

1. **Message textarea / send button** — same live-DOM findings as TC-001's own amendment (both cases share this chrome): `page.getByTestId('chat-input').locator('textarea')` (this AFS's own primary recommendation) is a Playwright strict-mode violation live — it resolves to 2 elements (the real `<textarea>` plus a hidden `readonly aria-hidden="true"` shadow textarea MUI renders for auto-sizing). Implementation uses `page.locator('#standard-multiline-static')` directly (unique, confirmed via DOM query) instead. Send action uses `page.getByTestId('chat-send-button')`, matching this AFS's own primary recommendation exactly (no change there).
2. **Sidebar "Today" entry timing (step 9)** — confirmed live that the new conversation's sidebar entry passes through a transient `"Naming"` placeholder (an async, AI-generated-title step) before settling on the final name. Observed once to take **~30-40 seconds** to resolve — well beyond this AFS's own "no fixed sleep" framing suggests. Implementation waits on `getByRole('button', { name: TEST_MESSAGE, exact: true })` with a 45s timeout (`expect(...).toBeVisible({ timeout: 45_000 })`) rather than a shorter default, still a pure condition-wait (no `waitForTimeout`), just a wider ceiling than the case's own "3 seconds" framing would suggest.

No scope change — both are technique-level (the *how*: handle stability, wait ceiling), not coverage changes. See `tests/smoke.spec.ts` TC-002 for the implementation.
