# Weekly rerun: ZenRows arm, 2026-11-02

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `zenrows`, week 2026-W45, run on 2026-11-02
- Source commit: `b93c766a`
- Set: 51 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 10 (group 1 of 0–3, ISO week 45 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T017, T018, T019, T021, T022, T023, T025, T026, T029, T030
- Chrome: Google Chrome 156.0.8078.79 (previous weekly record: Google Chrome 156.0.8078.47)
- Account before the arm, as zenrows's API reports it: used 3492 of 5000 credits this period (TRIALING, plan Free, period ends 2026-11-13T03:05:18Z)
- Account after the arm: used 3940 of 5000 credits this period (TRIALING, plan Free, period ends 2026-11-13T03:05:18Z)
- Cost: 448 credits by the account's usage before and after the arm ($0.4480 as ZenRows prices them); credits by the runner's inference unknown
- Not run by the runner (its early stop): none

| Part | Planned | Attempted | Verified | False success |
| --- | --- | --- | --- | --- |
| all | 51 | 51 | 42 | 2 |
| healthy | 25 | 25 | 20 | 1 |
| challenge | 16 | 16 | 13 | 1 |
| rotation | 10 | 10 | 9 | 0 |

## Run: zenrows-all

Raw run: `.w2l/access/runs/2026-11-02T09-28-26-833Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --target zenrows --set all --only T015,T016,T020,T024,T027,T033,T035,T036,T039,T040,T041,T044,T051,T052,T058,T059,T061,T062,T063,T067,T072,T074,T077,T079,T080,T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008,T017,T018,T019,T021,T022,T023,T025,T026,T029,T030 --save-responses --record .w2l/access/weekly/2026-11-02-b93c766a/zenrows-all.md`
- Source commit: `b93c766a` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: ZenRows Fetch API, GET /v1/ (mode=auto, response_type=markdown) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Run: 2026-11-02T09:28:26.833Z → 2026-11-02T09:43:51.934Z
- Tasks: 51 from `research/access/tasks.v1.json` (set `all`, only T015, T016, T020, T024, T027, T033, T035, T036, T039, T040, T041, T044, T051, T052, T058, T059, T061, T062, T063, T067, T072, T074, T077, T079, T080, T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008, T017, T018, T019, T021, T022, T023, T025, T026, T029, T030); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 51, attempted 51, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 51 | 42 | 2 | 8424 | 80013 | unknown | unknown | unknown | unknown |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  |  | zenrows:auto | unknown |  | 21921 |
| T002 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1280 |
| T005 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin | 8619 |
| T015 | cold | yes | success |  |  | zenrows:auto | unknown |  | 3900 |
| T016 | cold | yes | success |  |  | zenrows:auto | unknown |  | 11513 |
| T017 | cold | yes | success |  |  | zenrows:auto | unknown |  | 4334 |
| T018 | cold | yes | success |  |  | zenrows:auto | unknown |  | 17349 |
| T019 | cold | no | failed | RESP002 |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 74134 |
| T020 | cold | yes | success |  |  | zenrows:auto | unknown |  | 9353 |
| T021 | cold | yes | success |  |  | zenrows:auto | unknown |  | 11546 |
| T022 | cold | yes | success |  |  | zenrows:auto | unknown |  | 2152 |
| T023 | cold | yes | success |  |  | zenrows:auto | unknown |  | 12097 |
| T024 | cold | yes | success |  |  | zenrows:auto | unknown |  | 3678 |
| T025 | cold | yes | success |  |  | zenrows:auto | unknown |  | 29221 |
| T026 | cold | yes | success |  |  | zenrows:auto | unknown |  | 5084 |
| T027 | cold | no | failed | RESP001 |  | zenrows:auto | unknown | markdownCountMin, markdownMatches | 91117 |
| T029 | cold | yes | success |  |  | zenrows:auto | unknown |  | 17774 |
| T030 | cold | yes | success |  |  | zenrows:auto | unknown |  | 2238 |
| T033 | cold | no (false success) | success |  |  | zenrows:auto | unknown | markdownCountMin | 17208 |
| T034 | cold | yes | success |  |  | zenrows:auto | unknown |  | 6385 |
| T035 | cold | yes | success |  |  | zenrows:auto | unknown |  | 6755 |
| T036 | cold | yes | success |  |  | zenrows:auto | unknown |  | 782 |
| T038 | cold | yes | success |  |  | zenrows:auto | unknown |  | 10427 |
| T039 | cold | yes | success |  |  | zenrows:auto | unknown |  | 5211 |
| T040 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1974 |
| T041 | cold | yes | success |  |  | zenrows:auto | unknown |  | 2518 |
| T044 | cold | yes | success |  |  | zenrows:auto | unknown |  | 3536 |
| T045 | cold | yes | success |  |  | zenrows:auto | unknown |  | 23649 |
| T046 | cold | yes | success |  |  | zenrows:auto | unknown |  | 8424 |
| T047 | cold | yes | success |  |  | zenrows:auto | unknown |  | 13685 |
| T048 | cold | yes | success |  |  | zenrows:auto | unknown |  | 39198 |
| T049 | cold | yes | success |  |  | zenrows:auto | unknown |  | 53081 |
| T051 | cold | no | failed | CTX0002 |  | zenrows:auto | unknown | markdownCountMin | 123025 |
| T052 | cold | no | failed | api_200 |  | zenrows:auto | unknown | minTables, markdownMatches | 46942 |
| T053 | cold | no | failed | RESP001 |  | zenrows:auto | unknown | markdownMatches | 80013 |
| T058 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1544 |
| T059 | cold | yes | success |  |  | zenrows:auto | unknown |  | 7423 |
| T061 | cold | yes | success |  |  | zenrows:auto | unknown |  | 3161 |
| T062 | cold | yes | success |  |  | zenrows:auto | unknown |  | 55985 |
| T063 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1844 |
| T067 | cold | yes | success |  |  | zenrows:auto | unknown |  | 1069 |
| T068 | cold | yes | success |  |  | zenrows:auto | unknown |  | 11767 |
| T071 | cold | yes | success |  |  | zenrows:auto | unknown |  | 17858 |
| T072 | cold | no | failed | REQS001 |  | zenrows:auto | unknown | markdownMatches, markdownCountMin | 376 |
| T074 | cold | yes | success |  |  | zenrows:auto | unknown |  | 2415 |
| T076 | cold | yes | success |  |  | zenrows:auto | unknown |  | 15385 |
| T077 | cold | yes | success |  |  | zenrows:auto | unknown |  | 3940 |
| T079 | cold | yes | success |  |  | zenrows:auto | unknown |  | 2779 |
| T080 | cold | yes | success |  |  | zenrows:auto | unknown |  | 4108 |
| B001 | cold | yes | success |  |  | zenrows:auto | unknown |  | 21947 |
| B008 | cold | no | failed | api_200 |  | zenrows:auto | unknown | markdownMatches, markdownCountMin | 3229 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
