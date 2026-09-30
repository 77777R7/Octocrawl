# M1 item 5: live checks of the audited features from the cloud session (2026-09-30)

Checks of the M1 features that touch the request and crawl surfaces, made through the local MCP service after the M1-5 commits, against sandbox sites. They complement the per-feature test evidence in [`reaudit-2026-09-30.json`](reaudit-2026-09-30.json); the [first-batch re-check](live-batch-1-m1-recheck-2026-09-30.md) covers items 1–4. Nothing in earlier records changes.

| | |
| --- | --- |
| Source | `62b9c34` for every call except the last, which ran after the ladder budget fix in the commit that adds this record (the first attempt of that call is recorded too) |
| Service | `node packages/mcp/dist/localHostCli.js` on `127.0.0.1:8791`, `W2L_TASK_ROOT=.w2l/api`, egress through the session's `HTTPS_PROXY` (every result carries `proxy_used`) |
| Driver | Scratch MCP client calling `crawl`, `get_crawl`, `get_crawl_pages` and `scrape`; raw results under `.w2l/parity-live-batch/m1c-*.json` (git-ignored) |
| Window | 2026-09-30 03:48:03 – 03:51:40 UTC |

## Crawl with path filters, per-page options and live counters

`crawl {url: "https://books.toscrape.com/", maxPages: 6, excludePaths: ["^/catalogue/category/"], scrapeOptions: {includeLinks: true}}` returned a task id in 39 ms.

| Check | Observed |
| --- | --- |
| Live counters | `get_crawl` 1.5 s after start: `status: running, pagesFetched: 2, wallMs: 1969` (batch 1 reported 0 until the end); 3 s later `completed, pagesFetched: 6, budgetExceeded: pages` |
| excludePaths | 6 pages listed, 0 under `/catalogue/category/` although the homepage links to 50 category pages; pages: `/`, `/index.html`, `/catalogue/a-light-in-the-attic_1000/index.html`, `/catalogue/tipping-the-velvet_999/index.html`, `/catalogue/soumission_998/index.html`, `/catalogue/sharp-objects_997/index.html` |
| Duplicate detection | `/index.html` recorded as `duplicate` of `/` (same body hash), not fetched twice into the results |
| Links on crawl pages | asked for through `scrapeOptions.includeLinks`: the homepage carries 73 links, the product pages 3, 4, 5, 6 |
| Listing weight | without `debug`: `trace: []` and no `audit` on every item; with `debug=true` the first item carries 4 trace events and its audit |

## Scrape options and metadata

| Call | Observed |
| --- | --- |
| `scrape https://quotes.toscrape.com/` (default) | `success`, 3,613 chars; the `Login` link, the "Top Ten tags" rail and the GoodReads footer are absent; `formats: ["markdown"]` (links no longer included by default) |
| same with `onlyMainContent: false` | `success`, 4,393 chars; `Login`, "Top Ten tags" and the GoodReads footer present |
| `metadata` on both | `{"title": "Quotes to Scrape", "description": null, "language": "en", "keywords": null, "robots": null, "canonical": null, "favicon": null, "sourceURL": "https://quotes.toscrape.com/", "url": "https://quotes.toscrape.com/", "statusCode": 200, "contentType": "text/html; charset=utf-8"}` (the page states no description, keywords, robots, canonical or favicon: all null, none guessed) |

## JSON extraction on the batch-1 product page

`scrape https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html` with a schema that carries `$schema`, `title`, `minimum` and an `anyOf` nullable, `required: ["title", "price", "rows"]`, no model:

- accepted (batch 1 would have rejected `$schema`, `title`, `minimum` and `anyOf` with a 400);
- `json.status: incomplete`, `data: {"title": "A Light in the Attic", "availability": null, "rows": []}`;
- issues: `missing_required /price`, `missing_required /rows` — the required array is reported missing instead of being counted present as `[]` (batch 1 would have said `complete`);
- evidence: `[{"path": "/title", "source": "dom", "evidencePath": "document.title"}]`.

Finding 5 of the first batch stands: the price on this generic page is not mapped without a model.

## Error page and request timeout

| Call | Observed |
| --- | --- |
| `scrape https://books.toscrape.com/catalogue/this-book-does-not-exist_0/index.html` | `failed` / `http_error`, `metadata.statusCode: 404`, `contentType: text/html`; the server's 404 body has no readable content (a bare error page under 200 characters), so `markdown` stays null and no `http_error` warning is attached |
| `scrape https://httpbin.org/delay/10` with `timeout: 3000`, first attempt at `62b9c34` | **HTTP 500 `internal_error`**: the ladder raced the lane against the budget signal and let the deadline escape as an exception (`Execution deadline exceeded` in the service log) |
| same call after the fix in this record's commit | `failed` / `timeout`, `budgetExceeded: time`, `lane: http`, client wall 3019 ms, `usage.totalMs` 3003 |

The 500 was a real M1-5 defect found only by this live call: unit tests covered the request parsing and the lanes' own deadlines, not a lane that is still connecting when the run budget ends. The fix makes an exhausted budget a structured `timeout` result in the ladder (best result so far, or a synthesized one), with a unit test and an API test on the fixture server's hanging route.

## Fetch count

books.toscrape.com: 6 crawl pages plus 1 duplicate check of `/index.html`, 1 product scrape, 1 missing-page scrape; quotes.toscrape.com: 2; httpbin.org: 2 (the failed attempt and the repeat). robots.txt once per origin per service start.

## Still open

- Deterministic JSON does not map a generic page's price (finding 5); model fallback or a table-aware mapper is the next step.
- Markdown on the table strategy keeps only the largest table (`route.ts selectTable`), and Wikipedia keeps `[Edit links]` and a legend table: both stay listed under `scrape-formats.markdown` as weak.
- A `total` (queued plus done) counter on the native crawl status is not offered; `pagesFetched` and the pages listing are.
