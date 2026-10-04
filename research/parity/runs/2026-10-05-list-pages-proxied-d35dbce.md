# Real-site run 2026-10-04

Command: `node research/parity/run-sites.mjs --batch actions --only AC01,AC05,AC07,AC08,AC09,AC13,AC14 --record research/parity/runs/2026-10-05-list-pages-proxied-d35dbce.md`
Source commit: `d35dbce2e07fbbf435f635410eeef9d2e3feab52`
Run: 2026-10-04T18:19:09.845Z → 2026-10-04T18:20:04.130Z against http://127.0.0.1:8787
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 7 of 7 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 2/7; checks passing: 25/31.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| AC01 | https://quotes.toscrape.com/js/ | 6/7 | field status (actions-pipeline) |
| AC05 | https://quotes.toscrape.com/scroll | 2/4 | field status (action-scroll); field actions.javascriptReturns.1.value (action-scroll) |
| AC07 | https://webscraper.io/test-sites/e-commerce/more/computers/laptops | 2/3 | field status (action-click) |
| AC08 | https://webscraper.io/test-sites/e-commerce/scroll/computers/laptops | 2/3 | field status (action-scroll) |
| AC09 | https://webscraper.io/test-sites/e-commerce/ajax/computers/laptops | 3/4 | field status (action-click) |
| AC13 | https://quotes.toscrape.com/js/ | 7/7 | — |
| AC14 | https://quotes.toscrape.com/scroll | 3/3 | — |

Failed checks with the observed value:

- AC01 [actions-pipeline] field `status`: failed
- AC05 [action-scroll] field `status`: failed
- AC05 [action-scroll] field `actions.javascriptReturns.1.value`: 20
- AC07 [action-click] field `status`: failed
- AC08 [action-scroll] field `status`: failed
- AC09 [action-click] field `status`: failed
