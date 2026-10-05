# Real-site run 2026-10-05

Command: `node research/parity/run-sites.mjs --batch map --record research/parity/runs/2026-10-05-map-robots-user-urls-40f1f58.md`
Source commit: `40f1f58ec370b8a8f1028ecc989050c4747a062c`
Run: 2026-10-05T08:33:07.466Z → 2026-10-05T08:34:08.825Z against http://127.0.0.1:8787
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 0 of 18 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 16/18 (2 skipped, not run); checks passing: 157/157 (skipped cases' checks not counted).

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| MP01 | https://www.sitemaps.org/ | 20/20 | — |
| MP02 | https://books.toscrape.com/ | 12/12 | — |
| MP03 | https://docs.python.org/3/ | 10/10 | — |
| MP04 | https://developer.mozilla.org/en-US/docs/Web/HTTP | 13/13 | — |
| MP05 | https://www.gov.uk/ | 14/14 | — |
| MP06 | https://www.gov.uk/ | 8/8 | — |
| MP07 | https://www.sitemaps.org/ | 10/10 | — |
| MP08 | https://www.sitemaps.org/ | 8/8 | — |
| MP09 | https://www.gov.uk/ | 11/11 | — |
| MP10 | https://www.sitemaps.org/ | 6/6 | — |
| MP11 | https://docs.stripe.com/ | 10/10 | — |
| MP12 | https://books.toscrape.com/ | 6/6 | — |
| MP13 | https://python.org/ | 8/8 | — |
| MP14 | https://python.org/ | 6/6 | — |
| MP15 | https://www.scrapethissite.com/pages/forms/?per_page=100 | 7/7 | — |
| MP16 | https://www.scrapethissite.com/pages/forms/?per_page=100 | 8/8 | — |
| MP17 | https://developer.mozilla.org/en-US/docs/Web/HTTP | skipped | W2L_MCP_MAP_URL is not set |
| MP18 | https://docs.python.org/3/ | skipped | W2L_MCP_MAP_URL is not set |

Recorded values:

- MP01 countWhere: 87 of 87
- MP01 field sources.sitemap.files.0.entries: 84
- MP01 field refused.hostDenied: 1
- MP01 field elapsedMs: 4326
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
- MP05 field refused.overLimit: 24553
- MP06 countWhere: 25053 of 25053
- MP06 field elapsedMs: 3003
- MP06 field roundTripMs: 3415
- MP07 countWhere: 84 of 84
- MP08 countWhere: 4 of 4
- MP08 field compare.links: 87
- MP09 field refused.robots: 0
- MP10 countWhere: 84 of 84
- MP11 countWhere: 22 of 22
- MP11 field compare.links: 4928
- MP11 field refused.searchFiltered: 4906
- MP12 field refused.searchFiltered: 72
- MP13 countWhere: 86 of 86
- MP13 countWhere: 23 of 86
- MP13 field hostCount: 13
- MP13 field refused.hostDenied: 40
- MP14 countWhere: 63 of 63
- MP14 field refused.hostDenied: 64
