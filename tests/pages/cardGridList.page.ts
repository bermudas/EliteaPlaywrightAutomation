import { expect, type Locator, type Page } from '@playwright/test';

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

  constructor(private readonly page: Page) {
    this.panel = page.locator('#EliteACustomTabPanel');
    this.cards = this.panel.locator('.MuiCard-root');
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
}
