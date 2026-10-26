# Combined grant, window 2, arm standard, 2026-10-26

The runner's own records of this arm's runs in the window, copied whole; the comparison is in `2026-10-26-combined-w2-22bf90e7-summary.md`.

## standard-first-b0 (2026-10-26T00:06:17.688Z → 2026-10-26T00:08:39.126Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-26T00-06-17-779Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T005,T006,T007,T008,T009,T010,T011,T012,T013,T014,T015,T016,T017,T018,T019,T020,T021,T022,T023 --save-responses --record .w2l/access/combined/2026-10-26-w2/standard-first-b0.md --access "standard" --raw-html`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8831; access option: `"standard"`
- Exit address: 103.142.140.137
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-26T00:06:17.779Z → 2026-10-26T00:08:39.119Z
- Tasks: 23 (set `all`, only T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020, T021, T022, T023); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 10 | 0 | 2645 | 16643 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 10, not_loaded 1, not_extracted 0, not_served 12, unknown 0; region waits: 9 (held on 6; scrolled on 2, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299998 ms); browser_local on 18 (time left at its start: median 298721 ms, least 30000 ms)
- Verified answers by the route that delivered them (cold): browser 7, http 3
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 2631 | not_served (cloudflare_challenge) |
| T002 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 1903 | not_served (cloudflare_challenge) |
| T003 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 1936 | not_served (cloudflare_challenge) |
| T004 | cold | no | blocked | geo_restricted | 451 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3390 | not_served (geo_restricted) |
| T005 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2456 | not_served (bot_detected_generic) |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7468 | ready (verified); region held in 3901 ms |
| T007 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 655 | not_served (rate_limit) |
| T008 | cold | yes | success |  | 200 | http | http |  | 1797 | ready (verified) |
| T009 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 13975 | ready (verified); region held in 617 ms |
| T010 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | minTables | 18393 | not_loaded (empty_unverified, little_text); region not held in 9565 ms |
| T011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4603 | ready (verified); region held in 616 ms |
| T012 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | markdownCountMin | 13432 | not_served (source_data_error); region not held in 9498 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13437 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 1752 | not_served (bot_detected_generic) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1834 | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 9033 | ready (verified); region held in 1010 ms |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8324 | ready (verified); region held in 762 ms |
| T018 | cold | no | blocked | captcha | 429 | http | http | markdownCountMin, markdownMatches | 1868 | not_served (captcha) |
| T019 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 16643 | ready (verified); region not held in 9821 ms, 9 screens scrolled |
| T020 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7436 | ready (verified); region held in 946 ms |
| T021 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2645 | not_served (http_error) |
| T022 | cold | yes | success |  | 200 | http | http |  | 2023 | ready (verified) |
| T023 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 2462 | not_served (bot_detected_generic) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (10 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## standard-first-b1 (2026-10-26T00:30:28.042Z → 2026-10-26T00:32:09.602Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-26T00-30-28-143Z`.

- Command: `node research/access/run-set.mjs --set all --only T024,T025,T026,T027,T029,T030,T031,T033,T034,T035,T036,T037,T038,T039,T040,T041,T042,T043,T044,T045,T046,T047,T048 --save-responses --record .w2l/access/combined/2026-10-26-w2/standard-first-b1.md --access "standard" --raw-html`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8831; access option: `"standard"`
- Exit address: 103.142.140.137
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-26T00:30:28.143Z → 2026-10-26T00:32:09.595Z
- Tasks: 23 (set `all`, only T024, T025, T026, T027, T029, T030, T031, T033, T034, T035, T036, T037, T038, T039, T040, T041, T042, T043, T044, T045, T046, T047, T048); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 9 | 0 | 2703 | 14513 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 9, not_loaded 0, not_extracted 0, not_served 14, unknown 0; region waits: 5 (held on 3; scrolled on 1, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 14 (time left at its start: median 298887 ms, least 30000 ms)
- Verified answers by the route that delivered them (cold): http 6, browser 3
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 1 (T041: rule /homes/, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T024 | cold | yes | success |  | 200 | http | http |  | 1960 | ready (verified) |
| T025 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 4459 | not_served (bot_detected_generic) |
| T026 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 18810 | ready (verified); region held in 748 ms |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 2498 | not_served (http_error) |
| T029 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6008 | ready (verified); region held in 739 ms |
| T030 | cold | no | blocked | login_wall | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13341 | not_served (login_wall); region not held in 9844 ms, 1 screen scrolled |
| T031 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 14513 | not_served (captcha); region not held in 9804 ms |
| T033 | cold | yes | success |  | 200 | http | http |  | 1704 | ready (verified) |
| T034 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1371 | not_served (captcha) |
| T035 | cold | yes | success |  | 200 | http | http |  | 1966 | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5895 | ready (verified); region held in 658 ms |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 715 | not_served (rate_limit) |
| T038 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2904 | not_served (captcha) |
| T039 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3231 | not_served (captcha) |
| T040 | cold | yes | success |  | 200 | http | http |  | 1181 | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 1776 | ready (verified) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1414 | not_served (rate_limit) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3454 | not_served (bot_detected_generic) |
| T044 | cold | yes | success |  | 200 | http | http |  | 2950 | ready (verified) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3654 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2703 | not_served (captcha) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1975 | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 2170 | not_served (cloudflare_challenge) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (9 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## standard-first-b2 (2026-10-26T00:36:42.944Z → 2026-10-26T00:38:16.217Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-26T00-36-43-019Z`.

- Command: `node research/access/run-set.mjs --set all --only T049,T050,T051,T052,T053,T055,T056,T057,T058,T059,T060,T061,T062,T063,T064,T065,T066,T067,T068,T069,T070,T071,T072 --save-responses --record .w2l/access/combined/2026-10-26-w2/standard-first-b2.md --access "standard" --raw-html`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8831; access option: `"standard"`
- Exit address: 103.142.140.137
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-26T00:36:43.019Z → 2026-10-26T00:38:16.211Z
- Tasks: 23 (set `all`, only T049, T050, T051, T052, T053, T055, T056, T057, T058, T059, T060, T061, T062, T063, T064, T065, T066, T067, T068, T069, T070, T071, T072); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 11 | 0 | 2384 | 14795 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 11, not_loaded 0, not_extracted 0, not_served 12, unknown 0; region waits: 6 (held on 5)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 18 (time left at its start: median 299283 ms, least 296472 ms)
- Verified answers by the route that delivered them (cold): browser 6, http 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 4 (T049: rule /, set aside; T059: rule /, set aside; T064: rule /, set aside; T066: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2384 | not_served (bot_detected_generic) |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 2059 | not_served (http_error) |
| T051 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin | 2217 | not_served (cloudflare_challenge) |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | minTables, markdownMatches | 4744 | not_served (cloudflare_challenge) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches | 2912 | not_served (bot_detected_generic) |
| T055 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 15411 | ready (verified); region held in 7564 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3955 | ready (verified); region held in 718 ms |
| T057 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3718 | ready (verified); region held in 694 ms |
| T058 | cold | yes | success |  | 200 | http | http |  | 855 | ready (verified) |
| T059 | cold | no | blocked | captcha | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2050 | not_served (captcha) |
| T060 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14795 | ready (verified); region not held in 9991 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 3048 | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6079 | ready (verified); region held in 933 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1219 | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2251 | not_served (login_wall) |
| T065 | cold | yes | success |  | 200 | http | http |  | 1250 | ready (verified) |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8949 | ready (verified); region held in 1255 ms |
| T067 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2087 | not_served (cloudflare_challenge) |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2300 | not_served (cloudflare_challenge) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1942 | not_served (cloudflare_challenge) |
| T070 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2689 | not_served (bot_detected_generic) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1816 | not_served (cloudflare_challenge) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3757 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (11 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## standard-first-b3 (2026-10-26T00:41:44.298Z → 2026-10-26T00:43:14.063Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-26T00-41-44-389Z`.

- Command: `node research/access/run-set.mjs --set all --only T073,T074,T075,T076,T077,T078,T079,T080,T081,B001,B002,B003,B004,B005,B006,B007,B008,B009,B010,B011,B012,B013,B014 --save-responses --record .w2l/access/combined/2026-10-26-w2/standard-first-b3.md --access "standard" --raw-html`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8831; access option: `"standard"`
- Exit address: 103.142.140.137
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-26T00:41:44.389Z → 2026-10-26T00:43:14.057Z
- Tasks: 23 (set `all`, only T073, T074, T075, T076, T077, T078, T079, T080, T081, B001, B002, B003, B004, B005, B006, B007, B008, B009, B010, B011, B012, B013, B014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 14 | 0 | 2508 | 12826 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 14, not_loaded 0, not_extracted 0, not_served 9, unknown 0; region waits: 7 (held on 5; scrolled on 2, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 12 (time left at its start: median 299120 ms, least 298448 ms)
- Verified answers by the route that delivered them (cold): http 9, browser 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T073 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownMatches, markdownCountMin, markdownMatches | 3939 | not_served (bot_detected_generic) |
| T074 | cold | yes | success |  | 200 | http | http |  | 747 | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5062 | ready (verified); region held in 628 ms |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin | 1988 | not_served (cloudflare_challenge) |
| T077 | cold | yes | success |  | 200 | http | http |  | 1361 | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | browser_local | http → browser_local | markdownMatches, markdownMatches | 3274 | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 1185 | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2241 | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1271 | not_served (http_error) |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2014 | not_served (cloudflare_challenge) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7255 | ready (verified); region held in 880 ms |
| B003 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2508 | not_served (bot_detected_generic) |
| B004 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 12826 | not_served (bot_detected_generic); region not held in 9581 ms |
| B005 | cold | yes | success |  | 200 | http | http |  | 3725 | ready (verified) |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4410 | ready (verified); region held in 662 ms |
| B007 | cold | yes | success |  | 200 | http | http |  | 4412 | ready (verified) |
| B008 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 13545 | not_served (bot_detected_generic); region not held in 9785 ms, 1 screen scrolled |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 761 | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7917 | ready (verified); region held in 1829 ms, 1 screen scrolled |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3847 | ready (verified); region held in 582 ms |
| B012 | cold | yes | success |  | 200 | http | http |  | 1231 | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 2242 | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 1130 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (14 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## standard-retry (2026-10-26T01:00:47.633Z → 2026-10-26T01:03:25.105Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-26T01-00-47-713Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T005,T007,T010,T012,T013,T014,T018,T021,T023,T025,T027,T030,T031,T034,T037,T038,T039,T042,T043,T045,T046,T047,T048,T049,T050,T051,T052,T053,T059,T064,T067,T068,T069,T070,T071,T073,T076,T078,T081,B001,B003,B004,B008,B009 --save-responses --record .w2l/access/combined/2026-10-26-w2/standard-retry.md --access "standard" --raw-html`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8831; access option: `"standard"`
- Exit address: 103.142.140.156
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-26T01:00:47.713Z → 2026-10-26T01:03:25.094Z
- Tasks: 48 (set `all`, only T001, T002, T003, T004, T005, T007, T010, T012, T013, T014, T018, T021, T023, T025, T027, T030, T031, T034, T037, T038, T039, T042, T043, T045, T046, T047, T048, T049, T050, T051, T052, T053, T059, T064, T067, T068, T069, T070, T071, T073, T076, T078, T081, B001, B003, B004, B008, B009); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 48, attempted 48, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 48 | 2 | 0 | 1471 | 13241 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 2, not_loaded 1, not_extracted 0, not_served 45, unknown 0; region waits: 8 (held on 2; scrolled on 3, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 48 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 40 (time left at its start: median 299698 ms, least 30000 ms)
- Verified answers by the route that delivered them (cold): browser 2
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T049: rule /, set aside; T059: rule /, set aside; T064: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 1448 | not_served (cloudflare_challenge) |
| T002 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 1408 | not_served (cloudflare_challenge) |
| T003 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 1387 | not_served (cloudflare_challenge) |
| T004 | cold | no | blocked | geo_restricted | 451 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2036 | not_served (geo_restricted) |
| T005 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1341 | not_served (bot_detected_generic) |
| T007 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 280 | not_served (rate_limit) |
| T010 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | minTables | 15584 | not_loaded (empty_unverified, little_text); region not held in 9786 ms |
| T012 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13241 | not_served (captcha); region not held in 9640 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 12176 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 1150 | not_served (bot_detected_generic) |
| T018 | cold | no | blocked | captcha | 429 | http | http | markdownCountMin, markdownMatches | 761 | not_served (captcha) |
| T021 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1515 | not_served (http_error) |
| T023 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 1346 | not_served (bot_detected_generic) |
| T025 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13128 | not_served (bot_detected_generic); region not held in 9707 ms |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 1762 | not_served (http_error) |
| T030 | cold | no | blocked | login_wall | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 12230 | not_served (login_wall); region not held in 9839 ms, 1 screen scrolled |
| T031 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13467 | not_served (captcha); region not held in 9783 ms |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5653 | ready (verified); region held in 801 ms |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 342 | not_served (rate_limit) |
| T038 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1765 | not_served (bot_detected_generic) |
| T039 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2193 | not_served (captcha) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 503 | not_served (rate_limit) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1519 | not_served (bot_detected_generic) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2653 | not_served (captcha) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1375 | not_served (bot_detected_generic) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1344 | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 1174 | not_served (cloudflare_challenge) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1483 | not_served (bot_detected_generic) |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 1125 | not_served (http_error) |
| T051 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin | 1461 | not_served (cloudflare_challenge) |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | minTables, markdownMatches | 2710 | not_served (cloudflare_challenge) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches | 1383 | not_served (bot_detected_generic) |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2432 | ready (verified); region held in 659 ms |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 1405 | not_served (login_wall) |
| T067 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 1665 | not_served (cloudflare_challenge) |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 1405 | not_served (cloudflare_challenge) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1354 | not_served (cloudflare_challenge) |
| T070 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2892 | not_served (bot_detected_generic) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1496 | not_served (cloudflare_challenge) |
| T073 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownMatches, markdownCountMin, markdownMatches | 2717 | not_served (bot_detected_generic) |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin | 1312 | not_served (cloudflare_challenge) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 889 | not_served (rate_limit) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 852 | not_served (http_error) |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1375 | not_served (cloudflare_challenge) |
| B003 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1692 | not_served (bot_detected_generic) |
| B004 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 1471 | not_served (bot_detected_generic) |
| B008 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 12485 | not_served (bot_detected_generic); region not held in 9794 ms, 1 screen scrolled |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 254 | not_served (http_error) |
- Task contract (cold): the product's verification agreed with the runner on 48 of 48 attempts that carry one (2 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
