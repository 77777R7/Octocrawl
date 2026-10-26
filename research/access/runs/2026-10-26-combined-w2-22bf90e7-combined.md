# Combined grant, window 2, arm combined, 2026-10-26

The runner's own records of this arm's runs in the window, copied whole; the comparison is in `2026-10-26-combined-w2-22bf90e7-summary.md`.

## combined-first-b0 (2026-10-26T00:12:55.088Z → 2026-10-26T00:18:37.807Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-26T00-12-55-187Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T005,T006,T007,T008,T009,T010,T011,T012,T013,T014,T015,T016,T017,T018,T019,T020,T021,T022,T023 --save-responses --record .w2l/access/combined/2026-10-26-w2/combined-first-b0.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8833; access option: `"enhanced"`
- Exit address: 103.142.140.137
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-26T00:12:55.187Z → 2026-10-26T00:18:37.794Z
- Tasks: 23 (set `all`, only T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020, T021, T022, T023); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 18 | 2 | 8480 | 55866 | unknown | unknown |

- Paid provider calls (cold): 4; tasks verified with a paid call's page as the answer: 2; charged by the spend ledger: $0.0079 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 18, not_loaded 2, not_extracted 0, not_served 3, unknown 0; region waits: 15 (held on 12; scrolled on 4, held on 2 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 20 (time left at its start: median 299999 ms, least 299997 ms); browser_local on 18 (time left at its start: median 299072 ms, least 30000 ms); installed_chrome on 10 (time left at its start: median 297307 ms, least 281497 ms); provider on 4 (time left at its start: median 273742 ms, least 266108 ms); http_compat on 3 (time left at its start: median 299999 ms, least 299999 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 5, vendor 2, browser 6, http_compat 3, http 2
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9197 |  | ready (verified); region held in 567 ms |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8480 |  | ready (verified); region held in 563 ms |
| T003 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8995 |  | ready (verified); region held in 591 ms |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 5328 |  | not_served (connection_error) |
| T005 | cold | yes | success |  | 200 | provider | http → browser_local → installed_chrome → provider |  | 45014 | steel: success (answer) | ready (verified); region held in 3289 ms, 1 screen scrolled |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7555 |  | ready (verified); region held in 3950 ms |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 2022 |  | ready (verified) |
| T008 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14257 |  | ready (verified); region held in 592 ms |
| T009 | cold | yes | success |  | 200 | http | http_compat |  | 927 |  | ready (verified) |
| T010 | cold | no (false success) | success |  | 200 | provider | http → browser_local → installed_chrome → provider | minTables | 64043 | steel: success (answer) | not_loaded (checks_failed, region_not_ready, page_still_changing); region not held in 9276 ms |
| T011 | cold | no | failed | empty_unverified | 200 | http | http → browser_local | markdownMatches, markdownCountMin | 21024 |  | not_loaded (empty_unverified, not_rendered) |
| T012 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 55866 | steel: failed/empty_unverified | not_served (source_data_error); region not held in 9719 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13374 |  | not_served (geo_restricted) |
| T014 | cold | yes | success |  | 200 | provider | http → browser_local → installed_chrome → provider |  | 29737 | steel: success (answer) | ready (verified); region held in 5757 ms, 1 screen scrolled |
| T015 | cold | yes | success |  | 200 | http | http |  | 1837 |  | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6793 |  | ready (verified); region held in 981 ms |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4831 |  | ready (verified); region held in 743 ms |
| T018 | cold | yes | success |  | 200 | http | http_compat |  | 3906 |  | ready (verified) |
| T019 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14188 |  | ready (verified); region not held in 9666 ms, 2 screens scrolled |
| T020 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7562 |  | ready (verified); region held in 925 ms |
| T021 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8945 |  | ready (verified); region held in 803 ms |
| T022 | cold | yes | success |  | 200 | http | http |  | 1847 |  | ready (verified) |
| T023 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 6062 |  | ready (verified); region held in 698 ms |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (18 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## combined-first-b1 (2026-10-26T00:23:20.071Z → 2026-10-26T00:30:28.041Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-26T00-23-20-177Z`.

- Command: `node research/access/run-set.mjs --set all --only T024,T025,T026,T027,T029,T030,T031,T033,T034,T035,T036,T037,T038,T039,T040,T041,T042,T043,T044,T045,T046,T047,T048 --save-responses --record .w2l/access/combined/2026-10-26-w2/combined-first-b1.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8833; access option: `"enhanced"`
- Exit address: 103.142.140.137
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-26T00:23:20.177Z → 2026-10-26T00:30:28.031Z
- Tasks: 23 (set `all`, only T024, T025, T026, T027, T029, T030, T031, T033, T034, T035, T036, T037, T038, T039, T040, T041, T042, T043, T044, T045, T046, T047, T048); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 16 | 0 | 6631 | 56204 | unknown | unknown |

- Paid provider calls (cold): 7; tasks verified with a paid call's page as the answer: 3; charged by the spend ledger: $0.0152 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 16, not_loaded 0, not_extracted 0, not_served 7, unknown 0; region waits: 11 (held on 10)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 22 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 14 (time left at its start: median 299016 ms, least 30000 ms); installed_chrome on 11 (time left at its start: median 296937 ms, least 285515 ms); http_compat on 1 (time left at its start: median 300000 ms, least 300000 ms); provider on 7 (time left at its start: median 275649 ms, least 272001 ms)
- Verified answers by the route that delivered them (cold): http 5, installed_chrome 4, browser 3, http_compat 1, vendor 3
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 1 (T041: rule /homes/, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T024 | cold | yes | success |  | 200 | http | http |  | 2154 |  | ready (verified) |
| T025 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10931 |  | ready (verified); region held in 3615 ms |
| T026 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 18709 |  | ready (verified); region held in 719 ms |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 1491 |  | not_served (http_error) |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 2341 |  | ready (verified) |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → installed_chrome → provider |  | 53826 | steel: success (answer) | ready (verified); region held in 1572 ms |
| T031 | cold | no | blocked | captcha | 200 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 64193 | steel: blocked/captcha (answer) | not_served (captcha); region not held in 9472 ms |
| T033 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4502 |  | ready (verified); region held in 692 ms |
| T034 | cold | yes | success |  | 200 | provider | http → browser_local → installed_chrome → provider |  | 52813 | steel: success (answer) | ready (verified); region held in 2316 ms |
| T035 | cold | yes | success |  | 200 | http | http |  | 1816 |  | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6115 |  | ready (verified); region held in 1150 ms |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 699 |  | not_served (rate_limit) |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 43767 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 6631 |  | ready (verified); region held in 741 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1058 |  | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 1683 |  | ready (verified) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1376 |  | not_served (rate_limit) |
| T043 | cold | yes | success |  | 200 | provider | http → browser_local → installed_chrome → provider |  | 26835 | steel: success (answer) | ready (verified); region held in 2248 ms |
| T044 | cold | yes | success |  | 200 | http | http |  | 2280 |  | ready (verified) |
| T045 | cold | no | blocked | captcha | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 47969 | steel: blocked/captcha (answer) | not_served (captcha) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 56204 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T047 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10544 |  | ready (verified); region held in 874 ms |
| T048 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9076 |  | ready (verified); region held in 731 ms |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (16 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## combined-first-b2 (2026-10-26T00:32:16.271Z → 2026-10-26T00:36:42.943Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-26T00-32-16-362Z`.

- Command: `node research/access/run-set.mjs --set all --only T049,T050,T051,T052,T053,T055,T056,T057,T058,T059,T060,T061,T062,T063,T064,T065,T066,T067,T068,T069,T070,T071,T072 --save-responses --record .w2l/access/combined/2026-10-26-w2/combined-first-b2.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8833; access option: `"enhanced"`
- Exit address: 103.142.140.137
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-26T00:32:16.362Z → 2026-10-26T00:36:42.939Z
- Tasks: 23 (set `all`, only T049, T050, T051, T052, T053, T055, T056, T057, T058, T059, T060, T061, T062, T063, T064, T065, T066, T067, T068, T069, T070, T071, T072); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 20 | 0 | 6194 | 45003 | unknown | unknown |

- Paid provider calls (cold): 3; tasks verified with a paid call's page as the answer: 1; charged by the spend ledger: $0.0078 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 20, not_loaded 0, not_extracted 0, not_served 3, unknown 0; region waits: 14 (held on 13)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): robots_override on T064 (provider, steel)

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 22 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 17 (time left at its start: median 299162 ms, least 296896 ms); installed_chrome on 10 (time left at its start: median 297497 ms, least 295870 ms); provider on 3 (time left at its start: median 277295 ms, least 276280 ms); http_compat on 1 (time left at its start: median 300000 ms, least 300000 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 6, vendor 1, browser 7, http_compat 1, http 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 4 (T049: rule /, set aside; T059: rule /, set aside; T064: rule /, set aside; T066: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T049 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 13490 |  | ready (verified); region held in 738 ms |
| T050 | cold | yes | success |  | 200 | provider | http → browser_local → installed_chrome → provider |  | 45003 | steel: success (answer) | ready (verified); region held in 8780 ms |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5294 |  | ready (verified); region held in 714 ms |
| T052 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8891 |  | ready (verified); region held in 553 ms |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8348 |  | ready (verified); region held in 594 ms |
| T055 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14487 |  | ready (verified); region held in 2547 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3644 |  | ready (verified); region held in 648 ms |
| T057 | cold | yes | success |  | 200 | http | http_compat |  | 909 |  | ready (verified) |
| T058 | cold | yes | success |  | 200 | http | http |  | 833 |  | ready (verified) |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4042 |  | ready (verified); region held in 661 ms |
| T060 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 15997 |  | ready (verified); region not held in 9979 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 3071 |  | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5980 |  | ready (verified); region held in 909 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1197 |  | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome; passed over: provider (steel, robots_override) | markdownMatches, markdownCountMin | 3979 |  | not_served (login_wall) |
| T065 | cold | yes | success |  | 200 | http | http |  | 2069 |  | ready (verified) |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6620 |  | ready (verified); region held in 1847 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 6194 |  | ready (verified); region held in 616 ms |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → installed_chrome → provider | markdownMatches, markdownCountMin | 50007 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 44089 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T070 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9301 |  | ready (verified); region held in 860 ms |
| T071 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8912 |  | ready (verified); region held in 712 ms |
| T072 | cold | yes | success |  | 200 | http | http |  | 3470 |  | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (20 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## combined-first-b3 (2026-10-26T00:45:22.331Z → 2026-10-26T00:47:36.670Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-26T00-45-22-408Z`.

- Command: `node research/access/run-set.mjs --set all --only T073,T074,T075,T076,T077,T078,T079,T080,T081,B001,B002,B003,B004,B005,B006,B007,B008,B009,B010,B011,B012,B013,B014 --save-responses --record .w2l/access/combined/2026-10-26-w2/combined-first-b3.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8833; access option: `"enhanced"`
- Exit address: 103.142.140.131
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-26T00:45:22.408Z → 2026-10-26T00:47:36.663Z
- Tasks: 23 (set `all`, only T073, T074, T075, T076, T077, T078, T079, T080, T081, B001, B002, B003, B004, B005, B006, B007, B008, B009, B010, B011, B012, B013, B014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 19 | 0 | 3716 | 22168 | unknown | unknown |

- Paid provider calls (cold): 1; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0033 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 19, not_loaded 1, not_extracted 0, not_served 3, unknown 0; region waits: 11 (held on 10; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 11 (time left at its start: median 299214 ms, least 298390 ms); installed_chrome on 6 (time left at its start: median 297362 ms, least 286402 ms); provider on 1 (time left at its start: median 284776 ms, least 284776 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 5, http 9, browser 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10774 |  | ready (verified); region held in 597 ms |
| T074 | cold | yes | success |  | 200 | http | http |  | 741 |  | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5417 |  | ready (verified); region held in 621 ms |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7167 |  | ready (verified); region held in 634 ms |
| T077 | cold | yes | success |  | 200 | http | http |  | 1164 |  | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1500 |  | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 1297 |  | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2372 |  | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1228 |  | not_served (http_error) |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8151 |  | ready (verified); region held in 738 ms |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6888 |  | ready (verified); region held in 888 ms |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome → provider | markdownCountMin | 25753 | steel: failed/provider_error | not_loaded (empty_unverified, little_text); region not held in 9619 ms |
| B004 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8483 |  | ready (verified); region held in 2218 ms |
| B005 | cold | yes | success |  | 200 | http | http |  | 3961 |  | ready (verified) |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5467 |  | ready (verified); region held in 654 ms |
| B007 | cold | yes | success |  | 200 | http | http |  | 3291 |  | ready (verified) |
| B008 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 22168 |  | ready (verified); region held in 2904 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 718 |  | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8137 |  | ready (verified); region held in 2315 ms, 2 screens scrolled |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3716 |  | ready (verified); region held in 571 ms |
| B012 | cold | yes | success |  | 200 | http | http |  | 901 |  | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 2541 |  | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 1071 |  | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (19 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## combined-retry (2026-10-26T00:52:59.005Z → 2026-10-26T01:00:47.631Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-26T00-52-59-110Z`.

- Command: `node research/access/run-set.mjs --set all --only T004,T010,T011,T012,T013,T027,T031,T037,T038,T042,T045,T046,T064,T068,T069,T078,T081,B003,B009 --save-responses --record .w2l/access/combined/2026-10-26-w2/combined-retry.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8833; access option: `"enhanced"`
- Exit address: 103.142.140.131
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-26T00:52:59.110Z → 2026-10-26T01:00:47.622Z
- Tasks: 19 (set `all`, only T004, T010, T011, T012, T013, T027, T031, T037, T038, T042, T045, T046, T064, T068, T069, T078, T081, B003, B009); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 19, attempted 19, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 19 | 1 | 1 | 11944 | 67060 | unknown | unknown |

- Paid provider calls (cold): 9; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0229 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 1, not_loaded 2, not_extracted 0, not_served 16, unknown 0; region waits: 4 (held on 1; scrolled on 1, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): robots_override on T064 (provider, steel)

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 19 (time left at its start: median 299999 ms, least 299999 ms); browser_local on 13 (time left at its start: median 299405 ms, least 30000 ms); installed_chrome on 11 (time left at its start: median 298025 ms, least 283994 ms); provider on 9 (time left at its start: median 276018 ms, least 269846 ms)
- Verified answers by the route that delivered them (cold): browser 1
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 2 (T064: rule /, set aside; T081: rule /, set aside); not known on 2 attempts without a robots check

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3377 |  | not_served (connection_error) |
| T010 | cold | no (false success) | success |  | 200 | provider | http → browser_local → installed_chrome → provider | minTables | 67060 | steel: success (answer) | not_loaded (checks_failed, region_not_ready, page_still_loading); region not held in 9947 ms |
| T011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4683 |  | ready (verified); region held in 1676 ms |
| T012 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → installed_chrome → provider | markdownCountMin | 61675 | steel: failed/empty_unverified (answer) | not_served (source_data_error); region not held in 9830 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 11944 |  | not_served (geo_restricted) |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 1756 |  | not_served (http_error) |
| T031 | cold | no | failed | provider_error |  | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 37474 | steel: failed/provider_error (answer) | not_served (provider_error) |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 409 |  | not_served (rate_limit) |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 62632 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1216 |  | not_served (rate_limit) |
| T045 | cold | no | blocked | captcha | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 54365 | steel: blocked/captcha (answer) | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 38692 | steel: blocked/captcha (answer) | not_served (captcha) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome; passed over: provider (steel, robots_override) | markdownMatches, markdownCountMin | 2993 |  | not_served (login_wall) |
| T068 | cold | no | failed | provider_error |  | provider | http → browser_local → installed_chrome → provider | markdownMatches, markdownCountMin | 32846 | steel: failed/provider_error (answer) | not_served (provider_error) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 48138 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1041 |  | not_served (rate_limit) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 914 |  | not_served (http_error) |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome → provider | markdownCountMin | 36251 | steel: failed/provider_error | not_loaded (empty_unverified, little_text); region not held in 9560 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 276 |  | not_served (http_error) |
- Task contract (cold): the product's verification agreed with the runner on 19 of 19 attempts that carry one (1 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
