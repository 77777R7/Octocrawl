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
- `data.metadata` has `title` (the page's `<title>`), `description`, `language`, `keywords`, `robots` and `favicon` only when the page declares them, next to `sourceURL`, `statusCode` and `error`. `keywords` is the declared string, not split. Other `<meta>` tags (`og:*`, `twitter:*` and the rest) are not passed through, and a failed or blocked page, an error-status page included, has none of the six.
- No fire-engine, proxy pools, `actions`, JSON extract, or screenshots.
- Resume / cache defaults to refetch. A Firecrawl body never sets `useCached`.
- Omitted `limit` / `maxDepth` stay unbounded. Firecrawl defaults are 10000 / 10.
- `maxDepth` counts link hops from the start URL, which Firecrawl calls `maxDiscoveryDepth`; Firecrawl's own `maxDepth` limits URL path depth.
- Shim crawl start is HTTP 200 `{success,id,url}`. Native crawl start stays 202 `{taskId}`.
- `creditsUsed` and `expiresAt` are `null`: W2L counts no credits and keeps crawl results until their task directory is deleted.
- Scrape maps `url`, `formats`, `onlyMainContent`, `waitFor` and `timeout`; crawl maps `url`, `limit` (as `maxPages`), `maxDepth`, `includePaths`, `excludePaths` and `scrapeOptions.formats`, `.onlyMainContent`, `.waitFor` and `.timeout` (applied to every page). The only formats are `markdown` and `links`. `ignoreSitemap: true` is accepted because W2L already works that way, and `origin` (the SDK's client label) is accepted without effect. Any other parameter, format or value, such as `html`, `rawHtml`, `screenshot`, `json`, `actions`, `headers`, `mobile` or `proxy`, is rejected with HTTP 400 `{ success: false, error, code, details }` naming it (`code` is `unsupported_parameter` or `unsupported_format`).
- Every shim error carries the native API's error `code` inside Firecrawl's `{ success: false, error }` envelope; see the [error-code table](../apps/public-web/content/reference.md#errors). A page that fails is not an error response: it stays HTTP 200 with `success: false` and no `code`.
- `onlyMainContent: false` returns W2L's Markdown of the whole page body (scripts, styles, form controls and embedded media left out; header, navigation and footer kept). Firecrawl's full-page output comes from its own converter and can differ.
- `waitFor` (0 to 60 000 ms) skips the HTTP rung, which cannot run scripts, and starts at the local browser rung; with no browser rung the page is `success: false` with `failed: policy_denied`. The wait counts toward `timeout`.
- `timeout` must be 1 000 to 300 000 ms; an omitted one stays W2L's 300 000 ms (Firecrawl: 30 000). When it fires, the answer is still HTTP 200: `success: true` with the content fetched so far (native status `partial`), or `success: false` with `failed: timeout`. Firecrawl answers a timeout with an error.
- Scrape without `formats` returns markdown and links; Firecrawl returns markdown only. Crawl status pages carry each page's links whatever `scrapeOptions.formats` says.
- A PDF answers `success: true` with its text layer as `data.markdown`, a line `<!-- page N -->` before each page (N counts pages in the file), which Firecrawl's PDF Markdown does not have; `data.metadata` has no `numPages` (the native response's `file.pdf.pageCount` has it) and none of the PDF's own title or language. A PDF with no text layer at all is `success: false` with `failed: empty_unverified`: W2L runs no OCR. CSV, JSON and plain-text files give their text as received; XLSX, XLS and ZIP files are `success: true` with `data.markdown: null`, the file itself saved on the W2L host. A file over `W2L_MAX_FILE_BYTES` (default 50 MiB) is `success: false` with `failed: body_too_large`; images, video and similar are `failed: unsupported_content_type`. `maxFileBytes` is W2L's own option and is not accepted on `/fc`.
- `includePaths` / `excludePaths` are regular expressions matched against the URL path of each discovered link, as in Firecrawl. The start URL is always fetched and an `excludePaths` match wins. W2L follows links anywhere on the start URL's host, its `www.` twin and the host the start URL redirects to; Firecrawl's default follows only paths below the start URL, and `crawlEntireDomain` is rejected.
