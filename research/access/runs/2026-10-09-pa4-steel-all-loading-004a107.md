# Access task set run: all, 2026-10-09

- Command: `node research/access/run-set.mjs --set all --access "enhanced" --record research/access/runs/2026-10-09-pa4-steel-all-loading-004a107.md`
- Source commit: `004a107`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8798; access option: `"enhanced"`
- Exit address: 103.142.140.155
- Run: 2026-10-09T08:21:14.635Z → 2026-10-09T08:39:07.659Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 47 | 13 | 6890 | 29946 | unknown | unknown |

- Paid provider calls (cold): 33; tasks verified with a paid call's page as the answer: 6; charged by the spend ledger: $0.1100 (a provider that states no price is charged its price ceiling: an upper bound, not its bill)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 26000 | steel: blocked/bot_detected_generic (answer) |
| T002 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 25359 | steel: success (answer) |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 19292 | steel: success (answer) |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40428 |  |
| T005 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 29946 | steel: blocked/bot_detected_generic (answer) |
| T006 | cold | no (false success) | success |  | 202 | provider | http → browser_local → provider | markdownCountMin | 23425 | steel: success (answer) |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 2141 |  |
| T008 | cold | yes | success |  | 200 | http | http |  | 1965 |  |
| T009 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3980 |  |
| T010 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 29729 | steel: success (answer) |
| T011 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 23901 | steel: success (answer) |
| T012 | cold | no | blocked | captcha | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 29928 | steel: blocked/captcha (answer) |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 11005 |  |
| T014 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 24686 | steel: success (answer) |
| T015 | cold | yes | success |  | 200 | http | http |  | 2236 |  |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7283 |  |
| T017 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 8423 |  |
| T018 | cold | no | blocked | captcha | 429 | provider | http_compat → browser_local → provider | markdownCountMin, markdownMatches | 34803 | steel: blocked/captcha (answer) |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 10265 |  |
| T020 | cold | yes | success |  | 200 | http | http |  | 2309 |  |
| T021 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 22842 | steel: success (answer) |
| T022 | cold | yes | success |  | 200 | http | http |  | 2929 |  |
| T023 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 32704 | steel: success (answer) |
| T024 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 9588 |  |
| T025 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 31192 | steel: failed/empty_unverified (answer) |
| T026 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownMatches | 9362 |  |
| T027 | cold | yes | success |  | 200 | http | http |  | 3888 |  |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 3186 |  |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 27332 | steel: success (answer) |
| T031 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 25422 | steel: failed/empty_unverified (answer) |
| T033 | cold | yes | success |  | 200 | http | http |  | 3595 |  |
| T034 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 21204 | steel: blocked/bot_detected_generic (answer) |
| T035 | cold | yes | success |  | 200 | http | http |  | 2620 |  |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6387 |  |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 948 |  |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23571 | steel: blocked/bot_detected_generic (answer) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5179 |  |
| T040 | cold | yes | success |  | 200 | http | http |  | 1389 |  |
| T041 | cold | yes | success |  | 200 | http | http → browser_local |  | 3100 |  |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1969 |  |
| T043 | cold | no | blocked | bot_detected_generic | 405 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 21782 | steel: blocked/bot_detected_generic (answer) |
| T044 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7613 |  |
| T045 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 22309 | steel: blocked/bot_detected_generic (answer) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19339 | steel: blocked/bot_detected_generic (answer) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18930 | steel: blocked/cloudflare_challenge (answer) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 22123 | steel: blocked/cloudflare_challenge (answer) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2993 |  |
| T050 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 23896 | steel: success (answer) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4567 |  |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | minTables, markdownMatches | 25386 | steel: blocked/cloudflare_challenge (answer) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 15971 | steel: blocked/bot_detected_generic (answer) |
| T055 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | minTables, markdownMatches | 10493 |  |
| T056 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 1305 |  |
| T057 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3738 |  |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5004 |  |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3388 |  |
| T060 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 4391 |  |
| T061 | cold | yes | success |  | 200 | http | http |  | 3194 |  |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6184 |  |
| T063 | cold | yes | success |  | 200 | http | http |  | 1428 |  |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2403 |  |
| T065 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 11931 |  |
| T066 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 2802 |  |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3375 |  |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 19917 | steel: blocked/cloudflare_challenge (answer) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19957 | steel: blocked/cloudflare_challenge (answer) |
| T070 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin, markdownMatches | 920 |  |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19861 | steel: blocked/cloudflare_challenge (answer) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3508 |  |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6174 |  |
| T074 | cold | yes | success |  | 200 | http | http → browser_local → provider |  | 19622 | steel: blocked/cloudflare_challenge |
| T075 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3468 |  |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 18653 | steel: blocked/cloudflare_challenge (answer) |
| T077 | cold | yes | success |  | 200 | http | http |  | 1752 |  |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 2116 |  |
| T079 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6890 |  |
| T080 | cold | yes | success |  | 200 | http | http |  | 2567 |  |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1532 |  |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17028 | steel: blocked/cloudflare_challenge (answer) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 13531 |  |
| B003 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 17621 | steel: failed/empty_unverified (answer) |
| B004 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 21550 | steel: success (answer) |
| B005 | cold | yes | success |  | 200 | http | http |  | 3847 |  |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5938 |  |
| B007 | cold | yes | success |  | 200 | http | http |  | 4108 |  |
| B008 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3883 |  |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 927 |  |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7126 |  |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3856 |  |
| B012 | cold | yes | success |  | 200 | http | http |  | 1415 |  |
| B013 | cold | yes | success |  | 200 | http | http |  | 2024 |  |
| B014 | cold | yes | success |  | 200 | http | http |  | 1364 |  |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (the wait for a page that still shows its data is loading)

**Set-up.**
- The same server set-up, grant, Steel tariff and proxied network as `2026-10-09-pa4-steel-all-06b9354.md`. The grant's SHA-256 is `b2e32cb817d763f758e5755d94a61932182f3bf1894c09df39fc65fab5da1259`.
- The server ran at `004a107`. From that commit, the browser rung and the provider's wait up to 8 s for a page that still shows a loading indicator.
- During the run, a code review ran tests in this worktree, one of them on a real Chromium. That load may have slowed some pages.

**Compared with the run at `06b9354`, the same 92 tasks before the change:**

| | Before | After |
| --- | --- | --- |
| Verified, all 92 | 45 | 47 |
| Verified, frozen 50 | 11 | 11 |
| False successes | 16 | 13 |
| Paid calls | 31 | 33 |
| Ledger charge (at the ceiling) | $0.1033 | $0.1100 |
| p50 / p95 ms | 6120 / 23534 | 6890 / 29946 |

**False successes no longer:**
- B003 (Tesla inventory): it answered `success` with "Inventory Search Results Fetching..." before. This time it ended `failed`/`empty_unverified`, an honest failure and not a verified page.
- T025: it ended `failed`/`empty_unverified` on Steel's page, after the local browser's page went on to Steel.
- T033: it was verified this time. Its page had changed between the two earlier runs.

No task became a new false success.

**Newly verified:** T008 and T033. Neither is attributed to the change. T008's earlier answers were rate limits, and T033's page varies between runs.

**Latency:**
- Normal pages did not slow down. On the 45 tasks both runs verified, the median was 3980 ms here against 5025 ms before.
- The time went to these tasks:
  - T023 and T025 went on from the local browser to Steel, about 26–28 s more each.
  - Several tasks already answered by Steel took 6–13 s more each: T005, T002, T012, T038, T050 and T031.
  - B002 and T019 took 6–7 s more on the local browser.
- run-set.mjs does not record `loading_wait` events. Which pages waited is inferred from these times, not observed.

**Cost.** Steel states no price per call, so its calls are charged at the ceiling: an upper bound, not Steel's bill.
