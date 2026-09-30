# First live batch, URL 6 (Wikipedia GDP): re-run from the cloud session (2026-09-30)

Addendum to [`live-batch-1-2026-09-30.md`](live-batch-1-2026-09-30.md), whose URL 6 was **not testable** from the macOS machine (poisoned DNS for `en.wikipedia.org`, and W2L does not use the system proxy). This re-run was made from the Claude Code cloud session for this repository, where the host resolves normally, after the environment's network access had been widened. It changes nothing in the original record; the batch denominator stays 12.

| | |
| --- | --- |
| Source commit | `edba921` (branch `claude/vigilant-keller-nkskez`). Code is identical to `c0ab92a`, the commit of the main record: `git diff c0ab92a edba921 -- packages` is empty |
| Service | Started by `.claude/hooks/session-start.sh`: `node packages/mcp/dist/localHostCli.js` on `127.0.0.1:8791`, `W2L_TASK_ROOT=.w2l/api` |
| Driver | Scratch MCP client (`@modelcontextprotocol/sdk` 1.30.0, outside the repository) calling the `scrape` tool with `{url, debug: true}`; raw result saved as `.w2l/parity-live-batch/06-wikipedia-gdp-cloud.json` (git-ignored) |
| Window | 2026-09-30 02:07:24.768 – 02:07:25.802 UTC (one call) |
| Machine | Linux cloud container, Node v22.22.2, playwright-core 1.62.1; direct egress, no proxy configured in W2L |
| Verification fetch | `curl -A "w2l-parity-check/0.1 (contact: …)"` of the same URL a few minutes later, parsed with linkedom, to compare table structure. Same body size (681,299 bytes) |

## Result

| Check | Observed |
| --- | --- |
| Status / lane | `success`, `http` only (`channelsTried: ['http']`), no escalation |
| HTTP | 200, `redirectChain: []`, `contentType: text/html; charset=UTF-8`, 681,299 bytes on the wire, `lastModified: Tue, 29 Sep 2026 18:59:00 GMT`, `rawBodySha256: 322edde355daafba600eb0d5b3319ba4c160195030909df48b5e4452880fad5b` |
| Timing | W2L `wallMs` 993; client wall 1,031 ms |
| robots.txt | `decision: allowed`, matched group `*`. The trace's `ruleCount: 0` is the number of rules that matched this path (`resilientHttp.ts:192`), not the group size: the `*` group in `en.wikipedia.org/robots.txt` has 432 rules, none covering `/wiki/List_of_countries_by_GDP_(nominal)` |
| User-Agent sent | `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36`, with matching `sec-ch-ua` client hints (same identity bundle as the macOS run) |
| Extract | `pageType: article, strategy: article, confidence: 1, linkCount: 691` |
| Markdown | 70,937 characters, 461 lines, 7 markdown tables (the HTML has 8 `<table>` elements, 2 of them `wikitable`) |
| `compliance` | `null` (finding 7 of the main record, reproduced) |

### The test-set criterion

> Pass if the spanned headers are filled in and every row has the same cell count. Record the User-Agent sent.

- **Every row has the same cell count: pass.** The nominal GDP table comes out with a 4-cell header (`Country/Territory | IMF(2026)[1] | World Bank(2025)[6] | United Nations(2024)[7]`) and 222 data rows, every one with 4 cells. The HTML wikitable has 222 body rows, each with 4 cells; row values match (`United States | 32,383,920 | 30,769,700 | 29,298,000`). The regional-groupings wikitable comes out as 3 header cells and 14 rows of 3 cells, also matching the HTML.
- **Spanned headers: not exercised.** The page revision served today has a single header row with the year inside each header cell and no `colspan`/`rowspan` in either wikitable, so the two-row spanned header the test set was written against no longer exists on this page. The colspan check needs a page that still has one; nothing about spanned headers can be concluded from this run.
- **User-Agent: recorded** above.

Verdict for URL 6: **pass on the applicable criterion**; the spanned-header criterion is carried to the second batch on a different page.

## Findings

1. **Navigation chrome is kept as main content.** The markdown opens with `79 languages` and 79 interlanguage links; 99 lines precede the first section heading (`## Table`). At the end, the three `vte…` navbox tables (lines 415, 426, 438) and a map legend rendered as two tables, the first with the `(header)` placeholder as its only cell, are included. The article body (from `## Table` on) is 362 of the 461 lines. This is the `only-main-content` / markdown gap already in M1, seen here on a mainstream page.
2. **Footnote markers stay inside cells.** `[1]`, `[6]`, `[7]` in the header cells and `[n 1]`, `[r 1]`, `[r 2]` inside data cells (`China[n 1]`, `71,321,000 [r 2]`); 17 `[digit]` markers page-wide. A researcher's numeric parse must strip them; the `excludeTags` option that would remove them is still rejected (400).
3. **`compliance: null` on the http lane** (as in the main record); robots and identity are only visible in the debug trace.

## Environment caveat

The macOS result for URL 6 stands as recorded: unreachable from that network. This run shows the page itself is captured on the http lane once the host resolves. Total fetches of the page in this addendum: one through W2L and one verification `curl`.
