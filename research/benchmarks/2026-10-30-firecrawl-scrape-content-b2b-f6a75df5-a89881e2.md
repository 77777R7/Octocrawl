# Firecrawl Scrape Content Dataset v1: main and PR #778 back to back, 2026-10-30

A record of one run: arms A1 and A2 of `research/benchmarks/2026-10-30-firecrawl-scrape-content-2aaad1f4.md` run
again on the same 1,000 URLs with two builds in immediate succession, so that the comparison between the builds is
not also a comparison between times of day (`research/benchmarks/2026-10-30-firecrawl-scrape-content-a89881e2.md` ran
them one to two hours apart). The arms ran in the order A1 main, A1 #778, A2 #778, A2 main, so each build ran first in
one pair and second in the other. The comparators were not run again. **Firecrawl was not run and no Firecrawl
credits were spent.**

## What ran

- Builds:
  - main: `f6a75df5`, the base of PR #778 and `origin/main` when the run was set up (03:01Z). PR #777 (`637af767`,
    33 files under `packages/`) was merged into main at 03:02:58Z, two minutes before the first arm, and is in
    neither build.
  - PR #778: `a89881e2` (https://github.com/77777R7/Octocrawl/pull/778, not merged), `f6a75df5` plus its three
    changes, in `packages/http-core/src/gate.ts`, `packages/extract-tf/src/product.ts` (the extractor version moves
    from `extract-tf/46` to `extract-tf/47`) and `packages/bench/src/subjects/resilientHttp.ts`.
- One checkout, switched with `git checkout --detach <commit> && npx tsc --build` before A1 main, A1 #778 and A2 main.
  A2 #778 ran on A1 #778's build. `tsc --build --dry` found the build up to date, with the tree clean, after each
  build and after each arm.
- The compiled files were also read in the session when A1 main and A1 #778 started. The run's script did not log
  this check. What it found:
  - `packages/extract-tf/dist/version.js` named `extract-tf/46` for A1 main and `extract-tf/47` for A1 #778;
  - the Imperva check in `packages/http-core/dist/gate.js` was absent for A1 main and present for A1 #778;
  - the length-mismatch case in `packages/bench/dist/subjects/resilientHttp.js` was absent for A1 main and present
    for A1 #778.

  The second build of `f6a75df5`, before A2 main, was checked only by `tsc --build --dry` and by its answers.
- Every answer names its build:
  - The API ran with `W2L_SOURCE_COMMIT=<commit>`, which the earlier runs did not set. It adds the commit to the
    Evidence Record and to the page cache's key; no request here read the cache.
  - All 4,000 answers carry their arm's commit in `evidenceRecord.extractor.commit`.
  - The HTML extractor read 982–984 answers in each arm, and those answers name its version (`extract-tf/46` or
    `/47`). They are 925–926 HTML pages, 10–11 text, JSON, XML or RSS files, and 47 attempts that got no body.
  - The PDFs and the other files name `pdf-text/1` or `file-text/1`.
- As in the earlier records: the dataset (HF revision `aad2b002…`, `1-0-0.csv` sha256 `47c0b99d…`), the harness
  (scrape-evals `a94764f3`, unmodified), the Python environment, `formats: ["markdown"]` and concurrency 8. The glue
  ran from a copy of `research/benchmarks/scrape_evals/` taken at `d3b9fa0a`, outside the checkout; its files are
  those of `9c7ad5a9`, which the earlier runs used.
- Network: every arm went through the local proxy (`HTTPS_PROXY` and `HTTP_PROXY` set to `http://127.0.0.1:7890`,
  `NO_PROXY=localhost,127.0.0.1,::1,.local`). **No arm ran direct.**
- API: `node --import tsx packages/api/src/cli.ts` on port 8784, a new process for each arm. A2 used the same
  installed_chrome grant (`.w2l/access/installed-chrome-grant-bench-2026-10-30.json`, sha256 `6dfd25dc…`) with
  `access: "enhanced"`. The Mac was on AC power with the lid open throughout both A2 arms (15 checks each, once a
  minute, `pmset`/`ioreg`).
- Nothing in the engine carries from one arm to the next:
  - The page cache is written, but it is read only by requests that set `maxAge`, `minAge` or `lockdown`. None did,
    and no answer from the day's eight runs has a `cache_hit`.
  - The routing history is used only with provider rungs, and it has no rows.
  - Each launch of the installed Chrome gets a new temporary profile (`packages/bench/src/subjects/installedChrome.ts`).

  What can carry over is the sites' own memory of the proxy's exit address.
- Other work ran on the Mac at the same time: agent sessions in their own checkouts, which by their own reports were
  running test suites. The load averages are in the table.

| Arm | Build | Window (UTC, 2026-10-30) | 1-minute load at start / end |
|---|---|---|---|
| A1 main | `f6a75df5` | 03:05:05–03:16:26 | 2.07 / 6.29 |
| A1 #778 | `a89881e2` | 03:16:30–03:26:21 | 6.02 / 5.06 |
| A2 #778 | `a89881e2` | 03:26:22–03:40:39 | 5.06 / 9.54 |
| A2 main | `f6a75df5` | 03:40:44–03:55:01 | 9.18 / 5.76 |

The commands below run from the repository root. `H` and `D` are as in the baseline record,
`R=.w2l/benchmarks/runs/fc-2026-10-30-b2b`, and `G` is the copy of the glue. The checkout and build ran before A1
main, A1 #778 and A2 main, and the API was started anew before every arm.

```bash
git checkout --detach <commit> && npx tsc --build && npx tsc --build --dry
W2L_API_PORT=8784 W2L_SOURCE_COMMIT=<commit> node --import tsx packages/api/src/cli.ts
OCTO_API=http://127.0.0.1:8784 OCTO_RAW_DIR=$R/a1-<commit>/raw .w2l/pyenv/bin/python $G/run.py $H -- --scrape_engine octocrawl_local --output-dir $R/a1-<commit> --dataset $D --max-workers 8
W2L_API_PORT=8784 W2L_SOURCE_COMMIT=<commit> W2L_ACCESS_GRANT=~/Code/w2l/.w2l/access/installed-chrome-grant-bench-2026-10-30.json node --import tsx packages/api/src/cli.ts
OCTO_API=http://127.0.0.1:8784 OCTO_ACCESS=enhanced OCTO_RAW_DIR=$R/a2-<commit>/raw .w2l/pyenv/bin/python $G/run.py $H -- --scrape_engine octocrawl_local --output-dir $R/a2-<commit> --dataset $D --max-workers 8
.w2l/pyenv/bin/python research/benchmarks/scrape_evals/report.py --harness $H --dataset $D --arm "A1 main f6a75df5=$R/a1-f6a75df5/octocrawl_local_quality" …
```

The definitions are those of the baseline record: Coverage Nov-2025, Coverage Jan-2026, F1 and hollow successes.
Every view keeps all its rows.

## Results

| Arm | View | n | Coverage Nov-2025 % | Coverage Jan-2026 % | F1 | Hollow successes % |
|---|---|---:|---:|---:|---:|---:|
| A1 main `f6a75df5` | all 1,000 | 1000 | 61.5 | 57.3 | 0.440 | 1.0 |
| A1 main `f6a75df5` | excl. 133 dataset-flagged | 867 | 70.6 | 65.7 | 0.505 | 1.0 |
| A1 main `f6a75df5` | only the 133 flagged | 133 | 2.3 | 2.3 | 0.020 | 0.0 |
| A1 #778 `a89881e2` | all 1,000 | 1000 | 62.4 | 58.3 | 0.447 | 1.0 |
| A1 #778 `a89881e2` | excl. 133 dataset-flagged | 867 | 71.6 | 66.9 | 0.513 | 1.0 |
| A1 #778 `a89881e2` | only the 133 flagged | 133 | 2.3 | 2.3 | 0.020 | 0.0 |
| A2 #778 `a89881e2` | all 1,000 | 1000 | 64.7 | 60.5 | 0.462 | 0.9 |
| A2 #778 `a89881e2` | excl. 133 dataset-flagged | 867 | 74.3 | 69.4 | 0.530 | 0.9 |
| A2 #778 `a89881e2` | only the 133 flagged | 133 | 2.3 | 2.3 | 0.020 | 0.0 |
| A2 main `f6a75df5` | all 1,000 | 1000 | 64.5 | 59.9 | 0.456 | 1.3 |
| A2 main `f6a75df5` | excl. 133 dataset-flagged | 867 | 74.0 | 68.7 | 0.523 | 1.3 |
| A2 main `f6a75df5` | only the 133 flagged | 133 | 2.3 | 2.3 | 0.020 | 0.0 |

### Per status (all 1,000 rows)

| Outcome | A1 main | A1 #778 | A2 #778 | A2 main |
|---|---:|---:|---:|---:|
| success | 615 | 624 | 647 | 645 |
| failed: http_error | 145 | 147 | 147 | 146 |
| failed: empty_unverified | 62 | 57 | 66 | 63 |
| blocked: cloudflare_challenge | 53 | 52 | 24 | 23 |
| blocked: bot_detected_generic | 33 | 26 | 19 | 24 |
| not a harness success (block-page phrase, or no truth/lie snippet) | 32 | 34 | 36 | 36 |
| failed: timeout | 16 | 16 | 16 | 16 |
| failed: connection_error | 13 | 14 | 13 | 14 |
| blocked: captcha | 13 | 13 | 15 | 16 |
| failed: tls_error | 7 | 7 | 7 | 7 |
| blocked: rate_limit | 6 | 5 | 3 | 3 |
| empty content | 2 | 2 | 3 | 3 |
| blocked: login_wall | 2 | 2 | 2 | 2 |
| blocked: geo_restricted | 1 | 1 | 1 | 1 |
| failed: parse_error | 0 | 0 | 1 | 1 |
| API error (the call, not the page) | 0 | 0 | 0 | 0 |

## The two builds, row by row

### Back to back

Rows whose harness success differs between the two arms of a pair. In A1 the two arms ran about 11 minutes apart;
in A2, about 14 minutes apart.

| | A1: main, then #778 | A2: #778, then main |
|---|---|---|
| Rows a success with #778 only | 10 | 11 |
| … by PR #778's Imperva change (blocked under main by `header_x_iinfo_imperva` on a 200) | 4: rows 350, 633, 778, 907 | the same 4 |
| … otherwise | 6 | 7 |
| Rows a success with main only | 1 | 9 |
| … through a path PR #778 changed | 0 | 0 |
| Net rows for #778 | +9 | +2 |

The rows in the "otherwise" and "main only" lines read a different page in the two arms:

- a Cloudflare challenge;
- a 202 bot check, with or without a body;
- a 429;
- the site's own server error (a WordPress database error, HTTP 500);
- a timeout or a connection reset;
- a browser capture with little or no text.

Each of these turned up in one arm and not in the other. Most of the rows differed only in the browser; some
differed already at the HTTP attempt:

| Pair | Rows | Differing at the HTTP attempt | Differing only in the browser |
|---|---:|---:|---:|
| A1 | 7 | 1 (row 227, a 429) | 6 |
| A2 | 16 | 5 (rows 20, 162, 572, 749, 998) | 11 |

For each of the 10 rows that were a success with main only, the #778 answer was checked. None has Imperva's header,
a short body, or a page read as a product.

### What splits by build in every run of the day

Eight runs of the set are on record:

- **Four of the main engine.** The baseline's A1 and A2 ran on `2aaad1f4`. Between `2aaad1f4` and `f6a75df5`, under
  `packages/`, only `packages/public-preview` changed. This run's A1 main and A2 main ran on `f6a75df5`.
- **Four of PR #778.** The earlier rerun's A1-post and A2-post, and this run's A1 #778 and A2 #778.

A row splits by build when either of these holds:

- its Octocrawl status is the same in all four runs of each build and differs between the builds;
- its F1 in every run of one build is higher than in every run of the other.

Ten rows split by build, and none of them is worse under #778:

| Row | Page | Under main (4 runs) | Under #778 (4 runs) | Change |
|---|---|---|---|---|
| 350 | in-n-out.com, an FAQ | blocked: `header_x_iinfo_imperva` on a 200 | success, F1 0.494 | gate |
| 633 | info.buy.nsw.gov.au, a scheme page | blocked, as above | success, F1 0.603 | gate |
| 778 | aaii.com, an ETF page | blocked, as above | success, F1 0.770 | gate |
| 907 | lizearle.com, a product page | blocked, as above | success, F1 0.395 | gate |
| 535 | geico.com, a press release; the dataset flags it ("Error 403") and gives no snippet, so it is not scored | blocked, as above, in every lane | success, 7,152 characters | gate |
| 917 | pentalog.com, a home page | blocked, as above, in every lane | see below the table: `failed: empty_unverified`, F1 0.194–0.195 | gate |
| 214 | nappaawards.com, a book's product page | 95 characters (the title), F1 0.143 | 4,548 characters, F1 1.000 | extraction |
| 354 | wsj.com, an article read as a product | 41 characters, F1 0.094 | 4,305–8,476 characters, F1 0.960 | extraction |
| 979 | sunherald.com, an article read as a product | 192 characters, F1 0.274 | 3,234 characters, F1 0.831 | extraction |
| 21 | okx.com, a currency converter read as a product | 83 characters, F1 0.114 | 214 characters, F1 0.293 | extraction |

Row 917 under #778, in order:

1. The HTTP answer is read as Imperva's interstitial: the header, its `_Incapsula_Resource` script and a short page.
2. The browser's page passes the gate.
3. The browser's page holds no main text the extractor finds, so the row ends `failed: empty_unverified`.

Together these rows move the scores as follows:

- Coverage Nov-2025: +4 rows, +0.4 points (rows 350, 633, 778 and 907).
- Coverage Jan-2026: +7 rows, +0.7 points (those four, and rows 214, 354 and 21; row 979 passes under both).
- F1 over all 1,000 rows: +0.0049.

That is PR #778's own effect on this set.

Row 430 (nike.com, a listing) also split by build in the eight runs, though not in its score. It was a success
under both builds, with F1 0.783:

- Under main, the browser's page was read as a listing and delivered: 6,532 characters.
- Under #778, the browser's page was read as a collection and judged empty, so the HTTP answer was delivered: 3,244
  characters.

Nothing in #778's diff reaches the page router. To check, the page was probed afterwards, at 04:29–04:30Z: main and
#778 alternated three times each, with A1's settings and through the proxy. Both builds gave #778's result every
time. The split came from the page, not from the build. The probe's answers are under
`.w2l/benchmarks/runs/nike-probe-2026-10-30/`.

The third change, a body shorter than its declared length, is not a success in either build:

- **Both #778 arms**: on row 512, the HTTP attempt got the short body (`body_read_failed`,
  `ResponseContentLengthMismatchError`). It failed as `connection_error` and went on to the browser, which got a 502.
- **Both main arms**: the server answered the HTTP request with a 502, so they did not meet the short body this time.

All four end as `failed: http_error`, and no arm had an API error.

### The same build at different times

| Build, arm | Earlier run (UTC) | This run (UTC, 2026-10-30) | Rows that changed | Coverage Nov-2025 % |
|---|---|---|---|---|
| main engine, A1 | 2026-10-29 18:18, `2aaad1f4` | 03:05 | 14 (4 gained, 10 lost) | 62.1 → 61.5 |
| #778, A1 | 2026-10-29 20:23 | 03:16 | 13 (11 gained, 2 lost) | 61.5 → 62.4 |
| main engine, A2 | 2026-10-29 19:13, `2aaad1f4` | 03:40 | 16 (4 gained, 12 lost) | 65.3 → 64.5 |
| #778, A2 | 2026-10-29 20:33 | 03:26 | 14 (6 gained, 8 lost) | 64.9 → 64.7 |

Back to back, outside the change, 7 rows changed in A1 (6 toward #778) and 16 in A2 (7 toward #778, 9 toward main).
Running the pair within minutes narrowed the variation in A1 but not in A2.

## Notes

- **PR #778's effect on this set is the ten rows above, and none of them is worse under it.**
  - Back to back, #778 led main in both pairs:

    | Pair | Coverage Nov-2025 | Coverage Jan-2026 | F1 |
    |---|---:|---:|---:|
    | A1 | +0.9 points | +1.0 points | +0.007 |
    | A2 | +0.2 points | +0.6 points | +0.006 |

  - What both pairs share, and every run of the day repeats, is the ten rows: +0.4 points of Coverage Nov-2025,
    +0.7 points of Coverage Jan-2026 and +0.0049 F1.
  - The rest is run-to-run variation: +5 rows in A1 and −2 in A2.
- **The fall in the earlier record is within run-to-run variation.**
  - The `a89881e2` record had A1 and A2 lower with #778, by 0.6 and 0.4 points. Those runs came one to two hours
    after the baseline's.
  - Leaving out the four Imperva rows, those comparisons moved −10 and −8 rows. Runs of one build hours apart moved
    −6, +9, −8 and −2 rows here.
  - These runs do not show whether the time of day or chance moved those rows.
- **Differences of about a point are within the variation of a single arm.**
  - Between runs of the same build on this day, 13 to 16 rows changed, and coverage moved by up to 0.9 points.
  - Differences between arms of that size are within this variation. One example is the baseline record's A2 (65.3)
    against Crawl4AI's Markdown (64.4).
  - The comparators were run once, so their own variation is not known.
- Raw outputs: `.w2l/benchmarks/runs/fc-2026-10-30-b2b/` and `.w2l/benchmarks/runs/nike-probe-2026-10-30/` on Howard's
  Mac (not committed).
