# Combined grant, window 1, arm combined, 2026-10-25

The runner's own records of this arm's runs in the window, copied whole; the comparison is in `2026-10-25-combined-w1-22bf90e7-summary.md`.

## combined-first-b0 (2026-10-25T04:40:35.273Z → 2026-10-25T04:46:08.101Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-25T04-40-35-345Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T005,T006,T007,T008,T009,T010,T011,T012,T013,T014,T015,T016,T017,T018,T019,T020,T021,T022,T023 --save-responses --record .w2l/access/combined/2026-10-25-w1/combined-first-b0.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `22bf90e7` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8833; access option: `"enhanced"`
- Exit address: 103.142.140.158
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-25T04:40:35.345Z → 2026-10-25T04:46:08.095Z
- Tasks: 23 (set `all`, only T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020, T021, T022, T023); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 19 | 1 | 7931 | 61897 | unknown | unknown |

- Paid provider calls (cold): 3; tasks verified with a paid call's page as the answer: 1; charged by the spend ledger: $0.0051 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 19, not_loaded 0, not_extracted 0, not_served 4, unknown 0; region waits: 15 (held on 13; scrolled on 4, held on 3 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 20 (time left at its start: median 300000 ms, least 299997 ms); browser_local on 17 (time left at its start: median 299168 ms, least 30000 ms); installed_chrome on 13 (time left at its start: median 297052 ms, least 281168 ms); http_compat on 3 (time left at its start: median 299999 ms, least 299999 ms); provider on 3 (time left at its start: median 272130 ms, least 265867 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 9, browser 3, http_compat 3, http 3, vendor 1
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9465 |  | ready (verified); region held in 566 ms |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7931 |  | ready (verified); region held in 542 ms |
| T003 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9552 |  | ready (verified); region held in 589 ms |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 5885 |  | not_served (connection_error) |
| T005 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 11248 |  | ready (verified); region held in 2760 ms, 2 screens scrolled |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7538 |  | ready (verified); region held in 4134 ms |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 1537 |  | ready (verified) |
| T008 | cold | yes | success |  | 200 | http | http |  | 1606 |  | ready (verified) |
| T009 | cold | yes | success |  | 200 | http | http_compat |  | 1194 |  | ready (verified) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome → provider | minTables | 72323 | steel: success | not_served (checks_failed, region_absent); region not held in 9922 ms |
| T011 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 16591 |  | ready (verified); region held in 7193 ms |
| T012 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → installed_chrome → provider | markdownCountMin | 61897 | steel: failed/empty_unverified (answer) | not_served (source_data_error); region not held in 9657 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13315 |  | not_served (geo_restricted) |
| T014 | cold | yes | success |  | 200 | provider | http → browser_local → installed_chrome → provider |  | 35825 | steel: success (answer) | ready (verified); region held in 7951 ms, 2 screens scrolled |
| T015 | cold | yes | success |  | 200 | http | http |  | 1972 |  | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5843 |  | ready (verified); region held in 938 ms |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4517 |  | ready (verified); region held in 736 ms |
| T018 | cold | yes | success |  | 200 | http | http_compat |  | 3718 |  | ready (verified) |
| T019 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 28419 |  | ready (verified); region held in 7546 ms, 6 screens scrolled |
| T020 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9503 |  | ready (verified); region held in 1039 ms |
| T021 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 12289 |  | ready (verified); region held in 866 ms |
| T022 | cold | yes | success |  | 200 | http | http |  | 1880 |  | ready (verified) |
| T023 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7898 |  | ready (verified); region held in 670 ms |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (19 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## combined-first-b1 (2026-10-25T04:49:55.113Z → 2026-10-25T04:54:54.306Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-25T04-49-55-183Z`.

- Command: `node research/access/run-set.mjs --set all --only T024,T025,T026,T027,T029,T030,T031,T033,T034,T035,T036,T037,T038,T039,T040,T041,T042,T043,T044,T045,T046,T047,T048 --save-responses --record .w2l/access/combined/2026-10-25-w1/combined-first-b1.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8833; access option: `"enhanced"`
- Exit address: 103.142.140.158
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-25T04:49:55.183Z → 2026-10-25T04:54:54.293Z
- Tasks: 23 (set `all`, only T024, T025, T026, T027, T029, T030, T031, T033, T034, T035, T036, T037, T038, T039, T040, T041, T042, T043, T044, T045, T046, T047, T048); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 14 | 0 | 6954 | 39225 | unknown | unknown |

- Paid provider calls (cold): 6; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0200 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 14, not_loaded 1, not_extracted 0, not_served 8, unknown 0; region waits: 8 (held on 7; scrolled on 1, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 22 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 13 (time left at its start: median 298909 ms, least 30000 ms); installed_chrome on 10 (time left at its start: median 296481 ms, least 285233 ms); http_compat on 1 (time left at its start: median 299999 ms, least 299999 ms); provider on 6 (time left at its start: median 274506 ms, least 271281 ms)
- Verified answers by the route that delivered them (cold): http 6, installed_chrome 4, browser 3, http_compat 1
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 1 (T041: rule /homes/, set aside); not known on 3 attempts without a robots check

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T024 | cold | yes | success |  | 200 | http | http |  | 2584 |  | ready (verified) |
| T025 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 11737 |  | ready (verified); region held in 3692 ms |
| T026 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 19182 |  | ready (verified); region held in 731 ms |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 2392 |  | not_served (http_error) |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 2229 |  | ready (verified) |
| T030 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 37568 | steel: failed/provider_error | not_loaded (empty_unverified, little_text); region not held in 9991 ms, 1 screen scrolled |
| T031 | cold | no | failed | provider_error |  | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 39225 | steel: failed/provider_error (answer) | not_served (provider_error) |
| T033 | cold | yes | success |  | 200 | http | http |  | 2239 |  | ready (verified) |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5736 |  | ready (verified); region held in 1387 ms |
| T035 | cold | yes | success |  | 200 | http | http |  | 1565 |  | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6954 |  | ready (verified); region held in 1185 ms |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 725 |  | not_served (rate_limit) |
| T038 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10187 |  | ready (verified); region held in 749 ms |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7618 |  | ready (verified); region held in 736 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1182 |  | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 1940 |  | ready (verified) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1343 |  | not_served (rate_limit) |
| T043 | cold | no | failed | http_error | 405 | http | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 16593 | steel: failed/provider_error | not_served (http_error) |
| T044 | cold | yes | success |  | 200 | http | http |  | 2767 |  | ready (verified) |
| T045 | cold | no | blocked | captcha | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 45618 | steel: blocked/captcha (answer) | not_served (captcha) |
| T046 | cold | no | failed | provider_error |  | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 34829 | steel: failed/provider_error (answer) | not_served (provider_error) |
| T047 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10526 |  | ready (verified); region held in 897 ms |
| T048 | cold | no | failed | provider_error |  | provider | http → browser_local → installed_chrome → provider | markdownMatches, markdownMatches | 33573 | steel: failed/provider_error (answer) | not_served (provider_error) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (14 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## combined-first-b2 (2026-10-25T04:56:58.551Z → 2026-10-25T05:01:57.539Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-25T04-56-58-643Z`.

- Command: `node research/access/run-set.mjs --set all --only T049,T050,T051,T052,T053,T055,T056,T057,T058,T059,T060,T061,T062,T063,T064,T065,T066,T067,T068,T069,T070,T071,T072 --save-responses --record .w2l/access/combined/2026-10-25-w1/combined-first-b2.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8833; access option: `"enhanced"`
- Exit address: 103.142.140.158
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-25T04:56:58.643Z → 2026-10-25T05:01:57.534Z
- Tasks: 23 (set `all`, only T049, T050, T051, T052, T053, T055, T056, T057, T058, T059, T060, T061, T062, T063, T064, T065, T066, T067, T068, T069, T070, T071, T072); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 19 | 0 | 7638 | 50444 | unknown | unknown |

- Paid provider calls (cold): 3; tasks verified with a paid call's page as the answer: 1; charged by the spend ledger: $0.0100 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 19, not_loaded 0, not_extracted 0, not_served 4, unknown 0; region waits: 13 (held on 12)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): robots_override on T064 (provider, steel)

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 22 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 17 (time left at its start: median 298978 ms, least 293666 ms); installed_chrome on 11 (time left at its start: median 297280 ms, least 280483 ms); provider on 3 (time left at its start: median 277205 ms, least 276399 ms); http_compat on 1 (time left at its start: median 299999 ms, least 299999 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 7, vendor 1, browser 5, http_compat 1, http 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 4 (T049: rule /, set aside; T059: rule /, set aside; T064: rule /, set aside; T066: rule /, set aside); not known on 1 attempt without a robots check

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T049 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 14086 |  | ready (verified); region held in 761 ms |
| T050 | cold | yes | success |  | 200 | provider | http → browser_local → installed_chrome → provider |  | 32504 | steel: success (answer) | ready (verified); region held in 1737 ms |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7638 |  | ready (verified); region held in 750 ms |
| T052 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10127 |  | ready (verified); region held in 564 ms |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7166 |  | ready (verified); region held in 607 ms |
| T055 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 32636 |  | ready (verified); region held in 6599 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3773 |  | ready (verified); region held in 665 ms |
| T057 | cold | yes | success |  | 200 | http | http_compat |  | 953 |  | ready (verified) |
| T058 | cold | yes | success |  | 200 | http | http |  | 817 |  | ready (verified) |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3074 |  | ready (verified); region held in 673 ms |
| T060 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14282 |  | ready (verified); region not held in 9502 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 2515 |  | ready (verified) |
| T062 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 21753 |  | not_served (timeout) |
| T063 | cold | yes | success |  | 200 | http | http |  | 1079 |  | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome; passed over: provider (steel, robots_override) | markdownMatches, markdownCountMin | 4033 |  | not_served (login_wall) |
| T065 | cold | yes | success |  | 200 | http | http |  | 1887 |  | ready (verified) |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 10685 |  | ready (verified); region held in 1257 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3148 |  | ready (verified); region held in 631 ms |
| T068 | cold | no | failed | provider_error |  | provider | http → browser_local → installed_chrome → provider | markdownMatches, markdownCountMin | 53612 | steel: failed/provider_error (answer) | not_served (provider_error) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 50444 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T070 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8669 |  | ready (verified); region held in 961 ms |
| T071 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9674 |  | ready (verified); region held in 718 ms |
| T072 | cold | yes | success |  | 200 | http | http |  | 3561 |  | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (19 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## combined-first-b3 (2026-10-25T05:10:23.708Z → 2026-10-25T05:12:45.705Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-25T05-10-23-770Z`.

- Command: `node research/access/run-set.mjs --set all --only T073,T074,T075,T076,T077,T078,T079,T080,T081,B001,B002,B003,B004,B005,B006,B007,B008,B009,B010,B011,B012,B013,B014 --save-responses --record .w2l/access/combined/2026-10-25-w1/combined-first-b3.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8833; access option: `"enhanced"`
- Exit address: 103.142.140.58
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-25T05:10:23.770Z → 2026-10-25T05:12:45.699Z
- Tasks: 23 (set `all`, only T073, T074, T075, T076, T077, T078, T079, T080, T081, B001, B002, B003, B004, B005, B006, B007, B008, B009, B010, B011, B012, B013, B014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 19 | 0 | 4297 | 21144 | unknown | unknown |

- Paid provider calls (cold): 1; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0033 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 19, not_loaded 0, not_extracted 0, not_served 4, unknown 0; region waits: 10 (held on 10; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 11 (time left at its start: median 299304 ms, least 298419 ms); installed_chrome on 6 (time left at its start: median 297552 ms, least 286559 ms); provider on 1 (time left at its start: median 285430 ms, least 285430 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 5, http 9, browser 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9492 |  | ready (verified); region held in 1141 ms |
| T074 | cold | yes | success |  | 200 | http | http |  | 819 |  | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5308 |  | ready (verified); region held in 630 ms |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7059 |  | ready (verified); region held in 661 ms |
| T077 | cold | yes | success |  | 200 | http | http |  | 1457 |  | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1700 |  | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 1275 |  | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2360 |  | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1115 |  | not_served (http_error) |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9326 |  | ready (verified); region held in 730 ms |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6994 |  | ready (verified); region held in 885 ms |
| B003 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 34284 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| B004 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8029 |  | ready (verified); region held in 1170 ms |
| B005 | cold | yes | success |  | 200 | http | http |  | 4337 |  | ready (verified) |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5379 |  | ready (verified); region held in 657 ms |
| B007 | cold | yes | success |  | 200 | http | http |  | 4297 |  | ready (verified) |
| B008 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 21144 |  | ready (verified); region held in 2541 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 891 |  | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8223 |  | ready (verified); region held in 2469 ms, 2 screens scrolled |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3709 |  | ready (verified); region held in 571 ms |
| B012 | cold | yes | success |  | 200 | http | http |  | 1068 |  | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 1994 |  | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 939 |  | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (19 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## combined-retry (2026-10-25T05:17:14.768Z → 2026-10-25T05:25:36.469Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-25T05-17-14-854Z`.

- Command: `node research/access/run-set.mjs --set all --only T004,T010,T012,T013,T027,T030,T031,T037,T042,T043,T045,T046,T048,T062,T064,T068,T069,T078,T081,B003,B009 --save-responses --record .w2l/access/combined/2026-10-25-w1/combined-retry.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8833; access option: `"enhanced"`
- Exit address: 103.142.140.58
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-25T05:17:14.854Z → 2026-10-25T05:25:36.458Z
- Tasks: 21 (set `all`, only T004, T010, T012, T013, T027, T030, T031, T037, T042, T043, T045, T046, T048, T062, T064, T068, T069, T078, T081, B003, B009); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 21, attempted 21, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 21 | 3 | 2 | 12291 | 59494 | unknown | unknown |

- Paid provider calls (cold): 10; tasks verified with a paid call's page as the answer: 1; charged by the spend ledger: $0.0282 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 3, not_loaded 2, not_extracted 0, not_served 16, unknown 0; region waits: 7 (held on 3; scrolled on 2, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): robots_override on T064 (provider, steel)

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 21 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 15 (time left at its start: median 299658 ms, least 30000 ms); installed_chrome on 12 (time left at its start: median 298266 ms, least 284153 ms); provider on 10 (time left at its start: median 277089 ms, least 270161 ms)
- Verified answers by the route that delivered them (cold): browser 2, vendor 1
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 2 (T064: rule /, set aside; T081: rule /, set aside); not known on 2 attempts without a robots check

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3712 |  | not_served (connection_error) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome → provider | minTables | 70418 | steel: success | not_served (checks_failed, region_absent); region not held in 9603 ms |
| T012 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 54704 | steel: failed/empty_unverified | not_served (source_data_error); region not held in 9729 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 12291 |  | not_served (geo_restricted) |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 1744 |  | not_served (http_error) |
| T030 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 35955 | steel: failed/provider_error | not_loaded (empty_unverified, little_text); region not held in 9950 ms, 1 screen scrolled |
| T031 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4977 |  | ready (verified); region held in 2433 ms |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 410 |  | not_served (rate_limit) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 515 |  | not_served (rate_limit) |
| T043 | cold | yes | success |  | 200 | provider | http → browser_local → installed_chrome → provider |  | 30175 | steel: success (answer) | ready (verified); region held in 4176 ms |
| T045 | cold | no | blocked | captcha | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 48299 | steel: blocked/captcha (answer) | not_served (captcha) |
| T046 | cold | no | failed | provider_error |  | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 32664 | steel: failed/provider_error (answer) | not_served (provider_error) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → installed_chrome → provider | markdownMatches, markdownMatches | 38803 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5051 |  | ready (verified); region held in 939 ms |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome; passed over: provider (steel, robots_override) | markdownMatches, markdownCountMin | 2844 |  | not_served (login_wall) |
| T068 | cold | no | failed | provider_error |  | provider | http → browser_local → installed_chrome → provider | markdownMatches, markdownCountMin | 52773 | steel: failed/provider_error (answer) | not_served (provider_error) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 59494 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 945 |  | not_served (rate_limit) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 860 |  | not_served (http_error) |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome → provider | markdownCountMin | 43924 | steel: failed/provider_error | not_loaded (empty_unverified, little_text); region not held in 9634 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 286 |  | not_served (http_error) |
- Task contract (cold): the product's verification agreed with the runner on 21 of 21 attempts that carry one (3 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
