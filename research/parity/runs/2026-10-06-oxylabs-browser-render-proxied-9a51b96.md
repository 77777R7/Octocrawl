# Real-site run 2026-10-06: sandbox.oxylabs.io product pages rendered by the browser for nothing

Follows [2026-10-06-oxylabs-product-proxied-f323f65.md](2026-10-06-oxylabs-product-proxied-f323f65.md).

## The problem

At `f323f65` sandbox.oxylabs.io's product pages route as `product`, with only the product in their Markdown. The http lane, though, offered each page to the browser lane, which rendered the same answer again in 2.7 to 4.3 seconds.

This record covers the further commits on the same branch (`claude/oxylabs-product-page`, PR #231).

## Setup

- **Source commits:**
  - `437d500` (the branch before this work) for "before";
  - `9a51b96` for "after" and the final API runs.
  - The intermediate commits `180a462`, `181687c`, `603d71d` and `e638fbd` are listed under Review and have their own lists records.
- **API:** `npm run api` on port 8787, standard mode.
  - Request: `curl --noproxy '*' -X POST localhost:8787/v1/scrape -d '{"url":"<url>","debug":true}'`.
  - The page type is read from the last `extract` event in the trace.
- **Network:** **proxied** through the shell's `HTTPS_PROXY` (127.0.0.1:7890). Every response records `evidence.envProxy: 127.0.0.1:7890`. No direct run was made.
- **When:** 02:54 to 03:48 UTC on 2026-10-06.
- **Raw responses and corpus results:** `.w2l/parity/2026-10-06-oxylabs-browser-render/` (git-ignored).

## Cause, at `f323f65`

On https://sandbox.oxylabs.io/products/1 (scrape `811146fa-9a9c-4410-8132-d1bff092ad8d` in the earlier record), the http lane raised two quality events:

- **`quality_low_yield`:** 135 tokens at confidence 0.22. The extractor's confidence is the share of the page's text blocks inside the product region: 2 of 9. The other seven are the sidebar's short, unlinked platform entries. The rule offers any answer of 200 tokens or less at 0.3 or less.
- **`quality_client_rendered`, `hydration_shell`:** 832 characters of text beside 2552 of inline script, with a `__NEXT_DATA__` block.
  - The text is measured after a product page's recommendations are cut. Here the two related games are cut, and before the cut the page has 1912 characters.
  - The data block holds the product's description and both related games' blurbs, all of them shown in the HTML.

## Fix (`9a51b96`)

**`productShown`.** A page is `productShown` when all of these hold:
- the router found it a product page by its visible buy box (`RouteDecision.buyBox`, new);
- its region holds an `h1` or `h2` and shows the price;
- its region holds a non-heading text block of 150 characters or more.

**Confidence floor.** A `productShown` page gets a floor of 0.45, above the low-yield ceiling of 0.3.

**Shell check.**
- Hydration JSON passages are collected in `rawSignals`: strings of 80 characters or more in eight or more words, from `__NEXT_DATA__` and application/json blocks.
- `hydration_shell` is skipped only when the page is `productShown` and the page as received shows every one of those passages.
- Every other page keeps main's rule.
- The shell check still runs after the cut, as on main.

## Review

A clean-context review ran five rounds on this work; each finding below is now a test case in `packages/extract-tf/test/route.test.ts`, under "a Next.js product page titled by its one h2, beside related products it cuts".

| Commit reviewed | Finding |
| --- | --- |
| `180a462` (shell check moved before the cut, floor for any buy-box region) | A product page whose description is drawn by script, in `__NEXT_DATA__` only, lost both offers to the browser. |
| `181687c` (floor needs a non-heading block) | A store's one-line delivery or returns notice satisfied it. |
| `603d71d` (block of 150 characters or more) | Moving the shell check before the cut hid a script-drawn description beside three short feature bullets, which kept confidence above 0.3 by themselves. |
| `e638fbd` (check moved back; `hydration_shell` skipped when the page shows all its JSON's passages) | That skip applied to every page: a Next.js article whose rates arrive by a later fetch shows all its JSON holds, since the JSON never held the rates. |
| `9a51b96` | No blocker. |

At `e638fbd` the person who asked chose the narrow version over keeping the browser render or keeping the page-wide rule.

**Accepted residual:** on a `productShown` page that shows all its JSON passages, secondary data that arrives by a later fetch (reviews, for example) is not looked for, and the page stays on the http lane without it. Passages beyond the first 200 are not checked either; that too can only happen on such a page.

## Tests

| Case | Expected |
| --- | --- |
| The oxylabs shape | no shell; confidence above 0.3 |
| Description in the data only: alone, beside three bullets, beside a delivery line, beside a returns line | `hydration_shell`, or confidence 0.3 or less |
| A data block holding a specification the page does not show | `hydration_shell` |
| A microdata-routed shop listing | no floor |
| A thin Next.js article whose data it shows | `hydration_shell` |
| A Next.js shell | `hydration_shell` |
| http lane, `packages/bench/test/resilientHttp.integration.test.ts` | `success` with no warnings and no quality events |

The http-lane test failed on `437d500`'s `extract.ts`. Removing any one condition fails one of these tests.

## Comparison: 184 saved pages

- **What was read:** the 120 Amazon pages under the main checkout's `.w2l/amazon-baseline/raw/` with a `/dp/` URL, 55 `.w2l/parity` captures, and the oxylabs and product-page captures.
- **How:** each was read by `extractTf.extract` at `437d500` and with `9a51b96`'s code, comparing Markdown, `render.reason`, confidence and page type.
- **Result:** only the oxylabs product page changed (three copies of the same capture).
  - Its confidence went from 0.22 to 0.45, and `hydration_shell` became none.
  - Its Markdown is unchanged.
- **Results:** `fl-before.json` and `fl-after6.json` in the raw-response folder.

## API runs at `9a51b96`

| URL | Scrape | Result | Page type / strategy / confidence | Markdown | Warnings | Lanes tried | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| https://sandbox.oxylabs.io/products/1 | `96f58c8e-09a4-420f-87aa-04d1d3d2c571` | `success`, http | product / product / 0.45 | 539 | none | http | 1683 |
| https://sandbox.oxylabs.io/products/20 | `2daf3dd1-152a-48d9-ad97-770edf5b7933` | `success`, http | product / product / 0.45 | 476 | none | http | 473 |
| https://sandbox.oxylabs.io/products/1836 | `d26933ec-c615-4c7e-b246-f885566b2d65` | `success`, http | product / product / 0.45 | 701 | none | http | 479 |
| https://sandbox.oxylabs.io/products | `5486a316-e7d0-4664-9963-31d13fa27662` | `success`, http | article / article / 1 | 24262 | none | http | 572 |
| https://sandbox.oxylabs.io/products/category/nintendo | `027c8bc5-73e4-4208-ac63-038cb658e84d` | `success`, http | article / article / 1 | 25131 | none | http | 575 |
| https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | `056b0498-0d31-41be-80e0-59ff66b27b3e` | `success`, http | product / product / 0.75 | 1586 | none | http | 2537 |
| https://web-scraping.dev/product/1 | `a322fcc9-4b76-4a80-8229-7ff4ac0a2832` | `success`, http | product / article / 0.75 | 2096 | none | http | 2250 |
| https://webscraper.io/test-sites/e-commerce/allinone/product/60 | `75c01807-4fef-4d2f-836d-b42275abf11b` | `success`, http | product / product / 0.6 | 241 | `client_rendered_suspected`, `low_content_yield` | http, browser_local | 5122 |
| https://www.scrapingcourse.com/ecommerce/ | `bb51bf17-3b36-49bf-8d04-23109182e9f3` | `success`, http | product / product / 0 | 307 | `robots_overridden`, `client_rendered_suspected`, `low_content_yield` | http, browser_local | 9823 |

- **oxylabs product pages:** answered on the http lane alone, with the same Markdown lengths as the browser lane's answers at `f323f65` (585, 522, 748 there; the http and browser captures differ by a few characters). Their wall times were 4291, 2735 and 2707 ms at `f323f65`, from that record's raw responses, and are 1683, 473 and 479 ms here.
- **webscraper.io:** its warnings are fixed separately on #228, not on this branch.
- **scrapingcourse.com's shop:** its misrouting is fixed separately on #225, not on this branch. It keeps its warnings here, as on main.

## Regression batch

`node research/parity/run-sites.mjs --batch lists --record research/parity/runs/<record>`, proxied:

| Commit | Record | Result |
| --- | --- | --- |
| `180a462` | `2026-10-06-lists-proxied-180a462.md` | 8/8 |
| `181687c` | `2026-10-06-lists-proxied-181687c.md` | 8/8 |
| `603d71d` | `2026-10-06-lists-proxied-603d71d.md` | 7/8: LS02 (https://quotes.toscrape.com/js/, a pagination-actions case) failed with `action_failed` on the browser lane |
| `e638fbd` | `2026-10-06-lists-proxied-e638fbd.md` | 8/8 |
| `9a51b96` | `2026-10-06-lists-proxied-9a51b96.md` | 8/8 |

- The commits between `603d71d` and the next run do not touch the actions code, and LS02 passed in both later runs.
- That failure is recorded as it happened and was not investigated further.
- In the passing runs, the cases' page types and strategies match earlier runs.
