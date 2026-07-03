# Test Case: Confirm Delete Action via Modal (Traceability / Dedup)

## Metadata
- **TMS ID**: TC-053
- **Linked Story**: GH#62 (own tracking issue, parent epic GH#16)
- **Priority**: l2 (per case frontmatter `priority: high`) — **not used for filename** per the `lcovered_` naming contract
- **Environment Explored**: `https://next.elitea.ai/` (project default per `.agents/profile.md`)
- **Analyst**: qa-engineer (analyst slot, `test-case-analysis`) — isolated `playwright-cli -s=TC-053` session (own in-memory Chrome profile; confirmed non-shared with sibling parallel analysts TC-050..052/054..056 — fresh `/app/chat/` navigation bounced to the Keycloak login page before any login, proving no inherited cookies; re-verified `window.location.href` after every navigation)
- **Status**: already-covered

## Dedup proof

**Covering spec**: `tests/agents.spec.ts:422-506` — `test('TC-013: delete agent with confirmation', ...)`, merged via PR #44 (commit `c6e14c8`, "implement TC-010..TC-019 as the agents module suite").

**Secondary corroborating spec** (different entity type, same mechanic): `tests/pipelines.spec.ts:418-...` — `test('TC-023: delete pipeline with confirmation', ...)`, merged via PR #58 (commit `b8e48c3`).

**Behavioral-equivalence argument**: TC-053 ("Confirm delete action via modal") and TC-013 ("Delete agent with confirmation") assert the exact same observable against the exact same entity type (Agent), the exact same page (`/app/agents/all/{id}`), and the exact same shared dialog component. Every element of TC-053's case text — create a disposable agent, navigate to the list, open the agent's detail page, trigger delete, confirm via the modal, verify the agent is permanently removed from the list — is already implemented and asserted end-to-end by TC-013's merged test, which in fact asserts a *superset* of TC-053's own case text (TC-053's case text does not anticipate the live type-the-exact-name-to-confirm gate at all; it still describes a generic "Confirm"/"Delete" button, the same case-text-drift pattern already documented and corrected in TC-013's own AFS, GH#28). Re-implementing TC-053 as its own spec would produce a byte-for-byte duplicate assertion of TC-013 against the same entity type, the same fixture-lifecycle pattern (create → delete via type-to-confirm dialog → verify removal), and the same console-error guard — no new code path, selector, or observable would be exercised. Live re-verification this session (see below) confirms the mechanic has not drifted since TC-013's original exploration.

## Live re-verification performed this session

Rather than re-implementing a redundant destructive create+delete cycle (which TC-013's own merged test already exercises on every CI run), this session did a light, **non-destructive** spot-check to confirm the mechanic TC-013 asserts is still live and unchanged, using the exact same pre-existing baseline agent (id **253**, `TestAgent_1772792259904_temp`) that TC-013's own analyst previously used for its non-destructive spot-check:

1. Isolated login (`playwright-cli -s=TC-053`) — confirmed no inherited session (fresh `/app/chat/` redirected to Keycloak).
2. Navigated to `/app/agents/all`, dismissed the release-notes banner, opened agent id 253's detail page.
3. Confirmed the overflow/kebab button still carries the broken literal `id="undefined-action"` (`aria-haspopup="true"`) — same confirmed defect as TC-013's AFS (GH#33), same agent id, no new finding to file.
4. Opened the menu — confirmed identical structure to TC-013's documented contract: "VERSION" section with an always-disabled `menuitem "Delete"`, "AGENT" section with an enabled `menuitem "Delete agent"`.
5. Clicked "Delete agent" — confirmed the dialog opens with heading "Delete confirmation", body text `Are you sure to delete TestAgent_1772792259904_temp? Enter the name to complete the action.`, a `Name`-labeled textbox, "Cancel" (enabled) and "Delete" (disabled) buttons — exact match to TC-013's documented contract.
6. Clicked "Cancel" to safely dismiss without mutating the baseline fixture — confirmed no deletion occurred (page remained on the agent's detail view).
7. Checked console: 0 errors/warnings (only the benign ASCII-art build-banner log, same noise pattern already documented by TC-013/TC-023).

**One incidental observation, out of TC-053's own scope**: the dialog's heading also contains a distinct icon "Close" button (`button "Close"`, separate from the footer "Cancel"/"Delete" buttons) — this matches the case's own `overlay_types: CLOSE-BTN-DUAL` tag. This tag is **shared identically** with the sibling case `TC-052_cancel-delete-confirmation-modal.md` (also tagged `CLOSE-BTN-DUAL`), which is the case actually scoped to exercising the dialog's alternate-close/cancel paths. TC-053's own title and step list ("Confirm delete action") are scoped to the successful-completion path only, not the close/cancel paths — so this observation is relevant to whichever analyst/implementer handles TC-052, not to TC-053's own classification. Flagging here for traceability; not actioned in this AFS.

## Coverage Map

### Axis 1 — Case coverage (TC-053 element → satisfied by TC-013)

| Case element | Expected result | Covered by (existing spec) | Asserted where | Disposition |
|---|---|---|---|---|
| Preconditions: app accessible, user authenticated, browser maximized | baseline state | `tests/agents.spec.ts` `authenticatedPage` fixture | fixture setup | already-covered |
| Step 1: navigate to `/app/agents/all` | list loads | TC-013 step "4-6" | `agents.spec.ts:440-446` | already-covered |
| Step 2: close any modal (`Got it`) if present | page interactive | TC-013's `dismissAnnouncementBanner()` helper | `agents.spec.ts:433,444` | already-covered *(re-authored: this app's dismissible surface is the release-notes banner, not a "Got it" button — case-text imprecision, same class of drift already documented for the sibling module)* |
| Steps 3-7: create test agent, fill Name/Description, wait for Save enabled, click Save | agent created | TC-013 step "1-3" | `agents.spec.ts:430-438` | already-covered |
| Steps 8-9: navigate back to list, wait for lazy load | agent visible in list | TC-013 step "4-6" | `agents.spec.ts:440-446` | already-covered |
| Step 10: locate and click the agent card | detail page opens | TC-013 step "7-9" | `agents.spec.ts:448-451` | already-covered |
| Step 11: locate "Delete" button on detail page | Delete button visible | TC-013 step "7-9" (kebab/overflow menu → "Delete agent" menuitem) | `agents.spec.ts:452-456` | already-covered *(clarification: live product has no direct "Delete" button on the detail page — deletion is reached via the kebab/overflow menu's "Delete agent" menuitem; TC-013's own AFS already documents this as the confirmed live contract, same reverse-masking guard as GH#28/#33)* |
| Step 12: click "Delete" button | confirmation modal appears (`role="dialog"`) | TC-013 step "10-11" | `agents.spec.ts:459-465` | already-covered |
| Step 13: verify modal contains confirmation text and "Confirm"/"Delete" button | modal content correct | TC-013 step "10-11" | `agents.spec.ts:461-464` | already-covered *(clarification: live buttons are "Cancel"/"Delete", not "Confirm"/"Delete"; "Delete" starts disabled behind a type-the-exact-name gate — case-text drift already filed as GH#28, reverse-masking guard: live product's stricter UX is correct, case text is stale. Independently reconfirmed live this session against the same dialog, see § Live re-verification.)* |
| Step 14: click "Confirm"/"Delete" button | modal closes, agent deleted | TC-013 steps "12" + "13-14" | `agents.spec.ts:467-488` | already-covered *(decomposed: the case's single "click Confirm" step maps to TC-013's two live actions — type-the-exact-name to enable, then click "Delete" — since there is no literal "Confirm" button)* |
| Step 15: verify redirect to `/app/agents/all` | list page loads | TC-013 step "13-14" | `agents.spec.ts:487` | already-covered |
| Steps 16-17: wait, scroll, verify agent no longer in list | agent absent | TC-013 step "15-16" | `agents.spec.ts:490-492` | already-covered |
| Expected Final State: agent permanently deleted, modal dismissed | all conditions hold | TC-013 steps "13-14", "15-16" + console guard | `agents.spec.ts:487,492,496` | already-covered |
| Teardown: none required | n/a | TC-013's own try/finally (delete-in-flow, fallback cleanup only if the test fails early) | `agents.spec.ts:495-504` | already-covered |

### Axis 2 — Analyst additions
- None beyond what TC-013 already asserts. This session's only addition is the non-destructive live spot-check documented above (§ Live re-verification), performed to validate the dedup call rather than to assert a new observable in an automated spec.
- One incidental, out-of-scope observation (the dialog's dual close-button shape) is flagged above for the TC-052 analyst/implementer, not claimed as TC-053's own enrichment.

## Cleanup
None required. No fixture was created this session — verification reused the existing baseline agent (id 253) non-destructively (dialog opened, then cancelled).

## Known Defects Found During Exploration
None new. Re-confirmed the already-filed `id="undefined-action"` kebab-button defect (GH#33) on the same agent (id 253) already used for this exact spot-check by TC-013's own analyst — not a new finding, not re-filed.

## Blocked Steps
None. The case's full scenario is behaviorally proven by the already-merged `tests/agents.spec.ts:422-506` (TC-013); this session's live spot-check (kebab menu → "Delete agent" → dialog contract → Cancel) additionally confirms the mechanic has not drifted.

## Automation Hints
- No new automation code is needed for TC-053. If `tests/modal-handling.spec.ts` is scaffolded per `.agents/testing.md`'s module plan, add a comment there referencing this traceability AFS and `tests/agents.spec.ts:422` instead of duplicating the test.
- Should the modal-handling module later want an entity-agnostic "confirm delete" assertion independent of Agents/Pipelines, that would be a deliberate refactor of TC-013/TC-023's existing tests into a shared helper — not a reason to add a third duplicate spec.
