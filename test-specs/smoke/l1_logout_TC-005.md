# Test Case: Logout Successfully

## Metadata
- **TMS ID**: TC-005
- **Linked Story**: GH#7 (task) / GH#1 (epic — "Bootstrap Playwright framework + automate @smoke suite")
- **Priority**: l1
- **Environment Explored**: production (`https://next.elitea.ai/`) — no stage/uat environment configured for this project
- **Analyst**: qa-engineer (Sage), analyst slot, session started fresh for this case
- **Status**: ready-for-automation

## Preconditions
- App is accessible at `${BASE_URL}` (`https://next.elitea.ai/`)
- User `${TEST_USER}` (`${ELITEA_EMAIL}` / `${ELITEA_PASSWORD}`) is a valid, authenticated-capable account
- Browser viewport maximized (1920x1080 used in exploration) — case's "Setup 1" (`window.moveTo`/`resizeTo`) is a manual-execution artifact; automation sets viewport via Playwright config/`browser_resize`, not injected JS
- **This test is the LAST test in the intended serial smoke chain (TC-001→005)** — see `.agents/testing.md` § Structure. In the real automated suite it runs against the session TC-001 established; it does not need its own login. During THIS analysis session, the analyst logged in fresh (isolated browser context, same shared `${TEST_USER}` account) purely to explore the flow in isolation from the other 4 parallel analysts — that login step is not part of the case itself and is not reflected in the Coverage Map below as a case step (case's own Setup 2 already covers "verify authenticated, log in first if not").

## Test Data
### Existing (re-use)
- `${ELITEA_EMAIL}` = `alita@elitea.ai` (test account, shared across the smoke suite)
- `${ELITEA_PASSWORD}` = stored in `.env`

### Must Generate (in test setup)
- None — logout flow uses the existing session established by TC-001

### Must Clean Up (in teardown)
- None. Per case's own Teardown: "Re-authenticate if further tests require logged-in state." Since TC-005 is the last test in the serial chain and no test runs after it in the intended order, no re-login teardown is needed — see § Automation Hints for the explicit flag on this.

## Test Steps
1. Verify current URL matches `${BASE_URL}app/*` (authenticated page)
   - **Verify**: URL contains `/app/` — confirmed at `https://next.elitea.ai/app/chat/21?name=Test+image+upload` (app auto-redirected to the account's most-recent chat; still under `/app/*`)
2. Locate the user profile/avatar element in the left sidebar
   - **Verify**: `#user-menu-action` button is visible, containing an avatar image (`alt` = user's display name) — **located at the BOTTOM-left of the sidebar, not top-left** (see Coverage Map, disposition `clarification`, GH#10)
3. Click the profile/avatar button (`#user-menu-action`)
   - **Verify**: a dropdown menu opens with two `role="menuitem"` entries: "Personalization" and "Logout"
4. Wait for the menu to be visible (condition wait, not a fixed sleep)
   - **Verify**: `getByRole('menuitem', { name: 'Logout' })` is visible
5. Click the "Logout" menu item (`getByRole('menuitem', { name: 'Logout' })`)
   - **Verify**: click triggers navigation away from `/app/chat/*`
6. Wait for redirect to complete (`page.waitForURL(/auth\.elitea\.ai/)`, not a fixed sleep)
   - **Verify**: browser navigates through an intermediate hop `${BASE_URL}forward-auth/auth_oidc/login?target_to=<JWT>` and lands on `https://auth.elitea.ai/realms/nexus/protocol/openid-connect/auth`
7. Verify final URL matches the login/auth pattern
   - **Verify**: URL host is `auth.elitea.ai` (case's OR-condition `auth.elitea.ai` / `${BASE_URL}sign-in` — this build uses the `auth.elitea.ai` branch)
8. Verify login form elements are visible
   - **Verify**: `#username` (Username or email) and `#password` (Password) inputs present, plus `#kc-login` "Sign In" button
9. Attempt to navigate back to `${BASE_URL}app/chat/`
   - **Verify**: navigation is issued
10. Verify automatic redirect to the login page occurs again
    - **Verify**: final URL is again `https://auth.elitea.ai/realms/nexus/protocol/openid-connect/auth` — session did not persist, re-auth is required

## Expected Results
- Clicking Logout terminates the session (both client-side and server-side — confirmed via cookie inspection, see Coverage Map Axis 2)
- Any subsequent attempt to load an `/app/*` route immediately redirects to the Keycloak SSO login page, no authenticated content flashes first
- Login form (`#username`, `#password`, `#kc-login`) is present and ready for a fresh sign-in
- No console errors at any point in the flow (menu open, logout click, redirect, re-navigation attempt)

## Coverage Map

**Axis 1 — Case coverage**

| Case element | Expected result | Covered by (AFS step) | Asserted where | Disposition |
|---|---|---|---|---|
| Setup 2: verify authenticated state before proceeding | no redirect on `/app/chat/` nav = authenticated | step 1 | `step 1`: URL contains `/app/` | asserted |
| 1 Verify user on authenticated page (URL `/app/*`) | URL matches `${BASE_URL}app/*` | step 1 | `step 1`: URL assertion | asserted |
| 2 Locate user profile/avatar in **top-left corner** of left sidebar | avatar visible | step 2 | `step 2`: `#user-menu-action` visible | **clarification** — element exists and is fully functional, but is positioned at the **bottom-left**, not top-left, of the sidebar. Live product is correct (deliberate IA pattern: logo/workspace switcher at top, account controls at bottom); case text is stale. Filed as GH#10 `[INFO]`. Automation asserts the live DOM position, not the case's stale wording. |
| 3 Click avatar → dropdown/profile menu opens | menu opens | step 3 | `step 3`: two `menuitem` elements appear | asserted |
| 4 Wait 1s for menu to expand, options visible (Settings, Logout, etc.) | menu visible with options | step 4 | `step 4`: `Logout` menuitem visible | asserted *(decomposed — "wait 1 second" is a manual-execution artifact; automation uses a condition wait on menu visibility, not a fixed timeout — see `.agents/testing.md` § Conventions)*. Note: case says "Settings, Logout, etc." — actual menu has exactly two items, "Personalization" and "Logout" (no item literally named "Settings"). Not filed separately — same stale-case-text root cause as the avatar-position finding, low-value to file as a second ticket; noted here for the implementer's awareness. |
| 5 Click "Logout" or "Sign Out" menu item | logout triggered | step 5 | `step 5`: navigation away from `/app/chat/*` begins | asserted *(item is labeled "Logout" only — no "Sign Out" alternate label observed)* |
| 6 Wait for redirect (2-3s) | redirects to login/SSO page | step 6 | `step 6`: URL settles on `auth.elitea.ai` after an intermediate `forward-auth/auth_oidc/login` hop | asserted *(decomposed — "wait 2-3 seconds" translated to `waitForURL`, not a fixed timeout)* |
| 7 Verify URL is login/auth page (`auth.elitea.ai` or `${BASE_URL}sign-in`) | URL matches one of the two patterns | step 7 | `step 7`: URL host `auth.elitea.ai` | asserted (this build resolves to the `auth.elitea.ai` branch of the OR-condition; `${BASE_URL}sign-in` not observed/exercised) |
| 8 Verify login form elements visible (Username, Password) | inputs present | step 8 | `step 8`: `#username` + `#password` present | asserted |
| 9 Attempt to navigate back to `${BASE_URL}app/chat/` | navigation issued | step 9 | `step 9`: `page.goto` re-issued | asserted |
| 10 Verify redirect to login page occurs | URL returns to `auth.elitea.ai`/`${BASE_URL}sign-in` | step 10 | `step 10`: URL is `auth.elitea.ai` again | asserted |

**Axis 2 — Analyst additions**

- `step 6`/`step 10` assert **no console errors** during the entire logout → redirect → re-navigation-redirect sequence — *added: silent JS errors during an auth transition are exactly the kind of bug a screenshot-only check would miss; confirmed clean via `get-console` at 4 checkpoints (post-login, menu-open, post-logout-redirect, post-reattempt-redirect).*
- `step 6` asserts the **session cookie is actually cleared**, not just that the URL changed — *added: inspected cookies post-logout via CDP; no Keycloak authenticated-session cookie (`KEYCLOAK_SESSION`/equivalent) remained for `auth.elitea.ai` — only `KC_RESTART`/`AUTH_SESSION_ID`, which are artifacts of the login flow Keycloak just re-initiated, not proof of a lingering authenticated session. This distinguishes "URL looks like login page" from "session is actually terminated," which is the case's own stated Expected Final State.*
- `step 6` documents the **exact redirect chain** (`/forward-auth/auth_oidc/login?target_to=<JWT>` → `auth.elitea.ai/realms/nexus/protocol/openid-connect/auth`) — *added: the case only says "redirects to login page"; the implementer needs to know there's an intermediate same-origin hop so `waitForURL` uses a pattern that tolerates it (match on the FINAL `auth.elitea.ai` URL, don't assert on the intermediate hop unless intentionally testing it).*

## Cleanup
None required. Session is already terminated by the test itself (that's the point of the case). No re-login teardown needed given TC-005's position as the last test in the intended serial chain — see § Automation Hints for the explicit flag if this assumption is ever violated.

## Concrete Handles (discovered during exploration)

| Element | Recommended Locator | Fallback |
|---|---|---|
| User profile/avatar button (bottom-left of sidebar) | `page.locator('#user-menu-action')` — stable, intentional `id`, framework-agnostic (tier: data-testid-equivalent) | `getByRole('button', { name: '${TEST_USER_DISPLAY_NAME}' })` — works but couples to the display name ("Alita Yoko"), which varies per account; prefer the `id` |
| Profile dropdown — "Personalization" item | `getByRole('menuitem', { name: 'Personalization' })` (tier 1: ARIA role + accessible name) | `page.locator("li[role='menuitem']").first()` — structural, order-dependent, last resort |
| Profile dropdown — "Logout" item | `getByRole('menuitem', { name: 'Logout' })` (tier 1: ARIA role + accessible name) | `page.locator("li[role='menuitem']").last()` — structural, order-dependent, last resort |
| Login — Username/email input | `page.locator('#username')` (Keycloak-rendered, `id`+`name`="username", also matches `getByLabel('Username or email')`) | `getByLabel('Username or email')` |
| Login — Password input | `page.locator('#password')` (also matches `getByLabel('Password')`) | `getByLabel('Password')` |
| Login — Sign In submit button | `getByRole('button', { name: 'Sign In' })` (`id="kc-login"`) | `page.locator('#kc-login')` |

**Note on tier for `#user-menu-action`:** no `data-testid` attribute exists on this app (none observed anywhere in the DOM across TC-005 exploration); the plain `id="user-menu-action"` is a deliberately-named, semantic id (not a MUI-generated hash class like `.css-15a46o5` on the same element) and is treated as the practical equivalent of a test id for locator-stability purposes.

## Network Behavior
- Clicking "Logout" does **not** fire an XHR/fetch logout call — it's a plain browser navigation (`<a>`/programmatic `location` change) to `${BASE_URL}forward-auth/auth_oidc/login?target_to=<base64 JWT>`, which itself 302-redirects to `https://auth.elitea.ai/realms/nexus/protocol/openid-connect/auth` (Keycloak's OIDC front-channel logout + re-auth flow).
- **Automation implication**: wait on `page.waitForURL(/auth\.elitea\.ai/)` (or the case's own dual pattern `auth\.elitea\.ai|${BASE_URL}sign-in`) after the Logout click — do **not** wait on a specific network response, since there isn't one meaningful XHR to key off; the whole flow is navigation-driven.
- Full request/response capture during the click→redirect window could not be captured with the CDP tooling used for this exploration (each CLI invocation opens a fresh CDP connection, so `Network.enable` events from the navigation that started mid-click weren't visible to the subsequent inspection call) — the redirect chain above was reconstructed from the `click()` command's own response (`url`/`title` after click) plus `page-info` polls before/after. The implementer using Playwright's own `page.waitForURL`/`page.on('response')` inside a single test process will not have this limitation.

## Known Defects Found During Exploration
- **[INFO] Case-text drift** — TC-005 step 2 says the avatar is in the "top-left corner" of the sidebar; live product has it bottom-left. Filed as **GH#10** (`[INFO] TC-005: profile/avatar menu is bottom-left of sidebar, not top-left as case text states`), labels `question, documentation`. Reverse-masking guard applies: product is correct, case text is stale — do not weaken/skip the assertion, assert the live (bottom-left) position. No `expect.soft()` needed since there's no product defect to isolate — this is a spec-vs-reality correction, not a bug.
- No functional defects found. Logout behaves correctly: menu opens, Logout terminates the session (URL + cookie evidence), and the app correctly refuses to serve `/app/*` content after logout.

## Blocked Steps
None. All 10 case steps executed to completion against the live system.

## Automation Hints
- Framework: Playwright (TypeScript), per `.agents/testing.md` — flat/primitive-heavy path, no page objects yet at bootstrap. `#user-menu-action` and the `Logout`/`Personalization` menu locators are prime candidates for the *first* page object extraction once TC-001 (which also touches the sidebar/login chrome) is implemented — `.agents/testing.md` § Structure already flags TC-001/TC-005 as sharing this chrome.
- **This test does not need its own login/setup fixture.** In the real serial suite (`test.describe.configure({ mode: 'serial' })`, TC-001→005 in one file per `.agents/testing.md`), TC-005 runs last against the session TC-001 established — write it to continue from wherever TC-004 left the page (any `/app/*` route), matching the case's own Preconditions ("User is on any app page").
- **No re-login teardown needed** — TC-005 is the last test in the intended execution order and nothing runs after it in this suite. **Flag for the implementer**: if the suite is ever reordered, split, or a 6th test is appended after TC-005, that new/reordered test will need its own login (TC-005 leaves the browser on the logged-out Keycloak page) — this AFS's "no teardown" call is only valid under the current TC-001→005-last ordering assumed by `.agents/testing.md`. No side effects beyond session termination were observed (no data mutated, no destructive action) — logout is safe to re-run.
- Wait strategy: `page.waitForURL(/auth\.elitea\.ai/)` after the Logout click (not `waitForTimeout` — case's "wait 2-3 seconds" is a manual-execution artifact per `.agents/testing.md` § Conventions). Same for the menu-open wait in step 4 — use `expect(logoutMenuItem).toBeVisible()` polling, not a fixed 1s sleep.
- Session-termination assertion: prefer re-navigating to `${BASE_URL}app/chat/` (case step 9) and asserting the URL lands back on `auth.elitea.ai` — this is a stronger proof than only checking the URL right after the Logout click, since it exercises the server-side session state, not just client-side routing.

## Evidence
- `test-results/screenshots/TC-005-step-01-authenticated-chat.png` — authenticated chat page, `#user-menu-action` visible bottom-left
- `test-results/screenshots/TC-005-step-03-profile-menu-open.png` — dropdown open, "Personalization" + "Logout" menu items visible
- `test-results/screenshots/TC-005-step-07-login-page-after-logout.png` — Keycloak login form after logout completes
- `test-results/screenshots/TC-005-step-09-reattempt-redirect.png` — re-navigation to `/app/chat/` bounced back to the same login page

## Implementer Amendment (Phase 2 exploration, 2026-07-02; reviewer correction PR #15 R1)

**Login form fields (step 8)** — this AFS's own "Recommended Locator" for the post-logout login form is the id-based `page.locator('#username')` / `page.locator('#password')` (with `getByLabel(...)` listed as the Fallback). The implementation (`tests/smoke.spec.ts`) uses `page.getByRole('textbox', { name: 'Username or email' })` / `page.getByRole('textbox', { name: 'Password' })` instead — the same handles TC-001's own AFS already recommends as primary for this identical Keycloak login form (TC-001 logs in through it; TC-005 lands back on it after logout). Per `.agents/testing.md` § Locator strategy, `getByRole` with the accessible name is the ladder's top tier, ranked above a bare CSS id — this AFS's own Concrete Handles table already ranks its Fallback (`getByLabel`) above the id-based primary for the same reason ("also matches `getByLabel(...)`"), so using the role-based equivalent is consistent with that stated preference, just one tier higher. Functionally equivalent to the AFS's own primary locator; not a correctness bug — flagged here per the standing AFS-drift documentation requirement, following the same pattern already used for the session-termination cookie-check substitution documented inline in `tests/smoke.spec.ts` (step 9-10).
