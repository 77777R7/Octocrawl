# W2L Roadmap

Version 2, updated 2026-09-29. Weeks 1–16 run from 2026-09-28 to 2027-01-17. This version replaces the 13-week plan of 2026-09-28 and adds the Firecrawl parity audit of 2026-09-29. The Section A/B/C roadmap is archived in [docs/roadmap/sections-abc-roadmap-2026-09-28.md](docs/roadmap/sections-abc-roadmap-2026-09-28.md) with its gates and evidence boundaries.

## Current phase: P0 validation and P1 core correctness, in parallel

**This week (week 1):** P1's exit is met on `main` at `6024703` ([core-status-2026-09-30-6024703.md](research/parity/core-status-2026-09-30-6024703.md)): the first 12 URLs pass; 21 of the core 29 are solid, after the table-page and table-cell fix (#82) and the crawl-status and batch-wait docs (#75); and 62 of the seed user's 72 URLs succeed with the rest reporting their reason ([batch run](research/coos-pilot/runs/2026-09-30-main-6024703-batch.md)). The real-site run passed 103 of 106 cases: A36, skipped there for want of `W2L_CONTACT`, passed when run alone on the same commit, and J04 and J05 did not reach their pages through the network. P1's one-line install and week 6 calibration remain. P2 has opened with file download and PDF text.

**Merged from `claude/vigilant-keller-nkskez` (2026-10-02):** that branch forked from `main` at `57bbb4b` on 2026-09-28 and ran its own M1 and S1 on its own code; its dated records are now in `research/parity/` and `research/coos-pilot/` (see the README of each) and describe that code, not `main`. On it: the first 12 URLs re-run at `57232f6` passed 8, partial 3, failed 1 (StatCan's table does not render from that machine's network) ([live-batch-1-rerun-2026-09-30.md](research/parity/live-batch-1-rerun-2026-09-30.md)); its parity score on its own re-audit scheme was 25.0%, 26.8% after html/rawHtml and the tag filters ([status-2026-09-30-vigilant-keller.csv](research/parity/status-2026-09-30-vigilant-keller.csv)); the seed user's 72 URLs ran three times, the last with six recorded robots overrides: 12 of the 14 file sources captured with hashes, including the canonical Google 2025 report, and 1,479 of 1,502 workbook observations found (0.985), 5 not found, 18 behind the SEC 403 ([rerun-local-2026-09-30.md](research/coos-pilot/rerun-local-2026-09-30.md)). Ported onto `main`, re-implemented on its code where both sides had changed the same files: superscripts in their script form (`extract-tf/5`), the recorded per-URL `robotsOverride` (local mode only; a hosted server refuses it), the `html` and `rawHtml` formats with `includeTags` / `excludeTags`, and client-rendered detection with its `client_rendered_suspected` warning and browser-lane escalation. Not ported: its table-region fix (#70 and #82 cover the same pages here), and its M2 plans beyond those four items. On this head: the first 12 URLs pass, 12 of 12 cases and 85 of 85 checks, with the merge of `main` at `29a36a0` on `b1fedeb` ([runs/2026-10-02-m2-on-main-b1fedeb.md](research/parity/runs/2026-10-02-m2-on-main-b1fedeb.md)), and `npm test` passes 123 files and 1,528 tests.

P0 is the user track (weeks 1–2) and P1 the engine track (weeks 1–6). P1 does not wait for P0: when the seed user's URLs point to a different P1 item than the order below, their URLs decide.

## Direction

W2L turns a list of URLs into a table where every row can be traced to its source: *web data you can cite*. It runs locally. When a site blocks automated access, the user's own browser is the fallback, not stealth.

The first audience is researchers: graduate students, academic and policy researchers, data journalists and think-tank analysts who collect figures from public reports and web pages and must show where each number came from. Commerce and SaaS competitive intelligence is the second audience, after the first 90 days. Sales-lead scraping is out of scope: it values volume over evidence and carries personal-data risk.

One user → one workflow → one payment. Work off that path goes to the [Paused](#paused) table.

Success at week 16 (2027-01-17): three paying users or ten weekly active users. If neither happens, change the audience before adding features.

## How progress is measured

- **Core features solid.** The parity audit marks 29 core features ([core-features.csv](research/parity/core-features.csv)). A feature is solid when it works, has tests, passes its real-site test and behaves as documented. Three were solid at the audit. P1 makes the 17 in milestone M1 solid, plus basic proxy through local-mode proxy support: 21 of 29. P2 adds `map`, `maxAge`, the published JS SDK and the Python client: 25 of 29. The other four are search, which is paused.
- **Real-site tests passed.** The set in [research/parity/](research/parity/), including sites where the correct result is an honest `blocked`.
- **Not Firecrawl coverage.** The comparison is frozen at firecrawl-js v4.42.0 (snapshot 2026-09-29). Newer Firecrawl releases are not tracked, and the rest of the 312 audited features is not a target.
- Every real-site result is recorded with its command and source commit. A reported gap is first reproduced by a failing test: the audit's first pass was corrected in 90 places on review.

## Phases

| Phase | Weeks | Goal | Exit |
| --- | --- | --- | --- |
| P0 · Validation (user track) | 1–2 | Real URLs and real conversations replace assumptions | Status distribution of the seed user's URLs; 8 interviews; repository and docs corrected |
| P1 · Core correctness (engine track) | 1–6 | Core features give correct output on real sites and never report false success | First 12 real-site URLs pass; 21 of the core 29 solid (M1's 17, the 3 already solid, basic proxy); seed-user URLs ≥70% success, the rest with honest reasons |
| P2 · Breadth for researchers | 7–10 | Install, formats, Python client, guides | 25 of the core 29 solid; the seed user runs a regression on W2L data; a non-author installs W2L unaided |
| P3 · Browser lane and Pro | 11–14 | A lane for blocked sites and something to sell | Published success rates of the user-browser lane against HTTP; 3 early users used queue mode |
| P4 · Paid launch | 15–16 | First payment | 3 paying or 10 weekly active users by week 16 |

Weeks are a guide. A phase ends when its exit condition is met, not when its weeks run out.

### P0 · Validation (weeks 1–2)

- [ ] **Seed-user URLs.** Freeze [research/coos-pilot/coos-manifest.v1.json](research/coos-pilot/coos-manifest.v1.json) (72 URLs) after asking about the two suspect links (the CyrusOne location source reuses a press-release URL; the Equinix green finance framework URL looks truncated). Run the current build (`npm run api`, then `node research/coos-pilot/run-baseline.mjs`), report success / blocked / timeout / incomplete shares per site, classify each non-success by the capability that would fix it, and run the value check (`research/coos-pilot/check-observations.py`). These URLs become the second batch of the real-site test set. Failed URLs are not replaced after freezing.
- [ ] **Interviews.** At least 8, of them at least 6 researchers. Record how each gets data today, the time it takes, sites that blocked them and their reaction to the price. At least 3 join the founding-member list or offer to prepay.
- [ ] **Package names.** Register the npm organisation `@w2l` and the PyPI name `w2l`. The unscoped npm name `w2l` belongs to someone else.
- [ ] **Repository cleanup.** The root keeps README, LICENSE, CONTRIBUTING, CHANGELOG and configuration only; `q2.py`, `q3.py` and `generate_report*.py` move to `research/`. The audit's feature matrix and plan are committed to `research/parity/`. Render and WorkOS material leaves the docs (the WorkOS code in `packages/mcp/src/host.ts` stays, marked experimental). The README stops describing Amazon work as living on a side branch. Live-network tests run under `npm run test:live`.
- [ ] **Docs corrections.** The Codex link points to `developers.openai.com/codex/extend/mcp`. The Connect MCP page installs the service before giving the client command. Codex, Claude Code, Cursor and Claude Desktop configurations are each tested. A port table is added. The README calls `/fc` partially compatible until P1 item 5 is fixed.
- [x] **ROADMAP and AGENTS.md.** Current phase set to P0 and P1; the Paused table names features precisely, so agents can decide instead of refusing all Firecrawl-related work.

**Decision rule:** if the seed user's sources succeed at 70% or more over HTTP plus the local browser, the extension stays in P3. Below 50%, P3's extension queue mode moves to week 7, and P2's `map` and cache move later.

### P1 · Core correctness (weeks 1–6)

Order: first what silently returns wrong data, then what loses data, then missing options. An item is accepted when its real-site test passes, recorded with command and commit.

| # | Item | Accepted when |
| --- | --- | --- |
| 1 | False success: JSON extraction reports `complete` while a required field is missing | A missing required field gives `status: incomplete` with a reason per missing field; regression test added |
| 2 | A non-200 response becomes an empty failure | The fetched content is returned with `httpStatus`; status is judged from the content; a 403 block page is `blocked` with evidence |
| 3 | Markdown: adjacent `div`s glued into one word; ordered-list numbers lost; code blocks and tables inside list items dropped | Golden-file tests from books.toscrape.com, scrapethissite.com and a Wikipedia table page |
| 4 | Relative links are not resolved | Every entry in `links` is an absolute URL resolved against `finalUrl` |
| 5 | Batch drops `links`; `formats` is capped at 3; `/fc` silently drops `formats` | Batch and scrape outputs have the same shape; `formats` has no cap, or an explicit error past it; `/fc` rejects unsupported parameters explicitly and never drops them silently |
| 6 | `formats`, `onlyMainContent`, `timeout` / `waitFor` | Behaviour matches the docs; a timeout returns `partial` with the content fetched so far |
| 7 | Crawl: output format selection, `includePaths` / `excludePaths` | Path filters are tested; format options match scrape |
| 8 | SDK wait helpers; one error-code set | Error-code table in the docs reference |
| 9 | Local-mode proxy: `HTTPS_PROXY` / `NO_PROXY` for every lane; hosted mode stays direct | A site reachable only through the operator's proxy passes its real-site test; proxy use is recorded in the result |
| 10 | The rest of M1 in [plan-to-70.md](research/parity/plan-to-70.md): page metadata and the page `<title>`, crawl start and resume, live crawl status, API key comparison, crawl-delay | Each feature's real-site check in [feature-matrix.csv](research/parity/feature-matrix.csv) passes |

Throughout P1:

- **Real-site test set.** About 40 sites in [research/parity/sites.md](research/parity/sites.md). The first 12 URLs are the audit's first live batch in [real-site-test-set.md](research/parity/real-site-test-set.md); all of them pass, and blocked sites report `blocked` honestly. The seed user's URLs are the second batch.
- **Evidence Record correctness.** `status` / `reason`, `httpStatus`, `finalUrl`, `lane` and the hashes come out the same way in every lane ([Evidence Record](#evidence-record)). This is part of P1, not a new feature.
- **One-line install.** `npx @w2l/cli@latest scrape <url>` gives a result within 5 minutes on clean macOS and Windows.
- **Week 6 calibration.** Record the actual P1 time against the audit's 34-working-day estimate for its M1 and rescale P2–P4 by that ratio.

**Exit:** the first 12 URLs all pass; 21 of the core 29 are solid (the 17 in M1, the 3 solid at the audit, and basic proxy); at least 70% of the seed user's URLs succeed and the rest report their reason honestly.

### P2 · Breadth for researchers (weeks 7–10)

The subset of the audit's M2 and M3 that researchers use; the rest is paused. P2 opens with file download and PDF text: PDFs are the largest source type among the seed user's failures ([preliminary baseline](research/coos-pilot/runs/2026-09-29-preliminary-baseline.md)).

| Item | Accepted when |
| --- | --- |
| File download and PDF text (first) | CSV, XLSX, ZIP, PDF and JSON are saved as received with SHA-256 and size, without escalating to the browser, under a configurable size cap; PDF text becomes Markdown with page numbers, each passage traceable to its page; checked on 10 real reports including the seed user's PDFs; no OCR; PDF tables marked unverified<br>**Status 2026-09-29:** implemented on branch `claude/p2-file-download`, not yet merged. PDF text was checked on all 10 corpus reports ([corpus run](research/pdf-corpus/runs/2026-09-29.md)); through the API, 9 of them (F01–F08, and F11 reached by a crawl), a CSV, ZIP, JSON and XLSX (F09, F10, F15, F16), `/fc`, the browser download and JSON from a PDF are real-site cases: 15 of 16 passed in the [recorded run](research/parity/runs/2026-09-29-file-download.md); F03 failed on a connection timeout before any file was read and passed when run again |
| `html` / `rawHtml` / `screenshot` formats | Identical in scrape, batch and crawl |
| Sitemap mode, subdomains, `map` endpoint | URL list from `sitemap.xml` and home-page links, with include / exclude patterns |
| Tables → CSV | One CSV per `<table>` with `tableIndex`, caption and source URL; 10 real table pages checked with no misaligned cells |
| `maxAge` cache | A cache hit says so and gives the original fetch time |
| Custom headers, mobile viewport | Recorded in the Evidence Record |
| Public npm packages and a Python client | `@w2l/cli`, `@w2l/sdk` and `@w2l/mcp` published; `pip install w2l`; `w2l.batch(urls).to_pandas()` returns a DataFrame with evidence columns |
| Cross-platform service | `w2l serve` stays up on Windows |
| Batch reliability | 1,000 URLs over 20 domains, `kill -9` mid-run, then resume: 0 lost, 0 duplicated |
| Throughput benchmark | HTTP lane, 32 concurrent across origins: ≥500 pages/min, p50 <800 ms; browser lane, 8 contexts: ≥60 pages/min, p95 <8 s; results in `docs/benchmarks/` |
| Two guides | "URL list → CSV with evidence" (data-centre sources as the example) and "Citing web data in a paper" |

**Exit:** 25 of the core 29 are solid; the seed user runs a regression on data W2L produced; a non-author installs W2L on a clean machine and completes a first batch unaided.

### P3 · Browser lane and Pro (weeks 11–14)

| Item | Accepted when |
| --- | --- |
| Extension single-page capture (free) | Current tab → Markdown / tables with an Evidence Record, saved locally or sent to the local service |
| Queue mode (Pro) | Takes a URL queue from the local service, opens each URL in a background tab, waits for load and returns the DOM; pauses and notifies the user at a login or verification page |
| Local bridge security | WebSocket on `127.0.0.1` only; a one-time pairing code confirmed in both the extension and the CLI; Origin checked; unpaired connections refused. Any web page can try to reach a local port, so none of this is optional |
| Least privilege | No `debugger` permission; site access requested per domain at run time through `optional_host_permissions` |
| Access pacing | By default one request at a time per domain with random jitter, visible and adjustable; robots.txt obeyed by default, and a user override recorded in `robotsDecision` |
| MCP | `scrape` / `batch_scrape` accept `lane: "my-browser"` with the same output shape as the other lanes |
| Three-lane comparison | One 200-URL list through HTTP, the local browser and the user's browser; the three success rates published |
| Evidence Pack (Pro) | One-step export in the [Evidence Pack](#evidence-pack) layout with a generated `methods.md` |
| Pro plugin and licence | `@w2l/pro` loaded through the plugin interface, licence verified offline |
| Chrome Web Store | Submitted; early users get a side-load build during review |

**Exit:** on researcher sources the user-browser lane succeeds clearly more often than the HTTP lane, with published numbers; at least 3 early users used queue mode.

### P4 · Paid launch (weeks 15–16)

- Payments through a merchant of record; a licence is emailed automatically after purchase.
- Pricing page: free against Pro, the academic price and the founding-member places left.
- Terms, privacy policy and acceptable-use policy (no bypassing paywalls or access controls, no scraping personal data for marketing), reviewed by a lawyer.
- Launch to interviewees first, then the Chrome Web Store, Show HN, MCP directories and research mailing lists.
- Measure licence activations and user feedback. Telemetry in the free version is off by default; if it is ever enabled, it is disclosed and can be turned off in one step.

### After week 16

| Result | Reading | Next |
| --- | --- | --- |
| 3 or more paying users | The model works | Second audience; scheduled re-runs with change comparison as the second Pro feature; batches of tens of thousands and multiple workers |
| Weekly users, no payment | The value is real; packaging or price is wrong | Test lab or team licences and one-off Evidence Pack purchases per project |
| Neither | Wrong audience or channel | Reread the interviews and redo P0 with the second audience; no new features |

## Product contract

### Evidence Record

Every result from every lane carries the same record. It is the product's identity and stays in the free core, so the evidence travels with every citation. Its JSON Schema is versioned and published in the docs reference.

| Field | Meaning | Today |
| --- | --- | --- |
| `requestedUrl` / `finalUrl` / `redirectChain` | Requested URL, final URL, redirects | In `evidenceRecord` in one form for every lane; the browser lane lists every hop Chromium followed, and a lane that observes only the endpoints (provider) says so (`complete: false`) |
| `fetchedAt` | UTC ISO timestamp | In `evidenceRecord`, from each lane's `evidence.fetchedAt`; Monitor observations keep `observedAt` |
| `httpStatus` / `status` / `reason` | Transport status and W2L's verdict | Exists; `evidenceRecord.reason` is the failure, block or budget reason in one field |
| `lane` | `http` / `browser_local` / `my_browser` / `vendor` | In `evidenceRecord` on every default response (lane names as today: `http`, `browser_local`, `provider`, …) |
| `robotsDecision` | The robots.txt verdict, including a recorded user override | Recorded in `evidenceRecord` (decision, robots.txt URL and hash, unreachable reason, crawl delay); `userOverride` is always false, as no override exists yet |
| `rawSha256` / `outputSha256` | Hashes of the raw page and of the extracted output | In `evidenceRecord`: the body each lane read, the delivered Markdown and `json.data` as canonical JSON |
| `extractor` | Name, version, commit | In `evidenceRecord`: `extract-tf` and `EXTRACTOR_VERSION` for a page, `pdf-text/1` or `file-text/1` for a file, and the commit when `W2L_SOURCE_COMMIT` is set |
| `fieldEvidence` | Where each field came from: JSON-LD path, DOM locator, table index, PDF page | In `evidenceRecord` for every JSON field read from the page; generic JSON-LD, microdata and meta values have no locator yet; a PDF's `Label: value` lines as `pdf` with `page N "label"` |
| `snapshot` / `screenshot` | Optional snapshot and screenshot paths with hashes | `evidenceRecord.artifacts` with SHA-256: a downloaded file (`kind: "file"`, with size and type), the raw snapshot when `W2L_CAPTURE_RAW_DIR` is set; no screenshot; not yet a request option |

### Free core and Pro

The open-source core is complete and unmetered: a limit in AGPL code can be deleted by anyone and would cost trust. Pro sells what saves time beyond the core, as the closed package `@w2l/pro` loaded through a plugin interface. Pro prices are tested in the P0 interviews.

- **Free (AGPL core):** scrape, batch, crawl and map without limits; Markdown, JSON Schema extraction, tables → CSV and PDF text; the Evidence Record; CLI, local MCP and the Python client; extension single-page capture.
- **Pro:** extension queue mode (`my-browser` lane batches); Evidence Pack export; scheduled re-runs with change comparison, built on Monitor; xlsx and Parquet export; the vendor lane (the user's own proxy or browser-service key); priority email support.

A licence is Ed25519-signed JSON (email, plan, expiry) verified offline. Without one, the core works fully and only the Pro plugin is not loaded. The repository uses the DCO, which grants no right to relicense: before accepting an external contribution to the core, either adopt a CLA or keep Pro code fully independent of the core.

### Evidence Pack

One zip for a paper's supplementary material: `data.csv` (with `fetchedAt`, `finalUrl` and `status` columns), `evidence.jsonl` (one Evidence Record per line), `snapshots/` and `screenshots/`, `manifest.sha256`, `citations.bib` and `citations.json` (BibTeX and CSL-JSON with access dates) and a generated `methods.md` paragraph. Optionally, pages are submitted to the Internet Archive within its rate limits and the archive link is recorded.

## Paused

Not worked on unless the restart condition occurs or the person asking requests it.

| Paused | Why | Restart when |
| --- | --- | --- |
| Further Amazon.sg adapter work | No overlap with the first audience | Commerce price evidence becomes the active audience |
| Firecrawl features outside the core 29 that researchers do not use: search (including SearXNG), agent, cross-site LLM extract, browser actions, live webhook push, file upload, summary, branding and similar | They need a search backend or a model budget, or researchers do not use them. The matrix stays in `research/parity/` | A paying user asks. LLM extraction with the user's own key keeps its environment-variable fallback, maintained but not extended |
| Own stealth, fingerprint spoofing, proxy pools | An arms race that conflicts with the evidence positioning | Not restarted; the user's browser and the vendor lane replace them |
| Hosted API and hosted MCP | Operations, compliance and isolation cost | Users ask for runs while their computer is off and will pay more for it |
| Monitor → webhook extensions | Researchers do not need webhooks | The second audience |
| Internal gate process (Gate 5 and similar) | Replaced by real user signals | Not restarted |

## Risks

| Risk | Mitigation |
| --- | --- |
| The comparison target moves, and the matrix has errors | Firecrawl frozen at v4.42.0; every gap reproduced by a failing real-site test before any code changes |
| Site terms and personal data | robots.txt obeyed by default with the decision recorded; prohibited uses in the acceptable-use policy; guides remind researchers that personal data may need ethics approval |
| AGPL plus DCO blocks relicensing | Pro code in a separate repository; a CLA before accepting external core contributions |
| Chrome Web Store rejection | Least privilege; a side-load build as fallback |
| One person's bandwidth | The Paused table and the weekly cadence |
| A shallow moat: anyone can add provenance fields | The moat is the workflow (Evidence Pack, methods paragraph, citation formats) and the reputation among researchers, not the fields |
| Low extension throughput | The extension is the lane for blocked sites, not the default; large batches use the HTTP lane |

## Weekly cadence

Each Monday, set the week's single goal at the top of this file. For the first 6 weeks, talk to users at least twice a week: about 60% of the time on code and 40% with users. Each Friday, send early users a short note on what shipped and what is next. Every two weeks, review the Paused table and bring an item back only when its restart condition has actually occurred.
