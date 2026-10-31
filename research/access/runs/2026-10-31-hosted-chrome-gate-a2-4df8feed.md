# Access task set run: all, 2026-10-31

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --access "enhanced" --client-timeout-ms 330000 --save-responses --record research/access/runs/2026-10-31-hosted-chrome-gate-a2-4df8feed.md`
- Source commit: `4df8feed` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the Octocrawl API at W2L_API_URL (the pages are read from its servers; the network and exit lines are the runner's way to it)
- API: https://h45regex---octocrawl-api-c7fpmz73tq-as.a.run.app (an account key was sent, not recorded); access option: `"enhanced"`
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-31T03:38:03.394Z → 2026-10-31T03:39:18.497Z
- Tasks: 16 from `research/access/tasks.v1.json` (set `all`, only T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 16, attempted 16, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 16 | 0 | 0 | 2749 | 33926 | unknown | unknown |

- Paid provider calls (cold): 1; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 0, not_loaded 0, not_extracted 0, not_served 16, unknown 0; region waits: 0 (held on 0)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): other on T002 (hosted_chrome: daily_attempts), T005 (hosted_chrome: daily_attempts), T034 (hosted_chrome: daily_attempts), T038 (hosted_chrome: daily_attempts), T045 (hosted_chrome: daily_attempts), T046 (hosted_chrome: daily_attempts), T047 (hosted_chrome: daily_attempts), T048 (hosted_chrome: daily_attempts), T053 (hosted_chrome: daily_attempts), T068 (hosted_chrome: daily_attempts), T071 (hosted_chrome: daily_attempts), T076 (hosted_chrome: daily_attempts), B001 (hosted_chrome: daily_attempts)

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 16 (time left at its start: median 299999 ms, least 299993 ms); browser_local on 14 (time left at its start: median 299723 ms, least 298257 ms); hosted_chrome on 1 (time left at its start: median 295128 ms, least 295128 ms)
- Verified answers by the route that delivered them (cold): none
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 2 (T049: rule /; B008: rule /)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → hosted_chrome | markdownMatches, markdownMatches | 33926 | webshare: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T002 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local; passed over: hosted_chrome (other) | markdownMatches, markdownMatches | 3036 |  | not_served (cloudflare_challenge) |
| T005 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local; passed over: hosted_chrome (other) | markdownCountMin, markdownMatches | 5185 |  | not_served (bot_detected_generic) |
| T034 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local; passed over: hosted_chrome (other) | markdownCountMin, markdownMatches | 2332 |  | not_served (captcha) |
| T038 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local; passed over: hosted_chrome (other) | markdownCountMin, markdownMatches | 3021 |  | not_served (bot_detected_generic) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local; passed over: hosted_chrome (other) | markdownCountMin, markdownMatches | 3758 |  | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local; passed over: hosted_chrome (other) | markdownCountMin, markdownMatches | 3487 |  | not_served (captcha) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local; passed over: hosted_chrome (other) | markdownCountMin, markdownMatches | 2669 |  | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local; passed over: hosted_chrome (other) | markdownMatches, markdownMatches | 1881 |  | not_served (cloudflare_challenge) |
| T049 | cold | no | failed | policy_denied |  | http | http | markdownCountMin, markdownMatches | 1002 |  | not_served (policy_denied) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local; passed over: hosted_chrome (other) | markdownMatches | 3804 |  | not_served (bot_detected_generic) |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local; passed over: hosted_chrome (other) | markdownMatches, markdownCountMin | 2527 |  | not_served (cloudflare_challenge) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local; passed over: hosted_chrome (other) | markdownCountMin, markdownMatches | 2749 |  | not_served (cloudflare_challenge) |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local; passed over: hosted_chrome (other) | markdownCountMin | 2048 |  | not_served (cloudflare_challenge) |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local; passed over: hosted_chrome (other) | markdownCountMin, markdownMatches | 2592 |  | not_served (cloudflare_challenge) |
| B008 | cold | no | failed | policy_denied |  | http | http | markdownMatches, markdownCountMin | 977 |  | not_served (policy_denied) |
- Task contract (cold): the product's verification agreed with the runner on 16 of 16 attempts that carry one (0 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
