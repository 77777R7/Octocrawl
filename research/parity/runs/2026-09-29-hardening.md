# Real-site run 2026-09-29

Command: `node research/parity/run-sites.mjs --record research/parity/runs/2026-09-29-hardening.md`
Source commit: `4d4d1084373669ed7be5f9d2487273ebe20d350a`
Run: 2026-09-29T13:21:25.543Z → 2026-09-29T13:27:29.341Z against http://127.0.0.1:8844; cases naming an apiEnv against W2L_HOSTED_API_URL=http://127.0.0.1:8845
SDK: the built @w2l/sdk; W2L_API_TOKEN set in the runner's environment (its value is not recorded).
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 56 of 66 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 62/66 (1 skipped, not run); checks passing: 319/326 (skipped cases' checks not counted).

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
| L01 | https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | 10/10 | — |
| L02 | https://books.toscrape.com/ | 6/6 | — |
| L03 | https://quotes.toscrape.com/js/ | 7/7 | — |
| L04 | https://www.scrapethissite.com/pages/forms/?per_page=100 | 10/10 | — |
| L05 | https://webscraper.io/test-sites/tables | 4/4 | — |
| L06 | https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal) | 4/4 | — |
| L07 | https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000601 | 6/6 | — |
| L08 | https://www.gov.uk/government/statistics/subnational-electricity-and-gas-consumption-summary-report-2024/subnational-electricity-and-gas-consumption-summary-report-2024--2 | 16/16 | — |
| L09 | https://ourworldindata.org/grapher/co-emissions-per-capita?tab=table | 6/6 | — |
| L10 | https://www.apple.com/environment/ | 10/10 | — |
| L11 | https://www.data.gov.uk/search?q=energy | 3/3 | — |
| L12 | https://www.bls.gov/news.release/empsit.t01.htm | 3/3 | — |
| A10 | https://quotes.toscrape.com/ | 6/6 | — |
| A11 | https://www.gov.uk/government/statistics/subnational-electricity-and-gas-consumption-summary-report-2024/subnational-electricity-and-gas-consumption-summary-report-2024--2 | 7/7 | — |
| A12 | https://www.python.org/ | 8/8 | — |
| A13 | https://scrapethissite.com/pages/ | 4/4 | — |
| A14 | https://docs.python.org/3/ | 5/5 | — |
| A15 | https://www150.statcan.gc.ca/n1/en/type/data | 3/4 | crawlDelay (crawl-batch.crawl-delay) |
| E01 | https://books.toscrape.com/ | 10/10 | — |
| E02 | https://quotes.toscrape.com/js/ | 7/7 | — |
| E03 | https://books.toscrape.com/catalogue/does-not-exist-w2l/index.html | 6/6 | — |
| E04 | https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | 8/8 | — |
| E05 | https://books.toscrape.com/ https://quotes.toscrape.com/ https://books.toscrape.com/catalogue/does-not-exist-w2l/index.html | 4/4 | — |
| E06 | https://books.toscrape.com/ | 5/5 | — |
| A16 | https://en.wikipedia.org/wiki/Web_scraping | 8/8 | — |
| A17 | https://en.wikipedia.org/wiki/Web_scraping https://en.wikipedia.org/wiki/Web_crawler https://en.wikipedia.org/wiki/Data_scraping | 5/5 | — |
| A18 | http://github.com | 6/6 | — |
| A19 | https://httpbin.org/status/404 | 4/4 | — |
| A20 | https://quotes.toscrape.com/js-delayed/ | 2/2 | — |
| A21 | https://quotes.toscrape.com/js-delayed/ | 3/3 | — |
| A22 | https://httpbin.org/delay/10 | 5/5 | — |
| A23 | https://httpbin.org/delay/10 | 2/4 | field status (6); markdownIncludes "https://httpbin.org/delay/10" (6) |
| A24 | https://httpbin.org/delay/10 | 3/3 | — |
| A25 | https://httpbin.org/ip | 1/5 | field status (FS); field evidence.envProxy (9); field egress.reportedIp (9); field egress.reportedIp (9) |
| A26 | https://docs.python.org/3/tutorial/ | 7/7 | — |
| A27 | https://books.toscrape.com/ | 6/6 | — |
| A28 | https://en.wikipedia.org/wiki/Web_scraping https://en.wikipedia.org/wiki/Web_crawler https://en.wikipedia.org/wiki/Data_scraping https://en.wikipedia.org/wiki/Search_engine https://en.wikipedia.org/wiki/Web_archiving https://en.wikipedia.org/wiki/Robots.txt https://en.wikipedia.org/wiki/Sitemaps https://en.wikipedia.org/wiki/Hyperlink https://en.wikipedia.org/wiki/HTML https://en.wikipedia.org/wiki/World_Wide_Web | 7/7 | — |
| A29 | https://example.com/ | 7/7 | — |
| A30 | https://docs.python.org/3/ | 4/4 | — |
| A31 | https://docs.python.org/3/ | 4/4 | — |
| A32 | https://en.wikipedia.org/wiki/Web_crawler | 4/4 | — |
| A33 | https://books.toscrape.com/ | 6/6 | — |
| A34 | https://books.toscrape.com/catalogue/page-21.html https://books.toscrape.com/catalogue/page-22.html https://books.toscrape.com/catalogue/page-23.html https://books.toscrape.com/catalogue/page-24.html https://books.toscrape.com/catalogue/page-25.html https://books.toscrape.com/catalogue/page-26.html https://books.toscrape.com/catalogue/page-27.html https://books.toscrape.com/catalogue/page-28.html https://books.toscrape.com/catalogue/page-29.html https://books.toscrape.com/catalogue/page-30.html https://books.toscrape.com/catalogue/page-31.html https://books.toscrape.com/catalogue/page-32.html https://books.toscrape.com/catalogue/page-33.html https://books.toscrape.com/catalogue/page-34.html https://books.toscrape.com/catalogue/page-35.html https://books.toscrape.com/catalogue/page-36.html https://books.toscrape.com/catalogue/page-37.html https://books.toscrape.com/catalogue/page-38.html https://books.toscrape.com/catalogue/page-39.html https://books.toscrape.com/catalogue/page-40.html https://books.toscrape.com/catalogue/page-41.html https://books.toscrape.com/catalogue/page-42.html https://books.toscrape.com/catalogue/page-43.html https://books.toscrape.com/catalogue/page-44.html https://books.toscrape.com/catalogue/page-45.html https://books.toscrape.com/catalogue/page-46.html https://books.toscrape.com/catalogue/page-47.html https://books.toscrape.com/catalogue/page-48.html https://books.toscrape.com/catalogue/page-49.html https://books.toscrape.com/catalogue/page-50.html | 8/8 | — |
| A35 | https://books.toscrape.com/catalogue/page-1.html https://books.toscrape.com/catalogue/page-2.html https://books.toscrape.com/catalogue/page-3.html https://books.toscrape.com/catalogue/page-4.html https://books.toscrape.com/catalogue/page-5.html https://books.toscrape.com/catalogue/page-6.html https://books.toscrape.com/catalogue/page-7.html https://books.toscrape.com/catalogue/page-8.html https://books.toscrape.com/catalogue/page-9.html https://books.toscrape.com/catalogue/page-10.html https://books.toscrape.com/catalogue/page-11.html https://books.toscrape.com/catalogue/page-12.html https://books.toscrape.com/catalogue/page-13.html https://books.toscrape.com/catalogue/page-14.html https://books.toscrape.com/catalogue/page-15.html https://books.toscrape.com/catalogue/page-16.html https://books.toscrape.com/catalogue/page-17.html https://books.toscrape.com/catalogue/page-18.html https://books.toscrape.com/catalogue/page-19.html https://books.toscrape.com/catalogue/page-20.html https://quotes.toscrape.com/page/1/ https://quotes.toscrape.com/page/2/ https://quotes.toscrape.com/page/3/ https://quotes.toscrape.com/page/4/ https://quotes.toscrape.com/page/5/ https://quotes.toscrape.com/page/6/ https://quotes.toscrape.com/page/7/ https://quotes.toscrape.com/page/8/ https://quotes.toscrape.com/page/9/ https://quotes.toscrape.com/page/10/ https://quotes.toscrape.com/tag/love/ https://quotes.toscrape.com/tag/inspirational/ https://quotes.toscrape.com/tag/life/ https://quotes.toscrape.com/tag/humor/ https://quotes.toscrape.com/tag/books/ https://quotes.toscrape.com/tag/reading/ https://quotes.toscrape.com/tag/friendship/ https://quotes.toscrape.com/tag/friends/ https://quotes.toscrape.com/tag/truth/ https://quotes.toscrape.com/tag/simile/ https://en.wikipedia.org/wiki/Web_page https://en.wikipedia.org/wiki/Website https://en.wikipedia.org/wiki/URL https://en.wikipedia.org/wiki/Web_browser https://en.wikipedia.org/wiki/HTTP https://en.wikipedia.org/wiki/Markdown https://en.wikipedia.org/wiki/JSON https://en.wikipedia.org/wiki/Comma-separated_values https://en.wikipedia.org/wiki/Web_indexing https://en.wikipedia.org/wiki/Metadata | 5/5 | — |
| A36 | https://www.sec.gov/Archives/edgar/data/1878848/000187884826000015/iren-20251231.htm | skipped | W2L_CONTACT is not set |

Recorded values:

- L06 traceEvent summary.attempts.0.result.trace: [{"name":"sec-ch-ua","value":"\"Chromium\";v=\"128\", \"Google Chrome\";v=\"128\", \"Not;A=Brand\";v=\"24\""},{"name":"sec-ch-ua-mobile","value":"?0"},{"name":"sec-ch-ua-platform","value":"\"macOS\""},{"name":"user-agent","value":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"}]
- L11 fetchSpacing: 3 fetches, smallest gap 251 ms, required 0 ms; robots.txt HTTP 200, Crawl-delay none, seed allowed
- A13 field startMs: 5
- A14 field progress.maxPagesFetchedWhileRunning: 26
- A15 fetchSpacing: 3 fetches, smallest gap 2001 ms, required 0 ms; robots.txt TypeError: fetch failed
- A15 crawlDelay: 3 fetches, 0 without a crawl_delay event, smallest recorded gap 2000 ms, robots.txt Crawl-delay none, 2 later pages not naming it
- E01 evidenceSchema: valid (http, success)
- E02 evidenceSchema: valid (browser_local, success)
- E03 evidenceSchema: valid (http, failed)
- E04 evidenceSchema: valid (http, success)
- A22 field elapsedMs: 3004
- A23 field elapsedMs: 10996
- A25 field egress.reportedIp: null vs 23.132.124.145
- A26 field timeoutProbe.elapsedMs: 1002
- A34 field progress.maxCompletedWhileRunning: 27
- A35 field startMs: 7
- A35 hostSpacing: 50 fetches on 3 hosts, 0 without a crawl_delay event, smallest same-host gap 251 ms, required 250 ms, 0 gaps shorter

Failed checks with the observed value:

- A15 [crawl-batch.crawl-delay] crawlDelay: 3 fetches, 0 without a crawl_delay event, smallest recorded gap 2000 ms, robots.txt Crawl-delay none, 2 later pages not naming it
- A23 [6] field `status`: failed
- A23 [6] markdownIncludes `https://httpbin.org/delay/10`: no markdown
- A25 [FS] field `status`: failed
- A25 [9] field `evidence.envProxy`: undefined
- A25 [9] field `egress.reportedIp`: object
- A25 [9] field `egress.reportedIp`: null vs 23.132.124.145
