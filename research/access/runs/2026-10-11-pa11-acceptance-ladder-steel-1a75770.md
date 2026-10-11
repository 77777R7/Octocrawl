# Access task set run: all, 2026-10-11

- Command: `node research/access/run-set.mjs --set all --access "enhanced" --record research/access/runs/2026-10-11-pa11-acceptance-ladder-steel-1a75770.md`
- Source commit: `1a75770d`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8793; access option: `"enhanced"`
- Exit address: 103.142.140.58
- Run: 2026-10-11T05:26:30.899Z → 2026-10-11T05:46:33.413Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 55 | 5 | 6250 | 39818 | unknown | unknown |

- Paid provider calls (cold): 35; tasks verified with a paid call's page as the answer: 10; charged by the spend ledger: $0.0213 (a provider that states no price is charged its sessions' measured time under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 55, not_loaded 4, not_extracted 1, not_served 32, unknown 0; region waits: 37 (held on 27)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 20673 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T002 | cold | no | blocked | cloudflare_challenge | 200 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 21318 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 24862 | steel: success (answer) | ready (verified); region held in 2517 ms |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40211 |  | not_served (timeout) |
| T005 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 25236 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T006 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 49699 | steel: success (answer) | ready (verified); region held in 8068 ms |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 1445 |  | ready (verified) |
| T008 | cold | yes | success |  | 200 | http | http |  | 1679 |  | ready (verified) |
| T009 | cold | yes | success |  | 200 | http | http_compat |  | 1079 |  | ready (verified) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → provider | minTables | 46112 | steel: success | not_served (checks_failed, region_absent); region not held in 9887 ms |
| T011 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 29715 | steel: success (answer) | ready (verified); region held in 2920 ms |
| T012 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 33066 | steel: failed/empty_unverified (answer) | not_loaded (empty_unverified, little_text); region not held in 9399 ms |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 10510 |  | not_served (timeout) |
| T014 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 31488 | steel: success (answer) | not_served (checks_failed, region_absent); region not held in 9554 ms |
| T015 | cold | yes | success |  | 200 | http | http |  | 1947 |  | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6972 |  | ready (verified); region held in 937 ms |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8586 |  | ready (verified); region held in 749 ms |
| T018 | cold | yes | success |  | 200 | http | http_compat |  | 3637 |  | ready (verified) |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → provider | markdownCountMin | 30314 | steel: failed/provider_error | not_served (checks_failed, region_absent); region not held in 9388 ms |
| T020 | cold | yes | success |  | 200 | http | http |  | 2507 |  | ready (verified) |
| T021 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 26734 | steel: success (answer) | ready (verified); region held in 2854 ms |
| T022 | cold | yes | success |  | 200 | http | http |  | 2080 |  | ready (verified) |
| T023 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 20081 | steel: success (answer) | ready (verified); region held in 2970 ms |
| T024 | cold | yes | success |  | 200 | http | http |  | 4114 |  | ready (verified) |
| T025 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 32757 | steel: failed/empty_unverified (answer) | not_loaded (empty_unverified, little_text); region not held in 9389 ms |
| T026 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 12020 |  | not_served (timeout) |
| T027 | cold | yes | success |  | 200 | http | http |  | 3346 |  | ready (verified) |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 2233 |  | ready (verified) |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 31501 | steel: success (answer) | ready (verified); region held in 2001 ms |
| T031 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 39818 | steel: failed/empty_unverified (answer) | not_loaded (empty_unverified, little_text); region not held in 8689 ms |
| T033 | cold | yes | success |  | 200 | http | http |  | 2355 |  | ready (verified) |
| T034 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17440 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T035 | cold | yes | success |  | 200 | http | http |  | 1623 |  | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6303 |  | ready (verified); region held in 561 ms |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 712 |  | not_served (rate_limit) |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17982 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4651 |  | ready (verified); region held in 663 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1093 |  | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 1698 |  | ready (verified) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1371 |  | not_served (rate_limit) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19874 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T044 | cold | yes | success |  | 200 | http | http |  | 3400 |  | ready (verified) |
| T045 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19154 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19826 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18907 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 16348 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2449 |  | not_served (bot_detected_generic) |
| T050 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 18685 | steel: success (answer) | ready (verified); region held in 2104 ms |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5310 |  | ready (verified); region held in 719 ms |
| T052 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5825 |  | ready (verified); region held in 533 ms |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 18809 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T055 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 59300 | steel: success (answer) | not_served (checks_failed, region_absent); region not held in 9854 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3553 |  | ready (verified); region held in 652 ms |
| T057 | cold | yes | success |  | 200 | http | http_compat |  | 968 |  | ready (verified) |
| T058 | cold | yes | success |  | 200 | http | http |  | 854 |  | ready (verified) |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3124 |  | ready (verified); region held in 608 ms |
| T060 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → provider | markdownCountMin | 38781 | steel: success | not_served (checks_failed, region_absent); region not held in 9963 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 3834 |  | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6250 |  | ready (verified); region held in 885 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1086 |  | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2188 |  | not_served (login_wall) |
| T065 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 34740 | steel: success (answer) | ready (verified); region held in 4184 ms |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6404 |  | ready (verified); region held in 1235 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4257 |  | ready (verified); region held in 552 ms |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 23863 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 14924 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T070 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 34990 | steel: success (answer) | ready (verified); region held in 7098 ms |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18857 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3171 |  | ready (verified) |
| T073 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider |  | 22492 | steel: failed/empty_unverified (answer) | not_extracted (empty_unverified, region_ready); region held in 1537 ms |
| T074 | cold | yes | success |  | 200 | http | http |  | 1907 |  | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4610 |  | ready (verified); region held in 575 ms |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin | 3965 |  | not_served (cloudflare_challenge) |
| T077 | cold | yes | success |  | 200 | http | http |  | 1074 |  | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1514 |  | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 2233 |  | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2245 |  | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1190 |  | not_served (http_error) |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17322 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6562 |  | ready (verified); region held in 814 ms |
| B003 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 34210 | steel: failed/empty_unverified (answer) | not_loaded (empty_unverified, little_text); region not held in 9732 ms |
| B004 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 27058 | steel: success (answer) | ready (verified); region held in 3131 ms |
| B005 | cold | yes | success |  | 200 | http | http |  | 4041 |  | ready (verified) |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5707 |  | ready (verified); region held in 581 ms |
| B007 | cold | yes | success |  | 200 | http | http |  | 4203 |  | ready (verified) |
| B008 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 13452 |  | not_served (bot_detected_generic); region not held in 9780 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 824 |  | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8657 |  | ready (verified); region held in 2379 ms |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3662 |  | ready (verified); region held in 549 ms |
| B012 | cold | yes | success |  | 200 | http | http |  | 1239 |  | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 1982 |  | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 897 |  | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 92 of 92 attempts that carry one (55 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (ROADMAP PA item 11 acceptance: the ladder reading readiness)

**Set-up.**
- The same set-up as `2026-10-11-pa11-acceptance-steel-40b2558.md`: the Steel grant (SHA-256 `67acb9bc515429e9c1258253f2da648bea1738a41dbcd77c8455526b323cd239`), proxied, every task's predicates sent as its contract. The API was on 8793.
- The server ran at `1a75770d`: main `f1432dab`, which adds item 10's #370 (the ladder reads the verification) and #373 (it reads `readinessOf`), plus the my-browser record.
- **How the ladder now treats a page whose contract failed:**
  - `not_loaded`: the browser rung (from the http lane), as before.
  - `not_served`: on to paid rungs, within the grant and the budget.
  - `not_extracted`: no paid rung after it. One whose basis is `region_unjudged` is treated as `not_served`.

**Compared with the control run at `40b2558` (same day, the ladder not reading readiness):**

| | Control `40b2558` | This run |
| --- | --- | --- |
| Verified, all 92 | 53 | 55 |
| Verified, frozen 50 / healthy 25 / blind 14 / unstable 3 | 18 / 23 / 10 / 2 | 19 / 25 / 10 / 1 |
| False successes | 8 | 5 |
| The product's verification against the runner's verdict | agreed on 92 of 92 | agreed on 92 of 92 |
| Readiness: ready / not_loaded / not_extracted / not_served | 53 / 3 / 2 / 34 | 55 / 4 / 1 / 32 |
| Paid calls | 33 | 35 |
| Ledger charge (measured) | $0.0222 | $0.0213 |
| p50 / p95 ms | 7,413 / 41,880 | 6,250 / 39,818 |

**What the ladder moved:**
- **Six tasks went on to Steel that had stopped at the local browser in the control run:** T006, T010, T012, T019, T055 and T060. Each was `not_served` (or `not_loaded`) there with its contract failed.
  - **T006** was verified on Steel's page.
  - **The other five** were not: Steel's page lacked their data too. T010, T019, T055 and T060 are `not_served` with `region_absent`; T012 is `not_loaded`.
  - These are the paid calls the ladder spent without a verified answer.
- **T051, T052, T074 and T076 stopped short of Steel** where the control run had reached it: the local browser's page met their contracts. T051 and T052 are verified now.
- **T073 is `not_extracted`** (`empty_unverified`, `region_ready`): its region held on Steel's live page in 1.5 s and the extractor found no main content. Steel was the last rung, so no paid hop followed; the extraction is what fails it, as in the control run.

**The four acceptance pages:**
- **WSJ market data (T066):** verified on browser_local after its region held in 1.2 s, as in the control run.
- **Tesla inventory (B003):** Steel's page was the inventory shell this time. It went `failed`/`empty_unverified` with little text, its region (three prices) not held in 9.7 s, and it is `not_loaded` (`empty_unverified`, `little_text`): told apart from a page that was not served.
- **OECD (T010):** `not_served` (`region_absent`) on the local browser and on Steel's page alike: its table needs a click.
- **x.com:** see `2026-10-11-pa11-my-browser-f1432da.md`. The page read before it had loaded on 2026-10-10 (L4) was read after the settle wait and verified.

**Lost against the control run:** T031 (temu.com), `failed`/`empty_unverified` on Steel's page, `not_loaded`. It has gone both ways in earlier runs. Not isolated.

**Gained:** T006, T051, T052.
