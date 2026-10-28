# Hosted parity window, 2026-10-27

- Command: `node research/hosted/parity-window.mjs --only T015,T016,T041 --credit-cap 15 --key-file <key file> --record research/hosted/2026-10-27-parity-smoke-21edea41.md`
- Commit: 21edea41; Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Ran 2026-10-27T00:58:16.097Z to 2026-10-27T00:59:13.669Z UTC, proxied through http://127.0.0.1:7890: the local hosts' pages and the hosted calls alike.
- Set: the weekly set of ISO week 44 (rotation group 0), 3 tasks (--only, of 51), tasks.v1.json f83483b8dfb8…; every task in the denominator.
- hosted: https://mcp.octocrawl.dev/mcp, server 0.7.0, an account's key; checks sent: markdownIncludes, minTables, tableRowsMin, listRecordsMin, recordFields, field; credits inferred by hostedCredits.ts scrapeCharge, cap 15.
- local hosts: this commit's localHostCli, server 0.7.0; checks sent: markdownIncludes, markdownMatches, markdownCountMin, minTables, tableRowsMin, listRecordsMin, recordFields, field.
- local_grant: - Grant: SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back), access "enhanced" on every call.
- No timeout is sent: hosted stops a scrape at 100 s, a local host at 120 s. Each task's predicates judge every arm's result as the agent received it. The exits differ: hosted fetches from Cloud Run (asia-southeast1), the local hosts from this Mac.

| Arm | Verified | False successes | Not run | p50 ms | p95 ms | p50 verified ms | Credits (inferred) | ≥ 100 s or timeout | Tool errors | Other non-answers | robots.txt refused | robots.txt set aside |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hosted | 2 / 3 | 0 | 0 | 3245 | 31249 | 31249 | 6 | 0 | none | policy_denied 1 | T041 | none |
| local | 3 / 3 | 0 | 0 | 1968 | 6273 | 1968 | n/a | 0 | none | none | none | T041 |
| local_grant | 3 / 3 | 0 | 0 | 1688 | 6959 | 1688 | n/a | 0 | none | none | none | T041 |

| Part | hosted | local | local_grant |
| --- | --- | --- | --- |
| healthy (3) | 2 | 3 | 3 |
| challenge (0) | 0 | 0 | 0 |
| rotation (0) | 0 | 0 | 0 |

| Task | Part | hosted | local | local_grant |
| --- | --- | --- | --- | --- |
| T015 | healthy | verified: success, 3245 ms, 1 cr | verified: success, 1968 ms | verified: success, 1688 ms |
| T016 | healthy | verified: success, 31249 ms, 5 cr | verified: success, 6273 ms | verified: success, 6959 ms |
| T041 | healthy | not verified: failed/policy_denied, robots refused, 724 ms | verified: success, robots overridden, 1909 ms | verified: success, robots overridden, 1595 ms |
