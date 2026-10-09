# Access task set run: all, 2026-10-09

- Command: `node research/access/run-set.mjs --set all --access "enhanced" --record research/access/runs/2026-10-09-pa4-steel-all-headings-e2fa0a4.md`
- Source commit: `e2fa0a49`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8798; access option: `"enhanced"`
- Exit address: 103.142.140.58
- Run: 2026-10-09T10:33:33.929Z → 2026-10-09T10:49:18.286Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 45 | 15 | 5283 | 29062 | unknown | unknown |

- Paid provider calls (cold): unknown; tasks verified with a paid call's page as the answer: unknown; charged by the spend ledger: unknown (a provider that states no price is charged its price ceiling: an upper bound, not its bill)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 20091 | steel: blocked/cloudflare_challenge (answer) |
| T002 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 19953 | steel: success (answer) |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 18371 | steel: success (answer) |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40239 |  |
| T005 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 25395 | steel: blocked/bot_detected_generic (answer) |
| T006 | cold | no (false success) | success |  | 202 | provider | http → browser_local → provider | markdownCountMin | 29062 | steel: success (answer) |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 1760 |  |
| T008 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 693 |  |
| T009 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3709 |  |
| T010 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 28658 | steel: success (answer) |
| T011 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 24233 | steel: failed/empty_unverified (answer) |
| T012 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19529 | steel: success (answer) |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 11124 |  |
| T014 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 31488 | steel: success (answer) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1690 |  |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6974 |  |
| T017 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 6618 |  |
| T018 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 10116 |  |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 3846 |  |
| T020 | cold | yes | success |  | 200 | http | http |  | 3727 |  |
| T021 | cold | no | failed | http_error | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17904 | steel: failed/http_error (answer) |
| T022 | cold | yes | success |  | 200 | http | http |  | 2982 |  |
| T023 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin | 14139 | steel: blocked/bot_detected_generic (answer) |
| T024 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6516 |  |
| T025 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 4319 |  |
| T026 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownMatches | 10527 |  |
| T027 | cold | yes | success |  | 200 | http | http |  | 3693 |  |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 3126 |  |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 25287 | steel: success (answer) |
| T031 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20117 | steel: failed/empty_unverified (answer) |
| T033 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 5219 |  |
| T034 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 21233 | steel: blocked/bot_detected_generic (answer) |
| T035 | cold | yes | success |  | 200 | http | http |  | 2149 |  |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5659 |  |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 708 |  |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17449 | steel: blocked/bot_detected_generic (answer) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4265 |  |
| T040 | cold | yes | success |  | 200 | http | http |  | 1454 |  |
| T041 | cold | yes | success |  | 200 | http | http → browser_local |  | 3014 |  |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1385 |  |
| T043 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 19080 | steel: success (answer) |
| T044 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6494 |  |
| T045 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16050 | steel: blocked/bot_detected_generic (answer) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16237 | steel: blocked/bot_detected_generic (answer) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17113 | steel: blocked/cloudflare_challenge (answer) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 17166 | steel: blocked/cloudflare_challenge (answer) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2608 |  |
| T050 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 16083 | steel: success (answer) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4530 |  |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | minTables, markdownMatches | 17632 | steel: blocked/cloudflare_challenge (answer) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 16095 | steel: blocked/bot_detected_generic (answer) |
| T055 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 33903 | steel: success (answer) |
| T056 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 989 |  |
| T057 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 4055 |  |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3977 |  |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2173 |  |
| T060 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 2719 |  |
| T061 | cold | yes | success |  | 200 | http | http |  | 2579 |  |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5116 |  |
| T063 | cold | yes | success |  | 200 | http | http |  | 1143 |  |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2128 |  |
| T065 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 11957 |  |
| T066 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 3237 |  |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3812 |  |
| T068 | cold | no | - |  |  |  |  | markdownMatches, markdownCountMin | 32520 | unknown |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19986 | steel: blocked/cloudflare_challenge (answer) |
| T070 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin, markdownMatches | 865 |  |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16189 | steel: blocked/cloudflare_challenge (answer) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3303 |  |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4281 |  |
| T074 | cold | yes | success |  | 200 | http | http → browser_local → provider |  | 20946 | steel: blocked/cloudflare_challenge |
| T075 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3424 |  |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 16910 | steel: blocked/cloudflare_challenge (answer) |
| T077 | cold | yes | success |  | 200 | http | http |  | 1481 |  |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 2013 |  |
| T079 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6877 |  |
| T080 | cold | yes | success |  | 200 | http | http |  | 2280 |  |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1333 |  |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15948 | steel: blocked/cloudflare_challenge (answer) |
| B002 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 20382 | steel: success (answer) |
| B003 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 18705 | steel: failed/empty_unverified (answer) |
| B004 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 19461 | steel: success (answer) |
| B005 | cold | yes | success |  | 200 | http | http |  | 3943 |  |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5283 |  |
| B007 | cold | yes | success |  | 200 | http | http |  | 4505 |  |
| B008 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3619 |  |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 731 |  |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6513 |  |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3107 |  |
| B012 | cold | yes | success |  | 200 | http | http |  | 894 |  |
| B013 | cold | yes | success |  | 200 | http | http |  | 1503 |  |
| B014 | cold | yes | success |  | 200 | http | http |  | 1200 |  |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (the first heading-only rule, superseded before review passed)

**Set-up.**
- The same set-up as `2026-10-09-pa4-steel-all-loading-76a1c70.md`: the Steel grant (SHA-256 `b2e32cb817d763f758e5755d94a61932182f3bf1894c09df39fc65fab5da1259`), Steel's tariff and the proxied network.
- The server ran at `e2fa0a4`. In that build the extractor (`extract-tf/15`) escalated any main region with fewer than 20 characters beside its headings and in-page jump links, whatever the strategy.
- Review then found legitimate pages this rule failed:
  - card grids named by headings;
  - a terse product region;
  - prose written in headings;
  - a one-line Chinese notice.

  It also found a recursive walk that overflowed on deep pages. The rule was narrowed in the next commit. This run is the first rule's.

**Compared with the run at `76a1c70`, just before:**

| | Before | This run |
| --- | --- | --- |
| Verified, all 92 | 47 | 45 |
| Verified, frozen 50 | 12 | 11 |
| False successes | 16 | 15 |
| Ledger charge (at the ceiling) | $0.1000 | $0.1067, one task's charge unknown |
| p50 / p95 ms | 5271 / 23654 | 5283 / 29062 |

**What changed:**
- **B003 (Tesla inventory) is no longer a false success.** It ended `failed`/`empty_unverified`.
- **T031 also ended `failed`/`empty_unverified`.** It had been a false success.
- **T023 no longer counts as one.** It ended `blocked` (`bot_detected_generic`), so it was not read at all.
- **New false successes, T012 and T043**, are pages read through Steel, which vary between runs.
- **Lost:**
  - T008: a rate limit on the http rung, as in earlier runs.
  - T011 (TikTok, verified before): this time Steel's page was a single video, 461 characters in all, and the run ended `failed`/`empty_unverified`. The video's caption alone is longer than the rule's 20 characters, so the run more likely got a different page with no main region than tripped the rule. This is not isolated: the HTML was not kept.
- **T068 (economist.com)** answered HTTP 500 once, after 32.5 s, so its charge is unknown. The API logged no cause. A single retry against the same server, after the run, answered 200.
