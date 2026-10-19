# Weekly rerun: Firecrawl Cloud arm, 2026-10-20

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `firecrawl`, week 2026-W43, run on 2026-10-20
- Source commit: `259bcef3`
- Set: 47 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 6 (group 3 of 0–3, ISO week 43 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T066, T069, T070, T075, T078, T081
- Chrome: Google Chrome 155.0.8059.80 (previous weekly record: Google Chrome 155.0.8059.80 (the P0.1 baseline, research/access/runs/2026-10-20-pa-next-baseline-ic16-1c4d9178.md))
- Account before the arm, as firecrawl's API reports it: remaining 1180 of plan 1000 (period ends 2026-10-22T17:13:36.213Z)
- Account after the arm: remaining 1110 of plan 1000 (period ends 2026-10-22T17:13:36.213Z)
- Cost: 70 credits by the account's usage before and after the arm; credits by the runner's inference 41
- Not run by the runner (its early stop): none

| Part | Planned | Attempted | Verified | False success |
| --- | --- | --- | --- | --- |
| all | 47 | 47 | 37 | 4 |
| healthy | 25 | 25 | 21 | 3 |
| challenge | 16 | 16 | 14 | 1 |
| rotation | 6 | 6 | 2 | 0 |

## Run: firecrawl-all

Raw run: `.w2l/access/runs/2026-10-19T18-34-04-778Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --target firecrawl --set all --only T015,T016,T020,T024,T027,T033,T035,T036,T039,T040,T041,T044,T051,T052,T058,T059,T061,T062,T063,T067,T072,T074,T077,T079,T080,T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008,T066,T069,T070,T075,T078,T081 --save-responses --record .w2l/access/weekly/2026-10-20-259bcef3/firecrawl-all.md`
- Source commit: `4b9aa8be` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: Firecrawl Cloud, POST /v2/scrape (proxy auto, maxAge 0, storeInCache false) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Run: 2026-10-19T18:34:04.778Z → 2026-10-19T18:38:38.039Z
- Tasks: 47 (set `all`, only T015, T016, T020, T024, T027, T033, T035, T036, T039, T040, T041, T044, T051, T052, T058, T059, T061, T062, T063, T067, T072, T074, T077, T079, T080, T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008, T066, T069, T070, T075, T078, T081); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 47, attempted 47, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 47 | 37 | 4 | 3420 | 11789 | unknown | unknown | 41 | 1108 |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2254 |
| T002 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 11563 |
| T005 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin | 2360 |
| T015 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 11656 |
| T016 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4718 |
| T020 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 6422 |
| T024 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 7814 |
| T027 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 7800 |
| T033 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4841 |
| T034 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5510 |
| T035 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin | 6481 |
| T036 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2451 |
| T038 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4216 |
| T039 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3379 |
| T040 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2934 |
| T041 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 12688 |
| T044 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4463 |
| T045 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 6138 |
| T046 | cold | yes | success |  | 200 | firecrawl:stealth | unknown |  | 13214 |
| T047 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3714 |
| T048 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 844 |
| T049 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownCountMin, markdownMatches | 459 |
| T051 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4111 |
| T052 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | minTables | 1378 |
| T053 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2953 |
| T058 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2702 |
| T059 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3256 |
| T061 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4310 |
| T062 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5760 |
| T063 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5104 |
| T066 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 598 |
| T067 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2363 |
| T068 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3500 |
| T069 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2931 |
| T070 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownCountMin, markdownMatches | 428 |
| T071 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3306 |
| T072 | cold | yes | success |  | 200 | firecrawl:stealth | unknown |  | 4935 |
| T074 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3420 |
| T075 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownMatches, markdownCountMin | 466 |
| T076 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1630 |
| T077 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 314 |
| T078 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownMatches, markdownMatches | 465 |
| T079 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownMatches | 11789 |
| T080 | cold | no | failed | Enrichment is not enabled for company profiles on this team. An organization admin can choose enrichment providers at https://www.firecrawl.dev/app/alexandria?enrichment=true |  | firecrawl | unknown | markdownMatches, markdownMatches | 498 |
| T081 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownMatches, markdownMatches | 484 |
| B001 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3040 |
| B008 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 6340 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
