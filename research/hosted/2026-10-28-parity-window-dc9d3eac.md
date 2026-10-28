# Hosted parity window, 2026-10-28

- Command: `node research/hosted/parity-window.mjs --credit-cap 150 --key-file <key file> --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant.json --record research/hosted/2026-10-28-parity-window-dc9d3eac.md`
- Commit: dc9d3eac; Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Ran 2026-10-28T03:07:02.218Z to 2026-10-28T03:23:44.310Z UTC, proxied through http://127.0.0.1:7890: the local hosts' pages and the hosted calls alike.
- Set: the weekly set of ISO week 44 (rotation group 0), 51 tasks, tasks.v1.json f83483b8dfb8…; every task in the denominator.
- hosted: https://mcp.octocrawl.dev/mcp, server 0.7.0, an account's key; checks sent: markdownIncludes, minTables, tableRowsMin, listRecordsMin, recordFields, field; credits inferred by hostedCredits.ts scrapeCharge, cap 150.
- local hosts: this commit's localHostCli, server 0.7.0; checks sent: markdownIncludes, markdownMatches, markdownCountMin, minTables, tableRowsMin, listRecordsMin, recordFields, field.
- local_grant: - Grant: SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back), access "enhanced" on every call.
- No timeout is sent: hosted stops a scrape at 100 s, a local host at 120 s. Each task's predicates judge every arm's result as the agent received it. The exits differ: hosted fetches from Cloud Run (asia-southeast1), the local hosts from this Mac.

| Arm | Verified | Verified, robots.txt allows | False successes | False successes, robots.txt allows | Not run | p50 ms | p95 ms | p50 verified ms | Credits (inferred) | ≥ 100 s or timeout | Tool errors | Other non-answers | robots.txt refused | robots.txt set aside |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hosted | 14 / 51 | 14 / 45 | 1 | 1 | 0 | 3091 | 24412 | 10864 | 47 | 0 | none | bot_detected_generic 5, captcha 7, cloudflare_challenge 12, empty_unverified 2, geo_restricted 2, http_error 2, policy_denied 6 | T041, T059, T079, T080, T049, B008 | none |
| local | 25 / 51 | 21 / 45 | 3 | 3 | 0 | 3247 | 14291 | 3079 | n/a | 0 | none | bot_detected_generic 7, captcha 3, cloudflare_challenge 9, empty_unverified 1, geo_restricted 2, http_error 1 | none | T041, T059, T079, T080, T049, B008 |
| local_grant | 40 / 51 | 34 / 45 | 2 | 2 | 0 | 6538 | 18113 | 6576 | n/a | 0 | none | bot_detected_generic 2, captcha 2, cloudflare_challenge 1, connection_error 1, empty_unverified 1, geo_restricted 1, http_error 1 | none | T041, T059, T079, T080, T049, B008 |

- robots.txt: hosted refused 6 tasks for robots.txt: T041, T059, T079, T080, T049, B008. Hosted obeys robots.txt for every URL; a local server fetches a URL the person names. Every task stays in every arm's "Verified" denominator; the "robots.txt allows" columns count each arm over the other tasks, which is what stage H's exit compares (decided by Howard, 2026-10-27).

| Part | hosted | local | local_grant |
| --- | --- | --- | --- |
| healthy (25) | 13 | 21 | 23 |
| challenge (16) | 0 | 1 | 12 |
| rotation (10) | 1 | 3 | 5 |

| Task | Part | hosted | local | local_grant |
| --- | --- | --- | --- | --- |
| T015 | healthy | verified: success, 3224 ms, 1 cr | verified: success, 2495 ms | verified: success, 2065 ms |
| T016 | healthy | verified: success, 24412 ms, 5 cr | verified: success, 6462 ms | verified: success, 6602 ms |
| T020 | healthy | not verified: blocked/cloudflare_challenge, 2164 ms | verified: success, 7558 ms | verified: success, 7004 ms |
| T024 | healthy | false success: success, 54529 ms, 5 cr | false success: success, 3495 ms | false success: success, 2397 ms |
| T027 | healthy | not verified: failed/http_error, 2695 ms | not verified: failed/http_error, 1497 ms | not verified: failed/http_error, 2454 ms |
| T033 | healthy | verified: success, 10864 ms, 5 cr | verified: success, 2936 ms | verified: success, 3330 ms |
| T035 | healthy | verified: success, 3289 ms, 1 cr | verified: success, 1567 ms | verified: success, 1647 ms |
| T036 | healthy | verified: success, 13195 ms, 5 cr | verified: success, 6184 ms | verified: success, 5432 ms |
| T039 | healthy | not verified: blocked/captcha, 3574 ms | not verified: blocked/captcha, 2642 ms | verified: success, 8097 ms |
| T040 | healthy | verified: success, 3331 ms, 1 cr | verified: success, 1263 ms | verified: success, 1604 ms |
| T041 | healthy | not verified: failed/policy_denied, robots refused, 346 ms | verified: success, robots overridden, 1836 ms | verified: success, robots overridden, 2691 ms |
| T044 | healthy | verified: success, 21821 ms, 5 cr | verified: success, 2987 ms | verified: success, 2611 ms |
| T051 | healthy | not verified: blocked/cloudflare_challenge, 1949 ms | verified: success, 5019 ms | verified: success, 6063 ms |
| T052 | healthy | not verified: blocked/cloudflare_challenge, 4303 ms | not verified: blocked/cloudflare_challenge, 4364 ms | verified: success, 11144 ms |
| T058 | healthy | verified: success, 14942 ms, 5 cr | verified: success, 995 ms | verified: success, 916 ms |
| T059 | healthy | not verified: failed/policy_denied, robots refused, 644 ms | verified: success, robots overridden, 3280 ms | verified: success, robots overridden, 3912 ms |
| T061 | healthy | verified: success, 4977 ms, 1 cr | verified: success, 3079 ms | verified: success, 2356 ms |
| T062 | healthy | verified: success, 33481 ms, 5 cr | verified: success, 6263 ms | verified: success, 6680 ms |
| T063 | healthy | verified: success, 1764 ms, 1 cr | verified: success, 1072 ms | verified: success, 1181 ms |
| T067 | healthy | not verified: blocked/cloudflare_challenge, 2866 ms | verified: success, 5002 ms | verified: success, 5844 ms |
| T072 | healthy | not verified: failed/http_error, 6413 ms | verified: success, 4518 ms | verified: success, 2160 ms |
| T074 | healthy | verified: success, 3699 ms, 1 cr | verified: success, 1509 ms | verified: success, 1197 ms |
| T077 | healthy | verified: success, 1081 ms, 1 cr | verified: success, 2746 ms | verified: success, 2153 ms |
| T079 | healthy | not verified: failed/policy_denied, robots refused, 1062 ms | verified: success, robots overridden, 2559 ms | verified: success, robots overridden, 2205 ms |
| T080 | healthy | not verified: failed/policy_denied, robots refused, 811 ms | verified: success, robots overridden, 2396 ms | verified: success, robots overridden, 2904 ms |
| T001 | challenge | not verified: blocked/captcha, 2199 ms | not verified: blocked/cloudflare_challenge, 3247 ms | verified: success, 10155 ms |
| T002 | challenge | not verified: blocked/cloudflare_challenge, 2643 ms | not verified: blocked/cloudflare_challenge, 2854 ms | verified: success, 10917 ms |
| T005 | challenge | not verified: blocked/bot_detected_generic, 3190 ms | not verified: blocked/bot_detected_generic, 3559 ms | verified: success, 13401 ms |
| T034 | challenge | not verified: blocked/captcha, 2182 ms | verified: success, 4982 ms | verified: success, 5961 ms |
| T038 | challenge | not verified: blocked/bot_detected_generic, 3041 ms | not verified: blocked/captcha, 3157 ms | not verified: blocked/captcha, 5816 ms |
| T045 | challenge | not verified: blocked/captcha, 3615 ms | not verified: blocked/captcha, 3945 ms | not verified: blocked/captcha, 6538 ms |
| T046 | challenge | not verified: blocked/captcha, 3341 ms | not verified: blocked/bot_detected_generic, 4510 ms | verified: success, 12369 ms |
| T047 | challenge | not verified: blocked/cloudflare_challenge, 2707 ms | not verified: blocked/cloudflare_challenge, 2579 ms | verified: success, 11233 ms |
| T048 | challenge | not verified: blocked/cloudflare_challenge, 2242 ms | not verified: blocked/cloudflare_challenge, 3231 ms | not verified: blocked/cloudflare_challenge, 13616 ms |
| T049 | challenge | not verified: failed/policy_denied, robots refused, 974 ms | not verified: blocked/bot_detected_generic, robots overridden, 2927 ms | verified: success, robots overridden, 14464 ms |
| T053 | challenge | not verified: blocked/bot_detected_generic, 3091 ms | not verified: blocked/bot_detected_generic, 3677 ms | verified: success, 8392 ms |
| T068 | challenge | not verified: blocked/cloudflare_challenge, 2538 ms | not verified: blocked/bot_detected_generic, 2764 ms | not verified: blocked/bot_detected_generic, 14800 ms |
| T071 | challenge | not verified: blocked/cloudflare_challenge, 2604 ms | not verified: blocked/cloudflare_challenge, 2124 ms | verified: success, 11488 ms |
| T076 | challenge | not verified: blocked/cloudflare_challenge, 2946 ms | not verified: blocked/cloudflare_challenge, 2282 ms | verified: success, 8480 ms |
| B001 | challenge | not verified: blocked/cloudflare_challenge, 2719 ms | not verified: blocked/cloudflare_challenge, 2863 ms | verified: success, 7857 ms |
| B008 | challenge | not verified: failed/policy_denied, robots refused, 1015 ms | not verified: blocked/bot_detected_generic, robots overridden, 13528 ms | verified: success, robots overridden, 25532 ms |
| T003 | rotation | not verified: blocked/cloudflare_challenge, 2546 ms | not verified: blocked/cloudflare_challenge, 3466 ms | verified: success, 12351 ms |
| T004 | rotation | not verified: blocked/geo_restricted, 4483 ms | not verified: blocked/geo_restricted, 4267 ms | not verified: failed/connection_error, 6522 ms |
| T006 | rotation | not verified: blocked/captcha, 3406 ms | verified: success, 7859 ms | verified: success, 7481 ms |
| T007 | rotation | not verified: blocked/bot_detected_generic, 2299 ms | verified: success, 6644 ms | verified: success, 5338 ms |
| T009 | rotation | verified: success, 18694 ms, 5 cr | verified: success, 14408 ms | verified: success, 14386 ms |
| T010 | rotation | not verified: failed/empty_unverified, 19904 ms | false success: success, 19209 ms | false success: success, 35417 ms |
| T011 | rotation | not verified: failed/empty_unverified, 8966 ms | false success: success, 14062 ms | verified: success, 6576 ms |
| T012 | rotation | not verified: blocked/captcha, 9180 ms | not verified: failed/empty_unverified, 14291 ms | not verified: failed/empty_unverified, 18113 ms |
| T013 | rotation | not verified: blocked/geo_restricted, 16268 ms | not verified: blocked/geo_restricted, 13498 ms | not verified: blocked/geo_restricted, 16993 ms |
| T014 | rotation | not verified: blocked/bot_detected_generic, 1767 ms | not verified: blocked/bot_detected_generic, 2991 ms | not verified: blocked/bot_detected_generic, 4024 ms |

## Window 2 context (written after the run)

The sections above are the runner's output as printed. What follows was added by hand from the run's raw data (`.w2l/hosted-parity/2026-10-28T03-07-02-218Z/`, git-ignored), gcloud and git; window 1's figures are from its record, `2026-10-27-parity-window-21edea41.md`, and its raw `attempts.jsonl`.

### Command, keys and grant

- Same as window 1 except the date, the record name and `--grant`. `--grant` names the main checkout's `.w2l/access/installed-chrome-grant.json` because this worktree holds an older grant file at the runner's default path (SHA-256 `9c6ec6bb…`); the grant used has the SHA-256 window 1 recorded (`09fdeafe…bd818`), installed_chrome only.
- The key file is the one window 1 used. No key or grant is in this record.
- Built with `npx tsc --build` at dc9d3eac before the start; the runner's own check (above) found `packages/*/dist` up to date. Proxied through `HTTPS_PROXY=http://127.0.0.1:7890`, as window 1.

### Timing

| | Planned start | Actual start (UTC) | Finished (UTC) |
| --- | --- | --- | --- |
| Window 1 | 2026-10-27 01:00 | 2026-10-27T01:00:09.776Z | 2026-10-27T01:17:31.925Z |
| Window 2 | 2026-10-28 00:02 | 2026-10-28T03:07:02.218Z | 2026-10-28T03:23:44.310Z |

Window 2 started about 3 h 05 min after its planned 00:02 UTC: the session that held its timer was archived on 2026-10-27 at 06:22 UTC and the timer was lost. The two windows started about 26 h 07 min apart, on different UTC days, both within the same ISO week (44) and rotation group (0).

### Serving revision

Read with `gcloud run services describe octocrawl-api --project octopus-w2l-20260924-7r7 --region asia-southeast1` (and `gcloud run revisions describe` / `revisions list`), proxied:

| Read at (UTC) | Revision with 100 % of traffic | Tag | W2L_SOURCE_COMMIT | latestReadyRevisionName |
| --- | --- | --- | --- | --- |
| 2026-10-28T03:06:18Z (before the start) | octocrawl-api-o6-a4cb713 | h39o6 | a4cb713b15405071c68e12034724e652fc03f4ab | octocrawl-api-o6-a4cb713 |
| 2026-10-28T03:24:06Z (after the end) | octocrawl-api-o6-a4cb713 | h39o6 | a4cb713b15405071c68e12034724e652fc03f4ab | octocrawl-api-o6-a4cb713 |

The newest revision of the service at the end was still `octocrawl-api-o6-a4cb713` (created 2026-10-27T05:27:35Z), so no revision was created during the window. Nothing was deployed for it.

### Both windows ran different code

Per-task differences between the windows mix day-to-day variation in the sites with code changes. They are not a reproduction check.

- **Hosted:** window 1 ran on `h38gates` (octocrawl-api-gates-453b210, main 453b2105); window 2 on `h39o6` (main a4cb713b). The commits between 453b2105 and a4cb713b that touch `packages/` include engine changes that hosted runs too: #712 (climb past a vendor challenge sent with 429), #720 (one robots.txt cache per run), #721 (O6 HTTP header cap), #723 (O7 provider-call timing and CDP connect cap), #702 (developer.android.com, help.autodesk.com), #725 (provider session release), #708 (hosted json model fallback), #707 (F2), #728 (hosted parity board). The range also holds local-only changes, which hosted does not run: #722 (installed_chrome waits by gate) and #714/#715/#718/#719 (CapSolver). Window 1's local arms already ran all of these but #728. Merged changes after a4cb713b (#732, #734 to #737, #739, #742, #745) are not deployed.
- **Local arms:** window 1 ran 21edea41, window 2 dc9d3eac. 21edea41 is a branch commit whose parent is be55357b (#725); the commits in be55357b..dc9d3eac that touch `packages/` or `research/hosted/` are:

  | Commit | PR | What it touches |
  | --- | --- | --- |
  | 30f07eab | #727 | tests only: installedChrome.integration.test.ts |
  | 22c02f07 | #728 | hosted parity board: hostedApi.ts, hostedJobWorker.ts, hostedParity.ts |
  | 0634f85a | #729 | the parity window runner (merged form of 21edea41) |
  | e8036162 | #731 | the runner: the "robots.txt allows" columns |
  | ee834e05 | #732 | engine.ts `observe` hook for hosted's phase log; hostedApi.ts |
  | 8ece08ab | #733 | tests only: runtime captchaReport and runSetReport tests |
  | 6936fd7b | #734 | hosted refusal of regex verify checks moved to contracts/verify.ts (`hostedVerifyRefusal`); hosted job routes |
  | 31ae5cb0 | #735 | hosted lists get_scrape; results.ts/server.ts keep a scrape id in minimal (hosted) results |
  | 4eea7481 | #737 | hosted MCP timeouts |
  | 0c6c6348 | #736 | per-call `compatible_transport` on hosted (engine.ts, bench compatTransport/compatGuard/resilientHttp) |
  | 17ecc209 | #738 | tests only: runtime k1Arms and speedPhases tests |
  | 6a57fc3b | #739 | `checkCrawlStart`/`checkBatchStart` for hosted job starts (engine.ts) |
  | d526c34f | #742 | hosted MCP scrape cancelled by the client |
  | 4fba4ed0 | #745 | hosted Chrome address guard; installedChrome.ts takes an optional profile seed (none for installed_chrome) |

  By reading the diffs (not by a measurement), these change hosted paths, the runner, or refactor shared code without an intended change to a local scrape: neither local arm holds `compatible_transport`, `minimalResults` is off on a local host, and installed_chrome passes no profile seed. That reading is unverified; the window does not isolate it.

### Verified counts, both windows

| Arm | Window 1 (2026-10-27) | Window 2 (2026-10-28) | Window 1, robots.txt allows | Window 2, robots.txt allows |
| --- | --- | --- | --- | --- |
| hosted | 15 / 51 | 14 / 51 | 15 / 45 | 14 / 45 |
| local | 23 / 51 | 25 / 51 | 19 / 45 | 21 / 45 |
| local_grant | 37 / 51 | 40 / 51 | 31 / 45 | 34 / 45 |

Window 1's record has no "robots.txt allows" column; its figures here are counted from its per-task table over the same 45 tasks (all but T041, T059, T079, T080, T049, B008, which hosted refused in both windows).

Tasks whose verdict changed between the windows (verified V, false success F, not verified N):

- hosted (1): T067 V → N (cloudflare_challenge).
- local (5): T020 N → V, T067 N → V, T034 N → V, T010 N → F, T011 V → F.
- local_grant (6): T005 N → V, T034 N → V, T046 N → V, T071 N → V, T068 V → N (bot_detected_generic), T012 F → N (empty_unverified).

### The five gaps and T067

| Task | hosted (w1 → w2) | local (w1 → w2) | local_grant (w1 → w2) |
| --- | --- | --- | --- |
| T051 | blocked/cloudflare_challenge → blocked/cloudflare_challenge (1949 ms) | verified → verified (5019 ms) | verified → verified (6063 ms) |
| T072 | failed/http_error → failed/http_error (6413 ms) | verified → verified (4518 ms, http) | verified → verified (2160 ms, http) |
| T006 | blocked/captcha → blocked/captcha (3406 ms) | verified → verified (7859 ms) | verified → verified (7481 ms) |
| T007 | blocked/rate_limit on the http lane → blocked/bot_detected_generic on the browser lane (2299 ms) | verified → verified (6644 ms, result cut at 50,000 characters) | verified → verified (5338 ms, cut likewise) |
| T011 | failed/empty_unverified → failed/empty_unverified (8966 ms, readiness not_loaded) | verified → **false success** (status success, readiness not_served, markdownCountMin failed; 14062 ms) | verified → verified (6576 ms) |
| T067 | **verified (6203 ms, 5 cr) → blocked/cloudflare_challenge** (2866 ms, 0 cr) | **blocked/cloudflare_challenge → verified** (5002 ms) | verified → verified (5844 ms) |

All five gaps are still open on hosted: each of T051, T072, T006, T007 and T011 is verified by local_grant and not by hosted in both windows, and by local in both windows except T011 in window 2. T067 swapped between hosted and local, and local_grant verified it in both windows; one run per window cannot say whether that is the site or the code.

### Hosted latency

| | Window 1 (h38gates) | Window 2 (h39o6) |
| --- | --- | --- |
| p50, all 51 calls | 3158 ms | 3091 ms |
| p95, all 51 calls | 77213 ms | 24412 ms |
| p50, verified calls only | 4661 ms (15) | 10864 ms (14) |

Window 1's slowest hosted calls were T009 (80331 ms), T024 (79381 ms) and T013 (77213 ms); in window 2 they took 18694, 54529 and 16268 ms, and the slowest was T024. With 51 calls the p95 rests on the third-slowest call. The window does not show which change, if any, moved it; the deployed O6 header cap (#721) is one candidate, untested here. The verified p50 rose because the verified set changed: T067 (6203 ms) left it, and T033 took the browser lane (10864 ms, 5 cr) where window 1 read it over HTTP (4661 ms, 1 cr).

### Credits

Hosted used 47 credits by the runner's inference (hostedCredits.ts scrapeCharge) against the cap of 150, so no call was held back (0 not run). Window 1 used 48. Both are inferred figures: the account's ledger was not read.

### Notes

- In both windows hosted answered `verification: "not_requested"` on 49 of 51 calls and `"failed"` on 2 (T052, T010). Only T052 and T010 have a predicate of a type hosted lists (minTables); the other 49 tasks' predicates are regular-expression checks (markdownMatches, markdownCountMin), which hosted does not list, so the runner sent hosted no contract for them. The verdicts in this record are the runner's own predicates on each result, on every arm, as in window 1.
- local and local_grant answered T010 with status success and a failed check (false success) in window 2; local_grant did the same in window 1.
