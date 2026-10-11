# Access task set run: all, 2026-10-11

- Command: `node research/access/run-set.mjs --set all --only T014,T060 --access "enhanced" --record research/access/runs/2026-10-11-pa4-t014-t060-steel-residential-us-ddd3ff0.md`
- Source commit: `ddd3ff03` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8796; access option: `"enhanced"`
- Exit address: not recorded
- Run: 2026-10-11T13:35:18.117Z → 2026-10-11T13:36:59.970Z
- Tasks: 2 (set `all`, only T014, T060); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 2 | 0 | 2 | 54627 | 54627 | unknown | unknown |

- Paid provider calls (cold): 2; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0023 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill); bytes through the provider's proxy, as it reported them: 0

- Readiness (cold, ADR 0007): ready 0, not_loaded 1, not_extracted 0, not_served 1, unknown 0; region waits: 2 (held on 0)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T014 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 47221 | steel: success [0 B US] (answer) | not_loaded (checks_failed, region_not_ready, page_still_changing); region not held in 8578 ms |
| T060 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → provider | markdownCountMin | 54627 | steel: success [0 B US] | not_served (checks_failed, region_absent); region not held in 9893 ms |
- Task contract (cold): the product's verification agreed with the runner on 2 of 2 attempts that carry one (0 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes

The same two tasks under a grant naming `vendor_residential_proxy` (Howard's attestation of 2026-10-11), with Steel's residential proxy asked for in the US. The datacenter run just before is `2026-10-11-pa4-t014-t060-steel-datacenter-ddd3ff0.md`.

- **Results:** neither task was verified. Both answered `success` without their data. The product's verification agreed with the runner on both.
- **Paid calls:** both record `proxyCountry: "US"` and `proxyBytes: 0`. The 0 is a reading made too early, not the bytes used.
  - #388's author: Steel fills a session's `proxyBytesUsed` only some time after its release, and the ledger reads it at once. A fix is to follow.
  - Steel's session list (`GET /v1/sessions`), read at about 13:45Z: every session created while this run's tasks reached Steel (13:35:18Z to 13:38Z) has `proxySource: steel`, the residential proxy, with 0.4 to 7.2 MB used.
  - Another run used Steel under a residential grant in the same minutes, so which two sessions are this run's is not attributed, and neither are their bytes.
  - This run's grant asked for the proxy on every Steel session. So its two sessions went out through Steel's US residential proxy.
- **T014:** Steel's page is the Drills category landing page, 2,840 characters, the same length as in the 2026-10-11 ladder run. Its readiness is `not_loaded` (`page_still_changing`).
- **T060:** Steel's page was not the answer. The local browser's page, "Historical Data is currently not available", was kept.
