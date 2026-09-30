# Real-site run 2026-09-29

Command: `node research/parity/run-sites.mjs --record research/parity/runs/2026-09-30-markdown-tables.md`
Source commit: `c10a9a08314a94a0ccbf38bf74317744a8ae3c6d`
Run: 2026-09-29T18:09:44.157Z → 2026-09-29T18:18:54.537Z against http://127.0.0.1:8940; cases naming an apiEnv against W2L_HOSTED_API_URL=http://127.0.0.1:8941
SDK: the built @w2l/sdk; W2L_API_TOKEN set in the runner's environment (its value is not recorded).
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 88 of 106 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 103/106 (1 skipped, not run); checks passing: 689/699 (skipped cases' checks not counted).

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
| J04 | https://www.jpc.de/jpcng/books/detail/-/art/die-augenheilkunde/hnum/11617379 | 1/8 | field status (FS); field json.status (scrape-formats.json); field json.data.name (scrape-formats.json); field json.data.price (scrape-formats.json); field json.data.currency (scrape-formats.json); jsonIssue json.evidence (scrape-formats.json); field evidenceRecord.fieldEvidence./price (ER) |
| J05 | https://demoshop.oxid-esales.com/Merchandise/Uhren/Gold-Spirit.html | 1/4 | field status (FS); field json.data.title (scrape-formats.json); anyOf (scrape-formats.json) |
| T06 | https://httpbin.org/delay/10 | skipped | W2L_LOCAL_MCP_URL is not set |
| M09 | https://httpbin.org/base64/PCFkb2N0eXBlIGh0bWw-PGh0bWw-PGhlYWQ-PHRpdGxlPk1vdmVkPC90aXRsZT48L2hlYWQ-PGJvZHk-PHA-VGhpcyBwYWdlIG1vdmVkLjwvcD48c2NyaXB0PmxvY2F0aW9uLnJlcGxhY2UoImh0dHBzOi8vYm9va3MudG9zY3JhcGUuY29tL2NhdGFsb2d1ZS9kb2VzLW5vdC1leGlzdC13MmwvaW5kZXguaHRtbCIpPC9zY3JpcHQ-PC9ib2R5PjwvaHRtbD4= | 12/12 | — |
| M10 | https://httpbin.org/base64/PCFkb2N0eXBlIGh0bWw-PGh0bWw-PGhlYWQ-PHRpdGxlPk1vdmVkPC90aXRsZT48bWV0YSBodHRwLWVxdWl2PSJyZWZyZXNoIiBjb250ZW50PSIwO3VybD1odHRwczovL2Jvb2tzLnRvc2NyYXBlLmNvbS9jYXRhbG9ndWUvZG9lcy1ub3QtZXhpc3QtdzJsL2luZGV4Lmh0bWwiPjwvaGVhZD48Ym9keT48cD5UaGlzIHBhZ2UgbW92ZWQuPC9wPjwvYm9keT48L2h0bWw- | 7/7 | — |
| M11 | https://spa-github-pages.rafgraph.dev/example | 11/11 | — |
| M12 | https://www.eia.gov/electricity/annual/html/epa_01_01.html | 10/10 | — |
| M13 | https://news.ycombinator.com | 6/6 | — |

Recorded values:

- L06 traceEvent summary.attempts.0.result.trace: [{"name":"sec-ch-ua","value":"\"Chromium\";v=\"128\", \"Google Chrome\";v=\"128\", \"Not;A=Brand\";v=\"24\""},{"name":"sec-ch-ua-mobile","value":"?0"},{"name":"sec-ch-ua-platform","value":"\"macOS\""},{"name":"user-agent","value":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"}]
- L11 fetchSpacing: 3 fetches, smallest gap 251 ms, required 0 ms; robots.txt HTTP 200, Crawl-delay none, seed allowed
- A13 field startMs: 4
- A14 field progress.maxPagesFetchedWhileRunning: 26
- A15 fetchSpacing: 3 fetches, smallest gap 2001 ms, required 2000 ms; robots.txt HTTP 200, Crawl-delay 2000, seed allowed
- A15 crawlDelay: 3 fetches, 0 without a crawl_delay event, smallest recorded gap 2001 ms, robots.txt Crawl-delay 2000, 0 later pages not naming it
- E01 evidenceSchema: valid (http, success)
- E02 evidenceSchema: valid (browser_local, success)
- E03 evidenceSchema: valid (http, failed)
- E04 evidenceSchema: valid (http, success)
- A22 field elapsedMs: 3007
- A23 field elapsedMs: 11237
- A25 field egress.reportedIp: 103.142.140.131 vs 103.142.140.131
- A26 field timeoutProbe.elapsedMs: 1001
- A34 field progress.maxCompletedWhileRunning: 28
- A35 field startMs: 5
- A35 hostSpacing: 50 fetches on 3 hosts, 0 without a crawl_delay event, smallest same-host gap 253 ms, required 250 ms, 0 gaps shorter
- T01 field summary.attempts.0.result.usage.wallMs: 11608.247000000032
- T01 field elapsedMs: 11612
- T02 field waitMs: 10105
- T04 field progress.polls: 4
- T04 field final.total: 30 vs 30
- T04 field final.completed: 17 vs 17
- T04 field pageRequests: 3
- T05 field final.total: 9 vs 9
- M04 field compare.markdown.length: 31220 vs 25708
- F10 field file.bytes: 3880235
- M12 field document.strategy: table
- M13 tableTargets: 210 of 210 targets in table rows match
- M13 tableTargets: 60 of 210 targets in table rows match

Failed checks with the observed value:

- J04 [FS] field `status`: failed
- J04 [scrape-formats.json] field `json.status`: incomplete
- J04 [scrape-formats.json] field `json.data.name`: absent
- J04 [scrape-formats.json] field `json.data.price`: absent
- J04 [scrape-formats.json] field `json.data.currency`: absent
- J04 [scrape-formats.json] jsonIssue `json.evidence`: []
- J04 [ER] field `evidenceRecord.fieldEvidence./price`: absent
- J05 [FS] field `status`: blocked
- J05 [scrape-formats.json] field `json.data.title`: absent
- J05 [scrape-formats.json] anyOf: xx | okx

## Notes

- Code: branch `claude/p1-markdown-tables` at `c10a9a0`, from `main` at `8ae6983`, with the table-region fix (`4afb156`), link and image targets in table cells (`aad38bd`), `data:` link targets dropped (`db9d9c6`), the docs (`51059c9`) and cases M12-M13 (`c10a9a0`); `EXTRACTOR_VERSION` `extract-tf/4`. Node v26.8.1, after `npm ci`, `npx playwright install chromium` and `npx tsc --build`.
- APIs, both started fresh from this worktree on `c10a9a0`:
  - Local mode: `W2L_CONTACT=<W2L_CONTACT> W2L_TASK_ROOT=.w2l/api node --import tsx packages/api/src/cli.ts --port 8940`, with `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` inherited from the environment (`127.0.0.1:7890`).
  - Hosted mode: `W2L_CONTACT=<W2L_CONTACT> W2L_API_TOKEN=<token> W2L_TASK_ROOT=.w2l/api-hosted node --import tsx packages/api/src/cli.ts --hosted --host 127.0.0.1 --port 8941` (a random token; hosted mode ignores the proxy variables).
  - Runner: `W2L_CONTACT=<W2L_CONTACT> W2L_API_URL=http://127.0.0.1:8940 W2L_HOSTED_API_URL=http://127.0.0.1:8941 W2L_API_TOKEN=<token> node research/parity/run-sites.mjs --record research/parity/runs/2026-09-30-markdown-tables.md`.
- The run started at 2026-09-29T18:09Z, 2026-09-30 02:09 local time (UTC+8); the file is named by the local date.
- T06 was not run here: it needs `W2L_LOCAL_MCP_URL`, which the command above does not set. It stays in the denominator as skipped. It was run on its own right afterwards against a local MCP service from the same commit, recorded in [2026-09-30-markdown-tables-t06.md](2026-09-30-markdown-tables-t06.md) (9/9).
- Two cases failed, J04 and J05 (10 checks). Both are JSON extraction on product pages that no change here touches, both passed in [2026-09-30-main-5bfffec.md](2026-09-30-main-5bfffec.md), and neither was run again.
  - J04 (www.jpc.de): network. Its robots.txt lookup through the proxy timed out (`robotsDecision.unreachable: "timeout"`), so the page was `failed`/`policy_denied` without a page request and the JSON `incomplete`. A single `curl` of https://www.jpc.de/robots.txt through the same proxy after the run failed to connect (TLS error after 10 s), and the offline fetch described below was refused on robots.txt earlier that day too.
  - J05 (demoshop.oxid-esales.com): the site's Cloudflare challenge to this run's egress, not a network failure: HTTP 403 with `cf-mitigated` on the HTTP lane and again on the browser lane, reported honestly as `blocked`/`cloudflare_challenge`, while the case's checks expect the product page. The same host answered the offline fetch earlier that day with 403.
- No other case met the network: all other robots.txt lookups answered (the 5 non-null `unreachable` fields in the saved responses are all J04's), and inside passing cases the only failed items are the timeouts A08 and A22 test for.
- The two features' cases: M12 10/10 (`document.strategy` `table`; the title, both data tables and the notes and sources), M13 6/6 (210 absolute targets in the story table's rows, 60 of them discussion links), M02 9/9 as frozen, L04 10/10, L05 4/4, L06 4/4, L08 16/16, S10 4/4, A16 8/8, M01 7/7, M04 11/11, M05 6/6, A07 5/5.
- A36 sent SEC.gov one robots.txt request and one page request, with `W2L Research <W2L_CONTACT>`: HTTP 200, the same raw body as the previous record (`rawSha256` `766182d3…bca56`), `document.strategy` `article`, extractor `extract-tf/4`, and 288,381 characters of Markdown in which `IREN` occurs 77 times. With the link markup of the 73 table rows that carry links removed, the Markdown is 279,916 characters with `IREN` 44 times, the previous record's figures under `extract-tf/3`: the difference is the targets of the filing's table of contents (36 same-page fragments) and exhibit index (64 links to SEC Archives, whose file names hold the other 33 `IREN`).
- Offline comparison, not part of this run: every HTML page of the set (132 URLs: the file cases, httpbin.org's JSON endpoints and A36 left out) was fetched once on 2026-09-30 through W2L's HTTP lane (standard mode, robots.txt honoured, the environment proxy, one request at a time and at least 1.5 s apart per host); J04 was refused on robots.txt, so 131 pages were compared. The extractor at `8ae6983` and at `c10a9a0` turned each into main-content and whole-page Markdown: 107 pages identical; 24 differ (22 Wikipedia pages, catalog.data.gov for J02, MDN for M01, Hacker News for M02), in table rows and in one table caption (Wikipedia's Search engine article) only. With the link and image markup removed, the new Markdown equals the old line for line, except on Hacker News, whose empty vote-arrow links now show their target as their text. The route and strategy are unchanged on all 131; L04 and M02, the table-routed ones, keep the same region.
