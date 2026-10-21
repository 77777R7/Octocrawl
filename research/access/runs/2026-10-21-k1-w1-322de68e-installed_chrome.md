# K1 window 1, arm installed_chrome, 2026-10-21

The runner's own records of this arm's runs in the window, copied whole; the comparison is in `2026-10-21-k1-w1-322de68e-summary.md`.

**The installed_chrome grant was used outside its declared scope in window 1.** Grant `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818` attests launching the installed Chrome for the 16 challenge tasks (Howard, 2026-10-14). Window 1 ran it on all 92 access tasks and on reserved set v2 (`research/accuracy/runs/2026-10-21-k1-w1-live-v2-322de68e.md`). Howard decided (2026-10-21, in chat, relayed by the coordinating session) that window 2 uses a separate K1 grant with the same settings and a statement naming K1's 92 tasks plus reserved v2 (git-ignored, never committed; its SHA-256 goes in window 2's records). The weekly rerun keeps the 16-task grant, unchanged.

## installed_chrome-first-b0 (2026-10-21T12:32:31.465Z → 2026-10-21T12:36:36.886Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-21T12-32-31-545Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T005,T006,T007,T008,T009,T010,T011,T012,T013,T014,T015,T016,T017,T018,T019,T020,T021,T022,T023 --save-responses --record .w2l/access/k1/2026-10-21-w1/installed_chrome-first-b0.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant.json`
- Source commit: `322de68e`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8823; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-21T12:32:31.545Z → 2026-10-21T12:36:36.881Z
- Tasks: 23 (set `all`, only T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020, T021, T022, T023); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 12 | 1 | 7450 | 33443 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 12, not_loaded 0, not_extracted 0, not_served 11, unknown 0; region waits: 12 (held on 11; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299995 ms); browser_local on 18 (time left at its start: median 298905 ms, least 30000 ms); installed_chrome on 12 (time left at its start: median 296608 ms, least 281816 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 5, browser 5, http 2
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 1 (T018: unreachable, server_error, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 8838 | not_served (captcha) |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8827 | ready (verified); region held in 567 ms |
| T003 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9582 | ready (verified); region held in 578 ms |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 5195 | not_served (connection_error) |
| T005 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 24633 | not_served (captcha) |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6816 | ready (verified); region held in 2784 ms |
| T007 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1296 | not_served (rate_limit) |
| T008 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 506 | not_served (rate_limit) |
| T009 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 13352 | ready (verified); region held in 586 ms |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | minTables | 33443 | not_served (checks_failed, region_absent); region not held in 9572 ms |
| T011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5442 | ready (verified); region held in 583 ms |
| T012 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 35638 | not_served (captcha) |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13475 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 3262 | not_served (bot_detected_generic) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1758 | ready (verified) |
| T016 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 13279 | not_served (connection_error); region held in 1064 ms |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4415 | ready (verified); region held in 695 ms |
| T018 | cold | no | blocked | captcha | 429 | http | http | markdownCountMin, markdownMatches | 1817 | not_served (captcha) |
| T019 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 27472 | ready (verified); region held in 8227 ms, 7 screens scrolled |
| T020 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7450 | ready (verified); region held in 916 ms |
| T021 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9226 | ready (verified); region held in 899 ms |
| T022 | cold | yes | success |  | 200 | http | http |  | 2036 | ready (verified) |
| T023 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 6859 | ready (verified); region held in 680 ms |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (12 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-first-b1 (2026-10-21T12:53:39.058Z → 2026-10-21T12:57:46.147Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-21T12-53-39-143Z`.

- Command: `node research/access/run-set.mjs --set all --only T024,T025,T026,T027,T029,T030,T031,T033,T034,T035,T036,T037,T038,T039,T040,T041,T042,T043,T044,T045,T046,T047,T048 --save-responses --record .w2l/access/k1/2026-10-21-w1/installed_chrome-first-b1.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant.json`
- Source commit: `322de68e`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8823; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-21T12:53:39.143Z → 2026-10-21T12:57:46.141Z
- Tasks: 23 (set `all`, only T024, T025, T026, T027, T029, T030, T031, T033, T034, T035, T036, T037, T038, T039, T040, T041, T042, T043, T044, T045, T046, T047, T048); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 12 | 1 | 5550 | 26162 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 12, not_loaded 1, not_extracted 0, not_served 10, unknown 0; region waits: 8 (held on 6; scrolled on 1, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 14 (time left at its start: median 298847 ms, least 297604 ms); installed_chrome on 10 (time left at its start: median 296613 ms, least 286330 ms)
- Verified answers by the route that delivered them (cold): http 6, installed_chrome 2, browser 4
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 1 (T041: rule /homes/, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T024 | cold | yes | success |  | 200 | http | http |  | 2503 | ready (verified) |
| T025 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 12049 | ready (verified); region held in 3616 ms |
| T026 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 9553 | ready (verified); region held in 740 ms |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 2479 | not_served (http_error) |
| T029 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7993 | ready (verified); region held in 740 ms |
| T030 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 27004 | not_loaded (empty_unverified, little_text); region not held in 9960 ms, 1 screen scrolled |
| T031 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 26162 | not_served (checks_failed, region_absent); region not held in 9736 ms |
| T033 | cold | yes | success |  | 200 | http | http |  | 1700 | ready (verified) |
| T034 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 22236 | not_served (captcha) |
| T035 | cold | yes | success |  | 200 | http | http |  | 2277 | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5143 | ready (verified); region held in 634 ms |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1155 | not_served (rate_limit) |
| T038 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 24231 | not_served (captcha) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4625 | ready (verified); region held in 709 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1260 | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 2088 | ready (verified) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1347 | not_served (rate_limit) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 5550 | not_served (bot_detected_generic) |
| T044 | cold | yes | success |  | 200 | http | http |  | 2611 | ready (verified) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 25337 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 25606 | not_served (captcha) |
| T047 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10367 | ready (verified); region held in 866 ms |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 23083 | not_served (cloudflare_challenge) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (12 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-first-b2 (2026-10-21T13:04:31.029Z → 2026-10-21T13:08:13.378Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-21T13-04-31-101Z`.

- Command: `node research/access/run-set.mjs --set all --only T049,T050,T051,T052,T053,T055,T056,T057,T058,T059,T060,T061,T062,T063,T064,T065,T066,T067,T068,T069,T070,T071,T072 --save-responses --record .w2l/access/k1/2026-10-21-w1/installed_chrome-first-b2.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant.json`
- Source commit: `322de68e`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8823; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-21T13:04:31.101Z → 2026-10-21T13:08:13.373Z
- Tasks: 23 (set `all`, only T049, T050, T051, T052, T053, T055, T056, T057, T058, T059, T060, T061, T062, T063, T064, T065, T066, T067, T068, T069, T070, T071, T072); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 17 | 0 | 6261 | 24224 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 17, not_loaded 0, not_extracted 0, not_served 6, unknown 0; region waits: 13 (held on 12)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 19 (time left at its start: median 299139 ms, least 295176 ms); installed_chrome on 10 (time left at its start: median 297407 ms, least 295978 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 4, browser 9, http 4
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 4 (T049: rule /, set aside; T059: rule /, set aside; T064: rule /, set aside; T066: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T049 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 13604 | ready (verified); region held in 745 ms |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 3941 | not_served (http_error) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4957 | ready (verified); region held in 709 ms |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | minTables, markdownMatches | 25877 | not_served (cloudflare_challenge) |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8823 | ready (verified); region held in 608 ms |
| T055 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14802 | ready (verified); region held in 2538 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3946 | ready (verified); region held in 707 ms |
| T057 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3859 | ready (verified); region held in 704 ms |
| T058 | cold | yes | success |  | 200 | http | http |  | 872 | ready (verified) |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3066 | ready (verified); region held in 650 ms |
| T060 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 17795 | ready (verified); region not held in 9969 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 2898 | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6261 | ready (verified); region held in 905 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1223 | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 4262 | not_served (login_wall) |
| T065 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 23734 | not_served (captcha) |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7218 | ready (verified); region held in 660 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4248 | ready (verified); region held in 594 ms |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 24224 | not_served (bot_detected_generic) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 22568 | not_served (cloudflare_challenge) |
| T070 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9181 | ready (verified); region held in 888 ms |
| T071 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9584 | ready (verified); region held in 753 ms |
| T072 | cold | yes | success |  | 200 | http | http |  | 4189 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (17 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-first-b3 (2026-10-21T13:27:13.375Z → 2026-10-21T13:29:17.950Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-21T13-27-13-437Z`.

- Command: `node research/access/run-set.mjs --set all --only T073,T074,T075,T076,T077,T078,T079,T080,T081,B001,B002,B003,B004,B005,B006,B007,B008,B009,B010,B011,B012,B013,B014 --save-responses --record .w2l/access/k1/2026-10-21-w1/installed_chrome-first-b3.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant.json`
- Source commit: `322de68e`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8823; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-21T13:27:13.437Z → 2026-10-21T13:29:17.943Z
- Tasks: 23 (set `all`, only T073, T074, T075, T076, T077, T078, T079, T080, T081, B001, B002, B003, B004, B005, B006, B007, B008, B009, B010, B011, B012, B013, B014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 19 | 0 | 3915 | 14443 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 19, not_loaded 1, not_extracted 0, not_served 3, unknown 0; region waits: 11 (held on 10; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 11 (time left at its start: median 299154 ms, least 298453 ms); installed_chrome on 6 (time left at its start: median 297518 ms, least 286441 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 5, http 9, browser 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9696 | ready (verified); region held in 606 ms |
| T074 | cold | yes | success |  | 200 | http | http |  | 816 | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5527 | ready (verified); region held in 1169 ms |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 6927 | ready (verified); region held in 660 ms |
| T077 | cold | yes | success |  | 200 | http | http |  | 1467 | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1582 | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 1834 | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 3141 | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1231 | not_served (http_error) |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10406 | ready (verified); region held in 725 ms |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7067 | ready (verified); region held in 878 ms |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 14443 | not_loaded (empty_unverified, little_text); region not held in 9576 ms |
| B004 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8987 | ready (verified); region held in 1166 ms |
| B005 | cold | yes | success |  | 200 | http | http |  | 4236 | ready (verified) |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3915 | ready (verified); region held in 661 ms |
| B007 | cold | yes | success |  | 200 | http | http |  | 3811 | ready (verified) |
| B008 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 21519 | ready (verified); region held in 2642 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 839 | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7746 | ready (verified); region held in 1792 ms, 1 screen scrolled |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4314 | ready (verified); region held in 573 ms |
| B012 | cold | yes | success |  | 200 | http | http |  | 1179 | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 1989 | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 1166 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (19 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## installed_chrome-retry (2026-10-21T13:41:54.310Z → 2026-10-21T13:47:53.054Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-21T13-41-54-382Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T004,T005,T007,T008,T010,T012,T013,T014,T016,T018,T027,T030,T031,T034,T037,T038,T042,T043,T045,T046,T048,T050,T052,T064,T065,T068,T069,T078,T081,B003,B009 --save-responses --record .w2l/access/k1/2026-10-21-w1/installed_chrome-retry.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/installed-chrome-grant.json`
- Source commit: `322de68e`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8823; access option: `"enhanced"`
- Exit address: 116.87.8.235
- Grant: SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-21T13:41:54.382Z → 2026-10-21T13:47:53.042Z
- Tasks: 32 (set `all`, only T001, T004, T005, T007, T008, T010, T012, T013, T014, T016, T018, T027, T030, T031, T034, T037, T038, T042, T043, T045, T046, T048, T050, T052, T064, T065, T068, T069, T078, T081, B003, B009); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 32, attempted 32, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 32 | 7 | 1 | 8797 | 27647 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 7, not_loaded 2, not_extracted 0, not_served 23, unknown 0; region waits: 12 (held on 7; scrolled on 2, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 32 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 23 (time left at its start: median 299572 ms, least 30000 ms); installed_chrome on 20 (time left at its start: median 298010 ms, least 282262 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 4, http 1, browser 2
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 2 (T064: rule /, set aside; T081: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8797 | ready (verified); region held in 562 ms |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 4054 | not_served (connection_error) |
| T005 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9185 | ready (verified); region held in 2741 ms, 2 screens scrolled |
| T007 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1136 | not_served (rate_limit) |
| T008 | cold | yes | success |  | 200 | http | http |  | 1775 | ready (verified) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | minTables | 32135 | not_served (checks_failed, region_absent); region not held in 9865 ms |
| T012 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 24041 | not_served (captcha) |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 12330 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 3417 | not_served (bot_detected_generic) |
| T016 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 12985 | not_served (connection_error); region held in 1174 ms |
| T018 | cold | no | blocked | captcha | 429 | http | http | markdownCountMin, markdownMatches | 1757 | not_served (captcha) |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 794 | not_served (http_error) |
| T030 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 25622 | not_loaded (empty_unverified, little_text); region not held in 9972 ms, 1 screen scrolled |
| T031 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 27647 | not_served (captcha); region not held in 9597 ms |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5584 | ready (verified); region held in 786 ms |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 555 | not_served (rate_limit) |
| T038 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8852 | ready (verified); region held in 796 ms |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 747 | not_served (rate_limit) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 4065 | not_served (bot_detected_generic) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 23721 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 22720 | not_served (captcha) |
| T048 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7926 | ready (verified); region held in 676 ms |
| T050 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 24501 | not_served (bot_detected_generic); region not held in 9606 ms |
| T052 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6487 | ready (verified); region held in 571 ms |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3357 | not_served (login_wall) |
| T065 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 22288 | not_served (captcha) |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 23518 | not_served (bot_detected_generic) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 22198 | not_served (cloudflare_challenge) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 957 | not_served (rate_limit) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 473 | not_served (http_error) |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 13929 | not_loaded (empty_unverified, little_text); region not held in 9722 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 430 | not_served (http_error) |
- Task contract (cold): the product's verification agreed with the runner on 32 of 32 attempts that carry one (7 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
