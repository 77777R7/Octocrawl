# Access task set run: all, 2026-10-11

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T004,T013,T014,T025,T026,T031,T034,T038,T042,T043,T046,T047,T048,T049,T053,T060,T064,T068,T069,T071,T076 --access "enhanced" --record research/access/runs/2026-10-11-pa4-3arm-a-residential-e3b9d37.md`
- Source commit: `cafd2207`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8798; access option: `"enhanced"`
- Exit address: 103.142.140.152
- Run: 2026-10-11T13:32:34.341Z → 2026-10-11T13:42:47.222Z
- Tasks: 23 (set `all`, only T001, T002, T004, T013, T014, T025, T026, T031, T034, T038, T042, T043, T046, T047, T048, T049, T053, T060, T064, T068, T069, T071, T076); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 3 | 3 | 24543 | 57951 | unknown | unknown |

- Paid provider calls (cold): 16; tasks verified with a paid call's page as the answer: 2; charged by the spend ledger: $0.1504 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill); bytes through the provider's proxy, as it reported them: 13723590

- Readiness (cold, ADR 0007): ready 3, not_loaded 1, not_extracted 1, not_served 18, unknown 0; region waits: 7 (held on 3)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): not_extracted on T026 (provider, steel); robots_override on T049 (provider, steel), T064 (provider, steel)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 23713 | steel: blocked/cloudflare_challenge [0 B US] (answer) | not_served (cloudflare_challenge) |
| T002 | cold | no | blocked | cloudflare_challenge | 200 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 24403 | steel: blocked/cloudflare_challenge [0 B US] (answer) | not_served (cloudflare_challenge) |
| T004 | cold | no | failed | connection_error |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 30551 |  | not_served (connection_error) |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 10505 |  | not_served (timeout) |
| T014 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 40574 | steel: success [5207639 B US] (answer) | not_served (checks_failed, region_absent); region not held in 8428 ms |
| T025 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 63731 | steel: failed/empty_unverified [0 B US] (answer) | not_loaded (empty_unverified, little_text); region not held in 11973 ms |
| T026 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownMatches | 9731 |  | not_extracted (checks_failed, region_ready); region held in 762 ms |
| T031 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 57214 | steel: success [0 B US] (answer) | ready (verified); region held in 7315 ms |
| T034 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 29242 | steel: blocked/bot_detected_generic [0 B US] (answer) | not_served (bot_detected_generic) |
| T038 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 34304 | steel: blocked/bot_detected_generic [0 B US] (answer) | not_served (bot_detected_generic) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1467 |  | not_served (rate_limit) |
| T043 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 45550 | steel: success [7196538 B US] (answer) | ready (verified); region not held in 5934 ms |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 24528 | steel: blocked/bot_detected_generic [0 B US] (answer) | not_served (bot_detected_generic) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 26014 | steel: blocked/cloudflare_challenge [1046012 B US] (answer) | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 25110 | steel: blocked/cloudflare_challenge [0 B US] (answer) | not_served (cloudflare_challenge) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2716 |  | not_served (bot_detected_generic) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 25274 | steel: blocked/bot_detected_generic [273401 B US] (answer) | not_served (bot_detected_generic) |
| T060 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → provider | markdownCountMin | 57951 | steel: success [0 B US] | not_served (checks_failed, region_absent); region not held in 9813 ms |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2422 |  | not_served (login_wall) |
| T068 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4758 |  | ready (verified); region held in 1060 ms |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 24543 | steel: blocked/cloudflare_challenge [0 B US] (answer) | not_served (cloudflare_challenge) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23548 | steel: blocked/cloudflare_challenge [0 B US] (answer) | not_served (cloudflare_challenge) |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 24333 | steel: blocked/cloudflare_challenge [0 B US] (answer) | not_served (cloudflare_challenge) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (3 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes

- Arm A of the paid-configuration experiment (the draft of 2026-10-11): the same 23 tasks as the control run ([2026-10-11-pa4-3arm-d-control-e3b9d37.md](2026-10-11-pa4-3arm-d-control-e3b9d37.md), 1 verified, 1 false success, 17 paid calls, $0.0104), with one change: the grant also names `vendor_residential_proxy`, so every Steel session was created with `useProxy: { geolocation: { country: "US" } }` under a tariff of $10 per GB and at most 20 MB per call (grant SHA-256 `863df2602fabe961…`, `W2L_VENDOR_PROXY_COUNTRY=US`). Same code (`e3b9d372`), same machine, same forward proxy for the local rungs, one task at a time.
- Against the control: verified 1 → 3 (T043 on Steel's page through the residential proxy; T068 on the local browser, so not the proxy's; T031 both times), false successes 1 → 3 (T014 on Steel's page, T026 on the local browser, T060 both times). The 7 Cloudflare challenges and the 4 generic bot checks Steel met in the control it met again through the residential proxy; T001 and T038 changed their reason, not their outcome.
- **The `proxyBytes` of 12 of the 16 paid calls are wrong, and so is the ledger's charge.** Steel fills a session's `proxyBytesUsed` some time after its release; the adapter read it once, right after the release was confirmed, and took the 0 it got as the figure. The ledger therefore charged $0.1504 where the tariff on Steel's own figures comes to $0.4760. Steel's session list (`GET /v1/sessions`, read at 13:45Z) for the run's window holds 21 sessions: 18 with `proxySource: steel`, of which 2 (44,996 ms and 38,200 ms, created 13:35:21Z and 13:36:21Z) belong to another window's run of T014 and T060 under a copy of this grant, as that window reported, and match none of this run's calls; the other 16 are this run's 16 calls' sessions, every one `released` on request. Their `proxyBytesUsed`: 46,311,726 bytes in all, p50 2,059,338, p95 7,196,538, max 14,497,491; their `duration`: 462,919 ms. At the tariff: $0.4631 for bandwidth and $0.0129 for time. The calls whose figure was 0 at the read: T001, T002, T025, T031, T034, T038, T046, T048, T060, T069, T071, T076. Fixed after this run (the adapter reads again until the figure comes, and records null, priced at the ceiling's allowance, when it does not).
- Cost: $0.4760 on Steel's figures for 2 tasks verified with a paid call's page, against $0.0104 for 1 in the control. The bandwidth is 97% of it; the p95 of 7.2 MB per session puts the draft's 20 MB cap at about 2.8 times that, with the largest session at 14.5 MB.
- Not isolated: which of the exit, the stealth configuration (`vendor_stealth` was in both grants; Steel's plans page shows Stealth browser as not included on Launch) or the day's state of each site made the difference, as with every run through the product.
