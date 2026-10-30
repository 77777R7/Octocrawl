# Firecrawl Scrape Content Dataset v1: Octocrawl local and open comparators, 2026-10-30

A record of one run. Octocrawl's local API (arms A1 and A2) and four comparators read the 1,000 live URLs of Firecrawl's
scrape-content dataset; every row was scored with the scrape-evals deterministic scorer. **Firecrawl was not run and no
Firecrawl credits were spent**: its numbers below are quoted from what others published.

## What ran

- Octocrawl source commit: `2aaad1f4` (main). Engine build: up to date (`tsc --build --dry` against this checkout's
  `packages/*/dist`): checked before A1 (about 18:18Z, read in the session, not logged) and at 19:06:42Z (logged);
  the A2 API had started at 18:47:53Z and nothing was built in between.
- Dataset: HF `firecrawl/scrape-content-dataset-v1`, revision `aad2b002cd74147236ee6fb4fd7e2bcf28955c3c`, file
  `1-0-0.csv`, sha256 `47c0b99d51a325c618ef0e14e3f6eb15d420a1eaa196be3dc2e4d4e0b7926889` (1,000 rows; 133 carry
  `error`; 150 have an empty `truth_text`). The harness's own copy (sha256 `3b06c34c…`) differs only in CRLF line
  endings: no field differs once `\r\n` is read as `\n`.
- Harness: github.com/martynasoxylabs/scrape-evals at `a94764f3ea920f30a4ce435adcdcf1c1cf6ee1ac` (2025-11-20), used
  unmodified; Octocrawl's glue at `research/benchmarks/scrape_evals/` (commit `9c7ad5a9`, the files the run used,
  rebased unchanged from `afe60c65`) adds engines to its path.
- Python 3.12.13 in `.w2l/pyenv` (crawl4ai 0.9.5, playwright 1.64.1, requests 2.34.2, pandas 3.0.6).
- Network: every arm went through the local proxy `HTTPS_PROXY=http://127.0.0.1:7890`. Octocrawl's API follows the
  environment proxy and launches the installed Chrome with it; the Crawl4AI and Playwright browsers were given it
  (`BENCH_PROXY`); Jina was called through it. **No arm ran direct**, so A2 used Howard's Chrome but not his home IP
  directly.
- A2 power: on AC power with the lid open for the whole run (16 checks, 19:13:01Z–19:27:02Z, `pmset`/`ioreg`).
- Concurrency 8 per arm (Jina 4, paced to 18 requests a minute); no retries beyond each engine's own.

| Arm | What | Window (UTC, 2026-10-29) |
|---|---|---|
| A1 | Octocrawl local API, defaults (`npm run api`, port 8787), `formats: ["markdown"]` | 18:18:27–18:30:15 |
| A2 | Octocrawl local API with the installed_chrome grant (`.w2l/access/installed-chrome-grant-bench-2026-10-30.json`, sha256 `6dfd25dc…`), `access: "enhanced"`, port 8786 | 19:13:01–19:27:34 |
| Crawl4AI | crawl4ai 0.9.5, the harness's engine (default configs, the page's HTML is scored); its Markdown kept beside it | 18:36:29–18:48:15 |
| Jina | `https://r.jina.ai/<url>`, no API key (free keyless tier), JSON answer, `data.content` scored | 18:18:52–19:14:43 |
| Playwright | headless Chromium, `networkidle`, 30 s, the page's HTML scored (the harness's engine) | 18:48:15–19:12:57 |

Commands (from the repository root; `H=~/Code/w2l/.w2l/benchmarks/src/scrape-evals`, `R=.w2l/benchmarks/runs/fc-2026-10-30`,
`D=.w2l/benchmarks/data/fc/1-0-0.csv`):

```bash
npx tsc --build && W2L_API_PORT=8787 npm run api
OCTO_API=http://127.0.0.1:8787 OCTO_RAW_DIR=$R/a1/raw .w2l/pyenv/bin/python research/benchmarks/scrape_evals/run.py $H -- --scrape_engine octocrawl_local --output-dir $R/a1 --dataset $D --max-workers 8
W2L_API_PORT=8786 W2L_ACCESS_GRANT=~/Code/w2l/.w2l/access/installed-chrome-grant-bench-2026-10-30.json node --import tsx packages/api/src/cli.ts
OCTO_API=http://127.0.0.1:8786 OCTO_ACCESS=enhanced OCTO_RAW_DIR=$R/a2/raw .w2l/pyenv/bin/python research/benchmarks/scrape_evals/run.py $H -- --scrape_engine octocrawl_local --output-dir $R/a2 --dataset $D --max-workers 8
BENCH_PROXY=http://127.0.0.1:7890 OCTO_RAW_DIR=$R/crawl4ai_proxied/raw .w2l/pyenv/bin/python research/benchmarks/scrape_evals/run.py $H -- --scrape_engine crawl4ai_proxied --output-dir $R/crawl4ai_proxied --dataset $D --max-workers 8
BENCH_PROXY=http://127.0.0.1:7890 .w2l/pyenv/bin/python research/benchmarks/scrape_evals/run.py $H -- --scrape_engine playwright_proxied --output-dir $R/playwright_proxied --dataset $D --max-workers 8
.w2l/pyenv/bin/python research/benchmarks/scrape_evals/run.py $H -- --scrape_engine jina_reader --output-dir $R/jina --dataset $D --max-workers 4
.w2l/pyenv/bin/python research/benchmarks/scrape_evals/report.py --harness $H --dataset $D --arm "A1=$R/a1/octocrawl_local_quality" …
```

## Definitions

- **Coverage Nov-2025**: the harness's `success` (status 200–399, no error, non-empty content, no block-page phrase,
  and the row has a truth or lie snippet). This is the definition of Firecrawl's November 2025 table.
- **Coverage Jan-2026**: at least 10% of the row's unique truth words appear anywhere in the content the arm delivered
  without an error. This is our reading of Firecrawl's January 2026 definition; their code for it was not available.
- **F1**: the harness's best-window F1 against `truth_text` (0 for a row without content).
- **Hollow successes**: of the rows counted as a success, the share whose content holds none of the truth words (rows
  with no truth snippet left out of this share).
- Every view keeps all its rows in the denominator. "Flagged" rows are the 133 the dataset itself marks with `error`.

## Results

| Arm | View | n | Coverage Nov-2025 % | Coverage Jan-2026 % | F1 | Hollow successes % |
|---|---|---:|---:|---:|---:|---:|
| A1 Octocrawl local default | all 1,000 | 1000 | 62.1 | 57.7 | 0.442 | 1.0 |
| A1 Octocrawl local default | excl. 133 dataset-flagged | 867 | 71.3 | 66.2 | 0.507 | 1.0 |
| A1 Octocrawl local default | only the 133 flagged | 133 | 2.3 | 2.3 | 0.020 | 0.0 |
| A2 Octocrawl local, installed Chrome | all 1,000 | 1000 | 65.3 | 60.8 | 0.461 | 0.9 |
| A2 Octocrawl local, installed Chrome | excl. 133 dataset-flagged | 867 | 75.0 | 69.8 | 0.529 | 0.9 |
| A2 Octocrawl local, installed Chrome | only the 133 flagged | 133 | 2.3 | 2.3 | 0.020 | 0.0 |
| Crawl4AI 0.9.5 (HTML, harness default) | all 1,000 | 1000 | 48.0 | 63.4 | 0.348 | 0.6 |
| Crawl4AI 0.9.5 (HTML, harness default) | excl. 133 dataset-flagged | 867 | 55.2 | 73.0 | 0.401 | 0.6 |
| Crawl4AI 0.9.5 (HTML, harness default) | only the 133 flagged | 133 | 0.8 | 0.8 | 0.005 | 0.0 |
| Crawl4AI 0.9.5 (its Markdown) | all 1,000 | 1000 | 64.4 | 59.9 | 0.435 | 3.9 |
| Crawl4AI 0.9.5 (its Markdown) | excl. 133 dataset-flagged | 867 | 74.2 | 69.0 | 0.501 | 3.9 |
| Crawl4AI 0.9.5 (its Markdown) | only the 133 flagged | 133 | 0.8 | 0.8 | 0.007 | 0.0 |
| Jina Reader (keyless) | all 1,000 | 1000 | 58.0 | 49.4 | 0.346 | 4.4 |
| Jina Reader (keyless) | excl. 133 dataset-flagged | 867 | 66.6 | 56.7 | 0.398 | 4.4 |
| Jina Reader (keyless) | only the 133 flagged | 133 | 2.3 | 1.5 | 0.012 | 0.0 |
| Playwright (HTML) | all 1,000 | 1000 | 35.7 | 48.0 | 0.289 | 0.6 |
| Playwright (HTML) | excl. 133 dataset-flagged | 867 | 41.1 | 55.2 | 0.333 | 0.6 |
| Playwright (HTML) | only the 133 flagged | 133 | 0.8 | 0.8 | 0.005 | 0.0 |

Jina's run lost 110 rows to an outage on our network path (see the notes). The same 110 URLs were asked again from
19:32:35Z to 19:39:04Z with the same settings (`--resume` over a copy of the run with those rows' outputs removed);
107 answered without an error. Scored together with the other 890 rows as first recorded, apart from the table above:

| Arm | View | n | Coverage Nov-2025 % | Coverage Jan-2026 % | F1 | Hollow successes % |
|---|---|---:|---:|---:|---:|---:|
| Jina Reader (keyless), the 110 SSL-error rows asked again | all 1,000 | 1000 | 66.8 | 57.1 | 0.404 | 4.6 |
| Jina Reader (keyless), the 110 SSL-error rows asked again | excl. 133 dataset-flagged | 867 | 76.6 | 65.5 | 0.463 | 4.6 |
| Jina Reader (keyless), the 110 SSL-error rows asked again | only the 133 flagged | 133 | 3.0 | 2.3 | 0.020 | 0.0 |

On this view Jina's Nov-2025 coverage is above A2's (66.8 against 65.3), its Jan-2026 coverage and F1 below
(57.1 against 60.8, 0.404 against 0.461), and its share of hollow successes five times A2's.

### Per status (unflagged / flagged / all rows)

A1 Octocrawl local default:

| Outcome | Unflagged | Flagged | All |
|---|---:|---:|---:|
| success | 618 | 3 | 621 |
| failed: http_error | 88 | 60 | 148 |
| failed: empty_unverified | 46 | 11 | 57 |
| blocked: cloudflare_challenge | 40 | 12 | 52 |
| not a harness success (block-page phrase, or no truth/lie snippet) | 6 | 27 | 33 |
| blocked: bot_detected_generic | 28 | 4 | 32 |
| failed: timeout | 11 | 4 | 15 |
| failed: connection_error | 7 | 6 | 13 |
| blocked: captcha | 10 | 2 | 12 |
| failed: tls_error | 6 | 2 | 8 |
| blocked: rate_limit | 3 | 0 | 3 |
| empty content | 1 | 1 | 2 |
| blocked: login_wall | 2 | 0 | 2 |
| blocked: geo_restricted | 1 | 0 | 1 |
| API error 500 (the call, not the page) | 0 | 1 | 1 |

A2 Octocrawl local, installed Chrome:

| Outcome | Unflagged | Flagged | All |
|---|---:|---:|---:|
| success | 650 | 3 | 653 |
| failed: http_error | 86 | 60 | 146 |
| failed: empty_unverified | 43 | 7 | 50 |
| not a harness success (block-page phrase, or no truth/lie snippet) | 7 | 32 | 39 |
| blocked: bot_detected_generic | 20 | 5 | 25 |
| blocked: cloudflare_challenge | 17 | 7 | 24 |
| blocked: captcha | 12 | 5 | 17 |
| failed: timeout | 10 | 4 | 14 |
| failed: connection_error | 7 | 6 | 13 |
| failed: tls_error | 6 | 2 | 8 |
| blocked: rate_limit | 3 | 0 | 3 |
| empty content | 2 | 1 | 3 |
| blocked: login_wall | 2 | 0 | 2 |
| blocked: geo_restricted | 1 | 0 | 1 |
| failed: parse_error | 1 | 0 | 1 |
| API error 500 (the call, not the page) | 0 | 1 | 1 |

Comparators (all rows): Crawl4AI 480 success, 225 not a harness success (block-page phrase; see below), 145 HTTP 4xx,
89 "Blocked by anti-bot protection", 44 Crawl4AI internal errors, 14 HTTP 5xx, 3 timeouts. Playwright 357 success,
224 HTTP 4xx, 184 timeouts, 174 not a harness success, 61 HTTP 5xx. Jina 580 success, 184 HTTP 4xx from Reader,
110 SSL errors on our connection to r.jina.ai, 98 not a harness success, 19 empty, 8 timeouts, 1 HTTP 5xx.

## Published numbers, not run by us

| Source | Date | Definition | Firecrawl | Others |
|---|---|---|---|---|
| Firecrawl's table in the scrape-evals README (harness `a94764f3`) | Nov 2025 | Nov-2025 coverage / F1, 1,000 URLs | 80.9% / 0.68 | Exa 76.3, Tavily 67.6, ScraperAPI 63.5, Zyte 62.9, ScrapingBee 60.6, Apify 60.2, Crawl4AI 58.0 / 0.45, Selenium 55.0, Scrapy 54.0, Puppeteer 53.7, Rest 50.6, Playwright 39.5 / 0.34 |
| Firecrawl, Firecrawl only (as cited in the 2026-10-30 selection report; source not re-read here) | Jan 2026 | Jan-2026 coverage | 96% / 0.638 | — |
| WebCrawlerAPI re-run, https://webcrawlerapi.com/benchmarks/scrape-quality | 2026-09-28 – 10-10 | their own; 806 URLs (404s dropped) | 89.7 | Context.dev 92.1, WebCrawlerAPI 88.0, Crawl4AI Cloud 88.0, Jina 86.8, Spider 84.0 |

These use other definitions, other dates and, for WebCrawlerAPI, a smaller denominator; none is comparable row for
row with the table above.

## Notes on the evidence

- **What the installed Chrome adds.** Row by row, A2 succeeded on 32 rows where A1 did not and failed on none where
  A1 succeeded: 17 Cloudflare challenges (`cf-mitigated`), 5 bot checks (2 of them DataDome), 7 pages A1's browser
  found no main content on, 2 refusals with 403 and 1 timeout.
- **Octocrawl's blocked status mostly held up.** Of the unflagged rows A1 reported `blocked`, Crawl4AI's full-page
  Markdown held at least half the truth words for 11. In 5 of them Octocrawl's client met a real refusal that
  Crawl4AI's client did not (a 403 with Imperva's, Cloudflare's or PerimeterX's signals, a 429); in 6 Octocrawl's
  classifier was wrong (next point). Hollow successes stay at about 1% for both Octocrawl arms, against 3.9% for
  Crawl4AI's Markdown and 4.4% for Jina.
- **Six A1 rows were blocked wrongly.** In-n-out, info.buy.nsw.gov.au, aaii.com and lizearle.com answered 200 with
  their pages; Octocrawl named them `bot_detected_generic` from Imperva's `x-iinfo` header alone, which Imperva sends on
  pages it lets through (checked with curl on 2026-10-30: aaii.com's ETF page and lizearle.com's home page came back as
  89 KB and 570 KB pages carrying Imperva's markers). Two more (social27.com, pastificioboulder.com) were named `captcha` for a reCAPTCHA in a form,
  after the extractor had found no main content on them.
- **Dead and changed pages.** 148 A1 rows ended `http_error`, 92 of them 404 (40 of those flagged by the dataset). 108
  A1 successes held fewer than half the truth words while Crawl4AI's full-page Markdown of the same URL did not hold
  them either: the page changed since October 2025, not the extraction.
- **The harness penalises HTML.** Its block-page phrases include `cloudflare`, which an HTML page matches whenever it
  names anything on a Cloudflare host (cdnjs.cloudflare.com, for one). Of Crawl4AI's 225 rows of "not a harness success",
  166 failed on that word alone and 50 had no snippet to score; of Playwright's 174, 134 and 28. Their published 58.0
  and 39.5 were scored the same way, on pages a year younger. Octocrawl's Markdown carries no scripts, so it meets the
  word only where the main content's text or links name it (4 unflagged A1 rows); this is part of why its Nov-2025
  coverage is above Crawl4AI's HTML while its Jan-2026 coverage is not.
- **Crawl4AI ignores certificate errors** by default (`BrowserConfig.ignore_https_errors = True` in 0.9.5): it read actu-transport-logistique.fr,
  where Octocrawl reported `tls_error` (`CERT_HAS_EXPIRED` in its trace).
- **Jina's SSL errors are our network path, not Jina.** All 110 came in one six-minute window (18:27–18:33Z) in which
  every call to r.jina.ai failed, while A1, running through the same proxy, kept its usual success rate. The run is
  recorded as it happened; the retry of those rows is reported apart above.
- **One API error.** Row 512 (a PDF whose server's `Content-Length` does not match its body) made the local API answer
  HTTP 500 `internal_error` instead of a failed result, in both Octocrawl arms. It is a failure in the denominator.
- Raw outputs: `.w2l/benchmarks/runs/fc-2026-10-30/` on Howard's Mac (not committed).
