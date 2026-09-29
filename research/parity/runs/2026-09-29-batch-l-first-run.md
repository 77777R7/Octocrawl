# Real-site run 2026-09-29

Command: `node research/parity/run-sites.mjs --batch L --record research/parity/runs/2026-09-29-batch-l-first-run.md`
Source commit: `6aef7e76900c58128ff182ea10055046c0fe2160`
Run: 2026-09-29T07:57:55.453Z → 2026-09-29T07:59:16.653Z against http://127.0.0.1:8806
Network: HTTPS_PROXY, HTTP_PROXY set in the runner's environment; W2L does not read them, so a site reachable only through that proxy fails.

Cases fully passing: 7/12; checks passing: 72/85.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| L01 | https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | 8/10 | fieldType json.data.price (scrape-formats.json-typed-schema); field json.data.price (scrape-formats.json) |
| L02 | https://books.toscrape.com/ | 5/6 | itemCount (crawl-batch.page-limit) |
| L03 | https://quotes.toscrape.com/js/ | 7/7 | — |
| L04 | https://www.scrapethissite.com/pages/forms/?per_page=100 | 10/10 | — |
| L05 | https://webscraper.io/test-sites/tables | 4/4 | — |
| L06 | https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal) | 0/4 | field status (FS); table (3); table (3); traceEvent summary.attempts.0.result.trace (scrape-execution.execution-metadata) |
| L07 | https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000601 | 6/6 | — |
| L08 | https://www.gov.uk/government/statistics/subnational-electricity-and-gas-consumption-summary-report-2024/subnational-electricity-and-gas-consumption-summary-report-2024--2 | 16/16 | — |
| L09 | https://ourworldindata.org/grapher/co-emissions-per-capita?tab=table | 2/6 | anyOf (scrape-formats.response-warnings-hints); field lane (scrape-execution.proxy-auto); table (FS); markdownMatches (FS) |
| L10 | https://www.apple.com/environment/ | 8/10 | markdownMatches (3); markdownMatches (3) |
| L11 | https://www.data.gov.uk/search?q=energy | 3/3 | — |
| L12 | https://www.bls.gov/news.release/empsit.t01.htm | 3/3 | — |

Recorded values:

- L06 traceEvent summary.attempts.0.result.trace: no trace
- L11 fetchSpacing: 3 fetches, smallest gap 250 ms, required 0 ms; robots.txt HTTP 200, Crawl-delay none, seed allowed

Failed checks with the observed value:

- L01 [scrape-formats.json-typed-schema] fieldType `json.data.price`: undefined
- L01 [scrape-formats.json] field `json.data.price`: absent
- L02 [crawl-batch.page-limit] itemCount: 59
- L06 [FS] field `status`: absent
- L06 [3] table `^Country/Territory$ ^\[?IMF\b.*\(20[0-9]{2}\) ^\[?World Bank\b.*\(20[0-9]{2}\) ^\[?United Nations\b.*\(20[0-9]{2}\)`: 0 tables with this header
- L06 [3] table `^Regional groupings$ ^\[?IMF\b.*\(20[0-9]{2}\) ^\[?World Bank\b.*\(20[0-9]{2}\)`: 0 tables with this header
- L06 [scrape-execution.execution-metadata] traceEvent `summary.attempts.0.result.trace`: no trace
- L09 [scrape-formats.response-warnings-hints] anyOf: x | x
- L09 [scrape-execution.proxy-auto] field `lane`: http
- L09 [FS] table `^Country or region$ ^[0-9]{4}$ ^[0-9]{4}$ ^[0-9]{4} to [0-9]{4}$ ^Absolute Change$ ^Relative Change$`: 0 tables with this header
- L09 [FS] markdownMatches `^\|\s*Canada\s*\|[^\n]*\|\s*[0-9]+\.[0-9]+\s*t\s*\|`: absent
- L10 [3] markdownMatches `(?<![0-9.,])50%\s*less aluminum to manufacture the enclosure`: absent
- L10 [3] markdownMatches `(?<![0-9.,])70%\s*water reuse rate during anodization of the enclosure`: absent
