# Access task set run: all, 2026-10-31

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --access "enhanced" --client-timeout-ms 330000 --save-responses --record research/access/runs/2026-10-31-hosted-chrome-gate-a2-rerun-4df8feed.md`
- Source commit: `4df8feed` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the Octocrawl API at W2L_API_URL (the pages are read from its servers; the network and exit lines are the runner's way to it)
- API: https://h45regex---octocrawl-api-c7fpmz73tq-as.a.run.app (an account key was sent, not recorded); access option: `"enhanced"`
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-31T03:39:51.282Z → 2026-10-31T03:43:13.365Z
- Tasks: 16 from `research/access/tasks.v1.json` (set `all`, only T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 16, attempted 16, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 16 | 6 | 0 | 14246 | 22416 | unknown | unknown |

- Paid provider calls (cold): 14; tasks verified with a paid call's page as the answer: 6; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 6, not_loaded 0, not_extracted 0, not_served 10, unknown 0; region waits: 6 (held on 6)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 16 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 14 (time left at its start: median 299959 ms, least 299473 ms); hosted_chrome on 14 (time left at its start: median 298278 ms, least 296766 ms)
- Verified answers by the route that delivered them (cold): hosted_chrome 6
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 2 (T049: rule /; B008: rule /)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → hosted_chrome | markdownMatches, markdownMatches | 6432 | webshare: blocked/captcha (answer) | not_served (captcha) |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local → hosted_chrome |  | 13524 | webshare: success (answer) | ready (verified); region held in 983 ms |
| T005 | cold | yes | success |  | 200 | browser_local | http → browser_local → hosted_chrome |  | 14246 | webshare: success (answer) | ready (verified); region held in 1507 ms |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local → hosted_chrome |  | 20810 | webshare: success (answer) | ready (verified); region held in 1367 ms |
| T038 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → hosted_chrome | markdownCountMin, markdownMatches | 18176 | webshare: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → hosted_chrome | markdownCountMin, markdownMatches | 8469 | webshare: blocked/captcha (answer) | not_served (captcha) |
| T046 | cold | yes | success |  | 200 | browser_local | http → browser_local → hosted_chrome |  | 22416 | webshare: success (answer) | ready (verified); region held in 3483 ms |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → hosted_chrome | markdownCountMin, markdownMatches | 15622 | webshare: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → hosted_chrome | markdownMatches, markdownMatches | 15048 | webshare: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T049 | cold | no | failed | policy_denied |  | http | http | markdownCountMin, markdownMatches | 763 |  | not_served (policy_denied) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → hosted_chrome | markdownMatches | 9631 | webshare: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → hosted_chrome | markdownMatches, markdownCountMin | 15800 | webshare: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → hosted_chrome | markdownCountMin, markdownMatches | 15797 | webshare: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → hosted_chrome |  | 14039 | webshare: success (answer) | ready (verified); region held in 1091 ms |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → hosted_chrome |  | 10454 | webshare: success (answer) | ready (verified); region held in 1286 ms |
| B008 | cold | no | failed | policy_denied |  | http | http | markdownMatches, markdownCountMin | 724 |  | not_served (policy_denied) |
- Task contract (cold): the product's verification agreed with the runner on 16 of 16 attempts that carry one (6 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
