# Firecrawl scrape/crawl shim

Snapshot date: **2026-09-18**. Source: Firecrawl API v1
[`POST /scrape`](https://docs.firecrawl.dev/api-reference/v1-endpoint/scrape),
[`POST /crawl`](https://docs.firecrawl.dev/api-reference/v1-endpoint/crawl-post),
[`GET /crawl/{id}`](https://docs.firecrawl.dev/api-reference/v1-endpoint/crawl-get).

This is a **one-shot migration tool**, not a compatibility layer. Point a
Firecrawl v1 client at `http://127.0.0.1:8787/fc` so its `/v1/scrape` and
`/v1/crawl` calls hit the shim, which translates them onto the native
contract (`POST /v1/scrape`, `POST /v1/crawl` 202, `GET /v1/crawl/:id`).

Covered:

- `POST /fc/v1/scrape` → native scrape → `{ success, data }`
- `POST /fc/v1/crawl` → native crawl start → `{ success, id, url }` (HTTP 200)
- `GET /fc/v1/crawl/:id` → native report + steps → Firecrawl crawl status

Not covered (will not be added): Search, Interact, Agent, Monitor, Map, Extract.

## Known diffs

- Challenge / block pages are `success: false`. Firecrawl often returns the interstitial as success markdown.
- A page answered with an HTTP error status (4xx/5xx) is `success: false`, with its Markdown in `data.markdown` and the status in `data.metadata.statusCode`: the error page is evidence of what the server said, not content.
- No fire-engine, proxy pools, `actions`, JSON extract, or screenshots.
- Resume / cache defaults to refetch. A Firecrawl body never sets `useCached`.
- Omitted `limit` / `maxDepth` stay unbounded. Firecrawl defaults are 10000 / 10.
- `maxDepth` counts link hops from the start URL, which Firecrawl calls `maxDiscoveryDepth`; Firecrawl's own `maxDepth` limits URL path depth.
- Shim crawl start is HTTP 200 `{success,id,url}`. Native crawl start stays 202 `{taskId}`.
- `creditsUsed` is always 0.
- Scrape maps `url` and `formats`; crawl maps `url`, `limit` (as `maxPages`), `maxDepth`, `includePaths`, `excludePaths` and `scrapeOptions.formats`. The only formats are `markdown` and `links`. `onlyMainContent: true` and `ignoreSitemap: true` are accepted because W2L already works that way, and `origin` (the SDK's client label) is accepted without effect. Any other parameter, format or value, such as `html`, `rawHtml`, `screenshot`, `json`, `actions`, `waitFor`, `timeout`, `proxy` or `onlyMainContent: false`, is rejected with HTTP 400 `{ success: false, error, code, details }` naming it (`code` is `unsupported_parameter` or `unsupported_format`).
- Every shim error carries the native API's error `code` inside Firecrawl's `{ success: false, error }` envelope; see the [error-code table](../apps/public-web/content/reference.md#errors). A page that fails is not an error response: it stays HTTP 200 with `success: false` and no `code`.
- Scrape without `formats` returns markdown and links; Firecrawl returns markdown only. Crawl status pages carry each page's links whatever `scrapeOptions.formats` says.
- `includePaths` / `excludePaths` are regular expressions matched against the URL path of each discovered link, as in Firecrawl. The start URL is always fetched and an `excludePaths` match wins. W2L follows links anywhere on the start URL's host; Firecrawl's default follows only paths below the start URL, and `crawlEntireDomain` is rejected.
