# Weekly rerun: Steel enhanced arm, 2026-10-20

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `steel`, week 2026-W43, run on 2026-10-20
- Source commit: `259bcef3`
- Set: 47 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 6 (group 3 of 0–3, ISO week 43 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T066, T069, T070, T075, T078, T081
- Chrome: Google Chrome 155.0.8059.80 (previous weekly record: Google Chrome 155.0.8059.80 (the P0.1 baseline, research/access/runs/2026-10-20-pa-next-baseline-ic16-1c4d9178.md))
- API: http://127.0.0.1:8799, started by this script with W2L_ACCESS_GRANT=/Users/howard07/Code/w2l/.claude/worktrees/gracious-ptolemy-2a348e/.w2l/access/steel-grant.json (SHA-256 `67acb9bc515429e9c1258253f2da648bea1738a41dbcd77c8455526b323cd239`, capabilities: compatible_transport, vendor_remote_browser, vendor_stealth), W2L_VENDORS=steel; every task with access "enhanced"; stopped after the arm
- Cost: $0.0049 charged by the spend ledger (15 paid calls; the grant's tariff estimate, not Steel's bill)
- Not run by the runner (its early stop): none

| Part | Planned | Attempted | Verified | False success |
| --- | --- | --- | --- | --- |
| all | 47 | 47 | 28 | 1 |
| healthy | 25 | 25 | 23 | 0 |
| challenge | 16 | 16 | 2 | 1 |
| rotation | 6 | 6 | 3 | 0 |

## Run: steel-all

Raw run: `.w2l/access/runs/2026-10-19T18-28-23-375Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --set all --only T015,T016,T020,T024,T027,T033,T035,T036,T039,T040,T041,T044,T051,T052,T058,T059,T061,T062,T063,T067,T072,T074,T077,T079,T080,T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008,T066,T069,T070,T075,T078,T081 --access "enhanced" --save-responses --record .w2l/access/weekly/2026-10-20-259bcef3/steel-all.md`
- Source commit: `4b9aa8be` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8799; access option: `"enhanced"`
- Exit address: not recorded
- Grant: SHA-256 `67acb9bc515429e9c1258253f2da648bea1738a41dbcd77c8455526b323cd239`; capabilities: compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-19T18:28:23.375Z → 2026-10-19T18:34:03.469Z
- Tasks: 47 (set `all`, only T015, T016, T020, T024, T027, T033, T035, T036, T039, T040, T041, T044, T051, T052, T058, T059, T061, T062, T063, T067, T072, T074, T077, T079, T080, T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008, T066, T069, T070, T075, T078, T081); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 47, attempted 47, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 47 | 28 | 1 | 5230 | 15390 | unknown | unknown |

- Paid provider calls (cold): 15; tasks verified with a paid call's page as the answer: 2; charged by the spend ledger: $0.0049 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 28, not_loaded 0, not_extracted 0, not_served 19, unknown 0; region waits: 17 (held on 15; scrolled on 1, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): robots_override on T049 (provider, steel), T059 (provider, steel), B008 (provider, steel)

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 47 (time left at its start: median 300000 ms, least 299998 ms); browser_local on 31 (time left at its start: median 299185 ms, least 297605 ms); provider on 15 (time left at its start: median 297798 ms, least 296321 ms)
- Verified answers by the route that delivered them (cold): vendor 2, http 13, browser 13
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 9 (T041: rule /homes/, set aside; T049: rule /, set aside; T059: rule /, set aside; T066: rule /, set aside; T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 15094 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T002 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 15390 | steel: success (answer) | ready (verified); region held in 1236 ms |
| T005 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 23792 | steel: success (answer) | not_served (checks_failed, region_absent); region not held in 10171 ms |
| T015 | cold | yes | success |  | 200 | http | http |  | 1671 |  | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6261 |  | ready (verified); region held in 1119 ms |
| T020 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 9541 |  | ready (verified); region held in 953 ms |
| T024 | cold | yes | success |  | 200 | http | http |  | 2326 |  | ready (verified) |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 2528 |  | not_served (http_error) |
| T033 | cold | yes | success |  | 200 | http | http |  | 2514 |  | ready (verified) |
| T034 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 18437 | steel: success (answer) | ready (verified); region held in 2449 ms |
| T035 | cold | yes | success |  | 200 | http | http |  | 1842 |  | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5230 |  | ready (verified); region held in 653 ms |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 13790 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4341 |  | ready (verified); region held in 687 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1091 |  | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 1323 |  | ready (verified) |
| T044 | cold | yes | success |  | 200 | http | http |  | 2062 |  | ready (verified) |
| T045 | cold | no | blocked | captcha | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 14441 | steel: blocked/captcha (answer) | not_served (captcha) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 13482 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 11556 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 12173 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local; passed over: provider (steel, robots_override) | markdownCountMin, markdownMatches | 3907 |  | not_served (bot_detected_generic) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5265 |  | ready (verified); region held in 727 ms |
| T052 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5187 |  | ready (verified); region held in 563 ms |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 13914 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3354 |  | ready (verified); region held in 676 ms |
| T059 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local; passed over: provider (steel, robots_override) | markdownMatches, markdownCountMin | 1882 |  | not_served (login_wall) |
| T061 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5476 |  | ready (verified); region held in 670 ms |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5964 |  | ready (verified); region held in 924 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1290 |  | ready (verified) |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6147 |  | ready (verified); region held in 656 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4326 |  | ready (verified); region held in 618 ms |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 13843 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 11975 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T070 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7351 |  | ready (verified); region held in 805 ms |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 12569 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3359 |  | ready (verified) |
| T074 | cold | yes | success |  | 200 | http | http |  | 1725 |  | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5092 |  | ready (verified); region held in 614 ms |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 14601 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T077 | cold | yes | success |  | 200 | http | http |  | 1838 |  | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1464 |  | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 2013 |  | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2221 |  | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1082 |  | not_served (http_error) |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 11904 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| B008 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local; passed over: provider (steel, robots_override) | markdownMatches, markdownCountMin | 13397 |  | not_served (bot_detected_generic); region not held in 9753 ms, 1 screen scrolled |
- Task contract (cold): the product's verification agreed with the runner on 47 of 47 attempts that carry one (28 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
