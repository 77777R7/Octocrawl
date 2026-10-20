# Access task set run: all, 2026-10-20

- Command: `node research/access/run-set.mjs --set all --only T001,T047,T053,T048 --access "enhanced" --grant /Users/howard07/Code/w2l/.w2l/access/steel-grant.json --save-responses --record research/access/runs/2026-10-21-pa-g3-shadow-rank-1753ecbd.md`
- Source commit: `1753ecbd`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8803; access option: `"enhanced"`
- Exit address: not recorded
- Grant: SHA-256 `67acb9bc515429e9c1258253f2da648bea1738a41dbcd77c8455526b323cd239`; capabilities: compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-20T18:12:56.618Z → 2026-10-20T18:13:07.259Z
- Tasks: 4 (set `all`, only T001, T047, T053, T048); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 4, attempted 4, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 4 | 0 | 0 | 2565 | 3998 | unknown | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 0, not_loaded 0, not_extracted 0, not_served 4, unknown 0; region waits: 0 (held on 0)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 4 (time left at its start: median 300000 ms, least 299998 ms); browser_local on 4 (time left at its start: median 299142 ms, least 298498 ms)
- Verified answers by the route that delivered them (cold): none
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 2565 | not_served (cloudflare_challenge) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1902 | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 2169 | not_served (cloudflare_challenge) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches | 3998 | not_served (bot_detected_generic) |
- Task contract (cold): the product's verification agreed with the runner on 4 of 4 attempts that carry one (0 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Why no provider ran (PA G3)

- First attempt at the G3 acceptance run, written as `2026-10-21-pa-g3-shadow-rank-1753ecbd.md` by the command above and renamed afterwards. The local API (`W2L_TASK_ROOT=.w2l/g3-api W2L_ACCESS_GRANT=~/Code/w2l/.w2l/access/steel-grant.json W2L_VENDORS=steel node --import tsx packages/api/src/cli.ts --port 8803`, Clash) was started without `STEEL_API_KEY` in its environment, so no Steel rung was configured: every task ran http → browser_local only, no paid call, $0, and no `vendor_rank_shadow` event (the ladder writes it only when a provider rung and a routing history exist). Kept as the record of what ran; the G3 run proper is `2026-10-21-pa-g3-shadow-rank-1753ecbd.md`.
- "Working tree had uncommitted changes": only untracked run records under `research/access/runs/`, no source change beside `1753ecbd`.
