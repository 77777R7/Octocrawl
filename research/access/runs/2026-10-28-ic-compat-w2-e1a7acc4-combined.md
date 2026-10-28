# installed_chrome with compatible_transport and no Steel, window 2, arm combined, 2026-10-28

The runner's own records of this arm's runs in the window, copied whole; the comparison is in `2026-10-28-ic-compat-w2-e1a7acc4-summary.md`.

## combined-first-b0 (2026-10-28T00:06:01.507Z → 2026-10-28T00:12:15.085Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-28T00-06-01-578Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T005,T006,T007,T008,T009,T010,T011,T012,T013,T014,T015,T016,T017,T018,T019,T020,T021,T022,T023 --save-responses --record .w2l/access/ic-compat/2026-10-28-w2/combined-first-b0.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8852; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-28T00:06:01.578Z → 2026-10-28T00:12:15.079Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020, T021, T022, T023); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 16 | 2 | 8158 | 68708 | unknown | unknown |

- Paid provider calls (cold): 5; tasks verified with a paid call's page as the answer: 1; charged by the spend ledger: $0.0044 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 16, not_loaded 0, not_extracted 1, not_served 6, unknown 0; region waits: 15 (held on 12; scrolled on 4, held on 3 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 20 (time left at its start: median 300000 ms, least 299996 ms); browser_local on 17 (time left at its start: median 299231 ms, least 30000 ms); installed_chrome on 13 (time left at its start: median 297555 ms, least 281716 ms); provider on 5 (time left at its start: median 285338 ms, least 267188 ms); http_compat on 3 (time left at its start: median 299999 ms, least 299999 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 6, browser 4, http_compat 3, vendor 1, http 2
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | captcha | 403 | provider | http → browser_local → installed_chrome → provider | markdownMatches, markdownMatches | 27465 | steel: blocked/captcha (answer) | not_served (captcha) |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8158 |  | ready (verified); region held in 550 ms |
| T003 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9059 |  | ready (verified); region held in 591 ms |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 4627 |  | not_served (connection_error) |
| T005 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10088 |  | ready (verified); region held in 2762 ms, 2 screens scrolled |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6068 |  | ready (verified); region held in 2788 ms |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 1342 |  | ready (verified) |
| T008 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 513 |  | not_served (rate_limit) |
| T009 | cold | yes | success |  | 200 | http | http_compat |  | 1062 |  | ready (verified) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome → provider | minTables | 68708 | steel: success | not_served (checks_failed, region_absent); region not held in 9491 ms |
| T011 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome | markdownCountMin | 25545 |  | not_served (checks_failed, region_absent); region not held in 9640 ms |
| T012 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → installed_chrome → provider | markdownCountMin | 59404 | steel: failed/empty_unverified (answer) | not_served (source_data_error); region not held in 9622 ms, 1 screen scrolled |
| T013 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → installed_chrome → provider |  | 70349 | steel: failed/empty_unverified (answer) | not_extracted (empty_unverified, region_ready); region held in 1793 ms |
| T014 | cold | yes | success |  | 200 | provider | http → browser_local → installed_chrome → provider |  | 25229 | steel: success (answer) | ready (verified); region held in 5288 ms, 1 screen scrolled |
| T015 | cold | yes | success |  | 200 | http | http |  | 1803 |  | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5646 |  | ready (verified); region held in 991 ms |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4724 |  | ready (verified); region held in 748 ms |
| T018 | cold | yes | success |  | 200 | http | http_compat |  | 3978 |  | ready (verified) |
| T019 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 13965 |  | ready (verified); region held in 9143 ms, 2 screens scrolled |
| T020 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9321 |  | ready (verified); region held in 934 ms |
| T021 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8521 |  | ready (verified); region held in 790 ms |
| T022 | cold | yes | success |  | 200 | http | http |  | 1719 |  | ready (verified) |
| T023 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 5435 |  | ready (verified); region held in 843 ms |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (16 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## combined-first-b1 (2026-10-28T00:15:41.147Z → 2026-10-28T00:20:50.128Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-28T00-15-41-219Z`.

- Command: `node research/access/run-set.mjs --set all --only T024,T025,T026,T027,T029,T030,T031,T033,T034,T035,T036,T037,T038,T039,T040,T041,T042,T043,T044,T045,T046,T047,T048 --save-responses --record .w2l/access/ic-compat/2026-10-28-w2/combined-first-b1.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8852; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-28T00:15:41.219Z → 2026-10-28T00:20:50.123Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T024, T025, T026, T027, T029, T030, T031, T033, T034, T035, T036, T037, T038, T039, T040, T041, T042, T043, T044, T045, T046, T047, T048); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 16 | 0 | 9262 | 46119 | unknown | unknown |

- Paid provider calls (cold): 6; tasks verified with a paid call's page as the answer: 2; charged by the spend ledger: $0.0031 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 16, not_loaded 0, not_extracted 0, not_served 7, unknown 0; region waits: 10 (held on 10)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): other on T037 (provider, steel: a rung met a challenge served with 429 or 503; after a 429 the run keeps its own exit (ADR 0005), and a vendor rung leaves through another), T042 (provider, steel: a rung met a challenge served with 429 or 503; after a 429 the run keeps its own exit (ADR 0005), and a vendor rung leaves through another)

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 22 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 16 (time left at its start: median 299084 ms, least 297682 ms); installed_chrome on 13 (time left at its start: median 296792 ms, least 286499 ms); http_compat on 1 (time left at its start: median 299999 ms, least 299999 ms); provider on 6 (time left at its start: median 294226 ms, least 273587 ms)
- Verified answers by the route that delivered them (cold): http 5, installed_chrome 5, browser 3, http_compat 1, vendor 2
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 1 (T041: rule /homes/, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T024 | cold | yes | success |  | 200 | http | http |  | 1827 |  | ready (verified) |
| T025 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10565 |  | ready (verified); region held in 3717 ms |
| T026 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 9419 |  | ready (verified); region held in 730 ms |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 2405 |  | not_served (http_error) |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 2433 |  | ready (verified) |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → installed_chrome → provider |  | 46119 | steel: success (answer) | ready (verified); region held in 1589 ms |
| T031 | cold | yes | success |  | 200 | provider | http → browser_local → installed_chrome → provider |  | 46346 | steel: success (answer) | ready (verified); region held in 1782 ms |
| T033 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 19241 |  | ready (verified); region held in 661 ms |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5524 |  | ready (verified); region held in 1370 ms |
| T035 | cold | yes | success |  | 200 | http | http |  | 1440 |  | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6106 |  | ready (verified); region held in 649 ms |
| T037 | cold | no | blocked | captcha | 429 | browser_local | http → browser_local → installed_chrome; passed over: provider (steel, other) | markdownCountMin, markdownMatches | 5660 |  | not_served (captcha) |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 21532 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 6191 |  | ready (verified); region held in 746 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1149 |  | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 1689 |  | ready (verified) |
| T042 | cold | no | blocked | bot_detected_generic | 429 | browser_local | http → browser_local → installed_chrome; passed over: provider (steel, other) | markdownCountMin, markdownMatches | 18255 |  | not_served (bot_detected_generic) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 30436 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T044 | cold | yes | success |  | 200 | http | http |  | 2693 |  | ready (verified) |
| T045 | cold | no | blocked | captcha | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 32788 | steel: blocked/captcha (answer) | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 17390 | steel: blocked/captcha (answer) | not_served (captcha) |
| T047 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9712 |  | ready (verified); region held in 786 ms |
| T048 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9262 |  | ready (verified); region held in 725 ms |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (16 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## combined-first-b2 (2026-10-28T00:31:29.542Z → 2026-10-28T00:36:24.547Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-28T00-31-29-612Z`.

- Command: `node research/access/run-set.mjs --set all --only T049,T050,T051,T052,T053,T055,T056,T057,T058,T059,T060,T061,T062,T063,T064,T065,T066,T067,T068,T069,T070,T071,T072 --save-responses --record .w2l/access/ic-compat/2026-10-28-w2/combined-first-b2.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8852; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-28T00:31:29.612Z → 2026-10-28T00:36:24.540Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T049, T050, T051, T052, T053, T055, T056, T057, T058, T059, T060, T061, T062, T063, T064, T065, T066, T067, T068, T069, T070, T071, T072); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 18 | 0 | 5881 | 46418 | unknown | unknown |

- Paid provider calls (cold): 4; tasks verified with a paid call's page as the answer: 1; charged by the spend ledger: $0.0059 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 18, not_loaded 0, not_extracted 0, not_served 5, unknown 0; region waits: 12 (held on 11)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): robots_override on T059 (provider, steel), T064 (provider, steel)

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 22 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 17 (time left at its start: median 299232 ms, least 297219 ms); installed_chrome on 10 (time left at its start: median 298034 ms, least 297345 ms); provider on 4 (time left at its start: median 287256 ms, least 286972 ms); http_compat on 1 (time left at its start: median 300000 ms, least 300000 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 4, vendor 1, browser 7, http_compat 1, http 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 4 (T049: rule /, set aside; T059: rule /, set aside; T064: rule /, set aside; T066: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T049 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 12301 |  | ready (verified); region held in 786 ms |
| T050 | cold | yes | success |  | 200 | provider | http → browser_local → installed_chrome → provider |  | 52879 | steel: success (answer) | ready (verified); region held in 1390 ms |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4899 |  | ready (verified); region held in 720 ms |
| T052 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5081 |  | ready (verified); region held in 575 ms |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 6747 |  | ready (verified); region held in 601 ms |
| T055 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14000 |  | ready (verified); region held in 2575 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3498 |  | ready (verified); region held in 711 ms |
| T057 | cold | yes | success |  | 200 | http | http_compat |  | 916 |  | ready (verified) |
| T058 | cold | yes | success |  | 200 | http | http |  | 890 |  | ready (verified) |
| T059 | cold | no | blocked | captcha | 401 | browser_local | http → browser_local → installed_chrome; passed over: provider (steel, robots_override) | markdownMatches, markdownCountMin | 3519 |  | not_served (captcha) |
| T060 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14039 |  | ready (verified); region not held in 9498 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 2365 |  | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6449 |  | ready (verified); region held in 917 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1054 |  | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome; passed over: provider (steel, robots_override) | markdownMatches, markdownCountMin | 3576 |  | not_served (login_wall) |
| T065 | cold | yes | success |  | 200 | http | http |  | 1391 |  | ready (verified) |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6850 |  | ready (verified); region held in 680 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 5881 |  | ready (verified); region held in 621 ms |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → installed_chrome → provider | markdownMatches, markdownCountMin | 45307 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 46418 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T070 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8938 |  | ready (verified); region held in 789 ms |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 43526 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3687 |  | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (18 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## combined-first-b3 (2026-10-28T00:38:23.881Z → 2026-10-28T00:40:30.817Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-28T00-38-23-948Z`.

- Command: `node research/access/run-set.mjs --set all --only T073,T074,T075,T076,T077,T078,T079,T080,T081,B001,B002,B003,B004,B005,B006,B007,B008,B009,B010,B011,B012,B013,B014 --save-responses --record .w2l/access/ic-compat/2026-10-28-w2/combined-first-b3.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8852; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-28T00:38:23.948Z → 2026-10-28T00:40:30.812Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T073, T074, T075, T076, T077, T078, T079, T080, T081, B001, B002, B003, B004, B005, B006, B007, B008, B009, B010, B011, B012, B013, B014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 19 | 0 | 4105 | 20224 | unknown | unknown |

- Paid provider calls (cold): 1; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0033 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 19, not_loaded 1, not_extracted 0, not_served 3, unknown 0; region waits: 11 (held on 10; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 11 (time left at its start: median 299266 ms, least 298437 ms); installed_chrome on 6 (time left at its start: median 297746 ms, least 286717 ms); provider on 1 (time left at its start: median 285994 ms, least 285994 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 5, http 9, browser 5
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9060 |  | ready (verified); region held in 614 ms |
| T074 | cold | yes | success |  | 200 | http | http |  | 2482 |  | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4904 |  | ready (verified); region held in 628 ms |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7115 |  | ready (verified); region held in 672 ms |
| T077 | cold | yes | success |  | 200 | http | http |  | 970 |  | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1504 |  | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 1394 |  | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2645 |  | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1151 |  | not_served (http_error) |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 5480 |  | ready (verified); region held in 730 ms |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5930 |  | ready (verified); region held in 859 ms |
| B003 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → installed_chrome → provider | markdownCountMin | 24534 | steel: failed/provider_error | not_loaded (empty_unverified, little_text); region not held in 9541 ms |
| B004 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7962 |  | ready (verified); region held in 2033 ms |
| B005 | cold | yes | success |  | 200 | http | http |  | 4105 |  | ready (verified) |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4519 |  | ready (verified); region held in 686 ms |
| B007 | cold | yes | success |  | 200 | http | http |  | 5627 |  | ready (verified) |
| B008 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 20224 |  | ready (verified); region held in 3349 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 714 |  | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7298 |  | ready (verified); region held in 2375 ms, 2 screens scrolled |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3461 |  | ready (verified); region held in 573 ms |
| B012 | cold | yes | success |  | 200 | http | http |  | 1104 |  | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 1919 |  | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 2057 |  | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (19 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## combined-retry (2026-10-28T00:42:25.839Z → 2026-10-28T00:51:09.846Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-28T00-42-25-914Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T004,T008,T010,T011,T012,T013,T027,T037,T038,T042,T043,T045,T046,T059,T064,T068,T069,T071,T078,T081,B003,B009 --save-responses --record .w2l/access/ic-compat/2026-10-28-w2/combined-retry.md --access "enhanced" --raw-html --grant /Users/howard07/Code/w2l/.w2l/access/combined-grant.json`
- Source commit: `e1a7acc4`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8852; access option: `"enhanced"`
- Exit address: 103.142.140.60
- Grant: SHA-256 `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; capabilities: installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-28T00:42:25.914Z → 2026-10-28T00:51:09.834Z
- Tasks: 23 from `research/access/tasks.v1.json` (set `all`, only T001, T004, T008, T010, T011, T012, T013, T027, T037, T038, T042, T043, T045, T046, T059, T064, T068, T069, T071, T078, T081, B003, B009); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 3 | 2 | 14086 | 76825 | unknown | unknown |

- Paid provider calls (cold): 10; tasks verified with a paid call's page as the answer: 1; charged by the spend ledger: $0.0157 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 3, not_loaded 2, not_extracted 0, not_served 18, unknown 0; region waits: 6 (held on 3; scrolled on 1, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): other on T037 (provider, steel: a rung met a challenge served with 429 or 503; after a 429 the run keeps its own exit (ADR 0005), and a vendor rung leaves through another), T042 (provider, steel: a rung met a challenge served with 429 or 503; after a 429 the run keeps its own exit (ADR 0005), and a vendor rung leaves through another); robots_override on T059 (provider, steel), T064 (provider, steel)

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 23 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 18 (time left at its start: median 299684 ms, least 30000 ms); installed_chrome on 18 (time left at its start: median 298211 ms, least 283622 ms); provider on 10 (time left at its start: median 287713 ms, least 269917 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 2, vendor 1
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 3 (T059: rule /, set aside; T064: rule /, set aside; T081: rule /, set aside); not known on 1 attempt without a robots check

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7846 |  | ready (verified); region held in 564 ms |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 3387 |  | not_served (connection_error) |
| T008 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 265 |  | not_served (rate_limit) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome → provider | minTables | 75797 | steel: success | not_served (checks_failed, region_absent); region not held in 9879 ms |
| T011 | cold | no | failed | empty_unverified | 200 | http | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 14819 |  | not_loaded (empty_unverified, not_rendered) |
| T012 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 77460 | steel: failed/empty_unverified | not_served (source_data_error); region not held in 9716 ms, 1 screen scrolled |
| T013 | cold | yes | success |  | 200 | provider | http → browser_local → installed_chrome → provider |  | 57031 | steel: success (answer) | ready (verified); region held in 1802 ms |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 1689 |  | not_served (http_error) |
| T037 | cold | no | blocked | captcha | 429 | browser_local | http → browser_local → installed_chrome; passed over: provider (steel, other) | markdownCountMin, markdownMatches | 4754 |  | not_served (captcha) |
| T038 | cold | no | failed | provider_error |  | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 14086 | steel: failed/provider_error (answer) | not_served (provider_error) |
| T042 | cold | no | blocked | bot_detected_generic | 429 | browser_local | http → browser_local → installed_chrome; passed over: provider (steel, other) | markdownCountMin, markdownMatches | 16032 |  | not_served (bot_detected_generic) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 24077 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T045 | cold | no | blocked | captcha | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 24970 | steel: blocked/captcha (answer) | not_served (captcha) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 44542 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T059 | cold | no | blocked | captcha | 401 | browser_local | http → browser_local → installed_chrome; passed over: provider (steel, robots_override) | markdownMatches, markdownCountMin | 3149 |  | not_served (captcha) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local → installed_chrome; passed over: provider (steel, robots_override) | markdownMatches, markdownCountMin | 2845 |  | not_served (login_wall) |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → installed_chrome → provider | markdownMatches, markdownCountMin | 32649 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → installed_chrome → provider | markdownCountMin, markdownMatches | 29086 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T071 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9418 |  | ready (verified); region held in 731 ms |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1256 |  | not_served (rate_limit) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 924 |  | not_served (http_error) |
| B003 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → installed_chrome → provider | markdownCountMin | 76825 | steel: failed/empty_unverified (answer) | not_loaded (empty_unverified, little_text); region not held in 9283 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 270 |  | not_served (http_error) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (3 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
