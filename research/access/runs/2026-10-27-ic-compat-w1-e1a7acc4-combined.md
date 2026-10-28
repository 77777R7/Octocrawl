# installed_chrome with compatible_transport and no Steel, window 1, arm combined, 2026-10-27

The runner's own records of this arm's runs in the window, copied whole; the comparison is in `2026-10-27-ic-compat-w1-e1a7acc4-summary.md`.

## combined-first-b0 (2026-10-27T09:17:21.877Z → 2026-10-27T09:27:25.202Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-27T09-17-21-949Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T005,T006,T007,T008,T009,T010,T011,T012,T013,T014,T015,T016,T017,T018,T019,T020,T021,T022,T023 --save-responses --record .w2l/access/ic-compat/2026-10-27-w1/combined-first-b0.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8853; access option: `"enhanced"`
- Exit address: 103.142.140.157
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-27T09:17:21.949Z → 2026-10-27T09:27:25.195Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020, T021, T022, T023); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 18 | 1 | 8914 | 168106 | unknown | unknown |

- Paid provider calls (cold): 4; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0089 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 18, not_loaded 0, not_extracted 0, not_served 5, unknown 0; region waits: 14 (held on 11; scrolled on 3, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 20 (time left at its start: median 299999 ms, least 299996 ms); browser_local on 17 (time left at its start: median 298991 ms, least 30000 ms); installed_chrome on 12 (time left at its start: median 297452 ms, least 281545 ms); http_compat on 3 (time left at its start: median 299999 ms, least 299999 ms); provider on 4 (time left at its start: median 272792 ms, least 265864 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 7, browser 5, http_compat 3, http 3
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10592 |  | ready (verified); region held in 558 ms |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9543 |  | ready (verified); region held in 535 ms |
| T003 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9929 |  | ready (verified); region held in 564 ms |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 5129 |  | not_served (connection_error) |
| T005 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 11088 |  | ready (verified); region held in 2710 ms, 2 screens scrolled |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6053 |  | ready (verified); region held in 2328 ms |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 1286 |  | ready (verified) |
| T008 | cold | yes | success |  | 200 | http | http |  | 2031 |  | ready (verified) |
| T009 | cold | yes | success |  | 200 | http | http_compat |  | 1085 |  | ready (verified) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome → provider | minTables | 97210 | steel: success | not_served (checks_failed, region_absent); region not held in 9787 ms |
| T011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 11675 |  | ready (verified); region held in 6788 ms |
| T012 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome → provider | markdownCountMin | 178912 | steel: failed/timeout | not_served (source_data_error); region not held in 9656 ms, 1 screen scrolled |
| T013 | cold | no | failed | timeout |  | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 168106 | steel: failed/timeout (answer) | not_served (timeout) |
| T014 | cold | no | failed | http_error | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 24227 | steel: failed/http_error (answer) | not_served (http_error) |
| T015 | cold | yes | success |  | 200 | http | http |  | 2354 |  | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8674 |  | ready (verified); region held in 934 ms |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6586 |  | ready (verified); region held in 684 ms |
| T018 | cold | yes | success |  | 200 | http | http_compat |  | 4071 |  | ready (verified) |
| T019 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14321 |  | ready (verified); region not held in 9813 ms, 10 screens scrolled |
| T020 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10861 |  | ready (verified); region held in 1011 ms |
| T021 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8914 |  | ready (verified); region held in 776 ms |
| T022 | cold | yes | success |  | 200 | http | http |  | 3247 |  | ready (verified) |
| T023 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 6403 |  | ready (verified); region held in 662 ms |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (18 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## combined-first-b1 (2026-10-27T09:30:53.938Z → 2026-10-27T09:40:12.591Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-27T09-30-54-009Z`.

- Command: `node research/access/run-set.mjs --set all --only T024,T025,T026,T027,T029,T030,T031,T033,T034,T035,T036,T037,T038,T039,T040,T041,T042,T043,T044,T045,T046,T047,T048 --save-responses --record .w2l/access/ic-compat/2026-10-27-w1/combined-first-b1.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8853; access option: `"enhanced"`
- Exit address: 103.142.140.136
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-27T09:30:54.009Z → 2026-10-27T09:40:12.583Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T024, T025, T026, T027, T029, T030, T031, T033, T034, T035, T036, T037, T038, T039, T040, T041, T042, T043, T044, T045, T046, T047, T048); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 16 | 0 | 9663 | 179987 | unknown | unknown |

- Paid provider calls (cold): unknown; tasks verified with a paid call's page as the answer: unknown; charged by the spend ledger: unknown (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 16, not_loaded 1, not_extracted 0, not_served 5, unknown 1; region waits: 10 (held on 9; scrolled on 1, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): other on T042 (provider, steel: a rung met a challenge served with 429 or 503; after a 429 the run keeps its own exit (ADR 0005), and a vendor rung leaves through another); not known on 1 attempt without a ladder trace

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 21 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 14 (time left at its start: median 298762 ms, least 296744 ms); installed_chrome on 11 (time left at its start: median 296727 ms, least 286173 ms); http_compat on 1 (time left at its start: median 299999 ms, least 299999 ms); provider on 4 (time left at its start: median 290753 ms, least 272224 ms)
- Verified answers by the route that delivered them (cold): http 6, installed_chrome 6, browser 3, http_compat 1
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 1 (T041: rule /homes/, set aside); not known on 1 attempt without a robots check

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T024 | cold | yes | success |  | 200 | http | http |  | 2145 |  | ready (verified) |
| T025 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 12199 |  | ready (verified); region held in 3656 ms |
| T026 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 10504 |  | ready (verified); region held in 725 ms |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 1791 |  | not_served (http_error) |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 3164 |  | ready (verified) |
| T030 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 179987 | steel: failed/timeout | not_loaded (empty_unverified, little_text); region not held in 9880 ms, 1 screen scrolled |
| T031 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 180007 | unknown | unknown |
| T033 | cold | yes | success |  | 200 | http | http |  | 2564 |  | ready (verified) |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6460 |  | ready (verified); region held in 1365 ms |
| T035 | cold | yes | success |  | 200 | http | http |  | 1808 |  | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5926 |  | ready (verified); region held in 711 ms |
| T037 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 11536 |  | ready (verified); region held in 1610 ms |
| T038 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9663 |  | ready (verified); region held in 1003 ms |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7396 |  | ready (verified); region held in 739 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1328 |  | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 1708 |  | ready (verified) |
| T042 | cold | no | blocked | bot_detected_generic | 429 | browser_local | http → browser_local → installed_chrome; passed over: provider (steel, other) | markdownCountMin, markdownMatches | 18516 |  | not_served (bot_detected_generic) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 22261 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T044 | cold | yes | success |  | 200 | http | http |  | 2817 |  | ready (verified) |
| T045 | cold | no | blocked | captcha | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 22547 | steel: blocked/captcha (answer) | not_served (captcha) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 31648 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T047 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10928 |  | ready (verified); region held in 804 ms |
| T048 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10299 |  | ready (verified); region held in 735 ms |
- Task contract (cold): the product's verification agreed with the runner on 22 of 22 attempts that carry one (16 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## combined-first-b2 (2026-10-27T09:43:36.436Z → 2026-10-27T09:52:35.757Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-27T09-43-36-518Z`.

- Command: `node research/access/run-set.mjs --set all --only T049,T050,T051,T052,T053,T055,T056,T057,T058,T059,T060,T061,T062,T063,T064,T065,T066,T067,T068,T069,T070,T071,T072 --save-responses --record .w2l/access/ic-compat/2026-10-27-w1/combined-first-b2.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8853; access option: `"enhanced"`
- Exit address: 103.142.140.59
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-27T09:43:36.518Z → 2026-10-27T09:52:35.751Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T049, T050, T051, T052, T053, T055, T056, T057, T058, T059, T060, T061, T062, T063, T064, T065, T066, T067, T068, T069, T070, T071, T072); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 19 | 0 | 6495 | 155328 | unknown | unknown |

- Paid provider calls (cold): 3; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0079 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 19, not_loaded 0, not_extracted 0, not_served 4, unknown 0; region waits: 13 (held on 12)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): robots_override on T064 (provider, steel)

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 22 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 17 (time left at its start: median 299037 ms, least 294233 ms); installed_chrome on 10 (time left at its start: median 297486 ms, least 287614 ms); provider on 3 (time left at its start: median 287007 ms, least 285533 ms); http_compat on 1 (time left at its start: median 300000 ms, least 300000 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 6, browser 7, http_compat 1, http 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T049: rule /, set aside; T052: unreachable, timeout, set aside; T059: rule /, set aside; T064: rule /, set aside; T066: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T049 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 12352 |  | ready (verified); region held in 716 ms |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local → installed_chrome → provider | markdownMatches, markdownMatches | 155328 | steel: failed/timeout | not_served (http_error) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5229 |  | ready (verified); region held in 771 ms |
| T052 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 31523 |  | ready (verified); region held in 574 ms |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8517 |  | ready (verified); region held in 615 ms |
| T055 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 16830 |  | ready (verified); region held in 7609 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3764 |  | ready (verified); region held in 654 ms |
| T057 | cold | yes | success |  | 200 | http | http_compat |  | 1198 |  | ready (verified) |
| T058 | cold | yes | success |  | 200 | http | http |  | 869 |  | ready (verified) |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3021 |  | ready (verified); region held in 671 ms |
| T060 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 16537 |  | ready (verified); region not held in 9893 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 2854 |  | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6495 |  | ready (verified); region held in 933 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1685 |  | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome; passed over: provider (steel, robots_override) | markdownMatches, markdownCountMin | 5132 |  | not_served (login_wall) |
| T065 | cold | yes | success |  | 200 | http | http |  | 2017 |  | ready (verified) |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6932 |  | ready (verified); region held in 1849 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 5468 |  | ready (verified); region held in 620 ms |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → installed_chrome → provider | markdownMatches, markdownCountMin | 60665 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T069 | cold | no | failed | timeout |  | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 166619 | steel: failed/timeout (answer) | not_served (timeout) |
| T070 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 11606 |  | ready (verified); region held in 912 ms |
| T071 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9969 |  | ready (verified); region held in 715 ms |
| T072 | cold | yes | success |  | 200 | http | http |  | 3770 |  | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (19 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## combined-first-b3 (2026-10-27T10:04:44.363Z → 2026-10-27T10:08:53.777Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-27T10-04-44-432Z`.

- Command: `node research/access/run-set.mjs --set all --only T073,T074,T075,T076,T077,T078,T079,T080,T081,B001,B002,B003,B004,B005,B006,B007,B008,B009,B010,B011,B012,B013,B014 --save-responses --record .w2l/access/ic-compat/2026-10-27-w1/combined-first-b3.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8853; access option: `"enhanced"`
- Exit address: 103.142.140.59
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-27T10:04:44.432Z → 2026-10-27T10:08:53.770Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T073, T074, T075, T076, T077, T078, T079, T080, T081, B001, B002, B003, B004, B005, B006, B007, B008, B009, B010, B011, B012, B013, B014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 19 | 0 | 3850 | 25135 | unknown | unknown |

- Paid provider calls (cold): 1; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0033 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 19, not_loaded 1, not_extracted 0, not_served 3, unknown 0; region waits: 11 (held on 10; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 11 (time left at its start: median 299163 ms, least 298133 ms); installed_chrome on 6 (time left at its start: median 297656 ms, least 286444 ms); provider on 1 (time left at its start: median 284942 ms, least 284942 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 5, http 9, browser 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10834 |  | ready (verified); region held in 1128 ms |
| T074 | cold | yes | success |  | 200 | http | http |  | 867 |  | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4548 |  | ready (verified); region held in 644 ms |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7077 |  | ready (verified); region held in 662 ms |
| T077 | cold | yes | success |  | 200 | http | http |  | 1557 |  | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1687 |  | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 1327 |  | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2397 |  | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1195 |  | not_served (http_error) |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 5036 |  | ready (verified); region held in 706 ms |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7353 |  | ready (verified); region held in 844 ms |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome → provider | markdownCountMin | 138868 | steel: failed/timeout | not_loaded (empty_unverified, little_text); region not held in 9593 ms |
| B004 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7978 |  | ready (verified); region held in 1225 ms |
| B005 | cold | yes | success |  | 200 | http | http |  | 3788 |  | ready (verified) |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4250 |  | ready (verified); region held in 658 ms |
| B007 | cold | yes | success |  | 200 | http | http |  | 4048 |  | ready (verified) |
| B008 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 25135 |  | ready (verified); region held in 7350 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 871 |  | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 10009 |  | ready (verified); region held in 2435 ms, 2 screens scrolled |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3663 |  | ready (verified); region held in 564 ms |
| B012 | cold | yes | success |  | 200 | http | http |  | 1210 |  | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 3850 |  | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 1047 |  | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (19 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## combined-retry (2026-10-27T10:12:58.553Z → 2026-10-27T10:35:19.601Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-27T10-12-58-656Z`.

- Command: `node research/access/run-set.mjs --set all --only T004,T010,T012,T013,T014,T027,T030,T031,T042,T043,T045,T046,T050,T064,T068,T069,T078,T081,B003,B009 --save-responses --record .w2l/access/ic-compat/2026-10-27-w1/combined-retry.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8853; access option: `"enhanced"`
- Exit address: 103.142.140.152
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-27T10:12:58.656Z → 2026-10-27T10:35:19.590Z
- Tasks: 20 from `research/access/tasks.v1.json` (set `all`, only T004, T010, T012, T013, T014, T027, T030, T031, T042, T043, T045, T046, T050, T064, T068, T069, T078, T081, B003, B009); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 20, attempted 20, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 20 | 0 | 1 | 29852 | 178927 | unknown | unknown |

- Paid provider calls (cold): 12; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0272 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 0, not_loaded 1, not_extracted 0, not_served 19, unknown 0; region waits: 2 (held on 0)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): other on T042 (provider, steel: a rung met a challenge served with 429 or 503; after a 429 the run keeps its own exit (ADR 0005), and a vendor rung leaves through another); robots_override on T064 (provider, steel)

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 20 (time left at its start: median 299999 ms, least 299999 ms); browser_local on 16 (time left at its start: median 299598 ms, least 30000 ms); installed_chrome on 15 (time left at its start: median 298310 ms, least 283971 ms); provider on 12 (time left at its start: median 287397 ms, least 270175 ms)
- Verified answers by the route that delivered them (cold): none
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 2 (T064: rule /, set aside; T081: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3660 |  | not_served (connection_error) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome → provider | minTables | 136539 | steel: success | not_served (checks_failed, region_absent); region not held in 9869 ms |
| T012 | cold | no | blocked | rate_limit | 429 | browser_local | http → browser_local | markdownCountMin | 3711 |  | not_served (rate_limit) |
| T013 | cold | no | failed | timeout |  | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 166985 | steel: failed/timeout (answer) | not_served (timeout) |
| T014 | cold | no | failed | timeout |  | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 156903 | steel: failed/timeout (answer) | not_served (timeout) |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 1779 |  | not_served (http_error) |
| T030 | cold | no | failed | timeout |  | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 176529 | steel: failed/timeout (answer) | not_served (timeout) |
| T031 | cold | no | failed | timeout |  | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 178927 | steel: failed/timeout (answer) | not_served (timeout) |
| T042 | cold | no | blocked | bot_detected_generic | 429 | browser_local | http → browser_local → installed_chrome; passed over: provider (steel, other) | markdownCountMin, markdownMatches | 15594 |  | not_served (bot_detected_generic) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 29852 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T045 | cold | no | blocked | captcha | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 29099 | steel: blocked/captcha (answer) | not_served (captcha) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 20531 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local → installed_chrome → provider | markdownMatches, markdownMatches | 154409 | steel: failed/timeout | not_served (http_error) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome; passed over: provider (steel, robots_override) | markdownMatches, markdownCountMin | 3138 |  | not_served (login_wall) |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → installed_chrome → provider | markdownMatches, markdownCountMin | 60592 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 49482 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1019 |  | not_served (rate_limit) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 870 |  | not_served (http_error) |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome → provider | markdownCountMin | 150204 | steel: failed/timeout | not_loaded (empty_unverified, little_text); region not held in 9555 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 347 |  | not_served (http_error) |
- Task contract (cold): the product's verification agreed with the runner on 20 of 20 attempts that carry one (0 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
