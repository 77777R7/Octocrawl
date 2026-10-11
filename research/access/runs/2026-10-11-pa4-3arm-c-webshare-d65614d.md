# Access task set run: all, 2026-10-11

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T004,T013,T014,T025,T026,T031,T034,T038,T042,T043,T046,T047,T048,T049,T053,T060,T064,T068,T069,T071,T076 --record research/access/runs/2026-10-11-pa4-3arm-c-webshare-d65614d.md`
- Source commit: `d65614d7`
- Network: direct
- Target: the local Octocrawl API
- API: http://127.0.0.1:8800; access option: none
- Exit address: not recorded
- Run: 2026-10-11T15:11:45.951Z → 2026-10-11T15:17:14.747Z
- Tasks: 23 (set `all`, only T001, T002, T004, T013, T014, T025, T026, T031, T034, T038, T042, T043, T046, T047, T048, T049, T053, T060, T064, T068, T069, T071, T076); task file SHA-256 at fetch time: `cb4172278158579cb72ae79c155ac7e2eea7dc90849b4206db92213d612fb16c`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 4 | 1 | 13440 | 26101 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 4, not_loaded 1, not_extracted 0, not_served 18, unknown 0; region waits: 5 (held on 1)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- robots.txt (cold): disallowed on 4 (T013: unreachable, timeout, set aside; T049: rule /, set aside; T064: rule /, set aside; T076: unreachable, timeout, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 14413 | not_served (cloudflare_challenge) |
| T002 | cold | yes | success |  | 200 | http | http |  | 4515 | ready (verified) |
| T004 | cold | yes | success |  | 200 | http | http |  | 8444 | ready (verified) |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 16823 | not_served (timeout) |
| T014 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 22013 | not_served (http_error); region not held in 9574 ms |
| T025 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 21093 | not_served (bot_detected_generic); region not held in 9954 ms |
| T026 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 14463 | not_served (timeout) |
| T031 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 26101 | not_loaded (empty_unverified, little_text); region not held in 9933 ms |
| T034 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 17897 | not_served (bot_detected_generic) |
| T038 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13693 | not_served (bot_detected_generic) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 4346 | not_served (rate_limit) |
| T043 | cold | yes | success |  | 200 | http | http |  | 7428 | ready (verified) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13995 | not_served (bot_detected_generic) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13773 | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 12515 | not_served (cloudflare_challenge) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 12517 | not_served (bot_detected_generic) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches | 11348 | not_served (bot_detected_generic) |
| T060 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 32032 | not_served (checks_failed, region_absent); region not held in 9801 ms |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 13440 | not_served (login_wall) |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 12445 | not_served (bot_detected_generic) |
| T069 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 13206 | ready (verified); region held in 649 ms |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 9476 | not_served (cloudflare_challenge) |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin | 12800 | not_served (cloudflare_challenge) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (4 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes

- Arm C of the paid-configuration experiment (the draft of 2026-10-11): the same 23 tasks as [D](2026-10-11-pa4-3arm-d-control-e3b9d37.md) (1 verified), [A](2026-10-11-pa4-3arm-a-residential-e3b9d37.md) (3) and [B](2026-10-11-pa4-3arm-b-residential-solve-6021174.md) (2), with the configuration of the 2026-10-09 residential run ([2026-10-09-pa9-w1-octocrawl-best-residential-094c6d6.md](2026-10-09-pa9-w1-octocrawl-best-residential-094c6d6.md)): a `standard` grant naming `compatible_transport` and `egress_sessions`, `W2L_EGRESS_PROXIES` set to the operator's rotating US residential gateway (Webshare, `p.webshare.io:80`, a new household address per connection), no provider, and no forward proxy on the API, so every page left through the gateway (all 23 attempts record egress `p.webshare.io:80`; the "Network: direct" line is the driver's own environment). The other three arms' local rungs left through the machine's forward proxy, a data-centre exit (`103.142.140.x`), and their provider rung through Steel. Code `d65614d7` (main with the three records merged); `tasks.v1.json` as in B.
- Result: 4 verified, the most of the four arms, with no paid call: T002 and T004 over plain HTTP (both failed in every other arm: a Cloudflare challenge and a connection error, each through the data-centre exit), T043 over plain HTTP (verified through Steel's residential proxy in A and B), T069 on the local browser (verified through Steel's proxy in B). 1 false success (T060, as in every arm). The 5 Cloudflare challenges and the bot checks stood again, as they did in the 2026-10-09 run through the same gateway.
- Reading: on these 23 tasks the operator's own residential gateway on the local rungs did what Steel's residential proxy did (T043) and more (T002, T004), at the gateway's bandwidth price ($3.50 per GB on this plan against Steel's $10) and with no session time. The bytes through the gateway are not measured by Octocrawl (`egressCostUsd` stays unknown); Webshare's dashboard has them. Four arms, 1, 3, 2 and 4 verified: the sites' day-to-day variance is of the same size as the differences, so none of this is isolated, but the direction is the one the 2026-10-09 run gave: the exit is not the main barrier (18 of 23 still `not_served`), and where it matters, the operator's own gateway is the cheaper way to change it.
- Cost of the four arms on the providers' figures: D $0.010 (Steel time), A $0.476, B $0.448, C $0 to Steel and an unmeasured gateway bandwidth (a Webshare GB is $3.50; 23 pages are well under one).
