# Weekly rerun: Firecrawl Cloud arm, 2026-11-23

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `firecrawl`, week 2026-W48, run on 2026-11-23
- Source commit: `bbd04eae`
- Set: 51 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 10 (group 0 of 0–3, ISO week 48 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T003, T004, T006, T007, T009, T010, T011, T012, T013, T014
- Chrome: Google Chrome 157.0.8103.79 (previous weekly record: Google Chrome 156.0.8078.47; major version changed, the 16 tasks were run twice)
- Account before the arm, as firecrawl's API reports it: remaining 1000 of plan 1000 (period ends 2026-12-22T17:13:36.213Z)
- Account after the arm: remaining 940 of plan 1000 (period ends 2026-12-22T17:13:36.213Z)
- Cost: 60 credits by the account's usage before and after the arm; credits by the runner's inference 47
- Not run by the runner (its early stop): none

| Part | Planned | Attempted | Verified | False success |
| --- | --- | --- | --- | --- |
| all | 51 | 51 | 42 | 5 |
| healthy | 25 | 25 | 22 | 3 |
| challenge | 16 | 16 | 13 | 0 |
| rotation | 10 | 10 | 7 | 2 |

## Run: firecrawl-all

Raw run: `.w2l/access/runs/2026-11-23T02-54-07-710Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --target firecrawl --set all --only T015,T016,T020,T024,T027,T033,T035,T036,T039,T040,T041,T044,T051,T052,T058,T059,T061,T062,T063,T067,T072,T074,T077,T079,T080,T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008,T003,T004,T006,T007,T009,T010,T011,T012,T013,T014 --save-responses --record .w2l/access/weekly/2026-11-23-bbd04eae/firecrawl-all.md`
- Source commit: `bbd04eae` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: Firecrawl Cloud, POST /v2/scrape (proxy auto, maxAge 0, storeInCache false) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Run: 2026-11-23T02:54:07.710Z → 2026-11-23T02:59:31.966Z
- Tasks: 51 from `research/access/tasks.v1.json` (set `all`, only T015, T016, T020, T024, T027, T033, T035, T036, T039, T040, T041, T044, T051, T052, T058, T059, T061, T062, T063, T067, T072, T074, T077, T079, T080, T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008, T003, T004, T006, T007, T009, T010, T011, T012, T013, T014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 51, attempted 51, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 51 | 42 | 5 | 4281 | 12332 | unknown | unknown | 47 | 1119 |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2562 |
| T002 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5106 |
| T003 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3157 |
| T004 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2305 |
| T005 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5652 |
| T006 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 6400 |
| T007 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2324 |
| T009 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5532 |
| T010 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | minTables | 6414 |
| T011 | cold | no | failed | The third-party data provider for this site does not serve this URL. Request a record's own page, such as a profile page itself, rather than a sub-page or listing under it. |  | firecrawl | unknown | markdownMatches, markdownCountMin | 413 |
| T012 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin, markdownMatches | 296 |
| T013 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 11160 |
| T014 | cold | yes | success |  | 200 | firecrawl:stealth | unknown |  | 12332 |
| T015 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 8039 |
| T016 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4700 |
| T020 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3992 |
| T024 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 17951 |
| T027 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 7354 |
| T033 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4221 |
| T034 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 11023 |
| T035 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5517 |
| T036 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4598 |
| T038 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5130 |
| T039 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4089 |
| T040 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 7323 |
| T041 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 12057 |
| T044 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2937 |
| T045 | cold | no | failed | All scraping engines failed to retrieve content from this URL. Engines tried: [fire-engine;chrome-cdp;stealth, fire-engine(retry);chrome-cdp;stealth, pdf, document, image]. This usually happens when: (1) The URL is invalid or the page doesn't exist (404), (2) The website is blocking automated access, (3) The website is down or unreachable, (4) The page requires authentication. Double check the URL is correct and accessible in a browser. If the issue persists, contact us at help@firecrawl.com with your request ID for investigation. |  | firecrawl | unknown | markdownCountMin, markdownMatches | 2761 |
| T046 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 7538 |
| T047 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 6736 |
| T048 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2588 |
| T049 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownCountMin, markdownMatches | 306 |
| T051 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3417 |
| T052 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | minTables | 1806 |
| T053 | cold | no | failed | All scraping engines failed to retrieve content from this URL. Engines tried: [fire-engine;chrome-cdp;stealth, fire-engine(retry);chrome-cdp;stealth, pdf, document, image]. This usually happens when: (1) The URL is invalid or the page doesn't exist (404), (2) The website is blocking automated access, (3) The website is down or unreachable, (4) The page requires authentication. Double check the URL is correct and accessible in a browser. If the issue persists, contact us at help@firecrawl.com with your request ID for investigation. |  | firecrawl | unknown | markdownMatches | 13463 |
| T058 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3648 |
| T059 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 799 |
| T061 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4187 |
| T062 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5343 |
| T063 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5581 |
| T067 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1992 |
| T068 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2284 |
| T071 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4281 |
| T072 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 7254 |
| T074 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4252 |
| T076 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3697 |
| T077 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 299 |
| T079 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownMatches | 4796 |
| T080 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownMatches | 765 |
| B001 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3571 |
| B008 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5521 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
