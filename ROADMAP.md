# W2L Roadmap

Updated 2026-09-30. Engineering now follows the Firecrawl parity milestones in [research/parity/plan-to-70.md](research/parity/plan-to-70.md); the earlier seed-user phase plan is folded into them below. The Section A/B/C roadmap remains archived in [docs/roadmap/sections-abc-roadmap-2026-09-28.md](docs/roadmap/sections-abc-roadmap-2026-09-28.md).

## Current milestone: S1 — seed-user slice

**M1 closed on 2026-09-30** (commits `70681ca`..`62b9c34` plus the ladder budget fix): items 1–5 below each have a dated record; `node research/parity/score.mjs` reports 25.0% tier-weighted (audit 18.7%), with `scrape-formats.markdown` and `scrape-formats.json` kept weak for the gaps named in [`research/parity/reaudit-2026-09-30.json`](research/parity/reaudit-2026-09-30.json). Not yet done from the exit line: the full 12-URL batch re-run at the M1 commit (six URLs were re-checked; the other six and the browser-lane StatCan check wait for the macOS network).

**This week:** S1 (below): the frozen 72-URL manifest is run, its W2L-side misses fixed (superscript glue, header limit), the check script's matcher widened and the manifest re-run (0.987 recall of captured sources). What remains: the robots decision on the five refused files, the 12-URL re-run.

## Direction

W2L turns a list of URLs into a table where every row can be traced to its source: *web data you can cite*. It runs locally; when a site blocks automated access, the user's own browser or a proxy the user supplies is the fallback, not stealth.

Engineering goal: reach at least 70% of Firecrawl v2's feature set, tier-weighted, as measured by [research/parity/](research/parity/) (18.7% at the audit commit), while making every feature that already exists behave correctly on real sites. A feature counts only after its real-site check passes and is recorded with the command and source commit; a green unit test is not enough.

The seed user (the data-centre finance dataset in [research/coos-pilot/](research/coos-pilot/)) remains a customer. His sources are the researcher-side test set; because 56% of his recorded numbers come from PDFs, file download and PDF text come directly after M1 instead of waiting for M3.

Commercial goals (pricing, Pro, launch dates) are deferred until M2 is done and will be set from what the milestones actually cost.

## Milestones

Scores are tier-weighted parity from `node research/parity/score.mjs`; days are the audit's estimates, to be replaced by measured time after M1.

| Milestone | Scope | Features | Audit days | Score after |
| --- | --- | --- | --- | --- |
| **M1** · Trustworthy core | Fix what exists: markdown, links, JSON extraction, crawl status, formats, timeouts, path filters, errors; plus the four live-batch failures | 21 + 4 | 34 | 25.5% |
| **S1** · Seed-user slice | File download as received (CSV, XLSX, ZIP, PDF, JSON) with hashes; PDF text with page numbers (text layer only); re-run the 72-URL manifest and the value check | from M3 | ~8 | — |
| **M2** · Breadth without external services | html/rawHtml/images/screenshot, include/exclude tags, headers, mobile, sitemap modes, domain scope, webhooks, watcher | 50 | 54 | 39.4% |
| **M3** · Map, actions, cache, upload | `map`, browser actions, `maxAge` cache, parse upload (rest of the PDF items) | 30 | 55 | 50.0% |
| **M4** · Clients | Publish `@w2l/sdk` and `@w2l/cli`, Python SDK, Firecrawl v2 compatibility routes, complete MCP | 26 | 51 | 57.5% |
| **M5** · Bring-your-own services | User-supplied LLM (extract, summary), search backend (SearXNG default), proxy and location; local monitors | 52 | 74 | 73.0% |

A milestone ends when every feature in it has a passing real-site check in a dated record under `research/parity/`, not when its days run out.

### M1 · Trustworthy core

Order of work. Items 1–4 come from [the first live batch](research/parity/live-batch-1-2026-09-30.md) and are not in the audit's M1 list; they go first because each turns a page that has data into a confident wrong answer.

1. **HTTP 200 with extractable text must never come back as `failed` with `markdown: null`.** A confidence-0 extract on a listing page (books.toscrape.com `art_25`, data.gov.uk homepage) returns `partial` with the markdown and a `low_confidence` warning. Re-check: batch #2 has 60 fetched and 0 failed; #11 homepage is `partial`.
2. **Detect client-rendered data and escalate.** A table shell with no cells or an empty data container in an otherwise successful HTTP response (StatCan table 18-10-0006-01, OWID grapher `?tab=table`) triggers the browser lane. Re-check: #7 months and values present; #9 has table rows.
3. **Robots, DNS and connection failures are structured results, and W2L honours a configured proxy.** A robots lookup timeout returns a `FetchResult` with `dns_error`/`timeout`, not HTTP 500; `HTTPS_PROXY`/`W2L_PROXY_URL` apply to both lanes. Re-check: #6 from the macOS network.
4. **Markdown keeps block boundaries and drops navigation chrome.** Sibling blocks get separators (quotes.toscrape.com: one quote per line); page navigation is excluded (Wikipedia GDP: body starts at `## Table`, no interlanguage list or navboxes).
5. The audited M1 features (`research/parity/milestones.json`, key `M1`): markdown fixes (relative URLs, `data:` images, nested `pre`/tables, ordered lists, all tables kept), links in batch and crawl results, page metadata and real response metadata, `onlyMainContent`, formats array (no 3-entry cap, markdown-only default, `/fc` honours formats), JSON extraction (missing required arrays, full-path matching, evidence, deep merge), `timeout` and `waitFor`, crawl start/resume and status counters, `includePaths`/`excludePaths`, crawl scrape options, SDK waiters, error codes, API key handling, robots `Crawl-delay` on the HTTP lane.

Exit: items 1–5 each have a passing check in a dated record; the first live batch re-run at the M1 commit shows the two failures and five partials resolved or explained; `npm test` green; `node research/parity/score.mjs` reports 25.5% with M1 marked solid.

Status 2026-09-30: items 1–4 checked in [live-batch-1-m1-recheck-2026-09-30.md](research/parity/live-batch-1-m1-recheck-2026-09-30.md) (StatCan's browser-lane rendering unverified from the cloud network); item 5 checked in [m1-live-checks-2026-09-30.md](research/parity/m1-live-checks-2026-09-30.md) with per-feature evidence in [reaudit-2026-09-30.json](research/parity/reaudit-2026-09-30.json). Score 25.0%, not 25.5%: markdown and JSON extraction stay weak (largest-table-only on table pages, Wikipedia chrome leftovers; no price mapping on generic pages without a model, no chunked model input). The 12-URL re-run is carried into the S1 week.

### S1 · Seed-user slice

- Detect CSV, XLSX, ZIP, PDF and JSON by content type and save them as received with SHA-256 and size; no browser escalation for files; size cap configurable (10 MiB today); other binaries return `unsupported_content_type`.
- PDF text with page numbers from the text layer; a scanned PDF returns `ocr_required`, never an empty success.
- Re-run [research/coos-pilot/](research/coos-pilot/): freeze the manifest first (as given, flagged rows kept in the denominator), then `run-baseline.mjs` and `check-observations.py`; record recall by source format.

Status 2026-09-30: file download as received and PDF text with page numbers are in `8467e8e` (tests for PDF, scanned PDF, CSV, JSON, XLSX, ZIP, unsupported binaries, the size cap and the browser lane). Live check on five of the seed user's PDFs in [research/coos-pilot/files-check-2026-09-30.md](research/coos-pilot/files-check-2026-09-30.md): three read in full (3, 12 and 72 pages, table rows kept one per line); two are on CDN hosts whose robots.txt disallows every path and are refused as `policy_denied` with the rule in the trace. Open decision: whether a researcher may record an explicit robots override for a file the publisher links publicly (`ignoreRobotsTxt` is in the Paused table).

Baseline 2026-09-30 ([research/coos-pilot/baseline-2026-09-30.md](research/coos-pilot/baseline-2026-09-30.md), manifest frozen in `e96a8e9`, run on a build of `8467e8e`): 72 URLs, 57 `success`, 6 `policy_denied` (robots on CDN, marketing and shortlink hosts, the canonical Google report among them), 5 `connection_error` (`services.global.ntt`: an 18 KB `content-security-policy` header overflows undici's default header limit), 1 SEC 403, 3 blocked (rate limit, two third-party mirrors). 6 of the 13 non-HTML sources captured as files with hashes and page-numbered text. Value check: 992 of 1,502 observations found (0.893 of captured sources, 0.661 of all), 119 not found, 391 behind uncaptured sources; 480 of 482 PDF values on the cited page. Of the 119 misses, 90 are one W2L markdown defect (a `<sup>2</sup>` glued to the next number on Digital Realty metro pages), 8 the table-only extraction on a press release, 3 a drawn PUE table, 16 the check script's literal matcher, 2 unexplained. Exit not met: five files stay robots-refused. Fixed the same day: `<sup>`/`<sub>` keep their script form (`bbe6c88`) and the http lane reads response headers up to 64 KiB (`594c377`); re-fetching the 15 URLs behind those misses on that build through the REST API and the session proxy (batch `203e2960…`) returned all 15 and found all 97 observations behind them (90 Digital Realty, 7 NTT). Second run of the whole manifest the same day ([research/coos-pilot/rerun-2026-09-30.md](research/coos-pilot/rerun-2026-09-30.md), matcher version 2 in `1bad0aa`, which also accepts a scale word and trailing zeros): 62 `success`, 5 `policy_denied`, 2 `http_error`, 3 blocked; 1,103 of 1,502 observations found (0.987 of captured sources, 0.734 of all), 15 not found (10 on the Applied Digital release's table-only extraction, 3 drawn PUE figures, 2 unexplained), 384 behind uncaptured sources. Exit still not met: the same five files are not captured (the Digital Realty report's host answered 404 this time instead of a robots rule). Table-region fix the same day (`9d68407`): the table strategy keeps the document around a table that carries less than half of the page's visible text, so a release's prose and every statement come out in order; the Applied Digital release re-fetched through the local REST API returns 73,619 chars with 13 tables and the MW and financing figures in its prose ([research/coos-pilot/applied-digital-check-2026-09-30.md](research/coos-pilot/applied-digital-check-2026-09-30.md)); `check-observations.py` on that capture finds all 11 of the source's observations (4 strong, 7 weak; 1 found and 10 not found in the re-run). Next: the robots decision, the 12-URL re-run.

Exit: the 15 PDF-type sources in his manifest are captured with hashes, including the canonical Google 2025 report; the value check reports found/not-found for all 1,502 observations.

### M2–M5

Feature lists and file-level changes are in [research/parity/plan-to-70.md](research/parity/plan-to-70.md). Order inside each milestone: features already `weak` first, then the cheapest high-tier missing ones.

## Testing rules

- Live checks run against the frozen public test set in [research/parity/real-site-test-set.md](research/parity/real-site-test-set.md); failed URLs stay in the denominator and are never swapped.
- Each batch run is a new dated record under `research/parity/`; earlier records are not edited.
- Real sites are fetched once per check; sandboxes (toscrape.com, scrapethissite.com, webscraper.io) take repeated runs.
- Raw outputs stay under `.w2l/` (git-ignored).

## Paused

Not worked on unless the stated condition occurs.

| Paused | Restart when |
| --- | --- |
| Amazon.sg adapter work, the R4 100/100 gate and the 1,000-page gate | Commerce price evidence becomes an active audience |
| Hosted MCP (Render, WorkOS) and hosted persistent tasks | Users ask for runs while their computer is off and will pay for it |
| Public preview UI work | Copy change at launch only |
| Monitor → webhook extensions, n8n, task UI | A paying user needs them |
| B3/B4 session and recipe work | A milestone needs it |
| Firecrawl autonomous agent, interact sessions, hosted browser sessions | After M5, if users ask |
| Stealth, fingerprinting, proxy pools, a blanket `ignoreRobotsTxt` | Not restarted; explicit 400 for these options. The per-URL `robotsOverride` with a recorded reason (S1, 2026-09-30) is not this: robots.txt is still read and the override is on the record |
| Browser-extension lane | A user's blocked sites are not covered by their own proxy (M5) |
| Pro packaging, payments, launch plan | After M2, from measured milestone cost |
| Internal gate process (Gate 5 and similar) | Replaced by real-site checks and user signals |

## Cadence

Each Monday, set the week's goal at the top of this file. After M1 and after S1, run the seed user's manifest and send him the output. Every two weeks, compare measured days with the audit's estimates and re-plan the remaining milestones.
