# Weekly rerun: Firecrawl Cloud arm, 2026-10-26

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `firecrawl`, week 2026-W44, run on 2026-10-26
- Source commit: `fef3d8f8`
- Set: 51 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 10 (group 0 of 0–3, ISO week 44 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T003, T004, T006, T007, T009, T010, T011, T012, T013, T014
- Chrome: Google Chrome 156.0.8078.47 (previous weekly record: Google Chrome 155.0.8059.85; major version changed, the 16 tasks were run twice)
- Account before the arm, as firecrawl's API reports it: remaining 490 of plan 1000 (period ends 2026-11-22T17:13:36.213Z)
- Account after the arm: remaining 413 of plan 1000 (period ends 2026-11-22T17:13:36.213Z)
- Cost: 77 credits by the account's usage before and after the arm; credits by the runner's inference 48
- Not run by the runner (its early stop): none

| Part | Planned | Attempted | Verified | False success |
| --- | --- | --- | --- | --- |
| all | 51 | 51 | 41 | 7 |
| healthy | 25 | 25 | 21 | 3 |
| challenge | 16 | 16 | 14 | 1 |
| rotation | 10 | 10 | 6 | 3 |

## Run: firecrawl-all

Raw run: `.w2l/access/runs/2026-10-26T03-30-38-904Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --target firecrawl --set all --only T015,T016,T020,T024,T027,T033,T035,T036,T039,T040,T041,T044,T051,T052,T058,T059,T061,T062,T063,T067,T072,T074,T077,T079,T080,T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008,T003,T004,T006,T007,T009,T010,T011,T012,T013,T014 --save-responses --record .w2l/access/weekly/2026-10-26-fef3d8f8/firecrawl-all.md`
- Source commit: `fef3d8f8` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: Firecrawl Cloud, POST /v2/scrape (proxy auto, maxAge 0, storeInCache false) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Run: 2026-10-26T03:30:38.904Z → 2026-10-26T03:36:00.217Z
- Tasks: 51 from `research/access/tasks.v1.json` (set `all`, only T015, T016, T020, T024, T027, T033, T035, T036, T039, T040, T041, T044, T051, T052, T058, T059, T061, T062, T063, T067, T072, T074, T077, T079, T080, T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008, T003, T004, T006, T007, T009, T010, T011, T012, T013, T014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 51, attempted 51, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 51 | 41 | 7 | 3065 | 12078 | unknown | unknown | 48 | 1171 |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2095 |
| T002 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 11222 |
| T003 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2568 |
| T004 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2345 |
| T005 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin | 2130 |
| T006 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3145 |
| T007 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2795 |
| T009 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2765 |
| T010 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | minTables, markdownMatches | 5011 |
| T011 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownMatches, markdownCountMin | 348 |
| T012 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin, markdownMatches | 318 |
| T013 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 8043 |
| T014 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin | 6386 |
| T015 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 13260 |
| T016 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4819 |
| T020 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5968 |
| T024 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 8743 |
| T027 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 6164 |
| T033 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4678 |
| T034 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5908 |
| T035 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3292 |
| T036 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2437 |
| T038 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4877 |
| T039 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3351 |
| T040 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2614 |
| T041 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5532 |
| T044 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3065 |
| T045 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 12135 |
| T046 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 791 |
| T047 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3617 |
| T048 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4485 |
| T049 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownCountMin, markdownMatches | 364 |
| T051 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4522 |
| T052 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | minTables | 1311 |
| T053 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2955 |
| T058 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownMatches | 2665 |
| T059 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2665 |
| T061 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2556 |
| T062 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1059 |
| T063 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5180 |
| T067 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1962 |
| T068 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1885 |
| T071 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 9730 |
| T072 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 6624 |
| T074 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2285 |
| T076 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2919 |
| T077 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1505 |
| T079 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownMatches | 12078 |
| T080 | cold | no | failed | Enrichment is not enabled for company profiles on this team. An organization admin can choose enrichment providers at https://www.firecrawl.dev/app/alexandria?enrichment=true |  | firecrawl | unknown | markdownMatches, markdownMatches | 360 |
| B001 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2656 |
| B008 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 6450 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
