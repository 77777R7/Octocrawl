# Access task set run: all, 2026-10-20

- Command: `node research/access/run-set.mjs --set all --only T001,T047,T053,T048 --access "enhanced" --grant /Users/howard07/Code/w2l/.w2l/access/steel-grant.json --record research/access/runs/2026-10-20-pa-g2b-route-history-fd59157a.md`
- Source commit: `fd59157a`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8803; access option: `"enhanced"`
- Exit address: not recorded
- Grant: SHA-256 `67acb9bc515429e9c1258253f2da648bea1738a41dbcd77c8455526b323cd239`; capabilities: compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-20T15:52:06.715Z → 2026-10-20T15:53:42.817Z
- Tasks: 4 (set `all`, only T001, T047, T053, T048); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 4, attempted 4, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 4 | 0 | 0 | 24571 | 42892 | unknown | unknown |

- Paid provider calls (cold): 4; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0133 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 0, not_loaded 0, not_extracted 0, not_served 4, unknown 0; region waits: 0 (held on 0)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 4 (time left at its start: median 300000 ms, least 299998 ms); browser_local on 4 (time left at its start: median 299044 ms, least 298768 ms); provider on 4 (time left at its start: median 297181 ms, least 295233 ms)
- Verified answers by the route that delivered them (cold): none
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 0; not known on 2 attempts without a robots check

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | failed | provider_error |  | provider | http → browser_local → provider | markdownMatches, markdownMatches | 13355 | steel: failed/provider_error (answer) | not_served (provider_error) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 24571 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 42892 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T053 | cold | no | failed | provider_error |  | provider | http → browser_local → provider | markdownMatches | 15275 | steel: failed/provider_error (answer) | not_served (provider_error) |
- Task contract (cold): the product's verification agreed with the runner on 4 of 4 attempts that carry one (0 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Routing history on disk (PA G2b acceptance, docs/pa-enhancement-tasks.md G2b)

- API started from this checkout at `fd59157a` (branch `claude/pa-g2b-routes-sqlite`, stacked on G2a #643) with a fresh task root: `W2L_TASK_ROOT=.w2l/g2b-api W2L_ACCESS_GRANT=~/Code/w2l/.w2l/access/steel-grant.json W2L_VENDORS=steel node --import tsx packages/api/src/cli.ts --port 8803`, with the proxy variables above (Clash).
- Grant checked before the run: capabilities `compatible_transport`, `vendor_remote_browser`, `vendor_stealth`; `vendor_residential_proxy` not listed, so Steel's proxies were off. `perRunUsd` 1, `perRequestUsd` 0.05.
- After the 4-task run the API was stopped and `.w2l/g2b-api/routing-history.sqlite` (mode 0600) was read with a scratch script outside the repository. Four `routes` rows, one per host, all scope `standard|enhanced`, egress class `environment`, region unknown, policy `route/1`, versions `extract-tf/31|verify/9`, vendor `steel`, browser `128` (the declared identity's Chrome major), the same exit id and vendor egress hash on all four. Each row's family is `task:<contract hash>`, since every task sends a contract. No `route_expiries` rows.

| Task | Host | attempts | accessDelivered (yes/no/unknown) | regionLoaded | taskVerified | failureStage | reason | chargedUsd (basis) | timings measured |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | studylib.net | 1 | 0/1/0 | unknown | no | access | provider_error | 0.00333 (ceiling) | totalMs 10505 only |
| T047 | www.capterra.com | 1 | 0/1/0 | unknown | no | access | cloudflare_challenge | 0.00333 (ceiling) | totalMs 5399 only |
| T048 | www.crunchbase.com | 1 | 0/1/0 | unknown | no | access | cloudflare_challenge | 0.00333 (ceiling) | totalMs 5592 only |
| T053 | www.imf.org | 1 | 0/1/0 | unknown | no | access | provider_error | 0.00333 (ceiling) | totalMs 10500 only |

- `chargedUsd` is the spend ledger's charge for each paid call (all four at the ceiling, $0.00333; Steel stated no price and no measured session time came back on these results). The vendor's own `costUsd` stays null, as before G2a. Region wait, extract and session times were not measured on any of the four (null, not 0).
- Restart check: a new API process on the same task root, then `node research/access/run-set.mjs --set all --only T047 --access '"enhanced"' --grant ~/Code/w2l/.w2l/access/steel-grant.json` (2026-10-20T15:54:22Z → 15:54:46Z, record kept outside the repository; T047 blocked `cloudflare_challenge` again). The capterra row then held attempts 2, accessDelivered 0/2/0 and chargedTotalUsd $0.00667: the row written by the first process was read back and added to. With one provider in the grant the ladder never orders vendors, so this run shows the persistence and not a read for ranking; the read path (route, host fallback, fixed) is covered by `packages/bench/test/sqliteRoutingHistory.test.ts` and `packages/api/test/routingHistory.test.ts`.
- Cost: $0.0133 for the 4-task run plus $0.0033 for the restart check, $0.0167 in all, charged by the spend ledger (the grant's tariff ceiling, not Steel's bill).
- None of the four tasks was verified; T001 and T053 failed `provider_error` on Steel here (the B run of 10-20 had T001 `captcha`), not isolated.
