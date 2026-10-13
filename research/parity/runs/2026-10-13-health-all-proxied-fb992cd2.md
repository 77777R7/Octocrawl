# Real-site run 2026-10-12

Command: `node research/parity/run-sites.mjs --record research/parity/runs/2026-10-13-health-all-proxied-fb992cd2.md`
Source commit: `fb992cd2a129d3583bc3144858b60ea5c6184bb3`
Run: 2026-10-12T18:14:25.178Z → 2026-10-12T18:37:13.466Z against http://127.0.0.1:8797; cases naming an apiEnv against W2L_HOSTED_API_URL=(unset)
SDK: the built @w2l/sdk; W2L_API_TOKEN not set in the runner's environment (its value is not recorded).
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 163 of 207 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 174/207 (4 skipped, not run); checks passing: 1152/1232 (skipped cases' checks not counted).

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
| A04 | https://quotes.toscrape.com/ | 0/2 | field success (5); field error (5) |
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
| A19 | https://httpbin.org/status/404 | 3/4 | field evidence.httpStatus (2) |
| A20 | https://quotes.toscrape.com/js-delayed/ | 2/2 | — |
| A21 | https://quotes.toscrape.com/js-delayed/ | 3/3 | — |
| A22 | https://httpbin.org/delay/10 | 2/5 | field failureReason (6); field usage.deadlineExceeded (6); field elapsedMs (6) |
| A23 | https://httpbin.org/delay/10 | 2/4 | field status (6); markdownIncludes "https://httpbin.org/delay/10" (6) |
| A24 | https://httpbin.org/delay/10 | 3/3 | — |
| A25 | https://httpbin.org/ip | 3/5 | field status (FS); field egress.reportedIp (9) |
| A26 | https://docs.python.org/3/tutorial/ | 7/7 | — |
| A27 | https://books.toscrape.com/ | 6/6 | — |
| A28 | https://en.wikipedia.org/wiki/Web_scraping https://en.wikipedia.org/wiki/Web_crawler https://en.wikipedia.org/wiki/Data_scraping https://en.wikipedia.org/wiki/Search_engine https://en.wikipedia.org/wiki/Web_archiving https://en.wikipedia.org/wiki/Robots.txt https://en.wikipedia.org/wiki/Sitemaps https://en.wikipedia.org/wiki/Hyperlink https://en.wikipedia.org/wiki/HTML https://en.wikipedia.org/wiki/World_Wide_Web | 7/7 | — |
| A29 | https://example.com/ | 0/7 | field tokenInEnvironment (platform.client.api-key); field status (FS); markdownIncludes "This domain is for use in documentation examples" (FS); field withoutToken.status (platform.client.api-key); field withoutToken.code (platform.client.api-key); field wrongToken.status (platform.client.api-key); field wrongToken.code (platform.client.api-key) |
| A30 | https://docs.python.org/3/ | 4/4 | — |
| A31 | https://docs.python.org/3/ | 4/4 | — |
| A32 | https://en.wikipedia.org/wiki/Web_crawler | 1/4 | field report.budgetExceeded (crawl-batch.page-limit); field report.pagesFetched (crawl-batch.page-limit); field stepCount (crawl-batch.page-limit) |
| A33 | https://books.toscrape.com/ | 6/6 | — |
| A34 | https://books.toscrape.com/catalogue/page-21.html https://books.toscrape.com/catalogue/page-22.html https://books.toscrape.com/catalogue/page-23.html https://books.toscrape.com/catalogue/page-24.html https://books.toscrape.com/catalogue/page-25.html https://books.toscrape.com/catalogue/page-26.html https://books.toscrape.com/catalogue/page-27.html https://books.toscrape.com/catalogue/page-28.html https://books.toscrape.com/catalogue/page-29.html https://books.toscrape.com/catalogue/page-30.html https://books.toscrape.com/catalogue/page-31.html https://books.toscrape.com/catalogue/page-32.html https://books.toscrape.com/catalogue/page-33.html https://books.toscrape.com/catalogue/page-34.html https://books.toscrape.com/catalogue/page-35.html https://books.toscrape.com/catalogue/page-36.html https://books.toscrape.com/catalogue/page-37.html https://books.toscrape.com/catalogue/page-38.html https://books.toscrape.com/catalogue/page-39.html https://books.toscrape.com/catalogue/page-40.html https://books.toscrape.com/catalogue/page-41.html https://books.toscrape.com/catalogue/page-42.html https://books.toscrape.com/catalogue/page-43.html https://books.toscrape.com/catalogue/page-44.html https://books.toscrape.com/catalogue/page-45.html https://books.toscrape.com/catalogue/page-46.html https://books.toscrape.com/catalogue/page-47.html https://books.toscrape.com/catalogue/page-48.html https://books.toscrape.com/catalogue/page-49.html https://books.toscrape.com/catalogue/page-50.html | 8/8 | — |
| A35 | https://books.toscrape.com/catalogue/page-1.html https://books.toscrape.com/catalogue/page-2.html https://books.toscrape.com/catalogue/page-3.html https://books.toscrape.com/catalogue/page-4.html https://books.toscrape.com/catalogue/page-5.html https://books.toscrape.com/catalogue/page-6.html https://books.toscrape.com/catalogue/page-7.html https://books.toscrape.com/catalogue/page-8.html https://books.toscrape.com/catalogue/page-9.html https://books.toscrape.com/catalogue/page-10.html https://books.toscrape.com/catalogue/page-11.html https://books.toscrape.com/catalogue/page-12.html https://books.toscrape.com/catalogue/page-13.html https://books.toscrape.com/catalogue/page-14.html https://books.toscrape.com/catalogue/page-15.html https://books.toscrape.com/catalogue/page-16.html https://books.toscrape.com/catalogue/page-17.html https://books.toscrape.com/catalogue/page-18.html https://books.toscrape.com/catalogue/page-19.html https://books.toscrape.com/catalogue/page-20.html https://quotes.toscrape.com/page/1/ https://quotes.toscrape.com/page/2/ https://quotes.toscrape.com/page/3/ https://quotes.toscrape.com/page/4/ https://quotes.toscrape.com/page/5/ https://quotes.toscrape.com/page/6/ https://quotes.toscrape.com/page/7/ https://quotes.toscrape.com/page/8/ https://quotes.toscrape.com/page/9/ https://quotes.toscrape.com/page/10/ https://quotes.toscrape.com/tag/love/ https://quotes.toscrape.com/tag/inspirational/ https://quotes.toscrape.com/tag/life/ https://quotes.toscrape.com/tag/humor/ https://quotes.toscrape.com/tag/books/ https://quotes.toscrape.com/tag/reading/ https://quotes.toscrape.com/tag/friendship/ https://quotes.toscrape.com/tag/friends/ https://quotes.toscrape.com/tag/truth/ https://quotes.toscrape.com/tag/simile/ https://en.wikipedia.org/wiki/Web_page https://en.wikipedia.org/wiki/Website https://en.wikipedia.org/wiki/URL https://en.wikipedia.org/wiki/Web_browser https://en.wikipedia.org/wiki/HTTP https://en.wikipedia.org/wiki/Markdown https://en.wikipedia.org/wiki/JSON https://en.wikipedia.org/wiki/Comma-separated_values https://en.wikipedia.org/wiki/Web_indexing https://en.wikipedia.org/wiki/Metadata | 5/5 | — |
| J01 | https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | 15/15 | — |
| J02 | https://catalog.data.gov/dataset/electric-vehicle-population-data | 15/15 | — |
| J03 | https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | 3/3 | — |
| T01 | https://httpbin.org/delay/10 | 3/7 | field summary.attempts.0.result.evidence.httpStatus (6); field summary.attempts.0.result.usage.wallMs (6); field status (6); markdownIncludes "https://httpbin.org/delay/10" (6) |
| T02 | https://books.toscrape.com/ | 7/7 | — |
| T03 | https://en.wikipedia.org/wiki/Web_scraping https://en.wikipedia.org/wiki/Web_crawler https://en.wikipedia.org/wiki/Data_scraping https://en.wikipedia.org/wiki/Search_engine https://en.wikipedia.org/wiki/Web_archiving | 6/6 | — |
| T04 | https://docs.python.org/3/ | 10/11 | field progress.nullTotals (crawl-batch.crawl-status) |
| T05 | https://books.toscrape.com/ | 6/6 | — |
| M01 | https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/404 | 7/7 | — |
| M02 | https://news.ycombinator.com | 9/9 | — |
| M03 | https://developer.mozilla.org/en-US/docs/w2l-does-not-exist | 5/5 | — |
| M04 | https://www.bbc.com/news/technology | 11/11 | — |
| M05 | https://www.wikipedia.org/ | 5/6 | traceEvent summary.attempts.0.result.trace (scrape-formats.only-main-content) |
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
| F11 | https://www.insee.fr/fr/statistiques/8654458 | 1/10 | itemCount (P2-files); eachItem (P2-files); eachItem (P2-files); eachItem (scrape-formats.pdf-parser); eachItem (scrape-formats.pdf-parser); eachItem (scrape-formats.pdf-parser); eachItem (ER); eachItem (ER); eachItem (ER) |
| F12 | https://www.ovhcloud.com/sites/default/files/external_files/kpis_fy25.pdf | 2/4 | pdfPage "PUE, WUE, REF values for the following period - Fiscal Year 2025" data.markdown (scrape-formats.pdf-parser); pdfPage "Hillsboro – United States, OR 1.27 1.35 1.46" data.markdown (scrape-formats.pdf-parser) |
| F13 | https://www.ovhcloud.com/sites/default/files/external_files/kpis_fy25.pdf | 9/9 | — |
| F14 | https://assets.sttelemediagdc.com/sttgdc/global_en/public/2024-08/STT_GDC_Sustainability-Linked_Financing_Framework_2024.pdf | 9/9 | — |
| F15 | https://api.worldbank.org/v2/country/FR/indicator/SP.POP.TOTL?format=json&date=2020:2023 | 11/11 | — |
| F16 | https://assets.publishing.service.gov.uk/media/6aba6dd9a9c3d267bcccefb0/ET_5.1_SEP_26.xlsx | 10/10 | — |
| A36 | https://www.sec.gov/Archives/edgar/data/1878848/000187884826000015/iren-20251231.htm | skipped | W2L_CONTACT is not set |
| J04 | https://www.jpc.de/jpcng/books/detail/-/art/die-augenheilkunde/hnum/11617379 | 1/8 | field status (FS); field json.status (scrape-formats.json); field json.data.name (scrape-formats.json); field json.data.price (scrape-formats.json); field json.data.currency (scrape-formats.json); jsonIssue json.evidence (scrape-formats.json); field evidenceRecord.fieldEvidence./price (ER) |
| J05 | https://demoshop.oxid-esales.com/Merchandise/Uhren/Gold-Spirit.html | 1/4 | field status (FS); field json.data.title (scrape-formats.json); anyOf (scrape-formats.json) |
| T06 | https://httpbin.org/delay/10 | skipped | W2L_LOCAL_MCP_URL is not set |
| M09 | https://httpbin.org/base64/PCFkb2N0eXBlIGh0bWw-PGh0bWw-PGhlYWQ-PHRpdGxlPk1vdmVkPC90aXRsZT48L2hlYWQ-PGJvZHk-PHA-VGhpcyBwYWdlIG1vdmVkLjwvcD48c2NyaXB0PmxvY2F0aW9uLnJlcGxhY2UoImh0dHBzOi8vYm9va3MudG9zY3JhcGUuY29tL2NhdGFsb2d1ZS9kb2VzLW5vdC1leGlzdC13MmwvaW5kZXguaHRtbCIpPC9zY3JpcHQ-PC9ib2R5PjwvaHRtbD4= | 12/12 | — |
| M10 | https://httpbin.org/base64/PCFkb2N0eXBlIGh0bWw-PGh0bWw-PGhlYWQ-PHRpdGxlPk1vdmVkPC90aXRsZT48bWV0YSBodHRwLWVxdWl2PSJyZWZyZXNoIiBjb250ZW50PSIwO3VybD1odHRwczovL2Jvb2tzLnRvc2NyYXBlLmNvbS9jYXRhbG9ndWUvZG9lcy1ub3QtZXhpc3QtdzJsL2luZGV4Lmh0bWwiPjwvaGVhZD48Ym9keT48cD5UaGlzIHBhZ2UgbW92ZWQuPC9wPjwvYm9keT48L2h0bWw- | 7/7 | — |
| M11 | https://spa-github-pages.rafgraph.dev/example | 11/11 | — |
| M12 | https://www.eia.gov/electricity/annual/html/epa_01_01.html | 10/10 | — |
| M13 | https://news.ycombinator.com | 6/6 | — |
| MP01 | https://www.sitemaps.org/ | 20/20 | — |
| MP02 | https://books.toscrape.com/ | 12/12 | — |
| MP03 | https://docs.python.org/3/ | 9/10 | field sources.sitemap.files.0.entries (map-search.map-endpoint) |
| MP04 | https://developer.mozilla.org/en-US/docs/Web/HTTP | 13/13 | — |
| MP05 | https://www.gov.uk/ | 14/14 | — |
| MP06 | https://www.gov.uk/ | 8/8 | — |
| MP07 | https://www.sitemaps.org/ | 10/10 | — |
| MP08 | https://www.sitemaps.org/ | 8/8 | — |
| MP09 | https://www.gov.uk/ | 11/11 | — |
| MP10 | https://www.sitemaps.org/ | 6/6 | — |
| MP11 | https://docs.stripe.com/ | 9/10 | countWhere (map-search.map-search-filter) |
| MP12 | https://books.toscrape.com/ | 6/6 | — |
| MP13 | https://python.org/ | 8/8 | — |
| MP14 | https://python.org/ | 6/6 | — |
| MP15 | https://www.scrapethissite.com/pages/forms/?per_page=100 | 7/7 | — |
| MP16 | https://www.scrapethissite.com/pages/forms/?per_page=100 | 8/8 | — |
| MP17 | https://developer.mozilla.org/en-US/docs/Web/HTTP | skipped | W2L_MCP_MAP_URL is not set |
| MP18 | https://docs.python.org/3/ | skipped | W2L_MCP_MAP_URL is not set |
| CA01 | https://books.toscrape.com/catalogue/page-2.html | 14/14 | — |
| CA02 | https://quotes.toscrape.com/page/3/ | 4/7 | field compare.metadata.cacheState (scrape-formats.metadata-cache-state); field compare.metadata.cachedAt (scrape-execution.store-in-cache); field compare.usage.requestCount (scrape-execution.store-in-cache) |
| CA03 | https://books.toscrape.com/catalogue/page-3.html | 5/5 | — |
| CA04 | https://books.toscrape.com/catalogue/page-4.html | 4/4 | — |
| CA05 | https://quotes.toscrape.com/tag/humor/page/2/ | 11/11 | — |
| CA06 | https://books.toscrape.com/catalogue/page-5.html | 5/5 | — |
| CA07 | https://books.toscrape.com/catalogue/page-6.html | 8/8 | — |
| CA08 | https://quotes.toscrape.com/tag/humor/page/3/ | 3/3 | — |
| CA09 | https://books.toscrape.com/catalogue/page-2.html https://books.toscrape.com/catalogue/page-3.html https://books.toscrape.com/catalogue/page-7.html | 7/8 | eachItem (scrape-formats.metadata-cache-state) |
| CA10 | https://books.toscrape.com/catalogue/page-2.html | 5/5 | — |
| CA11 | https://httpbin.org/headers | 4/7 | field status (scrape-execution.custom-headers); markdownIncludes "de-DE" (scrape-execution.custom-headers); markdownIncludes "evidence" (scrape-execution.custom-headers) |
| TB01 | https://www.scrapethissite.com/pages/forms/ | 4/4 | — |
| TB02 | https://webscraper.io/test-sites/tables | 4/4 | — |
| TB03 | https://webscraper.io/test-sites/tables/tables-multiple-header-rows | 4/4 | — |
| TB04 | https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal) | 4/4 | — |
| TB05 | https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population | 4/4 | — |
| TB06 | https://www.gov.uk/government/statistics/subnational-electricity-and-gas-consumption-summary-report-2024/subnational-electricity-and-gas-consumption-summary-report-2024--2 | 4/4 | — |
| TB07 | https://www.eia.gov/electricity/annual/html/epa_01_01.html | 4/4 | — |
| TB08 | https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | 4/4 | — |
| TB09 | https://www.bls.gov/news.release/empsit.t01.htm | 4/4 | — |
| TB10 | https://ourworldindata.org/grapher/co-emissions-per-capita?tab=table | 4/4 | — |
| PD01 | https://www.eia.gov/outlooks/ieo/pdf/IEO2023_Narrative.pdf | 2/8 | field status (scrape-formats.pdf-parser); field file.pdf.pagesRead (scrape-formats.pdf-parser); field file.pdf.pageCount (scrape-formats.pdf-parser); field pages.length (scrape-formats.pdf-pages); field pages.1.pageNumber (scrape-formats.pdf-pages); markdownExcludes "<!-- page" (scrape-formats.pdf-page-markers) |
| PD02 | https://www.ovhcloud.com/sites/default/files/external_files/kpis_fy25.pdf | 7/7 | — |
| PD03 | https://www.insee.fr/fr/statistiques/fichier/version-html/8654458/ip2077.pdf | 6/6 | — |
| PD04 | https://www.insee.fr/fr/statistiques/fichier/version-html/8654458/ip2077.pdf | 2/2 | — |
| AC01 | https://quotes.toscrape.com/js/ | 7/7 | — |
| AC02 | https://the-internet.herokuapp.com/dynamic_loading/2 | 1/4 | field status (action-wait-duration); markdownIncludes "Hello World!" (action-wait-duration); traceEvent (action-wait-duration) |
| AC03 | https://the-internet.herokuapp.com/dynamic_loading/1 | 1/3 | field status (action-wait-selector); markdownIncludes "Hello World!" (action-wait-selector) |
| AC04 | https://the-internet.herokuapp.com/key_presses | 1/3 | field status (action-press); markdownIncludes "You entered: ENTER" (action-press) |
| AC05 | https://quotes.toscrape.com/scroll | 3/4 | field actions.javascriptReturns.1.value (action-scroll) |
| AC06 | https://www.scrapethissite.com/pages/ajax-javascript/ | 1/3 | field status (action-click); markdownIncludes "Spotlight" (action-click) |
| AC07 | https://webscraper.io/test-sites/e-commerce/more/computers/laptops | 3/3 | — |
| AC08 | https://webscraper.io/test-sites/e-commerce/scroll/computers/laptops | 3/3 | — |
| AC09 | https://webscraper.io/test-sites/e-commerce/ajax/computers/laptops | 4/4 | — |
| AC10 | https://example.com/ | 5/5 | — |
| AC11 | https://example.com/ | 2/2 | — |
| AC12 | https://example.com/ | 6/7 | markdownIncludes "Example Domain" (actions-pipeline) |
| AC13 | https://quotes.toscrape.com/js/ | 7/7 | — |
| AC14 | https://quotes.toscrape.com/scroll | 3/3 | — |
| AC15 | https://www.scrapethissite.com/pages/ajax-javascript/ | 3/3 | — |
| AC16 | https://webscraper.io/test-sites/e-commerce/more/computers/laptops | 3/3 | — |
| AC17 | https://webscraper.io/test-sites/e-commerce/scroll/computers/laptops | 3/3 | — |
| AC18 | https://webscraper.io/test-sites/e-commerce/ajax/computers/laptops | 4/4 | — |
| AC19 | https://quotes.toscrape.com/js-delayed/ | 4/4 | — |
| AC20 | https://webscraper.io/test-sites/e-commerce/more/phones/touch | 3/3 | — |
| AC21 | https://webscraper.io/test-sites/e-commerce/ajax/phones/touch | 3/3 | — |
| AC22 | https://webscraper.io/test-sites/e-commerce/scroll/phones/touch | 3/3 | — |
| AC23 | https://example.com/ | 8/8 | — |
| AC24 | https://the-internet.herokuapp.com/key_presses | 1/4 | field status (action-step); traceEvent (action-step); markdownIncludes "You entered: ESCAPE" (action-press) |
| LS01 | https://quotes.toscrape.com/scroll | 4/4 | — |
| LS02 | https://quotes.toscrape.com/js/ | 6/6 | — |
| LS03 | https://books.toscrape.com/catalogue/category/books/mystery_3/index.html | 4/4 | — |
| LS04 | https://webscraper.io/test-sites/e-commerce/more/computers/laptops | 4/4 | — |
| LS05 | https://webscraper.io/test-sites/e-commerce/scroll/computers/laptops | 4/4 | — |
| LS06 | https://webscraper.io/test-sites/e-commerce/ajax/computers/laptops | 4/4 | — |
| LS07 | https://www.scrapethissite.com/pages/forms/ | 5/5 | — |
| LS08 | https://quotes.toscrape.com/scroll | 3/3 | — |
| LR01 | https://books.toscrape.com/catalogue/category/books/mystery_3/index.html | 7/7 | — |
| LR02 | https://quotes.toscrape.com/js/ | 5/5 | — |
| LR03 | https://www.scrapethissite.com/pages/forms/ | 4/4 | — |
| LR04 | https://webscraper.io/test-sites/e-commerce/ajax/computers/laptops | 4/4 | — |
| LR05 | https://quotes.toscrape.com/ | 4/4 | — |
| LR06 | https://news.ycombinator.com/ | 3/3 | — |
| LD01 | https://books.toscrape.com/catalogue/category/books/mystery_3/index.html | 6/6 | — |
| LD02 | https://quotes.toscrape.com/ | 4/4 | — |
| LD03 | https://www.scrapethissite.com/pages/forms/ | 4/4 | — |
| LD04 | https://news.ycombinator.com/ | 3/3 | — |
| LD05 | https://www.scrapethissite.com/pages/simple/ | 4/4 | — |
| LD06 | https://webscraper.io/test-sites/e-commerce/allinone/computers/laptops | 4/4 | — |
| LD07 | https://example.com/ | 5/5 | — |
| AR01 | https://ourworldindata.org/grapher/life-expectancy | 4/4 | — |
| AR02 | https://hub.docker.com/_/nginx | 4/4 | — |
| AR03 | https://www.npmjs.com/package/react | 4/4 | — |
| AR04 | https://www.jsdelivr.com/package/npm/react | 4/4 | — |
| AR05 | https://github.com/topics/javascript | 4/4 | — |
| AR06 | https://www.aljazeera.com/news/ | 4/4 | — |
| AR07 | https://www.npr.org/sections/news/ | 1/4 | field status (action-step); traceEvent (action-step); field actions.lists.0.items (action-load-more) |
| AR08 | https://dev.to/ | 4/4 | — |
| AR09 | https://www.gov.uk/find-local-council | 5/5 | — |
| AR10 | https://hn.algolia.com/ | 4/5 | field actions.javascriptReturns.1.value (action-write) |
| AR11 | https://www.gov.uk/find-local-council | 5/5 | — |
| AR12 | https://hn.algolia.com/ | 5/5 | — |
| AR13 | https://dev.to/ | 5/5 | — |

Recorded values:

- L06 traceEvent summary.attempts.0.result.trace: [{"name":"sec-ch-ua","value":"\"Chromium\";v=\"128\", \"Google Chrome\";v=\"128\", \"Not;A=Brand\";v=\"24\""},{"name":"sec-ch-ua-mobile","value":"?0"},{"name":"sec-ch-ua-platform","value":"\"macOS\""},{"name":"user-agent","value":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"}]
- L11 fetchSpacing: 3 fetches, smallest gap 251 ms, required 0 ms; robots.txt HTTP 200, Crawl-delay none, seed allowed
- A13 field startMs: 5
- A14 field progress.maxPagesFetchedWhileRunning: 29
- A15 fetchSpacing: 2 fetches, smallest gap 2342 ms, required 2000 ms; robots.txt HTTP 200, Crawl-delay 2000, seed allowed
- A15 crawlDelay: 2 fetches, 0 without a crawl_delay event, smallest recorded gap 2346 ms, robots.txt Crawl-delay 2000, 0 later pages not naming it
- E01 evidenceSchema: valid (http, success)
- E02 evidenceSchema: valid (browser_local, success)
- E03 evidenceSchema: valid (http, failed)
- E04 evidenceSchema: valid (http, success)
- A22 field elapsedMs: 1447
- A23 field elapsedMs: 1087
- A25 field egress.reportedIp: null vs null
- A26 field timeoutProbe.elapsedMs: 1001
- A34 field progress.maxCompletedWhileRunning: 29
- A35 field startMs: 5
- A35 hostSpacing: 50 fetches on 3 hosts, 0 without a crawl_delay event, smallest same-host gap 251 ms, required 250 ms, 0 gaps shorter
- T01 field summary.attempts.0.result.usage.wallMs: 1503.3188340000343
- T01 field elapsedMs: 1508
- T02 field waitMs: 11077
- T04 field progress.polls: 9
- T04 field final.total: 30 vs 30
- T04 field final.completed: 29 vs 29
- T04 field pageRequests: 3
- T05 field final.total: 9 vs 9
- M04 field compare.markdown.length: 31680 vs 26168
- F10 field file.bytes: 3880235
- M12 field document.strategy: table
- M13 tableTargets: 209 of 209 targets in table rows match
- M13 tableTargets: 61 of 209 targets in table rows match
- MP01 countWhere: 87 of 87
- MP01 field sources.sitemap.files.0.entries: 84
- MP01 field refused.hostDenied: 1
- MP01 field elapsedMs: 3616
- MP01 countWhere: 84 of 87
- MP01 countWhere: 84 of 87
- MP02 countWhere: 73 of 73
- MP02 countWhere: 73 of 73
- MP02 field refused.collapsed: 1
- MP03 countWhere: 24 of 24
- MP03 field refused.subtreeDenied: 27
- MP03 field refused.hostDenied: 12
- MP04 countWhere: 378 of 378
- MP04 countWhere: 376 of 378
- MP04 countWhere: 375 of 378
- MP04 countWhere: 377 of 378
- MP04 field sources.sitemap.files.length: 11
- MP05 field sources.sitemap.files.length: 2
- MP05 field refused.overLimit: 24550
- MP06 countWhere: 66700 of 66700
- MP06 field elapsedMs: 3002
- MP06 field roundTripMs: 3491
- MP07 countWhere: 84 of 84
- MP08 countWhere: 4 of 4
- MP08 field compare.links: 87
- MP09 field refused.robots: 0
- MP10 countWhere: 84 of 84
- MP11 countWhere: 17 of 17
- MP11 field compare.links: 4946
- MP11 field refused.searchFiltered: 4929
- MP12 field refused.searchFiltered: 72
- MP13 countWhere: 85 of 85
- MP13 countWhere: 22 of 85
- MP13 field hostCount: 13
- MP13 field refused.hostDenied: 41
- MP14 countWhere: 63 of 63
- MP14 field refused.hostDenied: 63
- PD01 field file.pdf.pageCount: undefined

Failed checks with the observed value:

- A04 [5] field `success`: true
- A04 [5] field `error`: absent
- A19 [2] field `evidence.httpStatus`: 503
- A22 [6] field `failureReason`: http_error
- A22 [6] field `usage.deadlineExceeded`: absent
- A22 [6] field `elapsedMs`: 1447
- A23 [6] field `status`: failed
- A23 [6] markdownIncludes `https://httpbin.org/delay/10`: absent
- A25 [FS] field `status`: failed
- A25 [9] field `egress.reportedIp`: object
- A29 [platform.client.api-key] field `tokenInEnvironment`: absent
- A29 [FS] field `status`: absent
- A29 [FS] markdownIncludes `This domain is for use in documentation examples`: no markdown
- A29 [platform.client.api-key] field `withoutToken.status`: absent
- A29 [platform.client.api-key] field `withoutToken.code`: absent
- A29 [platform.client.api-key] field `wrongToken.status`: absent
- A29 [platform.client.api-key] field `wrongToken.code`: absent
- A32 [crawl-batch.page-limit] field `report.budgetExceeded`: absent
- A32 [crawl-batch.page-limit] field `report.pagesFetched`: 1
- A32 [crawl-batch.page-limit] field `stepCount`: 1
- T01 [6] field `summary.attempts.0.result.evidence.httpStatus`: 503
- T01 [6] field `summary.attempts.0.result.usage.wallMs`: 1503.3188340000343
- T01 [6] field `status`: failed
- T01 [6] markdownIncludes `https://httpbin.org/delay/10`: absent
- T04 [crawl-batch.crawl-status] field `progress.nullTotals`: 1
- M05 [scrape-formats.only-main-content] traceEvent `summary.attempts.0.result.trace`: 0 of 4 events match
- F11 [P2-files] itemCount: 1
- F11 [P2-files] eachItem: 0 items, 0 failing
- F11 [P2-files] eachItem: 0 items, 0 failing
- F11 [scrape-formats.pdf-parser] eachItem: 0 items, 0 failing
- F11 [scrape-formats.pdf-parser] eachItem: 0 items, 0 failing
- F11 [scrape-formats.pdf-parser] eachItem: 0 items, 0 failing
- F11 [ER] eachItem: 0 items, 0 failing
- F11 [ER] eachItem: 0 items, 0 failing
- F11 [ER] eachItem: 1 items, 0 failing
- F12 [scrape-formats.pdf-parser] pdfPage `PUE, WUE, REF values for the following period - Fiscal Year 2025`: no <!-- page 1 --> marker
- F12 [scrape-formats.pdf-parser] pdfPage `Hillsboro – United States, OR 1.27 1.35 1.46`: no <!-- page 3 --> marker
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
- MP03 [map-search.map-endpoint] field `sources.sitemap.files.0.entries`: 7
- MP11 [map-search.map-search-filter] countWhere: 17 of 17
- CA02 [scrape-formats.metadata-cache-state] field `compare.metadata.cacheState`: hit
- CA02 [scrape-execution.store-in-cache] field `compare.metadata.cachedAt`: string
- CA02 [scrape-execution.store-in-cache] field `compare.usage.requestCount`: 0
- CA09 [scrape-formats.metadata-cache-state] eachItem: 1 items, 1 failing: hit
- CA11 [scrape-execution.custom-headers] field `status`: failed
- CA11 [scrape-execution.custom-headers] markdownIncludes `de-DE`: no markdown
- CA11 [scrape-execution.custom-headers] markdownIncludes `evidence`: no markdown
- PD01 [scrape-formats.pdf-parser] field `status`: failed
- PD01 [scrape-formats.pdf-parser] field `file.pdf.pagesRead`: absent
- PD01 [scrape-formats.pdf-parser] field `file.pdf.pageCount`: absent
- PD01 [scrape-formats.pdf-pages] field `pages.length`: absent
- PD01 [scrape-formats.pdf-pages] field `pages.1.pageNumber`: absent
- PD01 [scrape-formats.pdf-page-markers] markdownExcludes `<!-- page`: no markdown
- AC02 [action-wait-duration] field `status`: failed
- AC02 [action-wait-duration] markdownIncludes `Hello World!`: no markdown
- AC02 [action-wait-duration] traceEvent: 0 of 6 events match
- AC03 [action-wait-selector] field `status`: failed
- AC03 [action-wait-selector] markdownIncludes `Hello World!`: no markdown
- AC04 [action-press] field `status`: failed
- AC04 [action-press] markdownIncludes `You entered: ENTER`: no markdown
- AC05 [action-scroll] field `actions.javascriptReturns.1.value`: 20
- AC06 [action-click] field `status`: failed
- AC06 [action-click] markdownIncludes `Spotlight`: absent
- AC12 [actions-pipeline] markdownIncludes `Example Domain`: absent
- AC24 [action-step] field `status`: failed
- AC24 [action-step] traceEvent: 0 of 6 events match
- AC24 [action-press] markdownIncludes `You entered: ESCAPE`: no markdown
- AR07 [action-step] field `status`: failed
- AR07 [action-step] traceEvent: 0 of 11 events match
- AR07 [action-load-more] field `actions.lists.0.items`: undefined vs 24
- AR10 [action-write] field `actions.javascriptReturns.1.value`: 30 vs 30

## Against the run before #458

This run checks whether #458 (`extract-tf/26`: a page of zero-width characters alone is not content) made other sites worse. Both arms ran one after the other on the same evening, on the same machine, from the same worktree. The API was started with `npm run api` on 8797 with no access grant, and the runs were proxied. The one change between them is #458.

- **Arm A:** `cb75f80c`, the main before #458, at 17:53–18:14Z ([record](2026-10-13-health-all-proxied-cb75f80c.md)). 172 of 207 cases passed and 1,149 of 1,232 checks.
- **Arm B:** `fb992cd2`, this run, at 18:14–18:37Z. 174 of 207 cases passed and 1,152 of 1,232 checks.
- **Cases whose verdict differed (6):**
  - Passed in B and failed in A: M09 and M10 (httpbin.org), TB07 (eia.gov's table) and AR09 (gov.uk).
  - Failed in B and passed in A: PD01 (eia.gov's 10 MB PDF, `status: failed`) and AC24 (the-internet.herokuapp.com's key presses).
- **Rechecks:** the six were run twice more on each commit straight after, with `--only` ([A1](2026-10-13-health-recheck-1-proxied-cb75f80c.md), [A2](2026-10-13-health-recheck-2-proxied-cb75f80c.md), [B1](2026-10-13-health-recheck-1-proxied-fb992cd2.md), [B2](2026-10-13-health-recheck-2-proxied-fb992cd2.md)).
  - M09, M10 and AR09 passed in all four.
  - AC24 failed in all four, so its loss is the site's.
  - TB07 failed once and passed once on each commit.
  - PD01 passed twice on A, and on B failed once (2/8) and passed once (8/8). Four direct scrapes of the PDF on `fb992cd2` were all `success` on the http lane, 10,256,196 bytes in 9–12 s. A PDF is read by the file parser, which #458 does not touch.
- **Reading:** no case is worse on `fb992cd2` that is not as bad on `cb75f80c` or not passing again on a recheck. So no regression is set down to #458.
- **Against 2026-10-11** (180 of 207 at `49033bb0`, [record](2026-10-11-pa11-health-all-proxied-49033bb0.md)): six cases passed then and failed in both arms tonight, A19, A22, A23, T01, CA11 and AC02, all on httpbin.org and the-internet.herokuapp.com. AR05 failed then and passed in both arms tonight. Neither change is set down to the code between the commits; not isolated.
