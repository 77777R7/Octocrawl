# Access task set run: all, 2026-10-11

- Command: `node research/access/run-set.mjs --set all --access "enhanced" --record research/access/runs/2026-10-11-pa11-acceptance-steel-40b2558.md`
- Source commit: `40b25588`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8792; access option: `"enhanced"`
- Exit address: 103.142.140.152
- Run: 2026-10-11T04:13:25.051Z → 2026-10-11T04:34:45.459Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 53 | 8 | 7413 | 41880 | unknown | unknown |

- Paid provider calls (cold): 33; tasks verified with a paid call's page as the answer: 10; charged by the spend ledger: $0.0222 (a provider that states no price is charged its sessions' measured time under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 53, not_loaded 3, not_extracted 2, not_served 34, unknown 0; region waits: 40 (held on 31)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 17242 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T002 | cold | no | blocked | cloudflare_challenge | 200 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 16083 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 23753 | steel: success (answer) | ready (verified); region held in 2297 ms |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40287 |  | not_served (timeout) |
| T005 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20599 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T006 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 13668 |  | not_served (checks_failed, region_absent); region not held in 9582 ms |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 2437 |  | ready (verified) |
| T008 | cold | yes | success |  | 200 | http | http |  | 3103 |  | ready (verified) |
| T009 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3716 |  | ready (verified); region held in 548 ms |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | minTables | 18342 |  | not_served (checks_failed, region_absent); region not held in 9879 ms |
| T011 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 33603 | steel: success (answer) | ready (verified); region held in 6620 ms |
| T012 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13722 |  | not_served (checks_failed, region_absent); region not held in 9500 ms |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 11259 |  | not_served (timeout) |
| T014 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 39325 | steel: success (answer) | not_served (checks_failed, region_absent); region not held in 7932 ms |
| T015 | cold | yes | success |  | 200 | http | http |  | 2282 |  | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7413 |  | ready (verified); region held in 975 ms |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 9809 |  | ready (verified); region held in 744 ms |
| T018 | cold | yes | success |  | 200 | http | http_compat |  | 4193 |  | ready (verified) |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 15789 |  | not_loaded (checks_failed, region_not_ready, page_still_changing); region not held in 9581 ms |
| T020 | cold | yes | success |  | 200 | http | http |  | 3915 |  | ready (verified) |
| T021 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 40110 | steel: success (answer) | ready (verified); region not held in 6093 ms |
| T022 | cold | yes | success |  | 200 | http | http |  | 2355 |  | ready (verified) |
| T023 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 41901 | steel: success (answer) | ready (verified); region held in 10560 ms |
| T024 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7012 |  | ready (verified) |
| T025 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 47707 | steel: failed/empty_unverified (answer) | not_loaded (empty_unverified, little_text); region not held in 8362 ms |
| T026 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownMatches | 9923 |  | not_extracted (checks_failed, region_ready); region held in 1318 ms |
| T027 | cold | yes | success |  | 200 | http | http |  | 3383 |  | ready (verified) |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 2810 |  | ready (verified) |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 41880 | steel: success (answer) | ready (verified); region held in 3796 ms |
| T031 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 40996 | steel: success (answer) | ready (verified); region held in 5286 ms |
| T033 | cold | yes | success |  | 200 | http | http |  | 2333 |  | ready (verified) |
| T034 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23839 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T035 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5169 |  | ready (verified); region held in 672 ms |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5867 |  | ready (verified); region held in 574 ms |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1079 |  | not_served (rate_limit) |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20496 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5820 |  | ready (verified); region held in 605 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1494 |  | ready (verified) |
| T041 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6076 |  | ready (verified); region held in 673 ms |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1858 |  | not_served (rate_limit) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 26521 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T044 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7994 |  | ready (verified); region held in 719 ms |
| T045 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23513 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20790 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18652 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 17738 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2524 |  | not_served (bot_detected_generic) |
| T050 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 35555 | steel: success (answer) | ready (verified); region held in 8184 ms |
| T051 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin | 20000 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | minTables, markdownMatches | 18433 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 16179 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T055 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | minTables | 22185 |  | not_served (checks_failed, region_absent); region not held in 9989 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4533 |  | ready (verified); region held in 696 ms |
| T057 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 5248 |  | ready (verified); region held in 1254 ms |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6311 |  | ready (verified); region held in 643 ms |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3724 |  | ready (verified); region held in 603 ms |
| T060 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 2876 |  | not_loaded (checks_failed, not_rendered) |
| T061 | cold | yes | success |  | 200 | http | http |  | 3862 |  | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6636 |  | ready (verified); region held in 888 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1290 |  | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2047 |  | not_served (login_wall) |
| T065 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 34308 | steel: success (answer) | ready (verified); region held in 3181 ms |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6441 |  | ready (verified); region held in 1230 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3078 |  | ready (verified); region held in 548 ms |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 19618 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19670 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T070 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 43116 | steel: success (answer) | ready (verified); region held in 8545 ms |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19203 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3684 |  | ready (verified) |
| T073 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider |  | 22716 | steel: failed/empty_unverified (answer) | not_extracted (empty_unverified, region_ready); region held in 1324 ms |
| T074 | cold | yes | success |  | 200 | http | http → browser_local → provider |  | 20492 | steel: blocked/cloudflare_challenge | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5310 |  | ready (verified); region held in 591 ms |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 75106 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T077 | cold | yes | success |  | 200 | http | http |  | 1479 |  | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1527 |  | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 2309 |  | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2182 |  | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1218 |  | not_served (http_error) |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15235 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6798 |  | ready (verified); region held in 850 ms |
| B003 | cold | no | failed | provider_error |  | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18491 | steel: failed/provider_error (answer) | not_served (provider_error) |
| B004 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 31721 | steel: success (answer) | ready (verified); region held in 3957 ms |
| B005 | cold | yes | success |  | 200 | http | http |  | 4249 |  | ready (verified) |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5801 |  | ready (verified); region held in 578 ms |
| B007 | cold | yes | success |  | 200 | http | http |  | 3595 |  | ready (verified) |
| B008 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 13887 |  | not_served (bot_detected_generic); region not held in 9714 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 1293 |  | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8776 |  | ready (verified); region held in 2263 ms |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3669 |  | ready (verified); region held in 546 ms |
| B012 | cold | yes | success |  | 200 | http | http |  | 1429 |  | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 2205 |  | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 1760 |  | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 92 of 92 attempts that carry one (53 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (ROADMAP PA item 11 acceptance: the region wait and readiness, before the ladder reads them)

**Set-up.**
- The Steel grant with the per-millisecond tariff (SHA-256 `67acb9bc515429e9c1258253f2da648bea1738a41dbcd77c8455526b323cd239`), proxied, the API on 8792.
- The server ran at `40b2558`: main `bf95a8c` (item 11's PR 1 #363 and PR 2 #369, item 10's #360 and #366), plus this runner's readiness column (`49033bb0`).
- Every task's predicates went to the API as its `verify` contract, so the browser lanes waited for each task's region on the live page.
- The ladder did not read the verification or the readiness yet: item 10's #370 and its wiring of `readinessOf` were not merged. Routing is the earlier one.

**Compared with the run at `d24b38a`:**

| | `d24b38a` | This run |
| --- | --- | --- |
| Verified, all 92 | 52 | 53 |
| Verified, frozen 50 / healthy 25 / blind 14 / unstable 3 | 18 / 23 / 9 / 2 | 18 / 23 / 10 / 2 |
| False successes | 6 | 8 |
| The product's verification against the runner's verdict | not sent | agreed on 92 of 92 |
| Paid calls | 36 | 33 |
| Ledger charge (measured) | $0.0215 | $0.0222 |
| p50 / p95 ms | 5,707 / 30,811 | 7,413 / 41,880 |
| Sum of the 92 wall times | 1,138 s | 1,279 s |

**Readiness.**
- Readiness came out `ready` 53, `not_loaded` 3, `not_extracted` 2, `not_served` 34. Each of the 53 `ready` is a verified task, and no unverified task is `ready`.
- The browser lanes waited for 40 tasks' regions; the region held on 31.
- Every one of the 8 false successes is classified as not ready:
  - `not_served` with `region_absent`, the region never held on a settled page: T006, T010, T012, T014, T055.
  - `not_loaded`: T019 (`page_still_changing`) and T060 (`not_rendered`, the http lane's answer).
  - `not_extracted` with `region_ready`: T026. Its contract held on the live page, but not in the main content extracted.

**The four acceptance pages.**
- **WSJ market data (T066): verified.** It went http, then browser_local, and its region held in 1.2 s. At `d24b38a` it was a false success, kept from the http lane.
- **OECD (T010):** a false success, `not_served` (`region_absent`). Its region did not hold in 9.9 s on a settled page. Its table appears only after a click on "Table" (probe of 2026-10-10), which no signal on the page shows, so a wait cannot tell it from a page without the table.
- **Tesla inventory (B003):** `failed`/`provider_error` on Steel this time, `not_served`. The inventory shell seen on Steel's page on 2026-10-10 did not recur, so this run does not show it told apart.
- **x.com/NASA (T079):** verified on the http lane. The x.com case of the acceptance, a page read in the person's Chrome before it had loaded, is the my-browser lane's; it was not part of this run.

**What the region wait moved, beside T066.**
- **T073 (provider):** the region held on Steel's live page in 1.3 s. The extractor then found no main content, so the task reads `not_extracted` (`empty_unverified`, `region_ready`): the data was on the page and was not extracted. It was verified at `d24b38a`.
- **The cost in time:** the 9 waits that did not hold ran 6.1–10 s each. They account for most of the higher p95 and of the 141 s more in all.

**Lost against `d24b38a`, none traced to the wait:**
- T043 (Redfin) and T051 (census.gov) were blocked (`bot_detected_generic`, `cloudflare_challenge`). Both have gone both ways in earlier runs.
- T006: browser_local answered and the ladder did not go on to Steel, as at `d5d6c2c`, before the region wait. Its readiness, `not_served`, is the state the ladder will escalate on once it reads it.
- T073: see above.

**Gained:** T021, T031, T066, T067, B010.
