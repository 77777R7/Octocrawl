# Real-site run 2026-10-06

Command: `node research/parity/run-sites.mjs --batch lists --record research/parity/runs/2026-10-06-lists-proxied-603d71d.md`
Source commit: `603d71d6fa9db0e0fcc9f6af4a239bf011a13bcc`
Run: 2026-10-06T03:19:10.553Z → 2026-10-06T03:23:07.669Z against http://127.0.0.1:8787
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 8 of 8 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 7/8; checks passing: 29/34.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| LS01 | https://quotes.toscrape.com/scroll | 4/4 | — |
| LS02 | https://quotes.toscrape.com/js/ | 1/6 | field status (list-paginate); field actions.lists.0.stoppedBy (list-paginate); field actions.lists.0.rounds (list-paginate); field actions.lists.0.itemsRead (list-paginate); field actions.scrapes.length (list-paginate) |
| LS03 | https://books.toscrape.com/catalogue/category/books/mystery_3/index.html | 4/4 | — |
| LS04 | https://webscraper.io/test-sites/e-commerce/more/computers/laptops | 4/4 | — |
| LS05 | https://webscraper.io/test-sites/e-commerce/scroll/computers/laptops | 4/4 | — |
| LS06 | https://webscraper.io/test-sites/e-commerce/ajax/computers/laptops | 4/4 | — |
| LS07 | https://www.scrapethissite.com/pages/forms/ | 5/5 | — |
| LS08 | https://quotes.toscrape.com/scroll | 3/3 | — |

Failed checks with the observed value:

- LS02 [list-paginate] field `status`: failed
- LS02 [list-paginate] field `actions.lists.0.stoppedBy`: absent
- LS02 [list-paginate] field `actions.lists.0.rounds`: absent
- LS02 [list-paginate] field `actions.lists.0.itemsRead`: absent
- LS02 [list-paginate] field `actions.scrapes.length`: 0
