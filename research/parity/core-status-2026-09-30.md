# Core 29 status, 2026-09-30, on main at 5bfffec

This record re-scores the 29 core features of the parity audit on `main` at `5bfffec`, after PRs #70 to #74, for the P1 exit in [ROADMAP.md](../../ROADMAP.md). It follows [core-status-2026-09-29-p1-wave5.md](core-status-2026-09-29-p1-wave5.md), which scored the code at `a1ba589` (14 of the 21 the P1 exit needs) and is unchanged. The per-feature evidence is in [core-status-2026-09-30.csv](core-status-2026-09-30.csv), with the same columns and row order: status now, why, tests, real-site cases, docs, remaining gaps and effort. The audit's own files ([core-features.csv](core-features.csv), [feature-matrix.csv](feature-matrix.csv)) still describe the code at `97ef3a4`.

## What was scored

- **Code.** `packages/` and `apps/` at `5bfffec` (`main`). Between `a1ba589` and `f2774c6` (#69, which merged the previous record's code) only the public web's visuals changed (#68). Merged since, and each checked in the code:
  - #72 (`232efc9`): a header or body wait set to the time left counts as the deadline although its timer fires a few milliseconds early (`packages/http-core/src/resilient.ts:256-282`, `packages/bench/src/subjects/resilientHttp.ts:415`).
  - #70 (`48b7499`, record [runs/2026-09-29-sec-filing-text.md](runs/2026-09-29-sec-filing-text.md), 98/98 on `a1a95ee`): table-route selection by where the text is, `<div>` paragraphs, the body as main content, `ix:header` left out, the nested-table rule; `extract-tf/3`.
  - #71 (`f9769e1`, record [runs/2026-09-29-json-numbers.md](runs/2026-09-29-json-numbers.md), cases J04-J05): `readNumber`, evidence for empty product lists, the `pattern` limits in the docs. Its author did not claim json solid because of the Amazon adapter (see the ruling below).
  - #73 (`8c3fa56`, record [runs/2026-09-29-timeout-mcp.md](runs/2026-09-29-timeout-mcp.md), case T06): MCP cancellation over Streamable HTTP scoped per client, model fallback bounded by the item's timeout, the SDK's wait for a scrape's answer.
  - #74 (`5bfffec`, record [runs/2026-09-29-response-status.md](runs/2026-09-29-response-status.md), cases M09-M11): the browser lane reports the status and type of the document it shows, captures a page that moves on during the settle wait, and the HTTP lane names the URL whose redirect closes a loop.
- **Tests.** In the worktree on `5bfffec` with Node v26.8.1, after `npm ci` and `npx playwright install chromium`: `npx tsc --build` exited 0; `npx vitest run` passed 118 of 118 files and 1432 of 1432 tests, none skipped, the two live-site tests (`packages/api/test/monitor.test.ts`, `packages/api/test/session.test.ts`) included.
- **Real sites.** The run that counts for this record is [runs/2026-09-30-main-5bfffec.md](runs/2026-09-30-main-5bfffec.md): `node research/parity/run-sites.mjs --record research/parity/runs/2026-09-30-main-5bfffec.md` on `5bfffec`. Every case was selected: 103 of 104 cases passed, 683 of 683 checks; none failed.
  - Local-mode API: `W2L_CONTACT=<W2L_CONTACT> W2L_TASK_ROOT=.w2l/api node --import tsx packages/api/src/cli.ts --port 8930`, with `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` from the environment (`127.0.0.1:7890`).
  - Hosted-mode API: `W2L_CONTACT=<W2L_CONTACT> W2L_API_TOKEN=<token> W2L_TASK_ROOT=.w2l/api-hosted node --import tsx packages/api/src/cli.ts --hosted --host 127.0.0.1 --port 8931`.
  - Runner environment: `W2L_CONTACT`, `W2L_API_URL=http://127.0.0.1:8930`, `W2L_HOSTED_API_URL=http://127.0.0.1:8931` and the same token.
  - T06 was skipped, not run: it needs `W2L_LOCAL_MCP_URL`, which that command does not set. It stays in the denominator. It was then run alone on the same commit against a local MCP service on port 8931, as its own record, [runs/2026-09-30-main-5bfffec-t06.md](runs/2026-09-30-main-5bfffec-t06.md): 9 of 9 checks.
  - Network: no check failed, so no case was run again. Every robots.txt lookup answered (no `unreachable` in the saved responses). Inside a passing case, 3 of A35's 50 batch items failed through the proxy (2 `connection_error`, 1 header timeout); A35's checks do not require every item.
  - A36 sent SEC.gov one robots.txt request and one page request, with the declared contact.
- **Seed user's URLs.** [research/coos-pilot/runs/2026-09-30-main-5bfffec-batch.md](../coos-pilot/runs/2026-09-30-main-5bfffec-batch.md): `W2L_API_URL=http://127.0.0.1:8930 node research/coos-pilot/run-baseline.mjs` against a fresh local-mode API (`W2L_TASK_ROOT=.w2l/api-batch`): 61 of 72 succeeded; each of the other 11 has its reason.
- **Code and docs.** Every fix the PRs claim, and every item of the previous record, was checked in the code at `5bfffec`. Each defect this record counts was reproduced on `5bfffec` against the built workspace, on local fixtures (a 127.0.0.1 server on an ephemeral port with the in-process API, or the extractor's functions); the scripts stayed outside the repository. The reproductions are listed under [Defects found](#defects-found-not-fixed-here).

## Scoring rules

These are the previous record's rules and its three points, unchanged:

[README.md](README.md) defines the points (solid 1, weak 0.6, partial 0.4, missing 0) and one rule: a feature is solid only when its real-site check passes, recorded with command and commit. The roadmap adds that it works, has tests and behaves as documented. This record applies those rules as follows:

- **Solid.** Works on every surface W2L offers the feature on, with tests. No remaining audit issue makes it return wrong data or silently drop input. Its real-site check, meaning the feature-matrix check or the P1 item's acceptance case, passes in the run above. Its docs say what it does. A Firecrawl option W2L refuses with a documented HTTP 400, scheduled after P1, does not block solid; a documented difference from Firecrawl's defaults does not either.
- **Weak.** Works on its main path, but a remaining defect, an unfixed audit issue or a docs contradiction keeps it from solid.
- **Partial.** Parts of the feature exist; what the audit's check needs is missing.
- **Missing.** Not implemented.
- **Paused.** In the roadmap's Paused table (search). Scored as missing.

1. **Which defects count.** The weak rule names "a remaining defect". This record counts a defect against solid when it is reproduced and returns wrong data or silently drops input on an ordinary request to an ordinary page, whether or not the audit listed it. It also counts a docs contradiction about what the feature returns or does. Other defects are listed as remaining gaps but not counted: those that need a crafted input (a hostile link path against one pattern shape), an out-of-range option value or a timing race; honest failures that carry the wrong reason code; and robustness, performance and error-code issues. The previous record drew the same line, for example leaving a non-integer `maxPages` as a gap of a solid `page-limit`.
2. **Paused Firecrawl options.** A refusal with a documented HTTP 400 of an option in the Paused table does not block solid, any more than one scheduled after P1. The case here is prompt-only JSON, since LLM extraction is maintained, not extended. The previous record treated it the same way.
3. **One defect, several features.** A defect counts against every feature whose output it makes wrong, and its effort is added once, as the previous record did with the SDK polling retry. Here that is table-route selection, which counts against `markdown` (where the audit lists it) and `only-main-content` (whose default it breaks).

### The user's ruling on the Amazon adapter (2026-09-30)

By the user's decision of 2026-09-30, relayed for this re-score, the Amazon adapter's misreading of German ratings and review counts (`packages/extract-tf/src/amazon.ts:408-409`) does **not** count against `scrape-formats.json`: further Amazon adapter work is in the roadmap's Paused table, and the adapter is being worked on in another branch. Under rule 1 as written it would count, since it returns wrong numbers reported `complete` on an ordinary product page. The ruling covers this adapter defect only; json is otherwise scored by the rules above, and the defect stays in json's remaining gaps and under [Defects found](#defects-found-not-fixed-here). Without the ruling, json would be weak and 16 of the 21 would be solid.

## Counts and score

| | Solid | Weak | Partial | Missing | Paused |
| --- | --- | --- | --- | --- | --- |
| Audit (`97ef3a4`) | 3 | 6 | 10 | 10 (search included) | — |
| [core-status-2026-09-29](core-status-2026-09-29.md) (`7e2a7b3`) | 12 | 9 | 1 | 3 | 4 |
| [Previous record](core-status-2026-09-29-p1-wave5.md) (`a1ba589`) | 14 | 7 | 1 | 3 | 4 |
| Now (`5bfffec`) | **17** | 4 | 1 | 3 | 4 |

`node research/parity/score.mjs --status research/parity/core-status-2026-09-30.csv` prints:

```
baseline { features: 312, tierWeighted: 0.1869, unweighted: 0.1506 }
  core { features: 29, tierWeighted: 0.3655, unweighted: 0.3655 }
  common { features: 118, tierWeighted: 0.1949, unweighted: 0.1949 }
  niche { features: 165, tierWeighted: 0.0812, unweighted: 0.0812 }
after M1 (21 features, 34 audit days) { features: 312, tierWeighted: 0.2553, unweighted: 0.1885 }
after M2 (50 features, 53.75 audit days) { features: 312, tierWeighted: 0.3939, unweighted: 0.3269 }
after M3 (30 features, 54.75 audit days) { features: 312, tierWeighted: 0.4996, unweighted: 0.4218 }
after M4 (26 features, 51 audit days) { features: 312, tierWeighted: 0.5746, unweighted: 0.491 }
after M5 (52 features, 74.25 audit days) { features: 312, tierWeighted: 0.7303, unweighted: 0.634 }
with research/parity/core-status-2026-09-30.csv (29 features overlaid; paused counts as missing) { features: 312, tierWeighted: 0.2434, unweighted: 0.1801 }
  core { features: 29, tierWeighted: 0.6828, unweighted: 0.6828 }
  common { features: 118, tierWeighted: 0.1949, unweighted: 0.1949 }
  niche { features: 165, tierWeighted: 0.0812, unweighted: 0.0812 }
  core statuses { solid: 17, weak: 4, missing: 3, paused: 4, partial: 1 }
```

- **Core tier: 0.6828**, tier-weighted and unweighted alike. It was 0.6414 in the previous record, 0.6138 in the one before and 0.3655 at the audit.
- **All 312 features, tier-weighted: 0.2434** (previous record 0.2361, audit 0.1869). Only the 29 core rows are re-scored. The other 283 keep their audit statuses, including the four non-core M1 features (links, batch-cancel, error-model, crawl-delay).

## The P1 exit

| Condition | This run's evidence | Met |
| --- | --- | --- |
| The first 12 real-site URLs pass | L01-L12, the audit's first live batch, all pass in [runs/2026-09-30-main-5bfffec.md](runs/2026-09-30-main-5bfffec.md): L01 10/10, L02 6/6, L03 7/7, L04 10/10, L05 4/4, L06 4/4, L07 6/6, L08 16/16, L09 6/6, L10 10/10, L11 3/3, L12 3/3 (BLS answered the local browser with the table this time; the case also accepts an honest `blocked` 403) | yes |
| 21 of the core 29 solid | 17 (below) | no |
| At least 70% of the seed user's URLs succeed, the rest with honest reasons | 61 of 72 (84.7%) in [the batch run](../coos-pilot/runs/2026-09-30-main-5bfffec-batch.md); the 11 others: 6 robots.txt disallows, 2 robots.txt timeouts through the proxy, SEC's 403 in the default mode, a 429 and an anti-bot page, each named in the result | yes |

### 21 of the core 29: 17

The second condition needs M1's 17 core features, the 3 solid at the audit, and basic proxy. **17 are met and 4 are not.**

| Feature | Group | Audit | `a1ba589` | Now | Met | What keeps it from solid (days to solid) |
| --- | --- | --- | --- | --- | --- | --- |
| scrape-formats.formats-array | M1 | partial | solid | solid | yes | — |
| scrape-formats.markdown | M1 | weak | weak | weak | no | Links in table cells lose their targets (M02); the table strategy keeps one table when the tables hold most of the text and the largest shares no container below `<body>` with a lone `<h1>`; README.md:151 states the old nested-table rule (1.1) |
| scrape-formats.json | M1 | weak | weak | **solid** | yes | — (the Amazon adapter's German and French ratings and review counts are set aside by the user's ruling) |
| scrape-formats.only-main-content | M1 | partial | weak | weak | no | The default keeps one table on such table-routed pages; the same fix as markdown (0.5, shared) |
| scrape-formats.metadata-page | M1 | partial | solid | solid | yes | — |
| scrape-formats.metadata-response-status | M1 | weak | weak | **solid** | yes | — |
| scrape-execution.timeout | M1 | partial | weak | **solid** | yes | — |
| scrape-execution.wait-for | M1 | partial | solid | solid | yes | — |
| crawl-batch.crawl-start-async | M1 | weak | solid | solid | yes | — |
| crawl-batch.crawl-status | M1 | weak | weak | weak | no | docs/firecrawl-shim.md:34 says failed entries have no Markdown; they do (0.1) |
| crawl-batch.crawl-wait | M1 | partial | solid | solid | yes | — |
| crawl-batch.crawl-scrape-options | M1 | partial | solid | solid | yes | — |
| crawl-batch.include-paths | M1 | missing | solid | solid | yes | — |
| crawl-batch.exclude-paths | M1 | missing | solid | solid | yes | — |
| crawl-batch.batch-wait | M1 | weak | weak | weak | no | README.md:134 still says the SDK supports completion events (0.1) |
| platform.sdk.waiters | M1 | partial | solid | solid | yes | — |
| platform.client.api-key | M1 | partial | solid | solid | yes | — |
| crawl-batch.page-limit | solid at audit | solid | solid | solid | yes | — |
| crawl-batch.batch-start-async | solid at audit | solid | solid | solid | yes | — |
| crawl-batch.batch-status | solid at audit | solid | solid | solid | yes | — |
| scrape-execution.proxy-basic | basic proxy | missing | solid | solid | yes | — (as P1 item 9 defines basic proxy; Firecrawl's `proxy: 'basic'` and `proxyUsed` remain missing) |

**Effort to close the four: about 1.3 days.** The per-feature figures add up to 1.8. The table-strategy fix, about 0.5 day, is counted under both markdown and only-main-content; counted once, the total is 1.3. Two of the four, crawl-status and batch-wait, need only a docs line each; neither line was touched by any merged PR. These estimates are this record's judgement, not measurements.

**The P2 exit: 17 of 25.** P2 needs the 21 plus map (missing, 4 d), maxAge (missing, 4 d), the published JS SDK (partial, 3 d) and the Python client (missing, 5 d). None of the four changed status: the SDK gained a scrape that waits for its answer until the timeout plus 30 s, but it is still private and unpublished. The four search features are paused and have no code.

## Changes since the previous record

- **To solid (3):**
  - `scrape-formats.metadata-response-status`: the browser lane reports the final URL, status and content type of the document it shows (M09, M10, M11 pass), with the three gaps the previous record left uncounted also closed (the settle-wait navigation, the HTTP redirect-loop final URL, the chain of a browser file).
  - `scrape-execution.timeout`: MCP cancellation reaches a call over the Streamable HTTP services (T06 passes on `5bfffec`), and the two uncounted gaps (model fallback past the item's deadline, the SDK's 300 s header wait) are closed.
  - `scrape-formats.json`: numbers are read as the page writes them, empty lists have evidence, the `pattern` limits are documented as the code has them. Solid with the user's ruling on the Amazon adapter.
- **Still solid (14):** none regressed. Closed gaps: a page that navigates during the settle wait or `waitFor` is captured instead of failing (`wait-for`); a crawl page's timeout bounds its JSON model fallback (`crawl-scrape-options`); F11, a crawl that reaches a PDF, passes again (`crawl-start-async`); browser-lane metadata is read against the shown document's URL (`metadata-page`).
- **Still weak (4):**
  - `markdown` and `only-main-content`: #70 fixed the SEC filing (A36 passes) and the nested-table regression. The table strategy still keeps a single table, links in table cells still lose their targets, and README.md:151 now describes a rule the code no longer has.
  - `crawl-status` and `batch-wait`: their docs lines are unchanged.

## What keeps each feature from solid

### scrape-formats.markdown (1.1 days to solid)

- **Links in table cells.** Table cells are written as plain text (`cellText`, `packages/extract-tf/src/markdown.ts:116-134`), so every link and image target in a data table is dropped.
  - On `5bfffec`, `htmlToMarkdown` turns `<td><a href="https://example.org/story">A story</a></td>` into `| A story |`.
  - Real site: M02's Hacker News story list is such a table, 4,831 characters of Markdown with no link target. M02's absolute-target check holds because there are none.
  - Fix: write inline link and image markup in cells, escaping `|` (about 0.5 day).
- **The table strategy keeps one table.** Since #70 only a page whose tables hold at least half its text goes to the table strategy (`packages/extract-tf/src/route.ts:265-276`). That strategy still returns one table: the one with the most cells, or its common container with the page's `<h1>` when there is exactly one `<h1>` and that container is not `<body>` (`selectTable`, `route.ts:442-461`).
  - Fixture: a statistics page with a nav header, its `<h1>` in a banner `<div>`, and a content `<div>` holding a one-line intro and three captioned data tables (10, 8 and 6 rows) under `<h2>` headings.
  - Through `POST /v1/scrape` (in-process API, HTTP lane) on `5bfffec`: `success`, strategy `table`, 392 characters, the first table only. The other two tables, the three headings, the intro and the `<h1>` are dropped. With `onlyMainContent: false` all three tables are there.
  - The same page with the `<h1>` directly in `<body>`, with no `<h1>`, or with a second `<h1>` in the header, gives the same one table (`extractTf.extract`). Only with the `<h1>` inside the tables' own container are all three kept.
  - No page in this run's real-site set or seed batch shows it. Only L04 and M02 (one data table each) and one seed page (on www.ntt.com, whose Markdown is a single table) went to the table strategy.
  - Fix: when the table strategy is chosen, keep every data table with the headings and text between them, for example their common container (about 0.5 day, shared with only-main-content; add a real-site case).
- **Docs contradiction.** README.md:151 says "A table that holds another table ... lays out the page rather than holding data: its cells become paragraphs". Since `extract-tf/3` a table is a layout table only when its nested tables hold at least half its text (`packages/extract-tf/src/dom.ts:98-103`).
  - Fixture: a data table of 12 station rows and a summary row whose last cell holds a 2×2 table is one GFM grid, with `a 1 b 2` as that cell's text.
  - CHANGELOG.md:49 describes the new rule; README.md:151 was not updated (about 0.1 day).
- Not counted: `<a href="data:…">` keeps its target (`markdown.ts:307-316`), while README.md:151 and `packages/contracts/src/firecrawl.ts:132` speak of dropping `data:` image URIs.

### scrape-formats.only-main-content (0.5 day, shared with markdown)

The option works. `false` returns the whole page as `success` on a page with no main block in the HTTP, browser and provider lanes, on every surface; M04 and M05 pass. #70 fixed the default for A36-like pages, whose prose lies outside their tables. But the default (`true`) is main-content selection, and on a table-routed page like the fixture above it keeps one of several data tables and reports success. This is the same defect and the same fix as for markdown.

### crawl-batch.crawl-status (0.1 day to solid)

- **Docs contradiction, unchanged.** docs/firecrawl-shim.md:34 says a failed, blocked or duplicate entry of `/fc` crawl status has `metadata.error` and no Markdown. But `firecrawlPage` copies every page's Markdown (`packages/contracts/src/firecrawl.ts:284`).
  - Reproduced on `5bfffec` through the in-process API: a `/fc` crawl whose start page links a 404 page and a 500 page listed both with `statusCode` 404 and 500 and `error: http_error`, each with its error page's Markdown (163 and 161 characters).
  - That is what line 24 of the same file says for scrape.
- Imprecise, as before: the same line says `total` is `null` only while no process here runs the crawl. It is also `null` for a moment after a start or resume, until the run opens its queue (`packages/runtime/src/orchestrator.ts:177`).
- Not counted, carried over: the step-cursor race and the HTTP 500 on a malformed native cursor ([Defects found](#defects-found-not-fixed-here)).

### crawl-batch.batch-wait (0.1 day to solid)

README.md:134 still says "REST and SDK support the same durable task, paginated items, and completion events". The SDK has no events method; only REST `GET /v1/batches/:id/events` exists (`packages/api/src/app.ts:98-115`). The waiter itself works and is documented (README.md:142, docs/batch-scrape.md:23), and A28 and T03 pass. The fix is to correct the sentence.

## Defects found (not fixed here)

Code was not changed. Each item gives where the defect is and how it was reproduced on `5bfffec`.

1. **Table strategy keeps one table** (`packages/extract-tf/src/route.ts:442-461`). Counted against markdown and only-main-content.
   - Page: `<header><nav>…</nav></header><div class="banner"><h1>Energy statistics 2025</h1></div><div id="content"><p>Final figures …</p><h2>Electricity</h2><table><caption>Table 1 …</caption>…10 rows…</table><h2>Gas</h2>…8 rows…<h2>Heat</h2>…6 rows…</div><footer>…</footer>`, served from 127.0.0.1.
   - Engine: `createApiEngine({ taskRoot, httpOnly: true })` and `createApp(engine)` from the built `packages/api/dist`.
   - Request: `POST /v1/scrape { url, formats: ["markdown"] }` gives `success` and strategy `table`, with the first table alone.
   - Variants through `extractTf.extract` give the same.
2. **Links in table cells dropped** (`packages/extract-tf/src/markdown.ts:116-134`). Counted against markdown.
   - `htmlToMarkdown` on a two-row table of `<a href>` cells gives the texts without targets.
   - Seen on a real site in M02.
3. **README.md:151 states the old nested-table rule.** Counted against markdown. `extractTf.extract` and `htmlToMarkdown` on the station-table fixture give one grid.
4. **docs/firecrawl-shim.md:34.** Counted against crawl-status. Reproduced with an in-process `/fc` crawl, a 404 page and a 500 page linked from the start page.
5. **README.md:134.** Counted against batch-wait. `packages/sdk/src/client.ts` has no events method.
6. **Amazon adapter rating and review count** (`packages/extract-tf/src/amazon.ts:408-409`). Not counted, by the user's ruling.
   - `ratingRaw.match(/[0-5](?:\.[0-9])?/)` and `reviewRaw.match(/[\d,]+/)` take the first digits of the text.
   - Page: a local Amazon-shaped page (`#dp-container`, `input[name=ASIN]`, `#productTitle`, a price, `#acrPopover title="4,5 von 5 Sternen"`, `#acrCustomerReviewText` "1.234 Sternebewertungen"), passed to `extractTf.extract` with the URL `https://www.amazon.de/dp/B012345678` and then to `extractStructured` with `{ title, price, rating, reviewCount }` required.
   - Result: `complete` with price 49.99, rating 4 and reviewCount 1. The French forms "4,5 sur 5 étoiles" and "1 234 évaluations" under amazon.fr give the same 4 and 1. amazon.com's "4.5 out of 5 stars" and "1,234 ratings" give 4.5 and 1234.
   - The structured layer reads "4,5" and "1.234" correctly when it gets them (`packages/api/test/structured.test.ts`); the adapter cuts them first.
7. **Carried over from the previous record**, in code the merged PRs did not change (only moved), not reproduced again:
   - The step-cursor race (`packages/runtime/src/orchestrator.ts:282-286`, `packages/runtime/src/sqliteStore.ts:342`).
   - The HTTP 500 on a malformed native cursor (`packages/runtime/src/taskStore.ts:67`).
   - The path-filter lookaround hole (`packages/contracts/src/regexSafety.ts:292-296`).
   - The SDK details: an unbounded `pollIntervalMs`, `client.ts:183-189, 500`; unretried listing, `client.ts:255-262, 280-291`; `CrawlCollected` and `BatchCollected` not exported; page-list 404 messages, `client.ts:485`.
   - The stdio MCP `--token` parsing (`packages/mcp/src/stdio.ts:15-22`).
   - A strict-mode `null` inside array items (`packages/api/src/structured.ts:716-726`).
   - Rechecked: on a robots.txt refusal, `evidence.finalUrl` and `/fc` `url` are the requested URL while `evidenceRecord.finalUrl` is `null`.
8. **Docs to correct:** README.md:134, README.md:151, docs/firecrawl-shim.md:34 (Markdown of failed entries; `total` null).

## Not verified

- **Surfaces the real-site set does not reach.**
  - T06 covers the local Streamable HTTP MCP service over a real page. The hosted service's per-token scoping rests on the in-process tests over real HTTP (`packages/mcp/test/httpCancellation.test.ts`), as the hosted service needs a WorkOS login.
  - The CLIs and stdio MCP are covered by unit and integration tests only.
- **The table-strategy defect on a real site.** It is reproduced on local fixtures only; no page in the set or the seed batch shows it.
- **The Amazon adapter on a real Amazon page.** The misreading was reproduced on local Amazon-shaped pages under amazon.de and amazon.fr URLs, not on amazon.de itself.
- **Checks not rerun.** The scripted mid-crawl restart check of core-status-2026-09-29.md, which last ran on `a096a85`.
- **Node versions.** The suite ran on Node 26.8.1 only; Node 22.13 (the `engines` minimum) and Node 24 were not tried.
- **Model provider.** No real OpenAI-compatible endpoint was called; model-fallback findings rest on the code and the tests' fake provider.
- **Firecrawl's output.** Not compared.
- **Records W2L makes of itself.**
  - A25 assumes the proxy routes the runner and W2L the same way.
  - A35's spacing is W2L's own `crawl_delay` record.
  - A29 ran against a hosted-mode API on loopback, not a deployment.
- **Estimates.** Effort figures are this record's judgement, not measurements.
