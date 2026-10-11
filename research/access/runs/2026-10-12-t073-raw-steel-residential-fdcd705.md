# Access task set run: all, 2026-10-11

- Command: `node research/access/run-set.mjs --set all --only T073 --access "enhanced" --raw-html --record research/access/runs/2026-10-12-t073-raw-steel-residential-fdcd705.md`
- Source commit: `fdcd705f` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8797; access option: `"enhanced"`
- Exit address: not recorded
- Run: 2026-10-11T17:23:14.254Z → 2026-10-11T17:23:47.260Z
- Tasks: 1 (set `all`, only T073); task file SHA-256 at fetch time: `cb4172278158579cb72ae79c155ac7e2eea7dc90849b4206db92213d612fb16c`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 1 | 1 | 0 | 33002 | 33002 | unknown | unknown |

- Paid provider calls (cold): 1; tasks verified with a paid call's page as the answer: 1; charged by the spend ledger: $0.0547 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill); bytes through the provider's proxy, as it reported them: 5389895

- Readiness (cold, ADR 0007): ready 1, not_loaded 0, not_extracted 0, not_served 0, unknown 0; region waits: 1 (held on 1)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- robots.txt (cold): disallowed on 0

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T073 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 33002 | steel: success [5389895 B US] (answer) | ready (verified); region held in 4908 ms |
- Task contract (cold): the product's verification agreed with the runner on 1 of 1 attempts that carry one (1 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (T073 through Steel's US residential proxy, with its raw HTML)

- **Set-up:** the API at `fdcd705` on 8797, with `W2L_VENDORS=steel` and the residential grant Howard signed on 2026-10-11 (the `suspicious-jemison` worktree's `steel-grant-residential.json`, SHA-256 `863df2602fab…`: `vendor_remote_browser`, `vendor_stealth`, `vendor_residential_proxy`; a run budget of $5 and a per-request budget of $0.30). The proxy country was the default, US. Proxied, `--raw-html`.
- **Answer:** verified on Steel's page, with 7,410 characters of Markdown and readiness `ready`. Its region held in 4.9 s with no scroll. One paid call, $0.0547 by the ledger, and 5,389,895 bytes through Steel's proxy.
- **What the HTML shows** (201,036 bytes, kept in the run's git-ignored `pages/`): no DataDome mark, "Popular events" holding Metallica and other cards, and 8 "events near" lines.
- **Runs before this one, the same minute:**
  - **`--access enhanced` unquoted:** the runner refused it as JSON before any request.
  - **The API without `W2L_VENDORS`, so no provider rung was built:** T073 was `blocked` (`bot_detected_generic`) on the local browser, with no paid call (run `2026-10-11T17-22-23-057Z`, its record not kept). A direct scrape with `debug` showed the ladder end at `browser_local` for the same reason.
  - The local exit had passed DataDome once that day (`2026-10-12-t073-raw-standard-fdcd705.md`) and was blocked from then on.
