# Access task set run: all, 2026-10-10

- Command: `node research/access/run-set.mjs --set all --access "enhanced" --record research/access/runs/2026-10-10-pa4-steel-all-measured-d5d6c2c.md`
- Source commit: `d5d6c2ca`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8792; access option: `"enhanced"`
- Exit address: 103.142.140.137
- Run: 2026-10-10T04:16:46.037Z → 2026-10-10T04:31:27.540Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 51 | 11 | 5611 | 23542 | unknown | unknown |

- Paid provider calls (cold): 32; tasks verified with a paid call's page as the answer: 7; charged by the spend ledger: $0.0140 (a provider that states no price is charged its sessions' measured time under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 19409 | steel: blocked/cloudflare_challenge (answer) |
| T002 | cold | no | blocked | cloudflare_challenge | 200 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 16784 | steel: blocked/cloudflare_challenge (answer) |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 15103 | steel: success (answer) |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40278 |  |
| T005 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19755 | steel: blocked/bot_detected_generic (answer) |
| T006 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 5492 |  |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 1794 |  |
| T008 | cold | yes | success |  | 200 | http | http |  | 1973 |  |
| T009 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3516 |  |
| T010 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 22932 | steel: success (answer) |
| T011 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 18923 | steel: success (answer) |
| T012 | cold | no | blocked | captcha | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 22492 | steel: blocked/captcha (answer) |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 11024 |  |
| T014 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 19280 | steel: success (answer) |
| T015 | cold | yes | success |  | 200 | http | http |  | 2109 |  |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6000 |  |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6250 |  |
| T018 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 9531 |  |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 5827 |  |
| T020 | cold | yes | success |  | 200 | http | http |  | 3763 |  |
| T021 | cold | no | failed | http_error | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17103 | steel: failed/http_error (answer) |
| T022 | cold | yes | success |  | 200 | http | http |  | 2370 |  |
| T023 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17699 | steel: success (answer) |
| T024 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6437 |  |
| T025 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23542 | steel: failed/empty_unverified (answer) |
| T026 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownMatches | 9040 |  |
| T027 | cold | yes | success |  | 200 | http | http |  | 3434 |  |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 2658 |  |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 20972 | steel: success (answer) |
| T031 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4079 |  |
| T033 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 1675 |  |
| T034 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 30184 | steel: blocked/bot_detected_generic (answer) |
| T035 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3870 |  |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7710 |  |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 681 |  |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 21623 | steel: blocked/bot_detected_generic (answer) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4330 |  |
| T040 | cold | yes | success |  | 200 | http | http |  | 1165 |  |
| T041 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5611 |  |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1416 |  |
| T043 | cold | no | blocked | bot_detected_generic | 405 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16583 | steel: blocked/bot_detected_generic (answer) |
| T044 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6282 |  |
| T045 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17500 | steel: blocked/bot_detected_generic (answer) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17797 | steel: blocked/bot_detected_generic (answer) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16022 | steel: blocked/cloudflare_challenge (answer) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 15117 | steel: blocked/cloudflare_challenge (answer) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2971 |  |
| T050 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 16915 | steel: success (answer) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4535 |  |
| T052 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5656 |  |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 18228 | steel: blocked/bot_detected_generic (answer) |
| T055 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 34547 | steel: success (answer) |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2857 |  |
| T057 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3868 |  |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4375 |  |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2939 |  |
| T060 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 3684 |  |
| T061 | cold | yes | success |  | 200 | http | http |  | 2803 |  |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4984 |  |
| T063 | cold | yes | success |  | 200 | http | http |  | 1165 |  |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2079 |  |
| T065 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 27099 | steel: success (answer) |
| T066 | cold | no (false success) | success |  | 200 | http | http → browser_local | markdownCountMin | 4685 |  |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2480 |  |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 20323 | steel: blocked/cloudflare_challenge (answer) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 12971 | steel: blocked/cloudflare_challenge (answer) |
| T070 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 16069 | steel: success (answer) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 13715 | steel: blocked/cloudflare_challenge (answer) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3715 |  |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4548 |  |
| T074 | cold | yes | success |  | 200 | http | http → browser_local → provider |  | 18396 | steel: blocked/cloudflare_challenge |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4257 |  |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 13465 | steel: blocked/cloudflare_challenge (answer) |
| T077 | cold | yes | success |  | 200 | http | http |  | 1093 |  |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1500 |  |
| T079 | cold | no (false success) | success |  | 200 | http | http | markdownMatches | 2488 |  |
| T080 | cold | yes | success |  | 200 | http | http |  | 2151 |  |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1214 |  |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18559 | steel: blocked/cloudflare_challenge (answer) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6589 |  |
| B003 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 20268 | steel: failed/empty_unverified (answer) |
| B004 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 15877 | steel: success (answer) |
| B005 | cold | yes | success |  | 200 | http | http |  | 3671 |  |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4654 |  |
| B007 | cold | yes | success |  | 200 | http | http |  | 3763 |  |
| B008 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3236 |  |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 774 |  |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6415 |  |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3625 |  |
| B012 | cold | yes | success |  | 200 | http | http |  | 1113 |  |
| B013 | cold | yes | success |  | 200 | http | http |  | 1902 |  |
| B014 | cold | yes | success |  | 200 | http | http |  | 972 |  |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (each paid call charged by its sessions' measured time)

**Set-up.**
- **Grant.** The Steel grant was edited on 2026-10-10 at Howard's choice. Its tariff now bills by the millisecond (`minBilledMs` 1, `billingIncrementMs` 1), where it had billed by the minute, at least one (60000, 60000). Nothing else changed: the price per hour, `maxSessionMs` 120000, the budget and the attestation.
  - The reason is Steel's own bill. Its dashboard billed $0.23 for 483 sessions over the 24 hours before, which is 137 browser minutes, about 17 s a session. With every session rounded up to a minute it would have been at least 483 minutes.
  - Steel's docs say browser time is "billed by the minute, rounded up", and do not say whether the rounding is per session.
  - Grant SHA-256: `67acb9bc515429e9c1258253f2da648bea1738a41dbcd77c8455526b323cd239`, where it was `b2e32cb8…`. The ceiling per call is unchanged, $0.00333.
- **Code.** The server ran at this record's commit on `claude/measured-session-spend`. That branch is from main `c3e1383` and does not hold #345, merged after it was cut, so this run is without the top-level-products and `<main>` rules.
- **How a call is charged.** Each call is charged what its Steel session's measured time costs under the tariff. The time runs from just before the session is created to Steel's confirmation of its release, at most the ceiling.

**The spend ledger:**
- **32 paid calls, all charged by measured time.** None fell back to the ceiling, so no release went unconfirmed.
- Their sessions lasted 10.9 to 25.7 s, 15.8 s on average.
- **The ledger charged $0.0140.** At the ceiling, as before this change, the same calls would have been charged $0.1067.
- **Run window:** 2026-10-10T04:16:45Z → 04:31:27Z, 12:16–12:31 at UTC+8. Steel's own figure for that hour on its dashboard is the check on this charge. It is not in this record.

**Compared with the run at `fdc924d`:**

| | Before | This run |
| --- | --- | --- |
| Verified, all 92 | 55 | 51 |
| Verified, frozen 50 | 20 | 15 |
| False successes | 7 | 11 |
| Paid calls | 34 | 32 |
| Ledger charge | $0.1133 (at the ceiling) | $0.0140 (measured) |

**What changed, and why:**
- **T023 and T043.** This branch does not hold #345.
  - T023 answered Sephora's header promotion again (94 characters).
  - T043 was `blocked` on Steel's page.
- **T006, T021 and T066: run-to-run variation.**
  - T006: Amazon's footer, a false success on the browser rung.
  - T021: eBay's error page through Steel.
  - T066: WSJ answered on the http lane, a false success.
- **Gained:** T031.
- **This change touches only how a call is charged and how a vendor session is released.** It changes no extraction, routing or gate code (`git diff origin/main...HEAD` holds none in `packages/extract-tf` or `gate.ts`).
