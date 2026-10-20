# Nasdaq AAPL historical table on `main`, 2026-10-20 (PA C1)

The real-site rerun docs/pa-enhancement-tasks.md C1 asks for: #604 made the browser lane's region wait judge `tableRowsMin` on the same capture the answer reads, and was merged without a real-site run. This record is that run, on `main` after #604, with the local browser lane and no grant. The same request was then run three times on the C2/C3 branch for comparison.

## Setup

- Source commit: `main` `f0ecf6de` (after #604 and #628), built with `npx tsc --build`. Comparison: branch `claude/pa-c-table-wait`, uncommitted C2/C3 changes on top of `f0ecf6de` (the code the C PR carries).
- API: `node --import tsx packages/api/src/cli.ts` on port 8787 (the `npm run api` command without its build step, which had just run), stopped after the runs. 8791 not touched.
- No grant, no `W2L_VENDORS`, no `access` field: the default ladder, http then browser_local. Cost $0 (no paid call).
- Proxied runs: API started with the shell's `HTTPS_PROXY=http://127.0.0.1:7890` (Clash); its startup line says outbound requests use the environment proxy.
- Direct runs: API started with `env -u HTTPS_PROXY -u HTTP_PROXY -u https_proxy -u http_proxy`; its startup line has no proxy line.
- Request, each run: `curl -X POST http://127.0.0.1:8787/v1/scrape` with
  `{"url":"https://www.nasdaq.com/market-activity/stocks/aapl/historical","formats":["markdown","tables"],"maxAge":0,"timeout":60000,"debug":true,"verify":{"checks":[{"type":"markdownMatches","pattern":"Apple|AAPL","flags":"i"},{"type":"tableRowsMin","tableIndex":0,"columns":[0,1,2,3,4,5],"min":10}]}}`.
  The contract is the one `packages/mcp/test/delayedTableDelivery.integration.test.ts` keeps for this page (T060's URL, with the row check instead of T060's Markdown count).
- Three runs per arm, one after another, 3 s apart. Times are the results' `fetchedAt` (UTC).

## Result

| Arm | Run | fetchedAt | Status | Lane | Verification | Rows judged | region_wait (ready, reads, waitedMs) | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| main, proxied | 1 | 06:11:34Z | success | browser_local | passed | 10 | true, 2, 791 | 7951 |
| main, proxied | 2 | 06:11:48Z | success | browser_local | passed | 10 | true, 2, 743 | 6472 |
| main, proxied | 3 | 06:11:57Z | success | browser_local | passed | 10 | true, 2, 709 | 5563 |
| main, direct | 1 | 06:12:35Z | success | browser_local | passed | 10 | true, 2, 722 | 23076 |
| main, direct | 2 | 06:12:56Z | success | browser_local | passed | 10 | true, 2, 767 | 17703 |
| main, direct | 3 | 06:13:11Z | success | browser_local | passed | 10 | true, 2, 756 | 12421 |
| branch, proxied | 1 | 06:13:36Z | success | browser_local | passed | 10 | true, 2, 781 | 6079 |
| branch, proxied | 2 | 06:13:43Z | success | browser_local | passed | 10 | true, 2, 744 | 4121 |
| branch, proxied | 3 | 06:13:52Z | success | browser_local | passed | 10 | true, 2, 742 | 5929 |

- Every run: HTTP 200 at the requested URL; the http rung failed the row check (`readiness` `not_loaded`) and the ladder went on to browser_local, which passed both checks. Readiness `ready`, basis `verified`. No `tablesUnjudged` on any region wait.
- Tables: three on the page each time; table 0 had 11 rows (a header and 10 data rows) of 6 columns. Whether the page offers more rows past its first screen was not checked.
- The direct runs took longer at the wall (12–23 s against 4–8 s); where the time went was not broken down here (unknown).
- Not run: the branch direct; the provider lane (Steel) on this page.

## Reading

On `main` after #604, Nasdaq's AAPL historical table was delivered and verified on 9 of 9 runs, proxied and direct, with the region wait ending ready after two reads on the rows it counted, not on the title. The C2/C3 branch gave the same results on the same page. Nine runs in one window on one day: they show the path works today, not how often it does over time.
