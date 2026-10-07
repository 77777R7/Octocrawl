# Real-site run 2026-10-06: sandbox.oxylabs.io product page routed as collection

Found in the shop-listing work (PR #225): sandbox.oxylabs.io's product page routed as `collection`, and its Markdown carried the platform sidebar and two related games beside the product. This record covers the fix on branch `claude/oxylabs-product-page`.

## Setup

- **Source commits:**
  - `f052375` (origin/main) for "before";
  - `f323f65` for "after" and the final API runs;
  - `3d4fa66` (an intermediate commit, see Review) has its own lists record.
- **API:** `npm run api` on port 8787, standard mode.
  - Request: `curl --noproxy '*' -X POST localhost:8787/v1/scrape -d '{"url":"<url>","debug":true}'`.
  - The page type is read from the last `extract` event in the trace. "€ prices" counts `n,nn €` in the Markdown.
- **Network:** **proxied** through the shell's `HTTPS_PROXY` (127.0.0.1:7890). Every response records `evidence.envProxy: 127.0.0.1:7890`. No direct run was made.
- **When:** 18:53 to 19:16 UTC on 2026-10-05, which is 02:53 to 03:16 on 6 October at UTC+8, the date the record is named by.
- **Raw responses, capture and corpus results:** `.w2l/parity/2026-10-06-oxylabs-product/` (git-ignored).

## Reproduction at `f052375`

| Field | Value |
| --- | --- |
| URL | https://sandbox.oxylabs.io/products/1 |
| Scrape | `27d3d856-cb2b-4287-b486-e2c5f7ee0f14` |
| Result | `success`, http, `collection`/`article`, confidence 0.75, 2458 characters |

The Markdown held:
- the "Game platforms" sidebar list;
- the sandbox note;
- the product (The Legend of Zelda: Ocarina of Time, 91,99 €);
- two related games with their descriptions and prices.

## Cause

- The page declares nothing machine-readable: no JSON-LD, no microdata, no itemprop.
- Its title is its one `h2`; there is no `h1`.
- It shows three prices: its own, and those of two related games under linked `h4` titles.
- Without a declaration, the router (`packages/extract-tf/src/route.ts`) knows a product page only by its visible buy box: one `h1`, then one price. Neither held, so the small-collection rule (15 list items, 9 links, 1912 characters) took the page.

## Fix (`f323f65`)

A page with no `h1` has a buy box when all of these hold:
- its one `h2` is not a link;
- the first visible price after the `h2` comes before any other heading;
- that price is the only one in the lowest element holding the `h2` and the price;
- fewer than three prices show elsewhere on the page;
- the price is not in a list item, nor inside an element with two or more same-tag siblings that show a price.

The one-`h1` rule is unchanged.

## Review

- The first version, `3d4fa66`, checked only that the first price was not a card's.
- A clean-context review showed listings with no `h1` and one `h2` routed as `product`, losing all 12 cards to the recommendation cuts, when a deal box, a price filter or a shipping banner put a price between the `h2` and the grid.
- `f323f65` added the lowest-element and fewer-than-three conditions.
- A re-review found nothing blocking. It noted one accepted edge: a hero block holding the `h2` and a deal, followed by only two priced cards, can still route as `product`.
- **The trade-off:** an undeclared, `h2`-titled product page that shows three or more priced related products stays as it was on main.

## Tests

The new cases are in `packages/extract-tf/test/route.test.ts`, under "a product page titled by its one h2, beside related products".

| Case | Expected |
| --- | --- |
| An oxylabs-shaped page | `product`; description and price kept, related games left out |
| Priced cards under a listing's one `h2` | not `product` |
| A featured game with its own title | not `product` |
| A deal, a price filter or a shipping banner before a grid | not `product` |
| A deal sharing a hero block with the `h2` | not `product` |
| Two results | not `product` |
| A promotion whose one `h2` is a link | not `product` |

Removing any one condition fails one of these.

## Comparison: 176 saved pages

- **What was read:** the 120 Amazon pages under the main checkout's `.w2l/amazon-baseline/raw/`, with a `/dp/` URL, and 56 `.w2l/parity` captures.
- **How:** each was read by `extractTf.extract` at `f052375` and with `f323f65`'s code.
- **Result:** only the oxylabs product page changed (the same capture under two paths): Markdown 2302 → 539 characters, `collection` → `product`.
- **Results:** `oxy-before.json` and `oxy-after2.json` in the raw-response folder.
- Amazon `/dp/` pages are routed by the Amazon adapter, not by `routePage`, so they barely exercise this change.

## API runs at `f323f65`

| URL | Scrape | Result | Page type / strategy / confidence | Markdown | € prices | Warnings |
| --- | --- | --- | --- | --- | --- | --- |
| https://sandbox.oxylabs.io/products/1 | `811146fa-9a9c-4410-8132-d1bff092ad8d` | `success`, browser_local | product / product / 0.22 | 585 | 1 | `low_content_yield` |
| https://sandbox.oxylabs.io/products/20 | `02bd6369-4b32-40dd-85ea-567807160617` | `success`, browser_local | product / product / 0.22 | 522 | 1 | `low_content_yield` |
| https://sandbox.oxylabs.io/products/1836 | `e54bd806-6b17-49e6-a310-f74889f29f0f` | `success`, browser_local | product / product / 0.13 | 748 | 1 | `low_content_yield` |
| https://sandbox.oxylabs.io/products | `39765d80-8a46-41e4-bd3d-9b0cabe3d93d` | `success`, http | article / article / 1 | 24262 | 32 | none |
| https://sandbox.oxylabs.io/products/category/nintendo | `ade05a00-0ee3-4b1c-99c6-28b62ae33b85` | `success`, http | article / article / 1 | 25131 | 32 | none |
| https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | `d2797425-dbdd-4070-8a34-e127feed27ac` | `success`, http | product / product / 0.75 | 1586 | – | none |
| https://web-scraping.dev/product/1 | `a2009cd8-c9c2-44ee-846d-2c45a0c515f8` | `success`, http | product / article / 0.75 | 2096 | – | none |
| https://webscraper.io/test-sites/e-commerce/allinone/product/60 | `63ca5a86-85bb-44ba-ad20-b489113f9168` | `success`, http | product / product / 0.6 | 241 | – | `client_rendered_suspected`, `low_content_yield` |

- **oxylabs product pages:** each holds only its product: title, developer, platform, type, description, price, stock.
- **Browser lane:** the http lane offered these pages to it (`quality_low_yield`, escalation `improved: true`). The http answer's confidence is 0.22 or 0.13, because the sidebar and the related games, now outside the product region, hold most of the page's text blocks; under 200 tokens at 0.3 or less is the existing low-yield rule. The browser answer is the same product, at the cost of a browser render.
- **Listings:** the two oxylabs listings stay listings, with 32 prices each.
- **webscraper.io:** its warnings are the separate issue fixed on #228, not on this branch.
- Products 20 and 1836 were not run through the API before the fix.

## Regression batch

`node research/parity/run-sites.mjs --batch lists --record research/parity/runs/<record>`, proxied, passed 8/8 cases and 34/34 checks, with the same page types and strategies as earlier runs:

| Commit | Record |
| --- | --- |
| `3d4fa66` | `2026-10-06-lists-proxied-3d4fa66.md` |
| `f323f65` | `2026-10-06-lists-proxied-f323f65.md` |
