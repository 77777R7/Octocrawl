# Firecrawl Scrape Content Dataset v1: why Octocrawl local failed its rows, 2026-10-30

An analysis of stored outputs, not a new run. It classifies every row that arm A1 (local default) or A2 (installed
Chrome, `access: "enhanced"`) of `research/benchmarks/2026-10-30-firecrawl-scrape-content-2aaad1f4.md` failed under
either coverage definition, and checks each against Crawl4AI and Jina from the same run. **No page was fetched again,
no Firecrawl API call was made and no paid service was used.**

## Inputs and commands

- Runs: the baseline arms of the record above (engine `2aaad1f4`, every arm through `HTTPS_PROXY=http://127.0.0.1:7890`,
  none direct). Octocrawl's full answers (`<run>/a1/raw`, `<run>/a2/raw`, one JSON per URL with status,
  `failureReason`/`blockReason`, the gate's `signals` in the trace and the Markdown it held), the harness's per-row
  `scrape_output.json`/`grader_output.json`, Crawl4AI's Markdown (`crawl4ai_proxied/raw/*.md`, through the same proxy)
  and Jina's merged answers (`jina-retry/jina_reader_quality`, the 110 retried rows included).
- Dataset `.w2l/benchmarks/data/fc/1-0-0.csv` (sha256 `47c0b99d…`), harness scrape-evals `a94764f3` and its
  `QualityAnalyzer`, as in the baseline record.
- Analysis scripts and the per-row table (822 rows: 426 for A1, 396 for A2) are in
  `.w2l/benchmarks/runs/fc-2026-10-30/failure-analysis/` on Howard's Mac (not committed): `dump.py` and `dump2.py` gather
  the rows, `sig.py` the gate signals, `grade_c4.py` grades Crawl4AI's Markdown, `classify.py` assigns causes,
  `rows.csv` is the result. Run with `python3` (stdlib) except `dump2.py` and `grade_c4.py`, which take the harness path
  and run in `.w2l/pyenv`:
  `.w2l/pyenv/bin/python grade_c4.py ~/Code/w2l/.w2l/benchmarks/src/scrape-evals c4.json`.
- Repository at `d0551289` (`origin/main`) when this record was written; no engine code was run.
- Check: the scripts reproduce the record's totals from the raw files: A1 621 Nov-2025 / 577 Jan-2026 successes, A2
  653 / 608, Crawl4AI Markdown 644 / 599 (64.4 / 59.9 in the record).

## Method

A row "fails" an arm when it misses Nov-2025 coverage (harness success) or Jan-2026 coverage (≥10% of the truth's
unique words). Each failing row gets one primary cause, decided in this order from the stored data:

1. **Dataset-flagged**: the dataset's own `error` column is set (Firecrawl's capture was an error page).
2. **No truth text**: the row's `truth_text` is empty (Jan-2026 can never count it; Nov-2025 neither when the lie text
   is empty too).
3. **Content fetched, status withheld it**: our stored Markdown holds ≥50% of the truth words, but the status was not
   `success`.
4. Status `success` but the row failed: **extraction dropped content** when Crawl4AI or Jina held ≥50% of the truth
   words and we held <10%; **anti-bot** when the gate saw Cloudflare signals on it; otherwise **scoring artefact**
   (nobody's content matches the truth, or the harness's block-phrase rule failed a page holding the truth).
5. Not `success`: HTTP 404/410, a parked domain, a DNS failure or an S3 `AccessDenied` → **dead / moved**; a country or
   region block → **geo**; a block reason or a 4xx answer → **anti-bot**, the vendor named from the gate's stored
   signals first (`header_cf_mitigated`, `cf_*`, `header_x_iinfo_imperva`, `header_x_datadome`, `px_*`,
   `header_x_vercel_mitigated`, `akamai_reference`, `header_x_kpsdk_ct`), then from the page text (CloudFront's "request
   could not be satisfied", Akamai's "You don't have permission to access" with its reference, AWS WAF's 405 captcha,
   Anubis, Fastly's cache id); otherwise `timeout`, `tls_error`, `connection_error`, 5xx, or `empty_unverified` →
   **JS / empty capture**.

"Recoverable (shown)" counts the rows of a cause that someone demonstrably got on 2026-10-29: Crawl4AI or Jina passed
that definition with ≥50% of the truth words, or (cause 3) our own Markdown would pass it. It is evidence, not a
promise: a site can answer differently on a later run (13–16 rows move between same-build runs, see the back-to-back
record).

## Causes (every failing row in the denominator)

| Cause | A1 rows | A1 Nov fails / recoverable | A1 Jan fails / recoverable | A2 rows | A2 Nov fails / recoverable | A2 Jan fails / recoverable |
|---|---:|---:|---:|---:|---:|---:|
| Dataset-flagged row | 130 | 130 / 0 | 130 / 0 | 130 | 130 / 0 | 130 / 0 |
| Anti-bot block (vendors below) | 111 | 109 / 39 | 111 / 41 | 86 | 83 / 31 | 86 / 32 |
| Dead / moved URL | 48 | 48 / 2 | 48 / 2 | 50 | 50 / 2 | 50 / 2 |
| Scoring artefact | 25 | 4 / 0 | 22 / 0 | 29 | 5 / 0 | 25 / 0 |
| JS / empty capture | 25 | 25 / 10 | 25 / 10 | 20 | 20 / 7 | 20 / 7 |
| No truth text in the dataset | 20 | 14 / 0 | 20 / 0 | 20 | 14 / 0 | 20 / 0 |
| Content fetched, status withheld it | 18 | 18 / 16 | 18 / 18 | 16 | 16 / 14 | 16 / 16 |
| Extraction dropped content | 18 | 0 / 0 | 18 / 18 | 16 | 0 / 0 | 16 / 16 |
| Timeout / slow | 11 | 11 / 3 | 11 / 3 | 10 | 10 / 3 | 10 / 3 |
| TLS error | 6 | 6 / 3 | 6 / 3 | 6 | 6 / 3 | 6 / 3 |
| Connection error | 6 | 6 / 2 | 6 / 2 | 6 | 6 / 2 | 6 / 2 |
| Site server error (5xx, maintenance) | 5 | 5 / 1 | 5 / 1 | 4 | 4 / 0 | 4 / 0 |
| Geo block | 2 | 2 / 2 | 2 / 2 | 2 | 2 / 2 | 2 / 2 |
| Other (Reuters login wall) | 1 | 1 / 0 | 1 / 0 | 1 | 1 / 0 | 1 / 0 |
| **Total failing rows** | **426** | **379 / 78** | **423 / 100** | **396** | **347 / 64** | **392 / 81** |

Per definition: A1 379 Nov failures (62.1%) and 423 Jan failures (57.7%); A2 347 (65.3%) and 392 (60.8%).

### Anti-bot rows by vendor

| Vendor (how named) | A1 | A1 recoverable (Nov) | A2 | A2 recoverable (Nov) |
|---|---:|---:|---:|---:|
| Cloudflare (`cf-mitigated` header or challenge page) | 45 | 14 | 28 | 9 |
| Unnamed: a 403/400/406/468/500 or an empty block with no vendor signal stored | 20 | 6 | 20 | 6 |
| Imperva (`x-iinfo`) | 9 | 6 | 9 | 6 |
| Akamai | 7 | 1 | 3 | 1 |
| DataDome | 5 | 1 | 3 | 0 |
| 202 with an empty body (vendor header not stored; AWS WAF suspected, unconfirmed) | 4 | 2 | 5 | 2 |
| AWS WAF (405 captcha page) | 4 | 1 | 2 | 0 |
| Rate limit / IP reputation (429, 419; one Anubis) | 4 | 2 | 4 | 2 |
| CloudFront | 3 | 2 | 3 | 2 |
| HUMAN (PerimeterX) | 3 | 1 | 3 | 1 |
| Captcha widget on the page, no vendor header | 3 | 2 | 3 | 2 |
| Kasada, Vercel, Fastly, 412 challenge | 4 | 1 | 3 | 0 |

A2 recovers 17 Cloudflare rows A1 lost; A2 failed only 2 rows A1 passed (both definitions). The unnamed vendor stays
unnamed: the Evidence Record keeps no response headers, and no row was fetched again.

### Who recovered them

Crawl4AI ran through the same proxy as Octocrawl, so a row it got and we missed points at our engine; Jina fetched
from its own servers, so a row only Jina got points at egress (IP reputation, location). For A2 under Nov-2025:

- Crawl4AI (same proxy): 11 anti-bot rows (7, 350, 385, 394, 511, 566, 633, 666, 763, 778, 907), 1 JS row (452), 2 TLS
  rows (843, 862).
- Jina only: 20 anti-bot rows, 6 JS rows, 3 timeouts, 1 TLS, 2 connection errors, 2 geo blocks.

## What the gap is made of (A2, the better arm)

| Bucket | Nov-2025 points | Jan-2026 points | Evidence |
|---|---:|---:|---|
| A2 as measured | 65.3 | 60.8 | baseline record |
| Engine fixes, shown with our own egress | +2.8 | +4.7 | withheld 14/16, extraction 0/16, gate false positives and Imperva 11/12 (4 Imperva rows already fixed by PR #778), TLS 2/2, JS 1/1 |
| Different egress (rows only Jina got) | +3.4 | +3.4 | 34 rows; Jina's servers, not ours |
| **Shown ceiling on 2026-10-29** | **71.5** | **68.9** | |
| Not shown recoverable by anyone | 28.5 | 31.1 | 130 flagged, 50 dead, 20 no truth (Jan), 29 artefacts, and blocked/empty rows nobody got |

The remaining ~9.4 Nov-2025 points to Firecrawl's published 80.9 are **not explained by anything observed here**.
Candidates, none verified: the dataset was captured around 2025-11 and 50 of its URLs now answer 404/410 or are gone
(anyone running the set today loses them, so Firecrawl's 2025 figure did not); Firecrawl's own egress and anti-bot
stack, which only Firecrawl could run; and how Firecrawl's engine maps a 404 or a block page to the harness's status
code (not in our copy of the harness; unknown). The 130 dataset-flagged rows score about 2% for every engine we ran;
whether Firecrawl's 80.9 counted them is unknown.

Two scoring facts that change how the comparators read:

- **Jina is credited on dead pages.** It answers HTTP 200 for every URL it wraps, so the harness's 2xx rule passes its
  404 pages: it passes both definitions on 21–22 rows that answer us 404/410 (Crawl4AI on 8, via Jan-2026 only). Its
  66.8 includes those.
- **The harness's block-phrase rule fails real pages.** Rows 246 (coindesk.com), 249 (braintrust.dev) and 327
  (producthunt.com) held 42–92% of the truth words and failed Nov-2025 because the delivered text contains the word
  "cloudflare" (checked on the stored content).

## Engine fixes, ranked (follow-ups; no engine code changed in this session)

1. **`empty_unverified` withholds pages we read in full** (A2 16 rows, A1 18): Google Sites (6, 904), a Read the Docs
   page (140), Intercom help (399), Linktree-style and Squarespace pages (517, 482), and others held 57–100% of the
   truth words in the stored Markdown yet were reported as failed. +1.4 Nov / +1.6 Jan. Rows 311 and 799 hold the page
   behind a 404/410 and count only for Jan.
2. **Thin Markdown accepted as success** (A2 16, A1 18): status `success` with 17–600 characters where Crawl4AI and Jina
   held the page (for example 165 digikey.com, 17 characters; 636 pcgamer.com review, 296; 214 a book page; 21 okx.com,
   83). Main-content selection kept a fragment, or an HTTP shell was not escalated. +1.6 Jan (these already pass
   Nov-2025, the hollow successes).
3. **Gate false positives where Crawl4AI got the page through the same proxy** (rows 7, 385, 394, 511, 566, 666, 763):
   two captcha widgets taken for a wall (511, 666; the known reCAPTCHA-in-a-form follow-up), a 429, a 402, a 403 and
   HUMAN's press-and-hold on a page Crawl4AI read. Each needs a reproduction first. Up to +0.7.
4. **TLS with an incomplete certificate chain** never tries the browser (843, 862; known follow-up). +0.2.
5. **Akamai's 200 interstitial reported as `empty_unverified`** (known): changes the reason, not coverage.

Imperva on a 200 (350, 633, 778, 907) was fixed by PR #778, +0.4 (the post-fix record).

## Needs a different egress or a paid vendor

The 34 rows only Jina got (+3.4): Cloudflare 9 of 28, the 202 empty challenges, CloudFront, a DataDome row, the geo
blocks (67 herserenity.com "not available in your region", 159 orthazone.com WAF `country_block`), timeouts and
connection errors that look like routing (162, 586, 918, 268, 637). Our runs all left through one proxy; a residential
or differently located exit is the test. Not tested here.

## Not recoverable, or unknown

- 130 dataset-flagged rows, 20 rows with no truth text, 50 dead URLs (46–48 HTTP 404, parked domains, an S3
  `AccessDenied`).
- 29 scoring artefacts: pages that load but whose text no engine matches (truth stale or from another part of the site,
  for example 830 a domain now for sale, 357 an app-install page).
- Blocked or empty rows nobody got: 52 anti-bot rows in A2 (Cloudflare 19, Akamai, DataDome, Kasada, unnamed), 13 JS /
  empty, 7 timeouts. Whether a paid unblocker would get them is unknown.

## Limits

- The vendor of 20 anti-bot rows is unknown: neither the trace nor the page names it, and no row was fetched again.
- "Recoverable" relies on one run of each comparator; pages change between runs.
- Causes are assigned by rule; edge rows (for example a Cloudflare challenge served with HTTP 200 and status `success`)
  were checked by reading the stored Markdown, not every row was read by hand.
