# Real-site run 2026-10-20

Command: `node research/parity/run-sites.mjs --only L02,L04,L11,A13,A14,A15,A26,A27,A28,A29,A30,A31,A32,A33,A34,A35 --record research/hosted/2026-10-20-h1-parity-hosted-r3-0ebe8cdf.md`
Source commit: `0ebe8cdfb520949b06595f304bf0888682d39416`
Run: 2026-10-20T03:04:20.969Z → 2026-10-20T03:08:26.899Z against https://api.octocrawl.dev; cases naming an apiEnv against W2L_HOSTED_API_URL=https://api.octocrawl.dev
SDK: the built @w2l/sdk; W2L_API_TOKEN set in the runner's environment (its value is not recorded).
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 0 of 16 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 9/16; checks passing: 75/90.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| L02 | https://books.toscrape.com/ | 6/6 | — |
| L04 | https://www.scrapethissite.com/pages/forms/?per_page=100 | 10/10 | — |
| L11 | https://www.data.gov.uk/search?q=energy | 1/3 | field status (crawl-batch.crawl-status); anyOf (crawl-batch.robots-txt-controls) |
| A13 | https://scrapethissite.com/pages/ | 3/4 | field startMs (crawl-batch.crawl-start-async) |
| A14 | https://docs.python.org/3/ | 4/5 | field report.pagesFetched (crawl-batch.crawl-status) |
| A15 | https://www150.statcan.gc.ca/n1/en/type/data | 4/4 | — |
| A26 | https://docs.python.org/3/tutorial/ | 7/7 | — |
| A27 | https://books.toscrape.com/ | 6/6 | — |
| A28 | https://en.wikipedia.org/wiki/Web_scraping https://en.wikipedia.org/wiki/Web_crawler https://en.wikipedia.org/wiki/Data_scraping https://en.wikipedia.org/wiki/Search_engine https://en.wikipedia.org/wiki/Web_archiving https://en.wikipedia.org/wiki/Robots.txt https://en.wikipedia.org/wiki/Sitemaps https://en.wikipedia.org/wiki/Hyperlink https://en.wikipedia.org/wiki/HTML https://en.wikipedia.org/wiki/World_Wide_Web | 7/7 | — |
| A29 | https://example.com/ | 5/7 | field withoutToken.status (platform.client.api-key); field withoutToken.code (platform.client.api-key) |
| A30 | https://docs.python.org/3/ | 1/4 | field status (7); field report.pagesFetched (7); itemUrls (7) |
| A31 | https://docs.python.org/3/ | 1/4 | field status (7); field report.pagesFetched (7); itemUrls (7) |
| A32 | https://en.wikipedia.org/wiki/Web_crawler | 1/4 | field report.budgetExceeded (crawl-batch.page-limit); field report.pagesFetched (crawl-batch.page-limit); field stepCount (crawl-batch.page-limit) |
| A33 | https://books.toscrape.com/ | 6/6 | — |
| A34 | https://books.toscrape.com/catalogue/page-21.html https://books.toscrape.com/catalogue/page-22.html https://books.toscrape.com/catalogue/page-23.html https://books.toscrape.com/catalogue/page-24.html https://books.toscrape.com/catalogue/page-25.html https://books.toscrape.com/catalogue/page-26.html https://books.toscrape.com/catalogue/page-27.html https://books.toscrape.com/catalogue/page-28.html https://books.toscrape.com/catalogue/page-29.html https://books.toscrape.com/catalogue/page-30.html https://books.toscrape.com/catalogue/page-31.html https://books.toscrape.com/catalogue/page-32.html https://books.toscrape.com/catalogue/page-33.html https://books.toscrape.com/catalogue/page-34.html https://books.toscrape.com/catalogue/page-35.html https://books.toscrape.com/catalogue/page-36.html https://books.toscrape.com/catalogue/page-37.html https://books.toscrape.com/catalogue/page-38.html https://books.toscrape.com/catalogue/page-39.html https://books.toscrape.com/catalogue/page-40.html https://books.toscrape.com/catalogue/page-41.html https://books.toscrape.com/catalogue/page-42.html https://books.toscrape.com/catalogue/page-43.html https://books.toscrape.com/catalogue/page-44.html https://books.toscrape.com/catalogue/page-45.html https://books.toscrape.com/catalogue/page-46.html https://books.toscrape.com/catalogue/page-47.html https://books.toscrape.com/catalogue/page-48.html https://books.toscrape.com/catalogue/page-49.html https://books.toscrape.com/catalogue/page-50.html | 8/8 | — |
| A35 | https://books.toscrape.com/catalogue/page-1.html https://books.toscrape.com/catalogue/page-2.html https://books.toscrape.com/catalogue/page-3.html https://books.toscrape.com/catalogue/page-4.html https://books.toscrape.com/catalogue/page-5.html https://books.toscrape.com/catalogue/page-6.html https://books.toscrape.com/catalogue/page-7.html https://books.toscrape.com/catalogue/page-8.html https://books.toscrape.com/catalogue/page-9.html https://books.toscrape.com/catalogue/page-10.html https://books.toscrape.com/catalogue/page-11.html https://books.toscrape.com/catalogue/page-12.html https://books.toscrape.com/catalogue/page-13.html https://books.toscrape.com/catalogue/page-14.html https://books.toscrape.com/catalogue/page-15.html https://books.toscrape.com/catalogue/page-16.html https://books.toscrape.com/catalogue/page-17.html https://books.toscrape.com/catalogue/page-18.html https://books.toscrape.com/catalogue/page-19.html https://books.toscrape.com/catalogue/page-20.html https://quotes.toscrape.com/page/1/ https://quotes.toscrape.com/page/2/ https://quotes.toscrape.com/page/3/ https://quotes.toscrape.com/page/4/ https://quotes.toscrape.com/page/5/ https://quotes.toscrape.com/page/6/ https://quotes.toscrape.com/page/7/ https://quotes.toscrape.com/page/8/ https://quotes.toscrape.com/page/9/ https://quotes.toscrape.com/page/10/ https://quotes.toscrape.com/tag/love/ https://quotes.toscrape.com/tag/inspirational/ https://quotes.toscrape.com/tag/life/ https://quotes.toscrape.com/tag/humor/ https://quotes.toscrape.com/tag/books/ https://quotes.toscrape.com/tag/reading/ https://quotes.toscrape.com/tag/friendship/ https://quotes.toscrape.com/tag/friends/ https://quotes.toscrape.com/tag/truth/ https://quotes.toscrape.com/tag/simile/ https://en.wikipedia.org/wiki/Web_page https://en.wikipedia.org/wiki/Website https://en.wikipedia.org/wiki/URL https://en.wikipedia.org/wiki/Web_browser https://en.wikipedia.org/wiki/HTTP https://en.wikipedia.org/wiki/Markdown https://en.wikipedia.org/wiki/JSON https://en.wikipedia.org/wiki/Comma-separated_values https://en.wikipedia.org/wiki/Web_indexing https://en.wikipedia.org/wiki/Metadata | 5/5 | — |

Recorded values:

- L11 fetchSpacing: 0 fetches, smallest gap n/a, required 0 ms; robots.txt HTTP undefined, Crawl-delay none, seed disallowed
- A13 field startMs: 1533
- A14 field progress.maxPagesFetchedWhileRunning: 10
- A15 fetchSpacing: 2 fetches, smallest gap 2732 ms, required 2000 ms; robots.txt HTTP 200, Crawl-delay 2000, seed allowed
- A15 crawlDelay: 2 fetches, 0 without a crawl_delay event, smallest recorded gap 2796 ms, robots.txt Crawl-delay 2000, 0 later pages not naming it
- A26 field timeoutProbe.elapsedMs: 1002
- A34 field progress.maxCompletedWhileRunning: 10
- A35 field startMs: 225
- A35 hostSpacing: 50 fetches on 3 hosts, 0 without a crawl_delay event, smallest same-host gap 250 ms, required 250 ms, 0 gaps shorter

Failed checks with the observed value:

- L11 [crawl-batch.crawl-status] field `status`: absent
- L11 [crawl-batch.robots-txt-controls] anyOf: xxx | xokx
- A13 [crawl-batch.crawl-start-async] field `startMs`: 1533
- A14 [crawl-batch.crawl-status] field `report.pagesFetched`: 24 vs 30
- A29 [platform.client.api-key] field `withoutToken.status`: absent
- A29 [platform.client.api-key] field `withoutToken.code`: absent
- A30 [7] field `status`: absent
- A30 [7] field `report.pagesFetched`: absent
- A30 [7] itemUrls `^https://docs\.python\.org/3/(library/.*)?$`: 0 pages, 0 outside the pattern
- A31 [7] field `status`: absent
- A31 [7] field `report.pagesFetched`: absent
- A31 [7] itemUrls `^https://docs\.python\.org/(?!3/whatsnew/)`: 0 pages, 0 outside the pattern
- A32 [crawl-batch.page-limit] field `report.budgetExceeded`: absent
- A32 [crawl-batch.page-limit] field `report.pagesFetched`: 1
- A32 [crawl-batch.page-limit] field `stepCount`: 1
