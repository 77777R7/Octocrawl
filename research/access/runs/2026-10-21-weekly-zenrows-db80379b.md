# Weekly rerun: ZenRows arm, 2026-10-21

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `zenrows`, week 2026-W43, run on 2026-10-21
- Source commit: `db80379b`
- Set: 47 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 6 (group 3 of 0–3, ISO week 43 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T066, T069, T070, T075, T078, T081
- Chrome: Google Chrome 155.0.8059.85 (previous weekly record: Google Chrome 155.0.8059.80)
- Account before the arm, as zenrows's API reports it: used 338 of 5000 credits this period (TRIALING, plan Free, period ends 2026-11-13T03:05:18Z)
- Account after the arm: used 728 of 5000 credits this period (TRIALING, plan Free, period ends 2026-11-13T03:05:18Z)
- Cost: 390 credits by the account's usage before and after the arm ($0.3900 as ZenRows prices them); credits by the runner's inference unknown
- Not run by the runner (its early stop): none

| Part | Planned | Attempted | Verified | False success |
| --- | --- | --- | --- | --- |
| all | 47 | 47 | 30 | 5 |
| healthy | 25 | 25 | 19 | 1 |
| challenge | 16 | 16 | 9 | 2 |
| rotation | 6 | 6 | 2 | 2 |

## Run: zenrows-all

Raw run: `.w2l/access/runs/2026-10-20T18-14-51-324Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --target zenrows --set all --only T015,T016,T020,T024,T027,T033,T035,T036,T039,T040,T041,T044,T051,T052,T058,T059,T061,T062,T063,T067,T072,T074,T077,T079,T080,T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008,T066,T069,T070,T075,T078,T081 --save-responses --record .w2l/access/weekly/2026-10-21-db80379b/zenrows-all.md`
- Source commit: `db80379b` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: ZenRows Fetch API, GET /v1/ (mode=auto, response_type=markdown) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Run: 2026-10-20T18:14:51.324Z → 2026-10-20T18:34:17.482Z
- Tasks: 47 (set `all`, only T015, T016, T020, T024, T027, T033, T035, T036, T039, T040, T041, T044, T051, T052, T058, T059, T061, T062, T063, T067, T072, T074, T077, T079, T080, T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008, T066, T069, T070, T075, T078, T081); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 47, attempted 47, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 47 | 30 | 5 | 5317 | 121143 | unknown | unknown | unknown | unknown |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | failed | RESP001 |  | zenrows:auto | unknown | markdownMatches, markdownMatches | 63564 |
| T002 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1459 |
| T005 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin | 3711 |
| T015 | cold | yes | success |  |  | zenrows:auto | unknown |  | 2477 |
| T016 | cold | no | failed | api_200 |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 5311 |
| T020 | cold | yes | success |  |  | zenrows:auto | unknown |  | 81842 |
| T024 | cold | yes | success |  |  | zenrows:auto | unknown |  | 4308 |
| T027 | cold | no | failed | RESP001 |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 64294 |
| T033 | cold | yes | success |  |  | zenrows:auto | unknown |  | 8884 |
| T034 | cold | no | failed | api_200 |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 16758 |
| T035 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin | 7720 |
| T036 | cold | yes | success |  |  | zenrows:auto | unknown |  | 5317 |
| T038 | cold | yes | success |  |  | zenrows:auto | unknown |  | 138603 |
| T039 | cold | yes | success |  |  | zenrows:auto | unknown |  | 4392 |
| T040 | cold | yes | success |  |  | zenrows:auto | unknown |  | 4110 |
| T041 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1043 |
| T044 | cold | yes | success |  |  | zenrows:auto | unknown |  | 998 |
| T045 | cold | yes | success |  |  | zenrows:auto | unknown |  | 78724 |
| T046 | cold | yes | success |  |  | zenrows:auto | unknown |  | 121143 |
| T047 | cold | yes | success |  |  | zenrows:auto | unknown |  | 3288 |
| T048 | cold | yes | success |  |  | zenrows:auto | unknown |  | 32200 |
| T049 | cold | yes | success |  |  | zenrows:auto | unknown |  | 108178 |
| T051 | cold | yes | success |  |  | zenrows:auto | unknown |  | 35412 |
| T052 | cold | no | failed | RESP001 |  | zenrows:auto | unknown | minTables, markdownMatches | 54890 |
| T053 | cold | yes | success |  |  | zenrows:auto | unknown |  | 27918 |
| T058 | cold | yes | success |  |  | zenrows:auto | unknown |  | 4277 |
| T059 | cold | yes | success |  |  | zenrows:auto | unknown |  | 5838 |
| T061 | cold | yes | success |  |  | zenrows:auto | unknown |  | 2316 |
| T062 | cold | yes | success |  |  | zenrows:auto | unknown |  | 9650 |
| T063 | cold | yes | success |  |  | zenrows:auto | unknown |  | 702 |
| T066 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin | 4512 |
| T067 | cold | yes | success |  |  | zenrows:auto | unknown |  | 5297 |
| T068 | cold | yes | success |  |  | zenrows:auto | unknown |  | 7395 |
| T069 | cold | yes | success |  |  | zenrows:auto | unknown |  | 6055 |
| T070 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 597 |
| T071 | cold | no | failed | api_200 |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 13354 |
| T072 | cold | no | failed | REQS001 |  | zenrows:auto | unknown | markdownMatches, markdownCountMin | 325 |
| T074 | cold | yes | success |  |  | zenrows:auto | unknown |  | 16200 |
| T075 | cold | yes | success |  |  | zenrows:auto | unknown |  | 4764 |
| T076 | cold | no | failed | api_200 |  | zenrows:auto | unknown | markdownCountMin | 9455 |
| T077 | cold | no | failed | CTX0002 |  | zenrows:auto | unknown | markdownMatches, markdownCountMin | 180290 |
| T078 | cold | no | failed | REQS001 |  | zenrows:auto | unknown | markdownMatches, markdownMatches | 310 |
| T079 | cold | yes | success |  |  | zenrows:auto | unknown |  | 876 |
| T080 | cold | yes | success |  |  | zenrows:auto | unknown |  | 4036 |
| T081 | cold | no | failed | REQS001 |  | zenrows:auto | unknown | markdownMatches, markdownMatches | 315 |
| B001 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 10381 |
| B008 | cold | no | failed | api_200 |  | zenrows:auto | unknown | markdownMatches, markdownCountMin | 2529 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
