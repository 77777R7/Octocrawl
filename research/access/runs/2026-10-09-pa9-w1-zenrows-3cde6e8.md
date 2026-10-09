# Access task set run: all, 2026-10-09

- Command: `node research/access/run-set.mjs --target zenrows --set all --record research/access/runs/2026-10-09-pa9-w1-zenrows-3cde6e8.md`
- Source commit: `3cde6e8`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: ZenRows Fetch API, GET /v1/ (mode=auto, response_type=markdown) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Run: 2026-10-09T01:56:33.189Z → 2026-10-09T02:16:36.012Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 58 | 19 | 4706 | 66952 | unknown | unknown | unknown | unknown |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | failed | RESP001 |  | zenrows:auto |  | markdownMatches, markdownMatches | 61882 |
| T002 | cold | yes | success |  |  | zenrows:auto |  |  | 832 |
| T003 | cold | yes | success |  |  | zenrows:auto |  |  | 1742 |
| T004 | cold | yes | success |  |  | zenrows:auto |  |  | 1504 |
| T005 | cold | no (false success) | success |  |  | zenrows:auto |  | markdownCountMin | 7574 |
| T006 | cold | no | failed | api_200 |  | zenrows:auto |  | markdownCountMin, markdownMatches | 1230 |
| T007 | cold | yes | success |  |  | zenrows:auto |  |  | 840 |
| T008 | cold | yes | success |  |  | zenrows:auto |  |  | 819 |
| T009 | cold | yes | success |  |  | zenrows:auto |  |  | 3429 |
| T010 | cold | no (false success) | success |  |  | zenrows:auto |  | minTables | 4435 |
| T011 | cold | no (false success) | success |  |  | zenrows:auto |  | markdownMatches, markdownCountMin | 10510 |
| T012 | cold | no (false success) | success |  |  | zenrows:auto |  | markdownCountMin, markdownMatches | 1543 |
| T013 | cold | no (false success) | success |  |  | zenrows:auto |  | markdownCountMin | 19609 |
| T014 | cold | no (false success) | success |  |  | zenrows:auto |  | markdownCountMin | 40356 |
| T015 | cold | yes | success |  |  | zenrows:auto |  |  | 3510 |
| T016 | cold | yes | success |  |  | zenrows:auto |  |  | 5842 |
| T017 | cold | yes | success |  |  | zenrows:auto |  |  | 3811 |
| T018 | cold | yes | success |  |  | zenrows:auto |  |  | 2776 |
| T019 | cold | no (false success) | success |  |  | zenrows:auto |  | markdownCountMin | 601 |
| T020 | cold | no | failed | api_200 |  | zenrows:auto |  | markdownCountMin, markdownMatches | 7333 |
| T021 | cold | no | failed | RESP001 |  | zenrows:auto |  | markdownCountMin, markdownMatches | 66952 |
| T022 | cold | yes | success |  |  | zenrows:auto |  |  | 1732 |
| T023 | cold | yes | success |  |  | zenrows:auto |  |  | 16634 |
| T024 | cold | yes | success |  |  | zenrows:auto |  |  | 1108 |
| T025 | cold | no (false success) | success |  |  | zenrows:auto |  | markdownCountMin, markdownMatches | 40748 |
| T026 | cold | yes | success |  |  | zenrows:auto |  |  | 5587 |
| T027 | cold | yes | success |  |  | zenrows:auto |  |  | 3754 |
| T029 | cold | yes | success |  |  | zenrows:auto |  |  | 14813 |
| T030 | cold | yes | success |  |  | zenrows:auto |  |  | 1134 |
| T031 | cold | no | failed | api_200 |  | zenrows:auto |  | markdownCountMin, markdownMatches | 17125 |
| T033 | cold | yes | success |  |  | zenrows:auto |  |  | 7232 |
| T034 | cold | yes | success |  |  | zenrows:auto |  |  | 8742 |
| T035 | cold | yes | success |  |  | zenrows:auto |  |  | 5383 |
| T036 | cold | yes | success |  |  | zenrows:auto |  |  | 1189 |
| T037 | cold | no (false success) | success |  |  | zenrows:auto |  | markdownCountMin | 15570 |
| T038 | cold | yes | success |  |  | zenrows:auto |  |  | 5865 |
| T039 | cold | no (false success) | success |  |  | zenrows:auto |  | markdownCountMin, markdownMatches | 3350 |
| T040 | cold | yes | success |  |  | zenrows:auto |  |  | 539 |
| T041 | cold | yes | success |  |  | zenrows:auto |  |  | 12778 |
| T042 | cold | yes | success |  |  | zenrows:auto |  |  | 18742 |
| T043 | cold | yes | success |  |  | zenrows:auto |  |  | 2031 |
| T044 | cold | yes | success |  |  | zenrows:auto |  |  | 1068 |
| T045 | cold | no | failed | RESP001 |  | zenrows:auto |  | markdownCountMin, markdownMatches | 72547 |
| T046 | cold | yes | success |  |  | zenrows:auto |  |  | 7921 |
| T047 | cold | yes | success |  |  | zenrows:auto |  |  | 6279 |
| T048 | cold | yes | success |  |  | zenrows:auto |  |  | 69057 |
| T049 | cold | yes | success |  |  | zenrows:auto |  |  | 160478 |
| T050 | cold | yes | success |  |  | zenrows:auto |  |  | 63199 |
| T051 | cold | no | failed | api_200 |  | zenrows:auto |  | markdownCountMin | 22308 |
| T052 | cold | no | failed | RESP001 |  | zenrows:auto |  | minTables, markdownMatches | 82917 |
| T053 | cold | yes | success |  |  | zenrows:auto |  |  | 1994 |
| T055 | cold | no (false success) | success |  |  | zenrows:auto |  | minTables, markdownMatches | 3866 |
| T056 | cold | no (false success) | success |  |  | zenrows:auto |  | markdownCountMin | 15290 |
| T057 | cold | yes | success |  |  | zenrows:auto |  |  | 3178 |
| T058 | cold | yes | success |  |  | zenrows:auto |  |  | 1182 |
| T059 | cold | yes | success |  |  | zenrows:auto |  |  | 509 |
| T060 | cold | no (false success) | success |  |  | zenrows:auto |  | markdownCountMin | 606 |
| T061 | cold | yes | success |  |  | zenrows:auto |  |  | 1966 |
| T062 | cold | yes | success |  |  | zenrows:auto |  |  | 8896 |
| T063 | cold | yes | success |  |  | zenrows:auto |  |  | 9293 |
| T064 | cold | yes | success |  |  | zenrows:auto |  |  | 12210 |
| T065 | cold | no | failed | api_200 |  | zenrows:auto |  | markdownMatches, markdownCountMin | 3692 |
| T066 | cold | no (false success) | success |  |  | zenrows:auto |  | markdownCountMin | 10644 |
| T067 | cold | yes | success |  |  | zenrows:auto |  |  | 1224 |
| T068 | cold | yes | success |  |  | zenrows:auto |  |  | 5933 |
| T069 | cold | yes | success |  |  | zenrows:auto |  |  | 16588 |
| T070 | cold | no (false success) | success |  |  | zenrows:auto |  | markdownCountMin, markdownMatches | 648 |
| T071 | cold | yes | success |  |  | zenrows:auto |  |  | 10761 |
| T072 | cold | no | failed | REQS001 |  | zenrows:auto |  | markdownMatches, markdownCountMin | 314 |
| T073 | cold | no | failed | api_200 |  | zenrows:auto |  | markdownMatches, markdownCountMin | 7883 |
| T074 | cold | yes | success |  |  | zenrows:auto |  |  | 11616 |
| T075 | cold | yes | success |  |  | zenrows:auto |  |  | 6516 |
| T076 | cold | yes | success |  |  | zenrows:auto |  |  | 3357 |
| T077 | cold | yes | success |  |  | zenrows:auto |  |  | 4706 |
| T078 | cold | no | failed | REQS001 |  | zenrows:auto |  | markdownMatches, markdownMatches | 342 |
| T079 | cold | yes | success |  |  | zenrows:auto |  |  | 2968 |
| T080 | cold | yes | success |  |  | zenrows:auto |  |  | 1909 |
| T081 | cold | no | failed | REQS001 |  | zenrows:auto |  | markdownMatches, markdownMatches | 330 |
| B001 | cold | yes | success |  |  | zenrows:auto |  |  | 1506 |
| B002 | cold | yes | success |  |  | zenrows:auto |  |  | 16831 |
| B003 | cold | no (false success) | success |  |  | zenrows:auto |  | markdownCountMin, markdownMatches | 8070 |
| B004 | cold | yes | success |  |  | zenrows:auto |  |  | 34407 |
| B005 | cold | yes | success |  |  | zenrows:auto |  |  | 30008 |
| B006 | cold | yes | success |  |  | zenrows:auto |  |  | 2340 |
| B007 | cold | yes | success |  |  | zenrows:auto |  |  | 2402 |
| B008 | cold | no | failed | api_200 |  | zenrows:auto |  | markdownMatches, markdownCountMin | 6858 |
| B009 | cold | no | failed | REQS001 |  | zenrows:auto |  | markdownMatches, markdownCountMin | 351 |
| B010 | cold | no (false success) | success |  |  | zenrows:auto |  | minTables | 570 |
| B011 | cold | yes | success |  |  | zenrows:auto |  |  | 29086 |
| B012 | cold | no (false success) | success |  |  | zenrows:auto |  | minTables | 1974 |
| B013 | cold | no (false success) | success |  |  | zenrows:auto |  | minTables | 2036 |
| B014 | cold | yes | success |  |  | zenrows:auto |  |  | 753 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
