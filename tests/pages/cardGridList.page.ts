import { expect, type Locator, type Page, type Response } from '@playwright/test';

/**
 * Shared page object for the lazy-loaded card-grid list pattern used by both
 * the Agents list (`/app/agents/all`, TC-003) and the Pipelines list
 * (`/app/pipelines/all`, TC-004).
 *
 * Extraction rationale: both AFS files (test-specs/smoke/l1_navigate-to-agents-list_TC-003.md,
 * test-specs/smoke/l1_navigate-to-pipelines-list_TC-004.md) independently flagged this exact
 * shared pattern per `.agents/testing.md` § Structure's "add a page object the
 * first time a locator block repeats 3+ times" rule. Implementer Phase 2
 * exploration (2026-07-02, against the live app) confirmed the two pages
 * render into the IDENTICAL `#EliteACustomTabPanel` container (same DOM id on
 * both routes) with `.MuiCard-root` card children -- so this is one real
 * repeated pattern, not two similar-looking ones.
 *
 * Neither card type exposes a `role`, `aria-label`, or `data-testid` --
 * flagged by the respective analysts as GH#12 (agents) / GH#13 (pipelines),
 * recommending the product team add a `data-testid` to the card root. Until
 * then, `.MuiCard-root` scoped to `#EliteACustomTabPanel` is the most stable
 * handle confirmed live (locator-ladder stop+flag case, per
 * `.agents/testing.md` § Locator strategy) -- this is a deliberate deviation
 * from each AFS's own "Recommended Locator" for card counting: TC-004's AFS
 * recommended `[role="tabpanel"] > div > div`, which Phase 2 exploration
 * found matches 2 elements against the live single-pipeline account (the
 * real card AND an unrelated filter-sidebar text node), not 1 -- a strict
 * count/first() assertion elsewhere would have silently kept passing while
 * counting the wrong thing. `.MuiCard-root` matched exactly the card in both
 * cases and works identically for TC-003 (agents), where it was already the
 * AFS's own primary recommendation.
 */
export class CardGridListPage {
  readonly panel: Locator;
  readonly cards: Locator;
  /** Confirmed handle, established by the `agents` module batch
   * (TC-015/TC-019) -- the list/grid page's own search box. */
  readonly searchInput: Locator;

  constructor(private readonly page: Page) {
    this.panel = page.locator('#EliteACustomTabPanel');
    this.cards = this.panel.locator('.MuiCard-root');
    this.searchInput = page.getByRole('textbox', { name: 'search' });
  }

  /**
   * Waits for a `GET .../applications/prompt_lib/...` list response matching
   * the given URL substring (e.g. `agents_type=classic`) to return 200,
   * where the response's own `offset` query param is >= `offsetAtLeast`.
   * Using ">=" rather than an exact hardcoded offset makes this robust to
   * how many pages already auto-loaded on mount (viewport-dependent -- see
   * TC-003 AFS § Network Behavior: a tall viewport can auto-fire a second
   * page with no scroll interaction at all).
   */
  async waitForNextPageResponse(
    urlContains: string,
    offsetAtLeast: number,
    timeout = 10_000,
  ): Promise<void> {
    await this.page.waitForResponse((response) => {
      if (!response.url().includes('/applications/prompt_lib/')) return false;
      if (!response.url().includes(urlContains)) return false;
      if (response.status() !== 200) return false;
      const offsetMatch = response.url().match(/offset=(\d+)/);
      return !!offsetMatch && Number(offsetMatch[1]) >= offsetAtLeast;
    }, { timeout });
  }

  async waitForFirstCard(timeout = 10_000): Promise<void> {
    await expect(this.cards.first()).toBeVisible({ timeout });
  }

  async cardCount(): Promise<number> {
    return this.cards.count();
  }

  async scrollToBottom(): Promise<void> {
    await this.panel.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
  }

  async scrollToTop(): Promise<void> {
    await this.panel.evaluate((el) => {
      el.scrollTop = 0;
    });
  }

  async scrollTop(): Promise<number> {
    return this.panel.evaluate((el) => el.scrollTop);
  }

  /**
   * `[role="progressbar"]` / `[aria-busy="true"]` -- confirmed via Phase 2
   * exploration NOT to be scoped to the panel (they can render at the page
   * level during the transient loading phase), so this is intentionally a
   * page-level locator, not `this.panel`-scoped.
   */
  loadingIndicators(): Locator {
    return this.page.locator('[role="progressbar"], [aria-busy="true"]');
  }

  firstCard(): Locator {
    return this.cards.first();
  }

  /**
   * Added during the `agents` module batch (TC-012/TC-013/TC-015/TC-019) --
   * the third+ spec needing "find/click a specific card by name," after
   * TC-003/TC-004's count-only usage. Clicking the outer `.MuiCard-root`
   * locator (rather than a specific inner cursor:pointer child) is
   * confirmed live to navigate correctly -- Playwright's `.click()`
   * dispatches at the element's center point, and the browser's own hit
   * testing resolves to whichever inner element actually covers that
   * point, which is the card's real click target in this app.
   */
  cardByName(name: string): Locator {
    return this.cards.filter({ hasText: name });
  }

  async clickCardByName(name: string): Promise<void> {
    await this.cardByName(name).click();
  }

  /**
   * "Agents: N" footer badge -- same handle TC-003/PR #15 established,
   * extracted here now that a third+ case (TC-015, TC-019) needs the
   * parsed count, not just the raw text locator (Hard Rule 7's
   * third-repetition threshold for extraction).
   */
  totalCountBadge(): Locator {
    return this.page.getByText(/^Agents:\s*\d+/);
  }

  async totalCount(): Promise<number> {
    const text = (await this.totalCountBadge().textContent()) ?? '';
    const match = text.match(/(\d+)/);
    if (!match) {
      throw new Error(`Expected "Agents: N" badge text to contain a number, got: "${text}"`);
    }
    return Number(match[1]);
  }

  /**
   * Types into the list's search box and waits for the authoritative
   * `GET .../search_options/prompt_lib/{ownerId}?query=...` response
   * (confirmed live, TC-015/TC-019 -- debounced ~1s from the keystroke).
   * Callers use the returned response body's `application.total`/`.rows`
   * as a race-free, concurrency-immune "does an agent with this name
   * exist" check -- stronger than a DOM card-count/badge diff in this
   * shared, concurrently-mutated test account.
   *
   * Matches the response's own `query=` param against the search string
   * (not just any `search_options` response) -- this endpoint also fires
   * with an EMPTY query on page mount/re-mount, and without this check a
   * `waitForResponse` racing against that earlier in-flight request would
   * resolve to the wrong response (confirmed live: an implementer-run
   * without this filter matched the mount-time full-account response,
   * `application.total: 213`, instead of the actual zero-result search).
   */
  async searchAndAwaitResults(query: string): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse((r) => {
        if (!r.url().includes('/search_options/prompt_lib/') || r.status() !== 200) return false;
        const urlQuery = new URL(r.url()).searchParams.get('query');
        return urlQuery === query;
      }),
      this.searchInput.fill(query),
    ]);
    return response;
  }

  /**
   * Confirmed live (2026-07-02, implementer Phase 2 exploration) as the
   * literal empty-state text when a search matches zero agents -- see
   * `tests/agents.spec.ts` TC-019 for a case where the AFS's own stated
   * text ("No agents yet") did not match this live-verified contract and
   * was corrected via a `docs(afs)` amendment (reverse-masking guard).
   */
  noAgentsMatchText(): Locator {
    return this.page.getByText('No Agents Match');
  }

  /**
   * [Added during the `pipelines` module batch, TC-025/TC-029] "Pipelines: N"
   * footer badge -- same pattern as `totalCountBadge()`/`totalCount()`
   * above, just for the Pipelines list's own label. Kept as separate
   * methods rather than parametrizing the existing Agents-labelled ones --
   * Hard Rule 3 additive-only discipline on this already-merged,
   * multi-caller shared page object (`tests/agents.spec.ts`'s TC-015/TC-019
   * already depend on `totalCountBadge()`/`totalCount()` exactly as
   * written).
   */
  pipelinesTotalCountBadge(): Locator {
    return this.page.getByText(/^Pipelines:\s*\d+/);
  }

  async pipelinesTotalCount(): Promise<number> {
    const text = (await this.pipelinesTotalCountBadge().textContent()) ?? '';
    const match = text.match(/(\d+)/);
    if (!match) {
      throw new Error(`Expected "Pipelines: N" badge text to contain a number, got: "${text}"`);
    }
    return Number(match[1]);
  }

  /**
   * [Added during the `pipelines` module batch, TC-025/TC-029] Literal
   * empty-state text when a search matches zero pipelines -- confirmed live,
   * same UX pattern as `noAgentsMatchText()` above but for the Pipelines
   * list's search box (renders inside the search-suggestion dropdown, not
   * the main card grid -- the grid does not live-filter on typed input,
   * confirmed by TC-025).
   */
  noPipelinesMatchText(): Locator {
    return this.page.getByText('No Pipelines Match');
  }
}
