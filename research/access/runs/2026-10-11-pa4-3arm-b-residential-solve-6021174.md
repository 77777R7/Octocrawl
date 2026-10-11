# Access task set run: all, 2026-10-11

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T004,T013,T014,T025,T026,T031,T034,T038,T042,T043,T046,T047,T048,T049,T053,T060,T064,T068,T069,T071,T076 --access "enhanced" --record research/access/runs/2026-10-11-pa4-3arm-b-residential-solve-6021174.md`
- Source commit: `60211740`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8799; access option: `"enhanced"`
- Exit address: 103.142.140.152
- Run: 2026-10-11T14:06:31.117Z → 2026-10-11T14:16:40.540Z
- Tasks: 23 (set `all`, only T001, T002, T004, T013, T014, T025, T026, T031, T034, T038, T042, T043, T046, T047, T048, T049, T053, T060, T064, T068, T069, T071, T076); task file SHA-256 at fetch time: `cb4172278158579cb72ae79c155ac7e2eea7dc90849b4206db92213d612fb16c`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 2 | 1 | 25297 | 42932 | unknown | unknown |

- Paid provider calls (cold): 17; tasks verified with a paid call's page as the answer: 2; charged by the spend ledger: $0.4844 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill); bytes through the provider's proxy, as it reported them: 43688165; solves it reported: unknown

- Readiness (cold, ADR 0007): ready 2, not_loaded 3, not_extracted 0, not_served 18, unknown 0; region waits: 6 (held on 0)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): robots_override on T049 (provider, steel), T064 (provider, steel)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 24382 | steel: blocked/cloudflare_challenge [300721 B US, 0 solved] (answer) | not_served (cloudflare_challenge) |
| T002 | cold | no | blocked | cloudflare_challenge | 200 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 32180 | steel: blocked/cloudflare_challenge [2069033 B US, unknown solved] (answer) | not_served (cloudflare_challenge) |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40237 |  | not_served (timeout) |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 11011 |  | not_served (timeout) |
| T014 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 34695 | steel: failed/empty_unverified [544281 B US, 0 solved] (answer) | not_loaded (empty_unverified, little_text); region not held in 9525 ms |
| T025 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 40358 | steel: failed/empty_unverified [12785765 B US, 0 solved] (answer) | not_loaded (empty_unverified, little_text); region not held in 9199 ms |
| T026 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 12056 |  | not_served (timeout) |
| T031 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → provider | markdownCountMin, markdownMatches | 34972 | steel: failed/provider_error [2582580 B US, 0 solved] | not_loaded (empty_unverified, little_text); region not held in 9890 ms |
| T034 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 34553 | steel: blocked/bot_detected_generic [2482653 B US, unknown solved] (answer) | not_served (bot_detected_generic) |
| T038 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 24556 | steel: blocked/bot_detected_generic [2385800 B US, unknown solved] (answer) | not_served (bot_detected_generic) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1340 |  | not_served (rate_limit) |
| T043 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 39285 | steel: success [7162035 B US, 0 solved] (answer) | ready (verified); region not held in 5307 ms |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23558 | steel: blocked/bot_detected_generic [650792 B US, 0 solved] (answer) | not_served (bot_detected_generic) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 22961 | steel: blocked/cloudflare_challenge [303446 B US, 0 solved] (answer) | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 18949 | steel: blocked/cloudflare_challenge [367789 B US, unknown solved] (answer) | not_served (cloudflare_challenge) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2766 |  | not_served (bot_detected_generic) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 25297 | steel: blocked/bot_detected_generic [272020 B US, 0 solved] (answer) | not_served (bot_detected_generic) |
| T060 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → provider | markdownCountMin | 59971 | steel: success [2960201 B US, 0 solved] | not_served (checks_failed, region_absent); region not held in 9931 ms |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2244 |  | not_served (login_wall) |
| T068 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 28908 | steel: blocked/bot_detected_generic [430583 B US, 0 solved] (answer) | not_served (bot_detected_generic) |
| T069 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 42932 | steel: success [5753335 B US, 0 solved] (answer) | ready (verified); region not held in 5768 ms |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17741 | steel: blocked/cloudflare_challenge [442236 B US, 0 solved] (answer) | not_served (cloudflare_challenge) |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 33723 | steel: blocked/cloudflare_challenge [2194895 B US, 0 solved] (answer) | not_served (cloudflare_challenge) |
- Task contract (cold): the product's verification agreed with the runner on 23 of 23 attempts that carry one (2 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes

- Arm B of the paid-configuration experiment (the draft of 2026-10-11): the same 23 tasks as the control ([D](2026-10-11-pa4-3arm-d-control-e3b9d37.md): 1 verified, 1 false success, 17 paid calls) and as arm A ([A](2026-10-11-pa4-3arm-a-residential-e3b9d37.md): 3 verified, 3 false successes, 16 paid calls), the grant naming `vendor_residential_proxy` and `vendor_captcha_solving` (SHA-256 `598b16638d38f5d0…`, `W2L_VENDOR_PROXY_COUNTRY=US`): every Steel session was created with the US residential proxy, `solveCaptcha: true` and `stealthConfig.autoCaptchaSolving: true`, under $10 per GB (at most 20 MB per call) and $3 per 1,000 solves (3 allowed for per call). The code is `60211740`, main `032fd7b9` with #397 (the late read of `proxyBytesUsed`) and the two records on top; `tasks.v1.json` changed between the arms only in T073 (#392), which is not in the set.
- Against the control and arm A: 2 verified (T043, as in A, and T069; T068 and T031, verified in A, were not), 1 false success (T060, as in both; T014 and T026 were not). The 7 Cloudflare challenges and the generic bot checks stood again. On the 13 sessions whose solves Steel reported, it solved nothing: these pages set no CAPTCHA Steel's solver takes (its captchas status for tripadvisor: `isSolvingCaptcha: false, tasks: []`); the block is the challenge page or the bot check itself. The three arms together: 1, 3 and 2 verified, with different members each time, which is the day's variance on these sites, not a configuration's effect; the only task the residential proxy verified twice is T043.
- Reconciliation against Steel's session list (`GET /v1/sessions`, read at 14:18Z), the run's window 14:06:31–14:16:41Z: 17 sessions, every one with `proxySource: steel`, `solveCaptcha: true` and released on request; `proxyBytesUsed` 43,688,165 bytes in all (p50 2,069,033, p95 7,162,035, max 12,785,765), the same figure the record's 17 calls carry (#397's late read held); `duration` 408,032 ms. At the tariff: $0.4369 for bandwidth and $0.0113 for time, $0.4482. The ledger charged $0.4844: the $0.0360 above Steel's figures is the 4 calls (T002, T034, T038, T048) whose solves read null and were priced at the allowance of 3. Why null: Steel's `GET /v1/sessions/{id}/captchas/status` answers 404 ("Session not found") some time after a release; the adapter asks after the release. The count has to be read before it. Fixed after this run.
- Another window sent four standard-access scrapes (T001–T004, no provider) to this run's API by mistake at 14:11:53–14:12:00Z; they made no paid call and are not in this record, and the sites they read had been read by this run minutes before and were not read again. They shared the machine's browser and CPU with this run for those eight seconds.
- Cost of the three arms on Steel's figures: $0.0103 (D), $0.476 (A) and $0.448 (B) for 1, 3 and 2 verified; bandwidth is 97% of A's and B's. Not isolated, as with every run through the product.
