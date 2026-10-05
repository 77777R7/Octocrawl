# Real-site run 2026-10-05: listing pages of cards routed as `article`

While fixing partial Walmart listings (#221), a unit fixture with 9 or more product cards and no headings in them routed as `article`. This record checks whether real category pages do the same, and what commit `8bc5090` changes.

## Setup

- **Source commits:** `dfae31f` (origin/main) for the "before" column, and `8bc5090` (branch `claude/card-grid-routing`) for the "after" column and the API runs.
- **Network:** **proxied** through the shell's `HTTPS_PROXY` (127.0.0.1:7890) throughout. No direct run was made.
- **When:** 14:40 to 15:11 UTC on 2026-10-05.
- **Raw captures and responses:** `.w2l/parity/2026-10-05-card-grid/` (git-ignored).

## 1. Offline survey: the extractor on captured pages

**How the pages were read:**
- Each page was fetched once with `curl -s -L` through the proxy, using a desktop Chrome user agent and `accept-language: en-US`.
- Each capture was then read twice by `extractTf.extract` from `packages/extract-tf`: once at `dfae31f` and once at `8bc5090`.
- This exercises the router only, not the API's lanes.
- 20 listing URLs were tried. 9 answered with a 403, 406, 429 or no answer (rei.com, npmjs.com, etsy.com, zalando.co.uk, backmarket.com, thriftbooks.com, allbirds.com, kickstarter.com, bhphotovideo.com) and were not read.
- 20 article, docs and index URLs were tried. 4 answered with a 401, 402, 403 or a 2 KB 202 (reuters.com, allrecipes.com, stackoverflow.com, imdb.com) and were not read.
- The 27 pages read are all in the table.

| Page | Kind | Before (`dfae31f`) | After (`8bc5090`) |
| --- | --- | --- | --- |
| https://sandbox.oxylabs.io/products | product grid | `article` 1 | `collection` 0.75 |
| https://web-scraping.dev/products | product grid (5) | `article` 1 | `collection` 0.75 |
| https://www.newegg.com/p/pl?N=100006740 | product grid | `article` 1 | `collection` 0.75 |
| https://github.com/trending | repository list | `article` 1 | `collection` 0.75 |
| https://www.gymshark.com/collections/all-products | product grid | `article` 1 | `collection` 0.75 |
| https://scrapeme.live/shop/ | product grid (WooCommerce) | `article` 1 | `article` 1 |
| https://www.scrapingcourse.com/ecommerce/ | product grid (WooCommerce) | `product` 0 | `product` 0 |
| https://www.ikea.com/us/en/cat/desks-20649/ | product grid | `product` 0.75 | `product` 0.75 |
| https://books.toscrape.com/ | product grid | `collection` 0.75 | unchanged |
| https://webscraper.io/test-sites/e-commerce/allinone/computers/laptops | product grid | `collection` 0.75 | unchanged |
| https://www.walmart.com/search?q=laptop | product grid | `collection` (list) 0 | unchanged |
| https://www.gov.uk/government/news | news index | `article` 1 | `collection` 0.75 |
| https://www.npr.org/sections/news/ | news index | `article` 1 | `collection` 0.75 |
| https://blog.cloudflare.com/ | blog index | `article` 1 | `collection` 0.75 |
| https://www.theguardian.com/international | news index | `collection` | unchanged |
| https://www.bbc.com/news | news index | `article` 1 | unchanged |
| https://www.goodreads.com/book/show/5907.The_Hobbit | book page | `collection` | unchanged |
| https://docs.python.org/3/library/json.html | docs | `collection` | unchanged |
| https://en.wikipedia.org/wiki/Octopus | article | `article` | unchanged |
| https://developer.mozilla.org/en-US/docs/Web/HTML/Element/a | docs | `article` | unchanged |
| https://blog.cloudflare.com/the-road-to-quic/ | article | `article` | unchanged |
| https://news.ycombinator.com/item?id=8863 | comment thread | `collection` (table) | unchanged |
| https://github.com/microsoft/vscode | repository page | `article` | unchanged |
| https://overreacted.io/a-complete-guide-to-useeffect/ | article | `article` | unchanged |
| https://martinfowler.com/articles/microservices.html | article | `article` | unchanged |
| https://web.dev/articles/vitals | article | `article` | unchanged |
| https://css-tricks.com/snippets/css/a-guide-to-flexbox/ | article | `article` | unchanged |

- **Content unchanged:** on every page the length of `mainHtml` is the same before and after. The strategy stays `article`, so only the page type and its confidence cap change.
- **No longer `article`:** five listing pages, plus three index pages (gov.uk news, NPR News, the Cloudflare blog index).
- **Still misrouted, not changed here:**
  - **scrapeme.live** stays `article`. Its products are whole links (name and price inside the link, then "Add to basket"), so they are not cards to the existing `isCard` test. The content is extracted: the Markdown lists the 16 products.
  - **scrapingcourse.com** routes as `product` and its extraction loses the 16 products: 307 characters of Markdown, against 16 `li.product` elements in the capture. This is a content loss, recorded as found and not investigated.
  - **IKEA** routes as `product`; its content was not checked.

## 2. API runs at `8bc5090`

**How the runs were made:**
- API: `npm run api` on port 8787, standard mode.
- Request: `curl --noproxy '*' -X POST localhost:8787/v1/scrape -d '{"url":"<url>","debug":true}'`, run at 15:06 UTC.
- The page type is read from the last `extract` event in the response's trace.

| URL | Scrape | Status, lane | Page type / strategy / confidence | Markdown |
| --- | --- | --- | --- | --- |
| https://sandbox.oxylabs.io/products | `2a432761-b015-4d9a-9a39-8ca54677bec4` | `success`, http | collection / article / 0.75 | 24262 |
| https://web-scraping.dev/products | `98d7bc42-fafa-4ea5-aec9-3101a6ee29d8` | `success`, http | collection / article / 0.75 | 2489 |
| https://www.newegg.com/p/pl?N=100006740 | `265146f3-d97b-4c7b-8ac9-24785dca9050` | `success`, http | collection / article / 0.75 | 77724 |
| https://github.com/trending | `bd2d136a-0eb4-40d2-abab-01f8060645d8` | `success`, http | collection / article / 0.75 | 76162 |
| https://www.gymshark.com/collections/all-products | `4942b267-baee-4146-9422-3b1766951b14` | `success`, http | collection / article / 0.75 | 38518 |
| https://en.wikipedia.org/wiki/Octopus | `3e4a71f9-51ec-4c5e-9790-76f751530730` | `success`, http | article / article / 1 | 191587 |
| https://developer.mozilla.org/en-US/docs/Web/HTML/Element/a | `1c0c4d42-a4d3-4328-8f27-8f383ed0c81b` | `success`, http | article / article / 1 | 29722 |
| https://blog.cloudflare.com/the-road-to-quic/ | `1b6b5d94-183f-4593-9bba-0678207317ac` | `success`, browser_local | article / article / 1 | 20881 |
| https://overreacted.io/a-complete-guide-to-useeffect/ | `0e812a35-15d1-4387-82bc-dd6f92a4f4a9` | `success`, http | article / article / 1 | 70359 |
| https://martinfowler.com/articles/microservices.html | `cade4351-1467-45a4-8b80-8cf46d10349c` | `success`, http | article / article / 1 | 50171 |

Every response records `evidence.envProxy: 127.0.0.1:7890`. Why the Cloudflare post was answered by the browser lane was not investigated.

## 3. Regression batch

`node research/parity/run-sites.mjs --batch lists --record research/parity/runs/2026-10-05-lists-proxied-8bc5090.md`, proxied, at `8bc5090`, passed 8/8 cases and 34/34 checks. Each case's page type and strategy match the same batch's run at `3e5d62f` (`2026-10-05-lists-proxied-3e5d62f.md`, whose raw responses are under `.w2l/parity/2026-10-05T14-22-30-000Z/`).
