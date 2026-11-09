# Weekly rerun: Firecrawl Cloud arm, 2026-11-09

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `firecrawl`, week 2026-W46, run on 2026-11-09
- Source commit: `b6e94b5c`
- Set: 51 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 10 (group 2 of 0–3, ISO week 46 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T037, T042, T043, T050, T055, T056, T057, T060, T064, T065
- Chrome: Google Chrome 156.0.8078.81 (previous weekly record: Google Chrome 156.0.8078.47)
- Account before the arm, as firecrawl's API reports it: remaining 261 of plan 1000 (period ends 2026-11-22T17:13:36.213Z)
- Account after the arm: remaining 185 of plan 1000 (period ends 2026-11-22T17:13:36.213Z)
- Cost: 76 credits by the account's usage before and after the arm; credits by the runner's inference 47
- Not run by the runner (its early stop): none

| Part | Planned | Attempted | Verified | False success |
| --- | --- | --- | --- | --- |
| all | 51 | 51 | 41 | 6 |
| healthy | 25 | 25 | 21 | 3 |
| challenge | 16 | 16 | 13 | 1 |
| rotation | 10 | 10 | 7 | 2 |

## Run: firecrawl-all

Raw run: `.w2l/access/runs/2026-11-09T02-47-28-988Z` (git-ignored). The runner's own record of it follows.

- Command: `node research/access/run-set.mjs --target firecrawl --set all --only T015,T016,T020,T024,T027,T033,T035,T036,T039,T040,T041,T044,T051,T052,T058,T059,T061,T062,T063,T067,T072,T074,T077,T079,T080,T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008,T037,T042,T043,T050,T055,T056,T057,T060,T064,T065 --save-responses --record .w2l/access/weekly/2026-11-09-b6e94b5c/firecrawl-all.md`
- Source commit: `b6e94b5c` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: Firecrawl Cloud, POST /v2/scrape (proxy auto, maxAge 0, storeInCache false) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Run: 2026-11-09T02:47:28.988Z → 2026-11-09T02:56:57.709Z
- Tasks: 51 from `research/access/tasks.v1.json` (set `all`, only T015, T016, T020, T024, T027, T033, T035, T036, T039, T040, T041, T044, T051, T052, T058, T059, T061, T062, T063, T067, T072, T074, T077, T079, T080, T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008, T037, T042, T043, T050, T055, T056, T057, T060, T064, T065); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 51, attempted 51, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 51 | 41 | 6 | 3996 | 58753 | unknown | unknown | 47 | 1146 |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3252 |
| T002 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4071 |
| T005 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin | 2150 |
| T015 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4607 |
| T016 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3996 |
| T020 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5845 |
| T024 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 9353 |
| T027 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 7505 |
| T033 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5205 |
| T034 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5166 |
| T035 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1006 |
| T036 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2730 |
| T037 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin | 12833 |
| T038 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4851 |
| T039 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3827 |
| T040 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3064 |
| T041 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5304 |
| T042 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 34667 |
| T043 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3620 |
| T044 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4500 |
| T045 | cold | yes | success |  | 200 | firecrawl:stealth | unknown |  | 58753 |
| T046 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3339 |
| T047 | cold | no | failed | All scraping engines failed to retrieve content from this URL. Engines tried: [fire-engine;chrome-cdp;stealth, fire-engine(retry);chrome-cdp;stealth, pdf, document, image]. This usually happens when: (1) The URL is invalid or the page doesn't exist (404), (2) The website is blocking automated access, (3) The website is down or unreachable, (4) The page requires authentication. Double check the URL is correct and accessible in a browser. If the issue persists, contact us at help@firecrawl.com with your request ID for investigation. |  | firecrawl | unknown | markdownCountMin, markdownMatches | 100874 |
| T048 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2020 |
| T049 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownCountMin, markdownMatches | 427 |
| T050 | cold | no | failed | All scraping engines failed to retrieve content from this URL. Engines tried: [fire-engine;chrome-cdp;stealth, fire-engine(retry);chrome-cdp;stealth, pdf, document, image]. This usually happens when: (1) The URL is invalid or the page doesn't exist (404), (2) The website is blocking automated access, (3) The website is down or unreachable, (4) The page requires authentication. Double check the URL is correct and accessible in a browser. If the issue persists, contact us at help@firecrawl.com with your request ID for investigation. |  | firecrawl | unknown | markdownMatches, markdownMatches | 32380 |
| T051 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 42414 |
| T052 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | minTables | 1631 |
| T053 | cold | yes | success |  | 200 | firecrawl:stealth | unknown |  | 18012 |
| T055 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | minTables | 9205 |
| T056 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2367 |
| T057 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1989 |
| T058 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownMatches | 3000 |
| T059 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2753 |
| T060 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1844 |
| T061 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4448 |
| T062 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4350 |
| T063 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 887 |
| T064 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3426 |
| T065 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2546 |
| T067 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2145 |
| T068 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3884 |
| T071 | cold | yes | success |  | 200 | firecrawl:stealth | unknown |  | 67673 |
| T072 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4909 |
| T074 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4336 |
| T076 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1425 |
| T077 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1849 |
| T079 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownMatches | 10337 |
| T080 | cold | no | failed | Enrichment is not enabled for company profiles on this team. An organization admin can choose enrichment providers at https://www.firecrawl.dev/app/alexandria?enrichment=true |  | firecrawl | unknown | markdownMatches, markdownMatches | 579 |
| B001 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2738 |
| B008 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5292 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
