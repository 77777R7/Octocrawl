# Firecrawl Scrape Content Dataset v1: Octocrawl local after PR #778, 2026-10-30

A record of one run: arms A1 and A2 of the morning's run
(`research/benchmarks/2026-10-30-firecrawl-scrape-content-2aaad1f4.md`) run again on the same 1,000 URLs with the
engine of PR #778. The comparators were not run again: none of their code changed. **Firecrawl was not run and no
Firecrawl credits were spent.**

## What ran

- Octocrawl source commit: `a89881e2` (branch `claude/extractor-benchmark-fixes`, PR
  https://github.com/77777R7/Octocrawl/pull/778, not merged): `origin/main` at `f6a75df5` plus the three fixes of that
  PR. `f6a75df5` differs from the baseline's `2aaad1f4` only in the public preview, `apps/public-web`, its docs and
  `vitest.config.ts`; no engine package changed between them. Engine build: up to date (`tsc --build --dry`,
  20:23:43Z before A1-post and 20:46:45Z after A2-post), the tree clean.
- Dataset, harness, glue, Python environment, concurrency and network: as in the baseline record (HF revision
  `aad2b002…`, `1-0-0.csv` sha256 `47c0b99d…`; scrape-evals `a94764f3`; every arm through `HTTPS_PROXY=http://127.0.0.1:7890`,
  none direct).
- A2: the same installed_chrome grant (sha256 `6dfd25dc…`) and `access: "enhanced"`; on AC power with the lid open
  for the whole of A2-post (15 checks, 20:33:43Z–20:46:43Z).

| Arm | Window (UTC, 2026-10-29) |
|---|---|
| A1-post | 20:23:44–20:33:42 |
| A2-post | 20:33:43–20:46:45 |

Commands: those of the baseline record for A1 and A2, with `R=.w2l/benchmarks/runs/fc-2026-10-30-post`, after
`git checkout a89881e2 && npx tsc --build`. The checkout was on the engine branch, so the scrape-evals glue ran from a
copy of `research/benchmarks/scrape_evals/` as of `9c7ad5a9`, outside the checkout.

## Results

| Arm | View | n | Coverage Nov-2025 % | Coverage Jan-2026 % | F1 | Hollow successes % |
|---|---|---:|---:|---:|---:|---:|
| A1-post Octocrawl local default | all 1,000 | 1000 | 61.5 | 57.9 | 0.444 | 0.8 |
| A1-post Octocrawl local default | excl. 133 dataset-flagged | 867 | 70.6 | 66.4 | 0.509 | 0.8 |
| A1-post Octocrawl local default | only the 133 flagged | 133 | 2.3 | 2.3 | 0.020 | 0.0 |
| A2-post Octocrawl local, installed Chrome | all 1,000 | 1000 | 64.9 | 60.6 | 0.463 | 1.1 |
| A2-post Octocrawl local, installed Chrome | excl. 133 dataset-flagged | 867 | 74.5 | 69.6 | 0.531 | 1.1 |
| A2-post Octocrawl local, installed Chrome | only the 133 flagged | 133 | 2.3 | 2.3 | 0.020 | 0.0 |

The baseline's arms on all 1,000 rows, for reference: A1 62.1 / 57.7 / 0.442 / 1.0; A2 65.3 / 60.8 / 0.461 / 0.9.

### Per status (unflagged / flagged / all rows)

| Outcome | A1-post | | | A2-post | | |
|---|---:|---:|---:|---:|---:|---:|
| | Unflagged | Flagged | All | Unflagged | Flagged | All |
| success | 612 | 3 | 615 | 646 | 3 | 649 |
| failed: http_error | 89 | 59 | 148 | 86 | 61 | 147 |
| failed: empty_unverified | 51 | 11 | 62 | 52 | 9 | 61 |
| blocked: cloudflare_challenge | 49 | 12 | 61 | 16 | 6 | 22 |
| not a harness success (block-page phrase, or no truth/lie snippet) | 6 | 27 | 33 | 7 | 31 | 38 |
| blocked: bot_detected_generic | 22 | 3 | 25 | 16 | 3 | 19 |
| failed: connection_error | 6 | 8 | 14 | 7 | 8 | 15 |
| failed: timeout | 9 | 4 | 13 | 10 | 4 | 14 |
| blocked: captcha | 9 | 3 | 12 | 11 | 5 | 16 |
| failed: tls_error | 6 | 2 | 8 | 6 | 2 | 8 |
| blocked: rate_limit | 4 | 0 | 4 | 4 | 0 | 4 |
| empty content | 1 | 1 | 2 | 2 | 1 | 3 |
| blocked: login_wall | 2 | 0 | 2 | 2 | 0 | 2 |
| blocked: geo_restricted | 1 | 0 | 1 | 1 | 0 | 1 |
| failed: parse_error | 0 | 0 | 0 | 1 | 0 | 1 |
| API error 500 (the call, not the page) | 0 | 0 | 0 | 0 | 0 | 0 |

## Row by row against the baseline

The two runs are about two hours apart, so a row can move because the page or the network did, not only because the
engine did. Each row that changed between a baseline arm and its rerun:

| | A1 → A1-post | A2 → A2-post |
|---|---|---|
| Rows that became a success | 7 | 7 |
| … by PR #778's Imperva change (blocked by `header_x_iinfo_imperva` on a 200 before) | 4: rows 350, 633, 778, 907 | the same 4 |
| … otherwise (the site's defence or the page answered differently) | 3: a 202 bot check absent (156), a Cloudflare challenge absent (289), a timeout not repeated (586) | 3: an empty capture now full (452, 909), a Cloudflare challenge absent (655) |
| Rows that stopped being a success | 13 | 11 |
| … a Cloudflare challenge (`cf-mitigated`) served this time | 7 | 1 |
| … an Akamai Bot Manager page ("Powered and protected by Akamai", HTTP 200) served this time | 0 | 3 (87, 250, 972) |
| … a page routed as an article (none as a product) that the browser captured with less or no text (for example 6,591 visible characters before, 253 after) | 5 | 5 |
| … a 202 bot check, a 429 | 1 (429) | 2 |

No row that stopped being a success went through a path PR #778 changed: its extraction change acts on product pages
only, and none of these pages was routed as one; its gate change reads only Imperva's header; its HTTP change only a
body shorter than its declared length.

Two rows the change aimed at directly:

- Row 214 (nappaawards.com, a book's product page): F1 0.143 → 1.000 in both arms; the Markdown went from the
  97-character title to 4,592 characters holding every truth word.
- Row 512 (a PDF on library.qiangtu.com): no API 500 in either arm. In A2-post the HTTP attempt failed as
  `connection_error` at status 200 (the short body, now read as a transport failure) and the ladder went on to the
  browser, which got a 502; in A1-post the server answered 502 to the first request.

## Notes

- **The totals moved less than the run-to-run variation.** Leaving out the 4 Imperva rows, 16 rows changed between A1
  and A1-post and 14 between A2 and A2-post, most of them toward failure: more challenges from Cloudflare and Akamai
  than in the morning, and more browser captures with little text, whose cause was not established. PR #778's own
  effect on this set is +4 rows in each arm (+0.4 points of coverage) and row 214's F1; the coverage totals fell 0.6
  and 0.4 points for the other reasons above.
- **Akamai's 200 interstitial is reported as `failed: empty_unverified`, not `blocked`.** It is not passed off as
  content, but its reason is wrong; found in this rerun, not changed here.

- Raw outputs: `.w2l/benchmarks/runs/fc-2026-10-30-post/` on Howard's Mac (not committed).
