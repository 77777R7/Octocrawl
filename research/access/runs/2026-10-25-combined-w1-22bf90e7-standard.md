# Combined grant, window 1, arm standard, 2026-10-25

The runner's own records of this arm's runs in the window, copied whole; the comparison is in `2026-10-25-combined-w1-22bf90e7-summary.md`.

## standard-first-b0 (2026-10-25T04:34:20.449Z → 2026-10-25T04:36:36.602Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-25T04-34-20-538Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T005,T006,T007,T008,T009,T010,T011,T012,T013,T014,T015,T016,T017,T018,T019,T020,T021,T022,T023 --save-responses --record .w2l/access/combined/2026-10-25-w1/standard-first-b0.md --access "standard" --raw-html`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8831; access option: `"standard"`
- Exit address: 103.142.140.158
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-25T04:34:20.538Z → 2026-10-25T04:36:36.593Z
- Tasks: 23 (set `all`, only T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020, T021, T022, T023); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 7 | 2 | 3156 | 15594 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 7, not_loaded 0, not_extracted 1, not_served 15, unknown 0; region waits: 8 (held on 5; scrolled on 2, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299998 ms); browser_local on 18 (time left at its start: median 298782 ms, least 30000 ms)
- Verified answers by the route that delivered them (cold): browser 4, http 3
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 2989 | not_served (cloudflare_challenge) |
| T002 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 2082 | not_served (cloudflare_challenge) |
| T003 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 1983 | not_served (cloudflare_challenge) |
| T004 | cold | no | blocked | geo_restricted | 451 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3838 | not_served (geo_restricted) |
| T005 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3156 | not_served (bot_detected_generic) |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6700 | ready (verified); region held in 3370 ms |
| T007 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1186 | not_served (rate_limit) |
| T008 | cold | yes | success |  | 200 | http | http |  | 8145 | ready (verified) |
| T009 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 13312 | ready (verified); region held in 610 ms |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | minTables | 17897 | not_served (checks_failed, region_absent); region not held in 9555 ms |
| T011 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local |  | 4259 | not_extracted (empty_unverified, region_ready); region held in 586 ms |
| T012 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | markdownCountMin | 13458 | not_served (source_data_error); region not held in 9530 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 12815 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 1714 | not_served (bot_detected_generic) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1977 | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6994 | ready (verified); region held in 1083 ms |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5507 | ready (verified); region held in 734 ms |
| T018 | cold | no | blocked | captcha | 429 | http | http | markdownCountMin, markdownMatches | 2319 | not_served (captcha) |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 15594 | not_served (checks_failed, region_absent); region not held in 9473 ms, 2 screens scrolled |
| T020 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1913 | not_served (cloudflare_challenge) |
| T021 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3116 | not_served (http_error) |
| T022 | cold | yes | success |  | 200 | http | http |  | 2125 | ready (verified) |
| T023 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 2230 | not_served (bot_detected_generic) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (7 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## standard-first-b1 (2026-10-25T04:54:54.308Z → 2026-10-25T04:56:51.672Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-25T04-54-54-392Z`.

- Command: `node research/access/run-set.mjs --set all --only T024,T025,T026,T027,T029,T030,T031,T033,T034,T035,T036,T037,T038,T039,T040,T041,T042,T043,T044,T045,T046,T047,T048 --save-responses --record .w2l/access/combined/2026-10-25-w1/standard-first-b1.md --access "standard" --raw-html`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8831; access option: `"standard"`
- Exit address: 103.142.140.158
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-25T04:54:54.392Z → 2026-10-25T04:56:51.664Z
- Tasks: 23 (set `all`, only T024, T025, T026, T027, T029, T030, T031, T033, T034, T035, T036, T037, T038, T039, T040, T041, T042, T043, T044, T045, T046, T047, T048); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 11 | 0 | 3033 | 14585 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 11, not_loaded 0, not_extracted 0, not_served 12, unknown 0; region waits: 7 (held on 5; scrolled on 2, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 15 (time left at its start: median 298965 ms, least 30000 ms)
- Verified answers by the route that delivered them (cold): http 6, browser 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 1 (T041: rule /homes/, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T024 | cold | yes | success |  | 200 | http | http |  | 1997 | ready (verified) |
| T025 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 4102 | not_served (bot_detected_generic) |
| T026 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 18875 | ready (verified); region held in 760 ms |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 2425 | not_served (http_error) |
| T029 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6744 | ready (verified); region held in 750 ms |
| T030 | cold | no | blocked | login_wall | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13443 | not_served (login_wall); region not held in 9828 ms, 1 screen scrolled |
| T031 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 14585 | not_served (captcha); region not held in 9792 ms |
| T033 | cold | yes | success |  | 200 | http | http |  | 2937 | ready (verified) |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6291 | ready (verified); region held in 790 ms |
| T035 | cold | yes | success |  | 200 | http | http |  | 3033 | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5780 | ready (verified); region held in 1184 ms |
| T037 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 10050 | ready (verified); region held in 2728 ms, 2 screens scrolled |
| T038 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2873 | not_served (bot_detected_generic) |
| T039 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2577 | not_served (captcha) |
| T040 | cold | yes | success |  | 200 | http | http |  | 1177 | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 1481 | ready (verified) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1375 | not_served (rate_limit) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3405 | not_served (bot_detected_generic) |
| T044 | cold | yes | success |  | 200 | http | http |  | 2134 | ready (verified) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3804 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3202 | not_served (captcha) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2019 | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 2151 | not_served (cloudflare_challenge) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (11 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## standard-first-b2 (2026-10-25T05:01:57.539Z → 2026-10-25T05:03:33.845Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-25T05-01-57-607Z`.

- Command: `node research/access/run-set.mjs --set all --only T049,T050,T051,T052,T053,T055,T056,T057,T058,T059,T060,T061,T062,T063,T064,T065,T066,T067,T068,T069,T070,T071,T072 --save-responses --record .w2l/access/combined/2026-10-25-w1/standard-first-b2.md --access "standard" --raw-html`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8831; access option: `"standard"`
- Exit address: 103.142.140.158
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-25T05:01:57.607Z → 2026-10-25T05:03:33.840Z
- Tasks: 23 (set `all`, only T049, T050, T051, T052, T053, T055, T056, T057, T058, T059, T060, T061, T062, T063, T064, T065, T066, T067, T068, T069, T070, T071, T072); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 11 | 0 | 2394 | 15273 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 11, not_loaded 0, not_extracted 0, not_served 12, unknown 0; region waits: 6 (held on 5; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 18 (time left at its start: median 299206 ms, least 297307 ms)
- Verified answers by the route that delivered them (cold): browser 6, http 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 4 (T049: rule /, set aside; T059: rule /, set aside; T064: rule /, set aside; T066: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2394 | not_served (bot_detected_generic) |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 2083 | not_served (http_error) |
| T051 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin | 2213 | not_served (cloudflare_challenge) |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | minTables, markdownMatches | 4906 | not_served (cloudflare_challenge) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches | 2534 | not_served (bot_detected_generic) |
| T055 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 20124 | ready (verified); region held in 8349 ms, 2 screens scrolled |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3731 | ready (verified); region held in 660 ms |
| T057 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 1648 | not_served (http_error) |
| T058 | cold | yes | success |  | 200 | http | http |  | 805 | ready (verified) |
| T059 | cold | no | blocked | captcha | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 1859 | not_served (captcha) |
| T060 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 15273 | ready (verified); region not held in 9987 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 3102 | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6962 | ready (verified); region held in 931 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1215 | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2143 | not_served (login_wall) |
| T065 | cold | yes | success |  | 200 | http | http |  | 1203 | ready (verified) |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6275 | ready (verified); region held in 1838 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4396 | ready (verified); region held in 641 ms |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2286 | not_served (cloudflare_challenge) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1948 | not_served (cloudflare_challenge) |
| T070 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2994 | not_served (bot_detected_generic) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1918 | not_served (cloudflare_challenge) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3500 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (11 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## standard-first-b3 (2026-10-25T05:06:59.840Z → 2026-10-25T05:08:20.607Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-25T05-06-59-935Z`.

- Command: `node research/access/run-set.mjs --set all --only T073,T074,T075,T076,T077,T078,T079,T080,T081,B001,B002,B003,B004,B005,B006,B007,B008,B009,B010,B011,B012,B013,B014 --save-responses --record .w2l/access/combined/2026-10-25-w1/standard-first-b3.md --access "standard" --raw-html`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8831; access option: `"standard"`
- Exit address: 103.142.140.58
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-25T05:06:59.935Z → 2026-10-25T05:08:20.602Z
- Tasks: 23 (set `all`, only T073, T074, T075, T076, T077, T078, T079, T080, T081, B001, B002, B003, B004, B005, B006, B007, B008, B009, B010, B011, B012, B013, B014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 14 | 0 | 2206 | 8691 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 14, not_loaded 0, not_extracted 0, not_served 9, unknown 0; region waits: 6 (held on 5; scrolled on 2, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 11 (time left at its start: median 299218 ms, least 298276 ms)
- Verified answers by the route that delivered them (cold): http 9, browser 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T073 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownMatches, markdownCountMin, markdownMatches | 3923 | not_served (bot_detected_generic) |
| T074 | cold | yes | success |  | 200 | http | http |  | 744 | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5228 | ready (verified); region held in 649 ms |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin | 1894 | not_served (cloudflare_challenge) |
| T077 | cold | yes | success |  | 200 | http | http |  | 1649 | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1803 | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 1281 | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2206 | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1157 | not_served (http_error) |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1888 | not_served (cloudflare_challenge) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7045 | ready (verified); region held in 879 ms |
| B003 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2446 | not_served (bot_detected_generic) |
| B004 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 3841 | not_served (bot_detected_generic) |
| B005 | cold | yes | success |  | 200 | http | http |  | 4775 | ready (verified) |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5282 | ready (verified); region held in 672 ms |
| B007 | cold | yes | success |  | 200 | http | http |  | 3552 | ready (verified) |
| B008 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 13576 | not_served (bot_detected_generic); region not held in 9910 ms, 1 screen scrolled |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 857 | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8691 | ready (verified); region held in 2317 ms, 2 screens scrolled |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3798 | ready (verified); region held in 573 ms |
| B012 | cold | yes | success |  | 200 | http | http |  | 1126 | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 2028 | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 1141 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (14 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## standard-retry (2026-10-25T05:25:36.470Z → 2026-10-25T05:28:30.650Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-25T05-25-36-558Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T005,T007,T010,T011,T012,T013,T014,T018,T019,T020,T021,T023,T025,T027,T030,T031,T038,T039,T042,T043,T045,T046,T047,T048,T049,T050,T051,T052,T053,T057,T059,T064,T068,T069,T070,T071,T073,T076,T078,T081,B001,B003,B004,B008,B009 --save-responses --record .w2l/access/combined/2026-10-25-w1/standard-retry.md --access "standard" --raw-html`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8831; access option: `"standard"`
- Exit address: 103.142.140.58
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-25T05:25:36.558Z → 2026-10-25T05:28:30.641Z
- Tasks: 49 (set `all`, only T001, T002, T003, T004, T005, T007, T010, T011, T012, T013, T014, T018, T019, T020, T021, T023, T025, T027, T030, T031, T038, T039, T042, T043, T045, T046, T047, T048, T049, T050, T051, T052, T053, T057, T059, T064, T068, T069, T070, T071, T073, T076, T078, T081, B001, B003, B004, B008, B009); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 49, attempted 49, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 49 | 5 | 2 | 1523 | 13548 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 5, not_loaded 0, not_extracted 0, not_served 44, unknown 0; region waits: 11 (held on 5; scrolled on 4, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 49 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 42 (time left at its start: median 299702 ms, least 30000 ms)
- Verified answers by the route that delivered them (cold): browser 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T049: rule /, set aside; T059: rule /, set aside; T064: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 1481 | not_served (cloudflare_challenge) |
| T002 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 1509 | not_served (cloudflare_challenge) |
| T003 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 1413 | not_served (cloudflare_challenge) |
| T004 | cold | no | blocked | geo_restricted | 451 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2055 | not_served (geo_restricted) |
| T005 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1934 | not_served (bot_detected_generic) |
| T007 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 490 | not_served (rate_limit) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | minTables | 15778 | not_served (checks_failed, region_absent); region not held in 9947 ms |
| T011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6283 | ready (verified); region held in 2218 ms |
| T012 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | markdownCountMin | 12640 | not_served (source_data_error); region not held in 9550 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 11967 | not_served (geo_restricted) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 1178 | not_served (bot_detected_generic) |
| T018 | cold | no | blocked | captcha | 429 | http | http | markdownCountMin, markdownMatches | 872 | not_served (captcha) |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 13548 | not_served (checks_failed, region_absent); region not held in 9539 ms, 2 screens scrolled |
| T020 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7923 | ready (verified); region held in 957 ms |
| T021 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1462 | not_served (http_error) |
| T023 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 1665 | not_served (bot_detected_generic) |
| T025 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 4311 | not_served (bot_detected_generic) |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 1756 | not_served (http_error) |
| T030 | cold | no | blocked | login_wall | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 12546 | not_served (login_wall); region not held in 9855 ms, 1 screen scrolled |
| T031 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13620 | not_served (captcha); region not held in 9812 ms |
| T038 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1988 | not_served (bot_detected_generic) |
| T039 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2275 | not_served (captcha) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 534 | not_served (rate_limit) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1478 | not_served (bot_detected_generic) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2382 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1425 | not_served (captcha) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1348 | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 1523 | not_served (cloudflare_challenge) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1346 | not_served (bot_detected_generic) |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 1179 | not_served (http_error) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4612 | ready (verified); region held in 745 ms |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | minTables, markdownMatches | 2709 | not_served (cloudflare_challenge) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches | 1360 | not_served (bot_detected_generic) |
| T057 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3049 | ready (verified); region held in 684 ms |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2309 | ready (verified); region held in 656 ms |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 1374 | not_served (login_wall) |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 1479 | not_served (bot_detected_generic) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1203 | not_served (cloudflare_challenge) |
| T070 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1797 | not_served (bot_detected_generic) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1413 | not_served (cloudflare_challenge) |
| T073 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin, markdownMatches | 1394 | not_served (bot_detected_generic) |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin | 1390 | not_served (cloudflare_challenge) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 829 | not_served (rate_limit) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 920 | not_served (http_error) |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1401 | not_served (cloudflare_challenge) |
| B003 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1539 | not_served (bot_detected_generic) |
| B004 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 1597 | not_served (bot_detected_generic) |
| B008 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 12642 | not_served (bot_detected_generic); region not held in 9819 ms, 1 screen scrolled |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 349 | not_served (http_error) |
- Task contract (cold): the product's verification agreed with the runner on 49 of 49 attempts that carry one (5 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
