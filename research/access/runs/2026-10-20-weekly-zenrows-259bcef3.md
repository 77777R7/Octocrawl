# Weekly rerun: ZenRows arm, 2026-10-20

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `zenrows`, week 2026-W43, run on 2026-10-20
- Source commit: `259bcef3`
- Set: 47 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 6 (group 3 of 0–3, ISO week 43 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T066, T069, T070, T075, T078, T081
- Chrome: Google Chrome 155.0.8059.80 (previous weekly record: Google Chrome 155.0.8059.80 (the P0.1 baseline, research/access/runs/2026-10-20-pa-next-baseline-ic16-1c4d9178.md))
- Account before the arm, as zenrows's API reports it: used 0 of 5000 credits this period (TRIALING, plan Free, period ends 2026-11-13T03:05:18Z)
- Account after the arm: used 338 of 5000 credits this period (TRIALING, plan Free, period ends 2026-11-13T03:05:18Z)
- Cost: 338 credits by the account's usage before and after the arm ($0.3380 as ZenRows prices them); credits by the runner's inference unknown
- Not run by the runner (its early stop): none

| Part | Planned | Attempted | Verified | False success |
| --- | --- | --- | --- | --- |
| all | 47 | 47 | 34 | 3 |
| healthy | 25 | 25 | 21 | 1 |
| challenge | 16 | 16 | 11 | 0 |
| rotation | 6 | 6 | 2 | 2 |

## Run: zenrows-all

Raw run: `.w2l/access/runs/2026-10-19T18-38-41-464Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --target zenrows --set all --only T015,T016,T020,T024,T027,T033,T035,T036,T039,T040,T041,T044,T051,T052,T058,T059,T061,T062,T063,T067,T072,T074,T077,T079,T080,T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008,T066,T069,T070,T075,T078,T081 --save-responses --record .w2l/access/weekly/2026-10-20-259bcef3/zenrows-all.md`
- Source commit: `4b9aa8be` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: ZenRows Fetch API, GET /v1/ (mode=auto, response_type=markdown) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Run: 2026-10-19T18:38:41.464Z → 2026-10-19T18:51:21.342Z
- Tasks: 47 (set `all`, only T015, T016, T020, T024, T027, T033, T035, T036, T039, T040, T041, T044, T051, T052, T058, T059, T061, T062, T063, T067, T072, T074, T077, T079, T080, T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008, T066, T069, T070, T075, T078, T081); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 47, attempted 47, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 47 | 34 | 3 | 4619 | 94452 | unknown | unknown | unknown | unknown |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | failed | RESP001 |  | zenrows:auto | unknown | markdownMatches, markdownMatches | 49997 |
| T002 | cold | yes | success |  |  | zenrows:auto | unknown |  | 2782 |
| T005 | cold | no | failed | api_200 |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 18364 |
| T015 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1269 |
| T016 | cold | yes | success |  |  | zenrows:auto | unknown |  | 12274 |
| T020 | cold | yes | success |  |  | zenrows:auto | unknown |  | 148537 |
| T024 | cold | yes | success |  |  | zenrows:auto | unknown |  | 3294 |
| T027 | cold | no | failed | RESP001 |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 87541 |
| T033 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin | 4411 |
| T034 | cold | yes | success |  |  | zenrows:auto | unknown |  | 5712 |
| T035 | cold | yes | success |  |  | zenrows:auto | unknown |  | 2422 |
| T036 | cold | yes | success |  |  | zenrows:auto | unknown |  | 730 |
| T038 | cold | yes | success |  |  | zenrows:auto | unknown |  | 8409 |
| T039 | cold | yes | success |  |  | zenrows:auto | unknown |  | 8395 |
| T040 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1146 |
| T041 | cold | yes | success |  |  | zenrows:auto | unknown |  | 988 |
| T044 | cold | yes | success |  |  | zenrows:auto | unknown |  | 2533 |
| T045 | cold | no | failed | RESP001 |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 99990 |
| T046 | cold | yes | success |  |  | zenrows:auto | unknown |  | 5075 |
| T047 | cold | yes | success |  |  | zenrows:auto | unknown |  | 10473 |
| T048 | cold | yes | success |  |  | zenrows:auto | unknown |  | 7249 |
| T049 | cold | yes | success |  |  | zenrows:auto | unknown |  | 94452 |
| T051 | cold | yes | success |  |  | zenrows:auto | unknown |  | 19269 |
| T052 | cold | no | failed | RESP001 |  | zenrows:auto | unknown | minTables, markdownMatches | 67536 |
| T053 | cold | yes | success |  |  | zenrows:auto | unknown |  | 11493 |
| T058 | cold | yes | success |  |  | zenrows:auto | unknown |  | 879 |
| T059 | cold | yes | success |  |  | zenrows:auto | unknown |  | 4619 |
| T061 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1743 |
| T062 | cold | yes | success |  |  | zenrows:auto | unknown |  | 8628 |
| T063 | cold | yes | success |  |  | zenrows:auto | unknown |  | 717 |
| T066 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin | 5359 |
| T067 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1189 |
| T068 | cold | yes | success |  |  | zenrows:auto | unknown |  | 7872 |
| T069 | cold | yes | success |  |  | zenrows:auto | unknown |  | 3433 |
| T070 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 778 |
| T071 | cold | no | failed | api_200 |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 14728 |
| T072 | cold | no | failed | REQS001 |  | zenrows:auto | unknown | markdownMatches, markdownCountMin | 340 |
| T074 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1609 |
| T075 | cold | yes | success |  |  | zenrows:auto | unknown |  | 3723 |
| T076 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1940 |
| T077 | cold | yes | success |  |  | zenrows:auto | unknown |  | 6956 |
| T078 | cold | no | failed | REQS001 |  | zenrows:auto | unknown | markdownMatches, markdownMatches | 324 |
| T079 | cold | yes | success |  |  | zenrows:auto | unknown |  | 5140 |
| T080 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1924 |
| T081 | cold | no | failed | REQS001 |  | zenrows:auto | unknown | markdownMatches, markdownMatches | 290 |
| B001 | cold | yes | success |  |  | zenrows:auto | unknown |  | 10209 |
| B008 | cold | no | failed | api_200 |  | zenrows:auto | unknown | markdownMatches, markdownCountMin | 3024 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
