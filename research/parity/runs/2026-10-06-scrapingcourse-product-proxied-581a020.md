# Real-site run 2026-10-06: scrapingcourse.com product page gave 303 characters

Found in the shop-listing work (PR #225): scrapingcourse.com's WooCommerce product page returned `success` with 303 characters of Markdown. This record covers the fix on branch `claude/scrapingcourse-product-page`.

## Setup

- **Source commits:**
  - `f052375` (origin/main) for "before";
  - `581a020` for "after" and the final API runs;
  - `8f1a2e7` (an intermediate commit, see Review) has its own lists record.
- **API:** `npm run api` on port 8787, standard mode.
  - Request: `curl --noproxy '*' -X POST localhost:8787/v1/scrape -d '{"url":"<url>","debug":true}'`.
  - The page type is read from the last `extract` event in the trace.
- **Network:** **proxied** through the shell's `HTTPS_PROXY` (127.0.0.1:7890). Every response records `evidence.envProxy: 127.0.0.1:7890`. No direct run was made.
- **When:** 17:32 to 17:54 UTC on 2026-10-05, which is 01:32 to 01:54 on 6 October at UTC+8, the date the record is named by.
- **Raw responses and captures:** `.w2l/parity/2026-10-06-scrapingcourse-product/` (git-ignored).

## Reproduction at `f052375`

| Field | Value |
| --- | --- |
| URL | https://www.scrapingcourse.com/ecommerce/product/abominable-hoodie/ |
| Scrape | `fd532c04-d7ac-427d-8825-23ff7cb59463` |
| Result | `success`, http, `product`/`product`, confidence 0.6, 303 characters, with a `robots_overridden` warning |

The Markdown held the title, $69.00, the one-line excerpt, the variation picker's empty Size/Color table, the SKU and the category.

The page itself, in a `curl` capture made through the proxy the same day, also shows:
- a **Description** tab: a paragraph and four bullets;
- an **Additional information** tab: Size XS–XL, Color Blue/Green/Red.

Neither was in the Markdown.

## Cause

- `selectProduct` (`packages/extract-tf/src/product.ts`) takes the lowest common ancestor of the h1 and the price: WooCommerce's `div.summary`.
- It keeps that region when the region already holds a text block. Otherwise it widens to the nearest ancestor that holds one.
- The summary holds the variation picker. After cleaning, the picker is a table of `<th><label for="size">Size</label></th>` cells: the selects are removed, the labels kept.
- Table cells count as blocks from 5 characters, so "Color" passed for a description. The region stayed `div.summary`, without the tabs beside it in `div.product`.

## Fix (`581a020`)

A block counts as describing the product unless all its text is the labels of form controls. With only the picker in the summary, the region widens to `div.product`, which holds the tabs. The related products are already pruned at that point.

## Review

- The first version, `8f1a2e7`, set aside every block under 25 characters.
- A clean-context review found that this also set aside a buy box's own short description, so the region widened into the page column. Its examples were short bullets, a short spec table and short CJK prose.
- `581a020` replaced the cutoff with the label rule. Those three cases are a test, and a re-review found nothing blocking.

## Tests

The new cases are in `packages/extract-tf/test/product.test.ts`, under "PDP region selection". Both failed before their fix.

| Case | Checks |
| --- | --- |
| A WooCommerce-shaped page: summary with variation picker, tabs, related products, header cart | description and attributes kept; related products and cart left out |
| The three short-description buy boxes | the content beside them is left out |

Counting labels again fails the first.

## Offline comparison: 37 captured pages

- **What was read:** the captures of the card-grid survey and the shop-listing record. These are 27 survey pages, 8 product pages and 2 shop listings.
- **How:** each was read by `extractTf.extract` at `f052375` and at `581a020`.
- **Result:**

  | Page | `mainHtml` before | `mainHtml` after |
  | --- | --- | --- |
  | scrapingcourse.com Abominable Hoodie | 1451 | 8113 |
  | scrapingcourse.com Adrienne Trek Jacket | 1731 | 9780 |

  The page type and strategy stay `product/product` on both. The other 35 pages have the same page type, strategy and `mainHtml` length.
- **Listings:** `all-before.txt` and `scp-after2.txt` in the raw-response folder.

## API runs at `581a020`

| URL | Scrape | Result | Page type / strategy / confidence | Markdown | "## Description" | "Related products" |
| --- | --- | --- | --- | --- | --- | --- |
| https://www.scrapingcourse.com/ecommerce/product/abominable-hoodie/ | `8e5c91ec-0a78-412b-a6d9-341c8fd9cceb` | `success`, http | product / product / 0.75 | 1378 | yes | no |
| https://www.scrapingcourse.com/ecommerce/product/adrienne-trek-jacket/ | `db8f0bae-e60b-4e89-b6ec-6d639baa23fb` | `success`, http | product / product / 0.75 | 1924 | yes | no |
| https://www.scrapingcourse.com/ecommerce/product/aeon-capri/ | `16777bf1-e61c-44b2-94af-fd3bc3bb2bfd` | `success`, http | product / product / 0.75 | 1681 | yes | no |
| https://scrapeme.live/shop/Bulbasaur/ | `4a76e66b-edc5-4fbd-9a7c-e01f36790df2` | `failed` / `empty_unverified`, browser_local | product / article / 0 | 3200 | yes | yes |
| https://www.ikea.com/us/en/p/micke-desk-white-80213074/ | `eb2946ab-d547-44d9-9306-65423e8b20ab` | `success`, browser_local | product / product / 0.75 | 14910 | no | no |
| https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | `71b1330b-bf01-44e3-bcdb-a401dd25ba86` | `success`, http | product / product / 0.75 | 1586 | no | no |
| https://web-scraping.dev/product/1 | `f87ce2ae-4f52-4172-be44-4aa7911d74ad` | `success`, http | product / article / 0.75 | 2096 | yes | no |
| https://webscraper.io/test-sites/e-commerce/allinone/product/60 | `dcfb31ab-5e3b-4b51-aa8b-85f03a766918` | `success`, http | product / product / 0.6 | 241 | no | no |

**Not covered by this fix:**
- **scrapeme.live's Bulbasaur page** still fails here. Its cause, recommendation pruning cutting the page wrapper, is fixed separately on branch `claude/scrapeme-product-page` (#226), which this branch does not include.
- **Adrienne Trek Jacket and Aeon Capri** were not run through the API before the fix. For the Adrienne Trek Jacket, the before-and-after comes from the offline comparison.
- **webscraper.io's product page** yields 241 characters. That was not investigated.

## Regression batch

`node research/parity/run-sites.mjs --batch lists --record research/parity/runs/<record>`, proxied, passed 8/8 cases and 34/34 checks, with the same page types and strategies as earlier runs:

| Commit | Record |
| --- | --- |
| `8f1a2e7` | `2026-10-06-lists-proxied-8f1a2e7.md` |
| `581a020` | `2026-10-06-lists-proxied-581a020.md` |
