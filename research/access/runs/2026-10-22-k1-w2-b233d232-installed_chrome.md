# K1 window 2, arm installed_chrome, 2026-10-22

The runner's own records of this arm's runs in the window, copied whole; the comparison is in `2026-10-22-k1-w2-b233d232-summary.md`.

## installed_chrome-first-b0 (2026-10-22T07:01:24.228Z → 2026-10-22T07:05:18.053Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-22T07-01-24-316Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T005,T006,T007,T008,T009,T010,T011,T012,T013,T014,T015,T016,T017,T018,T019,T020,T021,T022,T023 --save-responses --record .w2l/access/k1/2026-10-22-w2/installed_chrome-first-b0.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `b233d232` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8823; access option: `"enhanced"`
- Exit address: 103.142.140.135
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-22T07:01:24.316Z → 2026-10-22T07:05:18.047Z
- Tasks: 23 (set `all`, only T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020, T021, T022, T023); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 14 | 1 | 10257 | 21835 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 14, not_loaded 0, not_extracted 0, not_served 9, unknown 0; region waits: 14 (held on 11; scrolled on 3, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299997 ms); browser_local on 18 (time left at its start: median 298733 ms, least 30000 ms); installed_chrome on 11 (time left at its start: median 296290 ms, least 280410 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 5, browser 6, http 3
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 11273 | not_served (captcha) |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10970 | ready (verified); region held in 1067 ms |
| T003 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 16003 | ready (verified); region held in 582 ms |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 6645 | not_served (connection_error) |
| T005 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 12241 | ready (verified); region held in 2766 ms, 2 screens scrolled |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 10257 | ready (verified); region held in 5837 ms |
| T007 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 772 | not_served (rate_limit) |
| T008 | cold | yes | success |  | 200 | http | http |  | 2725 | ready (verified) |
| T009 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14596 | ready (verified); region held in 590 ms |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | minTables | 35078 | not_served (checks_failed, region_absent); region not held in 9927 ms |
| T011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6155 | ready (verified); region held in 1643 ms |
| T012 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 21835 | not_served (source_data_error); region not held in 9629 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13601 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 3950 | not_served (bot_detected_generic) |
| T015 | cold | yes | success |  | 200 | http | http |  | 2289 | ready (verified) |
| T016 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 11774 | not_served (connection_error); region held in 1131 ms |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5218 | ready (verified); region held in 691 ms |
| T018 | cold | no | blocked | captcha | 429 | http | http | markdownCountMin, markdownMatches | 1941 | not_served (captcha) |
| T019 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14949 | ready (verified); region not held in 9814 ms, 8 screens scrolled |
| T020 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8796 | ready (verified); region held in 892 ms |
| T021 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 11392 | ready (verified); region held in 794 ms |
| T022 | cold | yes | success |  | 200 | http | http |  | 2113 | ready (verified) |
| T023 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8231 | ready (verified); region held in 659 ms |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (14 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-first-b1 (2026-10-22T07:38:35.904Z → 2026-10-22T07:43:09.108Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-22T07-38-35-986Z`.

- Command: `node research/access/run-set.mjs --set all --only T024,T025,T026,T027,T029,T030,T031,T033,T034,T035,T036,T037,T038,T039,T040,T041,T042,T043,T044,T045,T046,T047,T048 --save-responses --record .w2l/access/k1/2026-10-22-w2/installed_chrome-first-b1.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `b233d232` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8823; access option: `"enhanced"`
- Exit address: 103.142.140.55
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-22T07:38:35.986Z → 2026-10-22T07:43:09.101Z
- Tasks: 23 (set `all`, only T024, T025, T026, T027, T029, T030, T031, T033, T034, T035, T036, T037, T038, T039, T040, T041, T042, T043, T044, T045, T046, T047, T048); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 17 | 0 | 10639 | 28367 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 17, not_loaded 0, not_extracted 0, not_served 6, unknown 0; region waits: 13 (held on 12; scrolled on 1, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 15 (time left at its start: median 298119 ms, least 30000 ms); installed_chrome on 9 (time left at its start: median 294250 ms, least 285247 ms)
- Verified answers by the route that delivered them (cold): http 5, installed_chrome 6, browser 6
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 1 (T041: rule /homes/, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T024 | cold | yes | success |  | 200 | http | http |  | 3772 | ready (verified) |
| T025 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 13689 | ready (verified); region held in 2532 ms |
| T026 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 22702 | ready (verified); region held in 704 ms |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 3801 | not_served (http_error) |
| T029 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8989 | ready (verified); region held in 635 ms |
| T030 | cold | no | blocked | login_wall | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 28367 | not_served (login_wall); region not held in 9894 ms, 1 screen scrolled |
| T031 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 10172 | ready (verified); region held in 1194 ms |
| T033 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 24035 | ready (verified); region held in 699 ms |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5973 | ready (verified); region held in 740 ms |
| T035 | cold | yes | success |  | 200 | http | http |  | 2690 | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 11457 | ready (verified); region held in 645 ms |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 2541 | not_served (rate_limit) |
| T038 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 14316 | ready (verified); region held in 1380 ms |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 11371 | ready (verified); region held in 721 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 4347 | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 2456 | ready (verified) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1945 | not_served (rate_limit) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 10639 | not_served (bot_detected_generic) |
| T044 | cold | yes | success |  | 200 | http | http |  | 5056 | ready (verified) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 32132 | not_served (captcha) |
| T046 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 19857 | ready (verified); region held in 787 ms |
| T047 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 16587 | ready (verified); region held in 784 ms |
| T048 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 15391 | ready (verified); region held in 691 ms |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (17 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-first-b2 (2026-10-22T07:57:17.099Z → 2026-10-22T08:01:11.981Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-22T07-57-17-188Z`.

- Command: `node research/access/run-set.mjs --set all --only T049,T050,T051,T052,T053,T055,T056,T057,T058,T059,T060,T061,T062,T063,T064,T065,T066,T067,T068,T069,T070,T071,T072 --save-responses --record .w2l/access/k1/2026-10-22-w2/installed_chrome-first-b2.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `b233d232` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8823; access option: `"enhanced"`
- Exit address: 103.142.140.154
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-22T07:57:17.188Z → 2026-10-22T08:01:11.975Z
- Tasks: 23 (set `all`, only T049, T050, T051, T052, T053, T055, T056, T057, T058, T059, T060, T061, T062, T063, T064, T065, T066, T067, T068, T069, T070, T071, T072); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 18 | 0 | 7165 | 25275 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 18, not_loaded 0, not_extracted 0, not_served 5, unknown 0; region waits: 13 (held on 12)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 18 (time left at its start: median 298470 ms, least 294907 ms); installed_chrome on 10 (time left at its start: median 296441 ms, least 293780 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 5, browser 8, http 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 4 (T049: rule /, set aside; T059: rule /, set aside; T064: rule /, set aside; T066: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T049 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 14487 | ready (verified); region held in 757 ms |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 5377 | not_served (http_error) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6986 | ready (verified); region held in 728 ms |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | minTables, markdownMatches | 28449 | not_served (cloudflare_challenge) |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9946 | ready (verified); region held in 608 ms |
| T055 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 19461 | ready (verified); region held in 6398 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5131 | ready (verified); region held in 650 ms |
| T057 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4649 | ready (verified); region held in 1308 ms |
| T058 | cold | yes | success |  | 200 | http | http |  | 1082 | ready (verified) |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4377 | ready (verified); region held in 676 ms |
| T060 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 18382 | ready (verified); region not held in 9739 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 3521 | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7165 | ready (verified); region held in 920 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1262 | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 4193 | not_served (login_wall) |
| T065 | cold | yes | success |  | 200 | http | http |  | 1950 | ready (verified) |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8125 | ready (verified); region held in 1849 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7278 | ready (verified); region held in 614 ms |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 25275 | not_served (bot_detected_generic) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 24234 | not_served (cloudflare_challenge) |
| T070 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 16178 | ready (verified); region held in 883 ms |
| T071 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 12590 | ready (verified); region held in 709 ms |
| T072 | cold | yes | success |  | 200 | http | http |  | 3822 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (18 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-first-b3 (2026-10-22T08:54:56.978Z → 2026-10-22T08:57:17.516Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-22T08-54-57-053Z`.

- Command: `node research/access/run-set.mjs --set all --only T073,T074,T075,T076,T077,T078,T079,T080,T081,B001,B002,B003,B004,B005,B006,B007,B008,B009,B010,B011,B012,B013,B014 --save-responses --record .w2l/access/k1/2026-10-22-w2/installed_chrome-first-b3.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `b233d232` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8823; access option: `"enhanced"`
- Exit address: 103.142.140.158
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-22T08:54:57.053Z → 2026-10-22T08:57:17.508Z
- Tasks: 23 (set `all`, only T073, T074, T075, T076, T077, T078, T079, T080, T081, B001, B002, B003, B004, B005, B006, B007, B008, B009, B010, B011, B012, B013, B014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 19 | 0 | 4490 | 15494 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 19, not_loaded 1, not_extracted 0, not_served 3, unknown 0; region waits: 11 (held on 10; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 11 (time left at its start: median 298823 ms, least 296883 ms); installed_chrome on 5 (time left at its start: median 297241 ms, least 286045 ms)
- Verified answers by the route that delivered them (cold): browser 6, http 9, installed_chrome 4
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6734 | ready (verified); region held in 691 ms |
| T074 | cold | yes | success |  | 200 | http | http |  | 1020 | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 9634 | ready (verified); region held in 635 ms |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 13556 | ready (verified); region held in 671 ms |
| T077 | cold | yes | success |  | 200 | http | http |  | 1244 | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1896 | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 2186 | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2534 | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1970 | not_served (http_error) |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8355 | ready (verified); region held in 719 ms |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7927 | ready (verified); region held in 884 ms |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 15494 | not_loaded (empty_unverified, little_text); region not held in 9660 ms |
| B004 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9913 | ready (verified); region held in 2150 ms |
| B005 | cold | yes | success |  | 200 | http | http |  | 4490 | ready (verified) |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5764 | ready (verified); region held in 671 ms |
| B007 | cold | yes | success |  | 200 | http | http |  | 3803 | ready (verified) |
| B008 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 21175 | ready (verified); region held in 2969 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 1503 | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 10108 | ready (verified); region held in 2303 ms, 2 screens scrolled |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4853 | ready (verified); region held in 564 ms |
| B012 | cold | yes | success |  | 200 | http | http |  | 1697 | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 2450 | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 1094 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (19 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-retry (2026-10-22T09:51:45.270Z → 2026-10-22T09:55:19.866Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-22T09-51-45-360Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T004,T007,T010,T012,T013,T014,T016,T018,T027,T030,T037,T042,T043,T045,T050,T052,T064,T068,T069,T078,T081,B003,B009 --save-responses --record .w2l/access/k1/2026-10-22-w2/installed_chrome-retry.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `b233d232` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8823; access option: `"enhanced"`
- Exit address: 103.142.140.154
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-22T09:51:45.360Z → 2026-10-22T09:55:19.855Z
- Tasks: 24 (set `all`, only T001, T004, T007, T010, T012, T013, T014, T016, T018, T027, T030, T037, T042, T043, T045, T050, T052, T064, T068, T069, T078, T081, B003, B009); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 24, attempted 24, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 24 | 1 | 2 | 3475 | 25131 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 1, not_loaded 2, not_extracted 0, not_served 21, unknown 0; region waits: 6 (held on 2; scrolled on 2, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 24 (time left at its start: median 300000 ms, least 299998 ms); browser_local on 16 (time left at its start: median 299650 ms, least 30000 ms); installed_chrome on 14 (time left at its start: median 298237 ms, least 283550 ms)
- Verified answers by the route that delivered them (cold): browser 1
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 2 (T064: rule /, set aside; T081: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 6988 | not_served (captcha) |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3475 | not_served (connection_error) |
| T007 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 567 | not_served (rate_limit) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | minTables | 30076 | not_served (checks_failed, region_absent); region not held in 9897 ms |
| T012 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 18387 | not_served (source_data_error); region not held in 9722 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 12406 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 2730 | not_served (bot_detected_generic) |
| T016 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 12713 | not_served (connection_error); region held in 1062 ms |
| T018 | cold | no | blocked | captcha | 429 | http | http | markdownCountMin, markdownMatches | 774 | not_served (captcha) |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 1722 | not_served (http_error) |
| T030 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 25131 | not_loaded (empty_unverified, little_text); region not held in 9490 ms, 1 screen scrolled |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 465 | not_served (rate_limit) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 603 | not_served (rate_limit) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 3376 | not_served (bot_detected_generic) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 23561 | not_served (captcha) |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 2387 | not_served (http_error) |
| T052 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3910 | ready (verified); region held in 581 ms |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 2994 | not_served (login_wall) |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 23130 | not_served (bot_detected_generic) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 22135 | not_served (cloudflare_challenge) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1036 | not_served (rate_limit) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 950 | not_served (http_error) |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 13865 | not_loaded (empty_unverified, little_text); region not held in 9589 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 388 | not_served (http_error) |
- Task contract (cold): the product's verification agreed with the runner on 24 of 24 attempts that carry one (1 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
