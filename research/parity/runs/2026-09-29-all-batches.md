# Real-site run 2026-09-29

Command: `node research/parity/run-sites.mjs --record research/parity/runs/2026-09-29-all-batches.md`
Source commit: `ed60ca2f7a661c0fcf33aa36a22eac25d33d71de`
Run: 2026-09-29T08:01:50.871Z → 2026-09-29T08:03:51.893Z against http://127.0.0.1:8797
Network: HTTPS_PROXY, HTTP_PROXY set in the runner's environment; W2L does not read them, so a site reachable only through that proxy fails.

Cases fully passing: 23/30; checks passing: 124/140.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| S01 | https://books.toscrape.com/ | 7/7 | — |
| S02 | https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | 4/4 | — |
| S03 | https://books.toscrape.com/catalogue/does-not-exist-w2l/index.html | 3/3 | — |
| S04 | https://quotes.toscrape.com/ | 6/6 | — |
| S05 | https://quotes.toscrape.com/js/ | 2/3 | markdownExcludes "thinking.”by" (3) |
| S06 | https://quotes.toscrape.com/js-delayed/ | 0/2 | field status (6); markdownIncludes "The world as we have created it is a process of our thinking." (6) |
| S07 | https://www.scrapethissite.com/pages/simple/ | 4/4 | — |
| S08 | https://www.scrapethissite.com/pages/forms/ | 3/3 | — |
| S09 | https://docs.github.com/en/get-started/git-basics/setting-your-username-in-git | 5/5 | — |
| S10 | https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population | 1/4 | field status (FS); markdownMatches (3); markdownLinksAbsolute (4) |
| S11 | https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1710000901 | 2/2 | — |
| S12 | https://www.bls.gov/news.release/empsit.nr0.htm | 1/1 | — |
| A01 | https://books.toscrape.com/ https://quotes.toscrape.com/ | 2/2 | — |
| A02 | https://quotes.toscrape.com/ | 1/1 | — |
| A03 | https://quotes.toscrape.com/ | 1/1 | — |
| A04 | https://quotes.toscrape.com/ | 2/2 | — |
| A05 | https://books.toscrape.com/ | 2/2 | — |
| A06 | https://books.toscrape.com/ | 3/3 | — |
| L01 | https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | 8/10 | fieldType json.data.price (scrape-formats.json-typed-schema); field json.data.price (scrape-formats.json) |
| L02 | https://books.toscrape.com/ | 5/6 | itemCount (crawl-batch.page-limit) |
| L03 | https://quotes.toscrape.com/js/ | 7/7 | — |
| L04 | https://www.scrapethissite.com/pages/forms/?per_page=100 | 10/10 | — |
| L05 | https://webscraper.io/test-sites/tables | 4/4 | — |
| L06 | https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal) | 1/4 | field status (FS); table (3); table (3) |
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

- S05 [3] markdownExcludes `thinking.”by`: present
- S06 [6] field `status`: absent
- S06 [6] markdownIncludes `The world as we have created it is a process of our thinking.`: no markdown
- S10 [FS] field `status`: failed
- S10 [3] markdownMatches `^\|[^\n]*India[^\n]*\|`: no markdown
- S10 [4] markdownLinksAbsolute: no markdown
- L01 [scrape-formats.json-typed-schema] fieldType `json.data.price`: undefined
- L01 [scrape-formats.json] field `json.data.price`: absent
- L02 [crawl-batch.page-limit] itemCount: 59
- L06 [FS] field `status`: failed
- L06 [3] table `^Country/Territory$ ^\[?IMF\b.*\(20[0-9]{2}\) ^\[?World Bank\b.*\(20[0-9]{2}\) ^\[?United Nations\b.*\(20[0-9]{2}\)`: 0 tables with this header
- L06 [3] table `^Regional groupings$ ^\[?IMF\b.*\(20[0-9]{2}\) ^\[?World Bank\b.*\(20[0-9]{2}\)`: 0 tables with this header
- L09 [scrape-formats.response-warnings-hints] anyOf: x | x
- L09 [scrape-execution.proxy-auto] field `lane`: http
- L09 [FS] table `^Country or region$ ^[0-9]{4}$ ^[0-9]{4}$ ^[0-9]{4} to [0-9]{4}$ ^Absolute Change$ ^Relative Change$`: 0 tables with this header
- L09 [FS] markdownMatches `^\|\s*Canada\s*\|[^\n]*\|\s*[0-9]+\.[0-9]+\s*t\s*\|`: absent
