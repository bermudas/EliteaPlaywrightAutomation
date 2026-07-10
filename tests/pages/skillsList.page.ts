import type { Locator, Page, Response } from '@playwright/test';

/**
 * Skills list page object -- `/app/skills/all`.
 *
 * The search box's contract, confirmed live during ELITEA-1739 implementer
 * Phase 2 exploration (2026-07-10, re-confirming the AFS's own 2026-07-10
 * re-verification pass byte-for-byte), has TWO distinct behaviors sharing
 * the identical `getByRole('textbox', { name: 'search' })` handle already
 * used by `CardGridListPage` for Agents/Pipelines:
 *
 *   1. Typing alone (`fill()`, no Enter) -> opens a floating typeahead
 *      tooltip (`#search-bar-popper`, confirmed live via
 *      `document.getElementById`), suggesting matching skill names. Does
 *      NOT filter the main list/table -- confirmed live: the pagination
 *      footer still read "1 - 3 of 3" while the popper was open and
 *      unsubmitted.
 *   2. Typing + `Enter` -> closes the tooltip AND filters the main
 *      list/table via a `GET .../skills/prompt_lib/{ownerId}?...query=...`
 *      request (confirmed live via `browser_network_requests`) -- this is
 *      the behavior this case (ELITEA-1739) automates. This is THE single
 *      most important interaction detail this AFS flags: `fill()` alone
 *      never filters the main list.
 *
 * NOT built on top of `CardGridListPage`: that class's own
 * `searchAndAwaitResults()` waits for the `/search_options/prompt_lib/`
 * endpoint (the TYPEAHEAD request, confirmed identical in shape across
 * Agents/Pipelines/Skills) -- it has no Enter-triggered, main-list-filter
 * counterpart, which is what THIS case needs. Rather than overloading that
 * already-merged, multi-caller method with a second, differently-triggered
 * wait target (Hard Rule 3's additive-only discipline on a shared file),
 * this dedicated `SkillsListPage` owns the Skills-specific
 * `/skills/prompt_lib/` endpoint and the Enter-key interaction end to end.
 *
 * No confirmed container id exists yet for the Skills list (unlike
 * `#EliteACustomTabPanel` on Agents/Pipelines) -- name/footer locators below
 * are scoped to the page's own `tabpanel` role (confirmed live to wrap both
 * the Card-view grid and the Table-view grid identically) rather than a
 * hardcoded id.
 */
export class SkillsListPage {
  readonly page: Page;
  readonly searchInput: Locator;
  readonly tabpanel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.searchInput = page.getByRole('textbox', { name: 'search' });
    this.tabpanel = page.getByRole('tabpanel');
  }

  /** Table-view pagination footer, e.g. "1 - 2 of 2" -- the AFS's own
   * "single most stable, semantic handle for asserting the filter took
   * effect" (Automation Hints, priority 1). */
  paginationFooter(): Locator {
    return this.page.getByText(/^\d+\s*-\s*\d+ of \d+$/);
  }

  /** Typeahead tooltip that opens while typing, before Enter is pressed
   * (confirmed live: `#search-bar-popper`). Closes once Enter commits the
   * query against the main list. */
  typeaheadPopper(): Locator {
    return this.page.locator('#search-bar-popper');
  }

  /** Generic "No skills yet" empty state -- confirmed live to be reused
   * verbatim for BOTH a genuinely-empty account and a zero-result search
   * (AFS: "reuses the generic ... copy rather than a distinct 'no search
   * results' message" -- a documented UX nit, not a defect; the underlying
   * filter is still correct, this is just the copy). */
  emptyStateText(): Locator {
    return this.page.getByText('No skills yet');
  }

  /** Exact-name lookup scoped to the list's own tabpanel (works in both
   * Card view and Table view, confirmed live). */
  skillName(name: string): Locator {
    return this.tabpanel.getByText(name, { exact: true });
  }

  /**
   * Types `query` into the search box, presses Enter, and waits for the
   * authoritative `GET .../skills/prompt_lib/{ownerId}?...query=<query>...`
   * response that drives the main list's re-render (confirmed live via
   * `browser_network_requests`, matching the AFS's own § Network Behavior
   * finding) -- the network-level confirmation that "filter applied" per
   * the AFS's own Automation Hints (priority 3), used here as the
   * authoritative wait rather than left optional.
   */
  async searchAndSubmit(query: string): Promise<Response> {
    await this.searchInput.fill(query);
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => {
        if (!r.url().includes('/skills/prompt_lib/') || r.status() !== 200) return false;
        const urlQuery = new URL(r.url()).searchParams.get('query') ?? '';
        return urlQuery === query;
      }),
      this.page.keyboard.press('Enter'),
    ]);
    return response;
  }

  /** Clears the search box and presses Enter -- restores the unfiltered
   * list. Also re-triggers the live "at least 3 letters" toast cosmetically
   * (empty query) -- confirmed live the list still correctly restores
   * despite it; callers should not gate a "restored" assertion on that
   * toast's absence, per the AFS's own Automation Hint. */
  async clearAndSubmit(): Promise<Response> {
    return this.searchAndSubmit('');
  }
}
