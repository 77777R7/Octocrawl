# Weekly rerun: Steel enhanced arm, 2026-10-26

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `steel`, week 2026-W44, run on 2026-10-26
- Source commit: `fef3d8f8`
- Set: 51 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 10 (group 0 of 0–3, ISO week 44 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T003, T004, T006, T007, T009, T010, T011, T012, T013, T014
- Chrome: Google Chrome 156.0.8078.47 (previous weekly record: Google Chrome 155.0.8059.85; major version changed, the 16 tasks were run twice)
- API: http://127.0.0.1:8799, started by this script with W2L_ACCESS_GRANT=/Users/howard07/Code/w2l/.claude/worktrees/pa-weekly/.w2l/access/steel-grant.json (SHA-256 `67acb9bc515429e9c1258253f2da648bea1738a41dbcd77c8455526b323cd239`, capabilities: compatible_transport, vendor_remote_browser, vendor_stealth), W2L_VENDORS=steel; every task with access "enhanced"; stopped after the arm
- Vendor attempts by layer (PA G2a RouteObservation, from the API's routing history, observed during the run): 23 attempts (the runner counted 23 paid calls)

| Layer | Yes | No | Unknown |
| --- | --- | --- | --- |
| Access delivered | 6 | 17 | 0 |
| Region loaded | 5 | 1 | 17 |
| Task verified | 5 | 18 | 0 |

- Where the vendor attempts stopped (failureStage): access 17, region 1, extraction 0, task 0, none 5
- Charged on these attempts by the spend ledger: $0.0261 on 23 (basis: measured 23)
- Cost per verified result: $0.0009 (the ledger's $0.0261 over the arm's 28 verified answers, any route; the exit's bandwidth is not metered); per result verified with a paid call's page: $0.0052 (over the 5 tasks verified with a paid call's page). The ledger's figure is the grant's tariff estimate, not Steel's bill.
- Cost: $0.0261 charged by the spend ledger (23 paid calls; the grant's tariff estimate, not Steel's bill)
- Not run by the runner (its early stop): none

| Part | Planned | Attempted | Verified | False success |
| --- | --- | --- | --- | --- |
| all | 51 | 51 | 28 | 1 |
| healthy | 25 | 25 | 19 | 0 |
| challenge | 16 | 16 | 3 | 0 |
| rotation | 10 | 10 | 6 | 1 |

## Run: steel-all

Raw run: `.w2l/access/runs/2026-10-26T03-10-17-514Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --set all --only T015,T016,T020,T024,T027,T033,T035,T036,T039,T040,T041,T044,T051,T052,T058,T059,T061,T062,T063,T067,T072,T074,T077,T079,T080,T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008,T003,T004,T006,T007,T009,T010,T011,T012,T013,T014 --access "enhanced" --save-responses --record .w2l/access/weekly/2026-10-26-fef3d8f8/steel-all.md`
- Source commit: `fef3d8f8` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8799; access option: `"enhanced"`
- Exit address: not recorded
- Grant: SHA-256 `67acb9bc515429e9c1258253f2da648bea1738a41dbcd77c8455526b323cd239`; capabilities: compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-26T03:10:17.514Z → 2026-10-26T03:30:37.078Z
- Tasks: 51 from `research/access/tasks.v1.json` (set `all`, only T015, T016, T020, T024, T027, T033, T035, T036, T039, T040, T041, T044, T051, T052, T058, T059, T061, T062, T063, T067, T072, T074, T077, T079, T080, T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008, T003, T004, T006, T007, T009, T010, T011, T012, T013, T014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 51, attempted 51, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 51 | 28 | 1 | 8339 | 79875 | unknown | unknown |

- Paid provider calls (cold): 23; tasks verified with a paid call's page as the answer: 5; charged by the spend ledger: $0.0261 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 28, not_loaded 1, not_extracted 0, not_served 22, unknown 0; region waits: 15 (held on 8; scrolled on 3, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): robots_override on T049 (provider, steel), B008 (provider, steel)

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 49 (time left at its start: median 299999 ms, least 299997 ms); browser_local on 33 (time left at its start: median 298978 ms, least 30000 ms); provider on 23 (time left at its start: median 297136 ms, least 280067 ms); http_compat on 2 (time left at its start: median 300000 ms, least 300000 ms)
- Verified answers by the route that delivered them (cold): vendor 5, browser 7, http_compat 2, http 14
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 6 (T041: rule /homes/, set aside; T049: rule /, set aside; T059: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | captcha | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 22318 | steel: blocked/captcha (answer) | not_served (captcha) |
| T002 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 57340 | steel: success (answer) | ready (verified); region not held in 6947 ms |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 67728 | steel: success (answer) | ready (verified); region not held in 10152 ms |
| T004 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 29876 | steel: success (answer) | ready (verified); region held in 3328 ms |
| T005 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 79133 | steel: success (answer) | ready (verified); region not held in 28219 ms, 1 screen scrolled |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8339 |  | ready (verified); region held in 2476 ms |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 2418 |  | ready (verified) |
| T009 | cold | yes | success |  | 200 | http | http_compat |  | 1342 |  | ready (verified) |
| T010 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 64348 | steel: success (answer) | not_loaded (checks_failed, region_not_ready, steady_unknown); region not held in 13498 ms |
| T011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5614 |  | ready (verified); region held in 579 ms |
| T012 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → provider | markdownCountMin | 166017 | steel: failed/timeout | not_served (source_data_error); region not held in 9521 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13138 |  | not_served (geo_restricted) |
| T014 | cold | no | failed | http_error | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 35307 | steel: failed/http_error (answer) | not_served (http_error) |
| T015 | cold | yes | success |  | 200 | http | http |  | 2316 |  | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8061 |  | ready (verified); region held in 963 ms |
| T020 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20531 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T024 | cold | yes | success |  | 200 | http | http |  | 1892 |  | ready (verified) |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 3033 |  | not_served (http_error) |
| T033 | cold | yes | success |  | 200 | http | http |  | 2555 |  | ready (verified) |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5459 |  | ready (verified); region held in 754 ms |
| T035 | cold | yes | success |  | 200 | http | http |  | 2054 |  | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6805 |  | ready (verified); region held in 645 ms |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 21864 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T039 | cold | no | blocked | captcha | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 35339 | steel: blocked/captcha (answer) | not_served (captcha); region not held in 9232 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1672 |  | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 2039 |  | ready (verified) |
| T044 | cold | yes | success |  | 200 | http | http |  | 3415 |  | ready (verified) |
| T045 | cold | no | blocked | captcha | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 27618 | steel: blocked/captcha (answer) | not_served (captcha) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 22361 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 63743 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 19012 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local; passed over: provider (steel, robots_override) | markdownCountMin, markdownMatches | 2868 |  | not_served (bot_detected_generic) |
| T051 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin | 33194 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | minTables, markdownMatches | 21197 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 16378 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T058 | cold | yes | success |  | 200 | http | http |  | 805 |  | ready (verified) |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3472 |  | ready (verified); region held in 684 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 4429 |  | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6713 |  | ready (verified); region held in 920 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1480 |  | ready (verified) |
| T067 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 79875 | steel: success (answer) | ready (verified) |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 34002 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19598 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3424 |  | ready (verified) |
| T074 | cold | yes | success |  | 200 | http | http |  | 893 |  | ready (verified) |
| T076 | cold | no | failed | timeout |  | provider | http → browser_local → provider | markdownCountMin | 154358 | steel: failed/timeout (answer) | not_served (timeout) |
| T077 | cold | yes | success |  | 200 | http | http |  | 1246 |  | ready (verified) |
| T079 | cold | yes | success |  | 200 | http | http |  | 1356 |  | ready (verified) |
| T080 | cold | no | failed | http_error | 999 | http | http | markdownMatches, markdownMatches | 1529 |  | not_served (http_error) |
| B001 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16120 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| B008 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local; passed over: provider (steel, robots_override) | markdownMatches, markdownCountMin | 13772 |  | not_served (bot_detected_generic); region not held in 9789 ms, 1 screen scrolled |
- Task contract (cold): the product's verification agreed with the runner on 51 of 51 attempts that carry one (28 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
