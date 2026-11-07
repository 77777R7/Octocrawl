# Weekly rerun: Firecrawl Cloud arm, 2026-11-02

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `firecrawl`, week 2026-W45, run on 2026-11-02
- Source commit: `b93c766a`
- Set: 51 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 10 (group 1 of 0–3, ISO week 45 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T017, T018, T019, T021, T022, T023, T025, T026, T029, T030
- Chrome: Google Chrome 156.0.8078.79 (previous weekly record: Google Chrome 156.0.8078.47)
- Account before the arm, as firecrawl's API reports it: remaining 355 of plan 1000 (period ends 2026-11-22T17:13:36.213Z)
- Account after the arm: remaining 277 of plan 1000 (period ends 2026-11-22T17:13:36.213Z)
- Cost: 78 credits by the account's usage before and after the arm; credits by the runner's inference 49
- Not run by the runner (its early stop): none

| Part | Planned | Attempted | Verified | False success |
| --- | --- | --- | --- | --- |
| all | 51 | 51 | 43 | 6 |
| healthy | 25 | 25 | 21 | 3 |
| challenge | 16 | 16 | 14 | 1 |
| rotation | 10 | 10 | 8 | 2 |

## Run: firecrawl-all

Raw run: `.w2l/access/runs/2026-11-02T09-23-00-373Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --target firecrawl --set all --only T015,T016,T020,T024,T027,T033,T035,T036,T039,T040,T041,T044,T051,T052,T058,T059,T061,T062,T063,T067,T072,T074,T077,T079,T080,T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008,T017,T018,T019,T021,T022,T023,T025,T026,T029,T030 --save-responses --record .w2l/access/weekly/2026-11-02-b93c766a/firecrawl-all.md`
- Source commit: `b93c766a` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: Firecrawl Cloud, POST /v2/scrape (proxy auto, maxAge 0, storeInCache false) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Run: 2026-11-02T09:23:00.373Z → 2026-11-02T09:28:22.578Z
- Tasks: 51 from `research/access/tasks.v1.json` (set `all`, only T015, T016, T020, T024, T027, T033, T035, T036, T039, T040, T041, T044, T051, T052, T058, T059, T061, T062, T063, T067, T072, T074, T077, T079, T080, T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008, T017, T018, T019, T021, T022, T023, T025, T026, T029, T030); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 51, attempted 51, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 51 | 43 | 6 | 3612 | 11627 | unknown | unknown | 49 | 1140 |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2446 |
| T002 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2524 |
| T005 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin | 2199 |
| T015 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4486 |
| T016 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3275 |
| T017 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5635 |
| T018 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 9087 |
| T019 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin | 3025 |
| T020 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 6077 |
| T021 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5602 |
| T022 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1072 |
| T023 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4337 |
| T024 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 9843 |
| T025 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 7350 |
| T026 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin | 4985 |
| T027 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 8096 |
| T029 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3307 |
| T030 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5973 |
| T033 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4942 |
| T034 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 11627 |
| T035 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3295 |
| T036 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2207 |
| T038 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3403 |
| T039 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3102 |
| T040 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3064 |
| T041 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 9823 |
| T044 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3985 |
| T045 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 19091 |
| T046 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 8717 |
| T047 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3612 |
| T048 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1990 |
| T049 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownCountMin, markdownMatches | 373 |
| T051 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4416 |
| T052 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | minTables | 1466 |
| T053 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 13936 |
| T058 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownMatches | 3054 |
| T059 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1951 |
| T061 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4027 |
| T062 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3425 |
| T063 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5237 |
| T067 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 588 |
| T068 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4229 |
| T071 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 6211 |
| T072 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4259 |
| T074 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2899 |
| T076 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1696 |
| T077 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2564 |
| T079 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownMatches | 8535 |
| T080 | cold | no | failed | Enrichment is not enabled for company profiles on this team. An organization admin can choose enrichment providers at https://www.firecrawl.dev/app/alexandria?enrichment=true |  | firecrawl | unknown | markdownMatches, markdownMatches | 2655 |
| B001 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2783 |
| B008 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1169 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
