# Weekly rerun: Octocrawl free arm, 2026-11-09

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `free`, week 2026-W46, run on 2026-11-09
- Source commit: `b6e94b5c`
- Set: 51 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 10 (group 2 of 0–3, ISO week 46 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T037, T042, T043, T050, T055, T056, T057, T060, T064, T065
- Chrome: Google Chrome 156.0.8078.81 (previous weekly record: Google Chrome 156.0.8078.47)
- API: http://127.0.0.1:8799, started by this script twice: with W2L_ACCESS_GRANT=/Users/howard07/Code/w2l/.claude/worktrees/pa-weekly/.w2l/access/installed-chrome-grant.json (SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818`, capabilities: installed_chrome) for the healthy and rotation tasks with access "standard", then with W2L_ACCESS_GRANT=/Users/howard07/Code/w2l/.w2l/access/ic-compat-grant-k1.json (SHA-256 `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`, capabilities: installed_chrome, compatible_transport; compatible_transport on its default hosts) for the 16 challenge tasks with "enhanced"; stopped after each
- installed_chrome on the 16 tasks: 13 of 16 verified against the acceptance baseline (ADR 0005, 7b56397b: final runs 11 and 7 of 16, probe runs 12 and 12): at or above both accepted runs
- Cost: $0 (no paid route; the Clash exit's bandwidth is not metered: unknown)
- Not run by the runner (its early stop): none

| Part | Planned | Attempted | Verified | False success |
| --- | --- | --- | --- | --- |
| all | 51 | 51 | 38 | 0 |
| healthy | 25 | 25 | 20 | 0 |
| challenge | 16 | 16 | 13 | 0 |
| rotation | 10 | 10 | 5 | 0 |

## Run: free-standard

Raw run: `.w2l/access/runs/2026-11-09T02-41-43-213Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --set all --only T015,T016,T020,T024,T027,T033,T035,T036,T039,T040,T041,T044,T051,T052,T058,T059,T061,T062,T063,T067,T072,T074,T077,T079,T080,T037,T042,T043,T050,T055,T056,T057,T060,T064,T065 --access "standard" --record .w2l/access/weekly/2026-11-09-b6e94b5c/free-standard.md`
- Source commit: `b6e94b5c`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8799; access option: `"standard"`
- Exit address: not recorded
- Grant: SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-11-09T02:41:43.213Z → 2026-11-09T02:44:14.981Z
- Tasks: 35 from `research/access/tasks.v1.json` (set `all`, only T015, T016, T020, T024, T027, T033, T035, T036, T039, T040, T041, T044, T051, T052, T058, T059, T061, T062, T063, T067, T072, T074, T077, T079, T080, T037, T042, T043, T050, T055, T056, T057, T060, T064, T065); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 35, attempted 35, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 35 | 25 | 0 | 3216 | 15617 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 25, not_loaded 0, not_extracted 0, not_served 10, unknown 0; region waits: 10 (held on 9)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 35 (time left at its start: median 300000 ms, least 299998 ms); browser_local on 19 (time left at its start: median 298497 ms, least 295706 ms)
- Verified answers by the route that delivered them (cold): http 15, browser 10
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 5 (T041: rule /homes/, set aside; T059: rule /, set aside; T064: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T015 | cold | yes | success |  | 200 | http | http |  | 2447 | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 10869 | ready (verified); region held in 991 ms |
| T020 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2458 | not_served (cloudflare_challenge) |
| T024 | cold | yes | success |  | 200 | http | http |  | 2694 | ready (verified) |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 2693 | not_served (http_error) |
| T033 | cold | yes | success |  | 200 | http | http |  | 3716 | ready (verified) |
| T035 | cold | yes | success |  | 200 | http | http |  | 2045 | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7932 | ready (verified); region held in 1151 ms |
| T037 | cold | no | blocked | captcha | 429 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3451 | not_served (captcha) |
| T039 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3425 | not_served (captcha) |
| T040 | cold | yes | success |  | 200 | http | http |  | 3038 | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 2346 | ready (verified) |
| T042 | cold | no | blocked | bot_detected_generic | 429 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 5309 | not_served (bot_detected_generic) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 4442 | not_served (bot_detected_generic) |
| T044 | cold | yes | success |  | 200 | http | http |  | 3216 | ready (verified) |
| T050 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 2792 | not_served (bot_detected_generic) |
| T051 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin | 2540 | not_served (cloudflare_challenge) |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | minTables, markdownMatches | 4452 | not_served (cloudflare_challenge) |
| T055 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 15617 | ready (verified); region held in 3177 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4823 | ready (verified); region held in 719 ms |
| T057 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4618 | ready (verified); region held in 1292 ms |
| T058 | cold | yes | success |  | 200 | http | http |  | 1181 | ready (verified) |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3592 | ready (verified); region held in 672 ms |
| T060 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 17211 | ready (verified); region not held in 9528 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 2403 | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7042 | ready (verified); region held in 907 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1408 | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3041 | not_served (login_wall) |
| T065 | cold | yes | success |  | 200 | http | http |  | 2120 | ready (verified) |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4678 | ready (verified); region held in 610 ms |
| T072 | cold | yes | success |  | 200 | http | http |  | 4147 | ready (verified) |
| T074 | cold | yes | success |  | 200 | http | http |  | 1115 | ready (verified) |
| T077 | cold | yes | success |  | 200 | http | http |  | 1782 | ready (verified) |
| T079 | cold | yes | success |  | 200 | http | http |  | 1561 | ready (verified) |
| T080 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5475 | ready (verified); region held in 703 ms |
- Task contract (cold): the product's verification agreed with the runner on 35 of 35 attempts that carry one (25 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Run: free-ic16

Raw run: `.w2l/access/runs/2026-11-09T02-44-17-107Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --access "enhanced" --save-responses --record .w2l/access/weekly/2026-11-09-b6e94b5c/free-ic16.md`
- Source commit: `b6e94b5c`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8799; access option: `"enhanced"`
- Exit address: not recorded
- Grant: SHA-256 `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`; capabilities: installed_chrome, compatible_transport (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-11-09T02:44:17.107Z → 2026-11-09T02:47:27.372Z
- Tasks: 16 from `research/access/tasks.v1.json` (set `all`, only T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 16, attempted 16, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 16 | 13 | 0 | 12606 | 23392 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 13, not_loaded 0, not_extracted 0, not_served 3, unknown 0; region waits: 13 (held on 13; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 16 (time left at its start: median 300000 ms, least 299998 ms); browser_local on 16 (time left at its start: median 298583 ms, least 297182 ms); installed_chrome on 15 (time left at its start: median 296878 ms, least 285746 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 12, browser 1
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 2 (T049: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 14467 | not_served (cloudflare_challenge) |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10539 | ready (verified); region held in 545 ms |
| T005 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 13434 | ready (verified); region held in 2790 ms, 2 screens scrolled |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6169 | ready (verified); region held in 780 ms |
| T038 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 12606 | ready (verified); region held in 1446 ms |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 7165 | not_served (captcha) |
| T046 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 13718 | ready (verified); region held in 803 ms |
| T047 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 11512 | ready (verified); region held in 883 ms |
| T048 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 5504 | ready (verified); region held in 696 ms |
| T049 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 14344 | ready (verified); region held in 731 ms |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8482 | ready (verified); region held in 606 ms |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 14123 | not_served (bot_detected_generic) |
| T071 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 13503 | ready (verified); region held in 691 ms |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8854 | ready (verified); region held in 630 ms |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 12364 | ready (verified); region held in 715 ms |
| B008 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 23392 | ready (verified); region held in 3716 ms |
- Task contract (cold): the product's verification agreed with the runner on 16 of 16 attempts that carry one (13 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
