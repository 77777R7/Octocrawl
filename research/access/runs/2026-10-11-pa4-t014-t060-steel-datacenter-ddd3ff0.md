# Access task set run: all, 2026-10-11

- Command: `node research/access/run-set.mjs --set all --only T014,T060 --access "enhanced" --record research/access/runs/2026-10-11-pa4-t014-t060-steel-datacenter-ddd3ff0.md`
- Source commit: `ddd3ff03`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8796; access option: `"enhanced"`
- Exit address: not recorded
- Run: 2026-10-11T13:33:53.136Z → 2026-10-11T13:34:59.997Z
- Tasks: 2 (set `all`, only T014, T060); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 2 | 0 | 1 | 45813 | 45813 | unknown | unknown |

- Paid provider calls (cold): 2; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0014 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 0, not_loaded 0, not_extracted 0, not_served 2, unknown 0; region waits: 1 (held on 0)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T014 | cold | no | failed | http_error | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 21044 | steel: failed/http_error (answer) | not_served (http_error) |
| T060 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → provider | markdownCountMin | 45813 | steel: success | not_served (checks_failed, region_absent); region not held in 9907 ms |
- Task contract (cold): the product's verification agreed with the runner on 2 of 2 attempts that carry one (0 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes

This run tests whether a US egress gives T014 (Home Depot) and T060 (Nasdaq). Firecrawl verified both in item 9's first window; Octocrawl's local exit and Steel had not.

- **Steel's exit without its proxy:** a Steel session opened by `w2l-provider --vendor steel https://ipinfo.io/json` on 2026-10-11 read US, Ashburn, Virginia, AS30081 CacheFly. So the Steel calls of earlier runs already went out from a US datacenter address.
- **Here, under a grant without `vendor_residential_proxy`:** neither task was verified.
  - T014: `failed`/`http_error`.
  - T060: `success` without its data.
  - 2 paid calls, $0.0014.
