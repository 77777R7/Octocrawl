# Access task set run: all, 2026-10-11

- Command: `node research/access/run-set.mjs --set all --access "enhanced" --record research/access/runs/2026-10-11-pa4-92-residential-scroll-cd9d9e7.md`
- Source commit: `cd9d9e7c`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8796; access option: `"enhanced"`
- Exit address: not recorded
- Run: 2026-10-11T15:39:10.993Z → 2026-10-11T16:04:55.592Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `cb4172278158579cb72ae79c155ac7e2eea7dc90849b4206db92213d612fb16c`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 56 | 5 | 6883 | 49200 | unknown | unknown |

- Paid provider calls (cold): 36; tasks verified with a paid call's page as the answer: 12; charged by the spend ledger: $1.3894 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill); bytes through the provider's proxy, as it reported them: 115798997

- Readiness (cold, ADR 0007): ready 56, not_loaded 2, not_extracted 0, not_served 34, unknown 0; region waits: 37 (held on 27; scrolled on 4, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): robots_override on T049 (provider, steel), T064 (provider, steel), B008 (provider, steel)

- robots.txt (cold): disallowed on 11 (T004: unreachable, timeout, set aside; T041: rule /homes/, set aside; T049: rule /, set aside; T059: rule /, set aside; T064: rule /, set aside; T066: rule /, set aside; T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside); not known on 1 attempt without a robots check

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 26014 | steel: blocked/cloudflare_challenge [1030328 B US] (answer) | not_served (cloudflare_challenge) |
| T002 | cold | no | blocked | cloudflare_challenge | 200 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 24483 | steel: blocked/cloudflare_challenge [3134069 B US] (answer) | not_served (cloudflare_challenge) |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 26587 | steel: success [1860659 B US] (answer) | ready (verified); region held in 2109 ms |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40270 |  | not_served (timeout) |
| T005 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 42035 | steel: blocked/bot_detected_generic [1929312 B US] (answer) | not_served (bot_detected_generic) |
| T006 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → provider | markdownCountMin | 35916 | steel: failed/provider_error [1968512 B US] | not_served (checks_failed, region_absent); region not held in 9578 ms |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 2460 |  | ready (verified) |
| T008 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 997 |  | not_served (rate_limit) |
| T009 | cold | yes | success |  | 200 | http | http_compat |  | 1509 |  | ready (verified) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → provider | minTables | 49200 | steel: success [1691197 B US] | not_served (checks_failed, region_absent); region not held in 9822 ms |
| T011 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 40523 | steel: success [19663978 B US] (answer) | ready (verified); region held in 8728 ms |
| T012 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → provider | markdownCountMin, markdownMatches | 38453 | steel: blocked/captcha [888790 B US] | not_served (checks_failed, region_absent); region not held in 9526 ms, 1 screen scrolled |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 11001 |  | not_served (timeout) |
| T014 | cold | no | failed | provider_error |  | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 25066 | steel: failed/provider_error [2704753 B US] (answer) | not_served (provider_error) |
| T015 | cold | yes | success |  | 200 | http | http |  | 2072 |  | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8725 |  | ready (verified); region held in 972 ms |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8569 |  | ready (verified); region held in 739 ms |
| T018 | cold | yes | success |  | 200 | http | http_compat |  | 4353 |  | ready (verified) |
| T019 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14946 |  | ready (verified); region not held in 9459 ms, 2 screens scrolled |
| T020 | cold | yes | success |  | 200 | http | http |  | 3251 |  | ready (verified) |
| T021 | cold | no | failed | http_error | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 22238 | steel: failed/http_error [485455 B US] (answer) | not_served (http_error) |
| T022 | cold | yes | success |  | 200 | http | http |  | 2661 |  | ready (verified) |
| T023 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 45706 | steel: success [12461987 B US] (answer) | ready (verified); region held in 5235 ms |
| T024 | cold | yes | success |  | 200 | http | http |  | 2702 |  | ready (verified) |
| T025 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 54225 | steel: failed/empty_unverified [4723552 B US] (answer) | not_loaded (empty_unverified, little_text); region not held in 10042 ms |
| T026 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 12020 |  | not_served (timeout) |
| T027 | cold | yes | success |  | 200 | http | http |  | 3366 |  | ready (verified) |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 2793 |  | ready (verified) |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 42064 | steel: success [4218999 B US] (answer) | ready (verified); region held in 3845 ms |
| T031 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 62906 | steel: success [3896249 B US] (answer) | ready (verified); region held in 9887 ms |
| T033 | cold | yes | success |  | 200 | http | http |  | 2949 |  | ready (verified) |
| T034 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 32387 | steel: blocked/bot_detected_generic [2551038 B US] (answer) | not_served (bot_detected_generic) |
| T035 | cold | yes | success |  | 200 | http | http |  | 1877 |  | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5740 |  | ready (verified); region held in 576 ms |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 848 |  | not_served (rate_limit) |
| T038 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 36403 | steel: blocked/bot_detected_generic [2377073 B US] (answer) | not_served (bot_detected_generic) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5956 |  | ready (verified); region held in 636 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1260 |  | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 1574 |  | ready (verified) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1404 |  | not_served (rate_limit) |
| T043 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 34843 | steel: success [7328658 B US] (answer) | ready (verified); region held in 3958 ms |
| T044 | cold | yes | success |  | 200 | http | http |  | 2944 |  | ready (verified) |
| T045 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23836 | steel: blocked/bot_detected_generic [479991 B US] (answer) | not_served (bot_detected_generic) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23937 | steel: blocked/bot_detected_generic [429811 B US] (answer) | not_served (bot_detected_generic) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 26387 | steel: blocked/cloudflare_challenge [1023687 B US] (answer) | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 27163 | steel: blocked/cloudflare_challenge [1044027 B US] (answer) | not_served (cloudflare_challenge) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2372 |  | not_served (bot_detected_generic) |
| T050 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 40749 | steel: success [2596077 B US] (answer) | ready (verified); region held in 7103 ms |
| T051 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 43302 | steel: success [5077012 B US] (answer) | ready (verified); region held in 7295 ms |
| T052 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 32795 | steel: success [583561 B US] (answer) | ready (verified); region held in 2004 ms |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 23872 | steel: blocked/bot_detected_generic [269252 B US] (answer) | not_served (bot_detected_generic) |
| T055 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 17391 |  | ready (verified); region held in 2507 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4377 |  | ready (verified); region held in 707 ms |
| T057 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 4344 |  | ready (verified); region held in 685 ms |
| T058 | cold | yes | success |  | 200 | http | http |  | 885 |  | ready (verified) |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3326 |  | ready (verified); region held in 618 ms |
| T060 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → provider | markdownCountMin | 62556 | steel: success [2979390 B US] | not_served (checks_failed, region_absent); region not held in 9984 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 3483 |  | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6126 |  | ready (verified); region held in 899 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1065 |  | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2035 |  | not_served (login_wall) |
| T065 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 41575 | steel: success [4053566 B US] (answer) | ready (verified); region held in 4327 ms |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6671 |  | ready (verified); region held in 661 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4301 |  | ready (verified); region held in 554 ms |
| T068 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 27465 | steel: blocked/bot_detected_generic [3203390 B US] (answer) | not_served (bot_detected_generic) |
| T069 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 43953 | steel: success [5862078 B US] (answer) | ready (verified); region not held in 5171 ms |
| T070 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 33342 | steel: success [3960414 B US] (answer) | ready (verified); region held in 2272 ms |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 21483 | steel: blocked/cloudflare_challenge [1360749 B US] (answer) | not_served (cloudflare_challenge) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3726 |  | ready (verified) |
| T073 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → provider | markdownMatches | 55523 | steel: failed/provider_error [3813795 B US] | not_served (checks_failed, region_absent); region not held in 9742 ms, 18 screens scrolled |
| T074 | cold | yes | success |  | 200 | http | http |  | 844 |  | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5460 |  | ready (verified); region held in 588 ms |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 25061 | steel: blocked/cloudflare_challenge [1940464 B US] (answer) | not_served (cloudflare_challenge) |
| T077 | cold | yes | success |  | 200 | http | http |  | 1712 |  | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1527 |  | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 2370 |  | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2240 |  | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1189 |  | not_served (http_error) |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23175 | steel: blocked/cloudflare_challenge [1032318 B US] (answer) | not_served (cloudflare_challenge) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6883 |  | ready (verified); region held in 850 ms |
| B003 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 41225 | steel: failed/empty_unverified [3174806 B US] (answer) | not_loaded (empty_unverified, little_text); region not held in 9488 ms |
| B004 | cold | no | failed | provider_error |  | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 11625 | steel: failed/provider_error (answer) | not_served (provider_error) |
| B005 | cold | yes | success |  | 200 | http | http |  | 4352 |  | ready (verified) |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5962 |  | ready (verified); region held in 615 ms |
| B007 | cold | yes | success |  | 200 | http | http |  | 4560 |  | ready (verified) |
| B008 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 14035 |  | not_served (bot_detected_generic); region not held in 9793 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 1024 |  | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8837 |  | ready (verified); region held in 2253 ms, 2 screens scrolled |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5422 |  | ready (verified); region held in 551 ms |
| B012 | cold | yes | success |  | 200 | http | http |  | 1310 |  | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 1176 |  | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 1165 |  | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 92 of 92 attempts that carry one (56 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Against the ladder run of 2026-10-11

The comparison run is `2026-10-11-pa11-acceptance-ladder-steel-1a75770.md`. Two things changed between the runs, so a gain or loss below is not set down to either one alone:

- **The code:** this run has #393 (ARIA grids read as tables), #397 and #400 (Steel's bytes and solves), #403 (robots unreachable apart from a rule) and #404/#406 (the region wait's scroll and its count).
- **Steel's exit:** this run's grant names `vendor_residential_proxy` (US). The earlier run went out from Steel's datacenter address (US, Ashburn).

Results:

- **Verified:** 56 against 55. The product's verification agreed with the runner on 92 of 92 again.
- **False successes:** 5 against 5, but a different five.
  - Now: T006, T010, T012, T060, T073.
  - Before: T010, T014, T019, T055, T060.
  - T006, T012 and T073 answered `success` on the local browser's page, readiness `not_served` (`region_absent`).
- **Gained (5):**
  - T055: Eurostat's AG Grid read as a table (#393). Local browser, no paid call.
  - T019: Costco. Local browser, region wait scrolled 2 screens.
  - T031, T043, T069: Steel's residential page.
- **Lost (4):**
  - T006: verified on Steel's datacenter page before; `success` without its data now.
  - T008: `blocked`/`rate_limit` on http.
  - T021: `failed`/`http_error`.
  - B004: `failed`/`provider_error`.
  - None of these is isolated.
- **T014:** Steel's residential call answered `provider_error` this time (2.7 MB, $0.0276). It was verified in `2026-10-11-pa4-t014-region-scroll-1604d7c-run2.md`, so whether a residential address gets through still varies.
- **T026:** `failed`/`timeout` on http, with no paid call.
- **Scroll:**
  - The region wait scrolled on 4 tasks (T012 1, T019 2, T073 18, B010 2).
  - T019 and B010 were verified.
  - T073 scrolled 18 screens without its region.
- **Cost:** 36 paid calls; $1.3894 charged by the ledger; 115,798,997 proxy bytes. 12 verified tasks took a paid call's page as the answer.
