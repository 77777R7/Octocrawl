# Access task set run: all, 2026-10-12

- Command: `node research/access/run-set.mjs --set all --save-responses --record research/access/runs/2026-10-12-identity-ab-actual-2df8207d.md`
- Source commit: `2df8207d` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8798; access option: none
- Exit address: 103.142.140.156
- Run: 2026-10-12T05:18:35.995Z → 2026-10-12T05:24:48.056Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `cb4172278158579cb72ae79c155ac7e2eea7dc90849b4206db92213d612fb16c`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 32 | 3 | 2317 | 13049 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 32, not_loaded 3, not_extracted 1, not_served 56, unknown 0; region waits: 14 (held on 10; scrolled on 3, held on 2 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- robots.txt (cold): disallowed on 11 (T004: unreachable, timeout, set aside; T041: rule /homes/, set aside; T049: rule /, set aside; T059: rule /, set aside; T064: rule /, set aside; T066: rule /, set aside; T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 2536 | not_served (cloudflare_challenge) |
| T002 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 1923 | not_served (cloudflare_challenge) |
| T003 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 1979 | not_served (cloudflare_challenge) |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40248 | not_served (timeout) |
| T005 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3177 | not_served (bot_detected_generic) |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6081 | ready (verified); region held in 1677 ms |
| T007 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 755 | not_served (rate_limit) |
| T008 | cold | yes | success |  | 200 | http | http |  | 1574 | ready (verified) |
| T009 | cold | no | failed | timeout |  | http | http | markdownMatches, markdownMatches | 10959 | not_served (timeout) |
| T010 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | minTables | 18150 | not_loaded (empty_unverified, little_text); region not held in 9750 ms |
| T011 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local |  | 5726 | not_extracted (empty_unverified, region_ready); region held in 1101 ms |
| T012 | cold | no | blocked | captcha | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3105 | not_served (captcha) |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 10503 | not_served (timeout) |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 1812 | not_served (bot_detected_generic) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1646 | ready (verified) |
| T016 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 1926 | not_served (bot_detected_generic) |
| T017 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 1688 | not_served (bot_detected_generic) |
| T018 | cold | no | blocked | captcha | 429 | http | http | markdownCountMin, markdownMatches | 1895 | not_served (captcha) |
| T019 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 13742 | ready (verified); region held in 7942 ms, 7 screens scrolled |
| T020 | cold | yes | success |  | 200 | http | http |  | 3715 | ready (verified) |
| T021 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2488 | not_served (http_error) |
| T022 | cold | yes | success |  | 200 | http | http |  | 2077 | ready (verified) |
| T023 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 1701 | not_served (bot_detected_generic) |
| T024 | cold | yes | success |  | 200 | http | http |  | 4301 | ready (verified) |
| T025 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 5014 | not_served (bot_detected_generic) |
| T026 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 4910 | not_served (http_error) |
| T027 | cold | yes | success |  | 200 | http | http |  | 3320 | ready (verified) |
| T029 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2382 | not_served (http_error) |
| T030 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13049 | not_loaded (empty_unverified, little_text); region not held in 9847 ms, 1 screen scrolled |
| T031 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 12929 | not_served (checks_failed, region_absent); region not held in 9669 ms |
| T033 | cold | yes | success |  | 200 | http | http |  | 3241 | ready (verified) |
| T034 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1879 | not_served (bot_detected_generic) |
| T035 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5131 | ready (verified); region held in 1152 ms |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5965 | ready (verified); region held in 1122 ms |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 748 | not_served (rate_limit) |
| T038 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2795 | not_served (bot_detected_generic) |
| T039 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 12446 | not_served (checks_failed, region_absent); region not held in 9593 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1139 | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 1581 | ready (verified) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1338 | not_served (rate_limit) |
| T043 | cold | no | blocked | rate_limit | 429 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3017 | not_served (rate_limit) |
| T044 | cold | yes | success |  | 200 | http | http |  | 3071 | ready (verified) |
| T045 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3726 | not_served (bot_detected_generic) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2526 | not_served (bot_detected_generic) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2105 | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 2317 | not_served (cloudflare_challenge) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2400 | not_served (bot_detected_generic) |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 1953 | not_served (http_error) |
| T051 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 1924 | not_served (bot_detected_generic) |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | minTables, markdownMatches | 4587 | not_served (cloudflare_challenge) |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2926 | ready (verified); region held in 523 ms |
| T055 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 17268 | ready (verified); region held in 2534 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3866 | ready (verified); region held in 695 ms |
| T057 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 1669 | not_served (http_error) |
| T058 | cold | yes | success |  | 200 | http | http |  | 894 | ready (verified) |
| T059 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 1862 | not_served (login_wall) |
| T060 | cold | no (false success) | success |  | 200 | http | http → browser_local | markdownCountMin | 9107 | not_loaded (checks_failed, not_rendered) |
| T061 | cold | yes | success |  | 200 | http | http |  | 3114 | ready (verified) |
| T062 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3188 | not_served (cloudflare_challenge) |
| T063 | cold | yes | success |  | 200 | http | http |  | 1022 | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 1999 | not_served (login_wall) |
| T065 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2662 | not_served (captcha) |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6990 | ready (verified); region held in 1801 ms |
| T067 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 1988 | not_served (cloudflare_challenge) |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2275 | not_served (cloudflare_challenge) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1906 | not_served (cloudflare_challenge) |
| T070 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2239 | not_served (bot_detected_generic) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1771 | not_served (cloudflare_challenge) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3707 | ready (verified) |
| T073 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin, markdownMatches | 2360 | not_served (bot_detected_generic) |
| T074 | cold | yes | success |  | 200 | http | http |  | 973 | ready (verified) |
| T075 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3317 | not_served (http_error) |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin | 1887 | not_served (cloudflare_challenge) |
| T077 | cold | yes | success |  | 200 | http | http |  | 1188 | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1514 | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 2146 | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2141 | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1150 | not_served (http_error) |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1940 | not_served (cloudflare_challenge) |
| B002 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2055 | not_served (bot_detected_generic) |
| B003 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1758 | not_served (bot_detected_generic) |
| B004 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 1923 | not_served (bot_detected_generic) |
| B005 | cold | yes | success |  | 200 | http | http |  | 3427 | ready (verified) |
| B006 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin | 2089 | not_served (cloudflare_challenge) |
| B007 | cold | yes | success |  | 200 | http | http |  | 3614 | ready (verified) |
| B008 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2649 | not_served (http_error) |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 801 | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 9123 | ready (verified); region held in 2338 ms, 2 screens scrolled |
| B011 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 1604 | not_served (bot_detected_generic) |
| B012 | cold | yes | success |  | 200 | http | http |  | 1110 | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 1828 | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 949 | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 92 of 92 attempts that carry one (32 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes

- The identity A/B of [docs/pa-challenge-botcheck-tasks.md](../../../docs/pa-challenge-botcheck-tasks.md) G2 (T2.0), window 1: all 92 tasks of item 1's set, one after the other on two local APIs of the same code, no grant (so no compatible transport and no provider), the local rungs through the machine's forward proxy as in the acceptance runs, task contracts on. Arm A, the declared identity (the default): [2026-10-12-identity-ab-declared-2df8207d.md](2026-10-12-identity-ab-declared-2df8207d.md). Arm B, `W2L_BROWSER_IDENTITY=actual` (#431): [2026-10-12-identity-ab-actual-2df8207d.md](2026-10-12-identity-ab-actual-2df8207d.md).
- Result: declared 44 verified (frozen 10 of 50, healthy 24 of 25, blind 9 of 14, unstable 1 of 3), 4 false successes; actual 32 verified (frozen 7, healthy 18, blind 6, unstable 1), 3 false successes. Both arms answered 59 tasks on a browser rung.
- Task by task: the actual identity gained one task, T053 (imf.org, the Akamai refusal the [isolation](2026-10-12-t053-identity-204c8a76.md) explained), and lost thirteen the declared identity verified on the local browser: T016 zara.com, T017 hm.com, T051 indeed.com, B002 macys.com, B011 bls.gov (`bot_detected_generic`); T062 coingecko.com, T067 ft.com, B006 producthunt.com (`cloudflare_challenge`); T029 idealo.de, T057 investing.com, T075 reddit.com (a 403 with no wording the gate names, `http_error`); T059 marketwatch.com (`login_wall`); T039 skyscanner.net (answered, its check failed: the one new false success). Two false successes of the declared arm (T010, T026) were refusals under the actual one.
- Reading: on most sites with a check, the declared Chrome identity is what gets the page and a `HeadlessChrome` identity is refused by name; imf.org's edge is the exception that refuses the claim. Six of the thirteen lost are healthy controls, which the exit condition does not allow to regress. So the actual identity does not become the default. It stays an opt-in switch, and the place for it is a route decision per host (item 2's route memory, when it has the dimension), not the mode's identity.
- One window, one day, one exit; a second window would only be needed if a default change were still on the table, and it is not. Not isolated beyond T053.
