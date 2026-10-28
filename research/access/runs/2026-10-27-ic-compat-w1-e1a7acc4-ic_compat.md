# installed_chrome with compatible_transport and no Steel, window 1, arm ic_compat, 2026-10-27

The runner's own records of this arm's runs in the window, copied whole; the comparison is in `2026-10-27-ic-compat-w1-e1a7acc4-summary.md`.

## ic_compat-first-b0 (2026-10-27T09:14:02.515Z → 2026-10-27T09:17:21.876Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-27T09-14-02-596Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T005,T006,T007,T008,T009,T010,T011,T012,T013,T014,T015,T016,T017,T018,T019,T020,T021,T022,T023 --save-responses --record .w2l/access/ic-compat/2026-10-27-w1/ic_compat-first-b0.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/ic-compat-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8852; access option: `"enhanced"`
- Exit address: 103.142.140.157
- Grant: SHA-256 `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`; capabilities: installed_chrome, compatible_transport (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-27T09:14:02.596Z → 2026-10-27T09:17:21.868Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020, T021, T022, T023); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 18 | 1 | 7193 | 28124 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 18, not_loaded 0, not_extracted 0, not_served 5, unknown 0; region waits: 14 (held on 12; scrolled on 3, held on 2 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 20 (time left at its start: median 300000 ms, least 299997 ms); browser_local on 17 (time left at its start: median 299082 ms, least 30000 ms); installed_chrome on 11 (time left at its start: median 297392 ms, least 281745 ms); http_compat on 3 (time left at its start: median 300000 ms, least 300000 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 6, browser 6, http_compat 3, http 3
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9299 | ready (verified); region held in 559 ms |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8305 | ready (verified); region held in 536 ms |
| T003 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10162 | ready (verified); region held in 559 ms |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 5040 | not_served (connection_error) |
| T005 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 11540 | ready (verified); region held in 2735 ms, 2 screens scrolled |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7501 | ready (verified); region held in 2433 ms |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 1543 | ready (verified) |
| T008 | cold | yes | success |  | 200 | http | http |  | 1907 | ready (verified) |
| T009 | cold | yes | success |  | 200 | http | http_compat |  | 910 | ready (verified) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | minTables | 33863 | not_served (checks_failed, region_absent); region not held in 9837 ms |
| T011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5443 | ready (verified); region held in 602 ms |
| T012 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 28124 | not_served (source_data_error); region not held in 9577 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 15781 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 3529 | not_served (bot_detected_generic) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1565 | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6066 | ready (verified); region held in 1003 ms |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4801 | ready (verified); region held in 680 ms |
| T018 | cold | yes | success |  | 200 | http | http_compat |  | 3606 | ready (verified) |
| T019 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 13656 | ready (verified); region held in 9103 ms, 7 screens scrolled |
| T020 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7550 | ready (verified); region held in 930 ms |
| T021 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9154 | ready (verified); region held in 867 ms |
| T022 | cold | yes | success |  | 200 | http | http |  | 1969 | ready (verified) |
| T023 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7193 | ready (verified); region held in 655 ms |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (18 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## ic_compat-first-b1 (2026-10-27T09:27:28.170Z → 2026-10-27T09:30:53.937Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-27T09-27-28-244Z`.

- Command: `node research/access/run-set.mjs --set all --only T024,T025,T026,T027,T029,T030,T031,T033,T034,T035,T036,T037,T038,T039,T040,T041,T042,T043,T044,T045,T046,T047,T048 --save-responses --record .w2l/access/ic-compat/2026-10-27-w1/ic_compat-first-b1.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/ic-compat-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8852; access option: `"enhanced"`
- Exit address: 103.142.140.136
- Grant: SHA-256 `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`; capabilities: installed_chrome, compatible_transport (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-27T09:27:28.244Z → 2026-10-27T09:30:53.931Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T024, T025, T026, T027, T029, T030, T031, T033, T034, T035, T036, T037, T038, T039, T040, T041, T042, T043, T044, T045, T046, T047, T048); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 16 | 0 | 6836 | 26239 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 16, not_loaded 0, not_extracted 0, not_served 7, unknown 0; region waits: 12 (held on 10; scrolled on 2, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 22 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 16 (time left at its start: median 298647 ms, least 297433 ms); installed_chrome on 12 (time left at its start: median 296303 ms, least 285586 ms); http_compat on 1 (time left at its start: median 300000 ms, least 300000 ms)
- Verified answers by the route that delivered them (cold): http 5, installed_chrome 6, browser 4, http_compat 1
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 1 (T041: rule /homes/, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T024 | cold | yes | success |  | 200 | http | http |  | 2144 | ready (verified) |
| T025 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 11674 | ready (verified); region held in 3056 ms |
| T026 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 10479 | ready (verified); region held in 863 ms |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 2964 | not_served (http_error) |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 2473 | ready (verified) |
| T030 | cold | no | blocked | login_wall | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 26239 | not_served (login_wall); region not held in 9894 ms, 1 screen scrolled |
| T031 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 27097 | not_served (captcha); region not held in 9784 ms |
| T033 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4602 | ready (verified); region held in 685 ms |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5612 | ready (verified); region held in 1355 ms |
| T035 | cold | yes | success |  | 200 | http | http |  | 1806 | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6934 | ready (verified); region held in 641 ms |
| T037 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 13455 | ready (verified); region held in 2696 ms, 2 screens scrolled |
| T038 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 12452 | ready (verified); region held in 723 ms |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7860 | ready (verified); region held in 757 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1613 | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 2581 | ready (verified) |
| T042 | cold | no | blocked | bot_detected_generic | 429 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 19728 | not_served (bot_detected_generic) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 6744 | not_served (bot_detected_generic) |
| T044 | cold | yes | success |  | 200 | http | http |  | 2944 | ready (verified) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 6836 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 5939 | not_served (captcha) |
| T047 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 11747 | ready (verified); region held in 914 ms |
| T048 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10875 | ready (verified); region held in 722 ms |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (16 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## ic_compat-first-b2 (2026-10-27T09:57:29.688Z → 2026-10-27T10:00:21.849Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-27T09-57-29-758Z`.

- Command: `node research/access/run-set.mjs --set all --only T049,T050,T051,T052,T053,T055,T056,T057,T058,T059,T060,T061,T062,T063,T064,T065,T066,T067,T068,T069,T070,T071,T072 --save-responses --record .w2l/access/ic-compat/2026-10-27-w1/ic_compat-first-b2.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/ic-compat-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8852; access option: `"enhanced"`
- Exit address: 103.142.140.59
- Grant: SHA-256 `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`; capabilities: installed_chrome, compatible_transport (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-27T09:57:29.758Z → 2026-10-27T10:00:21.843Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T049, T050, T051, T052, T053, T055, T056, T057, T058, T059, T060, T061, T062, T063, T064, T065, T066, T067, T068, T069, T070, T071, T072); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 16 | 0 | 4530 | 16023 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 16, not_loaded 0, not_extracted 0, not_served 7, unknown 0; region waits: 10 (held on 9)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 22 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 17 (time left at its start: median 299141 ms, least 297114 ms); installed_chrome on 9 (time left at its start: median 297680 ms, least 297004 ms); http_compat on 1 (time left at its start: median 300000 ms, least 300000 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 3, browser 7, http_compat 1, http 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T049: rule /, set aside; T052: unreachable, timeout, set aside; T059: rule /, set aside; T064: rule /, set aside; T066: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T049 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 13600 | ready (verified); region held in 776 ms |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 3814 | not_served (http_error) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4530 | ready (verified); region held in 739 ms |
| T052 | cold | no | failed | timeout |  | browser_local | http → browser_local | minTables, markdownMatches | 26970 | not_served (timeout) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches | 5093 | not_served (bot_detected_generic) |
| T055 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14763 | ready (verified); region held in 3134 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3575 | ready (verified); region held in 701 ms |
| T057 | cold | yes | success |  | 200 | http | http_compat |  | 1010 | ready (verified) |
| T058 | cold | yes | success |  | 200 | http | http |  | 939 | ready (verified) |
| T059 | cold | no | blocked | captcha | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 4193 | not_served (captcha) |
| T060 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 16023 | ready (verified); region not held in 9983 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 2849 | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6446 | ready (verified); region held in 917 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1106 | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 4135 | not_served (login_wall) |
| T065 | cold | yes | success |  | 200 | http | http |  | 1326 | ready (verified) |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6739 | ready (verified); region held in 1844 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3467 | ready (verified); region held in 634 ms |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 13695 | not_served (bot_detected_generic) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 12494 | not_served (cloudflare_challenge) |
| T070 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9428 | ready (verified); region held in 937 ms |
| T071 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 11131 | ready (verified); region held in 692 ms |
| T072 | cold | yes | success |  | 200 | http | http |  | 3889 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (16 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## ic_compat-first-b3 (2026-10-27T10:02:37.172Z → 2026-10-27T10:04:44.361Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-27T10-02-37-244Z`.

- Command: `node research/access/run-set.mjs --set all --only T073,T074,T075,T076,T077,T078,T079,T080,T081,B001,B002,B003,B004,B005,B006,B007,B008,B009,B010,B011,B012,B013,B014 --save-responses --record .w2l/access/ic-compat/2026-10-27-w1/ic_compat-first-b3.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/ic-compat-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8852; access option: `"enhanced"`
- Exit address: 103.142.140.59
- Grant: SHA-256 `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`; capabilities: installed_chrome, compatible_transport (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-27T10:02:37.244Z → 2026-10-27T10:04:44.354Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T073, T074, T075, T076, T077, T078, T079, T080, T081, B001, B002, B003, B004, B005, B006, B007, B008, B009, B010, B011, B012, B013, B014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 19 | 0 | 3889 | 14536 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 19, not_loaded 1, not_extracted 0, not_served 3, unknown 0; region waits: 11 (held on 10; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 11 (time left at its start: median 299134 ms, least 298372 ms); installed_chrome on 6 (time left at its start: median 297557 ms, least 286264 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 5, http 9, browser 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9865 | ready (verified); region held in 606 ms |
| T074 | cold | yes | success |  | 200 | http | http |  | 935 | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5191 | ready (verified); region held in 640 ms |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8581 | ready (verified); region held in 663 ms |
| T077 | cold | yes | success |  | 200 | http | http |  | 899 | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1543 | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 1812 | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2620 | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1298 | not_served (http_error) |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 4613 | ready (verified); region held in 752 ms |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7859 | ready (verified); region held in 828 ms |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 14536 | not_loaded (empty_unverified, little_text); region not held in 9543 ms |
| B004 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8371 | ready (verified); region held in 1200 ms |
| B005 | cold | yes | success |  | 200 | http | http |  | 5398 | ready (verified) |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5971 | ready (verified); region held in 657 ms |
| B007 | cold | yes | success |  | 200 | http | http |  | 3488 | ready (verified) |
| B008 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 24227 | ready (verified); region held in 4877 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 790 | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8787 | ready (verified); region held in 2411 ms, 2 screens scrolled |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3889 | ready (verified); region held in 562 ms |
| B012 | cold | yes | success |  | 200 | http | http |  | 1277 | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 3342 | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 988 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (19 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## ic_compat-retry (2026-10-27T10:08:56.551Z → 2026-10-27T10:12:58.550Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-27T10-08-56-618Z`.

- Command: `node research/access/run-set.mjs --set all --only T004,T010,T012,T013,T014,T027,T030,T031,T042,T043,T045,T046,T050,T052,T053,T059,T064,T068,T069,T078,T081,B003,B009 --save-responses --record .w2l/access/ic-compat/2026-10-27-w1/ic_compat-retry.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/ic-compat-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8852; access option: `"enhanced"`
- Exit address: 103.142.140.152
- Grant: SHA-256 `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`; capabilities: installed_chrome, compatible_transport (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-27T10:08:56.618Z → 2026-10-27T10:12:58.540Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T004, T010, T012, T013, T014, T027, T030, T031, T042, T043, T045, T046, T050, T052, T053, T059, T064, T068, T069, T078, T081, B003, B009); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 2 | 1 | 4609 | 27764 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 2, not_loaded 2, not_extracted 0, not_served 19, unknown 0; region waits: 7 (held on 2; scrolled on 2, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 19 (time left at its start: median 299555 ms, least 30000 ms); installed_chrome on 17 (time left at its start: median 298224 ms, least 284544 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 1, browser 1
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 4 (T052: unreachable, timeout, set aside; T059: rule /, set aside; T064: rule /, set aside; T081: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3626 | not_served (connection_error) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | minTables | 29540 | not_served (checks_failed, region_absent); region not held in 9880 ms |
| T012 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 25604 | not_served (source_data_error); region not held in 9683 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 14260 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 2809 | not_served (bot_detected_generic) |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 1754 | not_served (http_error) |
| T030 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 24851 | not_loaded (empty_unverified, little_text); region not held in 9503 ms, 1 screen scrolled |
| T031 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 27764 | not_served (captcha); region not held in 9963 ms |
| T042 | cold | no | blocked | bot_detected_generic | 429 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 17349 | not_served (bot_detected_generic) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 3590 | not_served (bot_detected_generic) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 4609 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 3349 | not_served (captcha) |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 2552 | not_served (http_error) |
| T052 | cold | no | failed | timeout |  | browser_local | http → browser_local | minTables, markdownMatches | 25838 | not_served (timeout) |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 5569 | ready (verified); region held in 617 ms |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2794 | ready (verified); region held in 654 ms |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3312 | not_served (login_wall) |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 13092 | not_served (bot_detected_generic) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 12226 | not_served (cloudflare_challenge) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 952 | not_served (rate_limit) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 911 | not_served (http_error) |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 14455 | not_loaded (empty_unverified, little_text); region not held in 9869 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 352 | not_served (http_error) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (2 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
