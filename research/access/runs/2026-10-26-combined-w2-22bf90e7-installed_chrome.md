# Combined grant, window 2, arm installed_chrome, 2026-10-26

The runner's own records of this arm's runs in the window, copied whole; the comparison is in `2026-10-26-combined-w2-22bf90e7-summary.md`.

## installed_chrome-first-b0 (2026-10-26T00:08:39.127Z → 2026-10-26T00:12:55.087Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-26T00-08-39-216Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T005,T006,T007,T008,T009,T010,T011,T012,T013,T014,T015,T016,T017,T018,T019,T020,T021,T022,T023 --save-responses --record .w2l/access/combined/2026-10-26-w2/installed_chrome-first-b0.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8832; access option: `"enhanced"`
- Exit address: 103.142.140.137
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-26T00:08:39.216Z → 2026-10-26T00:12:55.078Z
- Tasks: 23 (set `all`, only T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020, T021, T022, T023); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 14 | 1 | 8054 | 34115 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 14, not_loaded 1, not_extracted 0, not_served 8, unknown 0; region waits: 14 (held on 12; scrolled on 2, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299998 ms); browser_local on 19 (time left at its start: median 299130 ms, least 30000 ms); installed_chrome on 10 (time left at its start: median 297059 ms, least 281446 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 5, browser 7, http 2
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9514 | ready (verified); region held in 571 ms |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8054 | ready (verified); region held in 542 ms |
| T003 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8763 | ready (verified); region held in 578 ms |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 5410 | not_served (connection_error) |
| T005 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 24697 | not_served (captcha) |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7304 | ready (verified); region held in 3314 ms |
| T007 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 532 | not_served (rate_limit) |
| T008 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownMatches | 40173 | not_served (timeout) |
| T009 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 13641 | ready (verified); region held in 590 ms |
| T010 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | minTables | 34115 | not_loaded (empty_unverified, little_text); region not held in 9929 ms |
| T011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6612 | ready (verified); region held in 1172 ms |
| T012 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 25923 | not_served (source_data_error); region not held in 9676 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 12827 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 3334 | not_served (bot_detected_generic) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1873 | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5699 | ready (verified); region held in 974 ms |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4594 | ready (verified); region held in 757 ms |
| T018 | cold | no | blocked | captcha | 429 | http | http | markdownCountMin, markdownMatches | 1754 | not_served (captcha) |
| T019 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14219 | ready (verified); region held in 8212 ms, 7 screens scrolled |
| T020 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8206 | ready (verified); region held in 993 ms |
| T021 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8991 | ready (verified); region held in 845 ms |
| T022 | cold | yes | success |  | 200 | http | http |  | 1967 | ready (verified) |
| T023 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 6895 | ready (verified); region held in 673 ms |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (14 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-first-b1 (2026-10-26T00:18:44.620Z → 2026-10-26T00:23:20.068Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-26T00-18-44-718Z`.

- Command: `node research/access/run-set.mjs --set all --only T024,T025,T026,T027,T029,T030,T031,T033,T034,T035,T036,T037,T038,T039,T040,T041,T042,T043,T044,T045,T046,T047,T048 --save-responses --record .w2l/access/combined/2026-10-26-w2/installed_chrome-first-b1.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8832; access option: `"enhanced"`
- Exit address: 103.142.140.137
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-26T00:18:44.718Z → 2026-10-26T00:23:20.058Z
- Tasks: 23 (set `all`, only T024, T025, T026, T027, T029, T030, T031, T033, T034, T035, T036, T037, T038, T039, T040, T041, T042, T043, T044, T045, T046, T047, T048); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 11 | 0 | 6985 | 27383 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 11, not_loaded 0, not_extracted 0, not_served 12, unknown 0; region waits: 7 (held on 5; scrolled on 1, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 14 (time left at its start: median 299056 ms, least 30000 ms); installed_chrome on 11 (time left at its start: median 297239 ms, least 285410 ms)
- Verified answers by the route that delivered them (cold): http 6, browser 3, installed_chrome 2
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 1 (T041: rule /homes/, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T024 | cold | yes | success |  | 200 | http | http |  | 2568 | ready (verified) |
| T025 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 27383 | not_served (bot_detected_generic) |
| T026 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 18912 | ready (verified); region held in 745 ms |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 2480 | not_served (http_error) |
| T029 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6362 | ready (verified); region held in 675 ms |
| T030 | cold | no | blocked | login_wall | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 26636 | not_served (login_wall); region not held in 9979 ms, 1 screen scrolled |
| T031 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 28595 | not_served (captcha); region not held in 9952 ms |
| T033 | cold | yes | success |  | 200 | http | http |  | 1932 | ready (verified) |
| T034 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 22268 | not_served (captcha) |
| T035 | cold | yes | success |  | 200 | http | http |  | 1961 | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6985 | ready (verified); region held in 1185 ms |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 663 | not_served (rate_limit) |
| T038 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 24096 | not_served (captcha) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7320 | ready (verified); region held in 776 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1115 | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 1912 | ready (verified) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1330 | not_served (rate_limit) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 6314 | not_served (bot_detected_generic) |
| T044 | cold | yes | success |  | 200 | http | http |  | 3131 | ready (verified) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 25478 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 23772 | not_served (captcha) |
| T047 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10266 | ready (verified); region held in 855 ms |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 23050 | not_served (cloudflare_challenge) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (11 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-first-b2 (2026-10-26T00:38:16.218Z → 2026-10-26T00:41:37.693Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-26T00-38-16-283Z`.

- Command: `node research/access/run-set.mjs --set all --only T049,T050,T051,T052,T053,T055,T056,T057,T058,T059,T060,T061,T062,T063,T064,T065,T066,T067,T068,T069,T070,T071,T072 --save-responses --record .w2l/access/combined/2026-10-26-w2/installed_chrome-first-b2.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8832; access option: `"enhanced"`
- Exit address: 103.142.140.137
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-26T00:38:16.283Z → 2026-10-26T00:41:37.687Z
- Tasks: 23 (set `all`, only T049, T050, T051, T052, T053, T055, T056, T057, T058, T059, T060, T061, T062, T063, T064, T065, T066, T067, T068, T069, T070, T071, T072); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 17 | 0 | 6129 | 23042 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 17, not_loaded 0, not_extracted 0, not_served 6, unknown 0; region waits: 12 (held on 11)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 18 (time left at its start: median 299236 ms, least 296044 ms); installed_chrome on 12 (time left at its start: median 297889 ms, least 295722 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 6, browser 6, http 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 4 (T049: rule /, set aside; T059: rule /, set aside; T064: rule /, set aside; T066: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T049 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 13558 | ready (verified); region held in 787 ms |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 3899 | not_served (http_error) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 6974 | ready (verified); region held in 760 ms |
| T052 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9698 | ready (verified); region held in 553 ms |
| T053 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches | 5615 | not_served (bot_detected_generic) |
| T055 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14010 | ready (verified); region held in 2605 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3735 | ready (verified); region held in 735 ms |
| T057 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4449 | ready (verified); region held in 703 ms |
| T058 | cold | yes | success |  | 200 | http | http |  | 894 | ready (verified) |
| T059 | cold | no | blocked | captcha | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 23042 | not_served (captcha) |
| T060 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 16149 | ready (verified); region not held in 9483 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 3589 | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6129 | ready (verified); region held in 945 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1299 | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3939 | not_served (login_wall) |
| T065 | cold | yes | success |  | 200 | http | http |  | 969 | ready (verified) |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7252 | ready (verified); region held in 1863 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 5737 | ready (verified); region held in 612 ms |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 24129 | not_served (bot_detected_generic) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 22315 | not_served (cloudflare_challenge) |
| T070 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9809 | ready (verified); region held in 908 ms |
| T071 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10015 | ready (verified); region held in 717 ms |
| T072 | cold | yes | success |  | 200 | http | http |  | 3418 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (17 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-first-b3 (2026-10-26T00:43:14.064Z → 2026-10-26T00:45:22.330Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-26T00-43-14-129Z`.

- Command: `node research/access/run-set.mjs --set all --only T073,T074,T075,T076,T077,T078,T079,T080,T081,B001,B002,B003,B004,B005,B006,B007,B008,B009,B010,B011,B012,B013,B014 --save-responses --record .w2l/access/combined/2026-10-26-w2/installed_chrome-first-b3.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8832; access option: `"enhanced"`
- Exit address: 103.142.140.137
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-26T00:43:14.129Z → 2026-10-26T00:45:22.323Z
- Tasks: 23 (set `all`, only T073, T074, T075, T076, T077, T078, T079, T080, T081, B001, B002, B003, B004, B005, B006, B007, B008, B009, B010, B011, B012, B013, B014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 19 | 0 | 3634 | 14873 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 19, not_loaded 1, not_extracted 0, not_served 3, unknown 0; region waits: 11 (held on 10; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 11 (time left at its start: median 299324 ms, least 298452 ms); installed_chrome on 6 (time left at its start: median 297692 ms, least 285530 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 5, http 9, browser 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9607 | ready (verified); region held in 1140 ms |
| T074 | cold | yes | success |  | 200 | http | http |  | 802 | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5265 | ready (verified); region held in 632 ms |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10669 | ready (verified); region held in 660 ms |
| T077 | cold | yes | success |  | 200 | http | http |  | 896 | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1516 | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 1273 | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 1998 | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1150 | not_served (http_error) |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9227 | ready (verified); region held in 769 ms |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6819 | ready (verified); region held in 863 ms |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 14873 | not_loaded (empty_unverified, little_text); region not held in 9757 ms |
| B004 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10666 | ready (verified); region held in 1171 ms |
| B005 | cold | yes | success |  | 200 | http | http |  | 3634 | ready (verified) |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5755 | ready (verified); region held in 663 ms |
| B007 | cold | yes | success |  | 200 | http | http |  | 3572 | ready (verified) |
| B008 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 23344 | ready (verified); region held in 3385 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 707 | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8113 | ready (verified); region held in 2403 ms, 2 screens scrolled |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3693 | ready (verified); region held in 576 ms |
| B012 | cold | yes | success |  | 200 | http | http |  | 901 | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 2026 | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 950 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (19 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-retry (2026-10-26T00:47:42.813Z → 2026-10-26T00:52:59.004Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-26T00-47-42-914Z`.

- Command: `node research/access/run-set.mjs --set all --only T004,T005,T007,T008,T010,T012,T013,T014,T018,T025,T027,T030,T031,T034,T037,T038,T042,T043,T045,T046,T048,T050,T053,T059,T064,T068,T069,T078,T081,B003,B009 --save-responses --record .w2l/access/combined/2026-10-26-w2/installed_chrome-retry.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8832; access option: `"enhanced"`
- Exit address: 103.142.140.131
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-26T00:47:42.914Z → 2026-10-26T00:52:58.993Z
- Tasks: 31 (set `all`, only T004, T005, T007, T008, T010, T012, T013, T014, T018, T025, T027, T030, T031, T034, T037, T038, T042, T043, T045, T046, T048, T050, T053, T059, T064, T068, T069, T078, T081, B003, B009); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 31, attempted 31, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 31 | 5 | 0 | 5721 | 27472 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 5, not_loaded 3, not_extracted 0, not_served 23, unknown 0; region waits: 10 (held on 5; scrolled on 3, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 31 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 22 (time left at its start: median 299702 ms, least 30000 ms); installed_chrome on 19 (time left at its start: median 298416 ms, least 283779 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 3, browser 2
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 3 (T059: rule /, set aside; T064: rule /, set aside; T081: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3360 | not_served (connection_error) |
| T005 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9086 | ready (verified); region held in 2822 ms, 2 screens scrolled |
| T007 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 334 | not_served (rate_limit) |
| T008 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 585 | not_served (rate_limit) |
| T010 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | minTables | 30747 | not_loaded (empty_unverified, little_text); region not held in 9944 ms |
| T012 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 26260 | not_served (source_data_error); region not held in 9688 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13131 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 2734 | not_served (bot_detected_generic) |
| T018 | cold | no | blocked | captcha | 429 | http | http | markdownCountMin, markdownMatches | 798 | not_served (captcha) |
| T025 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10016 | ready (verified); region held in 3661 ms |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 1749 | not_served (http_error) |
| T030 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 25227 | not_loaded (empty_unverified, little_text); region not held in 9972 ms, 1 screen scrolled |
| T031 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 27472 | not_served (captcha); region not held in 9934 ms |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5721 | ready (verified); region held in 813 ms |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 487 | not_served (rate_limit) |
| T038 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 22667 | not_served (captcha) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 509 | not_served (rate_limit) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 3197 | not_served (bot_detected_generic) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 23855 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 22261 | not_served (captcha) |
| T048 | cold | no | failed | http_error | 404 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 8355 | not_served (http_error) |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 2469 | not_served (http_error) |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 5959 | ready (verified); region held in 609 ms |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2461 | ready (verified); region held in 670 ms |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 2965 | not_served (login_wall) |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 22332 | not_served (bot_detected_generic) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 22671 | not_served (cloudflare_challenge) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1007 | not_served (rate_limit) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 938 | not_served (http_error) |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 15438 | not_loaded (empty_unverified, little_text); region not held in 9758 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 457 | not_served (http_error) |
- Task contract (cold): the product's verification agreed with the runner on 31 of 31 attempts that carry one (5 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
