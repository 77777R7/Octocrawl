# Access task set run: all, 2026-10-20

- Command: `node research/access/run-set.mjs --set all --only T001,T047,T053,T048 --access "enhanced" --grant /Users/howard07/Code/w2l/.w2l/access/steel-grant.json --save-responses --record research/access/runs/2026-10-21-pa-g3-shadow-rank-1753ecbd.md`
- Source commit: `1753ecbd` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8803; access option: `"enhanced"`
- Exit address: not recorded
- Grant: SHA-256 `67acb9bc515429e9c1258253f2da648bea1738a41dbcd77c8455526b323cd239`; capabilities: compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-20T18:13:44.495Z → 2026-10-20T18:14:51.893Z
- Tasks: 4 (set `all`, only T001, T047, T053, T048); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 4, attempted 4, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 4 | 0 | 0 | 18810 | 19360 | unknown | unknown |

- Paid provider calls (cold): 4; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0015 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 0, not_loaded 0, not_extracted 0, not_served 4, unknown 0; region waits: 0 (held on 0)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 4 (time left at its start: median 300000 ms, least 299998 ms); browser_local on 4 (time left at its start: median 299115 ms, least 298999 ms); provider on 4 (time left at its start: median 297464 ms, least 297220 ms)
- Verified answers by the route that delivered them (cold): none
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 19360 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 13734 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 18810 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 15480 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
- Task contract (cold): the product's verification agreed with the runner on 4 of 4 attempts that carry one (0 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Shadow vendor ranking (PA G3 acceptance, docs/pa-enhancement-tasks.md G3)

- API from this checkout at `1753ecbd` (branch `claude/pa-g3-shadow-rank`) with a fresh task root: `W2L_TASK_ROOT=.w2l/g3-api2 W2L_ACCESS_GRANT=~/Code/w2l/.w2l/access/steel-grant.json W2L_VENDORS=steel STEEL_API_KEY=<from .w2l/access/competitors.env> node --import tsx packages/api/src/cli.ts --port 8803`, proxied through Clash as above. "Working tree had uncommitted changes" means untracked run records only. Run times are UTC; the file date is the local date (UTC+8). A first attempt without `STEEL_API_KEY` ran no provider: `2026-10-21-pa-g3-no-steel-key-1753ecbd.md`.
- Grant checked before the run: capabilities `compatible_transport`, `vendor_remote_browser`, `vendor_stealth`; `vendor_residential_proxy` not listed, so Steel's proxies were off. `perRunUsd` 1, `perRequestUsd` 0.05.
- `vendor_rank_shadow` was read from each answer's trace (`--save-responses`, under the git-ignored run directories) with a scratch script outside the repository.
- One provider in the grant, so the order the ladder took cannot differ from the declared one; what this run shows is that the event is written on every answer, that the fallback reasons follow the history, and that the rungs are unchanged. The order comparison with several providers is covered by `packages/bench/test/ladder.test.ts` ("the shadow vendor ranking (PA G3)").

| Run | Task | Rungs started | Steel paid call | Ledger charge | vendor_rank_shadow: shadow / actual / differs | fallbackReasons | Steel candidate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| this record | T001 | http → browser_local → provider | blocked cloudflare_challenge | in $0.0015 total | steel / steel / null | new_host | samples 0 |
| this record | T047 | http → browser_local → provider | blocked cloudflare_challenge | in $0.0015 total | steel / steel / null | new_host | samples 0 |
| this record | T048 | http → browser_local → provider | blocked cloudflare_challenge | in $0.0015 total | steel / steel / null | new_host | samples 0 |
| this record | T053 | http → browser_local → provider | blocked bot_detected_generic | in $0.0015 total | steel / steel / null | new_host | samples 0 |
| repeat 2 (18:15:05Z) | T047 | http → browser_local → provider | failed provider_error | $0.0033 | steel / steel / null | insufficient_samples | samples 1 |
| repeat 3 (18:15:28Z) | T047 | http → browser_local → provider | blocked cloudflare_challenge | $0.0003 | steel / steel / null | insufficient_samples | samples 2 |
| repeat 4 (18:15:40Z) | T047 | http → browser_local → provider | blocked cloudflare_challenge | $0.0003 | steel / steel / false | none (ranked; read basis `route`) | samples 3, judged 3, verified 0, pass rate 0, unit cost unknown (null), known charged $0.003952, unknown exposure 0, median 5393 ms |

- Repeats 2–4: `node research/access/run-set.mjs --set all --only T047 --access '"enhanced"' --grant ~/Code/w2l/.w2l/access/steel-grant.json --save-responses --record <scratch file outside the repository>`, same API and task root; each T047 not verified.
- Repeat 4 is the first read with enough attempts (3, the minimum) on T047's route: the shadow ranked instead of falling back, and with no verified delivery the unit cost is unknown, not 0. The $0.003952 it sums is the ledger's settled charges for the three earlier T047 calls (the 4-task run's, repeat 2's and repeat 3's); repeat 4's own call is recorded after the read.
- Rungs: http → browser_local → provider on every answer, the same order as the G2b run on `fd59157a` (`2026-10-20-pa-g2b-route-history-fd59157a.md`).
- Cost: $0.0015 for the 4-task run plus $0.0039 for the three repeats, about $0.0055 in all, charged by the spend ledger under the grant's tariff (an estimate, not Steel's bill).
