import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Minimal page object for the Artifacts bucket/file browser
 * (`/app/artifacts` -- **not** `/app/artifacts/all`, which 404s, see GH#90).
 *
 * Structurally distinct from `cardGridList.page.ts`'s `#EliteACustomTabPanel`
 * / `.MuiCard-root` grid pattern -- this is a two-pane bucket-rail + file-
 * panel layout with its own `data-testid` namespace (`artifacts-*`) that
 * shares nothing with the card grid. Confirmed live during TC-062's analysis
 * (`test-specs/lazy-loading/l3_empty-vs-loading-state_TC-062.md`).
 *
 * Deliberately minimal per `.agents/testing.md` § Structure's own plan: the
 * `artifacts` module (next after `lazy-loading`) will grow this substantially
 * (upload/preview/download/delete). This file covers exactly what TC-062
 * needs -- the bucket list, the empty/loading states, and the toolbar upload
 * control -- and nothing speculative beyond that.
 */
export class ArtifactsPage {
  readonly page: Page;
  readonly bucketsHeading: Locator;
  readonly emptyState: Locator;
  readonly uploadButtonToolbar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.bucketsHeading = page.getByTestId('artifacts-buckets-heading');
    this.emptyState = page.getByTestId('artifacts-empty-state');
    this.uploadButtonToolbar = page.getByTestId('artifacts-upload-files-button');
  }

  /**
   * Both loading cues are plain text nodes with zero ARIA semantics (no
   * `role="status"`/`aria-busy`/`aria-live` -- filed as GH#85, a genuine but
   * non-blocking accessibility gap). The window is short-lived (~1-1.2s
   * once it appears) -- callers should not gate a hard wait on either being
   * *present* (timing-sensitive under CI load); prefer waiting on the
   * *resolved* state (`emptyState` below) or on the underlying
   * `/artifacts/s3/{bucket}` network response instead.
   */
  loadingTextBucketRail(): Locator {
    return this.page.getByText('Loading files...');
  }

  loadingTextMainPanel(): Locator {
    return this.page.getByText('Loading...', { exact: true });
  }

  /** Standard progressbar/aria-busy/class-based loading indicators --
   * confirmed live to match 0 elements at any point on this page (the app
   * communicates loading via the plain-text nodes above instead). Included
   * so a test can assert the case's own proposed selectors are genuinely
   * absent (GH#84 case-text drift), not just that ours are the real ones. */
  standardLoadingIndicators(): Locator {
    return this.page.locator('[role="progressbar"], [aria-busy="true"], .loading, .spinner');
  }

  async waitForEmptyState(timeout = 10_000): Promise<void> {
    await expect(this.emptyState).toBeVisible({ timeout });
  }

  /** A bucket-rail row, matched by its own name -- no `data-testid`/`role`/
   * accessible name exists on these rows (same handle-gap pattern as the
   * card grid, GH#12/#13-family) -- text match is the confirmed floor.
   *
   * Scoped to the bucket rail's own container (the nearest common ancestor
   * of `bucketsHeading` and the rail rows, confirmed live via direct DOM
   * inspection) -- an UNSCOPED text match is confirmed to also hit a
   * SECOND, unrelated element: once a bucket is selected, the main file
   * panel renders its own `MuiTypography-headingSmall` heading with the
   * identical bucket name text, which a bare `getByText(name, { exact:
   * true })` would ambiguously match too (Playwright strict-mode
   * violation, 2 elements). No stable testid exists on this scoping
   * container either (same Locator Ladder stop+flag as the rows
   * themselves) -- the 3-parent-level xpath walk up from `bucketsHeading`
   * is the confirmed-live floor.
   */
  bucketRow(name: string): Locator {
    return this.bucketsHeading.locator('xpath=../../..').getByText(name, { exact: true });
  }

  async selectBucket(name: string): Promise<void> {
    await this.bucketRow(name).click();
  }

  /** The second "Upload files"-named button, rendered only inside the
   * empty-state panel body when the selected bucket has 0 files -- scoped
   * off `emptyState`'s own container to disambiguate from the always-visible
   * toolbar button above (both share the identical accessible name). */
  uploadButtonInEmptyState(): Locator {
    return this.emptyState.locator('..').getByRole('button', { name: 'Upload files' });
  }

  /** "Buckets: N" rail summary -- renders as two text nodes ("Buckets:" then
   * the digit on its own line), so this matches with a regex spanning both
   * rather than an exact-equality `.textContent()` check. */
  bucketsCountText(): Locator {
    return this.page.getByText(/Buckets:\s*\d+/);
  }
}
