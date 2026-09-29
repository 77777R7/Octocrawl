# Real-site test set

Frozen 2026-09-29 against firecrawl-js v4.42.0. This is the acceptance set for the P1 items in [ROADMAP.md](../../ROADMAP.md): a P1 item is accepted when its checks pass here, recorded with command and commit.

The machine-readable cases and checks are in [sites.v1.json](sites.v1.json). Run them against a local API:

```bash
npm run api                                   # terminal 1
node research/parity/run-sites.mjs            # terminal 2; add --batch L, --batch 1 or --only S01,S04
node research/parity/run-sites.mjs --record research/parity/runs/<date>-<label>.md
```

Raw responses go to `.w2l/parity/<timestamp>/` (git-ignored). Dated records in `runs/` are not edited after they are written.

Batch 1 was built on 2026-09-29 from the audit's site categories (practice sites, Wikipedia tables, national statistics offices, a JavaScript-rendered data site and a blocking site) before the audit's own site list was committed, to check specific P1 defects. That list is now in [real-site-test-set.md](real-site-test-set.md); its first live batch of 12 URLs is batch L, the batch the P1 exit counts. Both batches stay as frozen.

## Batch L: the audit's first live batch (P1 exit)

The 12 URLs of the audit's "First live batch", in its order: the "first 12 real-site URLs" that the P1 exit requires to pass. The checks were written on 2026-09-29 from the live pages. Where a page had changed since the audit wrote its criterion (L05, L06, L09, L10, L11), the checks follow the page as it was that day and the case note says what changed. Values a site updates on a schedule are checked by pattern or minimum, with the values seen that day in the note. Each case also names the audit feature id it mainly tests.

| Case | URL | What it tests | P1 items | Feature |
| --- | --- | --- | --- | --- |
| L01 | [A Light in the Attic](https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html) | Markdown, links and a json schema in one call; `price` is the number 51.77; a required field the page lacks (`isbn`) makes the JSON `incomplete` with a reason | 1, 6, FS | scrape-formats.json |
| L02 | [books.toscrape.com](https://books.toscrape.com/) | A crawl with `maxPages` 60 returns 60 pages with `budgetExceeded: pages`; paging them 25 at a time takes 3 requests and repeats no URL | — | crawl-batch.page-limit |
| L03 | [quotes.toscrape.com/js](https://quotes.toscrape.com/js/) | Escalates from `http` to `browser_local`, lists both lanes and returns the 10 quotes | FS | scrape-execution.proxy-auto |
| L04 | [scrapethissite: hockey teams, 100 per page](https://www.scrapethissite.com/pages/forms/?per_page=100) | A batch of the listing's own `page_num` links gives 582 rows, as many as the same listing at 25 per page; every page keeps its header row | 3, FS | crawl-batch.batch-start-async |
| L05 | [webscraper.io tables](https://webscraper.io/test-sites/tables) | Both tables kept with their headers and rows | 3, FS | scrape-formats.markdown |
| L06 | [Wikipedia: GDP (nominal)](https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal)) | Every source column header names its source and year; every row as wide as its header; the User-Agent sent is recorded | 3, FS | scrape-formats.markdown |
| L07 | [Statistics Canada 18-10-0006-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000601) | Five month columns, eleven series rows of values, the release date and the DOI | FS | scrape-formats.markdown |
| L08 | [GOV.UK subnational consumption report 2024](https://www.gov.uk/government/statistics/subnational-electricity-and-gas-consumption-summary-report-2024/subnational-electricity-and-gas-consumption-summary-report-2024--2) | All 9 tables kept, each captioned table right after its caption; cookie banner, navigation, feedback and footer left out | 3, 6, FS | scrape-formats.only-main-content |
| L09 | [Our World in Data: CO₂ per capita, table tab](https://ourworldindata.org/grapher/co-emissions-per-capita?tab=table) | The `http` result, which lacks the table, carries a thin-content signal; the browser lane returns the table rows | FS | scrape-formats.response-warnings-hints |
| L10 | [Apple Environment](https://www.apple.com/environment/) | Headline figures captured with their labels, none glued onto the text before it; the 2026 Environmental Progress Report PDF link found | 3, FS | scrape-formats.links |
| L11 | [data.gov.uk search: energy](https://www.data.gov.uk/search?q=energy) | A 3-page crawl spaces its fetches by the Crawl-delay robots.txt gives at run time (none on 2026-09-29), or is `policy_denied` throughout if robots.txt disallows the URL | — | crawl-batch.crawl-delay |
| L12 | [BLS Employment Situation, Table A-1](https://www.bls.gov/news.release/empsit.t01.htm) | One request per lane; either `blocked` with HTTP 403, a reason and no denial-page Markdown, or the table extracted | 2 | scrape-execution.error-model |

A dash means every check of the case names an audit feature id, because no P1 item covers it.

## Batch 1: P1 defect checks

Practice sites come first, because any failure there is a W2L bug. The blocking site comes last, so that its IP reputation cost cannot affect the others.

| Case | URL | What it tests | P1 items |
| --- | --- | --- | --- |
| S01 | [books.toscrape.com](https://books.toscrape.com/) | Inline spacing, icon-only elements, links and image URLs in Markdown | 3, 4 |
| S02 | [A Light in the Attic](https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html) | A required array with no source on the page must make the JSON `incomplete` | 1 |
| S03 | [a missing books.toscrape.com page](https://books.toscrape.com/catalogue/does-not-exist-w2l/index.html) | A 404 returns its body and `httpStatus`, and is not `success` | 2 |
| S04 | [quotes.toscrape.com](https://quotes.toscrape.com/) | Adjacent `div`s and `span`s stay separate; root-relative links | 3, 4 |
| S05 | [quotes.toscrape.com/js](https://quotes.toscrape.com/js/) | JavaScript-rendered content through the browser lane | 3 |
| S06 | [quotes.toscrape.com/js-delayed](https://quotes.toscrape.com/js-delayed/) | Content that appears after 10 seconds needs `waitFor` | 6 |
| S07 | [scrapethissite: countries](https://www.scrapethissite.com/pages/simple/) | `<strong>Label:</strong> <span>value</span>` keeps its space; no empty emphasis from icons | 3 |
| S08 | [scrapethissite: hockey teams](https://www.scrapethissite.com/pages/forms/) | A data table becomes a GFM table | 3 |
| S09 | [GitHub Docs: setting your Git username](https://docs.github.com/en/get-started/git-basics/setting-your-username-in-git) | Ordered-list numbers and code blocks inside list items | 3, 4 |
| S10 | [Wikipedia: countries by population](https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population) | A large table page; a slow robots.txt must not become an HTTP 500 | 2, 3, 4 |
| S11 | [Statistics Canada 17-10-0009-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1710000901) | The data table is filled by JavaScript; an empty table shell must not count as success | FS |
| S12 | [BLS Employment Situation](https://www.bls.gov/news.release/empsit.nr0.htm) | Blocks plain HTTP with 403: either the release text (it sits in one `<pre>`) through another lane, or an honest `blocked` | 2, FS |

## API cases

| Case | Request | What it tests | P1 items |
| --- | --- | --- | --- |
| A01 | Batch of S01 and S04 with `links` | Batch items carry `links` like scrape does | 5 |
| A02 | Scrape with `html` and `rawHtml` among four formats | An unsupported format is named in the error (or returned), not reported as a count limit | 5 |
| A03 | `/fc/v1/scrape` with `html` | The shim returns `html` or an explicit error, never silently drops it | 5 |
| A04 | `/fc/v1/scrape` with `actions` | An unsupported Firecrawl parameter is rejected by name | 5 |
| A05 | Crawl of books.toscrape.com with `includePaths` | Only matching paths after the seed | 7 |
| A06 | Crawl with `excludePaths` and `formats` | Excluded paths skipped; crawl pages carry `links` | 7 |
| A07 | Scrape of quotes.toscrape.com with `onlyMainContent: false` | The whole page: the header's Login link and the footer that main content drops, with the quotes | 6 |
| A08 | Scrape of quotes.toscrape.com/js-delayed with `waitFor` and a `timeout` shorter than the page's delay | HTTP 200 with `partial` or `failed`/`timeout`, never HTTP 500 | 6 |
| A09 | A08 through `/fc/v1/scrape` | The shim answers the timeout with HTTP 200 too | 6 |
| A10 | Crawl of scrapethissite.com/pages/, which redirects to www, with `maxPages` 4 | The start answers within 1 s; the crawl follows the sandbox pages on www and completes with 4 pages | 10 |
| A11 | Crawl of docs.python.org/3/ with `maxPages` 30, status polled every 2 s | While it runs the status counts pages and never goes back and `/pages` lists some; at the end `pagesFetched` equals the pages and errors listed | 10 |
| A12 | Crawl of a Statistics Canada listing (robots.txt `Crawl-delay: 2`) with `maxPages` 3 | Fetches are the robots.txt Crawl-delay apart, as estimated and as W2L records them | 10 |

## Later batches

About 40 sites in total, plus the seed user's URLs. These were reachable on 2026-09-29; their checks are written when the feature they test is worked on.

| Site | For |
| --- | --- |
| Batch 2: the seed user's 72 URLs in [research/coos-pilot/](../coos-pilot/) | P1 exit (≥70% success, honest reasons for the rest) |
| [ONS population estimates](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates), [GOV.UK statistics announcements](https://www.gov.uk/government/statistics/announcements), [data.gov.uk](https://www.data.gov.uk/) | UK government statistics pages, links to datasets, `onlyMainContent` |
| [Our World in Data: population](https://ourworldindata.org/grapher/population) | JavaScript-rendered chart page |
| [World Bank: population, total](https://data.worldbank.org/indicator/SP.POP.TOTL), [Eurostat: population](https://ec.europa.eu/eurostat/web/population-demography), [ABS: population](https://www.abs.gov.au/statistics/people/population), [Stats NZ: population](https://www.stats.govt.nz/topics/population/) | Statistics offices: tables, large pages, `timeout` |
| [US Census QuickFacts](https://www.census.gov/quickfacts/fact/table/US/PST045224), [OECD data](https://www.oecd.org/en/data.html) | Return 403 to plain HTTP: honest `blocked` or content through another lane |
| Ten report PDFs and ten table pages chosen with the seed user | P2 PDF text and tables → CSV |
| Sitemaps of books.toscrape.com and two statistics offices | P2 `map` |
