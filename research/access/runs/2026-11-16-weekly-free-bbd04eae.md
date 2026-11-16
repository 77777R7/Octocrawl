# Weekly rerun: Octocrawl free arm, 2026-11-16

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `free`, week 2026-W47, run on 2026-11-16
- Source commit: `bbd04eae`
- Set: 47 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 6 (group 3 of 0–3, ISO week 47 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T066, T069, T070, T075, T078, T081
- Chrome: Google Chrome 157.0.8103.51 (previous weekly record: Google Chrome 156.0.8078.47; major version changed, the 16 tasks were run twice)
- API: http://127.0.0.1:8799, started by this script twice: with W2L_ACCESS_GRANT=/Users/howard07/Code/w2l/.claude/worktrees/pa-weekly/.w2l/access/installed-chrome-grant.json (SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818`, capabilities: installed_chrome) for the healthy and rotation tasks with access "standard", then with W2L_ACCESS_GRANT=/Users/howard07/Code/w2l/.w2l/access/ic-compat-grant-k1.json (SHA-256 `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`, capabilities: installed_chrome, compatible_transport; compatible_transport on its default hosts) for the 16 challenge tasks with "enhanced"; stopped after each
- installed_chrome on the 16 tasks: 4 of 16 verified against the acceptance baseline (ADR 0005, 7b56397b: final runs 11 and 7 of 16, probe runs 12 and 12): **below the lower accepted run (7); stop the default recommendation, retest pending** (run free-ic16)
- installed_chrome on the 16 tasks: 3 of 16 verified against the acceptance baseline (ADR 0005, 7b56397b: final runs 11 and 7 of 16, probe runs 12 and 12): **below the lower accepted run (7); stop the default recommendation, retest pending** (run free-ic16-rerun)
- Cost: $0 (no paid route; the Clash exit's bandwidth is not metered: unknown)
- Not run by the runner (its early stop): none

| Part | Planned | Attempted | Verified | False success |
| --- | --- | --- | --- | --- |
| all | 47 | 47 | 19 | 1 |
| healthy | 25 | 25 | 15 | 0 |
| challenge | 16 | 16 | 4 | 0 |
| rotation | 6 | 6 | 0 | 1 |

## Run: free-standard

Raw run: `.w2l/access/runs/2026-11-16T06-20-08-616Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --set all --only T015,T016,T020,T024,T027,T033,T035,T036,T039,T040,T041,T044,T051,T052,T058,T059,T061,T062,T063,T067,T072,T074,T077,T079,T080,T066,T069,T070,T075,T078,T081 --access "standard" --record .w2l/access/weekly/2026-11-16-bbd04eae/free-standard.md`
- Source commit: `bbd04eae`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8799; access option: `"standard"`
- Exit address: not recorded
- Grant: SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-11-16T06:20:08.616Z → 2026-11-16T08:34:27.852Z
- Tasks: 31 from `research/access/tasks.v1.json` (set `all`, only T015, T016, T020, T024, T027, T033, T035, T036, T039, T040, T041, T044, T051, T052, T058, T059, T061, T062, T063, T067, T072, T074, T077, T079, T080, T066, T069, T070, T075, T078, T081); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 31, attempted 31, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 31 | 15 | 1 | 7272 | 1033955 | unknown | unknown |

- Paid provider calls (cold): unknown; tasks verified with a paid call's page as the answer: unknown; charged by the spend ledger: unknown (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 15, not_loaded 0, not_extracted 0, not_served 7, unknown 9; region waits: 6 (held on 5; scrolled on 1, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none; not known on 9 attempts without a ladder trace

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 22 (time left at its start: median 300000 ms, least 299998 ms); browser_local on 10 (time left at its start: median 297272 ms, least 296625 ms)
- Verified answers by the route that delivered them (cold): browser 5, http 10
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 4 (T059: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside); not known on 9 attempts without a robots check

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T015 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 705800 | unknown |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 18241 | ready (verified); region held in 2464 ms |
| T020 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 16278 | ready (verified); region held in 1071 ms |
| T024 | cold | yes | success |  | 200 | http | http |  | 8389 | ready (verified) |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 3474 | not_served (http_error) |
| T033 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 905332 | unknown |
| T035 | cold | yes | success |  | 200 | http | http |  | 5418 | ready (verified) |
| T036 | cold | yes | success |  | 200 | http | http |  | 5860 | ready (verified) |
| T039 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 1023673 | unknown |
| T040 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 989718 | unknown |
| T041 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 682982 | unknown |
| T044 | cold | yes | success |  | 200 | http | http |  | 5444 | ready (verified) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 11427 | ready (verified); region held in 774 ms |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | minTables, markdownMatches | 4750 | not_served (cloudflare_challenge) |
| T058 | cold | yes | success |  | 200 | http | http |  | 5166 | ready (verified) |
| T059 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 7203 | not_served (login_wall) |
| T061 | cold | yes | success |  | 200 | http | http |  | 5341 | ready (verified) |
| T062 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 1026419 | unknown |
| T063 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 1033955 | unknown |
| T066 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 1078703 | unknown |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7396 | ready (verified); region held in 649 ms |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 5073 | not_served (cloudflare_challenge) |
| T070 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 7272 | not_served (bot_detected_generic) |
| T072 | cold | yes | success |  | 200 | http | http |  | 4691 | ready (verified) |
| T074 | cold | yes | success |  | 200 | http | http |  | 3517 | ready (verified) |
| T075 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 452825 | unknown |
| T077 | cold | yes | success |  | 200 | http | http |  | 2785 | ready (verified) |
| T078 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownMatches, markdownMatches | 18169 | not_served (checks_failed, region_absent); region not held in 9939 ms, 2 screens scrolled |
| T079 | cold | yes | success |  | 200 | http | http |  | 3278 | ready (verified) |
| T080 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6049 | ready (verified); region held in 709 ms |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 2913 | not_served (http_error) |
- Task contract (cold): the product's verification agreed with the runner on 22 of 22 attempts that carry one (15 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Run: free-ic16

Raw run: `.w2l/access/runs/2026-11-16T08-34-32-024Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --access "enhanced" --save-responses --record .w2l/access/weekly/2026-11-16-bbd04eae/free-ic16.md`
- Source commit: `bbd04eae`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8799; access option: `"enhanced"`
- Exit address: not recorded
- Grant: SHA-256 `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`; capabilities: installed_chrome, compatible_transport (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-11-16T08:34:32.024Z → 2026-11-16T10:09:34.741Z
- Tasks: 16 from `research/access/tasks.v1.json` (set `all`, only T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 16, attempted 16, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 16 | 4 | 0 | 19426 | 1060931 | unknown | unknown |

- Paid provider calls (cold): unknown; tasks verified with a paid call's page as the answer: unknown; charged by the spend ledger: unknown (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 4, not_loaded 0, not_extracted 0, not_served 6, unknown 6; region waits: 3 (held on 3)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none; not known on 6 attempts without a ladder trace

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 10 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 9 (time left at its start: median 297574 ms, least 293685 ms); installed_chrome on 9 (time left at its start: median 294309 ms, least 289220 ms)
- Verified answers by the route that delivered them (cold): http 1, installed_chrome 3
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 2 (T049: rule /, set aside; T068: unreachable, timeout, set aside); not known on 6 attempts without a robots check

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 983425 | unknown |
| T002 | cold | yes | success |  | 200 | http | http |  | 2857 | ready (verified) |
| T005 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 922855 | unknown |
| T034 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 953035 | unknown |
| T038 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 589541 | unknown |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 9866 | not_served (captcha) |
| T046 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 18380 | ready (verified); region held in 923 ms |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 17578 | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | access_denied | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 14066 | not_served (access_denied) |
| T049 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 19426 | ready (verified); region held in 652 ms |
| T053 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches | 10129 | not_served (bot_detected_generic) |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 92936 | not_served (bot_detected_generic) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 17030 | not_served (cloudflare_challenge) |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 13540 | ready (verified); region held in 674 ms |
| B001 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 1060931 | unknown |
| B008 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 975889 | unknown |
- Task contract (cold): the product's verification agreed with the runner on 10 of 10 attempts that carry one (4 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Run: free-ic16-rerun

Raw run: `.w2l/access/runs/2026-11-16T10-09-34-826Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --access "enhanced" --save-responses --record .w2l/access/weekly/2026-11-16-bbd04eae/free-ic16-rerun.md`
- Source commit: `bbd04eae`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8799; access option: `"enhanced"`
- Exit address: not recorded
- Grant: SHA-256 `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`; capabilities: installed_chrome, compatible_transport (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-11-16T10:09:34.826Z → 2026-11-16T12:24:55.749Z
- Tasks: 16 from `research/access/tasks.v1.json` (set `all`, only T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 16, attempted 16, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 16 | 3 | 0 | 646887 | 1046721 | unknown | unknown |

- Paid provider calls (cold): unknown; tasks verified with a paid call's page as the answer: unknown; charged by the spend ledger: unknown (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 3, not_loaded 0, not_extracted 0, not_served 4, unknown 9; region waits: 2 (held on 2)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none; not known on 9 attempts without a ladder trace

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 7 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 6 (time left at its start: median 298771 ms, least 298141 ms); installed_chrome on 5 (time left at its start: median 295873 ms, least 294509 ms)
- Verified answers by the route that delivered them (cold): http 1, browser 1, installed_chrome 1
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 0; not known on 9 attempts without a robots check

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 940673 | unknown |
| T002 | cold | yes | success |  | 200 | http | http |  | 2566 | ready (verified) |
| T005 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 636145 | unknown |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 9154 | ready (verified); region held in 849 ms |
| T038 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 17139 | ready (verified); region held in 734 ms |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 7169 | not_served (captcha) |
| T046 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 1014372 | unknown |
| T047 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 917968 | unknown |
| T048 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 1046721 | unknown |
| T049 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 646887 | unknown |
| T053 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches | 7803 | not_served (bot_detected_generic) |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 17578 | not_served (bot_detected_generic) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 16142 | not_served (cloudflare_challenge) |
| T076 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 939346 | unknown |
| B001 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 941729 | unknown |
| B008 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 957933 | unknown |
- Task contract (cold): the product's verification agreed with the runner on 7 of 7 attempts that carry one (3 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
