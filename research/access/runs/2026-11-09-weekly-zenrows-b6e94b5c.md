# Weekly rerun: ZenRows arm, 2026-11-09

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `zenrows`, week 2026-W46, run on 2026-11-09
- Source commit: `b6e94b5c`
- Set: 51 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 10 (group 2 of 0–3, ISO week 46 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T037, T042, T043, T050, T055, T056, T057, T060, T064, T065
- Chrome: Google Chrome 156.0.8078.81 (previous weekly record: Google Chrome 156.0.8078.47)
- Account before the arm, as zenrows's API reports it: used 3941 of 5000 credits this period (TRIALING, plan Free, period ends 2026-11-13T03:05:18Z)
- Account after the arm: used 4338 of 5000 credits this period (TRIALING, plan Free, period ends 2026-11-13T03:05:18Z)
- Cost: 397 credits by the account's usage before and after the arm ($0.3970 as ZenRows prices them); credits by the runner's inference unknown
- Not run by the runner (its early stop): none

| Part | Planned | Attempted | Verified | False success |
| --- | --- | --- | --- | --- |
| all | 51 | 51 | 36 | 7 |
| healthy | 25 | 25 | 20 | 2 |
| challenge | 16 | 16 | 11 | 1 |
| rotation | 10 | 10 | 5 | 4 |

## Run: zenrows-all

Raw run: `.w2l/access/runs/2026-11-09T02-57-01-744Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --target zenrows --set all --only T015,T016,T020,T024,T027,T033,T035,T036,T039,T040,T041,T044,T051,T052,T058,T059,T061,T062,T063,T067,T072,T074,T077,T079,T080,T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008,T037,T042,T043,T050,T055,T056,T057,T060,T064,T065 --save-responses --record .w2l/access/weekly/2026-11-09-b6e94b5c/zenrows-all.md`
- Source commit: `b6e94b5c` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: ZenRows Fetch API, GET /v1/ (mode=auto, response_type=markdown) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Run: 2026-11-09T02:57:01.744Z → 2026-11-09T03:10:21.992Z
- Tasks: 51 from `research/access/tasks.v1.json` (set `all`, only T015, T016, T020, T024, T027, T033, T035, T036, T039, T040, T041, T044, T051, T052, T058, T059, T061, T062, T063, T067, T072, T074, T077, T079, T080, T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008, T037, T042, T043, T050, T055, T056, T057, T060, T064, T065); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 51, attempted 51, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 51 | 36 | 7 | 4426 | 83420 | unknown | unknown | unknown | unknown |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | failed | RESP001 |  | zenrows:auto | unknown | markdownMatches, markdownMatches | 42847 |
| T002 | cold | yes | success |  |  | zenrows:auto | unknown |  | 896 |
| T005 | cold | no | failed | api_200 |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 22341 |
| T015 | cold | yes | success |  |  | zenrows:auto | unknown |  | 4426 |
| T016 | cold | yes | success |  |  | zenrows:auto | unknown |  | 13857 |
| T020 | cold | yes | success |  |  | zenrows:auto | unknown |  | 14300 |
| T024 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1314 |
| T027 | cold | no | failed | RESP001 |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 115976 |
| T033 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin | 16158 |
| T034 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin | 9665 |
| T035 | cold | yes | success |  |  | zenrows:auto | unknown |  | 2141 |
| T036 | cold | yes | success |  |  | zenrows:auto | unknown |  | 2344 |
| T037 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin | 24909 |
| T038 | cold | yes | success |  |  | zenrows:auto | unknown |  | 4089 |
| T039 | cold | no | failed | api_200 |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 37511 |
| T040 | cold | yes | success |  |  | zenrows:auto | unknown |  | 828 |
| T041 | cold | yes | success |  |  | zenrows:auto | unknown |  | 5065 |
| T042 | cold | yes | success |  |  | zenrows:auto | unknown |  | 66852 |
| T043 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1048 |
| T044 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1192 |
| T045 | cold | no | failed | RESP001 |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 163510 |
| T046 | cold | yes | success |  |  | zenrows:auto | unknown |  | 83420 |
| T047 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1711 |
| T048 | cold | yes | success |  |  | zenrows:auto | unknown |  | 3190 |
| T049 | cold | yes | success |  |  | zenrows:auto | unknown |  | 14464 |
| T050 | cold | yes | success |  |  | zenrows:auto | unknown |  | 13998 |
| T051 | cold | yes | success |  |  | zenrows:auto | unknown |  | 4997 |
| T052 | cold | no (false success) | success |  |  | zenrows:auto | unknown | minTables | 13959 |
| T053 | cold | yes | success |  |  | zenrows:auto | unknown |  | 7821 |
| T055 | cold | no (false success) | success |  |  | zenrows:auto | unknown | minTables, markdownMatches | 13429 |
| T056 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin | 17856 |
| T057 | cold | no | failed | api_200 |  | zenrows:auto | unknown | markdownMatches, markdownCountMin | 2934 |
| T058 | cold | yes | success |  |  | zenrows:auto | unknown |  | 823 |
| T059 | cold | yes | success |  |  | zenrows:auto | unknown |  | 817 |
| T060 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin | 713 |
| T061 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1202 |
| T062 | cold | yes | success |  |  | zenrows:auto | unknown |  | 17828 |
| T063 | cold | yes | success |  |  | zenrows:auto | unknown |  | 930 |
| T064 | cold | yes | success |  |  | zenrows:auto | unknown |  | 5529 |
| T065 | cold | yes | success |  |  | zenrows:auto | unknown |  | 9183 |
| T067 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1100 |
| T068 | cold | yes | success |  |  | zenrows:auto | unknown |  | 5993 |
| T071 | cold | yes | success |  |  | zenrows:auto | unknown |  | 14439 |
| T072 | cold | no | failed | REQS001 |  | zenrows:auto | unknown | markdownMatches, markdownCountMin | 371 |
| T074 | cold | yes | success |  |  | zenrows:auto | unknown |  | 630 |
| T076 | cold | yes | success |  |  | zenrows:auto | unknown |  | 3194 |
| T077 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1428 |
| T079 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1288 |
| T080 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1645 |
| B001 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1449 |
| B008 | cold | no | failed | api_200 |  | zenrows:auto | unknown | markdownMatches, markdownCountMin | 2471 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
