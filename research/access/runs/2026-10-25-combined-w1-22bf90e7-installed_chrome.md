# Combined grant, window 1, arm installed_chrome, 2026-10-25

The runner's own records of this arm's runs in the window, copied whole; the comparison is in `2026-10-25-combined-w1-22bf90e7-summary.md`.

## installed_chrome-first-b0 (2026-10-25T04:36:36.603Z → 2026-10-25T04:40:35.273Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-25T04-36-36-679Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T005,T006,T007,T008,T009,T010,T011,T012,T013,T014,T015,T016,T017,T018,T019,T020,T021,T022,T023 --save-responses --record .w2l/access/combined/2026-10-25-w1/installed_chrome-first-b0.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `22bf90e7` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8832; access option: `"enhanced"`
- Exit address: 103.142.140.158
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-25T04:36:36.679Z → 2026-10-25T04:40:35.267Z
- Tasks: 23 (set `all`, only T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020, T021, T022, T023); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 15 | 2 | 7961 | 28076 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 15, not_loaded 0, not_extracted 0, not_served 8, unknown 0; region waits: 15 (held on 13; scrolled on 3, held on 2 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299998 ms); browser_local on 18 (time left at its start: median 298685 ms, least 30000 ms); installed_chrome on 11 (time left at its start: median 297366 ms, least 281987 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 7, browser 6, http 2
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10270 | ready (verified); region held in 560 ms |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8623 | ready (verified); region held in 544 ms |
| T003 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9261 | ready (verified); region held in 587 ms |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 5966 | not_served (connection_error) |
| T005 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 11198 | ready (verified); region held in 2752 ms, 2 screens scrolled |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6842 | ready (verified); region held in 2187 ms |
| T007 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 710 | not_served (rate_limit) |
| T008 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1106 | not_served (rate_limit) |
| T009 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 13751 | ready (verified); region held in 582 ms |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | minTables | 32374 | not_served (checks_failed, region_absent); region not held in 9970 ms |
| T011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 23114 | ready (verified); region held in 1663 ms |
| T012 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 27015 | not_served (source_data_error); region not held in 9667 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 12960 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 3408 | not_served (bot_detected_generic) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1531 | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6018 | ready (verified); region held in 1059 ms |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7354 | ready (verified); region held in 744 ms |
| T018 | cold | no | blocked | captcha | 429 | http | http | markdownCountMin, markdownMatches | 1760 | not_served (captcha) |
| T019 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 28076 | ready (verified); region held in 8578 ms, 7 screens scrolled |
| T020 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8603 | ready (verified); region held in 941 ms |
| T021 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7961 | ready (verified); region held in 808 ms |
| T022 | cold | yes | success |  | 200 | http | http |  | 1869 | ready (verified) |
| T023 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7713 | ready (verified); region held in 692 ms |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (15 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-first-b1 (2026-10-25T04:46:15.261Z → 2026-10-25T04:49:55.112Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-25T04-46-15-343Z`.

- Command: `node research/access/run-set.mjs --set all --only T024,T025,T026,T027,T029,T030,T031,T033,T034,T035,T036,T037,T038,T039,T040,T041,T042,T043,T044,T045,T046,T047,T048 --save-responses --record .w2l/access/combined/2026-10-25-w1/installed_chrome-first-b1.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8832; access option: `"enhanced"`
- Exit address: 103.142.140.158
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-25T04:46:15.343Z → 2026-10-25T04:49:55.106Z
- Tasks: 23 (set `all`, only T024, T025, T026, T027, T029, T030, T031, T033, T034, T035, T036, T037, T038, T039, T040, T041, T042, T043, T044, T045, T046, T047, T048); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 14 | 0 | 6764 | 26880 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 14, not_loaded 0, not_extracted 0, not_served 9, unknown 0; region waits: 10 (held on 8; scrolled on 1, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 14 (time left at its start: median 298947 ms, least 297674 ms); installed_chrome on 10 (time left at its start: median 296608 ms, least 285787 ms)
- Verified answers by the route that delivered them (cold): http 6, installed_chrome 4, browser 4
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 1 (T041: rule /homes/, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T024 | cold | yes | success |  | 200 | http | http |  | 2453 | ready (verified) |
| T025 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10283 | ready (verified); region held in 3052 ms |
| T026 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8813 | ready (verified); region held in 770 ms |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 2428 | not_served (http_error) |
| T029 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6764 | ready (verified); region held in 663 ms |
| T030 | cold | no | blocked | login_wall | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 26880 | not_served (login_wall); region not held in 9969 ms, 1 screen scrolled |
| T031 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 28234 | not_served (captcha); region not held in 9937 ms |
| T033 | cold | yes | success |  | 200 | http | http |  | 3949 | ready (verified) |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6186 | ready (verified); region held in 1358 ms |
| T035 | cold | yes | success |  | 200 | http | http |  | 1884 | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7300 | ready (verified); region held in 1168 ms |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 658 | not_served (rate_limit) |
| T038 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9375 | ready (verified); region held in 761 ms |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 6966 | ready (verified); region held in 726 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1350 | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 2220 | ready (verified) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1340 | not_served (rate_limit) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 5972 | not_served (bot_detected_generic) |
| T044 | cold | yes | success |  | 200 | http | http |  | 2969 | ready (verified) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 25668 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 23934 | not_served (captcha) |
| T047 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10334 | ready (verified); region held in 876 ms |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 23042 | not_served (cloudflare_challenge) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (14 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-first-b2 (2026-10-25T05:03:33.846Z → 2026-10-25T05:06:52.771Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-25T05-03-33-908Z`.

- Command: `node research/access/run-set.mjs --set all --only T049,T050,T051,T052,T053,T055,T056,T057,T058,T059,T060,T061,T062,T063,T064,T065,T066,T067,T068,T069,T070,T071,T072 --save-responses --record .w2l/access/combined/2026-10-25-w1/installed_chrome-first-b2.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8832; access option: `"enhanced"`
- Exit address: 103.142.140.158
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-25T05:03:33.908Z → 2026-10-25T05:06:52.766Z
- Tasks: 23 (set `all`, only T049, T050, T051, T052, T053, T055, T056, T057, T058, T059, T060, T061, T062, T063, T064, T065, T066, T067, T068, T069, T070, T071, T072); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 18 | 0 | 6386 | 23114 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 18, not_loaded 0, not_extracted 0, not_served 5, unknown 0; region waits: 13 (held on 12)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 18 (time left at its start: median 299266 ms, least 297635 ms); installed_chrome on 10 (time left at its start: median 297442 ms, least 295373 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 5, browser 8, http 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 4 (T049: rule /, set aside; T059: rule /, set aside; T064: rule /, set aside; T066: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T049 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 14204 | ready (verified); region held in 782 ms |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 3575 | not_served (http_error) |
| T051 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 23114 | not_served (cloudflare_challenge) |
| T052 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 11076 | ready (verified); region held in 561 ms |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7638 | ready (verified); region held in 608 ms |
| T055 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 17933 | ready (verified); region held in 8113 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3867 | ready (verified); region held in 718 ms |
| T057 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3729 | ready (verified); region held in 688 ms |
| T058 | cold | yes | success |  | 200 | http | http |  | 965 | ready (verified) |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3199 | ready (verified); region held in 690 ms |
| T060 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14065 | ready (verified); region not held in 9491 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 3204 | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8197 | ready (verified); region held in 921 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1129 | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3783 | not_served (login_wall) |
| T065 | cold | yes | success |  | 200 | http | http |  | 1198 | ready (verified) |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6386 | ready (verified); region held in 679 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4594 | ready (verified); region held in 615 ms |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 23702 | not_served (bot_detected_generic) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 22668 | not_served (cloudflare_challenge) |
| T070 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7214 | ready (verified); region held in 846 ms |
| T071 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9015 | ready (verified); region held in 718 ms |
| T072 | cold | yes | success |  | 200 | http | http |  | 3610 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (18 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-first-b3 (2026-10-25T05:08:20.607Z → 2026-10-25T05:10:23.707Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-25T05-08-20-668Z`.

- Command: `node research/access/run-set.mjs --set all --only T073,T074,T075,T076,T077,T078,T079,T080,T081,B001,B002,B003,B004,B005,B006,B007,B008,B009,B010,B011,B012,B013,B014 --save-responses --record .w2l/access/combined/2026-10-25-w1/installed_chrome-first-b3.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8832; access option: `"enhanced"`
- Exit address: 103.142.140.58
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-25T05:08:20.668Z → 2026-10-25T05:10:23.700Z
- Tasks: 23 (set `all`, only T073, T074, T075, T076, T077, T078, T079, T080, T081, B001, B002, B003, B004, B005, B006, B007, B008, B009, B010, B011, B012, B013, B014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 19 | 0 | 3714 | 15356 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 19, not_loaded 1, not_extracted 0, not_served 3, unknown 0; region waits: 11 (held on 10; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 11 (time left at its start: median 299291 ms, least 298410 ms); installed_chrome on 6 (time left at its start: median 297541 ms, least 285544 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 5, http 9, browser 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9267 | ready (verified); region held in 584 ms |
| T074 | cold | yes | success |  | 200 | http | http |  | 863 | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4970 | ready (verified); region held in 611 ms |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 6999 | ready (verified); region held in 658 ms |
| T077 | cold | yes | success |  | 200 | http | http |  | 1276 | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1506 | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 1203 | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2191 | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1210 | not_served (http_error) |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 5865 | ready (verified); region held in 733 ms |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7767 | ready (verified); region held in 865 ms |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 15356 | not_loaded (empty_unverified, little_text); region not held in 9556 ms |
| B004 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10078 | ready (verified); region held in 1212 ms |
| B005 | cold | yes | success |  | 200 | http | http |  | 4674 | ready (verified) |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5731 | ready (verified); region held in 664 ms |
| B007 | cold | yes | success |  | 200 | http | http |  | 3714 | ready (verified) |
| B008 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 22529 | ready (verified); region held in 2633 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 810 | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8458 | ready (verified); region held in 2481 ms, 2 screens scrolled |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3675 | ready (verified); region held in 570 ms |
| B012 | cold | yes | success |  | 200 | http | http |  | 1087 | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 1977 | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 1078 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (19 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-retry (2026-10-25T05:12:52.034Z → 2026-10-25T05:17:14.767Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-25T05-12-52-121Z`.

- Command: `node research/access/run-set.mjs --set all --only T004,T007,T008,T010,T012,T013,T014,T018,T027,T030,T031,T037,T042,T043,T045,T046,T048,T050,T051,T064,T068,T069,T078,T081,B003,B009 --save-responses --record .w2l/access/combined/2026-10-25-w1/installed_chrome-retry.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8832; access option: `"enhanced"`
- Exit address: 103.142.140.58
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-25T05:12:52.121Z → 2026-10-25T05:17:14.754Z
- Tasks: 26 (set `all`, only T004, T007, T008, T010, T012, T013, T014, T018, T027, T030, T031, T037, T042, T043, T045, T046, T048, T050, T051, T064, T068, T069, T078, T081, B003, B009); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 26, attempted 26, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 26 | 3 | 2 | 3500 | 27424 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 3, not_loaded 2, not_extracted 0, not_served 21, unknown 0; region waits: 7 (held on 2; scrolled on 2, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 26 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 17 (time left at its start: median 299708 ms, least 30000 ms); installed_chrome on 15 (time left at its start: median 298466 ms, least 283817 ms)
- Verified answers by the route that delivered them (cold): http 1, installed_chrome 1, browser 1
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 2 (T064: rule /, set aside; T081: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3500 | not_served (connection_error) |
| T007 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 993 | not_served (rate_limit) |
| T008 | cold | yes | success |  | 200 | http | http |  | 1323 | ready (verified) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | minTables | 30217 | not_served (checks_failed, region_absent); region not held in 9876 ms |
| T012 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 25505 | not_served (source_data_error); region not held in 9726 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 11896 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 2544 | not_served (bot_detected_generic) |
| T018 | cold | no | blocked | captcha | 429 | http | http | markdownCountMin, markdownMatches | 767 | not_served (captcha) |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 1760 | not_served (http_error) |
| T030 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 25065 | not_loaded (empty_unverified, little_text); region not held in 9992 ms, 1 screen scrolled |
| T031 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 27424 | not_served (captcha); region not held in 9941 ms |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 460 | not_served (rate_limit) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 511 | not_served (rate_limit) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 3348 | not_served (bot_detected_generic) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 23534 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 22200 | not_served (captcha) |
| T048 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8837 | ready (verified); region held in 704 ms |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 2465 | not_served (http_error) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4351 | ready (verified); region held in 716 ms |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3038 | not_served (login_wall) |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 22973 | not_served (bot_detected_generic) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 22984 | not_served (cloudflare_challenge) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 987 | not_served (rate_limit) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1020 | not_served (http_error) |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 13817 | not_loaded (empty_unverified, little_text); region not held in 9696 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 285 | not_served (http_error) |
- Task contract (cold): the product's verification agreed with the runner on 26 of 26 attempts that carry one (3 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
