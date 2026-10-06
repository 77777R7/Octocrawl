# Real-site run 2026-10-06: scrapeme.live product page failed as `empty_unverified`

Found in the shop-listing work (PR #225): scrapeme.live's Bulbasaur page, a WooCommerce product page on the Storefront theme, failed on both lanes. This record covers the fix on branch `claude/scrapeme-product-page`.

## Setup

- **Source commits:**
  - `f052375` (origin/main) for "before";
  - `d2027d2` for "after" and the final API runs;
  - `d90170c` (an intermediate commit) has its own lists record.
- **API:** `npm run api` on port 8787, standard mode.
  - Request: `curl --noproxy '*' -X POST localhost:8787/v1/scrape -d '{"url":"<url>","debug":true}'`.
  - The page type is read from the last `extract` event in the trace. "Prices" counts `$` or `£` followed by a digit in the Markdown.
- **Network:** **proxied** through the shell's `HTTPS_PROXY` (127.0.0.1:7890). Every response records `evidence.envProxy: 127.0.0.1:7890`. No direct run was made.
- **When:** 16:56 to 17:24 UTC on 2026-10-05, which is 00:56 to 01:24 on 6 October at UTC+8, the date the record is named by.
- **Raw responses and captures:** `.w2l/parity/2026-10-06-scrapeme-product/` (git-ignored).

## Reproduction at `f052375`

The run asked for `"formats":["markdown","rawHtml"]`.

| Field | Value |
| --- | --- |
| Scrape | `ad133fbc-2680-4eb8-b218-0f303b7ac09e` |
| Result | `failed` / `empty_unverified`, lane `browser_local`, HTTP 200 |
| http lane | `failed` / `empty_unverified`; extract `product`/`article`, confidence 0, escalate; `quality_client_rendered` with reason `script_shell`, textChars 0 |
| browser lane | the same extraction result |

The response's `rawHtml` was `null`. That was not investigated. The cause was found on a `curl` capture of the same URL, made through the proxy earlier the same day (`page.html`, 64 KB).

## Cause

- The page routes as `product` (JSON-LD `Product`), so `pruneRecommendations` runs.
- Its unlabelled-grid trigger (`packages/extract-tf/src/prune.ts`) cuts any container whose children are at least 60% priced, linked cards, at least three of them.
- Storefront's page wrapper `div#page` has five children:
  - the header, with a cart link showing £0.00;
  - the breadcrumb;
  - the content, with the product's price and a reviews link;
  - the footer;
  - a sticky add-to-cart bar, with a link and the price.
- Three of five is 60%, so the wrapper was cut whole, and the page had no text left: `textChars` 0, which also tripped `script_shell`.

## Fix (`d2027d2`)

- A grid's priced cards must include three of one tag.
- Neither the grid trigger nor the id/class trigger cuts the element that holds a page's one h1.

## Tests

The new cases are in `packages/extract-tf/test/product.test.ts`, under "recommendation pruning: precision guards". Each failed before the fix.

| Case | Checks |
| --- | --- |
| A Storefront-shaped page through `extractTf.extract` | `product`, not escalated, description kept, related products still cut |
| The same wrapper with an h2 title | no h1, so the one-tag rule decides |
| Alike `div.row`s | the h1 guard decides |
| A `product recommended` class on the product | the id/class trigger's h1 guard |
| Cards that each carry an h1 | still cut |

Removing any one guard fails one of them.

**Review:** a clean-context review of `d90170c` found no blocker. It noted two kinds of recommendations that now survive:
- cards that each carry an h1, which `d2027d2` cuts again;
- shelves whose cards mix tags (`div` and `article`), left as a known trade-off.

## Offline comparison: 37 captured pages

- **What was read:** the captures of the card-grid survey and the shop-listing record. These are 27 survey pages, 8 product pages and 2 shop listings.
- **How:** each was read by `extractTf.extract` at `f052375` and at `d2027d2`.
- **Result:**
  - Only the Bulbasaur page changed: `product/article`, empty → `product/product`, 1108 characters of `mainHtml`.
  - The other 36 pages have the same page type, strategy and `mainHtml` length.
  - The listings are `all-before.txt` and `bulba-after2.txt` in the raw-response folder.
  - `git diff 136ec27 f052375 -- packages/extract-tf` is empty, so `all-before.txt`, made at `136ec27`, is `f052375`'s reading.

## API runs at `d2027d2`

| URL | Scrape | Result | Page type / strategy / confidence | Markdown | Prices |
| --- | --- | --- | --- | --- | --- |
| https://scrapeme.live/shop/Bulbasaur/ | `ebe9b005-abfb-4f49-afae-0a5021fde6cb` | `success`, http | product / product / 0.6 | 485 | 1 |
| https://scrapeme.live/shop/Ivysaur/ | `6f9547fd-fe9a-4475-a490-9d26e7a91b3c` | `success`, http | product / product / 0.6 | 561 | 1 |
| https://scrapeme.live/shop/Charmander/ | `8ffdf67f-cc08-48a5-8685-783f6df0b464` | `success`, http | product / product / 0.6 | 534 | 1 |
| https://scrapeme.live/shop/ | `5d7ab704-8cd2-4b2b-9dff-ff9be80112cb` | `success`, http | article / article / 1 | 3527 | 16 |
| https://www.scrapingcourse.com/ecommerce/product/abominable-hoodie/ | `083add6e-cb97-41f7-a43b-73bcf5e03bcb` | `success`, http | product / product / 0.6 | 303 | 1 |
| https://www.ikea.com/us/en/p/micke-desk-white-80213074/ | `4a1500f1-a535-4b23-aefd-e68071784bde` | `success`, browser_local | product / product / 0.75 | 15468 | 1 |
| https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | `51d1a560-7e80-4440-b47f-eaa8eccdd742` | `success`, http | product / product / 0.75 | 1586 | 4 |
| https://web-scraping.dev/product/1 | `77473e3f-3e34-4b06-813d-76e9ff704295` | `success`, http | product / article / 0.75 | 2096 | 4 |

- Bulbasaur's Markdown now holds its name, £63.00, its description, "45 in stock", its SKU, categories and tags.
- Ivysaur and Charmander were not run before the fix, so the table does not show that they failed then.
- scrapingcourse.com's product page still yields 303 characters, the same as at `136ec27` in the shop-listing record. It was not investigated.

## Regression batch

`node research/parity/run-sites.mjs --batch lists --record research/parity/runs/<record>`, proxied, passed 8/8 cases and 34/34 checks, with the same page types and strategies as earlier runs:

| Commit | Record |
| --- | --- |
| `d90170c` | `2026-10-06-lists-proxied-d90170c.md` |
| `d2027d2` | `2026-10-06-lists-proxied-d2027d2.md` |
