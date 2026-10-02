# Real-site run 2026-10-03: map endpoint (M3 batch A)

Command: `node research/parity/run-sites.mjs --only MP01,MP02,MP03,MP04,MP05,MP06 --record research/parity/runs/2026-10-03-m3-map-endpoint.md`
Source commit: `256aeca947f635a998f84bb33bc1368545da28f6`
Run: 2026-10-02T19:14:43.841Z → 2026-10-02T19:15:04.094Z against http://127.0.0.1:8837
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 0 of 6 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 6/6; checks passing: 77/77.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| MP01 | https://www.sitemaps.org/ | 20/20 | — |
| MP02 | https://books.toscrape.com/ | 12/12 | — |
| MP03 | https://docs.python.org/3/ | 10/10 | — |
| MP04 | https://developer.mozilla.org/en-US/docs/Web/HTTP | 13/13 | — |
| MP05 | https://www.gov.uk/ | 14/14 | — |
| MP06 | https://www.gov.uk/ | 8/8 | — |

Recorded values:

- MP01 countWhere: 87 of 87
- MP01 field sources.sitemap.files.0.entries: 84
- MP01 field refused.hostDenied: 1
- MP01 field elapsedMs: 4232
- MP01 countWhere: 84 of 87
- MP01 countWhere: 84 of 87
- MP02 countWhere: 73 of 73
- MP02 countWhere: 73 of 73
- MP02 field refused.collapsed: 1
- MP03 countWhere: 24 of 24
- MP03 field refused.subtreeDenied: 28
- MP03 field refused.hostDenied: 12
- MP04 countWhere: 378 of 378
- MP04 countWhere: 376 of 378
- MP04 countWhere: 375 of 378
- MP04 countWhere: 377 of 378
- MP04 field sources.sitemap.files.length: 11
- MP05 field sources.sitemap.files.length: 2
- MP05 field refused.overLimit: 24544
- MP06 countWhere: 25044 of 25044
- MP06 field elapsedMs: 3002
- MP06 field roundTripMs: 3373

## How it was run

- API: `W2L_API_PORT=8837 W2L_TASK_ROOT=.w2l/api node --import tsx packages/api/src/cli.ts` (local mode) at the source commit above, after `npx tsc --build`; then `W2L_API_URL=http://127.0.0.1:8837 node research/parity/run-sites.mjs --only MP01,MP02,MP03,MP04,MP05,MP06 --record …`. The runner wrote the record into the scratchpad and it was copied here with the `--record` path and this heading changed; the header's run times are UTC (03:14 to 03:15 on 2026-10-03 local time, UTC+8).
- Network: proxied. The API printed `outbound https: and http: requests use the environment proxy 127.0.0.1:7890` at startup, and every sitemap file record of the six responses says `proxyUsed: true`. A map response carries no `evidence.envProxy`, which is why the runner's network line counts 0 of 6.
- Raw responses: `.w2l/parity/2026-10-02T19-14-43-799Z/` (git-ignored).

## What the responses showed

| Case | status / stoppedBy | links | start page | sitemap files read | refused (non-zero) | elapsedMs |
| --- | --- | --- | --- | --- | --- | --- |
| MP01 www.sitemaps.org | completed / null | 87 | 200, 5 links, title `sitemaps.org - Home` | 1 urlset, 84 entries | duplicate 2, hostDenied 1 | 4,232 |
| MP02 books.toscrape.com | completed / null | 73, all `no_robots` | 200, 73 links | `/sitemap.xml` (guessed) absent, 404 | collapsed 1 | 4,346 |
| MP03 docs.python.org/3/ | completed / null | 24 | 200, 57 links | 1 urlset, 8 entries | duplicate 2, hostDenied 12, subtreeDenied 28 | 1,518 |
| MP04 developer.mozilla.org/en-US/docs/Web/HTTP | completed / null | 378 | 200, 499 links | index + 10 `.xml.gz` children, all urlset | duplicate 376, hostDenied 26, subtreeDenied 66,867 | 4,322 |
| MP05 www.gov.uk, limit 500 | completed / limit | 500 | 200, 57 links | index + `sitemap_1.xml` (25,000 entries), truncated `urls` | duplicate 3, hostDenied 3, overLimit 24,544 | 2,373 |
| MP06 www.gov.uk, limit 100000, timeout 3000 | partial / timeout | 25,044 | 200, 57 links | index, `sitemap_1.xml`, `sitemap_2.xml` unreadable/`timeout`; truncated `time` | duplicate 3, hostDenied 3 | 3,002 (round trip 3,373) |

- MP01: the home URL is the first link, `via: ["start", "sitemap"]`, titled by its page; faq.php, protocol.php and terms.php are `via: ["link"]` with their anchor text; all 84 sitemap links carry `lastmod`. 83 of the 84 sitemap entries were new links (the home URL merged).
- MP03: the sitemap's `/3/` entry merged into the start link; its other 7 entries are among the 28 subtree refusals, as planned. The audit's "100 docs.python.org URLs" is not reachable this way (24 links): a map reads one page and the sitemap lists only 8 version roots, as the README's account of what a map does not do says.
- MP04: 376 links titled, 375 by anchor text, 377 with `via` including `sitemap`. The map read all ten locale sitemaps, as the plan expected, which is where the 66,867 subtree refusals come from.
- MP05: `limit 0` and `limit -1` answered HTTP 400 `limit must be an integer from 1 to 100000`. After the 500th link the reader still offered the rest of `sitemap_1.xml` (24,992 entries listed in all), which is what `overLimit` counts; no further file was read.
- MP06: warnings `map_timeout` (`the map stopped at its 3000 ms timeout after 3002 ms with 25044 links; 33 sitemap files were not read`) and `sitemap_unreadable` for the aborted `sitemap_2.xml`, and the hint to raise `timeout` (up to 300000 ms on this server) or lower `limit`.

## Anchor titles against the pages' own titles (MP04)

Not part of the case checks; run once after it with the same API. Ten anchor-titled links of the MP04 response, every 37th (a fixed step over the 375 anchor-titled links), were scraped with `POST /v1/scrape {url, debug: false, fastMode: true, formats: ["markdown"]}` and the anchor text compared, case-insensitively, with the page's `metadata.title`: 10 of 10 contained (for example `cookies` in `Using HTTP cookies - HTTP | MDN`, `base-uri` in `Content-Security-Policy: base-uri directive - HTTP | MDN`). All ten scrapes were `success` on the http lane. The plan's expectation was at least 8 of 10. A map title is anchor text by design, not the target's `<title>`; this shows containment on one site only.

## Fetch count

- Page bodies: one per map (the start URL, http lane), 6 in all (www.gov.uk's home page twice, MP05 and MP06), plus the 10 MDN pages of the title check. No browser was started.
- Sitemap files: 19 requests (MP01 1, MP02 1 answered 404, MP03 1, MP04 11, MP05 2, MP06 3, the third aborted at the deadline).
- robots.txt: read through the API's shared cache, once per origin per process as designed (www.sitemaps.org, books.toscrape.com (404), docs.python.org, developer.mozilla.org, www.gov.uk); the number of robots.txt requests was not counted separately in this run.
- Hosts the maps refused by scope (creativecommons.org, python.org's other hosts, MDN's other hosts, gov.uk's other hosts) were not requested.

## Not covered by this run

- Hosted mode (caps 5,000 / 60,000, no proxy, the browser-only refusal, the rate limit) is fixture-tested in `packages/api/test/map.test.ts`, not run against a hosted API.
- A client disconnect cancelling a map and leaving no record is covered by the runner's unit test (caller cancellation throws), not by an end-to-end test.
