# The region wait judges the answer's main content too, 2026-10-14

Label: `product`. TASKS item 5 was the risk that a region wait sees the data and the answer does not hold it. One real sample of it turned up in the [ad-blocking A/B](2026-10-14-installed-chrome-blockads-112fd888.md), on T005 (Etsy's home page: "Etsy" and at least five prices), run B3. This record is its diagnosis and the fix.

## The sample

The archived runs of 2026-10-14 have 12 T005 answers that reached the page. In 11, the region wait's count of prices and the answer's are the same. One is not, B3, `2026-10-14T10-28-20-870Z` in `.w2l/access/archive/2026-10-14/blockads-2`:

| | Region wait (live page) | Answer |
| --- | --- | --- |
| Prices | 6, check held, ready at 563 ms, no scroll | 0, verification failed, readiness `not_extracted` |

- **Not the reading after scrolling back to the top.** That run did not scroll. The day's delivery timeline (`research/access/delivery-timeline.mts`) also found the prices still there after scrolling back.
- **The two judged different things.** The region wait judges the Markdown checks on the live page's **whole** HTML (`regionWait.ts`), while the browser lane answers with the page's **main content** (`extractTf.extract`, then `htmlToMarkdown` of `mainHtml`).
- **What happened:** six prices somewhere on that first screen held the check, so the wait ended without scrolling. None of them was in the main content, and the listing below, which loads as it is scrolled to, was never loaded.
- **Not reproduced since.** Four more timeline runs that evening showed Etsy's usual first screen, with no prices anywhere, so the HTML of that variant is not available. Where on the page the six prices were is not known.

## The fix

- `RegionSpec.answerMarkdown`: the browser lane passes its own main-content conversion of the live HTML. It does so unless the request asks for the whole page (`onlyMainContent: false`), a selection (`includeTags`) or a list format, which answer from the whole page.
- **When the answer is judged.** On a read where the whole page holds and would end the wait, the checks are judged again on the answer's Markdown.
  - Held there too, the wait ends.
  - Not held, it goes on, and scrolls, with the answer's counts reported.
  - When the extractor finds no main content, the whole page's verdict stands.
- **Cost.** Review of the first version measured main-content extraction at about 2 s for a 2 MB page and 6.7 s at 4 MB. So:
  - extraction runs only on such reads;
  - its time counts in the read's time, which the wait's deadline allows for;
  - a page past 1 MB keeps the whole page's verdict.
  - Etsy's home page is 0.46 MB after scrolling; extraction takes about 50 ms.
- **Tests:**
  - `browserLocal.test.ts`, `/nav-prices`: six prices in a header's deals strip, the listing's own prices loaded as they come into view. Without the fix, the answer had none of the listing's prices.
  - `regionWait.test.ts`: the tracker judges the answer only on the read the whole page would end on; it fails and goes on with the answer's counts, keeps the whole page's verdict when the answer cannot be told, and does not extract past 1 MB.

## The 16 tasks on `7eef3f9a`

- **Setup:** Clash exit, installed Google Chrome 155.0.8059.40 headed, a grant naming `installed_chrome` alone, `--access '"enhanced"'`.
- **Runs:** `2026-10-14T14-23-47-922Z` and `14-27-42-044Z` (UTC), both `dirty: false`.

| | Run 1 | Run 2 |
| --- | --- | --- |
| Verified | 10 | 11 |
| False success | 0 | 0 |
| T005 | ✓ (scrolled 2 screens) | ✓ (scrolled 2 screens) |
| Not verified, all blocked | T001, T038, T045, T046, T068, T071 | T001, T038, T045, T046, T068 |
| p50 / p95 ms | 12969 / 25427 | 8832 / 23803 |

- **Every answer that reached its page passed its verification.** The region wait was ready in 0.5–5 s on each, so the extra check made no wait longer.
- **Every task not verified was blocked before any region wait,** which the change cannot touch.
  - T001's block is the one seen all evening: Cloudflare's challenge cleared, then a 403 asking the visitor to "verify you are human" ([CDP-session record](2026-10-14-installed-chrome-cdp-session-aca819b8.md)).
  - The afternoon's 12 and 13 against these 10 and 11 is the same evening drop that record shows for an unchanged configuration (47 to 35 of 64).
- **Real-site batch L:** 12/12 cases, 85/85 checks.
- **The full test suite:** 234 files and 2868 tests passed.

## Not shown

- The variant that produced the sample, after the fix. It has not been seen again.
- The provider lanes (`vendors/cdp.ts`, `provider.ts`) and the my-browser lane, which keep judging the whole page.
