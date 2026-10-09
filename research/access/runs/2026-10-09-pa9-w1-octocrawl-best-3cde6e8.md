# Access task set run: all, 2026-10-09

- Command: `node research/access/run-set.mjs --set all --record research/access/runs/2026-10-09-pa9-w1-octocrawl-best-3cde6e8.md`
- Source commit: `3cde6e8` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=127.0.0.1,localhost)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8798; access option: none
- Exit address: not recorded
- Run: 2026-10-09T02:02:20.262Z → 2026-10-09T02:07:20.688Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 38 | 7 | 2685 | 8566 | 0 | unknown |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 2683 |
| T002 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 1955 |
| T003 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 1892 |
| T004 | cold | no | failed | connection_error |  | http | http | markdownMatches, markdownCountMin | 15182 |
| T005 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3008 |
| T006 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2583 |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 1563 |
| T008 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 963 |
| T009 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 2685 |
| T010 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | minTables | 8355 |
| T011 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2983 |
| T012 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | markdownCountMin | 3591 |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 10506 |
| T014 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 1711 |
| T015 | cold | yes | success |  | 200 | http | http |  | 1838 |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5532 |
| T017 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 4259 |
| T018 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 8797 |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 4596 |
| T020 | cold | yes | success |  | 200 | http | http |  | 1393 |
| T021 | cold | no | failed | http_error | 403 | http | http | markdownCountMin, markdownMatches | 823 |
| T022 | cold | yes | success |  | 200 | http | http |  | 2001 |
| T023 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 2014 |
| T024 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5850 |
| T025 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3513 |
| T026 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 12001 |
| T027 | cold | yes | success |  | 200 | http | http |  | 3313 |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 2798 |
| T030 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3627 |
| T031 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3924 |
| T033 | cold | yes | success |  | 200 | http | http |  | 2493 |
| T034 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1340 |
| T035 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3439 |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4831 |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 599 |
| T038 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2841 |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3640 |
| T040 | cold | yes | success |  | 200 | http | http |  | 1059 |
| T041 | cold | yes | success |  | 200 | http | http → browser_local |  | 3756 |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1309 |
| T043 | cold | no | failed | http_error | 405 | http | http | markdownCountMin, markdownMatches | 1207 |
| T044 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5935 |
| T045 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3735 |
| T046 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2528 |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2110 |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 2149 |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2400 |
| T050 | cold | no | failed | http_error | 403 | http | http | markdownMatches, markdownMatches | 730 |
| T051 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin | 2128 |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | minTables, markdownMatches | 4049 |
| T053 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches | 2532 |
| T055 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | minTables, markdownMatches | 8566 |
| T056 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 830 |
| T057 | cold | no | failed | http_error | 403 | http | http_compat | markdownMatches, markdownCountMin | 489 |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4406 |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2077 |
| T060 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 3679 |
| T061 | cold | yes | success |  | 200 | http | http |  | 3608 |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4967 |
| T063 | cold | yes | success |  | 200 | http | http |  | 1112 |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3141 |
| T065 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3817 |
| T066 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 2994 |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2617 |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2575 |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1961 |
| T070 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin, markdownMatches | 668 |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1999 |
| T072 | cold | yes | success |  | 200 | http | http |  | 3325 |
| T073 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2367 |
| T074 | cold | yes | success |  | 200 | http | http → browser_local |  | 2701 |
| T075 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3196 |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin | 1783 |
| T077 | cold | yes | success |  | 200 | http | http |  | 2283 |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1448 |
| T079 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6125 |
| T080 | cold | yes | success |  | 200 | http | http |  | 2525 |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1131 |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1855 |
| B002 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 4303 |
| B003 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1920 |
| B004 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 3650 |
| B005 | cold | yes | success |  | 200 | http | http |  | 3620 |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5158 |
| B007 | cold | yes | success |  | 200 | http | http |  | 3928 |
| B008 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3244 |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 841 |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7132 |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2980 |
| B012 | cold | yes | success |  | 200 | http | http |  | 1572 |
| B013 | cold | yes | success |  | 200 | http | http |  | 1839 |
| B014 | cold | yes | success |  | 200 | http | http |  | 1166 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
