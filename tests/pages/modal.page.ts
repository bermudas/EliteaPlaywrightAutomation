import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Generic, domain-agnostic modal helpers -- the "standing regression guard"
 * assertions repeated across 3+ cases in `tests/modal-handling.spec.ts`
 * (Hard Rule 7's extraction threshold), plus the one genuinely-conditional
 * dialog check this module's own analysis (TC-051/GH#66) discovered.
 *
 * Domain-specific dialogs are deliberately NOT here:
 *   - the "Conversation not found" modal and the conversation
 *     delete-confirmation dialog live in `conversation.page.ts` (they carry
 *     conversation-specific content/handles and a fixture lifecycle)
 *   - the Agent/Pipeline entity delete-confirmation dialog and the two
 *     unsaved-changes dialog variants ("Warning" / "Warning Close") live in
 *     `entityForm.page.ts` (already established by the agents/pipelines
 *     modules -- reused here unchanged, not duplicated)
 *
 * This file is only the page/domain-agnostic "any `[role=dialog]` is gone"
 * guard and the welcome-modal conditional check.
 */

/** Every `[role="dialog"]` element currently mounted, page-wide. Only one
 * dialog is ever mounted at a time in this app (confirmed across every
 * modal-handling AFS in this module) -- callers needing a specific dialog's
 * content should scope further (e.g. `page.getByRole('dialog', { name })`),
 * this is the raw "any dialog" locator for count-based guards. */
export function anyDialog(page: Page): Locator {
  return page.getByRole('dialog');
}

/** Standing regression guard: asserts no dialog overlay remains mounted --
 * the "rest state" check used after dismissing any modal in this suite. */
export async function expectNoDialog(page: Page): Promise<void> {
  await expect(anyDialog(page)).toHaveCount(0);
}

/**
 * TC-051/GH#66: this module's analyst could not reproduce a `[role="dialog"]`
 * welcome/onboarding modal for `${TEST_USER}` under any of 3 independently
 * tested conditions (fresh load, page reload, full `localStorage.clear()` +
 * reload) -- the only post-login "welcome-style" overlay is the NON-modal
 * "Announcing ELITEA X.X.X" release-notes banner (`dismissAnnouncementBanner()`
 * in `entityForm.page.ts`), a structurally different element: no dialog
 * role, close-button accessible name is exactly `"close"` (not "Got it" /
 * "Close" / "Start"), and a different persistence key. Kept deliberately
 * separate from that helper per GH#66's own finding -- do not merge them.
 *
 * Defensive/conditional by design, matching the case's own script and the
 * reverse-masking guard (don't force a hard assertion that a dialog exists
 * when the live product's confirmed steady state is that it doesn't):
 * returns `true` if a dialog was present and dismissed, `false` if none
 * appeared. Both are valid outcomes -- this helper itself doesn't assert
 * which branch "should" fire, callers decide what (if anything) to assert
 * about the outcome.
 */
export async function closeWelcomeModalIfPresent(page: Page, timeout = 2_000): Promise<boolean> {
  const dialog = anyDialog(page);
  const present = await dialog.isVisible({ timeout }).catch(() => false);
  if (!present) return false;
  const closeButton = dialog.getByRole('button', { name: /got it|close|start/i });
  await closeButton.click();
  await expect(dialog).toBeHidden();
  return true;
}
