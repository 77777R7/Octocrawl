# Real-site run 2026-09-29

Command: `node research/parity/run-sites.mjs --record research/parity/runs/2026-09-29-computed-blocks.md`
Source commit: `e04f0f8ba6357b9da3eaa93381b0c096f87576a2`
Run: 2026-09-29T09:31:14.140Z → 2026-09-29T09:33:49.619Z against http://127.0.0.1:8815
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 29 of 33 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 30/33; checks passing: 142/149.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| S01 | https://books.toscrape.com/ | 7/7 | — |
| S02 | https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | 4/4 | — |
| S03 | https://books.toscrape.com/catalogue/does-not-exist-w2l/index.html | 3/3 | — |
| S04 | https://quotes.toscrape.com/ | 6/6 | — |
| S05 | https://quotes.toscrape.com/js/ | 3/3 | — |
| S06 | https://quotes.toscrape.com/js-delayed/ | 2/2 | — |
| S07 | https://www.scrapethissite.com/pages/simple/ | 4/4 | — |
| S08 | https://www.scrapethissite.com/pages/forms/ | 3/3 | — |
| S09 | https://docs.github.com/en/get-started/git-basics/setting-your-username-in-git | 5/5 | — |
| S10 | https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population | 4/4 | — |
| S11 | https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1710000901 | 2/2 | — |
| S12 | https://www.bls.gov/news.release/empsit.nr0.htm | 1/1 | — |
| A01 | https://books.toscrape.com/ https://quotes.toscrape.com/ | 2/2 | — |
| A02 | https://quotes.toscrape.com/ | 1/1 | — |
| A03 | https://quotes.toscrape.com/ | 1/1 | — |
| A04 | https://quotes.toscrape.com/ | 2/2 | — |
| A05 | https://books.toscrape.com/ | 2/2 | — |
| A06 | https://books.toscrape.com/ | 3/3 | — |
| A07 | https://quotes.toscrape.com/ | 5/5 | — |
| A08 | https://quotes.toscrape.com/js-delayed/ | 2/2 | — |
| A09 | https://quotes.toscrape.com/js-delayed/ | 2/2 | — |
| L01 | https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | 8/10 | fieldType json.data.price (scrape-formats.json-typed-schema); field json.data.price (scrape-formats.json) |
| L02 | https://books.toscrape.com/ | 5/6 | itemCount (crawl-batch.page-limit) |
| L03 | https://quotes.toscrape.com/js/ | 7/7 | — |
| L04 | https://www.scrapethissite.com/pages/forms/?per_page=100 | 10/10 | — |
| L05 | https://webscraper.io/test-sites/tables | 4/4 | — |
| L06 | https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal) | 4/4 | — |
| L07 | https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000601 | 6/6 | — |
| L08 | https://www.gov.uk/government/statistics/subnational-electricity-and-gas-consumption-summary-report-2024/subnational-electricity-and-gas-consumption-summary-report-2024--2 | 16/16 | — |
| L09 | https://ourworldindata.org/grapher/co-emissions-per-capita?tab=table | 2/6 | anyOf (scrape-formats.response-warnings-hints); field lane (scrape-execution.proxy-auto); table (FS); markdownMatches (FS) |
| L10 | https://www.apple.com/environment/ | 10/10 | — |
| L11 | https://www.data.gov.uk/search?q=energy | 3/3 | — |
| L12 | https://www.bls.gov/news.release/empsit.t01.htm | 3/3 | — |

Recorded values:

- L06 traceEvent summary.attempts.0.result.trace: [{"name":"sec-ch-ua","value":"\"Chromium\";v=\"128\", \"Google Chrome\";v=\"128\", \"Not;A=Brand\";v=\"24\""},{"name":"sec-ch-ua-mobile","value":"?0"},{"name":"sec-ch-ua-platform","value":"\"macOS\""},{"name":"user-agent","value":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"}]
- L11 fetchSpacing: 3 fetches, smallest gap 251 ms, required 0 ms; robots.txt HTTP 200, Crawl-delay none, seed allowed

Failed checks with the observed value:

- L01 [scrape-formats.json-typed-schema] fieldType `json.data.price`: undefined
- L01 [scrape-formats.json] field `json.data.price`: absent
- L02 [crawl-batch.page-limit] itemCount: 59
- L09 [scrape-formats.response-warnings-hints] anyOf: x | x
- L09 [scrape-execution.proxy-auto] field `lane`: http
- L09 [FS] table `^Country or region$ ^[0-9]{4}$ ^[0-9]{4}$ ^[0-9]{4} to [0-9]{4}$ ^Absolute Change$ ^Relative Change$`: 0 tables with this header
- L09 [FS] markdownMatches `^\|\s*Canada\s*\|[^\n]*\|\s*[0-9]+\.[0-9]+\s*t\s*\|`: absent
