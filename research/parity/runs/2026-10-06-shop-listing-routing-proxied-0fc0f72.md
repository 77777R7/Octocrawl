# Real-site run 2026-10-06: shop listings routed as `product`

The card-grid survey ([2026-10-05-card-grid-routing-proxied-8bc5090.md](2026-10-05-card-grid-routing-proxied-8bc5090.md), on PR #223) found two category pages routed as `product`. On both, the product strategy cut the product cards as recommendations:

- scrapingcourse.com's WooCommerce shop;
- IKEA's desks category.

This record covers the fix on branch `claude/woocommerce-shop-routing`.

## Setup

- **Source commits:**
  - `136ec27` (origin/main) for "before";
  - `0fc0f72` for "after" and for the final API runs.
  - Intermediate commits `686eaf5`, `81bea09`, `cc86c69` and `0bba295` are listed under Regression batch below.
- **API:** `npm run api` on port 8787, standard mode.
  - Request: `curl --noproxy '*' -X POST localhost:8787/v1/scrape -d '{"url":"<url>","debug":true}'`.
  - The page type is read from the last `extract` event in the trace. "Prices" counts `$` or `£` followed by a digit in the Markdown.
- **Network:** **proxied** through the shell's `HTTPS_PROXY` (127.0.0.1:7890). Every API response records `evidence.envProxy: 127.0.0.1:7890`. No direct run was made.
- **When:** 15:33 to 16:37 UTC on 2026-10-05, which is 23:33 to 00:37 on 5–6 October at UTC+8. The records are named by the local date their run ended on.
- **Raw responses and captures:** `.w2l/parity/2026-10-05-shop-routing/` (git-ignored).

## Reproduction at `136ec27`

| URL | Scrape | Result | Page type / strategy / confidence | Markdown | Prices |
| --- | --- | --- | --- | --- | --- |
| https://www.scrapingcourse.com/ecommerce/ | `562def01-e214-4079-b63a-2cc37e90480d` | `success`, http | product / product / 0 | 307 | – |
| https://scrapeme.live/shop/ | `e9e05151-9fe4-418f-b196-4141c93b894a` | `success`, http | article / article / 1 | 3527 | – |
| https://www.ikea.com/us/en/cat/desks-20649/ | `80d45617-0af4-471e-83b9-1bd418267db6` | `success`, http | product / product / 0.75 | 8881 | 0 |

What the reproduction showed:
- **scrapingcourse.com:** the server HTML holds 16 `li.product` cards. The Markdown holds none of them: only the skip links, the site name, the cart and "Showing 1–16 of 188 results", twice.
- **IKEA:** the JSON-LD declares a `CollectionPage` whose `ItemList` holds 24 `Product`s, but the Markdown has no prices.

## Causes

All four are in `packages/extract-tf/src/route.ts`.

1. **WooCommerce cards rejected as a listing.**
   - WooCommerce marks every card as a microdata `Product` scope, and gives each its own classes (`post-246`, `first`/`last`, `instock`/`outofstock`, `product_cat-…`).
   - The listing-cards check (`productCards`) required identical class strings, so the 16 scopes read as one product.
2. **Header cart total read as a buy-box price.** A lone h1 plus a price outside the cards kept a page a product page. On scrapingcourse.com that price is the header's cart total ("$0.00 0 items").
3. **IKEA's listed products read as the page's product.** Any JSON-LD `Product`, at any depth, sent a page to the product strategy, and IKEA's are only an `ItemList`'s items.
4. **No region found once routed `collection`.** Every WooCommerce card is entirely links: picture, name and price inside one link, then "Add to basket". So the article cascade finds no block. The card-list fallback, `selectCardList`, also compared full class strings, and it required text outside the links.

## Fix (`0fc0f72`)

- Microdata Product cards that share a tag and at least one class make a listing when they are siblings of one container. Otherwise their classes must be identical, as before.
- Only prices outside the header and navigation keep a lone-h1 page a product page.
- JSON-LD Products inside an `ItemList` are counted apart (`listedProducts`). Three or more make a collection only when a top-level JSON-LD node declares the page a `CollectionPage` or `SearchResultsPage`, and no microdata scope declares one product. Otherwise they count as product signals, as before.
- `selectCardList` groups cards the same way, and accepts a link that holds an h2–h6 as a card.

## Review

A clean-context review ran four rounds and found product pages routed as `collection` after each of `686eaf5`, `81bea09`, `cc86c69` and `0bba295`:
- a page whose own microdata scope shares a class with its recommendation cards;
- a buy-box price placed above the h1;
- related products declared only as a JSON-LD `ItemList`, in several layouts (compare-at prices, Dawn price boxes, a price in a list item, sibling sections, a size picker made of links);
- a nested `CollectionPage`.

Each is a test case in `route.test.ts`. A heuristic tried in `81bea09` and `cc86c69` (a price under the h1) was removed in `0bba295`, in favour of the declared `CollectionPage`. After `0bba295`, the reviewer's only finding was the nested `CollectionPage`, which `0fc0f72` fixes; `0fc0f72` itself was not reviewed again.

## Offline comparison: 37 captured pages

**What was compared:**
- the 27 captures of the card-grid survey;
- 8 product pages: scrapingcourse.com and scrapeme.live product pages, an IKEA product page, books.toscrape.com, sandbox.oxylabs.io, web-scraping.dev, webscraper.io, and a second scrapingcourse.com product page;
- fresh captures of scrapingcourse.com's shop and IKEA's desks category.

**How:** each capture was read by `extractTf.extract` with `route.ts` from `136ec27` and from the fix.

**Result:**
- Only the shop listings changed: two captures each of scrapingcourse.com and IKEA.
  - scrapingcourse.com: `product/product` → `collection/list`, `mainHtml` 3962 → 31803 characters.
  - IKEA: `product/product` → `collection/article`, `mainHtml` 67413 → 188903 characters.
- The other 33 pages have the same page type, strategy and `mainHtml` length.
- The listings are in `.w2l/parity/2026-10-05-shop-routing/all-before.txt` and `all-after5.txt`.

## API runs at `0fc0f72`

| URL | Scrape | Result | Page type / strategy / confidence | Markdown | Prices |
| --- | --- | --- | --- | --- | --- |
| https://www.scrapingcourse.com/ecommerce/ | `16dde32d-52a2-4513-92ee-21f129e1dafa` | `success`, http | collection / list / 0.15 | 4624 | 16 |
| https://www.ikea.com/us/en/cat/desks-20649/ | `57aa09cd-d8a0-493c-bdbd-cc33fc2c151c` | `success`, http | collection / article / 0.75 | 39919 | 24 |
| https://scrapeme.live/shop/ | `8e980913-425d-4909-9fab-1467c163435f` | `success`, http | article / article / 1 | 3527 | 16 |
| https://www.scrapingcourse.com/ecommerce/product/abominable-hoodie/ | `d594720a-1cac-40b2-86f5-b086d864df04` | `success`, http | product / product / 0.6 | 303 | 1 |
| https://scrapeme.live/shop/Bulbasaur/ | `1ba432c4-fe4e-47a4-bcea-8ea3735fe1e3` | `failed` / `empty_unverified`, browser_local | product / article / 0 | 3284 | 6 |
| https://www.ikea.com/us/en/p/micke-desk-white-80213074/ | `424a04a9-64a5-4924-b475-bf8fd6781ab8` | `success`, browser_local | product / product / 0.75 | 15568 | 1 |
| https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | `368b4f6c-24c8-4aee-b746-4ed3e5660ea5` | `success`, http | product / product / 0.75 | 1586 | 4 |
| https://sandbox.oxylabs.io/products/1 | `4165bd18-30b2-4580-a573-5b0e31795146` | `success`, http | collection / article / 0.75 | 2458 | 0 |
| https://web-scraping.dev/product/1 | `b9024ca8-214a-4a68-a2e2-e2d2397efa8f` | `success`, http | product / article / 0.75 | 2096 | 4 |

**Not changed by this fix:** in the offline comparison, these routed the same with `136ec27`'s router as with the fix.
- scrapeme.live's shop stays `article`. Its 16 products are in the Markdown.
- scrapeme.live's Bulbasaur product page fails as `empty_unverified`.
- sandbox.oxylabs.io's product page routes as `collection`.

The last two were not investigated. The scrapingcourse.com product page's Markdown is 303 characters; that was not investigated either.

## Regression batch

`node research/parity/run-sites.mjs --batch lists --record research/parity/runs/<record>`, proxied, passed 8/8 cases and 34/34 checks at each commit on this branch:

| Commit | Record |
| --- | --- |
| `686eaf5` | `2026-10-05-lists-proxied-686eaf5.md` |
| `81bea09` | `2026-10-05-lists-proxied-81bea09.md` |
| `cc86c69` | `2026-10-06-lists-proxied-cc86c69.md` |
| `0bba295` | `2026-10-06-lists-proxied-0bba295.md` |
| `0fc0f72` | `2026-10-06-lists-proxied-0fc0f72.md` |

Each case's page type and strategy match the batch's earlier runs at `3e5d62f`, `8bc5090` and `0e9e415`.
