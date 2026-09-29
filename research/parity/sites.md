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
| A10 | Scrape of quotes.toscrape.com | `metadata` holds the page `<title>` and language, and null where the page declares nothing (no description, keywords or favicon) | 10 |
| A11 | Scrape of the GOV.UK statistics page used by L08 | `metadata.title`, language, favicon and canonical URL as declared; no description, because the page declares none | 10 |
| A12 | `/fc/v1/scrape` of python.org | `data.metadata` carries the title, description, language, keywords and favicon the page declares | 10 |
| A13 | Crawl of scrapethissite.com/pages/, which redirects to www, with `maxPages` 4 | The start answers within 1 s; the crawl follows the sandbox pages on www and completes with 4 pages | 10 |
| A14 | Crawl of docs.python.org/3/ with `maxPages` 30, status polled every 2 s | While it runs the status counts pages and never goes back and `/pages` lists some; at the end `pagesFetched` equals the pages and errors listed | 10 |
| A15 | Crawl of a Statistics Canada listing (robots.txt `Crawl-delay: 2`) with `maxPages` 3 | Fetches are the robots.txt Crawl-delay apart, as estimated and as W2L records them | 10 |

A16–A35 were added on 2026-09-29 for the scoring of the 29 core features ([core-status-2026-09-29.md](core-status-2026-09-29.md)): each runs the audit's real-site check from [feature-matrix.csv](feature-matrix.csv) for a core feature that had none in this set, or had only a check adapted to another site. A25 needs the environment proxy in the API's and the runner's environment. The SDK cases (`endpoint: sdk`) drive the built `@w2l/sdk`. A29 also needs a hosted-mode API started with a token, its URL in `W2L_HOSTED_API_URL` and the same token in `W2L_API_TOKEN` for the runner:

```bash
W2L_API_TOKEN=<token> W2L_TASK_ROOT=.w2l/api-hosted npm run api -- --hosted --host 127.0.0.1 --port 8817   # terminal 3
W2L_HOSTED_API_URL=http://127.0.0.1:8817 W2L_API_TOKEN=<token> node research/parity/run-sites.mjs
```

| Case | Request | What it tests | Feature |
| --- | --- | --- | --- |
| A16 | Scrape of Wikipedia's Web scraping article with `markdown`, `links` and a `json` schema | All three in one response; the H1, absolute targets and no `data:` URIs in the Markdown | scrape-formats.formats-array |
| A17 | Batch of 3 Wikipedia articles with `formats: ['links']` | Every item has non-empty absolute links and no Markdown | scrape-formats.formats-array |
| A18 | Scrape of http://github.com | Requested URL, final URL, the redirect hop, status 200 and the content type | scrape-formats.metadata-response-status |
| A19 | Scrape of httpbin.org/status/404 | Not success; `http_error`, 404 and the content type | scrape-formats.metadata-response-status |
| A20 | Scrape of quotes.toscrape.com/js-delayed with `waitFor: 0` | The late text is absent (S06 has it with `waitFor`) | scrape-execution.wait-for |
| A21 | The same with `waitFor: -1` | HTTP 400 `invalid_request` before any fetch | scrape-execution.wait-for |
| A22 | Scrape of httpbin.org/delay/10 with `timeout: 3000` | `failed`/`timeout`, HTTP 200, within 3–5 s | scrape-execution.timeout |
| A23 | The same with `timeout: 20000` | `success` with the endpoint's JSON | scrape-execution.timeout |
| A24 | The same with `timeout: 0` | HTTP 400 `invalid_request` | scrape-execution.timeout |
| A25 | Scrape of httpbin.org/ip through the environment proxy | The address W2L reports is the proxy's egress address, not the direct one; `evidence.envProxy` names the proxy | scrape-execution.proxy-basic |
| A26 | SDK: crawl docs.python.org/3/tutorial/ (10 pages), `waitCrawl` 120 s, list pages; the same crawl waited on for 1 s | 10 pages with Markdown; `WaitTimeoutError` with the crawl's id; the probe crawl cancelled | crawl-batch.crawl-wait |
| A27 | SDK: crawl books.toscrape.com (20 pages), `waitCrawl` polling every 1 s; the same crawl waited on for 1 s | All 20 steps; `WaitTimeoutError` with the crawl's id | platform.sdk.waiters |
| A28 | SDK: batch of 10 Wikipedia articles, `waitBatch` 120 s, list items; the same batch waited on for 1 s | 10 successful items with Markdown; `WaitTimeoutError` with the batch's id; the probe batch cancelled | crawl-batch.batch-wait |
| A29 | SDK against a hosted-mode API, token from `W2L_API_TOKEN`; again with no token and a wrong one | The scrape succeeds; the other two get HTTP 401 `unauthorized` | platform.client.api-key |
| A30 | Crawl of docs.python.org/3/ with `includePaths: ['^/3/library/.*']`, `maxPages` 15 | Every page after the seed is under /3/library/ | crawl-batch.include-paths |
| A31 | Crawl of docs.python.org/3/ with `excludePaths: ['^/3/whatsnew/.*']`, `maxPages` 30 | Nothing under /3/whatsnew/ is fetched | crawl-batch.exclude-paths |
| A32 | Crawl of Wikipedia's Web crawler article with `maxPages` 7 | Exactly 7 steps and `budgetExceeded: pages` | crawl-batch.page-limit |
| A33 | Crawl of books.toscrape.com with `maxPages` 5, product-page `includePaths`, `markdown`, `links` and a `json` schema | Every page has Markdown and absolute links; every product page JSON with its title and a numeric price | crawl-batch.crawl-scrape-options |
| A34 | Batch of 30 books.toscrape.com listing pages, status polled every second | `completed` never goes back, mid-run items are in the final list, ends at 30 completed and 0 remaining | crawl-batch.batch-status |
| A35 | Batch of 50 URLs on books.toscrape.com, quotes.toscrape.com and Wikipedia | The start answers at once; 50 items; per host, fetch starts at least the required delay apart (W2L's `crawl_delay` record) | crawl-batch.batch-start-async |
| T01 | Scrape of httpbin.org/delay/10 with `timeout: 45000` | The HTTP rung waits past its default 10 s and receives the 200; `success` with the endpoint's JSON (through the browser rung, which fetches JSON again) | scrape-execution.timeout |
| T02 | SDK: `crawlAndWait` on books.toscrape.com (20 pages), its first three status requests answered by the runner with a 503, a network error and a 429 | The wait retries through all three; completed with all 20 steps | platform.sdk.waiters |
| T03 | SDK: `batchAndWait` on 5 Wikipedia articles, its first two status requests answered with a 502 and a network error | The wait retries through both; 5 successful items with Markdown | crawl-batch.batch-wait |
| T04 | `/fc` crawl of docs.python.org/3/ (`limit` 30), status polled every 2 s, data read 10 at a time | While scraping, `total` known, never below `completed`, above it at some poll, `next` present; at the end `completed`, `total` data entries with unique URLs, `completed` of them without an error, no `next` on the last page | crawl-batch.crawl-status |
| T05 | `/fc` crawl of books.toscrape.com (`limit` 40), cancelled after 3 completed pages | Status `cancelled`; `total` equals the data entries; no `next` on the last page | crawl-batch.crawl-status |
| T06 | MCP over the local HTTP service (`W2L_LOCAL_MCP_URL`): scrapes of httpbin.org/delay/10 (`timeout: 60000`), 2 s in cancelled by another client's session, by the calling client, and dropped by closing their requests, then a probe scrape of httpbin.org/delay/1 | Each client gets its own session id; the other client's cancel leaves the call to answer `success`; its own is answered `Request cancelled` within 3 s; the probe answers within 6 s, not behind the two dropped scrapes | scrape-execution.timeout |

T06 was added on 2026-09-29 for MCP cancellation over Streamable HTTP. It drives the local MCP service, not the REST API: start the service with its own port and task root, and give the runner its `/mcp` URL in `W2L_LOCAL_MCP_URL`. Without that variable the case is skipped.

```bash
W2L_LOCAL_MCP_PORT=8921 W2L_TASK_ROOT=.w2l/local-mcp npm run local:mcp   # terminal 4
W2L_LOCAL_MCP_URL=http://127.0.0.1:8921/mcp node research/parity/run-sites.mjs --only T06
```

J01–J03 were added on 2026-09-29 for the JSON extraction gaps of [core-status-2026-09-29.md](core-status-2026-09-29.md): schemas as Pydantic and Zod write them, the evidence of every value, and the prompt-only half of the audit's check, which W2L refuses.

| Case | Request | What it tests | Feature |
| --- | --- | --- | --- |
| J01 | Scrape of the L01 book page with a Pydantic v2 `model_json_schema()` schema (`$schema`, `title`, nullable `anyOf`, `default`, `pattern`, `format`) | Accepted; title, price, UPC, availability and reviews read from the page, each with its evidence (`h1[0]`, `p.price_color`, the table row, `fetch` for the URL); the missing ISBN is `null` with an issue | scrape-formats.json |
| J02 | Scrape of a catalog.data.gov dataset page with a zod-to-json-schema schema (draft-07 `$schema`, root `$ref` into `definitions`, nullable type lists, `enum`, `pattern`) | Accepted; the DCAT fields from the page's metadata table with their rows as evidence; the missing `spatial` is `null` with an issue | scrape-formats.json |
| J03 | Scrape of the L01 book page with a `json` format that has a prompt and no schema | HTTP 400 `invalid_request`, as documented: W2L does not extract JSON without a schema | scrape-formats.json |

J04–J05 were added on 2026-09-29 for numbers read as the page writes them ([core-status-2026-09-29-p1-wave5.md](core-status-2026-09-29-p1-wave5.md): `12,99 €` was read as 1299). Both are German product pages with comma-decimal prices. J04's `jsonIssue` check on `json.evidence` looks for the evidence entry that quotes the price's text.

| Case | Request | What it tests | Feature |
| --- | --- | --- | --- |
| J04 | Scrape of a jpc.de book page (`EUR 399,99*`, JSON-LD and microdata `399.99`) with a name, price and currency schema | `complete`; price 399.99 from the JSON-LD value, whose format writes `.` as the decimal point, with its text in `json.evidence` | scrape-formats.json |
| J05 | Scrape of a product page of OXID's demo shop, whose only price is the visible `499,00 €`, with a title and price schema | Price 499, or reported missing with an issue; never another number | scrape-formats.json |

M01–M08 were added on 2026-09-29 for the remaining gaps of three core features in [core-status-2026-09-29.md](core-status-2026-09-29.md): the audit's Markdown check (MDN, Hacker News) and onlyMainContent check (BBC), and the response metadata the browser lane, the compact response and `/fc` report. The runner's `compareRequest` scrapes the same URL a second time into `compare`.

| Case | Request | What it tests | Feature |
| --- | --- | --- | --- |
| M01 | Scrape of MDN's 404 status page | The H1, absolute targets, no `data:` URIs, no header or footer text | scrape-formats.markdown |
| M02 | Scrape of the Hacker News front page | The story list, absolute targets, no `data:` URIs, neither the header's nor the footer's links | scrape-formats.markdown |
| M03 | Scrape of a path MDN answers with 404 | The error page kept as evidence has absolute link targets | scrape-formats.markdown |
| M04 | Scrape of BBC News technology, then again with `onlyMainContent: false` | True leaves out the navigation and footer; false keeps them and is longer | scrape-formats.only-main-content |
| M05 | Scrape of the Wikipedia portal with `onlyMainContent: false`, then with the default | On a page with no main block, false returns the whole page as success; the default keeps it as evidence | scrape-formats.only-main-content |
| M06 | Scrape of http://www.github.com with `waitFor` (browser lane) | The response's content type and both redirect hops, `redirectChain.complete: true` | scrape-formats.metadata-response-status |
| M07 | Compact scrape (`debug: false`) of http://github.com | `snapshot.httpStatus` and `snapshot.contentType`; the hop in the Evidence Record | scrape-formats.metadata-response-status |
| M08 | `/fc/v1/scrape` of http://github.com | `data.metadata` with `sourceURL`, the final `url`, `statusCode` and `contentType` | scrape-formats.metadata-response-status |

M09–M11 were added on 2026-09-29 for the client-side navigation gap of `scrape-formats.metadata-response-status` in [core-status-2026-09-29-p1-wave5.md](core-status-2026-09-29-p1-wave5.md): a page that moves on by itself after it answered, by a script or a meta refresh. Each starts at the browser rung (`waitFor`). The first page of M09 and M10 is W2L's own HTML, served by httpbin.org's `/base64` endpoint, which answers the HTML its URL encodes; the page it goes to is the S03 404 page. M11's pages are the site's own.

| Case | Request | What it tests | Feature |
| --- | --- | --- | --- |
| M09 | Scrape of a page (httpbin.org `/base64`) whose script goes to the S03 404 page | `failed`/`http_error` with the 404 page's final URL, status and content type; both URLs in the redirect chain, `complete: true` | scrape-formats.metadata-response-status |
| M10 | `/fc/v1/scrape` of a page (httpbin.org `/base64`) whose zero-second meta refresh goes to the S03 404 page | `success: false`, `http_error`, the 404 page's `url`, `statusCode` and `contentType`, not a `connection_error` | scrape-formats.metadata-response-status |
| M11 | Scrape of the spa-github-pages demo's /example, a 404 whose script goes to /?/example, a 200 app that sets its URL back with `history.replaceState` | `success` with the app, final URL /?/example (the last URL requested) with its 200, both URLs in the chain, the URL the page set in the trace | scrape-formats.metadata-response-status |

A36 was added on 2026-09-29 for SEC.gov's declared User-Agent. It runs only when `W2L_CONTACT` is set in the runner's environment and the API was started with the same value (`requiresEnv`); otherwise the runner reports it as skipped, never as passed. The record shows the value as `<W2L_CONTACT>`.

| Case | Request | What it tests | P1 items |
| --- | --- | --- | --- |
| A36 | Scrape of an SEC EDGAR filing (IREN Limited, quarter to 31 December 2025) with `mode: "research"` | `success` with HTTP 200 and the filing's text; the Evidence Record's User-Agent is `W2L Research <W2L_CONTACT>` and its contact is `W2L_CONTACT` | FS, ER |

E01–E06 were added on 2026-09-29 for the Evidence Record v1 ([packages/contracts/schemas/evidence-record.v1.json](../../packages/contracts/schemas/evidence-record.v1.json)). Each checks that the record validates against the schema, and the fields below.

| Case | Request | What it tests | Feature |
| --- | --- | --- | --- |
| E01 | Scrape of books.toscrape.com | An HTTP-lane success: lane, final URL, robots decision (`no_robots`), hashes | ER |
| E02 | Scrape of quotes.toscrape.com/js | A browser-lane success: the browser's identity and a complete redirect chain | ER |
| E03 | Scrape of the S03 404 page | A failure kept as evidence: `http_error`, HTTP 404, the page's hash | ER |
| E04 | JSON extraction on a books.toscrape.com product | `fieldEvidence` for each field (UPC from the product table, price from `p.price_color`), no Markdown hash | ER |
| E05 | Batch of three URLs, the 404 included | Every item carries its own record | ER |
| E06 | Crawl of books.toscrape.com, 3 pages | Every crawl page, and every item under `/errors`, carries its own record | ER |

F01–F16 were added on 2026-09-29 for P2 file download and PDF text. The PDFs are the seed user's (S1–S6) and research PDFs (R1, R2, R4) of [research/pdf-corpus/manifest.v1.json](../pdf-corpus/manifest.v1.json); a PDF case checks the manifest's SHA-256 and size and that each of its phrases is on its page after the `<!-- page N -->` marker, so a publisher that replaces the file fails the case.

| Case | Request | What it tests | Feature |
| --- | --- | --- | --- |
| F01–F06 | Scrape of each of the seed user's six PDFs (F02 and F03 through a page that redirects to the PDF) | Read on the HTTP lane alone, saved as received, text by page | scrape-formats.pdf-parser |
| F07 | Scrape of the IEA's Energy and AI report (R1, 304 pages) | A long PDF: saved as received, text by page | scrape-formats.pdf-parser |
| F08 | Scrape of Eurostat's Key figures on Europe (R4, 11.1 MB) | A file above the 10 MiB page cap, with pages that have no text layer | scrape-formats.pdf-parser |
| F09 | Scrape of a Eurostat SDMX CSV | A CSV served as `application/vnd.sdmx.data+csv`: saved, its text as Markdown | file download |
| F10 | Scrape of a Statistics Canada table ZIP | A ZIP saved as received, no Markdown | file download |
| F11 | Crawl of an Insee publication page limited to its PDF (R2) | A PDF reached by a crawl becomes a crawl page with its file and Evidence Record | file download |
| F12 | `/fc/v1/scrape` of the S4 PDF | The shim answers success with the PDF text and page markers | scrape-formats.pdf-parser |
| F13 | Scrape of the S4 PDF with `waitFor` (browser rung first) | The browser catches the download: the same file and text as the HTTP lane | file download |
| F14 | JSON extraction from the S5 PDF | Fields only from `Label: value` lines, each with its page; conflicting labels left out as `field_ambiguous` | scrape-formats.json |
| F15 | Scrape of a World Bank API JSON | A JSON file saved, its text as Markdown | file download |
| F16 | Scrape of a GOV.UK Energy Trends XLSX | An XLSX saved as received with its hash and size, no Markdown | file download |

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
