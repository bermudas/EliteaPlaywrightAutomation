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

  /**
   * [Added during the `lazy-loading` module batch, TC-065/TC-066] "Toolkits: N"
   * sidebar badge -- same regex/parse pattern as `totalCountBadge()`/
   * `pipelinesTotalCountBadge()`. Confirmed live this is actually the
   * account/author-profile stats widget (`GET .../author/prompt_lib/{id}`'s
   * `total_toolkits` field), not a footer badge scoped to
   * `#EliteACustomTabPanel` like the other two -- but it resolves via the
   * identical `page`-level text-regex locator either way, and every caller
   * in this module only ever uses it for an `expect.soft()` comparison
   * against the network `total` (GH#88: this badge is confirmed to drift --
   * over-counts by 1 for Toolkits, under-counts by 1 for the Agents badge
   * above -- never the pass/fail oracle).
   */
  toolkitsTotalCountBadge(): Locator {
    return this.page.getByText(/^Toolkits:\s*\d+/);
  }

  async toolkitsTotalCount(): Promise<number> {
    const text = (await this.toolkitsTotalCountBadge().textContent()) ?? '';
    const match = text.match(/(\d+)/);
    if (!match) {
      throw new Error(`Expected "Toolkits: N" badge text to contain a number, got: "${text}"`);
    }
    return Number(match[1]);
  }

  /**
   * [Added during the `lazy-loading` module batch, TC-060/061/065/066]
   * Waits for the NEXT response matching `urlContains` (scoped further by
   * the caller -- e.g. `'agents_type=classic'`, `'agents_type=pipeline'`,
   * or the bare `/tools/prompt_lib/` path for Toolkits, a different URL
   * family entirely from Agents/Pipelines' `/applications/prompt_lib/`) and
   * returns its `.total` field -- the AUTHORITATIVE count source per GH#88
   * (the sidebar "Agents: N"/"Toolkits: N" badges are backed by a stale
   * cached author-stats endpoint that can drift +/-1 from the true list
   * total). This is the raw building block behind `gotoAndCaptureTotal()`
   * and `scrollUntilExhausted()` below; exposed directly for callers that
   * need to race it against their own triggering action that isn't a plain
   * `page.goto()` (e.g. TC-061's project-scope combobox switch).
   *
   * [PR #94 R1 fix, 2026-07-03] Default widened 15_000 -> 30_000. Reviewer
   * reproduced a hard `TimeoutError` on this exact wait 3/3 times (called
   * via `gotoAndCaptureTotal()` from TC-060's first Agents-list navigation)
   * against this account's now-200+-agent volume. TC-064's own settle-wait
   * (this same module, `tests/lazy-loading.spec.ts` step 5) already
   * documents real live-backend settle times up to 30s+ under load and uses
   * an explicit `{ timeout: 30_000 }` for exactly that reason -- 15s was
   * simply undersized for this account's current real data volume, not a
   * concurrency artifact. 30_000 matches that project-wide precedent
   * instead of inventing a different ceiling.
   */
  async waitForListTotal(urlContains: string, timeout = 30_000): Promise<number> {
    const response = await this.page.waitForResponse(
      (r) => r.url().includes(urlContains) && r.status() === 200,
      { timeout },
    );
    const body = await response.json();
    if (typeof body.total !== 'number') {
      throw new Error(
        `Expected a response matching "${urlContains}" to include a numeric "total" field, got: ${JSON.stringify(body)}`,
      );
    }
    return body.total;
  }

  /**
   * Navigates to `url` and captures the `.total` field from the first
   * response matching `urlContains` that fires as a result -- the "read the
   * expected count from the network, not the UI badge" step every
   * lazy-loading AFS in this module opens with.
   *
   * [PR #94 R1 fix, 2026-07-03] Default widened 15_000 -> 30_000, matching
   * `waitForListTotal()`'s own fix above. This is the actual failing call
   * path the reviewer reproduced (TC-060's `gotoAndCaptureTotal()` ->
   * `waitForListTotal()`) -- this wrapper's own default must move in lock
   * step with the underlying method's, since it passes `timeout` straight
   * through and every current call site (TC-060/TC-063/TC-065/TC-066)
   * relies on the default rather than passing an explicit value.
   */
  async gotoAndCaptureTotal(url: string, urlContains: string, timeout = 30_000): Promise<number> {
    const [total] = await Promise.all([this.waitForListTotal(urlContains, timeout), this.page.goto(url)]);
    return total;
  }

  /**
   * Scroll-until-exhaustion loop (TC-060's own re-authored Test Step 6: the
   * case's literal "single scroll cycle" assumption does not scale to this
   * account's real data volume -- Agents alone needs ~9-10 cycles). Repeats
   * scroll-to-bottom + wait-for-next-page until EITHER no new response
   * matching `urlContains` fires within `perScrollTimeout` (the list is
   * exhausted -- confirmed live this app fires exactly one page per
   * scroll-to-bottom action, never batches multiple) OR the card count
   * stops growing between two consecutive scrolls, whichever comes first.
   *
   * Returns the `.total` read from the LAST matching response actually
   * observed (falling back to the caller-supplied `initialTotal` if no
   * further page ever fires -- e.g. Pipelines/Toolkits at this account's
   * current volume, which fit entirely on the initial mount page). This is
   * the temporally freshest total available for this list at the point the
   * loop returns -- satisfying every lazy-loading AFS's "assert against a
   * freshly re-read total, not a value captured earlier in this same test"
   * finding (GH#81/GH#82: this shared, concurrently-mutated account's
   * counts can drift mid-run) without forcing an extra page reload just to
   * re-derive a number.
   *
   * [PR #94 R1 fix, 2026-07-03 -- tried and reverted, see below]
   * `perScrollTimeout` stays at its original 10_000 default. First attempt
   * at this fix widened it to 30_000 (same reasoning as `waitForListTotal()`
   * above: a timeout here is swallowed via `.catch(() => undefined)`, so
   * the theoretical risk isn't a hard failure but a silent WRONG result --
   * two consecutive genuinely-slow-not-exhausted responses both missing the
   * window would read as "no growth" and end the loop early). That widening
   * was reverted after R1 verification: it multiplies out across up to 20
   * iterations x 2 required consecutive-stable reads, and directly caused a
   * NEW regression -- TC-065/TC-066 (which each chain 3 full
   * list-exhaustion passes) blew their own outer `test.setTimeout()` budget
   * (150s/180s) with the browser torn down mid-`scrollUntilExhausted`,
   * confirmed via a fresh `Test timeout ... exceeded` +
   * `locator.count: Target page ... has been closed` in
   * `pollCardCountBeyond()`, where none had existed before. The theoretical
   * under-count risk this was meant to close is narrower in practice than
   * the regression it caused, and the original 10_000 value already ships
   * with its own proven mitigation for this account's exact volatility
   * class (the two-consecutive-stable-reads design immediately below,
   * root-caused and verified against GH#81 in the original PR at this same
   * 10_000 value) -- so the fix for the reviewer's actual reported finding
   * lives in `waitForListTotal()`/`gotoAndCaptureTotal()` (fired once per
   * navigation, not in a bounded retry loop) rather than here.
   */
  async scrollUntilExhausted(
    urlContains: string,
    initialTotal: number,
    perScrollTimeout = 10_000,
    maxIterations = 20,
  ): Promise<number> {
    let total = initialTotal;
    // Requires TWO consecutive no-growth reads (not just one) before
    // declaring exhaustion. Root-caused during implementation (a single-
    // stable-read version flaked on the live Agents list, GH#81's own
    // documented volatility): a per-scroll `waitForListTotal` can time out
    // on a real, merely-slow-not-absent response (this shared account's
    // fetch latency varies) -- if the DOM hasn't yet reflected that
    // still-in-flight response, count stays unchanged for THIS iteration,
    // which a single-read check would misread as "exhausted." Giving the
    // loop one more scroll+wait cycle lets a late-arriving page actually
    // land before the loop commits to being done.
    let stableStreak = 0;
    for (let i = 0; i < maxIterations && stableStreak < 2; i++) {
      const beforeCount = await this.cardCount();
      const waitPromise = this.waitForListTotal(urlContains, perScrollTimeout).catch(() => undefined);
      await this.scrollToBottom();
      const nextTotal = await waitPromise;
      if (nextTotal !== undefined) total = nextTotal;
      // A resolved network response does not guarantee React has already
      // committed the new cards to the DOM -- root-caused during
      // implementation: reading `cardCount()` exactly once, immediately
      // after the response promise resolved, intermittently caught the DOM
      // one render tick behind a response that HAD already delivered new
      // rows, misreading genuine (still-arriving) growth as "stable" and
      // exhausting 1-2 iterations early. Polling briefly for the count to
      // move past `beforeCount` (bounded, short-interval) closes that race
      // without a fixed blind sleep -- it returns immediately once the DOM
      // catches up, and simply reports the unchanged count if it genuinely
      // never grows (a real end-of-list case).
      const afterCount = await this.pollCardCountBeyond(beforeCount, 3_000);
      stableStreak = afterCount === beforeCount ? stableStreak + 1 : 0;
    }
    return total;
  }

  /**
   * Polls `cardCount()` until it moves past `previous` or `timeoutMs`
   * elapses -- exposed (not private) so callers driving their own manual
   * scroll-and-check sequence (e.g. TC-067's stale-element check, which
   * needs the raw before/after counts rather than `scrollUntilExhausted()`'s
   * aggregate loop) get the same DOM-catch-up race protection documented on
   * `scrollUntilExhausted()` above, instead of re-deriving it.
   */
  async pollCardCountBeyond(previous: number, timeoutMs: number): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    let current = await this.cardCount();
    while (current === previous && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      current = await this.cardCount();
    }
    return current;
  }
}
