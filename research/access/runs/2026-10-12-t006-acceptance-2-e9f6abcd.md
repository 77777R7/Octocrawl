# Access task set run: all, 2026-10-12

- Command: `node research/access/run-set.mjs --set all --only T006 --raw-html --record research/access/runs/2026-10-12-t006-acceptance-2-e9f6abcd.md`
- Source commit: `e9f6abcd` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8787; access option: none
- Exit address: not recorded
- Run: 2026-10-12T11:08:02.569Z → 2026-10-12T11:08:10.278Z
- Tasks: 1 (set `all`, only T006); task file SHA-256 at fetch time: `cbf4f65a92081a77161138c9e066119418d98adf9772b2e1811e659bbbdd783f`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 1 | 1 | 0 | 7705 | 7705 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 1, not_loaded 0, not_extracted 0, not_served 0, unknown 0; region waits: 1 (held on 1)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7705 | ready (verified); region held in 3265 ms |
- Task contract (cold): the product's verification agreed with the runner on 1 of 1 attempts that carry one (1 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
