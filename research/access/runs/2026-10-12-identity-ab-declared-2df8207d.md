# Access task set run: all, 2026-10-12

- Command: `node research/access/run-set.mjs --set all --save-responses --record research/access/runs/2026-10-12-identity-ab-declared-2df8207d.md`
- Source commit: `2df8207d`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8797; access option: none
- Exit address: 103.142.140.156
- Run: 2026-10-12T05:11:00.151Z → 2026-10-12T05:18:35.907Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `cb4172278158579cb72ae79c155ac7e2eea7dc90849b4206db92213d612fb16c`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 44 | 4 | 2991 | 14451 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 44, not_loaded 2, not_extracted 2, not_served 44, unknown 0; region waits: 29 (held on 22; scrolled on 5, held on 2 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- robots.txt (cold): disallowed on 11 (T004: unreachable, timeout, set aside; T041: rule /homes/, set aside; T049: rule /, set aside; T059: rule /, set aside; T064: rule /, set aside; T066: rule /, set aside; T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 2656 | not_served (cloudflare_challenge) |
| T002 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 1882 | not_served (cloudflare_challenge) |
| T003 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2092 | not_served (cloudflare_challenge) |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40231 | not_served (timeout) |
| T005 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3075 | not_served (bot_detected_generic) |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7107 | ready (verified); region held in 2192 ms |
| T007 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 717 | not_served (rate_limit) |
| T008 | cold | yes | success |  | 200 | http | http |  | 1780 | ready (verified) |
| T009 | cold | no | failed | timeout |  | http | http | markdownMatches, markdownMatches | 11064 | not_served (timeout) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | minTables | 18307 | not_served (checks_failed, region_absent); region not held in 9796 ms |
| T011 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local |  | 5686 | not_extracted (empty_unverified, region_ready); region held in 1103 ms |
| T012 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13955 | not_loaded (empty_unverified, little_text); region not held in 9836 ms, 1 screen scrolled |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 10502 | not_served (timeout) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 1693 | not_served (bot_detected_generic) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1780 | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8311 | ready (verified); region held in 1717 ms |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8343 | ready (verified); region held in 689 ms |
| T018 | cold | no | blocked | captcha | 429 | http | http | markdownCountMin, markdownMatches | 1831 | not_served (captcha) |
| T019 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 16480 | ready (verified); region held in 9332 ms, 2 screens scrolled |
| T020 | cold | yes | success |  | 200 | http | http |  | 2583 | ready (verified) |
| T021 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2818 | not_served (http_error) |
| T022 | cold | yes | success |  | 200 | http | http |  | 2109 | ready (verified) |
| T023 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 2201 | not_served (bot_detected_generic) |
| T024 | cold | yes | success |  | 200 | http | http |  | 5252 | ready (verified) |
| T025 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13296 | not_served (bot_detected_generic); region not held in 9637 ms |
| T026 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownMatches | 9115 | not_extracted (checks_failed, region_ready); region held in 724 ms |
| T027 | cold | yes | success |  | 200 | http | http |  | 3671 | ready (verified) |
| T029 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5885 | ready (verified); region held in 621 ms |
| T030 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 12978 | not_loaded (empty_unverified, little_text); region not held in 9780 ms, 1 screen scrolled |
| T031 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 13861 | not_served (checks_failed, region_absent); region not held in 9506 ms, 1 screen scrolled |
| T033 | cold | yes | success |  | 200 | http | http |  | 3135 | ready (verified) |
| T034 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 5212 | not_served (bot_detected_generic) |
| T035 | cold | yes | success |  | 200 | http | http |  | 1709 | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5841 | ready (verified); region held in 582 ms |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 664 | not_served (rate_limit) |
| T038 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2991 | not_served (bot_detected_generic) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4950 | ready (verified); region held in 621 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1201 | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 1426 | ready (verified) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1308 | not_served (rate_limit) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3485 | not_served (bot_detected_generic) |
| T044 | cold | yes | success |  | 200 | http | http |  | 2792 | ready (verified) |
| T045 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3883 | not_served (bot_detected_generic) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2496 | not_served (bot_detected_generic) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2059 | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 2278 | not_served (cloudflare_challenge) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2386 | not_served (bot_detected_generic) |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 1983 | not_served (http_error) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5104 | ready (verified); region held in 725 ms |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | minTables, markdownMatches | 4574 | not_served (cloudflare_challenge) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches | 2961 | not_served (bot_detected_generic) |
| T055 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 19258 | ready (verified); region held in 3140 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3685 | ready (verified); region held in 731 ms |
| T057 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3486 | ready (verified); region held in 667 ms |
| T058 | cold | yes | success |  | 200 | http | http |  | 1043 | ready (verified) |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2651 | ready (verified); region held in 605 ms |
| T060 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 14451 | not_served (checks_failed, region_absent); region not held in 9776 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 2876 | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6323 | ready (verified); region held in 913 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 910 | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 1965 | not_served (login_wall) |
| T065 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2709 | not_served (captcha) |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5510 | ready (verified); region held in 658 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4412 | ready (verified); region held in 541 ms |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2973 | not_served (bot_detected_generic) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1861 | not_served (cloudflare_challenge) |
| T070 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2763 | not_served (bot_detected_generic) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1827 | not_served (cloudflare_challenge) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3056 | ready (verified) |
| T073 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownMatches, markdownCountMin, markdownMatches | 3775 | not_served (bot_detected_generic) |
| T074 | cold | yes | success |  | 200 | http | http |  | 740 | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5277 | ready (verified); region held in 572 ms |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin | 1824 | not_served (cloudflare_challenge) |
| T077 | cold | yes | success |  | 200 | http | http |  | 1261 | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1467 | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 2205 | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2292 | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1169 | not_served (http_error) |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1880 | not_served (cloudflare_challenge) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6787 | ready (verified); region held in 861 ms |
| B003 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3685 | not_served (bot_detected_generic) |
| B004 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 4030 | not_served (bot_detected_generic) |
| B005 | cold | yes | success |  | 200 | http | http |  | 3871 | ready (verified) |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5382 | ready (verified); region held in 565 ms |
| B007 | cold | yes | success |  | 200 | http | http |  | 3366 | ready (verified) |
| B008 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 14387 | not_served (bot_detected_generic); region not held in 9712 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 806 | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8514 | ready (verified); region held in 2243 ms, 2 screens scrolled |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3608 | ready (verified); region held in 534 ms |
| B012 | cold | yes | success |  | 200 | http | http |  | 1148 | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 910 | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 1114 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 92 of 92 attempts that carry one (44 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes

- The identity A/B of [docs/pa-challenge-botcheck-tasks.md](../../../docs/pa-challenge-botcheck-tasks.md) G2 (T2.0), window 1: all 92 tasks of item 1's set, one after the other on two local APIs of the same code, no grant (so no compatible transport and no provider), the local rungs through the machine's forward proxy as in the acceptance runs, task contracts on. Arm A, the declared identity (the default): [2026-10-12-identity-ab-declared-2df8207d.md](2026-10-12-identity-ab-declared-2df8207d.md). Arm B, `W2L_BROWSER_IDENTITY=actual` (#431): [2026-10-12-identity-ab-actual-2df8207d.md](2026-10-12-identity-ab-actual-2df8207d.md).
- Result: declared 44 verified (frozen 10 of 50, healthy 24 of 25, blind 9 of 14, unstable 1 of 3), 4 false successes; actual 32 verified (frozen 7, healthy 18, blind 6, unstable 1), 3 false successes. Both arms answered 59 tasks on a browser rung.
- Task by task: the actual identity gained one task, T053 (imf.org, the Akamai refusal the [isolation](2026-10-12-t053-identity-204c8a76.md) explained), and lost thirteen the declared identity verified on the local browser: T016 zara.com, T017 hm.com, T051 indeed.com, B002 macys.com, B011 bls.gov (`bot_detected_generic`); T062 coingecko.com, T067 ft.com, B006 producthunt.com (`cloudflare_challenge`); T029 idealo.de, T057 investing.com, T075 reddit.com (a 403 with no wording the gate names, `http_error`); T059 marketwatch.com (`login_wall`); T039 skyscanner.net (answered, its check failed: the one new false success). Two false successes of the declared arm (T010, T026) were refusals under the actual one.
- Reading: on most sites with a check, the declared Chrome identity is what gets the page and a `HeadlessChrome` identity is refused by name; imf.org's edge is the exception that refuses the claim. Six of the thirteen lost are healthy controls, which the exit condition does not allow to regress. So the actual identity does not become the default. It stays an opt-in switch, and the place for it is a route decision per host (item 2's route memory, when it has the dimension), not the mode's identity.
- One window, one day, one exit; a second window would only be needed if a default change were still on the table, and it is not. Not isolated beyond T053.
