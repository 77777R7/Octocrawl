# Real-site run 2026-10-04

Command: `node research/parity/run-sites.mjs --batch tables --record research/parity/runs/2026-10-05-tables-proxied-d35dbce.md`
Source commit: `d35dbce2e07fbbf435f635410eeef9d2e3feab52`
Run: 2026-10-04T18:36:54.396Z → 2026-10-04T18:37:17.382Z against http://127.0.0.1:8787
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 10 of 10 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 9/10; checks passing: 37/40.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| TB01 | https://www.scrapethissite.com/pages/forms/ | 4/4 | — |
| TB02 | https://webscraper.io/test-sites/tables | 4/4 | — |
| TB03 | https://webscraper.io/test-sites/tables/tables-multiple-header-rows | 4/4 | — |
| TB04 | https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal) | 4/4 | — |
| TB05 | https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population | 4/4 | — |
| TB06 | https://www.gov.uk/government/statistics/subnational-electricity-and-gas-consumption-summary-report-2024/subnational-electricity-and-gas-consumption-summary-report-2024--2 | 4/4 | — |
| TB07 | https://www.eia.gov/electricity/annual/html/epa_01_01.html | 1/4 | field status (tables-csv); tablesConsistent (tables-csv); eachItem tables (tables-csv) |
| TB08 | https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | 4/4 | — |
| TB09 | https://www.bls.gov/news.release/empsit.t01.htm | 4/4 | — |
| TB10 | https://ourworldindata.org/grapher/co-emissions-per-capita?tab=table | 4/4 | — |

Failed checks with the observed value:

- TB07 [tables-csv] field `status`: failed
- TB07 [tables-csv] tablesConsistent: no tables
- TB07 [tables-csv] eachItem `tables`: 0 items, 0 failing
