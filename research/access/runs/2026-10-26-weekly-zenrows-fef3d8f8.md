# Weekly rerun: ZenRows arm, 2026-10-26

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `zenrows`, week 2026-W44, run on 2026-10-26
- Source commit: `fef3d8f8`
- Set: 51 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 10 (group 0 of 0–3, ISO week 44 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T003, T004, T006, T007, T009, T010, T011, T012, T013, T014
- Chrome: Google Chrome 156.0.8078.47 (previous weekly record: Google Chrome 155.0.8059.85; major version changed, the 16 tasks were run twice)
- Account before the arm, as zenrows's API reports it: used 3054 of 5000 credits this period (TRIALING, plan Free, period ends 2026-11-13T03:05:18Z)
- Account after the arm: used 3491 of 5000 credits this period (TRIALING, plan Free, period ends 2026-11-13T03:05:18Z)
- Cost: 437 credits by the account's usage before and after the arm ($0.4370 as ZenRows prices them); credits by the runner's inference unknown
- Not run by the runner (its early stop): none

| Part | Planned | Attempted | Verified | False success |
| --- | --- | --- | --- | --- |
| all | 51 | 51 | 34 | 9 |
| healthy | 25 | 25 | 20 | 2 |
| challenge | 16 | 16 | 10 | 2 |
| rotation | 10 | 10 | 4 | 5 |

## Run: zenrows-all

Raw run: `.w2l/access/runs/2026-10-26T03-36-03-749Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --target zenrows --set all --only T015,T016,T020,T024,T027,T033,T035,T036,T039,T040,T041,T044,T051,T052,T058,T059,T061,T062,T063,T067,T072,T074,T077,T079,T080,T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008,T003,T004,T006,T007,T009,T010,T011,T012,T013,T014 --save-responses --record .w2l/access/weekly/2026-10-26-fef3d8f8/zenrows-all.md`
- Source commit: `fef3d8f8` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: ZenRows Fetch API, GET /v1/ (mode=auto, response_type=markdown) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Run: 2026-10-26T03:36:03.749Z → 2026-10-26T03:51:19.361Z
- Tasks: 51 from `research/access/tasks.v1.json` (set `all`, only T015, T016, T020, T024, T027, T033, T035, T036, T039, T040, T041, T044, T051, T052, T058, T059, T061, T062, T063, T067, T072, T074, T077, T079, T080, T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008, T003, T004, T006, T007, T009, T010, T011, T012, T013, T014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 51, attempted 51, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 51 | 34 | 9 | 4505 | 107098 | unknown | unknown | unknown | unknown |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | failed | RESP001 |  | zenrows:auto | unknown | markdownMatches, markdownMatches | 50750 |
| T002 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1266 |
| T003 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1742 |
| T004 | cold | yes | success |  |  | zenrows:auto | unknown |  | 2091 |
| T005 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin | 3761 |
| T006 | cold | no | failed | api_200 |  | zenrows:auto | unknown | markdownMatches, markdownCountMin | 3267 |
| T007 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1513 |
| T009 | cold | yes | success |  |  | zenrows:auto | unknown |  | 3696 |
| T010 | cold | no (false success) | success |  |  | zenrows:auto | unknown | minTables | 4132 |
| T011 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownMatches, markdownCountMin | 6416 |
| T012 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 3166 |
| T013 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 5006 |
| T014 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin | 37013 |
| T015 | cold | yes | success |  |  | zenrows:auto | unknown |  | 3432 |
| T016 | cold | yes | success |  |  | zenrows:auto | unknown |  | 5989 |
| T020 | cold | yes | success |  |  | zenrows:auto | unknown |  | 75032 |
| T024 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1200 |
| T027 | cold | no | failed | RESP001 |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 117105 |
| T033 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin | 15408 |
| T034 | cold | yes | success |  |  | zenrows:auto | unknown |  | 8551 |
| T035 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1589 |
| T036 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1059 |
| T038 | cold | yes | success |  |  | zenrows:auto | unknown |  | 4396 |
| T039 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 5142 |
| T040 | cold | yes | success |  |  | zenrows:auto | unknown |  | 862 |
| T041 | cold | yes | success |  |  | zenrows:auto | unknown |  | 4505 |
| T044 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1625 |
| T045 | cold | yes | success |  |  | zenrows:auto | unknown |  | 17227 |
| T046 | cold | yes | success |  |  | zenrows:auto | unknown |  | 5948 |
| T047 | cold | yes | success |  |  | zenrows:auto | unknown |  | 7970 |
| T048 | cold | no | failed | CTX0002 |  | zenrows:auto | unknown | markdownMatches, markdownMatches | 90821 |
| T049 | cold | yes | success |  |  | zenrows:auto | unknown |  | 176134 |
| T051 | cold | yes | success |  |  | zenrows:auto | unknown |  | 107098 |
| T052 | cold | no | failed | api_200 |  | zenrows:auto | unknown | minTables, markdownMatches | 10322 |
| T053 | cold | yes | success |  |  | zenrows:auto | unknown |  | 40628 |
| T058 | cold | yes | success |  |  | zenrows:auto | unknown |  | 859 |
| T059 | cold | yes | success |  |  | zenrows:auto | unknown |  | 739 |
| T061 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1096 |
| T062 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1691 |
| T063 | cold | yes | success |  |  | zenrows:auto | unknown |  | 636 |
| T067 | cold | yes | success |  |  | zenrows:auto | unknown |  | 6518 |
| T068 | cold | yes | success |  |  | zenrows:auto | unknown |  | 17741 |
| T071 | cold | no | failed | api_200 |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 17177 |
| T072 | cold | no | failed | REQS001 |  | zenrows:auto | unknown | markdownMatches, markdownCountMin | 331 |
| T074 | cold | yes | success |  |  | zenrows:auto | unknown |  | 13922 |
| T076 | cold | yes | success |  |  | zenrows:auto | unknown |  | 6544 |
| T077 | cold | yes | success |  |  | zenrows:auto | unknown |  | 7407 |
| T079 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1086 |
| T080 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1833 |
| B001 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 8672 |
| B008 | cold | no | failed | api_200 |  | zenrows:auto | unknown | markdownMatches, markdownCountMin | 3365 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
