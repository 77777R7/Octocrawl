# Seed-user manifest: third run, from the local machine, with the five recorded robots overrides (2026-09-30)

Third run of the frozen 72-URL manifest ([coos-manifest.v1.json](coos-manifest.v1.json), [urls.txt](urls.txt) SHA-256 `0939b858…f265c6`, unchanged), the first from the local machine and the first with recorded robots overrides. Same denominators as the [baseline](baseline-2026-09-30.md) and the [second run](rerun-2026-09-30.md); nothing replaced or dropped.

## What changed since the second run

- Product decision of 2026-09-30: a researcher may record a robots override for one URL, with a reason. `34f30ad` adds `robotsOverride` on a scrape and `robotsOverrides` on a batch: both lanes still read robots.txt and record its verdict; when it disallows the URL, the trace carries `robots_disallowed` then `robots_overridden` with the rule, the reason and who recorded it, the result carries a `robots_overridden` warning, and the browser lane's compliance record shows the disallow with `skippedFetch: false` and the override. A blanket `ignoreRobotsTxt` stays a 400.
- Five overrides recorded in [robots-overrides.json](robots-overrides.json) (`57232f6`): the three Equinix files on `delivery-p112322-e1154416.adobeaemcloud.com` (`Disallow: /`), the Microsoft factsheet short link on `aka.ms` (`Disallow: /`) and the canonical Google 2025 report on `www.gstatic.com`. [run-baseline.mjs](run-baseline.mjs) sends the entries whose URL is in the manifest and keeps them in the run record.
- `9d68407`: the table strategy keeps the document around a table that is a fraction of the page ([applied-digital-check-2026-09-30.md](applied-digital-check-2026-09-30.md)).
- Network: this machine, with the shell's `HTTPS_PROXY=http://127.0.0.1:7890` honoured by the local API as its operator proxy: `proxy_used` on 71 of the 72 items (the 72nd was refused by robots.txt before any page request). Not a direct run; the two cloud runs went through the session's proxy.

## How it was run

- REST API from a build of the `34f30ad` source: `W2L_TASK_ROOT=.w2l/api node packages/api/dist/cli.js` (127.0.0.1:8787).
- `node research/coos-pilot/run-baseline.mjs research/coos-pilot/urls.txt .w2l/coos-pilot/run-2026-09-30-local`: task `93264df3-6e68-40ba-bf13-1b214cd5b7e8`, `operatorCheckoutCommit` `57232f6`, 72 URLs submitted, 72 completed, `budgetExceeded: null`, 5 overrides sent, batch wall 64.2 s (per-item median 2.6 s, p90 6.1 s, max 9.2 s), 05:51:31–05:52:36 UTC.
- `.w2l/pyenv/bin/python research/coos-pilot/check-observations.py --workbook .w2l/coos-pilot/dataset.xlsx --batch .w2l/coos-pilot/run-2026-09-30-local/batch-items.json` (`matcherVersion: 2`; workbook SHA-256 `18378cd0…cbf9`, the copy the two cloud runs used). Outputs stay under `.w2l/`.

## Capture outcomes (72 URLs)

| Outcome | URLs | Second run | Note |
| --- | ---: | ---: | --- |
| `success` | 67 | 62 | the five overridden files are each `success` with a `robots_overridden` warning; their traces read `robots_checked {decision: disallowed}` → `robots_disallowed` → `robots_overridden {reason, recordedBy}` |
| `failed` / `policy_denied` | 1 | 5 | `go2.digitalrealty.com` (DLR-2025): its robots.txt answered again with `Disallow: /rs/` (404 in the second run). No override is recorded for it |
| `failed` / `http_error` | 1 | 2 | `www.sec.gov` IREN 10-Q, 403 as before |
| `blocked` / `rate_limit` | 1 | 1 | Iron Mountain 429 (`status_429`, host cooldown set) |
| `blocked` / `cloudflare_challenge` | 2 | 2 | the two Google-report mirrors: fliphtml5 HTTP 200 with the challenge platform script after the browser render, studylib 403 with `cf-mitigated` |

Lanes: 60 http only, 12 escalated to `browser_local`. Robots decisions: 60 allowed, 6 no robots.txt, 6 disallowed (5 overridden, 1 refused). 74 page requests in the batch (the short link's redirect counts one), 12 browser renders.

## Files (11 of the 14 file sources)

| Source | Pages / with text | Bytes | SHA-256 | Note |
| --- | --- | ---: | --- | --- |
| OVH-FY25-KPI | 3 / 3 | 267,398 | `facf8c66…` | byte-identical to both cloud runs |
| AIR-GFF | 12 / 12 | 342,998 | `dfa24a3f…` | identical |
| NEB-2025-FULL | 72 / 72 | 4,878,004 | `38a7d175…` | identical |
| STT-SLFF24 | 26 / 26 | 6,313,505 | `c5608d0b…` | identical |
| META-2025 | 19 / 19 | 2,266,742 | `d7527cd2…` | identical |
| META-EY2025 | 17 / 17 | 407,496 | `0bdd1518…` | identical |
| EQ-2025 | 20 / 20 | 1,928,530 | `671918e3…` | recorded override |
| EQ-GFF | 11 / 11 | 1,014,218 | `5cb585bf…` | recorded override; the URL the manifest flagged as possibly truncated serves a PDF |
| EQ-ALLOC25 | 12 / 12 | 3,103,799 | `84433fcf…` | recorded override |
| MS-2025 | 25 / 25 | 1,235,797 | `9283b1e8…` | recorded override on the `aka.ms` link; the redirect to `cdn-dynmedia-1.microsoft.com` was followed and the target host's robots.txt was not consulted (the http lane reads robots.txt for the requested URL only, on every redirect, override or not) |
| GOOG-2025-CANONICAL | 120 / 120 | 19,452,765 | `00bf26d9…` | recorded override |

Not captured: DLR-2025 (robots, above) and the two mirrors, which are bot-gated pages rather than files. No `ocr_required`, `parse_error` or `pdf_pages_without_text`. The 14 file sources are the manifest's 8 `pdf`, 2 `report_asset_page`, 1 `shortlink` and 2 `third_party_mirror` rows plus EQ-GFF, listed as `html` and served as a PDF.

## Value check (1,502 observations, 53 sources, 51 captured)

| | Observations | Found | Not found | Source not captured | Recall of captured | Recall of all |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| All | 1,502 | 1,447 (1,006 strong, 441 weak) | 5 | 50 | 0.997 | 0.963 |
| html | 626 | 624 | 2 | 0 | 0.997 | 0.997 |
| pdf | 206 | 171 | 3 | 32 | 0.983 | 0.830 |
| report_asset_page (PDF?) | 396 | 396 | 0 | 0 | 1.000 | 1.000 |
| sec_filing_html | 29 | 11 | 0 | 18 | 1.000 | 0.379 |
| shortlink (likely PDF) | 60 | 60 | 0 | 0 | 1.000 | 1.000 |
| third_party_mirror | 185 | 185 | 0 | 0 | 1.000 | 1.000 |

Second run: 1,103 found, 15 not found, 384 uncaptured (0.987 / 0.734). The 344 newly found: 185 recorded against the fliphtml5 mirror, which the check script verified in the canonical gstatic PDF (the script's candidate URLs for a source include its `Canonical_URL`; the mirror pages themselves stay blocked); 60 Microsoft; 89 Equinix (61 + 6 + 22); 10 Applied Digital (`9d68407`).

Page check: 789 of 818 PDF values are on the cited page; 29 are on another page: 28 in the Google report, where the workbook cites the flipbook's page numbers (105 and 110–111) and the values sit on other physical pages of the PDF's text layer, and the AirTrunk sentence that spans pages 8–9, as before.

The 5 not found are unchanged: the Vantage APAC 5 MW figure and the Raxio Angola opening year, which the pages as captured do not carry, and the three drawn PUE figures on page 8 of the AirTrunk framework (an OCR case). The 50 uncaptured sit behind DLR-2025 (32) and the SEC 403 (18).

## Against the S1 exit line

The canonical Google 2025 report is captured with its hash. 11 of the 14 file sources are captured with hashes and page-numbered text; the Digital Realty impact report waits on the same kind of decision as the five (its host says `Disallow: /rs/`), and the two mirrors are bot-gated pages whose 185 observations are covered by the canonical PDF. The value check reports found, not found or not captured for all 1,502 observations, with the cited page checked for PDFs.

## Fetch count

72 URLs once each in the batch (74 page requests), robots.txt once per host, 12 browser renders. No probe outside the batch; the earlier one-URL batch of the day fetched the Applied Digital release once more ([applied-digital-check-2026-09-30.md](applied-digital-check-2026-09-30.md)).

## Follow-ups

- Decision: record an override for DLR-2025 (`go2.digitalrealty.com`, `Disallow: /rs/`), or leave the row to the seed user's next manifest.
- W2L: a redirect target's robots.txt is not consulted on the http lane, for any fetch; an override on a short link therefore reaches the target on the short link's record alone. A per-hop robots check is a candidate for M2.
- Check script: a flipbook mirror's page numbers are not the PDF's physical pages (28 `other_page`); a page-offset per source, or the physical page in the workbook, would close this.
