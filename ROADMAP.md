# W2L Roadmap

Updated 2026-09-28. This replaces the Section A/B/C roadmap, which is archived in [docs/roadmap/sections-abc-roadmap-2026-09-28.md](docs/roadmap/sections-abc-roadmap-2026-09-28.md) together with its gates and evidence boundaries.

## Current phase: Phase 0 — seed-test preparation

**This week:** freeze the seed user's source manifest, run the current build on it, classify every failure by the capability that would fix it, and check his recorded numbers against what W2L captured. Test set and tools: [research/coos-pilot/](research/coos-pilot/).

## Direction

W2L turns a list of URLs into a table where every row can be traced to its source: *web data you can cite*. It runs locally; when a site blocks automated access, the user's own browser is the fallback, not stealth.

The first users are researchers: graduate students, academic and policy researchers, data journalists and think-tank analysts who collect figures from public reports and web pages and must show where each number came from. Everything in the next phases serves that one workflow. Commerce and SaaS competitive intelligence come later; sales-lead scraping is out of scope.

Success at the end of the plan (week 13, 2026-12-27): three paying users or ten weekly active users. If neither happens, change the audience before adding features.

## Phases

| Phase | Weeks | Goal | Exit |
| --- | --- | --- | --- |
| 0 · Seed-test preparation | 1 | Replace assumptions with the seed user's real sources | Baseline run, failure table, value check, Phase 1 thresholds recorded |
| 1 · Seed alpha | 2–3 | URL list → citable output folder; first you run it for him, then he runs it | He confirms the data can go into his analysis and runs the CLI on his own machine |
| 2 · Self-serve beta | 4–5 | Anyone can install and run it | He runs a regression on W2L data; a non-author installs it unaided |
| 3 · Lane for blocked sites | 6–8 | Capture pages that block automated access through the user's browser | Public three-lane success rates on 200 URLs; three users used the lane |
| 4 · Pro and payments | 9–11 | Something to sell beyond the open core | One interviewee pays for a founding membership |
| 5 · Launch and decision | 12–13 | Public launch | Three paying or ten weekly active users |

Week numbers are a guide. A phase ends when its exit condition is met, not when its weeks run out.

### Phase 0 · Seed-test preparation

No new product features in this phase.

- [ ] Research intake: dependent and explanatory variables, geography, years, unit of analysis, sources, access terms, his operating system and whether Node or Python is installed.
- [ ] Freeze the manifest ([research/coos-pilot/coos-manifest.v1.json](research/coos-pilot/coos-manifest.v1.json), 72 URLs). First ask him about the two suspect links (the CyrusOne location source reuses a press-release URL; the Equinix green finance framework URL looks truncated). Do not replace failed URLs after freezing.
- [ ] Baseline run with the current build: `npm run api`, then `node research/coos-pilot/run-baseline.mjs`.
- [ ] Classify every non-success by the capability that would fix it (file download, PDF text, robots policy, anti-bot or login, JavaScript rendering, table structure), counted both per URL and per affected observation.
- [ ] Value check: `python3 research/coos-pilot/check-observations.py --workbook <xlsx> --batch <batch-items.json>`.
- [ ] Record the Phase 1 thresholds in the manifest before Phase 1 work starts.
- [ ] At least four interviews (eight by the end of Phase 1, six of them researchers); ask each for their current process, time spent, sites that blocked them and a reaction to the price.
- [ ] Register the npm organisation `@w2l` and the PyPI name `w2l` (the unscoped npm name `w2l` belongs to someone else).
- [ ] Repository cleanup: stale README statements, root-level scripts moved to `research/` or removed, Render and WorkOS material out of the docs (WorkOS code in `packages/mcp/src/host.ts` stays, marked experimental), live-network tests split into `npm run test:live`.
- [ ] Send him the link list, the data issues found in his workbook, and ask which sources he plans to add next. Those become the unseen test set for Phase 1.

**Decision rule after the failure table:** if file and PDF failures dominate, Phase 1 starts with file download and PDF text. If anti-bot or login failures affect 20% or more of all URLs, move the two-day Phase 3 spike into Phase 1 week 2. The overall success rate alone does not decide anything.

### Phase 1 · Seed alpha (URL list → citable output folder)

Week 1, then the first seed test (you run it and hand him the folder):

- File download: CSV, XLSX, ZIP, PDF and JSON are saved as received with SHA-256 and size, without escalating to the browser. Today the HTTP lane receives the file and then the browser reports `connection_error`. The size cap becomes configurable (10 MiB today) so large reports such as the canonical Google 2025 PDF can be fetched.
- PDF text with page numbers, so observations that cite a page can be checked on that page.
- Evidence Record v1: one versioned JSON Schema for every lane, with an ISO fetch time, redirect chain, lane, robots decision, raw and output hashes, and extractor version and commit.
- Tables → CSV: one CSV per table with `tableIndex`, caption and source URL; merged cells carry their value; every table on the page is kept.
- General exporter: a batch becomes a folder with `results.csv`, `evidence.jsonl`, `tables/`, `files/`, `manifest.sha256`, a draft `methods.md`, and the observation check.
- Fix the structured-extraction false success (a missing required array is reported as complete).

Week 2, then the second seed test (he runs it himself on his next sources, frozen before the run):

- Explicit, per-domain robots override with a recorded reason (default stays compliant); a declared research User-Agent with contact details where a publisher requires it (SEC).
- `w2l batch urls.txt --out <dir> [--resume]` without a background service, published as `@w2l/cli` under the `alpha` tag; the installed Chrome (or Edge on Windows) is used when present; CI on macOS, Windows and Linux.
- Guide: "URL list → CSV with evidence", using his sources.

**Exit:** the thresholds recorded in Phase 0 are met on the 72-URL set and reported on his new sources; he confirms the output can go into his analysis or names what is missing; he ran the CLI on his own machine.

### Phase 2 · Self-serve beta

Publish `@w2l/sdk` and `@w2l/mcp` (after splitting the MIT client from the AGPL server), `map` from sitemaps and home-page links, MCP output with the Evidence Record, install robustness (native SQLite, machines without Node), a non-author install test on clean macOS and Windows, a 1,000-URL / 20-domain kill-and-resume test and a throughput benchmark, and the guide "Citing web data in a paper". A Python client only if interviews ask for it or most users lack Node.

### Phase 3 · Lane for blocked sites

Start with a two-day spike on the blocked URLs from the Phase 0 table comparing: attaching to the user's running Chrome over CDP (Chrome 144+, user-approved), a visible browser with a W2L profile, and a browser extension. Build the one that works on those sites. Whichever is chosen: loopback only, explicit pairing or native messaging, minimal permissions, one request at a time per domain with jitter, and the same output shape as the other lanes.

### Phase 4 · Pro and payments

A plugin interface in the core (exporters and lanes), `@w2l/pro` in a separate private repository, offline Ed25519 licences built on `packages/attest`, payments through a merchant of record, the full Evidence Pack (snapshots, screenshots, citations, signed manifest), scheduled re-runs with table-row change comparison built on Monitor, xlsx and Parquet export, the vendor lane, and legal review of the terms, privacy policy and acceptable-use policy.

### Phase 5 · Launch and decision

Launch to interviewees first, then the Chrome Web Store (if an extension exists), Show HN, MCP directories and research mailing lists. At week 13: paying users → expand to the second audience; weekly users without payment → test team or per-project pricing; neither → revisit the interviews and change the audience, not the feature list.

## Paused

These are not worked on unless the stated condition occurs.

| Paused | Restart when |
| --- | --- |
| Amazon.sg adapter work, the R4 100/100 gate and the 1,000-page gate | Commerce price evidence becomes the active audience |
| Hosted MCP (Render, WorkOS) and hosted persistent tasks | Users ask for runs while their computer is off and will pay for it |
| Public preview UI work | Phase 5 copy change only |
| Monitor → webhook extensions, n8n, task UI | A paying user needs them |
| B3/B4 session and recipe work beyond what Phase 3 reuses | Phase 3 chooses a lane that needs it |
| Full Firecrawl parity (search, agent, cross-site extraction) | A paying user asks |
| Stealth, fingerprinting, proxy pools | Not restarted |
| Internal gate process (Gate 5 and similar) | Replaced by user signals |

## Weekly cadence

Each Monday, set the week's single goal at the top of this file. Talk to users at least twice a week through Phase 2. Each Friday, send early users a short note on what shipped and what is next. Every two weeks, check whether any paused item's restart condition has occurred.
