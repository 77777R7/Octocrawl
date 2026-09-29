# Changelog

## Unreleased

- Roadmap v2 (weeks 1–16) makes P1 core correctness the current phase and adds the Firecrawl parity audit (`research/parity/`, frozen at firecrawl-js v4.42.0) and a real-site test set with a runner (`node research/parity/run-sites.mjs`) whose runs are recorded with command and commit.
- JSON extraction no longer reports `complete` while a required field has no source: such fields are omitted with a `missing_required` issue, nested fields are not filled from page-level values, and JSON from a non-`success` page is `incomplete` with `page_unsuccessful`.
- Markdown keeps block boundaries, inline spacing and emphasis, numbers ordered lists (with `start`), keeps code blocks and tables inside list items, drops empty emphasis from icon elements, and resolves link and image targets against the document base (`<base href>` included). Same-page `#fragment` links stay as written.
- Scrape responses, batch items and crawl pages carry `metadata` read from the page's own markup: the `<title>`, `meta` description, keywords and robots, the language, the favicon and the canonical URL, each null when the page declares none (nothing is inferred). `/fc` maps them into `data.metadata`. `document.title` stays the content title.
- The API accepts several bearer tokens (repeated `--token`, `W2L_API_TOKEN` plus comma-separated `W2L_API_TOKENS`) and compares them in constant time; the SDK sends `W2L_API_TOKEN` when no token is passed.
- A page whose blocks sit directly in `<body>` (example.com today) is extracted instead of reported `empty_unverified`, so the README's first `npm run scrape -- https://example.com` works again.
- In the browser lane, Markdown follows the page's CSS where it differs from the tags: an inline element laid out as a block in the text flow starts its own paragraph (quotes.toscrape.com/js no longer reads `thinking.”by`), and inline text hidden with `display: none` is left out (GitHub Docs' platform names read `Open Terminal.`). Hidden blocks, such as footnote popups and accordion panels, are kept. Evidence is unchanged (`rawBodySha256` and raw artifacts are the rendered page without W2L's markers); a page over 100 000 elements, one still changing after capture, or one short of time converts by its tags, and the trace's `layout` event records which. Monitors on pages captured in the browser lane may report a one-time change.
- A non-2xx response keeps its page as evidence (Markdown, links and `snapshot.httpStatus`, also on the default REST response and `/fc`) while its status stays `failed` or `blocked`; other 2xx statuses are judged like 200, and 204/205 are `empty_verified`. A robots.txt that never answers is recorded as unreachable instead of failing the scrape with HTTP 500, and a URL whose scrape throws becomes its own failed item instead of failing the whole batch or crawl.
- Main-content selection keeps a single long block such as a `<pre>` news release; a form that wraps page content (a table viewer, an ASP.NET page) is unwrapped instead of removed; an HTTP page whose tables are empty script-filled shells is offered to the browser lane.
- JSON extraction also fills top-level keys from the page's own labels (two-cell `th`/`td` rows and `dt`/`dd` pairs in the main content), each with its location as evidence; labels that state different values leave the field out with a `field_ambiguous` issue. A page whose one heading is followed by its one visible price is routed as a product, so that price is read (books.toscrape.com).
- A listing of cards in which the article cascade finds no text block (a sparse category page, data.gov.uk's home page) is kept instead of being reported `empty_unverified`. An HTTP page that declares data its scripts will fetch (`<link rel="preload" as="fetch">`) is offered to the browser lane. Markdown leaves an empty first header cell empty instead of writing `(header)`.
- Batch items and crawl pages carry `links` when requested. `formats` has no count cap; an unsupported format or an unknown request field is rejected with HTTP 400 naming it, on the native API and on `/fc`. Crawl accepts `formats`, `includeLinks`, `includePaths` and `excludePaths`, and keeps the path filters on resume.
- SDK: `waitCrawl`, and `pollIntervalMs` / `timeoutMs` for `waitBatch` and `waitCrawl` with a `WaitTimeoutError` that carries the last status.
- Scrape, batch and crawl (per page), MCP and `/fc` accept `onlyMainContent`, `waitFor` and `timeout`. `onlyMainContent: false` returns the whole page's Markdown with the same evidence. `waitFor` starts at the browser rung and waits after load before capture; with no browser rung the result says so (`policy_denied`, `wait_for_unavailable`). `timeout` (default 300 000 ms) is the whole scrape's deadline: when it fires the answer is HTTP 200 with `partial` (the best content so far) or `failed`/`timeout`, never HTTP 500, marked `usage.deadlineExceeded`. A lane timeout no longer sets `budgetExceeded: 'time'`, which the contract keeps for status `budget_exceeded`. JSON from a `partial` page is `incomplete` with a `page_partial` issue. `/fc/v1/scrape` now cancels when the client disconnects.
- Request errors carry one code set across the REST API, `/fc`, the SDK and MCP: `{ error, code, details? }` with `invalid_json`, `invalid_request`, `unsupported_parameter`, `unsupported_format`, `unauthorized`, `not_found`, `conflict` or `internal_error`; statuses and messages are unchanged. The SDK throws `W2LError` (`status`, `code`, `method`, `path`, `body`). A 500 hides its internal message unless the server runs in local mode; hosted mode logs the cause to stderr. The docs reference lists the codes.
- Local mode sends outbound requests (HTTP lane, robots.txt, Monitor fetches, the browser lane) through `HTTPS_PROXY` / `HTTP_PROXY`, honouring `NO_PROXY`; loopback stays direct, `W2L_PROXY=off` ignores the variables, and hosted mode never reads them. Proxied requests record `evidence.envProxy` (`host:port`, never credentials). Response headers up to 64 KiB are accepted, and a name that does not resolve is `dns_error` instead of `policy_denied`.
- Crawls follow links on the start URL's `www.` twin and on the host it redirects to, and no longer fetch image, font, style, script, media or program links. A crawl task stores every option: a crawl paused by shutdown or left running by a crash resumes when the API starts, `POST /v1/crawl/:id/resume` (SDK `resumeCrawl`, MCP `resume_crawl`) restarts a paused or failed one, and `w2l crawl --resume` runs with the stored limits and refuses a flag that differs. `maxPages` counts the task's pages across resumes. `GET /v1/crawl/:id` counts pages while the crawl runs, and crawl pages carry their audit and trace only with `debug=true`. The HTTP lane reports robots.txt `Crawl-delay`, a host starts one page at a time until its robots.txt is known, and each crawl page records the delay it waited in a `crawl_delay` trace event. `/fc/v1/crawl/:id` reports `creditsUsed` and `expiresAt` as `null` instead of 0 and an invented expiry.
- Monitor observations record the raw body's SHA-256 and the extractor version (`EXTRACTOR_VERSION`, now `extract-tf/1`; unknown on older rows). Fields that change over a byte-identical raw body (a 304 counts as its reused body) are `extraction_reprocessed`: the run records `changeReason` (MCP `get_monitor`: `latestRun.changeReason`) and the baseline moves, but no event or webhook delivery is created. So the first run after this upgrade no longer reports `source_changed` where only W2L's Markdown changed (for the Firecrawl introduction preset: restored spaces in three descriptions). When the raw body changed too, the event stays `source_changed` and carries `extractorChange` if the extractor differs from the baseline's. Delivered `eventVersion` values can now skip a version.
- A robots.txt that cannot be fetched (5xx, network error or lookup timeout) is a complete disallow in local and hosted mode alike (RFC 9309 §2.3.1.4): the page is `failed`/`policy_denied`, and the trace and the compliance record's robots decision carry `unreachable` with the reason, which the record's hash covers. It is fetched again after five minutes (`robotsUnreachableTtlMs`). Before, only the public preview failed closed; the API, MCP and CLIs fetched the page anyway. The provider lane follows the same rule and no longer reads a 5xx robots.txt as no robots.txt.
- Without the environment proxy (no variables, `W2L_PROXY=off`, hosted mode), the browser lane launches Chromium with `--proxy-server=direct://` instead of silently using the operating system's proxy; with it, the launch names the environment proxy.
- `W2L_CONTACT` adds the operator's contact to the research-mode User-Agent (`; contact: …`). On the HTTP lane, a 403 from an SEC host to a request that declared no contact carries a `declared_contact_hint` trace event.
- Evidence Record v1: scrape responses (full and compact, so MCP too), batch items and crawl pages carry `evidenceRecord` (`schemaVersion: "w2l.evidence/1"`), one shape for every lane, published as the JSON Schema `packages/contracts/schemas/evidence-record.v1.json`: final URL (null when no request was sent), a redirect chain that says whether every hop was observed, `fetchedAt`, HTTP status, status and reason, lane, the robots.txt decision with its hash, raw and output hashes (delivered Markdown; `json.data` as RFC 8785 canonical JSON), extractor name, version and `W2L_SOURCE_COMMIT`, field evidence, saved artifacts, the environment proxy and the User-Agent sent. Existing fields are unchanged; lanes now also record `evidence.fetchedAt`, and the HTTP, browser and provider lanes' `robots_checked` trace events carry the robots.txt hash (the provider lane emits one too). `/fc` does not carry the record.
- A scrape's `timeout` also sets how long the lanes wait for a slow server: with one, the HTTP lane waits for headers and body and the browser for navigation until the deadline, instead of stopping at 10 s, 30 s and 20 s; without one those defaults stay. The browser's `navigate` trace event records the wait it allowed (`timeoutMs`).
- MCP: a client that cancels a tool call (`notifications/cancelled`) aborts the API requests the call made, so a cancelled `scrape` stops on the server and a cancelled `wait_batch` stops waiting.
- SDK: `waitCrawl` and `waitBatch` retry a status request that fails with a network error, 408, 429 or 5xx (after 1, 2, 4, 8, then 10 s, or a `Retry-After` of 60 s or less; `maxRetries`, default 5) and throw other errors at once. `timeoutMs` also ends a request in flight, `WaitTimeoutError.last` is null when no status was read and `cause` holds the last failure, invalid wait options throw `RangeError`, and `W2LError` carries `retryAfterMs`. `crawlAndWait` and `batchAndWait` start a task, wait, and return every page and error, or every item.
- `/fc/v1/crawl/:id` reports a cancelled crawl as `cancelled` instead of `failed`; `completed` counts the latest attempt's successful pages and `total` all its pages (failed, blocked and duplicate ones included) plus, while this API process runs the crawl, those in flight and queued (`null` for a paused crawl), instead of both being the step count. `data` holds at most 100 pages (`limit`, up to 1 000) with a `next` URL carrying a native cursor, left out after the last page; `skip` is rejected.

- C2 adds Monitor sample preview, paused-by-default MCP creation, durable queued manual runs, run detail, delivery paging and dead-letter controls. A local SDK Streamable HTTP check completed the public Firecrawl document → HTTPS webhook flow with the same event ID at sender and receiver.
- C3 adds a single-process API/scheduler/delivery-worker runtime, protected-resource metadata, WorkOS JWT validation and a restricted Streamable HTTP MCP endpoint. A two-service Render Blueprint and walkthrough are ready; permanent deployment, browser OAuth and actual hosted restart acceptance remain open.
- Scrape requests now accept explicit Markdown, links and JSON Schema formats. Deterministic extraction runs directly on subject-bound product HTML/metadata; nullable missing fields include evidence-backed issues, and an OpenAI-compatible model fallback is explicit and disabled when unconfigured.
- Amazon `/dp/{ASIN}` pages use a subject adapter for identity, purchase offers, seller, availability, delivery context, variants, images and specifications. Recommendation shelves are removed before output; Blink subscription pages remain products with `kind: subscription`.
- HTTP usage includes monotonic queue, robots, cooldown, transport, retry, extract, format, model and total timings. `request_complete` is emitted after the response body resolves, while ladder `totalMs` records user-visible elapsed time separately from summed attempt time.
- MCP scrape responses are compact by default and omit trace, ladder audit and nested duplicate bodies; `debug: true` restores the full audit. The fixed three-round Amazon baseline writes ignored local evidence with region pinning, field checks, response bytes and p50/p95 timing.

## 0.4.0-rc.1 — 2026-09-22

- Gate 2–4 implementation freeze `99894bd636ecafd254a7c7bc79d26e9a97fa9199` was merged by [PR #50](https://github.com/77777R7/w2l/pull/50) into `main` at `1c1481722ade26b717d18a34fa4b46362f53acf8` and published as the `v0.4.0-rc.1` source prerelease. Workspace packages remain private; no npm package or permanent service deployment is included.
- Gate 2: explicit captureMode, shared cancellation/deadlines, full Retry-After waits and persisted Monitor cooldown; actual process recovery/claim races, baseline/fencing, A/B/A/B, conditional-cache body and multi-Monitor isolation checks passed.
- Gate 3: durable HTTPS destinations/delivery worker, lease/fencing, retry/dead-letter, same-event replay and a transactional deduplicating receiver. Real HTTPS ACK-loss/restart experiment passed; its temporary endpoint is stopped.
- Gate 4: Monitor/Delivery SDKs, examples, install/restart documentation and a sanitized agent clean-install record. Independent human acceptance remains pending; Gate 5 external two-week and repeat-use validation has not started.
- Native Crawl results expose paginated `/v1/crawl/:id/pages` and `/v1/crawl/:id/errors`, persistent cancellation via `/v1/crawl/:id/cancel`, and matching SDK/MCP operations.
- Roadmap calibration: B1/B2 and C1 remain in_progress; C2 Monitor/Delivery MCP and guided first use, plus C3 unified process management and remote HTTPS URL MCP are the next unimplemented slices. Existing B3/B4/C4 gaps remain open.

- API listen is loopback by default (`hostname: 127.0.0.1`). `--hosted --token` is the public mode: bearer auth, private/metadata SSRF deny on seed + redirects, 10 MB body cap, crawl `maxPages` default 100.
- Local mode still allowlists loopback/RFC1918 so fixture servers work. API callers cannot widen that list.
- Crawl scrape or store errors write task/attempt `failed` instead of leaving `running`. Resume with no contentful checkpoint reseeds the seed URL.
- HTTP and local browser fills `rawBodySha256`. Same body on a later URL is `duplicate`, not a crawl-stopping `loop_detected`.
- A 200 challenge page with extractable prose is `blocked`, not success. Decisive challenge evidence (vendor header / Cloudflare plumbing / interstitial copy pair) is consulted after extract; an embedded widget on a real article is not.
- Ladder runs now expose task-level execution accounting: every attempted channel remains available alongside `channelsTried` and `ladderTrace`; unknown cost, token, or wire-byte measurements stay `null` instead of being treated as zero.
- Browser-rendered DOM size is not reported as `bytesWire`; browser paths use `null` when actual network transfer bytes cannot be proven. `artifacts: []` means this run produced no screenshot or DOM artifact.
- Multi-page crawls use bounded workers, enforce Frontier host concurrency and robots crawl delays, reuse channels and routing history within an API engine, and reuse browser processes while keeping fetch contexts isolated.
- Earlier foundation review baseline: `main@6965168` after PR #14 and PR #15 were merged; current freeze evidence is linked in [Gate 2–4 acceptance](docs/roadmap/gate-2-4-acceptance.md).

## 0.3.0 — 2026-09-18

Programmable scrape and crawl. Same runner as the CLI.

- REST: `POST /v1/scrape`, `POST /v1/crawl` (202 + taskId), `GET /v1/crawl/:id`. Responses are `FetchResult` / `CrawlReport`.
- TypeScript SDK (`@w2l/sdk`, MIT): `W2L.scrape` / `W2L.crawl` / `W2L.getCrawl`. Server remains AGPL.
- MCP stdio server (`@w2l/mcp`, MIT): tools `scrape`, `crawl`, `get_crawl` over the REST contract. No OAuth, no resources.
- Firecrawl v1 shim (`/fc/v1/scrape`, `/fc/v1/crawl`): snapshot 2026-09-18, maps onto the native contract. Challenge pages are not success; no fire-engine; resume defaults to refetch. Not a compatibility layer.
- 1000-page kill/resume probe: SIGKILL at 27 pages, resume to 1001 unique URLs, 0 lost, `cached=0`.
- Workspace packages versioned `0.3.0`.

## 0.2.0 — 2026-09-18

Crawl composes scrape. Checkpoint from day one.

- `w2l crawl <url>` with `--resume`, `--use-cached`, `--max-pages`, `--headed` (browser arm only; CI stays headless).
- `@w2l/runtime`: `TaskStore` (memory + SQLite next to the task dir), frontier, orchestrator.
- Checkpoint is `task → attempt → step` at URL granularity. Caller-generated UUIDs; repeat writes are idempotent.
- Resume restores the queue. Default is refetch; `--use-cached` is the only skip-fetch path and marks cached pages.
- Link harvest from the full document after extract, before HTML is dropped. Nav links are kept; markdown stays chrome-free.
- HTTP arm honours robots.txt with the same semantics as the browser arm.
- Loop stop: two distinct canonical URLs with the same `rawBodySha256` → `loop_detected`.
- Page / time / cost / token budgets can set `budget_exceeded`.
- Workspace packages versioned `0.2.0`.

## 0.1.0 — 2026-09-18

First product-shaped cut of the identity ladder.

- Anti-bot is a coverage ladder (ADR 0004), not an in-tree circumvention engine.
- L0 identity bundle: UA, Client Hints, locale, timezone, viewport must agree; fail closed.
- Product HTTP arms send that bundle (`standard` default; `research` is a declared bot).
- Ladder refuses channels with a missing or contradictory identity before `fetch`.
- `w2l scrape <url>` is the user entry (`w2l-fetch` remains an alias).
- Extract-tf emits Markdown after extraction, not raw HTML.
- Provider lane measures vendor identity and does not inject ours; HeadlessChrome / research-as-Chrome / UA-hint mismatch are not success.
- Changing IP or session does not change identity (`identityForRoute`).
- Workspace packages versioned `0.1.0`.
