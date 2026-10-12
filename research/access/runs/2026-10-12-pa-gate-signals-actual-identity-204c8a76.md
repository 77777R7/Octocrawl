# Access task set run: all, 2026-10-12

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --save-responses --record research/access/runs/2026-10-12-pa-gate-signals-actual-identity-204c8a76.md`
- Source commit: `204c8a76` (working tree had uncommitted changes)
- Network: direct
- Target: the local Octocrawl API
- API: http://127.0.0.1:8800; access option: none
- Exit address: not recorded
- Run: 2026-10-12T04:42:14.375Z → 2026-10-12T04:45:06.214Z
- Tasks: 16 (set `all`, only T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008); task file SHA-256 at fetch time: `cb4172278158579cb72ae79c155ac7e2eea7dc90849b4206db92213d612fb16c`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 16 | 2 | 0 | 11398 | 13210 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 2, not_loaded 0, not_extracted 0, not_served 14, unknown 0; region waits: 1 (held on 1)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- robots.txt (cold): disallowed on 2 (T049: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 12600 | not_served (cloudflare_challenge) |
| T002 | cold | yes | success |  | 200 | http | http |  | 5706 | ready (verified) |
| T005 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 12655 | not_served (bot_detected_generic) |
| T034 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 7205 | not_served (bot_detected_generic) |
| T038 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13210 | not_served (bot_detected_generic) |
| T045 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 11600 | not_served (bot_detected_generic) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 11398 | not_served (bot_detected_generic) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 11588 | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 10819 | not_served (cloudflare_challenge) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 12872 | not_served (bot_detected_generic) |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 12063 | ready (verified); region held in 524 ms |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 10223 | not_served (cloudflare_challenge) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 9230 | not_served (cloudflare_challenge) |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin | 9960 | not_served (cloudflare_challenge) |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 11011 | not_served (cloudflare_challenge) |
| B008 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 9671 | not_served (http_error) |
- Task contract (cold): the product's verification agreed with the runner on 16 of 16 attempts that carry one (2 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes

- G2 of [docs/pa-challenge-botcheck-tasks.md](../../../docs/pa-challenge-botcheck-tasks.md): the 16 tasks of G1's set through the product in arm C's configuration (the operator's residential gateway on the local rungs, no provider, no forward proxy) with `W2L_BROWSER_IDENTITY=actual` (#431): the public browser rung sends the browser's own identity (`HeadlessChrome/151.0.7922.34`, Chromium's own client hints, no CDP override) and declares it. The same configuration with the declared identity is [the standard round](2026-10-12-pa-gate-signals-standard-56f9a0d1.md) of 2026-10-11 UTC (through the forward proxy) and arm C of 2026-10-11 (through the gateway, T053 and T002 among its 23: T002 verified, T053 refused).
- Result: 2 verified, 0 false successes. **T053 (imf.org) verified, and again in two more scrapes right after (3 of 3)**, where every run of the product with the declared identity through the same gateway was refused with Akamai's 403 ([isolation](2026-10-12-t053-identity-204c8a76.md)). T002 verified over plain HTTP, the gateway's doing, as in arm C. Every `identity_declared` on the browser rung says `identity: actual` with the HeadlessChrome User-Agent; no `identity_mismatch`.
- The other 14: unchanged in kind. The 7 Cloudflare tasks stood (`cf-mitigated` or the "Attention required" page), the 6 DataDome tasks stood (`x-datadome`), so an honest identity moves neither; B008 (imdb) answered a 403 with no wording the gate names, so the product called it `http_error` rather than a bot check: the same refusal, read differently.
- Not isolated beyond T053: one site, one day, one exit. What the switch costs on sites that refuse `HeadlessChrome` by name is the A/B on item 1's 92 tasks and the health batches that the task list's G2 and G3 ask for before any default changes.
