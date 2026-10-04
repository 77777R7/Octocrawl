# Real-site run 2026-10-04

Command: `node research/parity/run-sites.mjs --batch list-records --record research/parity/runs/2026-10-04-list-records-direct-82d166b.md`
Source commit: `82d166b3b0c00dd164549dee2ec22f7e4b314e55`
Run: 2026-10-04T09:16:12.795Z → 2026-10-04T09:19:44.437Z against http://127.0.0.1:8787
Network: NO_PROXY set in the runner's environment; 0 of 6 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 4/6; checks passing: 23/27.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| LR01 | https://books.toscrape.com/catalogue/category/books/mystery_3/index.html | 7/7 | — |
| LR02 | https://quotes.toscrape.com/js/ | 5/5 | — |
| LR03 | https://www.scrapethissite.com/pages/forms/ | 2/4 | field list.records.length (list-records); field list.pages (list-records) |
| LR04 | https://webscraper.io/test-sites/e-commerce/ajax/computers/laptops | 4/4 | — |
| LR05 | https://quotes.toscrape.com/ | 4/4 | — |
| LR06 | https://news.ycombinator.com/ | 1/3 | field list.records.length (list-records); field list.records.0.values.url (list-records) |

Failed checks with the observed value:

- LR03 [list-records] field `list.records.length`: 25
- LR03 [list-records] field `list.pages`: 1
- LR06 [list-records] field `list.records.length`: absent
- LR06 [list-records] field `list.records.0.values.url`: absent
