# Access task set run: all, 2026-10-31

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --access "enhanced" --client-timeout-ms 330000 --save-responses --record research/access/runs/2026-10-31-hosted-chrome-check-b-local-grant-4df8feed.md`
- Source commit: `4df8feed` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8787; access option: `"enhanced"`
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-31T00:09:32.371Z → 2026-10-31T00:12:07.299Z
- Tasks: 16 from `research/access/tasks.v1.json` (set `all`, only T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 16, attempted 16, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 16 | 11 | 0 | 9288 | 21647 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 11, not_loaded 0, not_extracted 0, not_served 5, unknown 0; region waits: 11 (held on 11; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 16 (time left at its start: median 300000 ms, least 299997 ms); browser_local on 16 (time left at its start: median 298790 ms, least 298027 ms); installed_chrome on 15 (time left at its start: median 297524 ms, least 285695 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 10, browser 1
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 2 (T049: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 13043 | ready (verified); region held in 563 ms |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8805 | ready (verified); region held in 541 ms |
| T005 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10089 | ready (verified); region held in 2757 ms, 2 screens scrolled |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5928 | ready (verified); region held in 778 ms |
| T038 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 5273 | not_served (captcha) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 6260 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 4608 | not_served (captcha) |
| T047 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 11115 | ready (verified); region held in 824 ms |
| T048 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8023 | ready (verified); region held in 723 ms |
| T049 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 12031 | ready (verified); region held in 727 ms |
| T053 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches | 4798 | not_served (bot_detected_generic) |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 13950 | not_served (bot_detected_generic) |
| T071 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10975 | ready (verified); region held in 744 ms |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9288 | ready (verified); region held in 662 ms |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9011 | ready (verified); region held in 692 ms |
| B008 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 21647 | ready (verified); region held in 3771 ms |
- Task contract (cold): the product's verification agreed with the runner on 16 of 16 attempts that carry one (11 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
