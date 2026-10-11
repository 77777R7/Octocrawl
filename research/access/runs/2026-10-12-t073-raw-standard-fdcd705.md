# Access task set run: all, 2026-10-11

- Command: `node research/access/run-set.mjs --set all --only T073 --raw-html --record research/access/runs/2026-10-12-t073-raw-standard-fdcd705.md`
- Source commit: `fdcd705f`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8797; access option: none
- Exit address: not recorded
- Run: 2026-10-11T17:20:48.580Z → 2026-10-11T17:21:02.239Z
- Tasks: 1 (set `all`, only T073); task file SHA-256 at fetch time: `cb4172278158579cb72ae79c155ac7e2eea7dc90849b4206db92213d612fb16c`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 1 | 0 | 1 | 13656 | 13656 | unknown | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 0, not_loaded 0, not_extracted 0, not_served 1, unknown 0; region waits: 1 (held on 0; scrolled on 1, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T073 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownMatches | 13656 | not_served (checks_failed, region_absent); region not held in 9772 ms, 17 screens scrolled |
- Task contract (cold): the product's verification agreed with the runner on 1 of 1 attempts that carry one (0 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (T073: the navigation shell, with its raw HTML)

- **Set-up:** the API at `fdcd705` on 8797, with no access grant and no vendor, proxied. T073 alone, with `--raw-html`. The page's HTML is kept in the run's git-ignored `pages/` (93,608 bytes), not here.
- **Answer:** `success` with 946 characters of Markdown: the header's navigation and account links, no event, and the date check failed. This is the shell the 92-task residential run at `cd9d9e7c` (#412) recorded, and the account menu of `2026-10-11-t073-cardlist-d9e6304.md`.
- **What the HTML shows:**
  - **A DataDome challenge laid over the rendered page:** a `ddChallengeContainer` div fixed over the whole viewport at the topmost z-index, holding an iframe from `geo.captcha-delivery.com/interstitial/`.
  - **StubHub's own page under it:** "Popular events" set to Singapore and "Trending events near Singapore", both with no event in them.
- **Not the region's lack of events:** StubHub's home read in Howard's Chrome the same day, also in Singapore, has no DataDome mark, and its "Popular events" holds Metallica and other cards. So the empty events here are taken to be DataDome withholding the page's data, not a Singapore without events. That is inferred: which requests DataDome refused was not recorded.
- **Why it reads as `success`:** the gate knows DataDome by its response headers (`x-datadome`, `x-datadome-cid`), not by this challenge laid over a page that has content. Without a task contract, the shell is a false success.
