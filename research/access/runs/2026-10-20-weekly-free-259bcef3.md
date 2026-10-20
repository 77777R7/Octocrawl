# Weekly rerun: Octocrawl free arm, 2026-10-20

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `free`, week 2026-W43, run on 2026-10-20
- Source commit: `259bcef3`
- Set: 47 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 6 (group 3 of 0–3, ISO week 43 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T066, T069, T070, T075, T078, T081
- Chrome: Google Chrome 155.0.8059.80 (previous weekly record: Google Chrome 155.0.8059.80 (the P0.1 baseline, research/access/runs/2026-10-20-pa-next-baseline-ic16-1c4d9178.md))
- API: http://127.0.0.1:8799, started by this script with W2L_ACCESS_GRANT=/Users/howard07/Code/w2l/.claude/worktrees/gracious-ptolemy-2a348e/.w2l/access/installed-chrome-grant.json (SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818`, capabilities: installed_chrome); the healthy and rotation tasks with access "standard", the 16 challenge tasks with "enhanced"; stopped after the arm
- installed_chrome on the 16 tasks: 10 of 16 verified against the acceptance baseline (ADR 0005, 7b56397b: final runs 11 and 7 of 16, probe runs 12 and 12): at or above the lower accepted run (7), below the higher (11)
- Cost: $0 (no paid route; the Clash exit's bandwidth is not metered: unknown)
- Not run by the runner (its early stop): none

| Part | Planned | Attempted | Verified | False success |
| --- | --- | --- | --- | --- |
| all | 47 | 47 | 36 | 0 |
| healthy | 25 | 25 | 23 | 0 |
| challenge | 16 | 16 | 10 | 0 |
| rotation | 6 | 6 | 3 | 0 |

## Run: free-standard

Raw run: `.w2l/access/runs/2026-10-19T18-22-21-493Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --set all --only T015,T016,T020,T024,T027,T033,T035,T036,T039,T040,T041,T044,T051,T052,T058,T059,T061,T062,T063,T067,T072,T074,T077,T079,T080,T066,T069,T070,T075,T078,T081 --access "standard" --record .w2l/access/weekly/2026-10-20-259bcef3/free-standard.md`
- Source commit: `259bcef3` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8799; access option: `"standard"`
- Exit address: not recorded
- Grant: SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-19T18:22:21.493Z → 2026-10-19T18:24:09.615Z
- Tasks: 31 (set `all`, only T015, T016, T020, T024, T027, T033, T035, T036, T039, T040, T041, T044, T051, T052, T058, T059, T061, T062, T063, T067, T072, T074, T077, T079, T080, T066, T069, T070, T075, T078, T081); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 31, attempted 31, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 31 | 26 | 0 | 2692 | 7747 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 26, not_loaded 0, not_extracted 0, not_served 5, unknown 0; region waits: 12 (held on 12)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 31 (time left at its start: median 300000 ms, least 299998 ms); browser_local on 14 (time left at its start: median 299040 ms, least 297695 ms)
- Verified answers by the route that delivered them (cold): http 14, browser 12
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 7 (T041: rule /homes/, set aside; T059: rule /, set aside; T066: rule /, set aside; T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T015 | cold | yes | success |  | 200 | http | http |  | 1596 | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7747 | ready (verified); region held in 987 ms |
| T020 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8184 | ready (verified); region held in 899 ms |
| T024 | cold | yes | success |  | 200 | http | http |  | 1969 | ready (verified) |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 2615 | not_served (http_error) |
| T033 | cold | yes | success |  | 200 | http | http |  | 2401 | ready (verified) |
| T035 | cold | yes | success |  | 200 | http | http |  | 1883 | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6089 | ready (verified); region held in 1158 ms |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4758 | ready (verified); region held in 692 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1174 | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 2065 | ready (verified) |
| T044 | cold | yes | success |  | 200 | http | http |  | 3215 | ready (verified) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4674 | ready (verified); region held in 733 ms |
| T052 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5469 | ready (verified); region held in 562 ms |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5066 | ready (verified); region held in 1842 ms |
| T059 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 1905 | not_served (login_wall) |
| T061 | cold | yes | success |  | 200 | http | http |  | 2716 | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5780 | ready (verified); region held in 880 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1083 | ready (verified) |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6876 | ready (verified); region held in 1799 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4161 | ready (verified); region held in 597 ms |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2095 | not_served (cloudflare_challenge) |
| T070 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6245 | ready (verified); region held in 796 ms |
| T072 | cold | yes | success |  | 200 | http | http |  | 3365 | ready (verified) |
| T074 | cold | yes | success |  | 200 | http | http |  | 1020 | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4461 | ready (verified); region held in 608 ms |
| T077 | cold | yes | success |  | 200 | http | http |  | 1839 | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1641 | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 2692 | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2157 | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1159 | not_served (http_error) |
- Task contract (cold): the product's verification agreed with the runner on 31 of 31 attempts that carry one (26 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Run: free-ic16

Raw run: `.w2l/access/runs/2026-10-19T18-24-09-707Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --access "enhanced" --save-responses --record .w2l/access/weekly/2026-10-20-259bcef3/free-ic16.md`
- Source commit: `fa1df385`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8799; access option: `"enhanced"`
- Exit address: not recorded
- Grant: SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-19T18:24:09.707Z → 2026-10-19T18:28:21.244Z
- Tasks: 16 (set `all`, only T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 16, attempted 16, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 16 | 10 | 0 | 15144 | 25300 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 10, not_loaded 0, not_extracted 0, not_served 6, unknown 0; region waits: 10 (held on 10)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 16 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 16 (time left at its start: median 299164 ms, least 298563 ms); installed_chrome on 16 (time left at its start: median 297522 ms, least 286551 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 10
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 2 (T049: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9014 | ready (verified); region held in 540 ms |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7781 | ready (verified); region held in 535 ms |
| T005 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 24186 | not_served (captcha) |
| T034 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 22240 | not_served (captcha) |
| T038 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 24254 | not_served (captcha) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 25300 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 23602 | not_served (captcha) |
| T047 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 15144 | ready (verified); region held in 868 ms |
| T048 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9123 | ready (verified); region held in 708 ms |
| T049 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 13147 | ready (verified); region held in 687 ms |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8103 | ready (verified); region held in 595 ms |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 23713 | not_served (bot_detected_generic) |
| T071 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8626 | ready (verified); region held in 700 ms |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9595 | ready (verified); region held in 623 ms |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 5588 | ready (verified); region held in 668 ms |
| B008 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 22095 | ready (verified); region held in 4985 ms |
- Task contract (cold): the product's verification agreed with the runner on 16 of 16 attempts that carry one (10 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
