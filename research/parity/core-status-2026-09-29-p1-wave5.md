# Core 29 status, 2026-09-29, after P1 wave 5

This record re-scores the 29 core features of the parity audit after the P1 wave 5 branches were merged, for the P1 exit in [ROADMAP.md](../../ROADMAP.md). It follows [core-status-2026-09-29.md](core-status-2026-09-29.md), which scored the code at `7e2a7b3` (12 of 29 solid) and is unchanged. The per-feature evidence is in [core-status-2026-09-29-p1-wave5.csv](core-status-2026-09-29-p1-wave5.csv), with the same columns: status now, why, tests, real-site cases, docs, remaining gaps and effort. The audit's own files ([core-features.csv](core-features.csv), [feature-matrix.csv](feature-matrix.csv)) still describe the code at `97ef3a4`.

## What was scored

- **Code.** `packages/` and `apps/` as at `a1ba589` (the head of `claude/p1-wave4`). Merged since `7e2a7b3`: Evidence Record v1 (`eddc0ec`), the PDF text engine (`692786b`), the JSON gaps (`3109c7d`), timeout and waiters (`33dd6b1`), Markdown and response metadata (`6f91753`), P2 file download and PDF text (`886c4d3`), the hardening branch (`f0fa554`: SEC User-Agent, ReDoS-safe path filters, hosted crawl limit, `--token`), and the integration commits `2a582e3` (E02 expectation), `1bbfb73` (Monitor cache) and `dd3d948` (JSON Schema `pattern` guard). `git diff --stat dd3d948 a1ba589` lists two files, both under `research/`.
- **Tests.** On `a1ba589` with Node v26.8.1: `npx tsc --build` exited 0; `npx vitest run` passed 116 of 116 files, 1392 of 1392 tests, the two live-site tests (`packages/api/test/monitor.test.ts`, `packages/api/test/session.test.ts`) included. The regex and JSON tests (`regexSafety`, `frontier`, `structured`: 3 files, 49 tests) also pass on Node v22.22.0.
- **Real sites.** The run that counts for this record is [runs/2026-09-29-p1-wave5.md](runs/2026-09-29-p1-wave5.md): `node research/parity/run-sites.mjs --record research/parity/runs/2026-09-29-p1-wave5.md` on `dd3d948`, whose code is that of `a1ba589`. It ran every case: 96 of 98 cases, 631 of 641 checks.
  - Local-mode API: `W2L_CONTACT=<W2L_CONTACT> W2L_TASK_ROOT=.w2l/api-final node --import tsx packages/api/src/cli.ts --port 8870`, with `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` from the environment (`127.0.0.1:7890`).
  - Hosted-mode API: the same with `W2L_API_TOKEN=<token>`, `W2L_TASK_ROOT=.w2l/api-final-hosted` and `--hosted --host 127.0.0.1 --port 8871`.
  - Runner environment: `W2L_CONTACT`, `W2L_API_URL=http://127.0.0.1:8870`, `W2L_HOSTED_API_URL=http://127.0.0.1:8871` and the same token.
  - F11 failed on the network: www.insee.fr's robots.txt did not answer through the proxy, a complete disallow. A36 failed on extraction: the SEC filing's Markdown is its largest table without the text. This record counts A36 against `scrape-formats.markdown` and `scrape-formats.only-main-content`.
  - Every core feature's real-site check is in that run, so no case was run again for this record. A36 was not rerun (it needs `W2L_CONTACT`, and SEC.gov requests are limited).
- **The branches' own records**, read for what each fix claims: [gap-json](runs/2026-09-29-gap-json.md), [gap-timeout-waiters](runs/2026-09-29-gap-timeout-waiters.md), [gap-markdown-meta](runs/2026-09-29-gap-markdown-meta.md), [file-download](runs/2026-09-29-file-download.md) and the four hardening runs.
- **Code and docs.** Every fix the merged branches claim and every gap in the previous record was checked in the code at `a1ba589`. Each defect this record counts was reproduced against the workspace source on local fixtures (127.0.0.1 servers or the in-process API; the scripts stayed outside the repository). The reproductions are listed under [Defects found](#defects-found-not-fixed-here).

## Scoring rules

These are the previous record's rules, unchanged:

[README.md](README.md) defines the points (solid 1, weak 0.6, partial 0.4, missing 0) and one rule: a feature is solid only when its real-site check passes, recorded with command and commit. The roadmap adds that it works, has tests and behaves as documented. This record applies those rules as follows:

- **Solid.** Works on every surface W2L offers the feature on, with tests. No remaining audit issue makes it return wrong data or silently drop input. Its real-site check, meaning the feature-matrix check or the P1 item's acceptance case, passes in the run above. Its docs say what it does. A Firecrawl option W2L refuses with a documented HTTP 400, scheduled after P1, does not block solid; a documented difference from Firecrawl's defaults does not either.
- **Weak.** Works on its main path, but a remaining defect, an unfixed audit issue or a docs contradiction keeps it from solid.
- **Partial.** Parts of the feature exist; what the audit's check needs is missing.
- **Missing.** Not implemented.
- **Paused.** In the roadmap's Paused table (search). Scored as missing.

No rule changed. Three points the previous record applied without spelling them out are stated here, because this record needs them more often:

1. **Which defects count.** The weak rule names "a remaining defect". This record counts a defect against solid when it is reproduced and returns wrong data or silently drops input on an ordinary request to an ordinary page, whether or not the audit listed it. It also counts a docs contradiction about what the feature returns or does. Other defects are listed as remaining gaps but not counted: those that need a crafted input (a hostile link path against one pattern shape), an out-of-range option value or a timing race; honest failures that carry the wrong reason code; and robustness, performance and error-code issues. The previous record drew the same line, for example leaving a non-integer `maxPages` as a gap of a solid `page-limit`.
2. **Paused Firecrawl options.** A refusal with a documented HTTP 400 of an option in the Paused table does not block solid, any more than one scheduled after P1. The case here is prompt-only JSON, since LLM extraction is maintained, not extended. The previous record treated it the same way.
3. **One defect, several features.** A defect counts against every feature whose output it makes wrong, and its effort is added once, as the previous record did with the SDK polling retry. Here that is table-route selection, which counts against `markdown` (where the audit lists it) and `only-main-content` (whose default it breaks).

## Counts and score

| | Solid | Weak | Partial | Missing | Paused |
| --- | --- | --- | --- | --- | --- |
| Audit (`97ef3a4`) | 3 | 6 | 10 | 10 (search included) | — |
| Previous record (`7e2a7b3`) | 12 | 9 | 1 | 3 | 4 |
| Now (`a1ba589`) | **14** | 7 | 1 | 3 | 4 |

`node research/parity/score.mjs --status research/parity/core-status-2026-09-29-p1-wave5.csv` prints:

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
with research/parity/core-status-2026-09-29-p1-wave5.csv (29 features overlaid; paused counts as missing) { features: 312, tierWeighted: 0.2361, unweighted: 0.1763 }
  core { features: 29, tierWeighted: 0.6414, unweighted: 0.6414 }
  common { features: 118, tierWeighted: 0.1949, unweighted: 0.1949 }
  niche { features: 165, tierWeighted: 0.0812, unweighted: 0.0812 }
  core statuses { solid: 14, weak: 7, missing: 3, paused: 4, partial: 1 }
```

- **Core tier: 0.6414**, tier-weighted and unweighted alike. It was 0.6138 in the previous record and 0.3655 at the audit.
- **All 312 features, tier-weighted: 0.2361** (previous record 0.2311, audit 0.1869). Only the 29 core rows are re-scored. The other 283 keep their audit statuses, including the four non-core M1 features (links, batch-cancel, error-model, crawl-delay).

## The P1 exit: 14 of 21

The P1 exit's second condition needs 21 solid features: M1's 17 core features, the 3 solid at the audit, and basic proxy. **14 are met and 7 are not.** Its other conditions (the first 12 URLs, the seed user's URLs) are not scored here.

| Feature | Group | Audit | `7e2a7b3` | Now | Met | What keeps it from solid (days to solid) |
| --- | --- | --- | --- | --- | --- | --- |
| scrape-formats.formats-array | M1 | partial | solid | solid | yes | — |
| scrape-formats.markdown | M1 | weak | weak | weak | no | Table-route selection keeps one table and drops the prose and other tables as success (A36); a data table holding a table loses its rows (a `dabca94` regression); links in table cells lose their targets (1.5) |
| scrape-formats.json | M1 | weak | weak | weak | no | Comma-decimal and grouped numbers misread as `complete` (`12,99 €` gives 1299); empty lists without evidence; the `pattern` limit is documented too narrowly (1.25) |
| scrape-formats.only-main-content | M1 | partial | weak | weak | no | The default keeps one table on table-routed pages; the same fix as markdown (1, shared) |
| scrape-formats.metadata-page | M1 | partial | solid | solid | yes | — |
| scrape-formats.metadata-response-status | M1 | weak | weak | weak | no | After a client-side navigation the browser lane reports the first document's status and content type with the final document's URL and content (0.75) |
| scrape-execution.timeout | M1 | partial | weak | weak | no | MCP cancellation does not reach a call over the Streamable HTTP MCP services, contrary to README.md:148 (0.75) |
| scrape-execution.wait-for | M1 | partial | solid | solid | yes | — |
| crawl-batch.crawl-start-async | M1 | weak | solid | solid | yes | — |
| crawl-batch.crawl-status | M1 | weak | weak | weak | no | docs/firecrawl-shim.md:34 says failed entries have no Markdown; they do (0.1) |
| crawl-batch.crawl-wait | M1 | partial | weak | **solid** | yes | — |
| crawl-batch.crawl-scrape-options | M1 | partial | solid | solid | yes | — |
| crawl-batch.include-paths | M1 | missing | solid | solid | yes | — |
| crawl-batch.exclude-paths | M1 | missing | solid | solid | yes | — |
| crawl-batch.batch-wait | M1 | weak | weak | weak | no | README.md:134 still says the SDK supports completion events (0.1) |
| platform.sdk.waiters | M1 | partial | weak | **solid** | yes | — |
| platform.client.api-key | M1 | partial | solid | solid | yes | — |
| crawl-batch.page-limit | solid at audit | solid | solid | solid | yes | — |
| crawl-batch.batch-start-async | solid at audit | solid | solid | solid | yes | — |
| crawl-batch.batch-status | solid at audit | solid | solid | solid | yes | — |
| scrape-execution.proxy-basic | basic proxy | missing | solid | solid | yes | — (as P1 item 9 defines basic proxy; Firecrawl's `proxy: 'basic'` and `proxyUsed` remain missing) |

**Effort to close the seven: about 4.5 days.** The per-feature figures add up to 5.45. The table-route fix, about 1 day, is counted under both markdown and only-main-content; counted once, the total is 4.45. Two of the seven, crawl-status and batch-wait, need only a docs line each. These estimates are this record's judgement, not measurements.

**The P2 exit: 14 of 25.** P2 needs the 21 plus map (missing, 4 d), maxAge (missing, 4 d), the published JS SDK (partial, 3 d) and the Python client (missing, 5 d). None of the four changed status. The SDK gained `crawlAndWait`, `batchAndWait` and retrying waiters, but it is still private and unpublished. The docs conflict about map is fixed: `docs/firecrawl-shim.md:19` now says it is not implemented yet. The four search features are paused and have no code.

## Changes since the previous record

- **To solid (2):** `crawl-batch.crawl-wait` and `platform.sdk.waiters`. The SDK waiters retry transient polling errors, a timeout also ends a request in flight, and the options are checked. The README and onboarding guide document them. A26, A27 and T02 pass.
- **Still solid (12):** none regressed. Closed gaps:
  - Path filters are ReDoS-safe.
  - The hosted crawl limit can no longer be bypassed.
  - `w2l-api` refuses a `--token` without a value.
  - A crawl fetches PDF, CSV and ZIP links as files.
  - The compact and MCP responses carry the proxy in `evidenceRecord.proxy`.
- **Still weak (7), with every blocker the previous record listed now fixed:** data: images, error-page targets and the Markdown fallback (markdown); the schema subset, model merge, strict mode and value evidence (json); `false` on a page with no main block (only-main-content); browser content type and redirect hops, compact `contentType` and `/fc` metadata (metadata-response-status); lane caps and the MCP handler (timeout); `/fc` cancelled, total and paging (crawl-status); the polling retry and its docs (batch-wait). What keeps each weak now is below, mostly defects this record found.
- **Missed by the previous record.** The audit's markdown row lists "Table-route pages keep only the table with the most cells" among its verified issues. The previous record did not carry it, and A36 now shows it on a real filing.

## What keeps each feature from solid

### scrape-formats.markdown (1.5 days to solid)

- **Table-route selection.** A page with two or more tables, fewer than 15 list items and no `<article>` is routed to the table strategy, however much prose it has (`packages/extract-tf/src/route.ts:263`). That strategy keeps one table, or that table with the lone `<h1>` (`route.ts:430-449`), and reports success.
  - Fixture: 15 paragraphs under three headings and two tables return only the larger table.
  - A36: IREN's 10-Q returns its largest table without the text.
  - Fix: route by prose as well, and keep every data table with its text (about 1 day, shared with only-main-content).
- **Nested-table regression.** The table strategy now prefers a table with no table inside (`route.ts:439-441`, added for Hacker News in `dabca94`). A data table of 12 station rows and a summary row whose last cell holds a 2×2 table comes back as that 2×2 table alone, as success.
- **Links in table cells.** Table cells are written as plain text (`cellText`, `packages/extract-tf/src/markdown.ts:114-132`), so every link and image target in a data table is dropped. Hacker News's story list is such a table: its Markdown has no story links, and M02's absolute-target check holds because there are none (about 0.5 day).
- Also, not counted: `<a href="data:…">` keeps its target (`markdown.ts:299-308`), although README.md:151 and `packages/contracts/src/firecrawl.ts:130` say `data:` URIs are always dropped.

### scrape-formats.json (1.25 days to solid)

- **Wrong numbers reported `complete`.** `numeric()` deletes every character but digits, `.` and `-` (`packages/api/src/structured.ts:47-50`). It reads the product price, rating and review count (`:167`, `:172-173`). Through `POST /v1/scrape` on a local product page with a `{ title, price: number }` schema, each with `text` evidence `p.price` and `json.status: complete`:

  | Page shows | `json.data.price` |
  | --- | --- |
  | `12,99 €` | `1299` |
  | `€12,99` | `1299` |
  | `1.299,00 €` | `1.299` |
  | `£51.77` | `51.77` (correct) |

  This contradicts README.md:178 ("A number is read only from a single amount"). The page-label path already uses a stricter `amount()` (`structured.ts:71-75`), which refuses the three comma forms. The price pattern in `packages/extract-tf/src/product.ts:39-43` also cuts `1 299,00 €` to `299,00 €`.
- **Values without evidence.** README.md:178 says every value has an `evidence` entry. A product list or map that is empty takes its evidence from its first item and so gets none (`structured.ts:180,189,199,208`).
- **The `pattern` limit is documented too narrowly.** README.md:183 and `apps/public-web/content/reference.md:25` say only a pattern with lookaround or a backreference is limited to 2,048 characters of text. A counted repetition above 16, `\p{…}`, or an astral character in the text falls back to that limit too (`structured.ts:405-408`, `packages/runtime/src/pathFilter.ts:37-49`).
- Not counted:
  - A strict-mode `null` for an optional property inside an array item is kept and then fails the caller's schema, because `withoutDisallowedNulls` (`structured.ts:665-675`) does not descend into arrays. This comes from the code and a fake provider; no real endpoint was called.
  - An `enum` or `const` without `type`, and a number-or-string union, keep the label text as a string, which the check then refuses (`structured.ts:78-80`).
  - Zod v4 `z.record` and `z.tuple` output (`propertyNames`, `prefixItems`) is refused by name.

### scrape-formats.only-main-content (1 day, shared with markdown)

The option works: `false` returns the whole page as success on a page with no main block in the HTTP, browser and provider lanes, on every surface, and M04 and M05 pass. But the default (`true`) is main-content selection, and on table-routed pages it keeps one table and drops the rest (see markdown), as A36 shows.

### scrape-formats.metadata-response-status (0.75 day to solid)

- **Client-side navigation.** The browser lane takes the status and content type from `page.goto`'s response (`packages/bench/src/subjects/browserLocal.ts:450, 537, 614`) but the final URL from `page.url()`.
  - Fixture: `/js` answers 200 `text/html; charset=utf-8` and runs `location.replace('/gone')`; `/gone` answers 404.
  - The scrape returns `success`, lane `browser_local`, `finalUrl` `/gone`, `httpStatus` 200 and `/js`'s content type, with `/gone`'s 404 page as content. The Evidence Record says the same, and so does `/fc` (`success: true`, `statusCode: 200`).
  - Only `redirectChain.complete: false` hints at it.
  - This contradicts `packages/contracts/src/result.ts:87-91` and `packages/contracts/src/api.ts:57-59` ("the final response's content-type header").
  - The fix is to use the last main-frame navigation response the lane already collects (`browserLocal.ts:414`).
- Not counted:
  - A zero-second meta refresh with `waitFor: 500` fails as `connection_error` with `httpStatus: null`, although the page answered 200. The settle wait's `page.evaluate` loses its context (`packages/bench/src/browserSettle.ts:29`), and the catch at `browserLocal.ts:779-783` maps that to `connection_error`. It is an honest failure with the wrong reason; it affects `wait-for` too.
  - On a redirect loop a→b→a, the HTTP lane names `a` as `finalUrl` with `b`'s 302 (`packages/http-core/src/resilient.ts:337`).
  - A file the browser displays or downloads keeps `[requested, final]` (`browserLocal.ts:880`), which its Evidence Record marks `complete: false`. `result.ts:80-85` and CHANGELOG.md:47 say otherwise.

### scrape-execution.timeout (0.75 day to solid)

- **MCP cancellation over Streamable HTTP.** The tool handler takes the call's signal (`packages/mcp/src/server.ts:18-23`). But the local MCP service (README.md:60-67) and the hosted one build a new server and a stateless transport for every POST (`packages/mcp/src/localHost.ts:81-83`, `packages/mcp/src/host.ts:102-114`). So `notifications/cancelled` reaches an instance with no call in flight, and a client disconnect does not abort the call either.
  - Reproduced in process with the MCP SDK's web-standard transport, which the Node transport wraps (`node_modules/@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.js:52-64`). After the cancel notification (answered 202) and after the disconnect, the API request was still running. It ended only when the server closed.
  - A cancelled scrape therefore runs to its deadline. README.md:148, CHANGELOG.md:39 and docs/batch-scrape.md:25 say a cancel stops it; that holds over stdio only.
  - Fix: abort the call when its HTTP request closes, and say what a stateless server does with `notifications/cancelled`.
- What passes: with a `timeout`, the HTTP lane waits for headers and body and the browser for navigation until the deadline. A22–A24 and T01 pass. A23 also needs file download, which answers httpbin's JSON on the HTTP rung; with the lane waits alone it failed on `d44641e`.
- Not counted:
  - Batch and crawl JSON model fallback runs outside the item's deadline (`packages/api/src/engine.ts:298` passes the task context, not the item scope of `:293`), although docs/batch-scrape.md:3 calls `timeout` each item's deadline. It matters only with the opt-in model fallback, and the previous record left it as a gap too.
  - The SDK sets no request timeout, so Node's fetch, which stops waiting for headers after 300 s, can throw on a scrape at the default or largest `timeout`. This comes from Node's default and was not reproduced here.
  - The CLI and session capture have no deadline.
  - The provider lanes keep fixed 20 s and 30 s caps (`packages/bench/src/vendors/cdp.ts:156-157`, `vendors/api.ts:32`).

### crawl-batch.crawl-status (0.1 day to solid)

- **Docs contradiction.** docs/firecrawl-shim.md:34 says a failed, blocked or duplicate entry of `/fc` crawl status has `metadata.error` and no Markdown. A failed page keeps its error page's Markdown or, with no main block, the whole page's. In a local crawl a 404 page and a 500 page each carried their Markdown in `data`, which line 24 of the same file says for scrape.
- Imprecise: the same line says `total` is `null` only while no process here runs the crawl. It is also `null` for a moment after a start or resume, until the run opens its queue (`packages/runtime/src/orchestrator.ts:177`).
- Not counted, but it should be fixed with it (about 0.5 day):
  - **A cursor race.** An entry's place is its millisecond timestamp and a random UUID (`orchestrator.ts:282-286`, `packages/runtime/src/sqliteStore.ts:342`).
  - Suppose a page is written after a read, in the same millisecond as the cursor's page and with a smaller UUID. It is never returned to a reader following `next` or `nextCursor`. Reproduced against the store: after following `next`, 0 entries; a fresh read, 2.
  - `/pages`, `/errors` and batch `/items` share the race, and docs/batch-scrape.md:25 suggests paging while a task runs. Firecrawl's own client follows `next` only after the crawl ends.
  - It is counted as a timing race under rule 1. On the same routes a malformed native cursor is HTTP 500 (`packages/runtime/src/taskStore.ts:67`).

### crawl-batch.batch-wait (0.1 day to solid)

README.md:134 still says "REST and SDK support the same durable task, paginated items, and completion events". The SDK has no events method; only REST `GET /v1/batches/:id/events` exists (`packages/api/src/app.ts:98-115`). The previous record listed this under batch-wait's docs, and this record keeps it there. The waiter itself is fixed and documented (README.md:142, docs/batch-scrape.md:23), and A28 and T03 pass. SDK completion events belong to the watcher features (`crawl-batch.watcher-websocket`, `platform.sdk.watcher`, common tier), so the fix is to correct the sentence, not to add events.

## Defects found (not fixed here)

Code was not changed. Each item gives where the defect is and how it was reproduced.

1. **JSON numbers** (`packages/api/src/structured.ts:47-50`). Covered above: `12,99 €` gives 1299 as `complete`. Reproduced through `POST /v1/scrape` on a local product page.
2. **Table-route selection** (`packages/extract-tf/src/route.ts:263, 430-449`). A page with two tables and prose keeps one table. Reproduced with `extractTf.extract` on a fixture; seen on a real site in A36.
3. **Nested data tables** (`route.ts:439-441`, from `dabca94`). The inner table replaces the data table. Reproduced with `extractTf.extract`.
4. **Links in table cells** (`packages/extract-tf/src/markdown.ts:114-132`). `<td><a href="https://example.org/story">A story</a></td>` becomes `| A story |`. Reproduced with `htmlToMarkdown`.
5. **Browser metadata after client-side navigation** (`packages/bench/src/subjects/browserLocal.ts:537, 614`). Covered above; reproduced through the in-process API with a local server.
6. **Navigation during the settle wait** (`packages/bench/src/browserSettle.ts:29`, `browserLocal.ts:779-783`). A meta refresh with `waitFor` gives `failed`/`connection_error`, `httpStatus: null`. Reproduced through the in-process API.
7. **MCP cancellation over Streamable HTTP** (`packages/mcp/src/localHost.ts:81-83`, `host.ts:102-114`). Covered above; reproduced in process.
8. **Step-cursor race** (`packages/runtime/src/orchestrator.ts:282-286`, `sqliteStore.ts:342`). An incremental reader can skip a page written in its cursor's millisecond. Reproduced against the SQLite store.
9. **Malformed native cursor** (`packages/runtime/src/taskStore.ts:67`). Returns HTTP 500 `internal_error` on `/v1/crawl/:id/pages`, `/errors` and `/v1/batches/:id/items`; `/fc` answers 400.
10. **Path-filter lookaround hole** (`packages/contracts/src/regexSafety.ts:292-296`).
    - `includePaths: ['(?=.*/docs/.*\\.html$)']` is accepted. It took 63 ms on a 1,000-character `/docs/…` path, and a 2,000-character one hit the 100 ms limit. After that the filter decides no link, not even `/docs/a.html`.
    - A crawl then follows no further filtered link, and nothing records why (`packages/runtime/src/frontier.ts:234`, `:256-273`).
    - README.md:136 and `regexSafety.ts:20` claim more than this. Not counted: it needs a crafted path.
11. **Redirect-loop `finalUrl`** (`packages/http-core/src/resilient.ts:337`). For a→b→a it names `a` with `b`'s 302.
12. **SDK details** (`packages/sdk/src/client.ts`):
    - A `pollIntervalMs` above 2^31−1 ms is accepted, and `setTimeout` then fires at once (`:160-166`, `:467`).
    - The listing phase of `crawlAndWait` and `batchAndWait` is neither retried nor bounded by `timeoutMs` (`:226-233`, `:251-262`).
    - `CrawlCollected` and `BatchCollected` are not exported from `packages/sdk/src/index.ts`.
    - Page-list 404s read `crawl not found: /v1/batches/<id>/items` (`:452`), unlike apps/public-web/content/reference.md:84.
13. **Stdio MCP `--token`** (`packages/mcp/src/stdio.ts:15-22`). It still takes a following flag as the token. The result is a 401, not a bypass.
14. **Docs to correct:**
    - README.md:134 (SDK completion events).
    - docs/firecrawl-shim.md:34 (failed entries' Markdown; `total` null).
    - README.md:178 (numbers, evidence).
    - README.md:183 and reference.md:25 (`pattern` limit).
    - README.md:148, CHANGELOG.md:39 and docs/batch-scrape.md:25 (MCP cancellation).
    - `packages/contracts/src/result.ts:80-91` (browser content type and hops).
    - README.md:151 (`data:` link targets).
    - The note of case A18 in `research/parity/sites.v1.json` still says the compact response has no `contentType`.

## Not verified

- **Checks not rerun.**
  - A36, which needs `W2L_CONTACT`; SEC.gov requests are limited.
  - The scripted mid-crawl restart check of the previous record, which last ran on `a096a85`.
  - A crawl that reaches a PDF on the current code: F11 failed on the network in the counted run.
- **Surfaces the real-site set does not reach.** MCP tools (stdio and Streamable HTTP) and the CLIs are covered only by unit and integration tests and the in-process reproductions above. No real-site case runs through MCP.
- **Node versions.** The full suite ran on Node 26.8.1 only; three test files also ran on Node 22.22.0. Node 22.13 (the `engines` minimum) and Node 24 were not tried.
- **Model provider.** No real OpenAI-compatible strict endpoint was called; the strict-mode findings rest on the code and the tests' fake provider.
- **The SDK's 300 s limit** is inferred from Node's fetch defaults and was not reproduced.
- **Firecrawl's output.** Its `removeBase64Images` output was not compared with W2L's.
- **Records W2L makes of itself.** A25 assumes the proxy routes the runner and W2L the same way. A35's spacing is W2L's own `crawl_delay` record. A29 ran against a hosted-mode API on loopback, not a deployment.
- **Estimates.** Effort figures are this record's judgement, not measurements.
