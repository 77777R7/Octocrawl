# Access task set run: all, 2026-10-12

- Command: `node research/access/run-set.mjs --set all --only T006 --raw-html --record research/access/runs/2026-10-12-t006-acceptance-3-e9f6abcd.md`
- Source commit: `e9f6abcd` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8787; access option: none
- Exit address: not recorded
- Run: 2026-10-12T11:08:30.392Z → 2026-10-12T11:08:38.077Z
- Tasks: 1 (set `all`, only T006); task file SHA-256 at fetch time: `cbf4f65a92081a77161138c9e066119418d98adf9772b2e1811e659bbbdd783f`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 1 | 1 | 0 | 7681 | 7681 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 1, not_loaded 0, not_extracted 0, not_served 0, unknown 0; region waits: 1 (held on 1; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7681 | ready (verified); region held in 4530 ms, 1 screen scrolled |
- Task contract (cold): the product's verification agreed with the runner on 1 of 1 attempts that carry one (1 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (T006 acceptance on main after #443 and #442)

- **Set-up:** the API at `e9f6abcd` (main with #443, which stops the extractor taking a carousel for the listing, and #442, which asks T006 for ten links carrying `pf_rd_p` instead of prices) on 8787, with no access grant and no vendor, proxied. T006 alone with `--raw-html`, three runs about 30 s apart: `2026-10-12-t006-acceptance-{1,2,3}-e9f6abcd.md`. Runs 2 and 3 say the working tree had uncommitted changes. Those changes were the earlier runs' own record files, not source. The HTML of each read is kept in its run's git-ignored `pages/`.
- **Result:** all three reads are verified, `ready (verified)`. The region was held in 3.3–5.1 s. Each Markdown held 33,289 characters with 80 links carrying `pf_rd_p`. The extractor took Amazon's card deck (`div#gwm-Deck-btf`), not the hero carousel.
- **What the pages were:** the delivery location was Singapore on all three. As on every read that day, none had an `a-price` element. Each HTML is different, so these were three separate reads, not cache hits.
- **Compared with the same day's earlier reads at `7a35e000`** (`2026-10-12-t006-home-{1,2,3}-7a35e000.md`): all three were false successes there. Not tested: a direct read, another exit address, a signed-in session.
