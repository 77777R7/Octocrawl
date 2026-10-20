# Octocrawl Roadmap

The product is called Octocrawl (decided 2026-10-05). Identifiers that still say `w2l` are listed in [AGENTS.md](AGENTS.md#naming).

This is version 3, updated 2026-10-05. The audience widens to developers and people who do not program (decided 2026-10-03). Enhanced access restarts as a product capability (decided 2026-10-05, [PA](#pa--enhanced-access)). On 2026-10-09 enhanced access became the first priority (see the current phase).

Version 2, updated 2026-09-29, is in git history. What it said below stands unless a 2026-10-05 note changes it. Weeks 1–16 run from 2026-09-28 to 2027-01-17. This version replaces the 13-week plan of 2026-09-28 and adds the Firecrawl parity audit of 2026-09-29. The Section A/B/C roadmap is archived in [docs/roadmap/sections-abc-roadmap-2026-09-28.md](docs/roadmap/sections-abc-roadmap-2026-09-28.md) with its gates and evidence boundaries.

## Summary

- **What Octocrawl is.** It turns a list of URLs into a table where every row traces back to its page. It runs on your machine or as a hosted service.
- **Now.** Enhanced access ([PA](#pa--enhanced-access)) comes first since 2026-10-09: reaching the pages that block a plain request. Hosted Octocrawl ([PH](#ph--hosted-octocrawl)) phase 1 runs beside it, with P2's remaining items.
- **Accounts and credits (decided 2026-10-11).** Self-service sign-in and a credits balance per account are built now, beside PA, ahead of P4. Payment follows the two-week cost record. See [PH](#ph--hosted-octocrawl).
- **PA on 2026-10-09.** Items 1, 2 and 8 are accepted. Item 3 is merged, item 7 is built, and item 4 is under way. Item 5 is built but not adopted. Item 6 is not started. Item 9 has its first window recorded. Items 10 and 11 were added on 2026-10-10, and both were accepted on 2026-10-11.
- **Next (from 2026-10-11).** Items 10 and 11 were accepted on 2026-10-11. So new paid configurations and item 6 no longer wait: under the 2026-10-10 decision they waited only for those two. They go on in PA's order, and what they add is measured as tasks verified, not pages returned. 0.4.0 and 0.4.1 were published on 2026-10-10.
- **The bar.** On item 1's frozen task set, reach at least the best competitor's verified completion, with no more false successes.
- **Success at week 16 (2027-01-17).** Three paying users or ten weekly active users.
- **Outside trial gate (decided 2026-10-13).** A person other than the author uses Octocrawl on a task of their own; no date since 2026-10-20, when the first one had passed with no trial recorded. See [the gate](#outside-trial-gate).
- **Paused.** An own browser engine or residential IP network, an in-house CAPTCHA model, a second stealth engine, a hosted browser cluster, more Amazon.sg work and Firecrawl features outside the core. See [Paused](#paused).

## Current phase: PA enhanced access, the first priority, with P2's remaining items

### Outside trial gate

**Decided 2026-10-13, date removed 2026-10-20 by Howard.** A person other than the author uses Octocrawl on a task of their own. Hosted (`https://mcp.octocrawl.dev/mcp`, or an account's key) or local (`npx octocrawl`) both count. The gate has no date. The first one, 2026-10-17, passed with no trial recorded in the repository (no `research/trials/` on `main` on 2026-10-20); whether anyone tried Octocrawl outside the repository is not known.

- **What the gate takes precedence over:** PA, PH or the site does not delay it. PA's open challenge-page gap (12 frozen tasks behind Cloudflare and DataDome) is not a reason to wait.
- **After the trial starts:** each problem the person meets is recorded in `research/trials/` with the date and what they ran. Fixing what they hit comes before new features.
- **When someone tries it:** the trial is recorded in `research/trials/`, and what it finds comes before new features. A trial the person installs unaided also counts toward P2's exit.
- **Ready on 2026-10-13:** every path a new user takes was run that day on the published 0.4.2 and the live services.
  - The site, sign-in through GitHub and Google, and the dashboard.
  - The keyless hosted MCP from Claude Code, Cursor, OpenCode and Codex.
  - The hosted REST API, keyless and with a key (browser lane, credits, revocation, one browser scrape at a time).
  - `@octocrawl/sdk`, `@octocrawl/ai-sdk` and the Python client against the hosted API. `batch` is refused there by design, with a clear message.
  - `npx octocrawl serve` with the Python client's `batch` and the local MCP's 38 tools.
  - The one-line install on clean macOS, Windows and Ubuntu, a page that needs the browser included.
  - Not run that day: the hosted MCP with a key inside a client, which is the gate the REST check passed through.

**From 2026-10-09: enhanced access is the first priority.** Decided by Howard: without reaching the pages that block a plain request, Octocrawl has nothing that sets it apart from the products it competes with. When [PA](#pa--enhanced-access) and other work (PH, P2's remaining items, the public site) compete for time, PA goes first. The way there is the roadmap's own:

1. Finish the PA items in hand: item 3 with #284, item 7's real-site record, item 8's final acceptance.
2. Publish them as the next release (0.4.0, by tag and the Release workflow).
3. Go on in PA's order (items 4 and 6).

Item 9, the competitor baseline, comes first (decided later the same day). It only measures, so it does not hold the release back, and the bar below is read from it. A route that a measured run shows to do better is added or tuned after that release, under [ADR 0005](docs/adr/0005-enhanced-access-policy.md), whose "never" list does not change. "Better" means more tasks verified on item 1's frozen set, no regression on the existing batches, and its false successes counted.

**The bar, decided 2026-10-09: world-class within Octocrawl's means.** Enhanced access keeps up with the leading products. Within what a small team can run (maintained open-source projects, and providers under the user's grant), it aims to be the best: measured, not claimed. The yardstick is item 9's baseline. On item 1's frozen set, Octocrawl's enhanced route reaches at least the verified completion of the best competitor measured there, with no more false successes. Where it falls short, the record names the gap and what would close it, and that becomes the next PA work. What needs infrastructure Octocrawl cannot run, such as its own residential IP network, stays out (see [Paused](#paused)). A provider's pool under the user's grant is the route there.

**From 2026-10-10: verification and readiness before more paid access.** Decided by Howard after the 2026-10-09 review of PA. A status is not a task done:

- A Lark sheet answered `success` with a hidden panel's text and none of its cells, which are drawn on a canvas ([2026-10-09-my-browser-final-round2-b6c7524.md](research/access/runs/2026-10-09-my-browser-final-round2-b6c7524.md)).
- A signed-in GitHub home and an x.com page read before it had loaded were not verified ([2026-10-10-pa7-my-browser-13e2174.md](research/access/runs/2026-10-10-pa7-my-browser-13e2174.md)).
- In the Steel run of 2026-10-09, 30 paid calls gave 6 verified answers ([2026-10-09-pa4-steel-all-loading-76a1c70.md](research/access/runs/2026-10-09-pa4-steel-all-loading-76a1c70.md)).

So [items 10 and 11](#pa--enhanced-access) come next: task verification apart from the fetch status, then readiness of the region a task needs. Item 4 finishes what is in flight: the ledger charging measured session time, and the remaining false successes. New paid configurations wait until 10 and 11 are accepted, and so does item 6. Those configurations are a provider's residential egress or built-in CAPTCHA solving, or another provider. Waiting means that what they add is measured as tasks verified, not pages returned. 0.4.0 and 0.4.1 were published on 2026-10-10.

**From 2026-10-06:** [PH · Hosted Octocrawl](#ph--hosted-octocrawl) phase 1 runs beside PA: the hosted API and remote MCP come out of Paused, metered by credits in Firecrawl's shape, with the local path unchanged.

**From 2026-10-05:** the current focus is [PA · Enhanced access](#pa--enhanced-access), in its order, alongside P2's remaining items (one-line install, the week 6 calibration, a non-author's unaided install) and P0's open items. Since version 2:
- P2's groups are merged:
  - map #103, cache #106, tables and PDF options #108, CLI #110;
  - npm packages and the Python client #115, renamed for publishing in #207 and hardened in #208. They were published as 0.3.0 on 2026-10-05: `octocrawl`, `@octocrawl/cli`, `@octocrawl/sdk` and `@octocrawl/mcp` on npm, `octocrawl-client` on PyPI (not announced; announcing is P4);
  - reliability and performance #120, guides #123.
- The interaction work (logins, actions, list steps, list records, handoff) is merged as I1–I6 and its follow-ups. See P5's actions row.
  - PRs: #134, #136, #140, #146, #154, #160, #173, #176, #178, #180, #181, #185, #188, #192, #197–#199, #201, #204 and #205.
  - Research records: #186, #190, #195, #202 and #203.
- Also merged:
  - converter and parser fixes toward browser parity: #109, #113, #127, #132, #167, #172, #174, #175, #177, #179, #182–#184, #187, #189;
  - other fixes: #105, #107, #111, #112, #193, #196, #200;
  - test infrastructure: #191, #194;
  - the public site: #99, #116, #119, #122, #125;
  - public-preview deploys: #114, #117.

Which of P0's and P2's acceptance conditions those PRs meet is checked against their records, row by row; the status notes below say what is known.

**Groups finished from 2026-09-30 to 2026-10-03.** Their full notes, with every record, are in [docs/roadmap/group-notes-2026-09-30-to-10-03.md](docs/roadmap/group-notes-2026-09-30-to-10-03.md).

| Group | Date | Result |
| --- | --- | --- |
| P1 exit check (week 1) | 2026-09-30 | P1's exit met on `main` at `6024703`; 103 of 106 real-site cases passed |
| Merged from `claude/vigilant-keller-nkskez` | 2026-10-02 | Its dated records describe that branch's code, not `main` |
| M2 formats | 2026-10-02 | All eight M2 formats features pass their live checks |
| M2 crawl URL control | 2026-10-02 | 10 of 10 features pass their live checks |
| M2 batch | 2026-10-02 | 6 of 6 features pass their live checks |
| M2 webhooks and watcher | 2026-10-02 | 11 of 11 features pass their live checks |
| M2 closed | 2026-10-03 | All 50 M2 features: 47 solid, 3 weak, none missing |
| Map | 2026-10-03 | 16 of 18 runner cases, 167 of 175 checks |
| Cache | 2026-10-03 | 11 of 11 runner cases, 77 of 77 checks |
| Researcher data (tables, PDF options) | 2026-10-03 | 14 of 14 runner cases, 63 of 63 checks |
| Publishing, part 1: the CLI | 2026-10-03 | `scrape`, `crawl`, `batch`, `map` and `serve` in one command |
| Publishing, part 2: packages and the Python client | 2026-10-03 | `npm run pack:check` passes 11 of 11 checks |
| Reliability and performance | 2026-10-03 | Batch crash check 8 of 8, none lost; throughput targets met on loopback |
| Two guides | 2026-10-03 | Written from a real run of ten sources: 6 read, 4 kept with their reasons |

P0 is the user track (weeks 1–2) and P1 the engine track (weeks 1–6). P1 does not wait for P0: when the seed user's URLs point to a different P1 item than the order below, their URLs decide.

## Direction

Octocrawl turns a list of URLs into a table where every row can be traced to its source: *web data you can cite*. It runs on the user's machine, or on Octocrawl's hosted service with the same packages pointed at it. Both were decided on 2026-10-06, as Firecrawl, Crawl4AI, Skyvern and Octoparse offer both (see [PH](#ph--hosted-octocrawl)).

When a site blocks a plain request, Octocrawl tries the routes the user allows, within a budget, and records each one. The routes are a browser-compatible HTTP client, managed proxy sessions, an enhanced browser, a third-party solver, or the user's own browser. It never reports a page it did not verify as content. Enhanced access decides whether a page can be reached, not whether it should be.

robots.txt is read and recorded for every URL. As decided on 2026-10-05:

- On a local server, a URL the user names (scrape, batch, a URL list) is fetched whatever robots.txt says.
- The links a crawl or map discovers obey it, unless the user turns that off (`ignoreRobotsTxt`).
- A hosted server obeys it for every URL.
- Crawl-delay and the back-off after a 429 apply throughout.

The audience (widened on 2026-10-03) is developers who would otherwise use Firecrawl, and people who do not program who would otherwise use Octoparse. They paste URLs or describe a site and get a table or JSON whose every row traces back to its page. Researchers remain the users who need that trace most: graduate students, academic and policy researchers, data journalists, think-tank analysts. The guides keep serving them. Sales-lead scraping of personal data is out of scope: it values volume over evidence and carries personal-data risk.

One user → one workflow → one payment. Work off that path goes to the [Paused](#paused) table.

Success at week 16 (2027-01-17): three paying users or ten weekly active users, counted across the audience widened on 2026-10-03 (the target itself is unchanged on 2026-10-05). If neither happens, change the audience before adding features.

## How progress is measured

- **Core features solid.** The parity audit marks 29 core features ([core-features.csv](research/parity/core-features.csv)). A feature is solid when it works, has tests, passes its real-site test and behaves as documented. Three were solid at the audit. P1 makes the 17 in milestone M1 solid, plus basic proxy through local-mode proxy support: 21 of 29. P2 adds `map`, `maxAge`, the published JS SDK and the Python client: 25 of 29. The other four are search, which is paused.
- **Real-site tests passed.** The set in [research/parity/](research/parity/), including sites where the correct result is an honest `blocked`.
- **Not Firecrawl coverage.** The comparison is frozen at firecrawl-js v4.42.0 (snapshot 2026-09-29). Newer Firecrawl releases are not tracked, and the rest of the 312 audited features is not a target.
- Every real-site result is recorded with its command and source commit. A reported gap is first reproduced by a failing test: the audit's first pass was corrected in 90 places on review.
- **Access results.** Enhanced access is judged on real tasks, never on bot-detection test pages. Four figures, on the same targets with and without each route: verified-content completion rate; tasks completed without the person against those the person helped; cost per 1,000 verified results; regressions on cases that passed before. Cold and warm sessions are counted apart, and a cache hit never counts as access.

## Phases

| Phase | Weeks | Goal | Exit |
| --- | --- | --- | --- |
| P0 · Validation (user track) | 1–2 | Real URLs and real conversations replace assumptions | Status distribution of the seed user's URLs; 8 interviews; repository and docs corrected |
| P1 · Core correctness (engine track) | 1–6 | Core features give correct output on real sites and never report false success | First 12 real-site URLs pass; 21 of the core 29 solid (M1's 17, the 3 already solid, basic proxy); seed-user URLs ≥70% success, the rest with honest reasons |
| P2 · Breadth for researchers | 7–10 | Install, formats, Python client, guides | 25 of the core 29 solid; the seed user runs a regression on Octocrawl data; a non-author installs Octocrawl unaided |
| PA · Enhanced access | from 2026-10-05 | Blocked pages reached automatically where the user allows, at a known cost, with no false success | On PA's frozen blocked-task set, verified completion rises over the current ladder, with no regression on the existing real-site batches. Every attempt records its route, profile, egress and cost (unknown cost stays null). A competitor baseline on the same set is recorded (item 9). The enhanced route reaches at least the best competitor's verified completion on that set with no more false successes, or the record names the gap and what would close it (decided 2026-10-09) |
| PH · Hosted Octocrawl | from 2026-10-06, beside PA | The same scrape and map as a hosted API and a remote MCP URL, keyless to try and metered by credits with a key; batch, crawl and Monitor hosted in a second phase | Phase 1: `https://mcp.octocrawl.dev/mcp` connects from Claude Code, Cursor, OpenCode and Codex with one command; a keyless scrape succeeds within the per-IP allowance and a hosted private address or robots override is refused; two weeks of billing and call counts recorded. Phase 2: see the PH table |
| P3 · Browser lane and Pro | after PA | A lane for blocked sites and something to sell | Published success rates of the user-browser lane against HTTP; 3 early users used queue mode |
| P4 · Paid launch | 15–16 | First payment, on hosted credits (decided 2026-10-06) | 3 paying or 10 weekly active users by week 16 |
| P5 · Breadth for developers | after P3 | Search, model-driven formats, hosted scale as PH's phase 2 (cache closed in P2, browser actions delivered, proxies moved to PA) | Firecrawl clients run unchanged; parity ≥50% with records |

Weeks are a guide. A phase ends when its exit condition is met, not when its weeks run out.

### P0 · Validation (weeks 1–2)

- [ ] **Seed-user URLs.** Freeze [research/coos-pilot/coos-manifest.v1.json](research/coos-pilot/coos-manifest.v1.json) (72 URLs) after asking about the two suspect links (the CyrusOne location source reuses a press-release URL; the Equinix green finance framework URL looks truncated). Run the current build (`npm run api`, then `node research/coos-pilot/run-baseline.mjs`), report success / blocked / timeout / incomplete shares per site, classify each non-success by the capability that would fix it, and run the value check (`research/coos-pilot/check-observations.py`). These URLs become the second batch of the real-site test set. Failed URLs are not replaced after freezing.
- [ ] **Interviews.** At least 8, of them at least 6 researchers. Record how each gets data today, the time it takes, sites that blocked them and their reaction to the price. At least 3 join the founding-member list or offer to prepay.
- [x] **Package names.** Register the npm organisation `@w2l` and the PyPI name `w2l`. The unscoped npm name `w2l` belongs to someone else. **Done 2026-10-05 under the brand name:** the npm organisation `octocrawl` and the unscoped `octocrawl`; on PyPI `octocrawl-client`, since `octocrawl` there belongs to another project.
- [ ] **Repository cleanup.** The root keeps README, LICENSE, CONTRIBUTING, CHANGELOG and configuration only; `q2.py`, `q3.py` and `generate_report*.py` move to `research/`. The audit's feature matrix and plan are committed to `research/parity/`. Render and WorkOS material leaves the docs (the WorkOS code in `packages/mcp/src/host.ts` stays, marked experimental). The README stops describing Amazon work as living on a side branch. Live-network tests run under `npm run test:live`.
- [ ] **Docs corrections.** The Codex link points to OpenAI's Codex MCP page (`learn.chatgpt.com/docs/extend/mcp`, where `developers.openai.com/codex/extend/mcp` redirects since 2026-10-09). The Connect MCP page installs the service before giving the client command. Codex, Claude Code, Cursor and Claude Desktop configurations are each tested. A port table is added. The README calls `/fc` partially compatible until P1 item 5 is fixed.
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
- **One-line install.** `npx octocrawl@latest scrape <url>` gives a result within 5 minutes on clean macOS and Windows. **Met 2026-10-13 on 0.4.2** ([install-check run 38399014612](https://github.com/77777R7/Octocrawl/actions/runs/38399014612), macOS, Windows and Ubuntu runners, direct): example.com answered in 7–51 s; a page that needs the browser (quotes.toscrape.com/js/) named the missing browser and its install command on the first answer, and after `npx playwright install chromium` was read on `browser_local`, 24–83 s in all ([2026-10-05 record](research/parity/runs/2026-10-05-one-line-install-90ab8ac.md), [2026-10-13 record](research/parity/runs/2026-10-13-one-line-install-browser-23046c4f.md)). The weekly run checks both. Not shown: a person's own machine outside CI (P2's unaided install).
- **Week 6 calibration.** Record the actual P1 time against the audit's 34-working-day estimate for its M1 and rescale P2–P4 by that ratio. **Recorded 2026-10-13** ([calibration](docs/roadmap/week6-calibration-2026-10-13.md)): M1 took 2–3 working days against 34 (ratio 0.06–0.09), M1 to M3 about 6 against 142.5. The ratio holds for code, not for real-site verification, which PA showed takes 1–3 days an item, nor for exits that wait on people. Rescaling the phase table is proposed there and not adopted.

**Exit:** the first 12 URLs all pass. 21 of the core 29 are solid: the 17 in M1, the 3 solid at the audit, and basic proxy. At least 70% of the seed user's URLs succeed, and the rest report their reason honestly.

### P2 · Breadth for researchers (weeks 7–10)

The subset of the audit's M2 and M3 that researchers use; the rest is paused. P2 opens with file download and PDF text: PDFs are the largest source type among the seed user's failures ([preliminary baseline](research/coos-pilot/runs/2026-09-29-preliminary-baseline.md)).

| Item | Accepted when |
| --- | --- |
| File download and PDF text (first) | CSV, XLSX, ZIP, PDF and JSON are saved as received with SHA-256 and size, without escalating to the browser, under a configurable size cap. PDF text becomes Markdown with page numbers, each passage traceable to its page. Checked on 10 real reports including the seed user's PDFs. No OCR. PDF tables marked unverified<br>**Status 2026-09-29:** implemented on branch `claude/p2-file-download`, not yet merged. PDF text was checked on all 10 corpus reports ([corpus run](research/pdf-corpus/runs/2026-09-29.md)). Through the API, these are real-site cases: 9 of the reports (F01–F08, and F11 reached by a crawl), a CSV, ZIP, JSON and XLSX (F09, F10, F15, F16), `/fc`, the browser download and JSON from a PDF. 15 of 16 passed in the [recorded run](research/parity/runs/2026-09-29-file-download.md). F03 failed on a connection timeout before any file was read, and passed when run again<br>**Status 2026-10-03:** on `main` since #69 (`f2774c6`), with the 2026-09-29 corpus run as its record; the note above predates the merge. |
| `html` / `rawHtml` / `screenshot` formats | Identical in scrape, batch and crawl<br>**Status 2026-10-02:** `html` and `rawHtml` are on `main` (#91's base). On `claude/m2-formats` are `images`, `attributes`, `removeBase64Images`, the Open Graph and Dublin Core / article metadata and the `warning` string. They are identical in scrape, batch and crawl and on `/fc` ([record](research/parity/m2-formats-live-checks-2026-10-02.md)). `screenshot` (viewport, `quality`, `fullPage` and the `screenshot@fullPage` alias) is on the same branch at `ba5bdedf`, on the browser rung alone. It is identical in scrape, batch and crawl and as the `/fc` data URI ([record](research/parity/m2-formats-screenshot-live-checks-2026-10-02.md))<br>**Status 2026-10-03:** all on `main`. `html` and `rawHtml` came in #86. The formats group (`images`, `attributes`, `removeBase64Images`, Open Graph, Dublin Core / article, `warning`, `screenshot`) came in #94. The branch named above is merged. |
| Sitemap mode, subdomains, `map` endpoint | URL list from `sitemap.xml` and home-page links, with include / exclude patterns<br>**Status 2026-10-03:** on branch `claude/m3-map`, not yet merged: `POST /v1/map` (batch A), and in batch B its options `search`, `sitemap`, `includeSubdomains`, `ignoreQueryParameters` and the crawl's `includePaths` / `excludePaths` / scope keys, `/fc/v1/map` and the local MCP `map` tool. Real-site runs: 6/6 cases for batch A ([record](research/parity/runs/2026-10-03-m3-map-endpoint.md)) and 10/12 for batch B ([record](research/parity/runs/2026-10-03-m3-map-options.md)). The two failures are python.org (MP13, MP14). There the http lane does not inflate an unsolicited gzip body, and the sitemap request loops on a self-redirect. So `includeSubdomains` there is unverified (a supplementary www.gov.uk map admitted www.nationalarchives.gov.uk). docs.python.org/3/ maps to 24 links: without a URL index the audit's 100 is not reached<br>**Status 2026-10-03:** sitemap mode and subdomains on crawls are on `main` (#96). `POST /v1/map` with its options, `/fc/v1/map` and the MCP `map` tool are on `claude/m3-map`, 7 of the audit's 9 map features solid and 2 weak ([record](research/parity/runs/2026-10-03-m3-map.md))<br>**Status 2026-10-03 (later):** all on `main` since #103 (`3cfd6a8`); the two notes above predate the merge. |
| Tables → CSV | One CSV per `<table>` with `tableIndex`, caption and source URL; 10 real table pages checked with no misaligned cells<br>**Status 2026-10-03:** the `tables` format on branch `claude/p2-research-data`. 10 real table pages, 28 tables. No shifted cell against pandas on the same HTML, and 25 equal in every cell ([record](research/parity/runs/2026-10-03-p2-research-data.md)).<br>**Status 2026-10-05:** merged in #108 |
| `maxAge` cache | A cache hit says so and gives the original fetch time<br>**Status 2026-10-03:** `maxAge`, `minAge`, `storeInCache` and `lockdown` on branch `claude/p2-cache`. A hit says `cacheState: "hit"` with `cachedAt`, the original fetch time, and carries that fetch's Evidence Record. 5 of 5 audit cache features solid, 11 of 11 live cases ([record](research/parity/runs/2026-10-03-p2-cache.md)).<br>**Status 2026-10-05:** merged in #106 |
| Custom headers, mobile viewport | Recorded in the Evidence Record<br>**Status 2026-10-03:** both options are on `main` since #91. On branch `claude/p2-cache` the Evidence Record records them as `identity.requestHeaders` and `identity.device`, shown live on httpbin.org (CA11 in the [record](research/parity/runs/2026-10-03-p2-cache.md)).<br>**Status 2026-10-05:** the Evidence Record fields merged in #106 |
| Public npm packages and a Python client | `@w2l/cli`, `@w2l/sdk` and `@w2l/mcp` published; `pip install w2l`; `w2l.batch(urls).to_pandas()` returns a DataFrame with evidence columns<br>**Status 2026-10-03:** `@w2l/cli` exists on branch `claude/p2-cli` (every API option a flag, `serve`). Packaging, the Python client and publishing are the group's part 2 ([record](research/parity/runs/2026-10-03-p2-cli.md)).<br>**Status 2026-10-05:** the CLI merged in #110, the packages and the Python client in #115. Not published: `@w2l/cli`, `@w2l/sdk` and `@w2l/mcp` answer 404 on npm and `w2l` on PyPI (checked 2026-10-05)<br>**Status 2026-10-05 (later):** published as 0.3.0 under the Octocrawl names (#207, #208): `npx octocrawl`, `@octocrawl/sdk`, `@octocrawl/mcp`, `pip install octocrawl-client` (`octocrawl_client.batch(urls).to_pandas()`). Each was installed from the registry and run in a clean directory. |
| Cross-platform service | `w2l serve` stays up on Windows<br>**Status 2026-10-03:** on branch `claude/p2-reliability`, a `windows-latest` CI job runs `npm run verify:serve-smoke`. In it `w2l serve` scrapes a page and a PDF and is stopped mid-batch (a forced kill on Windows). It then restarts on the same task root and resumes the batch to one item per URL. Windows acceptance is that CI job alone (decided 2026-10-03). The one-line install on Windows waits for publishing.<br>**Status 2026-10-05:** merged in #120 |
| Batch reliability | 1,000 URLs over 20 domains, `kill -9` mid-run, then resume: 0 lost, 0 duplicated<br>**Status 2026-10-03:** on branch `claude/p2-reliability`, `npm run verify:batch-crash-1000` runs on 20 loopback host names (the gate decided on 2026-10-03), in the Linux CI job. It passed 8 of 8 checks on `0146d28`, killed at 400 of 1,000: 0 lost, 0 recorded twice, 0 extra fetches in that run. Pages in flight at the kill are fetched again, at most one per worker; other runs had up to 8 ([record](docs/benchmarks/2026-10-03-batch-crash-1000.json)). The reference run on 20 real domains is not done.<br>**Status 2026-10-05:** merged in #120 |
| Throughput benchmark | HTTP lane, 32 concurrent across origins: ≥500 pages/min, p50 <800 ms; browser lane, 8 contexts: ≥60 pages/min, p95 <8 s; results in `docs/benchmarks/`<br>**Status 2026-10-03:** on branch `claude/p2-reliability`, `npm run bench:throughput` ran twice on `80997b9`, on a loopback site (80 to 300 ms per response). The HTTP lane did 3,460 and 1,880 pages/min (p50 460 and 715 ms). The browser lane did 523 and 525 (p95 987 and 983 ms). Real networks, Linux and Windows are not measured ([report](docs/benchmarks/2026-10-03-throughput.md)).<br>**Status 2026-10-05:** merged in #120 |
| Two guides | "URL list → CSV with evidence" (data-centre sources as the example) and "Citing web data in a paper"<br>**Status 2026-10-03:** both written on branch `claude/p2-guides`: [url-list-to-csv.md](docs/guides/url-list-to-csv.md) and [citing-web-data.md](docs/guides/citing-web-data.md). They come from a real run of ten of the seed user's public sources through the command line and the Python client: 6 read, 4 not, each with its reason ([record](research/parity/runs/2026-10-03-p2-guides.md)). For the guide, `w2l --out` now writes `results.csv`, the Python client's evidence columns. A non-author has not followed them yet.<br>**Status 2026-10-05:** merged in #123 |

**Exit:** 25 of the core 29 are solid; the seed user runs a regression on data Octocrawl produced; a non-author installs Octocrawl on a clean machine and completes a first batch unaided.

### PA · Enhanced access

Decided 2026-10-05: enhanced fetching as a product capability, built on maintained open-source projects and providers, not an in-house anti-bot stack. [ADR 0005](docs/adr/0005-enhanced-access-policy.md) sorts every capability into never (no grant enables it), deferred (the [Paused](#paused) rows below, with their restart conditions) and grant (off unless the user's grant names it, and recorded when used); it comes before any new executor. Order: the policy, then the task set, so each later item is measured against it. An item is accepted when its real-site record passes, with command, commit and proxied/direct. Reused code keeps its licence: each project's licence is checked against the AGPL core and the MIT SDK before its code enters the repository, and GPL code is reference only.

| # | Item | Accepted when |
| --- | --- | --- |
| 1 | Failure taxonomy and a blocked-task set | A frozen set of at least 40 real tasks that fail today, from both audiences: public pages, product lists with pagination, dynamic pages, authorised logins. Each task has a data check that decides whether it is verified; a status alone never does. The set is run in two windows on different days before freezing. A task the windows disagree on is marked unstable and kept. Each attempt records what was observed, which intervention worked, and the suspected cause, with whether it was isolated. Causes are TLS/HTTP fingerprint, IP or rate, JS challenge, CAPTCHA, login, or unknown. Switching executors changes several variables at once, so a route that works is not proof of the cause. Unknown stays unknown. Beside it, the existing batches as healthy controls and a blind set no routing table is built from. The set stays in the denominator from then on |
| 2 | Browser-compatible HTTP transport | A second HTTP executor beside the current one, on a maintained library (`apify/impit`, Apache-2.0, first; `curl-impersonate`, MIT, as fallback), with a few tested browser profiles named with library and profile versions. It goes through the same URL checks, redirect limits, size caps, proxy rules, robots.txt and Evidence Record as today, and records the profile used. Installed by `npm`/`npx` alone, with no Python for the user. It keeps lane `http` and is told apart in the Evidence Record's `access` block, so clients that know today's lanes keep working. Used automatically only for hosts where item 1 shows it helps, until route memory with expiry replaces that list; its run shows no regression on batches 1, L, F and tables |
| 3 | Access sessions and proxy management | Network sessions (egress, cookies, transport profile) and browser sessions (a live context kept across steps) have a lifecycle: created, reused, expired, revoked, restored from a checkpoint. A list task that fails at page N resumes there with no lost or duplicated records, and a challenge at page N pauses, is handled or handed to the person, is verified at page N, and continues. Nothing moves between executors inside an established interactive session. The user brings one proxy, a list or a provider endpoint; `HTTPS_PROXY` keeps working. A session binds egress, cookies and profile for one site and task; failed egresses cool down; switching is bounded and happens on an explicit failure. Per-host pacing, robots.txt and budgets do not reset when the egress changes; a 429 is never answered by switching egress and continuing; a logged-in session never moves to another region or provider by itself. Every result records `proxyUsed`, the session and the location. Replaces P5's former proxy-pool item |
| 4 | Vendor fallback with a budget | The existing Browserbase and Steel lane evaluated first, under ADR 0005 grants; another provider only for a class of tasks it leaves. The provider is matched to what the task needs (HTML only, or a browser that runs actions and keeps a session). Spend is reserved before each call and settled after, in one ledger per run that retries, solving and vendor calls share. So concurrent workers cannot overrun the cap. A provider with no price upper bound is not called. Providers go through the existing vendor lane (`vendorId`), used only when the user allows it, under a per-request and per-run budget. The ledger is also kept per API key, so hosted credits ([PH](#ph--hosted-octocrawl)) settle vendor spend from the same entries. The record carries the provider, attempts, cost when the provider gives it, and the verified result. A provider's "success" is never taken as verified content |
| 5 | Enhanced browser executor (experimental) | Patchright (`patchright-nodejs`, Apache-2.0) as an optional executor in Octocrawl's own browser instance and profile, behind the `enhanced_browser` grant and refused on a hosted server; stock Playwright stays the default. Compared early with stock Playwright on item 1's set (net verified tasks, latency, compatibility), and adopted only on a net gain on the blind set. Actions, frames, downloads, screenshots, logins, timeouts and cancellation, crash recovery and the Evidence Record pass on it in the `actions`, `actions-real`, `lists`, `list-records` and `list-detect` batches; it can be enabled, disabled or pinned per site. The person's own Chrome is never patched. Camoufox only if Patchright leaves a clear class of tasks unsolved |
| 6 | Third-party CAPTCHA solving (conditional) | A challenge is watched for through the whole task (later navigations, pop-ups, forms loaded later), not only the first page load. A provider's built-in solving is used first, under the `vendor_captcha_solving` grant. An own solver adapter is started when item 1 shows CAPTCHAs remain a leading cause after that. There is one solver adapter, with the user's key or a platform quota. It covers only the CAPTCHA types its acceptance run covers, with limits on attempts and spend. The page is verified after the solve. Tokens are never logged. The minimum is sent to the solver, and never the login state. At its limits the task pauses, is handed to the person, or ends. Handoff stays the default |
| 7 | One simple entry for people who do not program | Three choices instead of technical switches: standard (no third-party cost), enhanced (within an approved budget and scope) and my browser (the person's own Chrome, item 8, and handoff). Developers get the per-route options |
| 8 | `my-browser` lane over Chrome remote debugging, for pages that need the person's login or address | On a server running on the person's machine, `lane: "my-browser"` opens and reads the page in the person's own Chrome, through the handoff reader (I6). It works on MCP `scrape` and `batch_scrape`, `POST /v1/scrape` and batches, without waiting for Octocrawl to be stopped first. It is the route for pages that need the person's login or their own network address: a region, an office or home network, a site that refuses data-centre addresses. It is not a route past bot checks. While remote debugging is on, every page sees `navigator.webdriver` as `true` (seen 2026-10-07). So a site whose check looks at it refuses the person's Chrome as it refuses Octocrawl's own lanes; items 4 and 5 are the routes there. Per connection the person clicks Chrome's Allow, then Allow reading these sites in the page Octocrawl opens, which lists the sites and the task. It can be revoked there. Same output shape as the other lanes, recorded as lane `my_browser`. Results count completion apart: unattended on a public page, by an authorised session, in the person's browser, or handed to the person. Refused by name in hosted mode, and with actions or a screenshot until they are checked in that lane. Checked on a set of 10 real pages chosen because they need the person's login or address, at least two of them behind their login. Checked on macOS, with Windows and Linux recorded as not checked. Every page of the set stays in the record's denominator, a bot check's refusal included. P3's extension stays the route for queue mode without an Allow per connection |
| 9 | Competitor baseline | Firecrawl Cloud and one interactive enhanced-access service run item 1's set beside Octocrawl's standard and enhanced routes. They run with the same freshness, region, authorisation, data checks and budget. Measured: verified completion, false success, help from the person, latency and cost per 1,000 verified results. Octoparse's configure-and-run flow is compared on five list tasks. The baseline comes first; the gap that matters to the audience is agreed after, not assumed. Firecrawl Cloud's cost per 1,000 verified results on this set is also PH's reference for what a credit should buy. Re-run weekly on the healthy controls and a rotating slice of the set |
| 10 | Task verification apart from the fetch status | A request can carry what its task needs: fields, records whose fields belong together, a table's shape, or that an empty result is acceptable (a search with no hits). The result then says `verification`: `passed`, `failed` with the checks that failed and why, or `not_requested`. It carries the contract's hash and the verifier's version. A request without a contract answers as today, with `not_requested`. Item 1's task predicates, run as contracts inside the product, give the runner's own verdict on every task of the set. A result whose contract failed is never counted as delivered: false-success counts and route history read the verification, not the status. Recorded on item 1's set and on the my-browser pages behind a login |
| 11 | Readiness of the region a task needs | The wait is for that region, not the page. Ready means a container, the records in it and their required fields present and stable across reads, or an explicit empty state. The wait is bounded, and goes through the existing browser settle, actions and list steps. A result that is not ready says which of three it was: not loaded yet (wait or act in the same session), loaded but not extracted (an extraction fault: no paid retry), or not served (route, access or region). Accepted when these are told apart on real pages, with no regression on item 1's healthy controls and the real-site batches. The pages: an x.com page read before it had loaded, Tesla's inventory shell, OECD's table, WSJ's market data |

The next round, from Howard's audit of 2026-10-19, is tracked in [docs/pa-enhancement-tasks.md](docs/pa-enhancement-tasks.md): phases, tasks, acceptance and the decisions still open.

**Status 2026-10-09**, from the records (an item is accepted when its real-site record passes):

- 1: accepted. 92 tasks frozen on 2026-10-06 (#216, [tasks.v1.json](research/access/tasks.v1.json)): 50 frozen, 25 healthy, 3 unstable, 14 blind.
- 2: accepted in two windows (#268) and on by default for the five hosts where it helped (#274). Verified tasks rose from 34–37 to 40–42 of 92, and false successes from 16 to 22 and from 14 to 25 attempts, so it is not on for every host.
- 3: sessions, the egress pool, a list resumed at page N and a list continued in the person's Chrome after a check are merged (#239, #242, #247, #276–#283). The location of every pool egress, a run on three real exits, and a list continued past indeed.com's check at page 2 (verified, pages 2 to 5 shown by the person) are in #284: one window, one machine, one site. Not measured: per-host pacing and budgets across a switch, and a logged-in session's region.
- 4: under way. Merged: a spend ledger with price ceilings (#293), every paid provider call on the Evidence Record (#294), the Steel lane under a grant (#295), and a ladder that goes on to its next rung for more failures (#298). The run on all 92 tasks with `access: "enhanced"`, after the wait for pages still loading (#310) ([record](research/access/runs/2026-10-09-pa4-steel-all-loading-76a1c70.md)):
  - 47 verified, 12 of them frozen; 16 false successes;
  - 30 paid calls, 6 of whose pages were verified answers;
  - $0.1000 charged by the ledger, an upper bound since Steel states no price per call;
  - before #310: 45 verified and 16 false successes ([record](research/access/runs/2026-10-09-pa4-steel-all-06b9354.md)).
  - Open: Steel's own bill against the ledger, the provider's built-in CAPTCHA solving (not on), and the remaining false successes ([diagnosis](research/access/runs/2026-10-09-pa4-steel-false-success-diagnosis-06b9354.md)).
  - 2026-10-11: a grant may buy the provider's residential proxy and built-in solving at a known ceiling (#388, #397, #400, [ADR 0005](docs/adr/0005-enhanced-access-policy.md) as revised that day): `vendor_residential_proxy`, tariffs with `perGbUsd` and `maxBytesPerCall`, `perSolveUsd` and `maxSolvesPerCall`, the bytes a page receives counted over CDP and the session ended past the cap, the charge settled on the provider's own figures after release, and each paid call's `proxyBytes`, `solves` and `proxyCountry` on the record. Measured the same day on the 23 tasks a competitor verified in window 1 and Octocrawl did not on 2026-10-11 (the 25 less the two blind ones), one change per arm, each arm reconciled against Steel's session list in its record ([D](research/access/runs/2026-10-11-pa4-3arm-d-control-e3b9d37.md), [A](research/access/runs/2026-10-11-pa4-3arm-a-residential-e3b9d37.md), [B](research/access/runs/2026-10-11-pa4-3arm-b-residential-solve-6021174.md), [C](research/access/runs/2026-10-11-pa4-3arm-c-webshare-d65614d.md)):
    - D, the 10-11 grant (Steel, no proxy): 1 verified, 1 false success, 17 paid calls, $0.010 on Steel's figures.
    - A, with Steel's US residential proxy: 3 verified, 3 false successes, 16 paid calls, 46.3 MB through the proxy, $0.476.
    - B, A with Steel's built-in solving: 2 verified, 1 false success, 17 paid calls, 43.7 MB, $0.448. Steel solved nothing: these pages set no CAPTCHA its solver takes.
    - C, the operator's own residential gateway on the local rungs (the 2026-10-09 configuration) and no provider: 4 verified, 1 false success, no paid call; the gateway's bandwidth is not counted.
    - Reading, not isolated: the exit is not the main barrier (18 of 23 `not_served` in every arm: Cloudflare challenges and bot checks), and where it is, the operator's gateway on the local rungs did what Steel's residential proxy did and more, at $3.50 a GB against $10 and no session time. The differences between arms are of the size of the sites' day-to-day variance. So Steel's proxy and solving stay off by default, the provider rung stays for what the local rungs cannot reach, and the next PA work is the challenge pages and bot checks, not the exit.
    - Found and fixed on the way: Steel fills `proxyBytesUsed` after the release (#397) and answers its captchas status with 404 some time after it (#400). Still open: the remaining false successes (T060 in every arm), the gateway's bytes, and a second window on another day.
  - 2026-10-12: the challenge pages and bot checks, attributed and tested ([task list](docs/pa-challenge-botcheck-tasks.md), #423, #426, #429, #431, #435). The 16 tasks two full enhanced runs answered with `cloudflare_challenge` or `bot_detected_generic` (14 of them verified by a competitor in window 2):
    - Attributed from the gate's signals, now kept with `--save-responses` ([standard](research/access/runs/2026-10-12-pa-gate-signals-standard-56f9a0d1.md), [enhanced](research/access/runs/2026-10-12-pa-gate-signals-enhanced-56f9a0d1.md)): Cloudflare on 8, DataDome on 7 (economist.com runs both), no vendor header on 2 (imdb, imf.org). Every one refused already on the HTTP rung, on the local browser and on Steel's.
    - A five-arm library probe from the operator's residential gateway ([record](research/access/runs/2026-10-12-library-probe-16-b117b451.md)): 13 refused by undici, both impit profiles, stock Playwright and Patchright alike; T002 served to every arm (the exit's reputation, which the gateway already fixes); T053 served to both browsers and refused to every HTTP client.
    - T053 isolated ([record](research/access/runs/2026-10-12-t053-identity-204c8a76.md)): imf.org's edge (Akamai) refuses a headless Chromium that claims Google Chrome, Octocrawl's standard identity, in every combination tried, and serves the same browser when it says what it is. `W2L_BROWSER_IDENTITY=actual` (#431) sends the browser's own identity and declares it: T053 verified 3 of 3 through the gateway, the other 14 unchanged ([record](research/access/runs/2026-10-12-pa-gate-signals-actual-identity-204c8a76.md)). On all 92 tasks the same day it verified 32 against the declared identity's 44, gaining T053 and losing 13, six of them healthy controls ([declared](research/access/runs/2026-10-12-identity-ab-declared-2df8207d.md), [actual](research/access/runs/2026-10-12-identity-ab-actual-2df8207d.md)). So the default stays; the switch is opt-in, a per-host route choice once route memory has that dimension.
    - Reading: within ADR 0005's means (an exit, a browser-compatible transport, a real browser, Patchright, a provider's residential proxy and solving, an honest identity) the Cloudflare and DataDome checks on these sites hold; the competitors pass them with browsers of their own, which ADR 0005 defers. The one route not yet measured is a provider's stealth browser (Browserbase `verified`, its first real-key run), waiting on a key and its plan. Until then this class is recorded as not solvable inside the current means, and the bar's gap on the frozen set stands at 12.
    - 2026-10-13: that route cannot be measured on Howard's Browserbase account. On the free plan, a session asking for `verified` is refused with 403, "Verified mode is only available on the Enterprise plan"; a session without it is created, so the key works ([record](research/access/runs/2026-10-13-t22-browserbase-verified-3d6b661c.md)). The task list's T2.2 is skipped as its precondition says. The class stays not solvable inside the current means, and the gap stays at 12, unless an Enterprise plan is bought.
  - 2026-10-12, later: the 92 tasks on main after the T006 fixes (#442, #443), and the region wait's scrolling. All runs were proxied, with `access: "enhanced"`, contracts and the Steel datacenter grant. The product's verification agreed with the runner's on 92 of 92 in each.
    - On main `48fd6e17` ([record](research/access/runs/2026-10-12-pa4-92-main-48fd6e17.md)): 53 verified, 20 of them frozen, and 5 false successes, against 54 at `b117b451` the same day. T006 was verified, with its check changed in #442. T008, T011, T019, T073 and B004 were lost, none isolated.
    - T019 (Costco) was a false success. Its page settled late and the region wait scrolled 2 screens before its 10 s ran out, and it was labelled `not_served`. #448 labels a wait that ran out while scrolling, before the page's end, as `not_loaded` with `scroll_unfinished`: the rest of the page was not read. The ladder treats both alike, so no route changes. T031 (Temu) was answered with a sign-in overlay that has no password field, taken as content. Not changed.
    - An A/B gave the scrolling 10 s of its own, one change, the same evening ([A](research/access/runs/2026-10-12-scroll-ab-a-85513eba.md), [B](research/access/runs/2026-10-12-scroll-ab-b-f73d95b7.md), [recheck](research/access/runs/2026-10-12-scroll-ab-b-recheck-f73d95b7.md)). A, #448's code: 56 verified (20 frozen, 25 of 25 healthy), 3 false successes, $0.0226. B: 53 verified (19 frozen), the same 3 false successes, $0.0404.
      - T019 settled early in both arms and was verified in both.
      - B's losses of T021, T030 and T050 came from Steel's `provider_error`. All three were verified on B's code in a recheck.
      - No gain is set down to the change, so it was not merged (#450 closed). It is to be tested again when a full run shows `scroll_unfinished`.
    - Two runs whose code differed only in readiness labels, `48fd6e17` at 11:55Z (53) and A at 14:29Z (56), differ by as much as the A/B did. The variance between days noted above shows within a day too.
- 5: built and opt-in (#224); the A/B showed no reproducible gain (#229), so it is not adopted. Rechecked on 2026-10-12 through the operator's residential gateway, as a library probe on the 16 challenge and bot-check tasks: Patchright's answer matched stock Playwright's on every one ([record](research/access/runs/2026-10-12-library-probe-16-b117b451.md)), so the product run (the task list's T2.1) was not made.
  - 2026-10-13: other browsers, as a library probe on the same 16 tasks, headed, through the Clash data-centre exit and the Webshare residential gateway ([record](research/access/runs/2026-10-13-library-probe-stealth-16-8c91ac43.md)). Tasks whose data checks held:

    | Browser | Clash | Webshare |
    | --- | --- | --- |
    | nodriver: the installed Chrome over raw CDP; AGPL and Python, a measurement oracle only | 11 | 8 |
    | Camoufox: Firefox, npm `camoufox` | 7 | 7, a different seven |
    | Headed stock Playwright, the control | 1 | 3 |

    - 12 of 16 were reached by some arm. T005, T045, T048 and T068 held against all.
    - Headed alone does not explain it. Which of nodriver's differences does is not isolated.
    - Headless, repeat runs and a Node implementation are not shown.
    - Whether to build the raw-CDP approach into the product touches ADR 0005's deferred "second stealth engine" and is Howard's decision.
  - 2026-10-13, later: the same approach from Node, the installed Chrome over raw CDP with no dependency ([record](research/access/runs/2026-10-13-library-probe-cdp-16-b8d4efaa.md)), through the Clash exit.
    - It reached **13 of 16 headed** (T048 crunchbase included, never reached before) and 1 of 16 headless. Only T005, T045 and T068 held headed.
    - Chrome must be launched as nodriver launches it (`--remote-debugging-host=127.0.0.1` and a fixed port): with `--remote-debugging-port=0` Cloudflare's challenge held on T002 in 9 tries, with no CDP connected. The cause is not isolated.
    - A hosted run would need a virtual display (Xvfb), which is not tried.
    - Repeated the same day ([record](research/access/runs/2026-10-13-library-probe-cdp-repeat-44e9498e.md)): 11 of 16 through Clash, the same 11 in both runs, and 9 through Webshare. T048 and B008 passed once of the two Clash runs.
    - **Decided 2026-10-13 by Howard:** the route enters ADR 0005's grant class as `installed_chrome`: enhanced, attested, local only, headed, a fresh temporary profile per task, the measured launch with its DevTools port closed to pages (no `--remote-allow-origins`, a free port the driver picks: 12 and 13 of 16 on 2026-10-14, [record](research/access/runs/2026-10-14-library-probe-cdp-safe-launch.md)), at most 2 windows at once, and a weekly re-run on the 16 tasks ([ADR 0005, revision of 2026-10-13](docs/adr/0005-enhanced-access-policy.md)). Built on 2026-10-14 as its own rung after `browser_local` (`packages/bench/src/ladderCli.ts`, [ADR 0005, implementation of 2026-10-14](docs/adr/0005-enhanced-access-policy.md)) and released in 0.5.0 ([CHANGELOG](CHANGELOG.md)). Acceptance on 2026-10-14 ([record](research/access/runs/2026-10-14-installed-chrome-acceptance-7b56397b.md)): the final commit passed 11 and 7 of the 16 tasks in two runs; the probe taking over Chrome through Playwright passed 12 in both. Open: the weekly re-run on the 16 tasks is not scheduled (item 9), and choosing the exit by a host's detection type is not built until a paired run settles the conflicting exit records ([task list](docs/pa-enhancement-tasks.md), K3). `camoufox` stays deferred.
- 6: the first step, the provider's built-in solving under `vendor_captcha_solving`, was measured on 2026-10-11 (item 4's arm B): it solved nothing on the 23 candidate tasks, whose blocks are challenge pages and bot checks rather than CAPTCHAs its solver takes. The own solver adapter is not started, as the item says: item 1's set does not show CAPTCHAs as a leading cause.
- 7: built (#259). `standard` and `enhanced` were checked on real pages, on one server holding a Steel grant, with ten tasks: six the provider had verified, and four healthy controls.
  - `standard`: 4 verified, no paid call, no provider rung tried ([record](research/access/runs/2026-10-09-pa7-standard-4870528c.md)).
  - `enhanced`: 9 verified, no false success, 6 paid calls, $0.0200 charged by the ledger against the grant's run budget of $1 ([record](research/access/runs/2026-10-09-pa7-enhanced-4870528c.md)). A server without the grant refuses `enhanced` by name.
  - `my-browser`: five pages behind the person's login were all read in their Chrome as lane `my_browser`, and 3 verified ([record](research/access/runs/2026-10-10-pa7-my-browser-13e2174.md)). An x.com page was read before it had loaded (verified on a second read). github.com's signed-in home keeps the content earlier runs verified in a `<main>` it does not show, which the lane no longer reads since #315.
- 8: accepted (#297) on ten pages behind the person's login, on macOS; Windows and Linux not checked. Round 1 read 9 of 10 and verified 4: five checks named text the Markdown drops ([record](research/access/runs/2026-10-09-my-browser-final-26dba3e.md), kept in the denominator). Round 2, with checks revised from round 1's structure and not its content, read 10 of 10 and verified 9 ([record](research/access/runs/2026-10-09-my-browser-final-round2-b6c7524.md)). The tenth, a Lark sheet, was `success` with the text of a help panel the page hides. The lane now reads a page's content as it shows (#315). A sheet's cells, drawn on a canvas, are not in the page to read. A page not read says why (#292, #303, #308).
- 9: window 1 recorded (#291, [record](research/access/runs/2026-10-09-pa9-w1-baseline-3cde6e8.md)). On the 50 frozen tasks Octocrawl verified 2 by default and 6 by its best route, Firecrawl Cloud 35 and ZenRows 29; on all 92, 36, 38, 70 and 58, with 9, 7, 12 and 19 false successes. Octocrawl's best route through a residential exit verified 8 of the 35 tasks Firecrawl verified and it did not ([record](research/access/runs/2026-10-09-pa9-w1-octocrawl-best-residential-094c6d6.md)). Window 2 recorded on 2026-10-11 UTC (#416, [record](research/access/runs/2026-10-12-pa9-w2-baseline-782bb64.md)): Firecrawl Cloud 67 of 92 (33 of the 50 frozen, 14 false successes, 81 credits), ZenRows 60 (28 frozen, 18 false successes); the two windows agree on 87 and 86 of the 92 tasks. Octocrawl's enhanced runs of the same UTC day verified 55 (19 frozen) without a residential proxy and 56 (21 frozen) with Steel's (#412), 5 false successes each, so the frozen-set gap to the best competitor is 12, down from window 1's 29, with the fewest false successes. Of the 22 tasks Firecrawl verified and Octocrawl did not, 7 are Cloudflare challenge pages and 6 generic bot checks on Octocrawl's side, 15 of them listings; 12 tasks no arm verified. Decided 2026-10-20 by Howard (decision 7 in the [task list](docs/pa-enhancement-tasks.md)): a weekly script runs one set of 51 tasks (the 25 healthy tasks, the 16 challenge tasks and a rotating slice of 10 frozen tasks) on three kinds of arm: Octocrawl's free arms, a Steel enhanced arm under the datacenter grant, and Firecrawl Cloud and ZenRows. The gap figures are refreshed every week from it; the formal two-window comparison (task K1) is run separately. The script is not built or scheduled yet (task P0.4).
- 10: accepted on 2026-10-11, on three records. Built in #360, #366, #370 and #373 under [ADR 0006](docs/adr/0006-task-verification.md) (#355).
  - What it does:
    - A request may carry a task contract, `verify`. Every result then says `verification`: `passed`, `failed` with its reason and checks, or `not_requested`. The fetch's own status is left unchanged.
    - REST, MCP, the CLI and the SDKs take it.
    - With a contract, the ladder stops at a page that passes, and goes on from one that fails as its readiness (item 11) says.
    - Route history counts verified pages, and batch and crawl status count `verified` and `verificationFailed`.
  - Item 1's 92 tasks, sent as contracts: the product's verification agreed with the runner's on 92 of 92, in both of item 11's acceptance runs ([control](research/access/runs/2026-10-11-pa11-acceptance-steel-40b2558.md), [ladder](research/access/runs/2026-10-11-pa11-acceptance-ladder-steel-1a75770.md)).
  - Item 8's ten pages behind the person's login, one scrape each with its contract: agreed on 10 of 10, and 8 verified ([record](research/access/runs/2026-10-11-pa10-my-browser-contract-e5a28d9-run2.md)).
    - github.com's signed-in home and the amazon.sg address page read `not_extracted`: their checks held on the whole document and failed on the page as shown (#315). Not isolated.
    - The first attempt found the lane hanging on Gmail, which requires Trusted Types, until the read's wait ran out. Fixed in #378.
- 11: accepted on 2026-10-11, on four records, all proxied. Built in #363 and #369 under [ADR 0007](docs/adr/0007-region-readiness.md) (#358). Every result says `readiness`: `ready`, `not_loaded`, `not_extracted` or `not_served`, with its basis and how long it waited. With a task contract, the browser lanes wait up to 10 s for its region on the live page.
  - All 92 tasks with each task's contract, the ladder reading readiness (#370, #373): 55 verified and 5 false successes, against 53 and 8 in the same day's control run ([record](research/access/runs/2026-10-11-pa11-acceptance-ladder-steel-1a75770.md), [control](research/access/runs/2026-10-11-pa11-acceptance-steel-40b2558.md)).
    - Every `ready` is a verified task; each false success is `not_served`. The product's verification agreed with the runner's on 92 of 92.
    - 35 paid calls, $0.0213 charged by the ledger; 10 verified tasks took a paid call's page as the answer. Of the six tasks the new reading sent on to Steel, five found their data missing there too.
    - Of the net two gained, T006 is the ladder's. T051 and T052 met no challenge this time and T031 was lost; neither is isolated.
  - The four pages:
    - WSJ's market data: verified after its region held in 1.2 s.
    - Tesla's inventory shell: `not_loaded` (`little_text`), told apart from a page not served.
    - OECD's table: `not_served` (`region_absent`). It appears only after a click that no signal on the page shows.
    - x.com: read before it had loaded on 2026-10-10, it was read after the my-browser lane's settle wait and verified ([record](research/access/runs/2026-10-11-pa11-my-browser-f1432da.md)).
  - No regression: item 1's 25 healthy tasks verified 25 (23 in the control run). The real-site batches passed 180 of 207 cases, against 177 at `3e103bc5`. One case is worse, AR05, a list step with no contract; why is not isolated ([record](research/parity/runs/2026-10-11-pa11-health-all-proxied-49033bb0.md)).
  - Not shown: a page the region wait itself kept from being read early. L3 was read early in a batch without a contract. Run again with one, its region held on the first two reads, so the wait made no difference there.
  - Open: T073 is `not_extracted`, its region held on Steel's page and no main content extracted. T076 skipped Steel after its robots.txt rule was set aside on the local rung, inferred from its result; the runner keeps no ladder trace.

- The exit's no-regression check, 2026-10-10: all 207 real-site cases at `3e103bc5`, proxied. 177 passed, against 182 and 181 in the last full runs (`f052375`). Each of the seven that passed there and failed here fails the same way on `f052375` today, so none is a regression of the code ([record](research/parity/runs/2026-10-10-health-all-proxied-3e103bc5.md)). Found there: a crawl's status poll after a mid-run `/pages` read can be reset (`ECONNRESET`), on both commits.

**Exit:** see the Phases table.

### PH · Hosted Octocrawl

Decided 2026-10-06, after reading how Firecrawl, Crawl4AI, Steel, Browser Use, Skyvern, Apify, Jina and Octoparse split "run it yourself" from "our cloud" ([plan record](docs/launch/2026-10-06-hosted-feasibility.md)). Every one of them keeps the open-source or local path free and unmetered. Each sells the hosted service by usage, with one API key in a header, and connects MCP clients to one remote URL. What the cloud adds is running while the computer is off, scale, and the access routes PA builds (proxies, enhanced browser, CAPTCHA solving). Octocrawl follows that shape. The local path stays free and complete; the hosted service is the paid product, metered in credits as Firecrawl does.

Hosted phase 1 uses the API's existing hosted mode, which refuses private addresses, robots overrides, logins, handoff, local proxies and non-HTTPS webhooks. It runs on a second Cloud Run service beside the public preview, with the Firestore quota pattern and the Cloudflare Worker already in use. `@octocrawl/mcp` is already a thin client of the API (`--base-url`, `--token`), so the npm package does not change. PA's routes are not used by phase 1; they become the hosted service's paid access tier in phase 2, under per-key grants and budgets. Hosted mode keeps obeying robots.txt for every URL.

**Credits.** These are starting values. They are to be checked against PA item 9's cost figures and the first two weeks of billing before P4 prices them.

- One credit per page read over HTTP; five per page on the browser lane; one per `map` call. Phase 2's vendor-backed routes settle their provider cost plus margin from the same balance.
- Keyless: scrape and map over HTTP within a per-IP daily allowance, and 429 with `Retry-After` beyond it. The allowance is about 20 pages a day, under the $50 monthly cap set on 2026-10-06.
- With a key: 1,000 free credits a month and the browser lane. Paid packs come in Firecrawl's bands (Hobby about 5,000 credits, Standard about 100,000), through a merchant of record.
- Keys are issued by hand from the waitlist in phase 1; self-service sign-up and purchase are P4.
- **Changed 2026-10-11 by Howard: accounts and credits come now, before P4.**
  - Sign-in on octocrawl.dev with GitHub, Google or an email link. It is written in this repository, with no identity vendor, and the site's CSP stays as it is.
  - An account page shows the balance and usage, and creates and revokes keys. Keys issued by hand keep working on their daily allowance.
  - Every account gets 1,000 credits a month, email-only accounts included. One grant goes to each GitHub account, Google account and verified email.
  - A result is charged by what it returned: 1 credit for a page read over HTTP, 5 for a page read on the browser lane, 1 for a `map` call, and 1 for a page that does not exist (404 or 410). A page stopped by a check, a challenge or robots.txt costs nothing, and so does a call that read nothing (a DNS failure, no response, an invalid request, a server error).
  - Accounts' keys get the browser lane. Keyless use keeps its daily allowances.
  - Payment stays in P4 and waits for item 3's two-week cost record. Where the seller is registered is not decided yet.
- **Added 2026-10-16 by Howard: MCP connections by OAuth (item 6, [task list](docs/mcp-oauth-tasks.md)).**
  - The reason: ChatGPT cannot send an API key, and claude.ai's static headers are a beta for a few organisations. People who use those clients today get only the keyless allowance and cannot spend their account's credits. Any client that follows the MCP authorization spec can use the same route, Claude Code, Cursor and VS Code included.
  - The authorization server is written in this repository on octocrawl.dev, beside sign-in, and keeps its records in Firestore under HMACs as keys are kept. Cloudflare's `workers-oauth-provider` is not used, because it would keep tokens in the Worker's KV, away from sign-in and credits.
  - OAuth gets its own URL, `https://mcp.octocrawl.dev/mcp-oauth`. `/mcp` stays as it is: keyless, or a `Bearer oc_` key. Claude starts sign-in only on a 401, so one URL cannot serve both.
  - Each connection gets its own key record. Its calls spend the account's credits and are logged on their own, and the account page can disconnect it. Connections do not count against the five keys; an account holds at most 10. A connection stays until it is disconnected or goes 90 days unused.
  - **Accepted 2026-10-16** ([record](research/hosted/2026-10-16-mcp-oauth-clients-adee17f2.md), [task list](docs/mcp-oauth-tasks.md)). Claude Code, a claude.ai custom connector, ChatGPT and Cursor each connected to `/mcp-oauth`. Each ran a scrape that was charged to the connection's own key, and each was refused after a dashboard disconnect. Claude Code, claude.ai and ChatGPT used metadata documents; Cursor used registration. ChatGPT and claude.ai are web apps that show no version number, so the record gives their server-side user agents instead.

- **Proposed 2026-10-18, not yet decided: the cloud feature plan and the business plan.** Both are research proposals for Howard's decision; nothing in them changes the items or exit below until he decides.
  - [Cloud feature plan](docs/launch/2026-10-18-cloud-feature-plan.md): 22 competitors' cloud features, demand evidence, a technical audit and a staged architecture.
    - Positioning: a web-data backend for agents and small teams. Crawl, batch and parallel jobs that finish in the cloud, results kept and exportable, webhooks, and a results grid where every cell links to its Evidence.
    - Parallel jobs: per-account limits per lane, per-job limits, and per-host politeness across all tenants.
    - Visual canvas: the results grid is the main one, after a job progress page. No self-built node-based workflow canvas; an n8n node and linear pipeline templates instead.
    - Teams: `workspace_id` on every table from the start. Invites and roles come with billing, and free credits stay per person.
    - An Alexandria-like catalog comes later, as verified adapters with their pass rates. It sits in the Paused row for hosted agent and deep research until Howard reopens it.
    - Step 0, before building: 30 days of logs (2026-10-18) showed no external demand yet (34 refused hosted crawl or batch calls, mostly our own curl; account usage from two accounts, both the author's). So first come the two-week cost record (item 3), Cloud Run browser seconds per page, egress success from Cloud Run against Webshare, how agent clients poll async jobs, and a Postgres queue spike. Then a small hosted batch and crawl (up to 1,000 URLs). Then the full worker-pool foundation.
  - [Business plan](docs/launch/2026-10-18-hosted-business-plan.md): 15 competitors' pricing verified on 2026-10-18, our cost per operation and margins (estimates), and a 12-week plan.
    - Recommendation: before any checkout code, confirm the seller entity and a merchant of record's written acceptance, test willingness to pay with a fake-door pricing page and interviews, and compare hosted against Firecrawl and the local path on the same tasks.
    - Proposed starting point for P4: one-time credit packs; the browser page from 5 credits to 2 with a 30 s render budget; search only through a provider that allows resale, or the user's own key. Pricing waits until the cloud features are planned (Howard, 2026-10-18).

| # | Item | Accepted when |
| --- | --- | --- |
| 1 | Hosted API and remote MCP, phase 1 | `POST /v1/scrape` and `/v1/map` and the MCP tools `scrape`, `map` and `scrape_product` served at `api.octocrawl.dev` and `mcp.octocrawl.dev` from one process in hosted mode; every other route and tool refused by name with an `agentHints` entry that says to run it locally. Keyless calls use the HTTP lane only; a key enables the browser lane at concurrency 1. Connected from Claude Code, Cursor, OpenCode and Codex with the one-line commands on the Connect MCP page, each recorded with its client version |
| 2 | Keys and allowances | Keys stored as HMACs in Firestore with plan and daily allowance, issued by a script from the waitlist. The per-IP keyless allowance and the per-key allowance are consumed in one atomic commit, like the preview's quota. Usage counted per key and per day in Cloud Logging. A key revoked by the script stops within one request |
| 3 | Deployment and cost bound | A second Cloud Run service with at most 3 instances, concurrency 1, a $40 budget alert and the preview's tagged-revision release. The first two weeks' billing and call counts are recorded in `research/hosted/`, with the cost per 1,000 pages on each lane. The allowances above are adjusted from those numbers, not before |
| 4 | Site and packages say both paths | The Connect MCP page, the home page's Get code panel, the README and `llms.txt` lead with the remote URL and the key as an upgrade. Then comes "run it on your computer" with `npx octocrawl serve`, then self-hosting with `--hosted --token`. The privacy, terms, acceptable-use and limits pages gain a hosted-API section. No page says the hosted service offers proxies, CAPTCHA solving or stealth until phase 2 does |
| 5 | Phase 2: hosted jobs and paid access | Batch, crawl and Monitor hosted on P5's worker pool with per-tenant task roots. PA items 2, 3, 4 and 6 offered to paid keys under a per-key grant and budget settled in credits. Self-service sign-up and purchase (P4). A hosted browser cluster beyond Cloud Run's instance cap stays in [Paused](#paused) until this phase shows the demand |
| 6 | MCP connections by OAuth | `/mcp-oauth` answers an unauthenticated call with 401 and Protected Resource Metadata (RFC 9728) whose `resource` is that URL. octocrawl.dev serves OAuth 2.1 authorization server metadata with PKCE S256 only, public clients, Client ID Metadata Documents and dynamic registration, and `iss` in every authorization response (RFC 9207). The consent page names the client, the host it returns to and the account's credits. Access tokens last one hour and are bound to `/mcp-oauth`; refresh tokens rotate, and a reused one ends the connection. The account page lists connections and disconnects one within a minute. Connected and recorded in `research/hosted/` from ChatGPT developer mode, a claude.ai custom connector, Claude Code and Cursor, each with its client version and the flow it used (metadata document or registration) |

**Exit:** phase 1's four items accepted with records; at least five keys issued and used by people other than the author; the two-week cost record written. Phase 2 opens after P4's first payment or when a key holder asks for hosted batch, crawl or Monitor and will pay for it.

**Changed 2026-10-19 by Howard: hosted jobs start now, in stages H0–H5, before phase 2's opening condition is met.** Each stage starts when the previous stage's exit is met, with no dates. The stages follow the [cloud feature plan](docs/launch/2026-10-18-cloud-feature-plan.md), cut down to build small first and measure along the way. They take over item 5 above. How much time they get against PA's items is not set yet.

| Stage | Work | Exit |
| --- | --- | --- |
| H0 · Measure | Load-test a no-traffic revision with 500 HTTP and 200 browser pages, to get the cost per 1,000 pages per lane and the browser seconds per page from Cloud Run's metrics. Compare egress success on the `research/parity/sites.md` crawl sites from Cloud Run directly and through the proxy gateway. Split `W2L_SITE_DAILY` so one crawl cannot use up the whole service's day | Three records in `research/hosted/`, each with its command, commit and whether it ran proxied. The egress record decides whether H1 includes the proxy route. The two-week billing record (item 3) keeps running and corrects these numbers later |
| H1 · Small hosted jobs | Hosted `batch_scrape` up to 1,000 URLs and `crawl` up to 500 pages, on Cloud Tasks, GCS and a Firestore job document, without Postgres. Per-account concurrency and a queue; an idempotency key and a per-job credit budget; results kept 7 days and exportable; `workspace_id` on every record. Plan: [H1 hosted jobs plan](docs/launch/2026-10-19-h1-hosted-jobs-plan.md) | `npm test` and `npm run typecheck` pass; the parity sites pass hosted; a 1,000-URL batch reads back from any instance after it finishes |
| H2 · Clients and invited use | MCP tools to start, poll, page through and cancel a job; a job progress page; a signed webhook when a job ends. No crawl without a key, a page cap per job and a global stop switch. Deployed with the tagged-revision release, then opened to invited key holders | Start, poll and fetch recorded end to end from at least three clients (Claude Code, Codex and one more), each with its version; outside users running jobs |
| H3 · Full foundation | Postgres and a Cloud Run worker pool with per-host politeness across all workers and tenants; H1's jobs moved onto it and the size limits raised | Starts only when the small version cannot keep up: jobs queue too long, or a user needs more than 1,000 URLs |
| H4 · Teams and payment | Invites and roles, key scopes and budgets, payment through a merchant of record (P4), a read-only results grid, schedules and Monitor | Starts with P4; done at the first outside payment |
| H5 · Breadth | Results grid with added columns (the user's own model key), hosted search, linear pipeline templates, a verified adapter catalog (the Alexandria-like idea, which first needs Howard to take it out of [Paused](#paused)), hosted enhanced access | Each item decided from H4's usage data |

**H0 done 2026-10-19.** Its three pieces:
- Load test: [2026-10-19-h0-load-test-714af563.md](research/hosted/2026-10-19-h0-load-test-714af563.md) (#598), direct. It measured $0.013 per 1,000 HTTP pages and $0.053 per 1,000 browser pages on easy sites, at list price.
- Egress comparison: [2026-10-19-h0-egress-714af563.md](research/hosted/2026-10-19-h0-egress-714af563.md) (#600), direct and through the gateway. Both arms read 72 of 74 pages, and the gateway was about three times slower, so H1 starts without a proxy route. Blocking sites were not in the set.
- The `W2L_SITE_DAILY` split is a code change (#599), not a record: keyless callers together get `W2L_KEYLESS_TOTAL_DAILY` (500) and each account `W2L_ACCOUNT_DAILY` (500). It is not deployed yet.

**H1 done 2026-10-20.** Hosted `batch_scrape` (up to 1,000 URLs) and `crawl` (up to 500 pages) run for accounts' keys, a slice at a time:
- the API service `octocrawl-api` takes the jobs;
- the worker service `octocrawl-jobs` runs them;
- they use Cloud Tasks, GCS and Firestore job documents.

The work is in the [plan](docs/launch/2026-10-19-h1-hosted-jobs-plan.md) and the [task list](docs/h1-hosted-jobs-tasks.md): #605–#608, #611, #612, #614, #617 and #619. The exit:
- **Tests:** `npm test` and `npm run typecheck` pass on CI.
- **A 1,000-URL batch reads back from any instance:** it did, in 307 s, with the same 1,000 items read through a never-served revision and through api.octocrawl.dev. Record: [2026-10-20-h1-acceptance-d292501e.md](research/hosted/2026-10-20-h1-acceptance-d292501e.md).
- **The parity crawl and batch cases pass on hosted:** 85/90 checks, 14 of 16 cases. Record: [2026-10-20-h1-v8-cea1d4cb.md](research/hosted/2026-10-20-h1-v8-cea1d4cb.md). Howard accepted the two exceptions:
  - A29 expects a keyless call to be refused, which hosted does not do on purpose.
  - A32 fails locally the same way.

The global switch `hostedConfig/jobs.enabled` is off, so jobs are not yet open to anyone. Opening them to invited key holders is H2.

### P3 · Browser lane and Pro (weeks 11–14)

Moved after PA on 2026-10-05. A `my-browser` lane over Chrome remote debugging is PA's item 8; the extension below remains the design for queue mode and for reading without remote debugging.

| Item | Accepted when |
| --- | --- |
| Extension single-page capture (free) | Current tab → Markdown / tables with an Evidence Record, saved locally or sent to the local service |
| Queue mode (Pro) | Takes a URL queue from the local service, opens each URL in a background tab, waits for load and returns the DOM; pauses and notifies the user at a login or verification page |
| Local bridge security | WebSocket on `127.0.0.1` only; a one-time pairing code confirmed in both the extension and the CLI; Origin checked; unpaired connections refused. Any web page can try to reach a local port, so none of this is optional |
| Least privilege | No `debugger` permission; site access requested per domain at run time through `optional_host_permissions` |
| Access pacing | By default one request at a time per domain with random jitter, visible and adjustable; robots.txt read and recorded in `robotsDecision` as in the core: a URL the person queues is a URL they named |
| MCP | `scrape` / `batch_scrape` accept `lane: "my-browser"` with the same output shape as the other lanes<br>**Status 2026-10-05:** the lane over Chrome remote debugging is PA's item 8; through the extension it waits for this phase |
| Three-lane comparison | One 200-URL list through HTTP, the local browser and the user's browser; the three success rates published |
| Evidence Pack (Pro) | One-step export in the [Evidence Pack](#evidence-pack) layout with a generated `methods.md` |
| Pro plugin and licence | `@w2l/pro` loaded through the plugin interface, licence verified offline |
| Chrome Web Store | Submitted; early users get a side-load build during review |

**Exit:** on researcher sources the user-browser lane succeeds clearly more often than the HTTP lane, with published numbers; at least 3 early users used queue mode.

### P4 · Paid launch (weeks 15–16)

- Payments through a merchant of record for hosted credit packs (decided 2026-10-06, in Firecrawl's shape); a key with its credits is issued automatically after purchase, and sign-up gives the free monthly credits without a card. Since 2026-10-11, sign-up and the free monthly credits are built in [PH](#ph--hosted-octocrawl); P4 keeps payment, pricing and the lawyer's review.
- Pricing page: the free local path, keyless hosted use, the free key, and the credit packs, with what one credit buys on each lane; the academic price and the founding-member places left. The Pro plugin's offline licence (below) is priced only if it ships before hosted credits do.
- Terms, privacy policy and acceptable-use policy (no bypassing paywalls or access controls, no scraping personal data for marketing), reviewed by a lawyer.
- Launch to interviewees first, then the Chrome Web Store, Show HN, MCP directories and research mailing lists.
- Pricing research and a proposed starting point (2026-10-18, not decided): [business plan](docs/launch/2026-10-18-hosted-business-plan.md). It names Paddle as the likeliest merchant of record and Dodo Payments as one that refuses scraping; the choice waits for where the seller is registered.
- Measure licence activations and user feedback. Telemetry in the free version is off by default; if it is ever enabled, it is disclosed and can be turned off in one step.

### P5 · Breadth for developers (after P3)

Decided 2026-10-03: once P3 exits, the items below that are still open are required, in this order, each with its real-site record and status CSV like the M2 groups. They widen the audience from researchers to developers migrating from Firecrawl, without changing the product position. Since 2026-10-05, enhanced access follows [PA](#pa--enhanced-access)'s rules, and robots.txt follows the [Direction](#direction)'s rule.

| Item | Accepted when |
| --- | --- |
| `maxAge` cache (if not already closed in P2) | `maxAge`, `minAge`, `storeInCache` and the cache-only mode on scrape, batch and crawl, REST, SDK, MCP and `/fc`. A cache hit says so (`cacheState`, `cachedAt`) and gives the original fetch's Evidence Record, never a guessed `miss`. The audit's M3 cache features (4) solid<br>**Status 2026-10-05:** closed in P2 (#106) |
| Browser actions pipeline | The audit's M3 actions (11): `wait` (duration, selector), `click`, `write`, `press`, `scroll`, `screenshot`, `scrape`, `executeJavascript` and `pdf`. They run on the local browser rung only and in the order given. Each step is recorded in the trace with its outcome and timing. A step that fails ends the pipeline with a named error and the page as it stood. `/fc` maps Firecrawl's `actions` shape. Checked on 10 real pages that need an interaction to show their data (cookie walls, "load more", tabbed tables). The hosted MCP host refuses actions until its isolation is reviewed<br>**Status 2026-10-05:** delivered on `main` through I2–I6 and their follow-ups (#136, #140, #146, #154, #160, #173, #185, #192, #205): actions, list steps (`scrollToEnd`, `loadMore`, `paginate`), list records and handoff, each recorded on real pages. The `actions-real` set has 13 real pages of sites not made for scraping practice. 10 to 12 of them passed in each of the last three proxied runs ([2026-10-05-list-main-content.md](research/parity/runs/2026-10-05-list-main-content.md)). The hosted host refuses actions. Cookie walls were left out of the set on 2026-10-04 |
| Search endpoint | `POST /v1/search` with `limit`, `scrapeOptions`, include / exclude domains, time filter and the result shape the audit names. That covers core 29's four search features, plus the M5 operators that need no extra backend. The backend is pluggable and named in the response (`provider`): a self-hosted SearXNG first, and the user's own API key for a commercial engine second. Every result that is scraped carries its Evidence Record. Results are never invented when the backend fails (`cannot_verify`) |
| Model-driven formats and cross-site extract | `summary`, `question`, `highlights` and multi-URL `extract`, with the user's own model key (environment variable or request header, never stored). The model's name and the prompt hash are recorded on the result. The source passages are cited by URL and offset, so a summary can be checked against its page. `extract.show-sources` on. No Octocrawl-funded model budget |
| Hosted scale | Batches of tens of thousands of URLs and crawls over several workers under one control database. That needs a worker pool with leased tasks, per-tenant task roots and budgets, usage endpoints (`usage.concurrency`, `usage.queue-status`), and metering for per-use billing. The hosted API and hosted MCP are taken out of Paused. The 1,000-URL `kill -9` resume test is repeated at 20,000 URLs over 3 workers, with 0 lost and 0 duplicated<br>**Status 2026-10-06:** the hosted API and remote MCP are out of Paused as [PH](#ph--hosted-octocrawl) phase 1 (scrape and map, stateless); this row is PH's phase 2 |
| Assisted task setup | A person describes the data; Octocrawl proposes fields and pagination over the list engine, shows a preview to correct, and saves the task as a rule that re-runs without a model. On a failure it proposes repairs from a bounded excerpt of the page, a screenshot and the trace, each checked before it runs. Page content is data: it never raises a budget, widens a grant or sends a session anywhere |
| Proxy pool and location | Moved to [PA](#pa--enhanced-access) item 3 (access sessions and proxy management) on 2026-10-05 |

**Exit:** the audit's M3 and the search, extract and summary rows of M5 are solid, with records. A Firecrawl v1/v2 client switches the base URL and runs its existing scrape, crawl, batch, map, search and actions calls unchanged. The refusals above are the only named differences. Parity on `score.mjs` is at or above 50% tier-weighted, as a computation beside the records.

### After week 16

| Result | Reading | Next |
| --- | --- | --- |
| 3 or more paying users | The model works | Second audience; scheduled re-runs with change comparison as the second Pro feature; P5 in its order |
| Weekly users, no payment | The value is real; packaging or price is wrong | Test lab or team licences and one-off Evidence Pack purchases per project |
| Neither | Wrong audience or channel | Reread the interviews and redo P0 with the second audience; no new features |

## Product contract

### Evidence Record

Every result from every lane carries the same record. It is the product's identity and stays in the free core, so the evidence travels with every citation. Its JSON Schema is versioned and published in the docs reference.

| Field | Meaning | Today |
| --- | --- | --- |
| `requestedUrl` / `finalUrl` / `redirectChain` | Requested URL, final URL, redirects | In `evidenceRecord` in one form for every lane; the browser lane lists every hop Chromium followed, and a lane that observes only the endpoints (provider) says so (`complete: false`) |
| `fetchedAt` | UTC ISO timestamp | In `evidenceRecord`, from each lane's `evidence.fetchedAt`; Monitor observations keep `observedAt` |
| `httpStatus` / `status` / `reason` | Transport status and Octocrawl's verdict | Exists; `evidenceRecord.reason` is the failure, block or budget reason in one field |
| `lane` | `http` / `browser_local` / `my_browser` / `vendor` | In `evidenceRecord` on every default response (lane names as today: `http`, `browser_local`, `provider`, …); `my_browser` arrives with PA item 8 |
| `access` | How the page was reached: `route` (http, http-compatible, browser, enhanced-browser, vendor, user-browser), `profile` (transport or browser profile and library version), `session` (an id, never the cookies), `egress` (`proxyUsed`, location), `solver` (provider, attempts) and `costUsd` (null when unknown, never 0) | `route`, `profile`, `session` (`{ id }`) and `egress` (`{ proxy, source, switchedFrom, exit }`; `exit`, the pool proxy's address and country, when the operator sets an echo URL) are written since PA items 2 and 3; `solver` and `costUsd` (today `externalCostUsd`) still planned |
| `robotsDecision` | The robots.txt verdict, and whether and on whose word it was set aside | Recorded in `evidenceRecord` (decision, robots.txt URL and hash, unreachable reason, crawl delay, `userOverride`, and `overrideBasis`: `user_named_url`, `robots_override` or `ignore_robots_txt`) |
| `rawSha256` / `outputSha256` | Hashes of the raw page and of the extracted output | In `evidenceRecord`: the body each lane read, the delivered Markdown and `json.data` as canonical JSON |
| `extractor` | Name, version, commit | In `evidenceRecord`: `extract-tf` and `EXTRACTOR_VERSION` for a page, `pdf-text/1` or `file-text/1` for a file, and the commit when `W2L_SOURCE_COMMIT` is set |
| `fieldEvidence` | Where each field came from: JSON-LD path, DOM locator, table index, PDF page | In `evidenceRecord` for every JSON field read from the page; generic JSON-LD, microdata and meta values have no locator yet; a PDF's `Label: value` lines as `pdf` with `page N "label"` |
| `snapshot` / `screenshot` | Optional snapshot and screenshot paths with hashes | `evidenceRecord.artifacts` with SHA-256: a downloaded file (`kind: "file"`, with size and type). When `W2L_CAPTURE_RAW_DIR` is set, also the raw snapshot and, with the `screenshot` format, the capture (`kind: "screenshot"`, with size and type). The capture itself travels inline on the response (`screenshot.base64`, `sha256`) |

### Free core, hosted credits and Pro

The open-source core is complete and unmetered: a limit in AGPL code can be deleted by anyone and would cost trust. Decided 2026-10-06: the first paid product is the hosted service, metered in credits ([PH](#ph--hosted-octocrawl)). That is what every comparable open-source scraper sells, and what a key holder cannot delete from the code. Pro sells what saves time beyond the core on the local path, as the closed package `@octocrawl/pro` loaded through a plugin interface. Its items below stay the design. Each is offered hosted first where that is simpler: scheduled re-runs and the vendor fallback are PH phase 2 items. Pro prices are tested in the P0 interviews.

- **Free (AGPL core):**
  - scrape, batch, crawl and map without limits;
  - Markdown, JSON Schema extraction, tables → CSV and PDF text;
  - the Evidence Record;
  - CLI, local MCP and the Python client;
  - extension single-page capture;
  - the `my-browser` lane over Chrome remote debugging (PA item 8);
  - session-based management of the user's own proxies (PA item 3) and the browser-compatible HTTP transport (PA item 2), decided 2026-10-05.
- **Pro:**
  - extension queue mode (`my-browser` lane batches);
  - Evidence Pack export;
  - scheduled re-runs with change comparison, built on Monitor;
  - xlsx and Parquet export;
  - the vendor fallback with a budget (PA item 4: a third-party enhanced-access provider, and PA item 6's solver), decided 2026-10-05; the user's own proxies are free (PA item 3);
  - priority email support.

A licence is Ed25519-signed JSON (email, plan, expiry) verified offline. Without one, the core works fully and only the Pro plugin is not loaded. The repository uses the DCO, which grants no right to relicense: before accepting an external contribution to the core, either adopt a CLA or keep Pro code fully independent of the core.

### Evidence Pack

One zip for a paper's supplementary material: `data.csv` (with `fetchedAt`, `finalUrl` and `status` columns), `evidence.jsonl` (one Evidence Record per line), `snapshots/` and `screenshots/`, `manifest.sha256`, `citations.bib` and `citations.json` (BibTeX and CSL-JSON with access dates) and a generated `methods.md` paragraph. Optionally, pages are submitted to the Internet Archive within its rate limits and the archive link is recorded.

## Paused

Not worked on unless the restart condition occurs or the person asking requests it.

| Paused | Why | Restart when |
| --- | --- | --- |
| Further Amazon.sg adapter work | No overlap with the first audience | Commerce price evidence becomes the active audience |
| Firecrawl features outside the core 29 and outside [P5](#p5--breadth-for-developers-after-p3): agent, branding, file upload and similar | They need a model budget, or no audience has asked. The matrix stays in `research/parity/` | A paying user asks. Search, browser actions, cross-site extract, summary / question / highlights and live webhook push moved to P5 on 2026-10-03 (webhook push landed in M2) |
| An own browser fork or engine, and broad custom-fingerprint research | Upkeep a one-person team cannot carry; [PA](#pa--enhanced-access) uses maintained projects instead (restarted 2026-10-05: browser-compatible HTTP, proxy sessions, an optional enhanced browser and third-party CAPTCHA solving moved to PA) | A maintained project stops working for a class of tasks that PA's set shows matters |
| An in-house CAPTCHA model | Third-party solvers exist; no evidence yet that CAPTCHAs are the main loss | Only if solver cost or coverage blocks paying users |
| An own residential IP network | Operations and compliance cost | Not restarted; PA uses providers |
| A second stealth engine (Camoufox) | Two engines double the upkeep | Patchright leaves a clear class of PA tasks unsolved |
| A hosted browser cluster beyond Cloud Run's instance cap | Operations, compliance and isolation cost; the hosted API and remote MCP themselves restarted on 2026-10-06 as [PH](#ph--hosted-octocrawl) phase 1 on a bounded Cloud Run service | PH's phase 2 shows browser-lane demand that the instance cap cannot serve, and a key holder will pay for it |
| Monitor REST / MCP surface in Firecrawl's shape (the audit's M5 monitor rows) | The native Monitor and Delivery contracts already cover re-runs, change detection and signed delivery; only the interface shape differs | The second audience, or a Firecrawl Monitor client asks |
| Internal gate process (Gate 5 and similar) | Replaced by real user signals | Not restarted |

## Risks

| Risk | Mitigation |
| --- | --- |
| The comparison target moves, and the matrix has errors | Firecrawl frozen at v4.42.0; every gap reproduced by a failing real-site test before any code changes |
| Site terms, personal data and enhanced access | robots.txt read and recorded for every URL, obeyed for discovered links and on a hosted server (decided 2026-10-05). Prohibited uses in the acceptable-use policy: no bypassing paywalls, no reaching beyond the user's own account permissions, no MFA circumvention, no personal data for marketing. Every enhanced route recorded on the result. Guides remind researchers that personal data may need ethics approval |
| Arms race and upkeep | Maintained libraries pinned by version; a weekly regression on PA's set and the existing batches; a route that degrades is turned off per site, not patched by hand |
| Licences of reused code | Each adopted project's licence checked against the AGPL core and the MIT SDK before its code enters the repository; GPL code is reference only |
| Cost and data sent to third parties | Budgets per request and run; nothing goes to a provider or solver without the user's permission; login state is never sent |
| Regressions of paths that work | Enhanced routes are added beside the current ones, never as a global replacement; every PA item reruns the existing real-site batches before and after |
| AGPL plus DCO blocks relicensing | Pro code in a separate repository; a CLA before accepting external core contributions |
| Chrome Web Store rejection | Least privilege; a side-load build as fallback |
| One person's bandwidth | The Paused table and the weekly cadence |
| A shallow moat: anyone can add provenance fields | The moat is the workflow (Evidence Pack, methods paragraph, citation formats) and the reputation among researchers, not the fields |
| Low extension throughput | The extension is the lane for blocked sites, not the default; large batches use the HTTP lane |

## Weekly cadence

Each Monday, set the week's single goal at the top of this file. For the first 6 weeks, talk to users at least twice a week: about 60% of the time on code and 40% with users. Each Friday, send early users a short note on what shipped and what is next. Every two weeks, review the Paused table and bring an item back only when its restart condition has actually occurred.
