# First live batch: re-check of the M1 fixes from the cloud session (2026-09-30)

Addendum to [`live-batch-1-2026-09-30.md`](live-batch-1-2026-09-30.md) and its [Wikipedia addendum](live-batch-1-wikipedia-2026-09-30.md). It re-checks the URLs behind findings 1–4 of the main record after the first four M1 items ([ROADMAP](../../ROADMAP.md), M1 items 1–4) at commit `988e235`. Nothing in the earlier records changes; the batch denominator stays 12. The rows below are the six URLs those findings named; the other six were not re-fetched.

| | |
| --- | --- |
| Source commit | `988e235` (branch `claude/vigilant-keller-nkskez`): M1-1 `17b383f` (listing recovery, client-rendered detection), M1-4 `70681ca` (markdown block boundaries, navigation chrome), M1-3 `988e235` (structured robots/DNS failures, operator proxy) |
| Service | `node packages/mcp/dist/localHostCli.js` on `127.0.0.1:8791`, `W2L_TASK_ROOT=.w2l/api`, restarted at that build |
| Driver | The same scratch MCP client as the Wikipedia addendum (`scrape` tool, `{url, debug: true}`, one call per row); raw results under `.w2l/parity-live-batch/m1-*.json` (git-ignored) |
| Window | 2026-09-30 03:00:51.935 – 03:04:20.929 UTC |
| Machine | Linux cloud container, Node v22.22.2, playwright-core 1.62.1 |
| Network | This environment forces egress through a local proxy (`HTTPS_PROXY=http://127.0.0.1:34753`) that re-terminates TLS. W2L now honours that variable: every result below carries a `proxy_used` trace event with `{server: "http://127.0.0.1:34753", source: "HTTPS_PROXY"}` and no credentials. Node trusts the proxy CA through `NODE_EXTRA_CA_CERTS`; Chromium did not until the CA was added to the user NSS store part-way through the run (see "Browser lane and the proxy CA") |
| User-Agent sent | `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36`, with matching `sec-ch-ua` client hints on every http-lane call (unchanged from the earlier runs) |

## Scoreboard

| # | URL | Batch-1 result | Now | Finding checked |
| --- | --- | --- | --- | --- |
| 2 | books.toscrape.com `art_25` listing (the failed crawl page) | failed / `empty_unverified`, `markdown: null` | **partial** with the 8 books, http lane, 1.3 s | 1: fixed |
| 3 | quotes.toscrape.com/js/ | partial: 10 quotes on one line | **pass**: http → browser_local, 10 quotes in separate blocks, 4.2 s | 2: fixed |
| 6 | Wikipedia GDP (nominal) | HTTP 500 on macOS; pass on the applicable criterion from the cloud | **pass** on the applicable criterion, http lane through the proxy, 1.0 s; chrome reduced, not gone | 4 (proxy): fixed; chrome: partly |
| 7 | StatCan CPI table 18-10-0006-01 | fail: 370-char shell, no escalation | http lane now **flags the shell and escalates**; the browser lane could not be verified here (proxy CA on the first try, host unreachable on the second) | 3: detection fixed, rendering unverified |
| 9 | OWID grapher `?tab=table` | fail: description only, no escalation | **pass**: http flags `client_rendered_suspected`, browser lane returns the 231-row table, 5.8 s | 3: fixed |
| 11 | data.gov.uk homepage (the failed crawl page) | failed / `empty_unverified` on both lanes | **partial** with the page body, http lane, 1.4 s | 1: fixed |

## Per-URL detail

**2. Listing page.** `status: partial`, `lane: http`, HTTP 200, 31,769 bytes, `rawBodySha256 997470f8d85b2ba5…`. Extract: `pageType: collection, strategy: list, confidence: 0, escalate: false`, then `extract_recovered {recovery: list}`; `warnings: [low_confidence_extraction]` ("No main content region was identified; the largest linked list is returned instead."). The markdown (2,704 chars) is an ordered list of 8 items, each with the cover image link, the title link, the price and "In stock" — the Art category has 8 books. `channelsTried: ['http']`: the ladder accepted the partial and did not run the browser.

**3. JS quotes.** First attempt at 03:00:53.599: http `failed / empty_unverified` with `escalations: [extract_low_confidence]` (correct), then the browser lane failed with `connection_error` — `page.goto: net::ERR_CERT_AUTHORITY_INVALID`, the proxy CA problem described below. Second attempt at 03:04:10.288 after the CA fix: `channelsTried: ['http','browser_local']`, final `success` on `browser_local` (HTTP 200, `browserMs` 3,010, `settled {networkIdle: true, settleMs: 1145}`). Markdown 1,525 chars over 43 lines (batch 1: 1,392 chars, 3 line breaks): 10 quotes, each quote and its "Tags:" line in their own paragraphs separated by blank lines. Inside a quote the text and the author still touch (`…thinking.”by Albert Einstein`): the page's script builds the two `<span>` elements with no whitespace between them, so the DOM itself has no space there; the markdown mirrors the DOM.

**6. Wikipedia.** `success`, `lane: http`, HTTP 200, 681,299 bytes (same size as the earlier cloud run; the body hash differs, `73c97ce11e948c41…`, `lastModified Tue, 29 Sep 2026 18:59:00 GMT`), `robots_checked {decision: allowed, matchedGroup: *}`, `proxy_used`. Extract `confidence: 1`. Markdown 54,282 chars, 360 lines (earlier cloud run: 70,937 chars, 461 lines). Tables: the nominal GDP table with 222 data rows of 4 cells (`Country/Territory | IMF (2026)[1] | World Bank (2025)[6] | United Nations (2024)[7]`, `United States | 32,383,920 | 30,769,700 | 29,298,000`), the regional groupings table with 14 rows of 3 cells, and a 1-cell map-legend table whose header is the `(header)` placeholder — 3 tables against 7 before: the three `vte` navbox tables and one legend table are gone. Criterion: every row has the same cell count, pass; spanned headers are still not exercised (the served revision has none). Chrome: 26 lines precede `## Table` (99 before); the 79-language list is gone; `[Edit links]`, the semi-protection icon link and the legend table remain. The footnote markers of the earlier addendum are unchanged (`[1]`, `[6]`, `[7]` in header cells, `[n 1]`, `[r 2]` in data cells).

**7. StatCan.** First fetch at 03:01:41.301 (6.2 s): http lane `success`, HTTP 200, 69,066 bytes, markdown 823 chars (title, footnote links, frequency, table id, release date, geography — the same shell as batch 1) **and now** `quality_client_rendered {reason: script_shell, textChars: 257, scriptChars: 28867}`, `warnings: [client_rendered_suspected]`, `escalations: [{from: http, to: browser_local, trigger: quality_client_rendered, improved: false}]`. The browser lane ran and failed with `net::ERR_CERT_AUTHORITY_INVALID` (proxy CA, not the site), so the ladder kept the http result. Second fetch at 03:04:20.929 after the CA fix (15.5 s): `failed / connection_error` on the http lane with `robots_checked {decision: no_robots, unreachable: timeout}` (the 5 s robots budget, recorded instead of thrown) followed by `request_failed {reason: connection_error, error: ConnectTimeoutError}`; no browser attempt. Two `curl` probes of `https://www150.statcan.gc.ca/robots.txt` right after were reset by the peer after 12 s each, and the proxy's own status log shows a tunnel to this host closed mid-exchange earlier in the session. Whether the browser lane captures the months and values remains unverified from this environment.

**9. OWID.** `channelsTried: ['http','browser_local']`, 5.8 s. http attempt: `success`, HTTP 200, `quality_client_rendered {reason: js_fallback, markers: [hydration_state, js_fallback_marker], textChars: 11861, scriptChars: 32217}`, `warnings: [client_rendered_suspected]`. The ladder escalated (`trigger: quality_client_rendered`) and the browser lane returned `success` (HTTP 200, `browserMs` 4,236, `settled {networkIdle: true, settleMs: 2308}`) with `escalations: [{…, improved: true}]`. Markdown 23,875 chars, one table of 231 data rows with 6 cells: `| Country or region | 1750 | 2024 | 1750 to 2024 | Absolute Change | Relative Change |`; rows for United States and China present. Criterion (thin-content warning on http, browser renders the table rows): pass.

**11. data.gov.uk homepage.** `status: partial`, `lane: http`, HTTP 200, 21,603 bytes, `robots_checked {decision: allowed}`. Extract `strategy: article, confidence: 0`, then `extract_recovered {recovery: body}`; `warnings: [low_confidence_extraction]` ("…the cleaned page body is returned instead."). Markdown 3,861 chars, 96 lines: the page heading, the collections, publishers and links. The recovered body keeps the `[Skip to main content]` link at the top, as expected for a body-level recovery.

## Browser lane and the proxy CA

The first StatCan and JS-quotes attempts failed on the browser lane with `net::ERR_CERT_AUTHORITY_INVALID`. A standalone Playwright probe reproduced it against `https://example.com/` both through the proxy and without one: this environment terminates TLS on every outbound connection, Node trusts the CA through `NODE_EXTRA_CA_CERTS`, and Chromium reads the user NSS store, which was empty. Installing `libnss3-tools` and adding the CA (`certutil -d sql:$HOME/.pki/nssdb -A -t C,, -n … -i /root/.ccr/agent-proxy-ca.crt`) made the probe pass both ways; the service was restarted and the second attempts above followed. The session hook now does this at start-up when the CA file exists, and the README documents the two trust steps for any operator proxy that re-terminates TLS. W2L itself never disables certificate verification: the failures are recorded as `connection_error` with the Chromium error in `navigate_failed`.

## Fetch count

Real sites fetched in this re-check: books.toscrape.com 1, quotes.toscrape.com 2, en.wikipedia.org 1, www.data.gov.uk 1, ourworldindata.org 1, www150.statcan.gc.ca 2 page attempts (the second never connected) plus 2 `curl` probes of robots.txt (both reset), example.com 4 Chromium probes. robots.txt is fetched once per origin and lane for the life of the service; the service was restarted between the first and second attempts, so those origins were asked twice per lane.

## Still open after this run

- StatCan browser-lane capture (months, values, DOI): unverified here; re-run from the macOS network.
- Wikipedia chrome: the article body is clean of navboxes and the language list, but the top-of-page links, the legend table and footnote markers remain (M1 item 5, `onlyMainContent` and markdown leftovers).
- The spanned-header criterion of URL 6 still needs a page that has one.
- Findings 5–9 of the main record are untouched by this run.
