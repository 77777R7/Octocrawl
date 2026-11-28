# Weekly rerun: Octocrawl free arm, 2026-11-23

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `free`, week 2026-W48, run on 2026-11-23
- Source commit: `bbd04eae`
- Set: 51 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 10 (group 0 of 0–3, ISO week 48 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T003, T004, T006, T007, T009, T010, T011, T012, T013, T014
- Chrome: Google Chrome 157.0.8103.79 (previous weekly record: Google Chrome 156.0.8078.47; major version changed, the 16 tasks were run twice)
- API: http://127.0.0.1:8799, started by this script twice: with W2L_ACCESS_GRANT=/Users/howard07/Code/w2l/.claude/worktrees/pa-weekly/.w2l/access/installed-chrome-grant.json (SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818`, capabilities: installed_chrome) for the healthy and rotation tasks with access "standard", then with W2L_ACCESS_GRANT=/Users/howard07/Code/w2l/.w2l/access/ic-compat-grant-k1.json (SHA-256 `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`, capabilities: installed_chrome, compatible_transport; compatible_transport on its default hosts) for the 16 challenge tasks with "enhanced"; stopped after each
- installed_chrome on the 16 tasks: 10 of 16 verified against the acceptance baseline (ADR 0005, 7b56397b: final runs 11 and 7 of 16, probe runs 12 and 12): at or above the lower accepted run (7), below the higher (11) (run free-ic16)
- installed_chrome on the 16 tasks: 9 of 16 verified against the acceptance baseline (ADR 0005, 7b56397b: final runs 11 and 7 of 16, probe runs 12 and 12): at or above the lower accepted run (7), below the higher (11) (run free-ic16-rerun)
- Cost: $0 (no paid route; the Clash exit's bandwidth is not metered: unknown)
- Not run by the runner (its early stop): none

| Part | Planned | Attempted | Verified | False success |
| --- | --- | --- | --- | --- |
| all | 51 | 51 | 38 | 1 |
| healthy | 25 | 25 | 21 | 0 |
| challenge | 16 | 16 | 10 | 0 |
| rotation | 10 | 10 | 7 | 1 |

## Run: free-standard

Raw run: `.w2l/access/runs/2026-11-23T02-41-46-258Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --set all --only T015,T016,T020,T024,T027,T033,T035,T036,T039,T040,T041,T044,T051,T052,T058,T059,T061,T062,T063,T067,T072,T074,T077,T079,T080,T003,T004,T006,T007,T009,T010,T011,T012,T013,T014 --access "standard" --record .w2l/access/weekly/2026-11-23-bbd04eae/free-standard.md`
- Source commit: `bbd04eae`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8799; access option: `"standard"`
- Exit address: not recorded
- Grant: SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-11-23T02:41:46.258Z → 2026-11-23T02:46:59.653Z
- Tasks: 35 from `research/access/tasks.v1.json` (set `all`, only T015, T016, T020, T024, T027, T033, T035, T036, T039, T040, T041, T044, T051, T052, T058, T059, T061, T062, T063, T067, T072, T074, T077, T079, T080, T003, T004, T006, T007, T009, T010, T011, T012, T013, T014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 35, attempted 35, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 35 | 28 | 1 | 5968 | 21313 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 28, not_loaded 0, not_extracted 0, not_served 7, unknown 0; region waits: 16 (held on 13; scrolled on 1, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 35 (time left at its start: median 300000 ms, least 299998 ms); browser_local on 19 (time left at its start: median 297436 ms, least 30000 ms)
- Verified answers by the route that delivered them (cold): http 15, browser 13
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T004: unreachable, timeout, set aside; T041: rule /homes/, set aside; T059: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T003 | cold | yes | success |  | 200 | http | http |  | 4234 | ready (verified) |
| T004 | cold | yes | success |  | 200 | http | http |  | 12440 | ready (verified) |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14066 | ready (verified); region held in 3985 ms |
| T007 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8770 | ready (verified); region held in 667 ms |
| T009 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 19911 | ready (verified); region held in 619 ms |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | minTables | 21313 | not_served (redirected_off_page); region not held in 9879 ms |
| T011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 20228 | ready (verified); region held in 9737 ms |
| T012 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 25282 | not_served (captcha); region not held in 9628 ms, 1 screen scrolled |
| T013 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 20822 | ready (verified); region held in 991 ms |
| T014 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 6128 | not_served (http_error) |
| T015 | cold | yes | success |  | 200 | http | http |  | 3697 | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 11587 | ready (verified); region held in 900 ms |
| T020 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 12303 | ready (verified); region held in 760 ms |
| T024 | cold | yes | success |  | 200 | http | http |  | 5968 | ready (verified) |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 3681 | not_served (http_error) |
| T033 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6982 | ready (verified); region held in 698 ms |
| T035 | cold | yes | success |  | 200 | http | http |  | 4266 | ready (verified) |
| T036 | cold | yes | success |  | 200 | http | http |  | 5015 | ready (verified) |
| T039 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 17475 | not_served (captcha); region not held in 9690 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 4706 | ready (verified) |
| T041 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 5302 | not_served (captcha) |
| T044 | cold | yes | success |  | 200 | http | http |  | 4988 | ready (verified) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 9403 | ready (verified); region held in 706 ms |
| T052 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7276 | ready (verified); region held in 571 ms |
| T058 | cold | yes | success |  | 200 | http | http |  | 3043 | ready (verified) |
| T059 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 5476 | not_served (login_wall) |
| T061 | cold | yes | success |  | 200 | http | http |  | 4811 | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14345 | ready (verified); region held in 891 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 3481 | ready (verified) |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7301 | ready (verified); region held in 609 ms |
| T072 | cold | yes | success |  | 200 | http | http |  | 4520 | ready (verified) |
| T074 | cold | yes | success |  | 200 | http | http |  | 3246 | ready (verified) |
| T077 | cold | yes | success |  | 200 | http | http |  | 2959 | ready (verified) |
| T079 | cold | yes | success |  | 200 | http | http |  | 2443 | ready (verified) |
| T080 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5835 | ready (verified); region held in 671 ms |
- Task contract (cold): the product's verification agreed with the runner on 35 of 35 attempts that carry one (28 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Run: free-ic16

Raw run: `.w2l/access/runs/2026-11-23T02-47-01-767Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --access "enhanced" --save-responses --record .w2l/access/weekly/2026-11-23-bbd04eae/free-ic16.md`
- Source commit: `bbd04eae`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8799; access option: `"enhanced"`
- Exit address: not recorded
- Grant: SHA-256 `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`; capabilities: installed_chrome, compatible_transport (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-11-23T02:47:01.767Z → 2026-11-23T02:50:47.249Z
- Tasks: 16 from `research/access/tasks.v1.json` (set `all`, only T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 16, attempted 16, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 16 | 10 | 0 | 16449 | 27647 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 10, not_loaded 0, not_extracted 0, not_served 6, unknown 0; region waits: 9 (held on 9; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 16 (time left at its start: median 300000 ms, least 299998 ms); browser_local on 15 (time left at its start: median 298023 ms, least 297323 ms); installed_chrome on 13 (time left at its start: median 294913 ms, least 283014 ms)
- Verified answers by the route that delivered them (cold): http 1, browser 2, installed_chrome 7
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 2 (T049: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 17647 | not_served (cloudflare_challenge) |
| T002 | cold | yes | success |  | 200 | http | http |  | 2769 | ready (verified) |
| T005 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 9229 | ready (verified); region held in 2708 ms, 2 screens scrolled |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7582 | ready (verified); region held in 791 ms |
| T038 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 16449 | ready (verified); region held in 743 ms |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 8690 | not_served (captcha) |
| T046 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 16543 | ready (verified); region held in 834 ms |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 17468 | not_served (cloudflare_challenge) |
| T048 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8784 | ready (verified); region held in 693 ms |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 17605 | not_served (bot_detected_generic) |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 13992 | ready (verified); region held in 605 ms |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 18485 | not_served (bot_detected_generic) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 18313 | not_served (cloudflare_challenge) |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 12366 | ready (verified); region held in 624 ms |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 11815 | ready (verified); region held in 729 ms |
| B008 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 27647 | ready (verified); region held in 4944 ms |
- Task contract (cold): the product's verification agreed with the runner on 16 of 16 attempts that carry one (10 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Run: free-ic16-rerun

Raw run: `.w2l/access/runs/2026-11-23T02-50-47-333Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --access "enhanced" --save-responses --record .w2l/access/weekly/2026-11-23-bbd04eae/free-ic16-rerun.md`
- Source commit: `bbd04eae`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8799; access option: `"enhanced"`
- Exit address: not recorded
- Grant: SHA-256 `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`; capabilities: installed_chrome, compatible_transport (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-11-23T02:50:47.333Z → 2026-11-23T02:54:06.105Z
- Tasks: 16 from `research/access/tasks.v1.json` (set `all`, only T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 16, attempted 16, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 16 | 9 | 0 | 14217 | 25681 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 9, not_loaded 0, not_extracted 0, not_served 7, unknown 0; region waits: 8 (held on 8; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 16 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 15 (time left at its start: median 299252 ms, least 298634 ms); installed_chrome on 13 (time left at its start: median 297028 ms, least 284803 ms)
- Verified answers by the route that delivered them (cold): http 1, browser 2, installed_chrome 6
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 2 (T049: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 15019 | not_served (cloudflare_challenge) |
| T002 | cold | yes | success |  | 200 | http | http |  | 1595 | ready (verified) |
| T005 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 9240 | ready (verified); region held in 4300 ms, 3 screens scrolled |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7645 | ready (verified); region held in 783 ms |
| T038 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 13991 | ready (verified); region held in 755 ms |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 5859 | not_served (captcha) |
| T046 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 14217 | ready (verified); region held in 773 ms |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 14971 | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 14390 | not_served (cloudflare_challenge) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 15232 | not_served (bot_detected_generic) |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10426 | ready (verified); region held in 605 ms |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 16079 | not_served (bot_detected_generic) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 15214 | not_served (cloudflare_challenge) |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10079 | ready (verified); region held in 618 ms |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9041 | ready (verified); region held in 708 ms |
| B008 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 25681 | ready (verified); region held in 4832 ms |
- Task contract (cold): the product's verification agreed with the runner on 16 of 16 attempts that carry one (9 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
