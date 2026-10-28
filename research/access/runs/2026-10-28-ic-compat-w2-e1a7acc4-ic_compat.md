# installed_chrome with compatible_transport and no Steel, window 2, arm ic_compat, 2026-10-28

The runner's own records of this arm's runs in the window, copied whole; the comparison is in `2026-10-28-ic-compat-w2-e1a7acc4-summary.md`.

## ic_compat-first-b0 (2026-10-28T00:12:15.085Z → 2026-10-28T00:15:38.794Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-28T00-12-15-162Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T005,T006,T007,T008,T009,T010,T011,T012,T013,T014,T015,T016,T017,T018,T019,T020,T021,T022,T023 --save-responses --record .w2l/access/ic-compat/2026-10-28-w2/ic_compat-first-b0.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/ic-compat-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8853; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`; capabilities: installed_chrome, compatible_transport (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-28T00:12:15.162Z → 2026-10-28T00:15:38.788Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020, T021, T022, T023); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 17 | 2 | 5762 | 27577 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 17, not_loaded 0, not_extracted 0, not_served 6, unknown 0; region waits: 14 (held on 12; scrolled on 3, held on 2 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 20 (time left at its start: median 300000 ms, least 299998 ms); browser_local on 17 (time left at its start: median 299257 ms, least 30000 ms); installed_chrome on 13 (time left at its start: median 297453 ms, least 282707 ms); http_compat on 3 (time left at its start: median 300000 ms, least 300000 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 8, browser 4, http_compat 3, http 2
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10149 | ready (verified); region held in 562 ms |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8254 | ready (verified); region held in 539 ms |
| T003 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9173 | ready (verified); region held in 588 ms |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 4750 | not_served (connection_error) |
| T005 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10089 | ready (verified); region held in 2767 ms, 2 screens scrolled |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5762 | ready (verified); region held in 1249 ms |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 1675 | ready (verified) |
| T008 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1251 | not_served (rate_limit) |
| T009 | cold | yes | success |  | 200 | http | http_compat |  | 1427 | ready (verified) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | minTables | 32634 | not_served (checks_failed, region_absent); region not held in 9939 ms |
| T011 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9193 | ready (verified); region held in 2297 ms |
| T012 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 27577 | not_served (source_data_error); region not held in 9714 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 14464 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 3107 | not_served (bot_detected_generic) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1709 | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5253 | ready (verified); region held in 984 ms |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3846 | ready (verified); region held in 738 ms |
| T018 | cold | yes | success |  | 200 | http | http_compat |  | 3600 | ready (verified) |
| T019 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 26669 | ready (verified); region held in 8761 ms, 8 screens scrolled |
| T020 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7450 | ready (verified); region held in 878 ms |
| T021 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7840 | ready (verified); region held in 789 ms |
| T022 | cold | yes | success |  | 200 | http | http |  | 1809 | ready (verified) |
| T023 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 5203 | ready (verified); region held in 742 ms |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (17 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## ic_compat-first-b1 (2026-10-28T00:20:50.129Z → 2026-10-28T00:23:49.865Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-28T00-20-50-198Z`.

- Command: `node research/access/run-set.mjs --set all --only T024,T025,T026,T027,T029,T030,T031,T033,T034,T035,T036,T037,T038,T039,T040,T041,T042,T043,T044,T045,T046,T047,T048 --save-responses --record .w2l/access/ic-compat/2026-10-28-w2/ic_compat-first-b1.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/ic-compat-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8853; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`; capabilities: installed_chrome, compatible_transport (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-28T00:20:50.198Z → 2026-10-28T00:23:49.859Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T024, T025, T026, T027, T029, T030, T031, T033, T034, T035, T036, T037, T038, T039, T040, T041, T042, T043, T044, T045, T046, T047, T048); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 14 | 0 | 5203 | 25980 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 14, not_loaded 1, not_extracted 0, not_served 8, unknown 0; region waits: 10 (held on 8; scrolled on 1, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 22 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 16 (time left at its start: median 299085 ms, least 30000 ms); installed_chrome on 12 (time left at its start: median 296866 ms, least 286927 ms); http_compat on 1 (time left at its start: median 300000 ms, least 300000 ms)
- Verified answers by the route that delivered them (cold): http 5, installed_chrome 4, browser 4, http_compat 1
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 1 (T041: rule /homes/, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T024 | cold | yes | success |  | 200 | http | http |  | 1848 | ready (verified) |
| T025 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 11670 | ready (verified); region held in 4134 ms |
| T026 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 18531 | ready (verified); region held in 706 ms |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 2434 | not_served (http_error) |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 2614 | ready (verified) |
| T030 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 26255 | not_loaded (empty_unverified, little_text); region not held in 9975 ms, 1 screen scrolled |
| T031 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 25980 | not_served (captcha); region not held in 9886 ms |
| T033 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4845 | ready (verified); region held in 687 ms |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5751 | ready (verified); region held in 783 ms |
| T035 | cold | yes | success |  | 200 | http | http |  | 1430 | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5203 | ready (verified); region held in 641 ms |
| T037 | cold | no | blocked | captcha | 429 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 4774 | not_served (captcha) |
| T038 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 4828 | not_served (captcha) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 6346 | ready (verified); region held in 727 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1167 | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 1208 | ready (verified) |
| T042 | cold | no | blocked | bot_detected_generic | 429 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 16997 | not_served (bot_detected_generic) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 5541 | not_served (bot_detected_generic) |
| T044 | cold | yes | success |  | 200 | http | http |  | 2552 | ready (verified) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 5899 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 4161 | not_served (captcha) |
| T047 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10085 | ready (verified); region held in 790 ms |
| T048 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8816 | ready (verified); region held in 673 ms |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (14 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## ic_compat-first-b2 (2026-10-28T00:26:35.416Z → 2026-10-28T00:29:03.074Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-28T00-26-35-479Z`.

- Command: `node research/access/run-set.mjs --set all --only T049,T050,T051,T052,T053,T055,T056,T057,T058,T059,T060,T061,T062,T063,T064,T065,T066,T067,T068,T069,T070,T071,T072 --save-responses --record .w2l/access/ic-compat/2026-10-28-w2/ic_compat-first-b2.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/ic-compat-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8853; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`; capabilities: installed_chrome, compatible_transport (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-28T00:26:35.479Z → 2026-10-28T00:29:03.069Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T049, T050, T051, T052, T053, T055, T056, T057, T058, T059, T060, T061, T062, T063, T064, T065, T066, T067, T068, T069, T070, T071, T072); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 19 | 0 | 4914 | 14296 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 19, not_loaded 0, not_extracted 0, not_served 4, unknown 0; region waits: 13 (held on 12)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 22 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 17 (time left at its start: median 299274 ms, least 293800 ms); installed_chrome on 8 (time left at its start: median 297854 ms, least 297442 ms); http_compat on 1 (time left at its start: median 300000 ms, least 300000 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 4, browser 9, http_compat 1, http 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 4 (T049: rule /, set aside; T059: rule /, set aside; T064: rule /, set aside; T066: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T049 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 11938 | ready (verified); region held in 757 ms |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 3294 | not_served (http_error) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4889 | ready (verified); region held in 731 ms |
| T052 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4979 | ready (verified); region held in 578 ms |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7197 | ready (verified); region held in 615 ms |
| T055 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14296 | ready (verified); region held in 2605 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3306 | ready (verified); region held in 657 ms |
| T057 | cold | yes | success |  | 200 | http | http_compat |  | 958 | ready (verified) |
| T058 | cold | yes | success |  | 200 | http | http |  | 922 | ready (verified) |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2618 | ready (verified); region held in 676 ms |
| T060 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14422 | ready (verified); region not held in 9481 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 3090 | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5933 | ready (verified); region held in 917 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1038 | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3563 | not_served (login_wall) |
| T065 | cold | yes | success |  | 200 | http | http |  | 1620 | ready (verified) |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 11520 | ready (verified); region held in 678 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 4914 | ready (verified); region held in 597 ms |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 13754 | not_served (bot_detected_generic) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 12601 | not_served (cloudflare_challenge) |
| T070 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6933 | ready (verified); region held in 842 ms |
| T071 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9787 | ready (verified); region held in 698 ms |
| T072 | cold | yes | success |  | 200 | http | http |  | 3265 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (19 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## ic_compat-first-b3 (2026-10-28T00:40:30.818Z → 2026-10-28T00:42:23.486Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-28T00-40-30-887Z`.

- Command: `node research/access/run-set.mjs --set all --only T073,T074,T075,T076,T077,T078,T079,T080,T081,B001,B002,B003,B004,B005,B006,B007,B008,B009,B010,B011,B012,B013,B014 --save-responses --record .w2l/access/ic-compat/2026-10-28-w2/ic_compat-first-b3.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/ic-compat-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8853; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`; capabilities: installed_chrome, compatible_transport (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-28T00:40:30.887Z → 2026-10-28T00:42:23.480Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T073, T074, T075, T076, T077, T078, T079, T080, T081, B001, B002, B003, B004, B005, B006, B007, B008, B009, B010, B011, B012, B013, B014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 19 | 0 | 3763 | 14479 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 19, not_loaded 1, not_extracted 0, not_served 3, unknown 0; region waits: 11 (held on 10; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 11 (time left at its start: median 299230 ms, least 298441 ms); installed_chrome on 6 (time left at its start: median 297812 ms, least 285685 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 5, http 9, browser 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9306 | ready (verified); region held in 1144 ms |
| T074 | cold | yes | success |  | 200 | http | http |  | 721 | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4834 | ready (verified); region held in 643 ms |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 6900 | ready (verified); region held in 1197 ms |
| T077 | cold | yes | success |  | 200 | http | http |  | 836 | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1521 | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 1309 | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2027 | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1107 | not_served (http_error) |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 5135 | ready (verified); region held in 699 ms |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6894 | ready (verified); region held in 842 ms |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 14479 | not_loaded (empty_unverified, little_text); region not held in 9595 ms |
| B004 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7604 | ready (verified); region held in 2080 ms |
| B005 | cold | yes | success |  | 200 | http | http |  | 4309 | ready (verified) |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4230 | ready (verified); region held in 664 ms |
| B007 | cold | yes | success |  | 200 | http | http |  | 3763 | ready (verified) |
| B008 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 22300 | ready (verified); region held in 2662 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 730 | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6906 | ready (verified); region held in 1755 ms, 1 screen scrolled |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3389 | ready (verified); region held in 575 ms |
| B012 | cold | yes | success |  | 200 | http | http |  | 834 | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 1905 | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 860 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (19 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## ic_compat-retry (2026-10-28T00:51:09.847Z → 2026-10-28T00:54:31.770Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-28T00-51-09-934Z`.

- Command: `node research/access/run-set.mjs --set all --only T004,T008,T010,T012,T013,T014,T027,T030,T031,T037,T038,T042,T043,T045,T046,T050,T064,T068,T069,T078,T081,B003,B009 --save-responses --record .w2l/access/ic-compat/2026-10-28-w2/ic_compat-retry.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/ic-compat-grant-k1.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8853; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`; capabilities: installed_chrome, compatible_transport (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-28T00:51:09.934Z → 2026-10-28T00:54:31.763Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T004, T008, T010, T012, T013, T014, T027, T030, T031, T037, T038, T042, T043, T045, T046, T050, T064, T068, T069, T078, T081, B003, B009); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 1 | 3 | 3435 | 25944 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 1, not_loaded 1, not_extracted 0, not_served 21, unknown 0; region waits: 5 (held on 1; scrolled on 3, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 18 (time left at its start: median 299529 ms, least 30000 ms); installed_chrome on 17 (time left at its start: median 298141 ms, least 284404 ms)
- Verified answers by the route that delivered them (cold): browser 1
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 2 (T064: rule /, set aside; T081: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3435 | not_served (connection_error) |
| T008 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 747 | not_served (rate_limit) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | minTables | 29701 | not_served (checks_failed, region_absent); region not held in 9659 ms |
| T012 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 25944 | not_served (source_data_error); region not held in 9758 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 14225 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 2461 | not_served (bot_detected_generic) |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 1727 | not_served (http_error) |
| T030 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 24753 | not_loaded (empty_unverified, little_text); region not held in 9998 ms, 1 screen scrolled |
| T031 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 24848 | not_served (checks_failed, region_absent); region not held in 9808 ms |
| T037 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8329 | ready (verified); region held in 3355 ms, 3 screens scrolled |
| T038 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 3650 | not_served (captcha) |
| T042 | cold | no | blocked | bot_detected_generic | 429 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 15539 | not_served (bot_detected_generic) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 3181 | not_served (bot_detected_generic) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 4306 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 2897 | not_served (captcha) |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 2368 | not_served (http_error) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 2862 | not_served (login_wall) |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 12344 | not_served (bot_detected_generic) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 12122 | not_served (cloudflare_challenge) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 946 | not_served (rate_limit) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 879 | not_served (http_error) |
| B003 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 3150 | not_served (bot_detected_generic) |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 328 | not_served (http_error) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (1 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
