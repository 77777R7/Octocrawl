# First live batch: re-run of all 12 URLs at the S1 head (2026-09-30)

Re-run of the 12 URLs of `real-site-test-set.md` ("First live batch") at commit `57232f6`, which carries the M1 fixes (`70681ca`..`62b9c34`, the ladder budget fix), the S1 commits and the table-region fix `9d68407`. Same driver and same MCP protocol path as the [first run](live-batch-1-2026-09-30.md); all 12 URLs stay in the denominator.

| | |
| --- | --- |
| Source commit | `57232f6`, built with `npx tsc --build` |
| Service | `W2L_LOCAL_MCP_PORT=8792 W2L_TASK_ROOT=$PWD/.w2l/api node packages/mcp/dist/localHostCli.js` |
| Driver | `node .w2l/parity-live-batch-2/run.mjs` (the first run's `run.mjs` with its output folder changed) |
| Window | 2026-09-30 05:52:50 – 05:54:40 UTC; one follow-up StatCan call at ~06:05 UTC from a proxy-less host |
| Machine | the same macOS machine as the first run |
| Network | The shell's `HTTPS_PROXY=http://127.0.0.1:7890` is honoured by both lanes since `988e235`, so every fetch of the batch went through it (`proxy_used` in every trace) and `en.wikipedia.org`, poisoned in local DNS, was reachable. The follow-up used `W2L_PROXY_URL=off`. |
| Raw outputs | `.w2l/parity-live-batch-2/` (git-ignored): one JSON per call, `summary.json`, `run.log`, `07x-statcan-direct-scrape.json` |

## Scoreboard

| # | URL | First run | This run |
| --- | --- | --- | --- |
| 1 | books.toscrape.com product page | partial | **partial**: markdown (1,586 chars), 3 links and json present; `price` still not mapped without a model (`incomplete`, `missing_required /price`); an absent required field is correctly not `complete` |
| 2 | books.toscrape.com crawl (60 pages, depth 2) | partial | **pass**: 60 fetched, `budgetExceeded: pages`, 0 errors; 58 `success`, 1 `duplicate`, 1 `partial` (`art_25`, 2,704 chars with a `low_confidence_extraction` warning, was `failed`); 60 unique URLs when paging |
| 3 | quotes.toscrape.com/js/ | partial | **pass**: http lane `failed`, escalated to `browser_local`, both lanes reported; 10 quotes on 43 lines (was 4) |
| 4 | scrapethissite forms, per_page 100 vs 25 | pass | **pass**: 6 and 24 page links from the page, batches 6/6 and 24/24, 582 rows both ways |
| 5 | webscraper.io/test-sites/tables | pass | **pass**: 2 of 2 tables, headers intact |
| 6 | Wikipedia GDP (nominal) | not testable | **pass on the table checks**: `success`, http lane, 54,282 chars, 243 table rows, spanned headers filled in and every row the header's width; `[Edit links]` is still in the body (1 occurrence) and `compliance` is null, so the User-Agent check fails as on every http result |
| 7 | StatCan CPI table 18-10-0006-01 | fail | **fail, browser lane unverified**: http lane 823 chars with `client_rendered_suspected` (`script_shell`) and escalated (M1 item 2 detects it now); the browser lane's `page.goto` timed out after 20 s through the proxy (`navigate_failed`), the ladder kept the http result; 30.6 s wall. Direct follow-up: http lane `failed` / `timeout` in 12.6 s, no browser attempt; the host is not reachable directly from this network |
| 8 | GOV.UK subnational consumption report | pass | **pass**: 9 of 9 tables with their "Table N" lines, no chrome. New: the client-rendered check flagged `js_fallback` (a `noscript` notice), the browser lane fetched the page again and returned the same 73,691 chars (`improved: false`) |
| 9 | OWID grapher `?tab=table` | fail | **pass**: http lane flagged `client_rendered_suspected`, browser lane rendered 233 table rows, `improved: true` |
| 10 | apple.com/environment | pass | **pass**: headline figures and the 2026 report PDF link, 370 links |
| 11 | data.gov.uk search crawl (limit 3) | partial | **partial**: 3 pages, 0 errors; the homepage is `partial` with `low_confidence_extraction` (was `failed`); the "≥ 10 s apart" criterion does not apply (no Crawl-delay), as found before |
| 12 | bls.gov empsit.t01 | partial | **partial**: http 403 `bot_detected_generic`, browser lane 200 with the table (65 rows); still no per-call "http only, no retry" control |

Pass 8, partial 3, fail 1.

## M1 exit line, re-checked

1. **HTTP 200 with text is never `failed` with `markdown: null`**: #2 `art_25` and #11 homepage are `partial` with their markdown and a `low_confidence` warning. Resolved.
2. **Client-rendered data is detected and escalated**: #9 has table rows from the browser lane. #7 is detected and escalated; the render could not be verified from this machine (timeout through the proxy, unreachable direct). Half verified.
3. **Structured failures and a configured proxy**: the proxy is honoured on both lanes (`proxy_used`, Wikipedia reachable); the direct StatCan attempt ends as `failed` / `timeout`, a structured result, not a 500. Verified.
4. **Block boundaries and chrome**: quotes one per line (#3). Wikipedia's body starts at the title and the navboxes are gone, but `[Edit links]` remains, as recorded in `reaudit-2026-09-30.json`. Mostly resolved.
5. Not re-audited here (see `m1-live-checks-2026-09-30.md`).

## Findings from this run

1. **A `noscript` notice makes a static page look client-rendered** (#8): the browser lane re-fetched GOV.UK for nothing. The `js_fallback` reason should need an empty container or a table shell, not a notice alone.
2. **StatCan** (#7): reachable only through the proxy here, and its table page does not finish loading in Chromium within 20 s that way. The browser-lane check waits for a network that reaches the host.
3. Unchanged from the first run: `compliance` null on http results (the UA lives in the `identity_sent` trace event), no "no retry" control on `scrape`, no `price` mapping for the generic adapter without a model, `[Edit links]` on Wikipedia.

## Fetch count

Sandboxes: books.toscrape.com 61 pages in the crawl and 2 scrapes, quotes.toscrape.com 2 lanes, scrapethissite.com 2 scrapes and 30 batch pages, webscraper.io 1. Real sites: Wikipedia 1; StatCan 2 lanes through the proxy and 1 http attempt direct; GOV.UK 2 lanes; OWID 2 lanes; Apple 1; data.gov.uk 3 pages; BLS 2 lanes. One robots.txt read per host.
