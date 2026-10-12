# Access task set run: all, 2026-10-12

- Command: `node research/access/run-set.mjs --set all --only T014,T021,T030,T050 --access "enhanced" --save-responses --record research/access/runs/2026-10-12-scroll-ab-b-recheck-f73d95b7.md`
- Source commit: `f73d95b7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8797; access option: `"enhanced"`
- Exit address: not recorded
- Run: 2026-10-12T15:19:58.538Z → 2026-10-12T15:22:22.736Z
- Tasks: 4 (set `all`, only T014, T021, T030, T050); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 4 | 4 | 0 | 41292 | 41516 | unknown | unknown |

- Paid provider calls (cold): 4; tasks verified with a paid call's page as the answer: 4; charged by the spend ledger: $0.0033 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 4, not_loaded 0, not_extracted 0, not_served 0, unknown 0; region waits: 4 (held on 4; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T014 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 41516 | steel: success (answer) | ready (verified); region held in 8402 ms, 1 screen scrolled |
| T021 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 36308 | steel: success (answer) | ready (verified); region held in 7406 ms |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 41292 | steel: success (answer) | ready (verified); region held in 3912 ms |
| T050 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 25067 | steel: success (answer) | ready (verified); region held in 3552 ms |
- Task contract (cold): the product's verification agreed with the runner on 4 of 4 attempts that carry one (4 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
