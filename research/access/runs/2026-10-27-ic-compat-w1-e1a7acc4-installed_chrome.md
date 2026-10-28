# installed_chrome with compatible_transport and no Steel, window 1, arm installed_chrome, 2026-10-27

The runner's own records of this arm's runs in the window, copied whole; the comparison is in `2026-10-27-ic-compat-w1-e1a7acc4-summary.md`.

## installed_chrome-first-b0 (2026-10-27T09:09:50.569Z → 2026-10-27T09:14:02.514Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-27T09-09-50-663Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T005,T006,T007,T008,T009,T010,T011,T012,T013,T014,T015,T016,T017,T018,T019,T020,T021,T022,T023 --save-responses --record .w2l/access/ic-compat/2026-10-27-w1/installed_chrome-first-b0.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8851; access option: `"enhanced"`
- Exit address: 103.142.140.134
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-27T09:09:50.663Z → 2026-10-27T09:14:02.506Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020, T021, T022, T023); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 16 | 1 | 8788 | 28641 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 16, not_loaded 1, not_extracted 0, not_served 6, unknown 0; region waits: 16 (held on 13; scrolled on 3, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299998 ms); browser_local on 20 (time left at its start: median 298692 ms, least 30000 ms); installed_chrome on 13 (time left at its start: median 296996 ms, least 280159 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 7, browser 7, http 2
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9677 | ready (verified); region held in 552 ms |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10221 | ready (verified); region held in 552 ms |
| T003 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10837 | ready (verified); region held in 610 ms |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 5222 | not_served (connection_error) |
| T005 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 12419 | ready (verified); region held in 2697 ms, 2 screens scrolled |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8381 | ready (verified); region held in 4501 ms |
| T007 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6202 | ready (verified); region held in 732 ms |
| T008 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 691 | not_served (rate_limit) |
| T009 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14151 | ready (verified); region held in 597 ms |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | minTables | 35721 | not_served (checks_failed, region_absent); region not held in 9896 ms |
| T011 | cold | no | failed | empty_unverified | 200 | http | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 9722 | not_loaded (empty_unverified, not_rendered) |
| T012 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 28641 | not_served (source_data_error); region not held in 9987 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 16061 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 3886 | not_served (bot_detected_generic) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1771 | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8598 | ready (verified); region held in 979 ms |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5116 | ready (verified); region held in 741 ms |
| T018 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8788 | ready (verified); region held in 1187 ms |
| T019 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 28443 | ready (verified); region not held in 9464 ms, 10 screens scrolled |
| T020 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7237 | ready (verified); region held in 913 ms |
| T021 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8920 | ready (verified); region held in 803 ms |
| T022 | cold | yes | success |  | 200 | http | http |  | 2291 | ready (verified) |
| T023 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7965 | ready (verified); region held in 667 ms |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (16 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-first-b1 (2026-10-27T09:40:12.593Z → 2026-10-27T09:43:33.439Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-27T09-40-12-664Z`.

- Command: `node research/access/run-set.mjs --set all --only T024,T025,T026,T027,T029,T030,T031,T033,T034,T035,T036,T037,T038,T039,T040,T041,T042,T043,T044,T045,T046,T047,T048 --save-responses --record .w2l/access/ic-compat/2026-10-27-w1/installed_chrome-first-b1.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8851; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-27T09:40:12.664Z → 2026-10-27T09:43:33.433Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T024, T025, T026, T027, T029, T030, T031, T033, T034, T035, T036, T037, T038, T039, T040, T041, T042, T043, T044, T045, T046, T047, T048); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 15 | 0 | 6163 | 26534 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 15, not_loaded 0, not_extracted 0, not_served 8, unknown 0; region waits: 11 (held on 9; scrolled on 1, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 16 (time left at its start: median 298871 ms, least 297204 ms); installed_chrome on 12 (time left at its start: median 296609 ms, least 285462 ms)
- Verified answers by the route that delivered them (cold): http 6, browser 4, installed_chrome 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 1 (T041: rule /homes/, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T024 | cold | yes | success |  | 200 | http | http |  | 2199 | ready (verified) |
| T025 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 17211 | not_served (bot_detected_generic) |
| T026 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 9826 | ready (verified); region held in 738 ms |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 2514 | not_served (http_error) |
| T029 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5983 | ready (verified); region held in 682 ms |
| T030 | cold | no | blocked | login_wall | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 26534 | not_served (login_wall); region not held in 9914 ms, 1 screen scrolled |
| T031 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 28307 | not_served (captcha); region not held in 9974 ms |
| T033 | cold | yes | success |  | 200 | http | http |  | 2727 | ready (verified) |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5900 | ready (verified); region held in 782 ms |
| T035 | cold | yes | success |  | 200 | http | http |  | 1835 | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7049 | ready (verified); region held in 642 ms |
| T037 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 11134 | ready (verified); region held in 1047 ms |
| T038 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9758 | ready (verified); region held in 1798 ms |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8176 | ready (verified); region held in 725 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1265 | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 1508 | ready (verified) |
| T042 | cold | no | blocked | bot_detected_generic | 429 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 18913 | not_served (bot_detected_generic) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 6000 | not_served (bot_detected_generic) |
| T044 | cold | yes | success |  | 200 | http | http |  | 3547 | ready (verified) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 6163 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 4514 | not_served (captcha) |
| T047 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10332 | ready (verified); region held in 895 ms |
| T048 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8065 | ready (verified); region held in 661 ms |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (15 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-first-b2 (2026-10-27T09:52:35.758Z → 2026-10-27T09:57:29.687Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-27T09-52-35-826Z`.

- Command: `node research/access/run-set.mjs --set all --only T049,T050,T051,T052,T053,T055,T056,T057,T058,T059,T060,T061,T062,T063,T064,T065,T066,T067,T068,T069,T070,T071,T072 --save-responses --record .w2l/access/ic-compat/2026-10-27-w1/installed_chrome-first-b2.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8851; access option: `"enhanced"`
- Exit address: 103.142.140.59
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-27T09:52:35.826Z → 2026-10-27T09:57:29.681Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T049, T050, T051, T052, T053, T055, T056, T057, T058, T059, T060, T061, T062, T063, T064, T065, T066, T067, T068, T069, T070, T071, T072); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 17 | 0 | 4695 | 15071 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 17, not_loaded 0, not_extracted 0, not_served 6, unknown 0; region waits: 12 (held on 11)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 18 (time left at its start: median 299066 ms, least 294167 ms); installed_chrome on 9 (time left at its start: median 297589 ms, least 287272 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 3, browser 9, http 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T049: rule /, set aside; T052: unreachable, timeout, set aside; T059: rule /, set aside; T064: rule /, set aside; T066: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T049 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 13909 | ready (verified); region held in 784 ms |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 3707 | not_served (http_error) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4695 | ready (verified); region held in 734 ms |
| T052 | cold | no | failed | timeout |  | browser_local | http → browser_local → installed_chrome | minTables, markdownMatches | 144517 | not_served (timeout) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches | 5980 | not_served (bot_detected_generic) |
| T055 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14540 | ready (verified); region held in 3187 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3639 | ready (verified); region held in 657 ms |
| T057 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4178 | ready (verified); region held in 692 ms |
| T058 | cold | yes | success |  | 200 | http | http |  | 967 | ready (verified) |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3830 | ready (verified); region held in 671 ms |
| T060 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 13937 | ready (verified); region not held in 9493 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 2763 | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6911 | ready (verified); region held in 926 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1297 | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3922 | not_served (login_wall) |
| T065 | cold | yes | success |  | 200 | http | http |  | 1906 | ready (verified) |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7646 | ready (verified); region held in 1277 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3485 | ready (verified); region held in 625 ms |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 15071 | not_served (bot_detected_generic) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 12507 | not_served (cloudflare_challenge) |
| T070 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9464 | ready (verified); region held in 886 ms |
| T071 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10644 | ready (verified); region held in 722 ms |
| T072 | cold | yes | success |  | 200 | http | http |  | 3537 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (17 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-first-b3 (2026-10-27T10:00:22.580Z → 2026-10-27T10:02:37.172Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-27T10-00-22-651Z`.

- Command: `node research/access/run-set.mjs --set all --only T073,T074,T075,T076,T077,T078,T079,T080,T081,B001,B002,B003,B004,B005,B006,B007,B008,B009,B010,B011,B012,B013,B014 --save-responses --record .w2l/access/ic-compat/2026-10-27-w1/installed_chrome-first-b3.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8851; access option: `"enhanced"`
- Exit address: 103.142.140.59
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-27T10:00:22.651Z → 2026-10-27T10:02:37.164Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T073, T074, T075, T076, T077, T078, T079, T080, T081, B001, B002, B003, B004, B005, B006, B007, B008, B009, B010, B011, B012, B013, B014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 19 | 0 | 3996 | 15273 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 19, not_loaded 1, not_extracted 0, not_served 3, unknown 0; region waits: 11 (held on 10; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 11 (time left at its start: median 298948 ms, least 298171 ms); installed_chrome on 6 (time left at its start: median 296142 ms, least 286632 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 5, http 9, browser 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 13105 | ready (verified); region held in 603 ms |
| T074 | cold | yes | success |  | 200 | http | http |  | 1257 | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5507 | ready (verified); region held in 621 ms |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7416 | ready (verified); region held in 660 ms |
| T077 | cold | yes | success |  | 200 | http | http |  | 1635 | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1685 | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 1278 | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2498 | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1392 | not_served (http_error) |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 5142 | ready (verified); region held in 698 ms |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7176 | ready (verified); region held in 830 ms |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 15273 | not_loaded (empty_unverified, little_text); region not held in 9531 ms |
| B004 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9893 | ready (verified); region held in 1177 ms |
| B005 | cold | yes | success |  | 200 | http | http |  | 5037 | ready (verified) |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6582 | ready (verified); region held in 653 ms |
| B007 | cold | yes | success |  | 200 | http | http |  | 3804 | ready (verified) |
| B008 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 26218 | ready (verified); region held in 7072 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 838 | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7988 | ready (verified); region held in 2302 ms, 2 screens scrolled |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3996 | ready (verified); region held in 574 ms |
| B012 | cold | yes | success |  | 200 | http | http |  | 893 | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 3659 | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 916 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (19 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-retry (2026-10-27T10:35:19.602Z → 2026-10-27T10:39:49.897Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-27T10-35-19-682Z`.

- Command: `node research/access/run-set.mjs --set all --only T004,T008,T010,T011,T012,T013,T014,T025,T027,T030,T031,T042,T043,T045,T046,T050,T052,T053,T064,T068,T069,T078,T081,B003,B009 --save-responses --record .w2l/access/ic-compat/2026-10-27-w1/installed_chrome-retry.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8851; access option: `"enhanced"`
- Exit address: 103.142.140.152
- Grant: SHA-256 `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-27T10:35:19.682Z → 2026-10-27T10:39:49.885Z
- Tasks: 25 from `research/access/tasks.v1.json` (set `all`, only T004, T008, T010, T011, T012, T013, T014, T025, T027, T030, T031, T042, T043, T045, T046, T050, T052, T053, T064, T068, T069, T078, T081, B003, B009); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 25, attempted 25, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 25 | 3 | 1 | 6022 | 29671 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 3, not_loaded 2, not_extracted 0, not_served 20, unknown 0; region waits: 8 (held on 3; scrolled on 2, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 25 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 20 (time left at its start: median 299569 ms, least 30000 ms); installed_chrome on 18 (time left at its start: median 297675 ms, least 284457 ms)
- Verified answers by the route that delivered them (cold): browser 1, installed_chrome 2
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 3 (T052: unreachable, timeout, set aside; T064: rule /, set aside; T081: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3571 | not_served (connection_error) |
| T008 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 314 | not_served (rate_limit) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | minTables | 29671 | not_served (checks_failed, region_absent); region not held in 10000 ms |
| T011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 12995 | ready (verified); region held in 8621 ms |
| T012 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 26783 | not_served (source_data_error); region not held in 9631 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 15188 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 2687 | not_served (bot_detected_generic) |
| T025 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10529 | ready (verified); region held in 3732 ms |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 1771 | not_served (http_error) |
| T030 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 25741 | not_loaded (empty_unverified, little_text); region not held in 9954 ms, 1 screen scrolled |
| T031 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 26965 | not_served (captcha); region not held in 9939 ms |
| T042 | cold | no | blocked | bot_detected_generic | 429 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 16905 | not_served (bot_detected_generic) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 3766 | not_served (bot_detected_generic) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 4534 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 3229 | not_served (captcha) |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 2660 | not_served (http_error) |
| T052 | cold | no | failed | timeout |  | browser_local | http → browser_local | minTables, markdownMatches | 30896 | not_served (timeout) |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 6022 | ready (verified); region held in 612 ms |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3045 | not_served (login_wall) |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 12470 | not_served (bot_detected_generic) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 11861 | not_served (cloudflare_challenge) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 956 | not_served (rate_limit) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 879 | not_served (http_error) |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 15549 | not_loaded (empty_unverified, little_text); region not held in 9994 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 353 | not_served (http_error) |
- Task contract (cold): the product's verification agreed with the runner on 25 of 25 attempts that carry one (3 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
