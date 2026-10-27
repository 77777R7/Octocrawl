# Hosted parity window, 2026-10-27

- Command: `node research/hosted/parity-window.mjs --credit-cap 150 --key-file <key file> --record research/hosted/2026-10-27-parity-window-21edea41.md`
- Commit: 21edea41; Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Ran 2026-10-27T01:00:09.776Z to 2026-10-27T01:17:31.925Z UTC, proxied through http://127.0.0.1:7890: the local hosts' pages and the hosted calls alike.
- Set: the weekly set of ISO week 44 (rotation group 0), 51 tasks, tasks.v1.json f83483b8dfb8…; every task in the denominator.
- hosted: https://mcp.octocrawl.dev/mcp, server 0.7.0, an account's key; checks sent: markdownIncludes, minTables, tableRowsMin, listRecordsMin, recordFields, field; credits inferred by hostedCredits.ts scrapeCharge, cap 150.
- local hosts: this commit's localHostCli, server 0.7.0; checks sent: markdownIncludes, markdownMatches, markdownCountMin, minTables, tableRowsMin, listRecordsMin, recordFields, field.
- local_grant: - Grant: SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back), access "enhanced" on every call.
- No timeout is sent: hosted stops a scrape at 100 s, a local host at 120 s. Each task's predicates judge every arm's result as the agent received it. The exits differ: hosted fetches from Cloud Run (asia-southeast1), the local hosts from this Mac.

| Arm | Verified | False successes | Not run | p50 ms | p95 ms | p50 verified ms | Credits (inferred) | ≥ 100 s or timeout | Tool errors | Other non-answers | robots.txt refused | robots.txt set aside |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hosted | 15 / 51 | 1 | 0 | 3158 | 77213 | 4661 | 48 | 0 | none | bot_detected_generic 4, captcha 6, cloudflare_challenge 11, empty_unverified 3, geo_restricted 2, http_error 2, policy_denied 6, rate_limit 1 | T041, T059, T079, T080, T049, B008 | none |
| local | 23 / 51 | 1 | 0 | 2184 | 13678 | 2243 | n/a | 0 | none | bot_detected_generic 5, captcha 5, cloudflare_challenge 12, empty_unverified 2, geo_restricted 2, http_error 1 | none | T041, T059, T079, T080, T049, B008 |
| local_grant | 37 / 51 | 3 | 0 | 4863 | 20598 | 4771 | n/a | 0 | none | bot_detected_generic 1, captcha 5, cloudflare_challenge 2, connection_error 1, geo_restricted 1, http_error 1 | none | T041, T059, T079, T080, T049, B008 |

| Part | hosted | local | local_grant |
| --- | --- | --- | --- |
| healthy (25) | 14 | 19 | 23 |
| challenge (16) | 0 | 0 | 9 |
| rotation (10) | 1 | 4 | 5 |

| Task | Part | hosted | local | local_grant |
| --- | --- | --- | --- | --- |
| T015 | healthy | verified: success, 4021 ms, 1 cr | verified: success, 1845 ms | verified: success, 1218 ms |
| T016 | healthy | verified: success, 26838 ms, 5 cr | verified: success, 6418 ms | verified: success, 6482 ms |
| T020 | healthy | not verified: blocked/cloudflare_challenge, 2187 ms | not verified: blocked/cloudflare_challenge, 1661 ms | verified: success, 14035 ms |
| T024 | healthy | false success: success, 79381 ms, 5 cr | false success: success, 2267 ms | false success: success, 2067 ms |
| T027 | healthy | not verified: failed/http_error, 3631 ms | not verified: failed/http_error, 1541 ms | not verified: failed/http_error, 2431 ms |
| T033 | healthy | verified: success, 4661 ms, 1 cr | verified: success, 2275 ms | verified: success, 2268 ms |
| T035 | healthy | verified: success, 3501 ms, 1 cr | verified: success, 1956 ms | verified: success, 1645 ms |
| T036 | healthy | verified: success, 10350 ms, 5 cr | verified: success, 6282 ms | verified: success, 7019 ms |
| T039 | healthy | not verified: blocked/captcha, 3825 ms | not verified: blocked/captcha, 3176 ms | verified: success, 6780 ms |
| T040 | healthy | verified: success, 3498 ms, 1 cr | verified: success, 1185 ms | verified: success, 1157 ms |
| T041 | healthy | not verified: failed/policy_denied, robots refused, 360 ms | verified: success, robots overridden, 1515 ms | verified: success, robots overridden, 2165 ms |
| T044 | healthy | verified: success, 22177 ms, 5 cr | verified: success, 1951 ms | verified: success, 2531 ms |
| T051 | healthy | not verified: blocked/cloudflare_challenge, 1946 ms | verified: success, 4542 ms | verified: success, 4453 ms |
| T052 | healthy | not verified: blocked/cloudflare_challenge, 4326 ms | not verified: blocked/cloudflare_challenge, 3740 ms | verified: success, 12131 ms |
| T058 | healthy | verified: success, 17989 ms, 5 cr | verified: success, 895 ms | verified: success, 841 ms |
| T059 | healthy | not verified: failed/policy_denied, robots refused, 590 ms | verified: success, robots overridden, 2529 ms | verified: success, robots overridden, 2576 ms |
| T061 | healthy | verified: success, 3363 ms, 1 cr | verified: success, 2105 ms | verified: success, 2135 ms |
| T062 | healthy | verified: success, 35678 ms, 5 cr | verified: success, 5789 ms | verified: success, 5908 ms |
| T063 | healthy | verified: success, 2140 ms, 1 cr | verified: success, 935 ms | verified: success, 837 ms |
| T067 | healthy | verified: success, 6203 ms, 5 cr | not verified: blocked/cloudflare_challenge, 1837 ms | verified: success, 8377 ms |
| T072 | healthy | not verified: failed/http_error, 6447 ms | verified: success, 3393 ms | verified: success, 1664 ms |
| T074 | healthy | verified: success, 3059 ms, 1 cr | verified: success, 749 ms | verified: success, 701 ms |
| T077 | healthy | verified: success, 838 ms, 1 cr | verified: success, 1060 ms | verified: success, 925 ms |
| T079 | healthy | not verified: failed/policy_denied, robots refused, 722 ms | verified: success, robots overridden, 1336 ms | verified: success, robots overridden, 1366 ms |
| T080 | healthy | not verified: failed/policy_denied, robots refused, 510 ms | verified: success, robots overridden, 2243 ms | verified: success, robots overridden, 2938 ms |
| T001 | challenge | not verified: blocked/captcha, 2482 ms | not verified: blocked/cloudflare_challenge, 2184 ms | verified: success, 8688 ms |
| T002 | challenge | not verified: blocked/cloudflare_challenge, 2415 ms | not verified: blocked/cloudflare_challenge, 1881 ms | verified: success, 8056 ms |
| T005 | challenge | not verified: blocked/bot_detected_generic, 2832 ms | not verified: blocked/bot_detected_generic, 2221 ms | not verified: blocked/captcha, 4483 ms |
| T034 | challenge | not verified: blocked/captcha, 2107 ms | not verified: blocked/captcha, 1452 ms | not verified: blocked/captcha, 3230 ms |
| T038 | challenge | not verified: blocked/bot_detected_generic, 3085 ms | not verified: blocked/captcha, 2595 ms | not verified: blocked/captcha, 5217 ms |
| T045 | challenge | not verified: blocked/captcha, 4450 ms | not verified: blocked/captcha, 3352 ms | not verified: blocked/captcha, 6184 ms |
| T046 | challenge | not verified: blocked/captcha, 3716 ms | not verified: blocked/captcha, 2387 ms | not verified: blocked/captcha, 4322 ms |
| T047 | challenge | not verified: blocked/cloudflare_challenge, 2285 ms | not verified: blocked/cloudflare_challenge, 1832 ms | verified: success, 11236 ms |
| T048 | challenge | not verified: blocked/cloudflare_challenge, 2240 ms | not verified: blocked/cloudflare_challenge, 2024 ms | not verified: blocked/cloudflare_challenge, 12773 ms |
| T049 | challenge | not verified: failed/policy_denied, robots refused, 876 ms | not verified: blocked/bot_detected_generic, robots overridden, 2129 ms | verified: success, robots overridden, 13510 ms |
| T053 | challenge | not verified: blocked/bot_detected_generic, 3158 ms | not verified: blocked/bot_detected_generic, 2356 ms | verified: success, 7127 ms |
| T068 | challenge | not verified: blocked/cloudflare_challenge, 2676 ms | not verified: blocked/cloudflare_challenge, 1967 ms | verified: success, 4771 ms |
| T071 | challenge | not verified: blocked/cloudflare_challenge, 2653 ms | not verified: blocked/cloudflare_challenge, 1887 ms | not verified: blocked/cloudflare_challenge, 12968 ms |
| T076 | challenge | not verified: blocked/cloudflare_challenge, 2703 ms | not verified: blocked/cloudflare_challenge, 1792 ms | verified: success, 6520 ms |
| B001 | challenge | not verified: blocked/cloudflare_challenge, 2431 ms | not verified: blocked/cloudflare_challenge, 1661 ms | verified: success, 8810 ms |
| B008 | challenge | not verified: failed/policy_denied, robots refused, 812 ms | not verified: blocked/bot_detected_generic, robots overridden, 13341 ms | verified: success, robots overridden, 20598 ms |
| T003 | rotation | not verified: blocked/cloudflare_challenge, 2461 ms | not verified: blocked/cloudflare_challenge, 1899 ms | verified: success, 9125 ms |
| T004 | rotation | not verified: blocked/geo_restricted, 4571 ms | not verified: blocked/geo_restricted, 2883 ms | not verified: failed/connection_error, 4863 ms |
| T006 | rotation | not verified: blocked/captcha, 4220 ms | verified: success, 5697 ms | verified: success, 7328 ms |
| T007 | rotation | not verified: blocked/rate_limit, 875 ms | verified: success, 5136 ms | verified: success, 3726 ms |
| T009 | rotation | verified: success, 80331 ms, 5 cr | verified: success, 13678 ms | verified: success, 12765 ms |
| T010 | rotation | not verified: failed/empty_unverified, 20127 ms | not verified: failed/empty_unverified, 18470 ms | false success: success, 33640 ms |
| T011 | rotation | not verified: failed/empty_unverified, 9807 ms | verified: success, 3528 ms | verified: success, 4740 ms |
| T012 | rotation | not verified: failed/empty_unverified, 11916 ms | not verified: failed/empty_unverified, 15955 ms | false success: success, 20909 ms |
| T013 | rotation | not verified: blocked/geo_restricted, 77213 ms | not verified: blocked/geo_restricted, 12408 ms | not verified: blocked/geo_restricted, 14802 ms |
| T014 | rotation | not verified: blocked/bot_detected_generic, 1634 ms | not verified: blocked/bot_detected_generic, 1641 ms | not verified: blocked/bot_detected_generic, 3102 ms |
