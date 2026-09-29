# W2L plan: from 18.7% to 73% tier-weighted Firecrawl parity

Scores below use the audit's scoring: solid=1, weak=0.6, partial=0.4, missing=0, with tier weights core=3, common=2, niche=1. I recomputed them from the audit JSON. The recomputation reproduces the given baseline exactly: all 0.187 (91.2 / 488 weighted points), no-dependency 0.250, and every group score. Each milestone projection sets that milestone's features, plus all earlier milestones' features, to solid and recomputes. To reproduce them, run `node research/parity/score.mjs`; it reads `feature-audit.json` and the milestone lists in `milestones.json`.

## Before any code

1. **The roadmap blocks this work as written.** `ROADMAP.md` says Phase 0 has "no new product features", and it puts "Full Firecrawl parity (search, agent, cross-site extraction)" in the Paused table. The owner has now explicitly asked for this work, and AGENTS.md allows that. Even so, the first commit should be a `docs:` change to `ROADMAP.md`: make "Firecrawl parity on self-chosen public sites" the current phase, move parity out of Paused, and keep "Stealth, fingerprinting, proxy pools" paused. Without it, coding agents following AGENTS.md will refuse most of these items.
2. **70% needs external services.** If every no-dependency feature became solid, the score would reach only 0.605 (+204 of the 250.4 points needed). A bring-your-own LLM, a bring-your-own search backend and local monitors are all required. Without the LLM items the plan ends at 0.698. Without search it ends at 0.662. Without the monitor items it ends at 0.687. The proxy items are optional: without them the plan still ends at 0.718.
3. **"Solid" means a live test passed, not code merged.** Each feature's `realSiteTest` becomes one live test. A feature counts as solid only after that test passes against live sites, recorded with the command and the source commit.
   - Tests go in `packages/api/test/live/<group>.live.test.ts`.
   - Exclude `*.live.test.ts` from `vitest.config.ts`, and add `vitest.live.config.ts` plus `npm run test:live`. The roadmap's cleanup list already asks for that split.
   - Freeze the public site list in `research/parity/sites.v1.json`: books.toscrape.com, quotes.toscrape.com (including `/js`, `/scroll`, `/search.aspx`), the-internet.herokuapp.com, httpbin.org, badssl.com, example.com, en.wikipedia.org, docs.python.org, python.org, news.ycombinator.com and sitemaps.org.
   - Raw outputs go to `.w2l/parity/<date>/`.
   - Once frozen, failed URLs stay in the denominator and are never swapped out.
   - The harness takes about 2–3 days. That is not in the audit's effort figures.

## Summary

| Milestone | Features | effortDays (audit) | Tier-weighted after |
|---|---|---|---|
| Baseline | – | – | **0.1869** |
| M1 Trustworthy core | 21 | 34 | **0.2553** |
| M2 Scrape/crawl/batch breadth (no deps) | 50 | 53.75 | **0.3939** |
| M3 Map, actions, cache, PDF text, upload | 30 | 54.75 | **0.4996** |
| M4 Clients: SDKs, Firecrawl v2 compat, MCP | 26 | 51 | **0.5746** |
| M5 BYO-key LLM + search + proxy, local monitors | 52 | 74.25 | **0.7303** |
| **Total** | **179** | **267.75** | 356.4 / 488 |

- **Final score by tier:** core 1.000, common 0.853, niche 0.413.
- **Final score by group:** crawl-batch 0.993, map-search 0.860, scrape-formats 0.835, scrape-execution 0.808, platform 0.648, llm-agentic 0.251.
- **Margin over 0.70 is 14.8 weighted points.** That is about 7 common features, or 5 core ones, failing to reach solid.
- **Reserve if items slip (+8.8 points, 17.5 days):** `platform.audit-metadata`, `scrape-execution.audit-metadata`, `map-search.search-enterprise-privacy`, `scrape-execution.zero-data-retention`, `scrape-execution.use-mock`, `scrape-execution.auto-resume`, `platform.monitor.target-scrape`, `platform.monitor.goal-judge`.
- **The effort figures are audit estimates, not measurements.** Several features share one implementation: block-ads ×2, pdf-pages ×2, retries ×2, MCP crawl ×2, MCP map ×2, and the parse.* formats reuse the scrape LLM formats. That overlap is roughly 10–15 days, so the real sum is probably lower. After M1, compare actual days with the estimate and re-plan.

---

## M1 — Make the existing core trustworthy (34 days → 0.2553)

**Features:**
- Currently weak: `scrape-formats.markdown`, `scrape-formats.links`, `scrape-formats.metadata-response-status`, `scrape-formats.json`, `crawl-batch.crawl-start-async`, `crawl-batch.crawl-status`, `crawl-batch.batch-wait`, `crawl-batch.batch-cancel`.
- Core partial or missing: `scrape-formats.formats-array`, `scrape-formats.only-main-content`, `scrape-formats.metadata-page`, `scrape-execution.timeout`, `scrape-execution.wait-for`, `crawl-batch.crawl-wait`, `crawl-batch.crawl-scrape-options`, `crawl-batch.include-paths`, `crawl-batch.exclude-paths`, `platform.sdk.waiters`, `platform.client.api-key`.
- Also: `scrape-execution.error-model`, and `crawl-batch.crawl-delay`. Crawl-delay moves up because live testing must stay polite from day one.

**Why this comes first:** every later test reads markdown, links, status, JSON or crawl results. Today those can be glued, relative, falsely "complete" or silently truncated, so no later live result could be trusted.

**Where each change lands:**
- **Markdown** (`packages/extract-tf/src/markdown.ts`):
  - Resolve link and image URLs against the page URL and `<base>` (106–115).
  - Drop `data:` images (111–114).
  - Put separators between block siblings in `blocks()` (161–171).
  - Keep `<strong>`/`<em>` inside non-`<p>` blocks (158).
  - Render `<pre>` and tables nested in `<li>` (116–149).
  - Keep ordered-list numbering.
  - Keep every table rather than only the largest one (`packages/extract-tf/src/route.ts:330-348`).
- **Page title:** use the page `<title>` for metadata (`packages/extract-tf/src/extract.ts:29-39`).
- **Non-200 responses:** return the content together with `statusCode` instead of `failed` with null markdown (`packages/bench/src/subjects/resilientHttp.ts:365-376`, `browserLocal.ts` around 595–604).
- **Failed escalation:** when escalation fails, return the raw HTTP result with a warning (`resilientHttp.ts:400-414`, `browserLocal.ts:622-633`).
- **Response metadata:**
  - Use the real content type instead of the hard-coded value (`browserLocal.ts:541`).
  - Report real redirect chains (`browserLocal.ts:540`, `provider.ts:370`).
  - Keep `contentType` in compact output (`packages/api/src/structured.ts:511-553`).
- **Page metadata:** add a new `packages/extract-tf/src/metadata.ts` for title, description, language, keywords, robots and favicon.
- **Main-content-only switch:** add `onlyMainContent:false` to `parseScrapeRequest` in `packages/contracts/src/api.ts`, pass it through `packages/bench/src/runner.ts`, and fall back to the full page when no main block is found.
- **Links in batch and crawl results:** add `links` to `toCrawlPage` (`packages/api/src/engine.ts:556-579`) and to the `CrawlPage` type (`packages/contracts/src/crawl.ts`). Filter asset hrefs in `packages/extract-tf/src/links.ts:22`.
- **Formats array and request parsing:**
  - Lift the three-entry cap (`packages/contracts/src/api.ts:179`).
  - Make the default markdown only (`structured.ts:453`).
  - Reject unknown request keys instead of ignoring them.
  - Stop the `/fc` shim dropping formats (`packages/contracts/src/firecrawl.ts:32,69-72`) and forcing `debug` (`packages/api/src/app.ts:264-266`).
- **JSON extraction** (`packages/api/src/structured.ts`):
  - A missing required field must not count as present (193–194, 215).
  - Match fields by full path, not leaf name (152–153).
  - A field filled from the URL or title candidates must carry evidence (54–60).
  - Make strict mode safe (317).
  - Make the merge deep and give model-written values `model` provenance (332–337, 405–409).
  - Send the full page to the model, chunked (310).
  - Accept annotation keywords (`title`, `$schema`, `default`, `format`, `minimum`, `const`) and nullable `anyOf`/`oneOf` (`packages/contracts/src/api.ts:141,152`).
  - Create the BYO LLM client here, in a new `packages/api/src/llm.ts` (see "External services" below).
- **Timeout and waitFor:**
  - Add both to `parseScrapeRequest` and pass the deadline into the `ExecutionContext` in `engine.ts`.
  - Make the settle cap configurable (`browserLocal.ts:448`).
  - Honour cancellation in MCP (`packages/mcp/src/server.ts:15-21`) and in `/fc` (`app.ts:264`).
  - Give session capture a deadline (`engine.ts:533-539`).
  - Give the CLI an overall deadline (`packages/bench/src/ladderCli.ts:546`).
- **Crawl start and resume:**
  - Let the seed's apex/www twin count as the seed host (`packages/runtime/src/frontier.ts:185`).
  - Persist all crawl options in `Task` (`packages/contracts/src/checkpoint.ts:55-66`).
  - Resume non-batch crawls on startup (`engine.ts:301`) and add `POST /v1/crawl/:id/resume` in `app.ts`.
  - Make the page budget per task, not per attempt (`packages/runtime/src/orchestrator.ts:106,178`, `packages/bench/src/crawlCli.ts:159-161`).
- **Crawl status:**
  - Persist progress counters while the crawl runs (`orchestrator.ts:297,348`).
  - Report `expiresAt` and `creditsUsed` as null, not invented values (`firecrawl.ts:103-104`).
  - Strip audit and trace unless `debug` (`engine.ts:424`).
- **Include/exclude paths:** add a filter hook in `frontier.ts` and the fields in the crawl request (`packages/contracts/src/api.ts:225-239`).
- **Crawl scrape options:** reuse the batch formats wrapper for crawl (`engine.ts:233-241`), and choose the lane per URL rather than once from the seed URL (`engine.ts:233`).
- **Waiters** (`packages/sdk/src/client.ts:93-106`): add `waitCrawl`, `pollInterval`, `timeout`, a `JobTimeoutError` that carries the job id, and retry on 5xx.
- **Errors:**
  - Add machine codes and stop leaking `err.message` (`app.ts:285`).
  - Return `/fc` errors as `{success:false,error,code}`.
  - Add a typed `W2LError` in the SDK.
- **API key:** compare with `timingSafeEqual` and accept several tokens (`app.ts:31-40`); let the SDK read the key from an env var.
- **Crawl-delay:** feed robots.txt `Crawl-delay` on the HTTP lane (`resilientHttp.ts:183-193` → `packages/bench/src/scrapeAtom.ts:13`).
- **Fixes to features already solid (no score change):**
  - Integer-only `maxPages` (`api.ts:207-214`).
  - A monotonic sequence for the pagination cursor (`packages/runtime/src/sqliteStore.ts` around 329).
  - Real assertions in the cancel test (`packages/api/test/app.test.ts:236`).
  - A running-batch cancel test (`packages/api/test/batch.test.ts`).

## M2 — Cheap breadth with no external dependency (53.75 days → 0.3939)

**Features:**
- Scrape formats: `scrape-formats.html`, `raw-html`, `images`, `screenshot`, `screenshot-full-page`, `attributes`, `include-tags`, `exclude-tags`, `remove-base64-images`, `metadata-opengraph`, `metadata-dublin-core-article`, `response-warnings-hints`, `block-ads`.
- Scrape execution: `scrape-execution.block-ads`, `custom-headers`, `mobile-emulation`, `skip-tls-verification`, `fast-mode`, `execution-metadata`, `concurrency-queue-signal`, `integration-origin-tagging`, `agent-hints`, `rate-limit-errors`.
- Crawl and batch: `crawl-batch.regex-on-full-url`, `sitemap-mode`, `ignore-query-parameters`, `deduplicate-similar-urls`, `crawl-entire-domain`, `allow-subdomains`, `allow-external-links`, `crawl-max-concurrency`, `batch-max-concurrency`, `batch-errors`, `batch-ignore-invalid-urls`, `crawl-active-list`, `idempotency-key`, `batch-url-chunking`, `batch-append-to-id`, `webhook`, `webhook-events`, `webhook-headers`, `webhook-metadata`, `watcher-websocket`, `watcher-polling-fallback`, `start-and-watch`, `auto-pagination`.
- LLM-agentic (these need no model): `llm-agentic.extract.async-status`, `extract.url-scope`, `extract.webhook`, `llm-agentic.agent-hints`.

**Why this order:** these are the highest points per day (68 points for 54 days). Most of them expose work W2L already does, such as cleaned HTML, the excluded-tags extractor, the delivery worker and robots Sitemap parsing.

**Where each change lands:**
- **New formats:** a new `packages/api/src/formats.ts` projects html, rawHtml, images, attributes and metadata. Add new `packages/extract-tf/src/images.ts` (srcset, `<picture>`, og:image, lazy `data-src`). Wire the existing `excludeTags` through `packages/bench/src/runner.ts`.
- **Raw HTML:** return it as a string, hash the wire bytes (`resilientHttp.ts`), and fix `.html` naming in `packages/bench/src/rawArtifact.ts`.
- **Screenshots:** call `page.screenshot` in `browserLocal.ts` after the settle. A screenshot request forces the browser lane. Serve the image from `GET /v1/artifacts/:id` in `app.ts` or return it base64.
- **Ad blocking:** block ad hosts in the route filter (`browserLocal.ts:344-350`, `packages/bench/src/subjects/browserRequestPolicy.ts`) using a bundled ad-host list. Make token pruning switchable (`packages/extract-tf/src/prune.ts:62-67`).
- **Custom headers:** allowlist them (identity headers stay refused) in `packages/contracts/src/identityBundle.ts`, apply them in `packages/http-core/src/resilient.ts` and `browserLocal.ts`, and record them in `packages/http-core/src/compliance.ts`.
- **Mobile emulation:** add a second declared mobile identity in `identityBundle.ts` and `packages/bench/src/httpIdentity.ts`. It must pass the same honesty check.
- **Skip TLS verification:** add it in `resilient.ts`, with `ignoreHTTPSErrors` on the browser lane. It stays off in hosted mode and is recorded.
- **Fast mode:** select it per request through the channel policy in `engine.ts`.
- **Execution metadata and queue signal:** `queueMs` and `concurrencyLimited` come from `packages/bench/src/subjects/originScheduler.ts`; `scrapeId` goes in `packages/contracts/src/result.ts`.
- **Rate limiting:** a per-token limiter in `app.ts` that returns 429 with `Retry-After`.
- **Crawl URL controls:** new `packages/runtime/src/sitemap.ts` (sitemap index, `.xml.gz`, reusing `packages/http-core/src/robots.ts:261-262`). URL normalisation (query parameters, trailing slash, www) goes in `packages/runtime/src/canonicalize.ts`. Domain scope goes in `frontier.ts`. Per-job delay and concurrency go in `orchestrator.ts`.
- **Batch submission:**
  - Make `ignoreInvalidURLs` skip invalid URLs, not reject the whole list (`packages/contracts/src/api.ts:251-252`).
  - Queue concurrent submissions instead of rejecting them, and support append (`engine.ts:362-367`).
  - Store idempotency keys in `packages/runtime/src/taskStore.ts`.
- **Job webhooks:** wire `packages/runtime/src/deliveryWorker.ts` and `deliveryStore.ts` to crawl and batch jobs. Start the delivery worker inside `w2l-api` (`packages/api/src/cli.ts:12`).
- **Watcher:** send per-document SSE events for crawls as well as batches, add WebSocket (`app.ts:75-93`), and poll from a stored cursor instead of re-reading everything every 500 ms (`app.ts:80`).

## M3 — Map, browser actions, cache, PDF text and upload (54.75 days → 0.4996)

**Features:**
- Map: `map-search.map-endpoint`, `map-link-metadata`, `map-search-filter`, `map-sitemap-mode`, `map-include-subdomains`, `map-ignore-query-parameters`, `map-limit`, `map-timeout`, `mcp-map-search-tools`.
- Actions: `scrape-execution.actions-pipeline`, `action-wait-duration`, `action-wait-selector`, `action-click`, `action-write`, `action-press`, `action-scroll`, `action-screenshot`, `action-scrape`, `action-execute-javascript`, `action-pdf`.
- Cache: `scrape-execution.cache-max-age`, `cache-min-age`, `store-in-cache`, `lockdown-cache-only`, `scrape-formats.metadata-cache-state`.
- PDF and upload: `scrape-formats.pdf-parser`, `pdf-pages`, `pdf-page-markers`, `llm-agentic.parse.file-upload`, `parse.pdf-pages`.

**Why this order:** map is the only core feature in its group, and M2's sitemap and URL work already feeds it. Actions reuse M2's screenshot and artifact route. Text-layer PDF is not OCR, and it is already Phase 1 roadmap work (file download plus PDF text).

**Where each change lands:**
- **Map:** new `packages/runtime/src/map.ts` (sitemap, robots, seed-page links and titles, no body crawl). Add `POST /v1/map` in `app.ts`, new `packages/contracts/src/map.ts`, a map tool in `packages/mcp/src/tools.ts`, and `/fc/v1/map`. Map timeout uses the orchestrator's existing wall-clock budget (`engine.ts:349` currently hard-codes `maxWallMs: null`).
- **Actions:** new `packages/bench/src/browserActions.ts`, run between navigation and capture in `browserLocal.ts:419-448`. It reuses the per-navigation robots and SSRF checks from `packages/bench/src/recipeExecutor.ts:47-53`. The `executeJavascript` action is disabled in hosted mode and stays behind the route filter (`browserLocal.ts:340-360`).
- **Cache:** new `packages/runtime/src/scrapeCache.ts`, a SQLite store keyed by canonical URL plus an options hash. Lockdown mode must be proven to make zero requests using `packages/http-core/src/ledger.ts`. Remove or fix the dead `useCached` crawl option (`engine.ts:334-358`).
- **PDF and upload:**
  - New `packages/extract-tf/src/pdf.ts`, using pdfjs-dist on the text layer only.
  - Content-type sniffing in `resilientHttp.ts`, so files no longer escalate to the browser.
  - Make the size cap configurable (`packages/contracts/src/policy.ts:38`).
  - A scanned PDF returns an explicit `ocr_required` status, not an empty success.
  - Add `POST /v1/parse` (multipart) in `app.ts`.

## M4 — Clients: SDKs, Firecrawl v2 compatibility, MCP (51 days → 0.5746)

**Features:**
- JS SDK and client: `platform.sdk.js`, `sdk.error-model`, `sdk.schema-conversion`, `scrape-formats.json-typed-schema`, `sdk.watcher`, `sdk.auto-pagination`, `sdk.agent-hints`, `sdk.logging`, `platform.client.timeout`, `client.retries-backoff`, `scrape-execution.http-retries-backoff`.
- Python: `platform.sdk.python`, `sdk.python-async`.
- Firecrawl compatibility and attribution: `platform.v1.method-aliases`, `crawl-batch.v1-compat-aliases`, `platform.attribution.origin-integration`.
- MCP: `platform.mcp.server-local`, `mcp.tool.scrape`, `mcp.tool.crawl`, `crawl-batch.mcp-crawl-tools`, `mcp.tool-output-contract`, `mcp.safe-mode`, `mcp.tool.map`, `mcp.tool.parse`, and the deprecation stubs `mcp.tool.extract` and `mcp.tool.research-search-github`.

**Why this order:** clients are worth building once the server features they expose exist. `/fc/v2` also lets us run Firecrawl's own SDKs against W2L as a parity test, using the unpacked firecrawl-js 4.42.0 and firecrawl-py 4.45.0 (install them with `npm pack @mendable/firecrawl-js@4.42.0` and `pip download firecrawl-py==4.45.0`) pointed at W2L's `apiUrl`.

**Where each change lands:**
- **JS SDK:** `packages/sdk/src/client.ts`, plus a new `packages/sdk/src/schema.ts` for Zod to JSON Schema. Make `packages/sdk/package.json` public with a CJS build, published as `@w2l/sdk`. This needs the MIT-client / AGPL-server split the roadmap already names.
- **Python SDK:** a new top-level `python/` package (PyPI name `w2l`): httpx sync and async clients, with Pydantic models generated from the contracts JSON Schema.
- **Firecrawl compatibility:** `/fc/v2/*` routes (scrape, crawl, batch/scrape, map, extract) in `app.ts` and `packages/contracts/src/firecrawl.ts`. The crawl status response gets a `success` field and a working `next` link (`firecrawl.ts:99-107`).
- **MCP:**
  - Expose the full scrape and crawl options, make crawl wait until done, and add `outputSchema`, `structuredContent` and annotations in `packages/mcp/src/tools.ts`.
  - Validate tool input server-side in `packages/mcp/src/server.ts`.
  - Make the stdio path self-contained with its own scheduler (`packages/mcp/src/stdio.ts`).
  - Accept a `localhost` Host header (`packages/mcp/src/localHost.ts:55`).

## M5 — External services via bring-your-own key, plus local monitors (74.25 days → 0.7303)

**Features:**
- LLM: `scrape-formats.summary`, `question`, `highlights`, `query-deprecated`, `llm-agentic.extract.multi-url`, `extract.show-sources`, `crawl-batch.crawl-prompt`, `crawl-params-preview`, `llm-agentic.parse.json-extraction`, `parse.summary`, `parse.question`, `parse.highlights`.
- Search: `map-search.search-endpoint`, `search-limit`, `search-scrape-results`, `search-result-shape`, `search-query-operators`, `search-include-domains`, `search-exclude-domains`, `search-time-filter`, `search-geo-targeting`, `search-source-news`, `search-source-images`, `search-category-github`, `search-category-research`, `search-category-pdf`, `search-timeout`, `search-highlights`, `platform.mcp.tool.search`.
- Proxy and location: `scrape-execution.proxy-basic`, `proxy-auto`, `location`.
- Local monitors and operations: `platform.monitor.list`, `get`, `delete`, `run-now`, `list-checks`, `diff-markdown`, `update`, `schedule`, `page-change-status`, `get-check`, `webhook`, the MCP monitor tools `platform.mcp.tool.monitor-list`, `monitor-run`, `monitor-update`, `monitor-checks`, `monitor-check`, `monitor-delete`, and `crawl-batch.zero-data-retention`, `platform.usage.concurrency`, `platform.usage.queue-status`.

**Why this comes last:** each piece depends on a provider interface and earlier plumbing: search results are scraped with the M2/M3 batch options, the LLM formats reuse the M1 `llm.ts`, and monitor diffs reuse the M1 markdown. Without this milestone W2L stops at 0.575.

**Where each change lands:**
- **LLM formats:** new `packages/api/src/llmFormats.ts`. Every highlight must be checked as a verbatim substring of the page. Extract results are merged across batch items with a `sources` map. Add `POST /v1/crawl/params-preview`.
- **Search:** a new `packages/api/src/search/` folder with a provider interface and adapters, `POST /v1/search` in `app.ts`, and a new `packages/contracts/src/search.ts`. Search highlights are selected locally from fetched pages and need no service.
- **Proxy and location:**
  - Expose `AccessConfigInput.proxy` (`packages/contracts/src/access.ts`) and apply it on both the HTTP lane (undici ProxyAgent in `packages/http-core/src/resilient.ts`) and the browser launch.
  - Report `metadata.proxyUsed` and `timezone`.
- **Monitors:**
  - Run the scheduler and delivery worker inside `w2l-api` (`packages/api/src/cli.ts`, reusing `packages/mcp/src/managedRuntime.ts:40-61`).
  - In `packages/runtime/src/monitorStore.ts`: keep a fixed cadence (420), paginate lists instead of loading full histories (424–431), add delete and retention, and send webhooks for failed and completed checks (353–357).
  - Make run-now actually run (`packages/runtime/src/monitorRunner.ts:39-40`) and map its errors to 409 (`app.ts`).
  - Store a unified markdown diff for each check.
- **Job data and queue status:** `DELETE /v1/crawl/:id` and `DELETE /v1/batches/:id` purge the task directory. `GET /v1/queue` reads from `originScheduler.ts`.

---

## External services and how W2L offers them without paid infrastructure

| Dependency | Features in plan | Bring-your-own approach |
|---|---|---|
| LLM | `json` (M1) and the 12 M5 LLM features | `packages/api/src/llm.ts` is a single OpenAI-compatible client configured by `W2L_LLM_BASE_URL`, `W2L_LLM_API_KEY` and `W2L_LLM_MODEL`, replacing the current `structuredModelConfigFromEnv`. It works with OpenAI, OpenRouter, Anthropic's OpenAI-compatible endpoint, or a local Ollama or llama.cpp server. With no model configured, W2L returns 501 `llm_not_configured`, never a degraded "success". Model-written values are always tagged `source:'model'`. |
| Search backend | 14 search features plus `search-scrape-results` | A `SearchProvider` interface. The default is SearXNG, which is self-hosted and needs no key. Brave, Serper and Tavily adapters take the user's own key. With no provider configured, W2L returns 501 `search_not_configured`. |
| Proxy network | `proxy-basic`, `proxy-auto`, `location` | The user supplies proxy URLs: `W2L_PROXY_URL` and per-country `W2L_PROXY_URL_<CC>`. The proxy endpoint hash is recorded in the compliance record. `location.languages` needs an owner decision, because `identityForRoute` currently refuses locale overrides. The plan passes 0.70 without this row (0.718). |
| "Hosted infrastructure" (monitors, queue and usage, data retention) | 20 M5 features | These run in the user's own `w2l-api` process with SQLite. There is no multi-tenant service. |
| Other | `search-highlights` | Local passage selection over fetched pages. |

## What W2L should deliberately not copy

- **Stealth and enhanced proxy modes, and `ignoreRobotsTxt`.** The roadmap says these are "not restarted", and they contradict the product's "web data you can cite" position. W2L should return an explicit 400 for them, not silently drop the field. `robots-txt-controls` stays partial; the substitute is the roadmap's per-domain override with a recorded reason.
- **OCR, image OCR and PDF layout blocks.** The owner has said OCR is not W2L's business. A scanned PDF gets an `ocr_required` status instead.
- **Alexandria, the paid-provider exchange, find-tools, and the developer and research-paper indexes.** Each needs a hosted commercial catalogue or index; the audit puts them at roughly 10–20 days each for about 1 point each.
- **Credits, billing, refund feedback and keyless hosted tiers.** A self-hosted tool has no credits. Reporting `creditsUsed: 0` breaks the "unknown is not zero" rule; report null.
- **Deprecated upstream features:** FIRE-1 agent scrape, deep research, llms.txt.
- **Not needed to reach 70%, candidates afterwards:** the autonomous `agent.*` family (15 days for `agent.run` alone), `interact.*`, and hosted browser sessions. These are real breadth but expensive. Take them on after 0.70 if users ask.