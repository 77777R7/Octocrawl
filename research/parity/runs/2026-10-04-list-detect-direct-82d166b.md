# Real-site run 2026-10-04

Command: `node research/parity/run-sites.mjs --batch list-detect --record research/parity/runs/2026-10-04-list-detect-direct-82d166b.md`
Source commit: `82d166b3b0c00dd164549dee2ec22f7e4b314e55`
Run: 2026-10-04T09:19:44.524Z → 2026-10-04T09:19:58.608Z against http://127.0.0.1:8787
Network: NO_PROXY set in the runner's environment; 0 of 7 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 6/7; checks passing: 28/30.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| LD01 | https://books.toscrape.com/catalogue/category/books/mystery_3/index.html | 6/6 | — |
| LD02 | https://quotes.toscrape.com/ | 4/4 | — |
| LD03 | https://www.scrapethissite.com/pages/forms/ | 4/4 | — |
| LD04 | https://news.ycombinator.com/ | 1/3 | field list.itemSelector (list-detect); field list.records.length (list-detect) |
| LD05 | https://www.scrapethissite.com/pages/simple/ | 4/4 | — |
| LD06 | https://webscraper.io/test-sites/e-commerce/allinone/computers/laptops | 4/4 | — |
| LD07 | https://example.com/ | 5/5 | — |

Failed checks with the observed value:

- LD04 [list-detect] field `list.itemSelector`: absent
- LD04 [list-detect] field `list.records.length`: absent
