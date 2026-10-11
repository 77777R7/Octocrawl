# Access task set run: all, 2026-10-11

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T004,T013,T014,T025,T026,T031,T034,T038,T042,T043,T046,T047,T048,T049,T053,T060,T064,T068,T069,T071,T076 --access "enhanced" --record research/access/runs/2026-10-11-pa4-3arm-d-control-e3b9d37.md`
- Source commit: `e3b9d372`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8797; access option: `"enhanced"`
- Exit address: 103.142.140.152
- Run: 2026-10-11T13:20:51.549Z → 2026-10-11T13:29:32.155Z
- Tasks: 23 (set `all`, only T001, T002, T004, T013, T014, T025, T026, T031, T034, T038, T042, T043, T046, T047, T048, T049, T053, T060, T064, T068, T069, T071, T076); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 1 | 1 | 21538 | 48061 | unknown | unknown |

- Paid provider calls (cold): 17; tasks verified with a paid call's page as the answer: 1; charged by the spend ledger: $0.0104 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 1, not_loaded 1, not_extracted 0, not_served 21, unknown 0; region waits: 3 (held on 1)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): robots_override on T049 (provider, steel), T064 (provider, steel)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 22768 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T002 | cold | no | blocked | cloudflare_challenge | 200 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 22188 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 30786 |  | not_served (connection_error) |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 11031 |  | not_served (timeout) |
| T014 | cold | no | failed | provider_error |  | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19807 | steel: failed/provider_error (answer) | not_served (provider_error) |
| T025 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 45319 | steel: failed/empty_unverified (answer) | not_loaded (empty_unverified, little_text); region not held in 6023 ms |
| T026 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 12508 |  | not_served (timeout) |
| T031 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 48061 | steel: success (answer) | ready (verified); region held in 7350 ms |
| T034 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 35739 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23064 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1872 |  | not_served (rate_limit) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 25298 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20121 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20639 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 20003 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2840 |  | not_served (bot_detected_generic) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 21672 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T060 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → provider | markdownCountMin | 50036 | steel: success | not_served (checks_failed, region_absent); region not held in 9942 ms |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2021 |  | not_served (login_wall) |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 22158 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 21538 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 21372 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 19096 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (1 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
