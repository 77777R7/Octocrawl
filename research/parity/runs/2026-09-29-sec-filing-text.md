# Real-site run 2026-09-29

Command: `node research/parity/run-sites.mjs --record research/parity/runs/2026-09-29-sec-filing-text.md`
Source commit: `a1a95eef3a23669313d6bd2ddc6c39e8ee495b35`
Run: 2026-09-29T15:05:49.201Z → 2026-09-29T15:14:04.979Z against http://127.0.0.1:8890; cases naming an apiEnv against W2L_HOSTED_API_URL=http://127.0.0.1:8891
SDK: the built @w2l/sdk; W2L_API_TOKEN set in the runner's environment (its value is not recorded).
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 83 of 98 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 98/98; checks passing: 641/641.

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
| A15 | https://www150.statcan.gc.ca/n1/en/type/data | 4/4 | — |
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
| A23 | https://httpbin.org/delay/10 | 4/4 | — |
| A24 | https://httpbin.org/delay/10 | 3/3 | — |
| A25 | https://httpbin.org/ip | 5/5 | — |
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
| J01 | https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | 15/15 | — |
| J02 | https://catalog.data.gov/dataset/electric-vehicle-population-data | 15/15 | — |
| J03 | https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | 3/3 | — |
| T01 | https://httpbin.org/delay/10 | 7/7 | — |
| T02 | https://books.toscrape.com/ | 7/7 | — |
| T03 | https://en.wikipedia.org/wiki/Web_scraping https://en.wikipedia.org/wiki/Web_crawler https://en.wikipedia.org/wiki/Data_scraping https://en.wikipedia.org/wiki/Search_engine https://en.wikipedia.org/wiki/Web_archiving | 6/6 | — |
| T04 | https://docs.python.org/3/ | 11/11 | — |
| T05 | https://books.toscrape.com/ | 6/6 | — |
| M01 | https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/404 | 7/7 | — |
| M02 | https://news.ycombinator.com | 9/9 | — |
| M03 | https://developer.mozilla.org/en-US/docs/w2l-does-not-exist | 5/5 | — |
| M04 | https://www.bbc.com/news/technology | 11/11 | — |
| M05 | https://www.wikipedia.org/ | 6/6 | — |
| M06 | http://www.github.com | 8/8 | — |
| M07 | http://github.com | 6/6 | — |
| M08 | http://github.com | 5/5 | — |
| F01 | https://airtrunk.com/wp-content/uploads/2023/03/AirTrunk-Green-Financing-Framework-Final-1.pdf | 13/13 | — |
| F02 | https://sustainability.atmeta.com/asset/2025-environmental-data-index/ | 13/13 | — |
| F03 | https://sustainability.atmeta.com/asset/2025-independent-accountants-review-report/ | 13/13 | — |
| F04 | https://www.ovhcloud.com/sites/default/files/external_files/kpis_fy25.pdf | 12/12 | — |
| F05 | https://assets.sttelemediagdc.com/sttgdc/global_en/public/2024-08/STT_GDC_Sustainability-Linked_Financing_Framework_2024.pdf | 13/13 | — |
| F06 | https://assets.nebius.com/assets/79cf11ba-bb23-4cb8-802e-21dc155be31c/Nebius%202025%20Sustainability%20Report.pdf | 13/13 | — |
| F07 | https://iea.blob.core.windows.net/assets/de9dea13-b07d-42c5-a398-d1b3ae17d866/EnergyandAI.pdf | 13/13 | — |
| F08 | https://ec.europa.eu/eurostat/documents/15216629/22447468/KS-01-25-003-EN-N.pdf | 13/13 | — |
| F09 | https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/nrg_ind_ren/A.REN.PC.EU27_2020?format=SDMX-CSV | 13/13 | — |
| F10 | https://www150.statcan.gc.ca/n1/tbl/csv/17100005-eng.zip | 11/11 | — |
| F11 | https://www.insee.fr/fr/statistiques/8654458 | 10/10 | — |
| F12 | https://www.ovhcloud.com/sites/default/files/external_files/kpis_fy25.pdf | 4/4 | — |
| F13 | https://www.ovhcloud.com/sites/default/files/external_files/kpis_fy25.pdf | 9/9 | — |
| F14 | https://assets.sttelemediagdc.com/sttgdc/global_en/public/2024-08/STT_GDC_Sustainability-Linked_Financing_Framework_2024.pdf | 9/9 | — |
| F15 | https://api.worldbank.org/v2/country/FR/indicator/SP.POP.TOTL?format=json&date=2020:2023 | 11/11 | — |
| F16 | https://assets.publishing.service.gov.uk/media/6aba6dd9a9c3d267bcccefb0/ET_5.1_SEP_26.xlsx | 10/10 | — |
| A36 | https://www.sec.gov/Archives/edgar/data/1878848/000187884826000015/iren-20251231.htm | 8/8 | — |

Recorded values:

- L06 traceEvent summary.attempts.0.result.trace: [{"name":"sec-ch-ua","value":"\"Chromium\";v=\"128\", \"Google Chrome\";v=\"128\", \"Not;A=Brand\";v=\"24\""},{"name":"sec-ch-ua-mobile","value":"?0"},{"name":"sec-ch-ua-platform","value":"\"macOS\""},{"name":"user-agent","value":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"}]
- L11 fetchSpacing: 3 fetches, smallest gap 250 ms, required 0 ms; robots.txt HTTP 200, Crawl-delay none, seed allowed
- A13 field startMs: 4
- A14 field progress.maxPagesFetchedWhileRunning: 22
- A15 fetchSpacing: 3 fetches, smallest gap 2001 ms, required 2000 ms; robots.txt HTTP 200, Crawl-delay 2000, seed allowed
- A15 crawlDelay: 3 fetches, 0 without a crawl_delay event, smallest recorded gap 2000 ms, robots.txt Crawl-delay 2000, 0 later pages not naming it
- E01 evidenceSchema: valid (http, success)
- E02 evidenceSchema: valid (browser_local, success)
- E03 evidenceSchema: valid (http, failed)
- E04 evidenceSchema: valid (http, success)
- A22 field elapsedMs: 3003
- A23 field elapsedMs: 11028
- A25 field egress.reportedIp: 23.132.124.145 vs 23.132.124.145
- A26 field timeoutProbe.elapsedMs: 1000
- A34 field progress.maxCompletedWhileRunning: 27
- A35 field startMs: 7
- A35 hostSpacing: 50 fetches on 3 hosts, 0 without a crawl_delay event, smallest same-host gap 250 ms, required 250 ms, 0 gaps shorter
- T01 field summary.attempts.0.result.usage.wallMs: 11367.477790999983
- T01 field elapsedMs: 11372
- T02 field waitMs: 9076
- T04 field progress.polls: 5
- T04 field final.total: 30 vs 30
- T04 field final.completed: 17 vs 17
- T04 field pageRequests: 3
- T05 field final.total: 7 vs 7
- M04 field compare.markdown.length: 31224 vs 25712
- F10 field file.bytes: 3880235

Notes:

- APIs: `W2L_CONTACT=<W2L_CONTACT> W2L_TASK_ROOT=.w2l/api node --import tsx packages/api/src/cli.ts --port 8890` (local mode, with `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` from the environment, `127.0.0.1:7890`) and the same with `W2L_API_TOKEN=<token>`, `W2L_TASK_ROOT=.w2l/api-hosted` and `--hosted --host 127.0.0.1 --port 8891`. The runner had `W2L_CONTACT`, `W2L_API_URL=http://127.0.0.1:8890`, `W2L_HOSTED_API_URL=http://127.0.0.1:8891` and the same token. Both APIs were started fresh for this run, on the branch `claude/p1-sec-filing-text` at the source commit above (base `4c972f6` plus the two extractor commits of this branch).
- A36 passes for the first time. On the P1 wave 5 record (`dd3d948`) its Markdown was 6,843 characters, the statement of operations table only (`document.strategy` `table`, confidence 0.08), and `IREN` was absent. Here the API fetched SEC.gov's robots.txt and the filing once each with `W2L Research <W2L_CONTACT>`: HTTP 200, the same raw body as then (`rawSha256` `766182d3…bca56`, 1,948,249 bytes), `document.strategy` `article`, `extractor.version` `extract-tf/3`, and 279,916 characters of Markdown: the cover page, the table of contents, Parts I and II with Item 2 (management's discussion and analysis), Notes 1 to 22, the statements as GFM tables and the signatures. `IREN` occurs 44 times. None of the hidden XBRL header (`ix:header`) is in the Markdown.
- The cause was in the extractor, on the same raw body: the router sent a page with two or more tables, no `<article>` and under 15 list items to the table strategy, which keeps one table, although the filing's 98 tables hold 19% of its text; the article cascade took no `<div>` as a text block, and the filing has no `<p>`; and main-content selection never chose `<body>`, of which the filing's paragraphs are direct children.
- No robots.txt answer was unreachable in this run (every `unreachable` in the saved responses is null), so no case failed on the network; F11, which failed on a robots.txt timeout through the proxy on the P1 wave 5 record, passed.
- In an offline comparison on 30 pages fetched once each from the set's URLs while preparing this change (BLS answered two of them, S12 and L12, with a 403 page), the Markdown changed only on L06 (Wikipedia, List of countries by GDP): a navigation box that nests one small table became one GFM grid like the page's other navigation boxes, instead of paragraphs and lists. L06's checks read the GDP tables, which did not change, and it passed here.
