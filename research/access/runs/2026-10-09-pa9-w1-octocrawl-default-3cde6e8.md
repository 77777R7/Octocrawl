# Access task set run: all, 2026-10-09

- Command: `node research/access/run-set.mjs --set all --record research/access/runs/2026-10-09-pa9-w1-octocrawl-default-3cde6e8.md`
- Source commit: `3cde6e8`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=127.0.0.1,localhost)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8797; access option: none
- Exit address: not recorded
- Run: 2026-10-09T01:56:33.189Z → 2026-10-09T02:02:20.182Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 36 | 9 | 2912 | 11408 | 0 | unknown |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 2912 |
| T002 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 2112 |
| T003 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2218 |
| T004 | cold | no | failed | connection_error |  | http | http | markdownMatches, markdownCountMin | 15172 |
| T005 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2492 |
| T006 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3061 |
| T007 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1668 |
| T008 | cold | yes | success |  | 200 | http | http |  | 1525 |
| T009 | cold | no | failed | timeout |  | http | http | markdownMatches, markdownMatches | 11408 |
| T010 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | minTables | 8624 |
| T011 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local |  | 4751 |
| T012 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | markdownCountMin | 5432 |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 11496 |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 1777 |
| T015 | cold | yes | success |  | 200 | http | http |  | 1646 |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5235 |
| T017 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 8374 |
| T018 | cold | no | blocked | captcha | 429 | http | http | markdownCountMin, markdownMatches | 1930 |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 4147 |
| T020 | cold | yes | success |  | 200 | http | http |  | 1575 |
| T021 | cold | no | failed | http_error | 403 | http | http | markdownCountMin, markdownMatches | 1136 |
| T022 | cold | yes | success |  | 200 | http | http |  | 2780 |
| T023 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 4283 |
| T024 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7122 |
| T025 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 4831 |
| T026 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 12507 |
| T027 | cold | yes | success |  | 200 | http | http |  | 3411 |
| T029 | cold | no | failed | http_error | 403 | http | http | markdownCountMin, markdownMatches | 1721 |
| T030 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3727 |
| T031 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4061 |
| T033 | cold | yes | success |  | 200 | http | http |  | 2103 |
| T034 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 4281 |
| T035 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1909 |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8916 |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 802 |
| T038 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2999 |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4144 |
| T040 | cold | yes | success |  | 200 | http | http |  | 1944 |
| T041 | cold | yes | success |  | 200 | http | http → browser_local |  | 4080 |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1509 |
| T043 | cold | no | failed | http_error | 405 | http | http | markdownCountMin, markdownMatches | 2039 |
| T044 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6653 |
| T045 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 4116 |
| T046 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2675 |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2332 |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 2269 |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2440 |
| T050 | cold | no | failed | http_error | 403 | http | http | markdownMatches, markdownMatches | 957 |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4487 |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | minTables, markdownMatches | 4623 |
| T053 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches | 3030 |
| T055 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | minTables, markdownMatches | 9594 |
| T056 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 1140 |
| T057 | cold | no | failed | http_error | 403 | http | http | markdownMatches, markdownCountMin | 556 |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4772 |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2478 |
| T060 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 2072 |
| T061 | cold | yes | success |  | 200 | http | http |  | 6427 |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4984 |
| T063 | cold | yes | success |  | 200 | http | http |  | 1120 |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2124 |
| T065 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4298 |
| T066 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 2273 |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2443 |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2391 |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2175 |
| T070 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin, markdownMatches | 966 |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3470 |
| T072 | cold | yes | success |  | 200 | http | http |  | 3807 |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4443 |
| T074 | cold | yes | success |  | 200 | http | http → browser_local |  | 2508 |
| T075 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3543 |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin | 2006 |
| T077 | cold | yes | success |  | 200 | http | http |  | 12936 |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1473 |
| T079 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5795 |
| T080 | cold | yes | success |  | 200 | http | http |  | 2071 |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1169 |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2169 |
| B002 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2649 |
| B003 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2225 |
| B004 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 3815 |
| B005 | cold | yes | success |  | 200 | http | http |  | 4382 |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5144 |
| B007 | cold | yes | success |  | 200 | http | http |  | 4141 |
| B008 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3335 |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 888 |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6930 |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3192 |
| B012 | cold | yes | success |  | 200 | http | http |  | 1154 |
| B013 | cold | yes | success |  | 200 | http | http |  | 1223 |
| B014 | cold | yes | success |  | 200 | http | http |  | 1189 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
