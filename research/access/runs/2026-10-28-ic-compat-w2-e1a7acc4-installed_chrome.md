# installed_chrome with compatible_transport and no Steel, window 2, arm installed_chrome, 2026-10-28

The runner's own records of this arm's runs in the window, copied whole; the comparison is in `2026-10-28-ic-compat-w2-e1a7acc4-summary.md`.

## installed_chrome-first-b0 (2026-10-28T00:02:13.400Z → 2026-10-28T00:06:01.507Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-28T00-02-13-491Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T005,T006,T007,T008,T009,T010,T011,T012,T013,T014,T015,T016,T017,T018,T019,T020,T021,T022,T023 --save-responses --record .w2l/access/ic-compat/2026-10-28-w2/installed_chrome-first-b0.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8851; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-28T00:02:13.491Z → 2026-10-28T00:06:01.500Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020, T021, T022, T023); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 17 | 2 | 8308 | 26384 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 17, not_loaded 1, not_extracted 0, not_served 5, unknown 0; region waits: 16 (held on 14; scrolled on 3, held on 2 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299997 ms); browser_local on 20 (time left at its start: median 299030 ms, least 30000 ms); installed_chrome on 13 (time left at its start: median 297765 ms, least 282037 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 7, browser 7, http 3
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8853 | ready (verified); region held in 566 ms |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8308 | ready (verified); region held in 560 ms |
| T003 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9480 | ready (verified); region held in 606 ms |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 4665 | not_served (connection_error) |
| T005 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9597 | ready (verified); region held in 2209 ms, 2 screens scrolled |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7285 | ready (verified); region held in 4127 ms |
| T007 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4822 | ready (verified); region held in 694 ms |
| T008 | cold | yes | success |  | 200 | http | http |  | 1842 | ready (verified) |
| T009 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 13454 | ready (verified); region held in 623 ms |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | minTables | 33148 | not_served (checks_failed, region_absent); region not held in 9614 ms |
| T011 | cold | no | failed | empty_unverified | 200 | http | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 15102 | not_loaded (empty_unverified, not_rendered) |
| T012 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 26384 | not_served (source_data_error); region not held in 9719 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 14721 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 3059 | not_served (bot_detected_generic) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1655 | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7925 | ready (verified); region held in 1072 ms |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7015 | ready (verified); region held in 747 ms |
| T018 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7842 | ready (verified); region held in 948 ms |
| T019 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14858 | ready (verified); region held in 9601 ms, 2 screens scrolled |
| T020 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10120 | ready (verified); region held in 973 ms |
| T021 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8547 | ready (verified); region held in 790 ms |
| T022 | cold | yes | success |  | 200 | http | http |  | 2488 | ready (verified) |
| T023 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 6134 | ready (verified); region held in 734 ms |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (17 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-first-b1 (2026-10-28T00:23:49.866Z → 2026-10-28T00:26:33.038Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-28T00-23-49-939Z`.

- Command: `node research/access/run-set.mjs --set all --only T024,T025,T026,T027,T029,T030,T031,T033,T034,T035,T036,T037,T038,T039,T040,T041,T042,T043,T044,T045,T046,T047,T048 --save-responses --record .w2l/access/ic-compat/2026-10-28-w2/installed_chrome-first-b1.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8851; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-28T00:23:49.939Z → 2026-10-28T00:26:33.034Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T024, T025, T026, T027, T029, T030, T031, T033, T034, T035, T036, T037, T038, T039, T040, T041, T042, T043, T044, T045, T046, T047, T048); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 15 | 0 | 5147 | 18850 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 15, not_loaded 0, not_extracted 0, not_served 8, unknown 0; region waits: 11 (held on 10; scrolled on 1, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 17 (time left at its start: median 299100 ms, least 30000 ms); installed_chrome on 11 (time left at its start: median 297296 ms, least 286860 ms)
- Verified answers by the route that delivered them (cold): http 5, installed_chrome 4, browser 6
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 1 (T041: rule /homes/, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T024 | cold | yes | success |  | 200 | http | http |  | 1950 | ready (verified) |
| T025 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 11274 | ready (verified); region held in 3631 ms |
| T026 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 18850 | ready (verified); region held in 707 ms |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 2480 | not_served (http_error) |
| T029 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5363 | ready (verified); region held in 752 ms |
| T030 | cold | no | blocked | login_wall | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 26332 | not_served (login_wall); region not held in 9989 ms, 1 screen scrolled |
| T031 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6357 | ready (verified); region held in 3176 ms |
| T033 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4709 | ready (verified); region held in 698 ms |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5847 | ready (verified); region held in 1378 ms |
| T035 | cold | yes | success |  | 200 | http | http |  | 1743 | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5040 | ready (verified); region held in 655 ms |
| T037 | cold | no | blocked | captcha | 429 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 5032 | not_served (captcha) |
| T038 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 4704 | not_served (captcha) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 6578 | ready (verified); region held in 724 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1200 | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 1476 | ready (verified) |
| T042 | cold | no | blocked | bot_detected_generic | 429 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 17664 | not_served (bot_detected_generic) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 5147 | not_served (bot_detected_generic) |
| T044 | cold | yes | success |  | 200 | http | http |  | 2442 | ready (verified) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 5833 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 4164 | not_served (captcha) |
| T047 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9664 | ready (verified); region held in 905 ms |
| T048 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8505 | ready (verified); region held in 680 ms |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (15 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-first-b2 (2026-10-28T00:29:03.074Z → 2026-10-28T00:31:29.541Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-28T00-29-03-148Z`.

- Command: `node research/access/run-set.mjs --set all --only T049,T050,T051,T052,T053,T055,T056,T057,T058,T059,T060,T061,T062,T063,T064,T065,T066,T067,T068,T069,T070,T071,T072 --save-responses --record .w2l/access/ic-compat/2026-10-28-w2/installed_chrome-first-b2.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8851; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-28T00:29:03.148Z → 2026-10-28T00:31:29.535Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T049, T050, T051, T052, T053, T055, T056, T057, T058, T059, T060, T061, T062, T063, T064, T065, T066, T067, T068, T069, T070, T071, T072); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 18 | 0 | 5055 | 13112 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 18, not_loaded 0, not_extracted 0, not_served 5, unknown 0; region waits: 13 (held on 12)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 18 (time left at its start: median 299296 ms, least 296241 ms); installed_chrome on 9 (time left at its start: median 298184 ms, least 297536 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 4, browser 9, http 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 4 (T049: rule /, set aside; T059: rule /, set aside; T064: rule /, set aside; T066: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T049 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 12859 | ready (verified); region held in 762 ms |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 3322 | not_served (http_error) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4962 | ready (verified); region held in 715 ms |
| T052 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5055 | ready (verified); region held in 572 ms |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7205 | ready (verified); region held in 612 ms |
| T055 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 12648 | ready (verified); region held in 3197 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3756 | ready (verified); region held in 716 ms |
| T057 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4151 | ready (verified); region held in 696 ms |
| T058 | cold | yes | success |  | 200 | http | http |  | 875 | ready (verified) |
| T059 | cold | no | blocked | captcha | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3364 | not_served (captcha) |
| T060 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 16173 | ready (verified); region not held in 9494 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 2320 | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5782 | ready (verified); region held in 909 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 889 | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3429 | not_served (login_wall) |
| T065 | cold | yes | success |  | 200 | http | http |  | 1260 | ready (verified) |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7352 | ready (verified); region held in 1260 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 5684 | ready (verified); region held in 627 ms |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 13112 | not_served (bot_detected_generic) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 12239 | not_served (cloudflare_challenge) |
| T070 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6199 | ready (verified); region held in 830 ms |
| T071 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8979 | ready (verified); region held in 696 ms |
| T072 | cold | yes | success |  | 200 | http | http |  | 4063 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (18 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-first-b3 (2026-10-28T00:36:26.933Z → 2026-10-28T00:38:23.879Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-28T00-36-26-996Z`.

- Command: `node research/access/run-set.mjs --set all --only T073,T074,T075,T076,T077,T078,T079,T080,T081,B001,B002,B003,B004,B005,B006,B007,B008,B009,B010,B011,B012,B013,B014 --save-responses --record .w2l/access/ic-compat/2026-10-28-w2/installed_chrome-first-b3.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8851; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-28T00:36:26.996Z → 2026-10-28T00:38:23.873Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T073, T074, T075, T076, T077, T078, T079, T080, T081, B001, B002, B003, B004, B005, B006, B007, B008, B009, B010, B011, B012, B013, B014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 19 | 0 | 4293 | 14168 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 19, not_loaded 1, not_extracted 0, not_served 3, unknown 0; region waits: 11 (held on 10; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 11 (time left at its start: median 299223 ms, least 298163 ms); installed_chrome on 6 (time left at its start: median 297737 ms, least 286659 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 5, http 9, browser 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10710 | ready (verified); region held in 1137 ms |
| T074 | cold | yes | success |  | 200 | http | http |  | 679 | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5090 | ready (verified); region held in 654 ms |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 6421 | ready (verified); region held in 662 ms |
| T077 | cold | yes | success |  | 200 | http | http |  | 1042 | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1454 | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 1155 | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2203 | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1130 | not_served (http_error) |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 6044 | ready (verified); region held in 723 ms |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6519 | ready (verified); region held in 857 ms |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 14168 | not_loaded (empty_unverified, little_text); region not held in 9477 ms |
| B004 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7638 | ready (verified); region held in 2104 ms |
| B005 | cold | yes | success |  | 200 | http | http |  | 4293 | ready (verified) |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5296 | ready (verified); region held in 664 ms |
| B007 | cold | yes | success |  | 200 | http | http |  | 4564 | ready (verified) |
| B008 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 21112 | ready (verified); region held in 2490 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 742 | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8232 | ready (verified); region held in 2393 ms, 2 screens scrolled |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3670 | ready (verified); region held in 573 ms |
| B012 | cold | yes | success |  | 200 | http | http |  | 1138 | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 1973 | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 878 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (19 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-retry (2026-10-28T00:54:31.771Z → 2026-10-28T00:57:55.301Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-28T00-54-31-851Z`.

- Command: `node research/access/run-set.mjs --set all --only T004,T010,T011,T012,T013,T014,T027,T030,T037,T038,T042,T043,T045,T046,T050,T059,T064,T068,T069,T078,T081,B003,B009 --save-responses --record .w2l/access/ic-compat/2026-10-28-w2/installed_chrome-retry.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8851; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-28T00:54:31.851Z → 2026-10-28T00:57:55.291Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T004, T010, T011, T012, T013, T014, T027, T030, T037, T038, T042, T043, T045, T046, T050, T059, T064, T068, T069, T078, T081, B003, B009); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 0 | 1 | 4211 | 28146 | unknown | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 0, not_loaded 2, not_extracted 0, not_served 21, unknown 0; region waits: 4 (held on 0; scrolled on 2, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 19 (time left at its start: median 299632 ms, least 30000 ms); installed_chrome on 19 (time left at its start: median 297993 ms, least 284227 ms)
- Verified answers by the route that delivered them (cold): none
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 3 (T059: rule /, set aside; T064: rule /, set aside; T081: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3474 | not_served (connection_error) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | minTables | 29932 | not_served (checks_failed, region_absent); region not held in 9952 ms |
| T011 | cold | no | failed | empty_unverified | 200 | http | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 14620 | not_loaded (empty_unverified, not_rendered) |
| T012 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 28146 | not_served (source_data_error); region not held in 9667 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 14274 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 2518 | not_served (bot_detected_generic) |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 1020 | not_served (http_error) |
| T030 | cold | no | blocked | login_wall | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 23790 | not_served (login_wall); region not held in 9501 ms, 1 screen scrolled |
| T037 | cold | no | blocked | captcha | 429 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 4211 | not_served (captcha) |
| T038 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 4251 | not_served (captcha) |
| T042 | cold | no | blocked | bot_detected_generic | 429 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 16126 | not_served (bot_detected_generic) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 3443 | not_served (bot_detected_generic) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 4734 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 3673 | not_served (captcha) |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 2399 | not_served (http_error) |
| T059 | cold | no | blocked | captcha | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 2804 | not_served (captcha) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 2906 | not_served (login_wall) |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 12894 | not_served (bot_detected_generic) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 11936 | not_served (cloudflare_challenge) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 918 | not_served (rate_limit) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 886 | not_served (http_error) |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 13496 | not_loaded (empty_unverified, little_text); region not held in 9593 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 248 | not_served (http_error) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (0 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
