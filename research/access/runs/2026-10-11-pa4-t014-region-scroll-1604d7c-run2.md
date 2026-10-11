# Access task set run: all, 2026-10-11

- Command: `node research/access/run-set.mjs --set all --only T014 --access "enhanced" --record research/access/runs/2026-10-11-pa4-t014-region-scroll-1604d7c-run2.md`
- Source commit: `1604d7cc` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8796; access option: `"enhanced"`
- Exit address: not recorded
- Run: 2026-10-11T14:48:29.743Z → 2026-10-11T14:49:10.064Z
- Tasks: 1 (set `all`, only T014); task file SHA-256 at fetch time: `cb4172278158579cb72ae79c155ac7e2eea7dc90849b4206db92213d612fb16c`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 1 | 1 | 0 | 40315 | 40315 | unknown | unknown |

- Paid provider calls (cold): 1; tasks verified with a paid call's page as the answer: 1; charged by the spend ledger: $0.0551 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill); bytes through the provider's proxy, as it reported them: 5412636

- Readiness (cold, ADR 0007): ready 1, not_loaded 0, not_extracted 0, not_served 0, unknown 0; region waits: 1 (held on 0)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T014 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 40315 | steel: success [5412636 B US] (answer) | ready (verified); region not held in 9279 ms |
- Task contract (cold): the product's verification agreed with the runner on 1 of 1 attempts that carry one (1 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes

This is the run repeated right after the first one (`2026-10-11-pa4-t014-region-scroll-1604d7c.md`, refused 403). T014 was verified on Steel's page through its US residential proxy: 5,412,636 proxy bytes, $0.0551 by the ledger. The product's verification agreed with the runner.

- **The page:** its Markdown is 20,050 characters and holds the product prices. Steel's page without the scroll had been the 2,840-character category landing page (`2026-10-11-pa4-t014-t060-steel-residential-us-ddd3ff0.md`).
- **Why it now holds the prices:** a Steel session opened by hand earlier the same day, through the same proxy, found 1 price after 25 s of waiting and 22 once scrolled. So the prices are taken to come from the region wait's scroll.
  - The runner's `regionWait` column does not keep the `scrolls` count, so the scroll is inferred, not seen.
  - The wait ended at 9.3 s without counting the region ready, which needs the same counts on two reads in a row. The page read after it held the prices.
- **Home Depot's answers through Steel today:**
  - Steel's datacenter exit was refused (403).
  - One residential session was refused (the first run).
  - Two residential sessions loaded the page: one opened by hand, and this run's.
- **About "(working tree had uncommitted changes)" above:** the runner counts any untracked file under `research/access` as a change. The only one then was the first run's record, `2026-10-11-pa4-t014-region-scroll-1604d7c.md`, written moments before and not yet committed. The code run was commit `1604d7cc` as committed, scroll included.
