# Combined grant, window 1, arm firecrawl, 2026-10-25

The runner's own records of this arm's runs in the window, copied whole; the comparison is in `2026-10-25-combined-w1-22bf90e7-summary.md`.

## firecrawl-first-b0 (2026-10-25T04:34:18.947Z → 2026-10-25T04:36:36.593Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-25T04-34-19-039Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T005,T006,T007,T008,T009,T010,T011,T012,T013,T014,T015,T016,T017,T018,T019,T020,T021,T022,T023 --save-responses --record .w2l/access/combined/2026-10-25-w1/firecrawl-first-b0.md --target firecrawl`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: Firecrawl Cloud, POST /v2/scrape (proxy auto, maxAge 0, storeInCache false) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Run: 2026-10-25T04:34:19.039Z → 2026-10-25T04:36:36.581Z
- Tasks: 23 (set `all`, only T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020, T021, T022, T023); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 14 | 7 | 4150 | 11160 | unknown | unknown | 22 | 1571 |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2021 |
| T002 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 11286 |
| T003 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3128 |
| T004 | cold | no | failed | Service Unavailable | 503 | firecrawl:basic | unknown | markdownMatches, markdownCountMin | 1587 |
| T005 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin | 2118 |
| T006 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3207 |
| T007 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2625 |
| T008 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1678 |
| T009 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4044 |
| T010 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | minTables | 11160 |
| T011 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownMatches, markdownCountMin | 314 |
| T012 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin, markdownMatches | 3021 |
| T013 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 10989 |
| T014 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin | 5461 |
| T015 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin, markdownMatches | 11000 |
| T016 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 8439 |
| T017 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4150 |
| T018 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 8792 |
| T019 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin | 2924 |
| T020 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5047 |
| T021 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 6397 |
| T022 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin | 4726 |
| T023 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4346 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## firecrawl-first-b1 (2026-10-25T04:46:13.760Z → 2026-10-25T04:48:27.892Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-25T04-46-13-835Z`.

- Command: `node research/access/run-set.mjs --set all --only T024,T025,T026,T027,T029,T030,T031,T033,T034,T035,T036,T037,T038,T039,T040,T041,T042,T043,T044,T045,T046,T047,T048 --save-responses --record .w2l/access/combined/2026-10-25-w1/firecrawl-first-b1.md --target firecrawl`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: Firecrawl Cloud, POST /v2/scrape (proxy auto, maxAge 0, storeInCache false) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Run: 2026-10-25T04:46:13.835Z → 2026-10-25T04:48:27.884Z
- Tasks: 23 (set `all`, only T024, T025, T026, T027, T029, T030, T031, T033, T034, T035, T036, T037, T038, T039, T040, T041, T042, T043, T044, T045, T046, T047, T048); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 20 | 2 | 3878 | 10564 | unknown | unknown | 22 | 1100 |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T024 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 6768 |
| T025 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 12977 |
| T026 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin | 7813 |
| T027 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5580 |
| T029 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2707 |
| T030 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5233 |
| T031 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3878 |
| T033 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4545 |
| T034 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 10564 |
| T035 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3411 |
| T036 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2673 |
| T037 | cold | no (false success) | success |  | 200 | firecrawl:stealth | unknown | markdownCountMin | 6281 |
| T038 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3840 |
| T039 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3068 |
| T040 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2424 |
| T041 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 9323 |
| T042 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3171 |
| T043 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2814 |
| T044 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4261 |
| T045 | cold | no | failed | All scraping engines failed to retrieve content from this URL. Engines tried: [fire-engine;chrome-cdp;stealth, fire-engine(retry);chrome-cdp;stealth, pdf, document, image]. This usually happens when: (1) The URL is invalid or the page doesn't exist (404), (2) The website is blocking automated access, (3) The website is down or unreachable, (4) The page requires authentication. Double check the URL is correct and accessible in a browser. If the issue persists, contact us at help@firecrawl.com with your request ID for investigation. |  | firecrawl | unknown | markdownCountMin, markdownMatches | 6240 |
| T046 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 794 |
| T047 | cold | yes | success |  | 200 | firecrawl:stealth | unknown |  | 3232 |
| T048 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1488 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## firecrawl-first-b2 (2026-10-25T04:56:57.050Z → 2026-10-25T04:59:08.883Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-25T04-56-57-142Z`.

- Command: `node research/access/run-set.mjs --set all --only T049,T050,T051,T052,T053,T055,T056,T057,T058,T059,T060,T061,T062,T063,T064,T065,T066,T067,T068,T069,T070,T071,T072 --save-responses --record .w2l/access/combined/2026-10-25-w1/firecrawl-first-b2.md --target firecrawl`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: Firecrawl Cloud, POST /v2/scrape (proxy auto, maxAge 0, storeInCache false) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Run: 2026-10-25T04:56:57.142Z → 2026-10-25T04:59:08.876Z
- Tasks: 23 (set `all`, only T049, T050, T051, T052, T053, T055, T056, T057, T058, T059, T060, T061, T062, T063, T064, T065, T066, T067, T068, T069, T070, T071, T072); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 18 | 3 | 3522 | 6359 | unknown | unknown | 21 | 1167 |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T049 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownCountMin, markdownMatches | 1117 |
| T050 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4204 |
| T051 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3860 |
| T052 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | minTables | 1281 |
| T053 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4704 |
| T055 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | minTables | 9586 |
| T056 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2373 |
| T057 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2093 |
| T058 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownMatches | 2416 |
| T059 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2866 |
| T060 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 551 |
| T061 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3812 |
| T062 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4249 |
| T063 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4444 |
| T064 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 6359 |
| T065 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2682 |
| T066 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2888 |
| T067 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1879 |
| T068 | cold | yes | success |  | 200 | firecrawl:stealth | unknown |  | 4261 |
| T069 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4366 |
| T070 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownCountMin, markdownMatches | 316 |
| T071 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3522 |
| T072 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3536 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## firecrawl-first-b3 (2026-10-25T05:06:58.339Z → 2026-10-25T05:09:08.971Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-25T05-06-58-444Z`.

- Command: `node research/access/run-set.mjs --set all --only T073,T074,T075,T076,T077,T078,T079,T080,T081,B001,B002,B003,B004,B005,B006,B007,B008,B009,B010,B011,B012,B013,B014 --save-responses --record .w2l/access/combined/2026-10-25-w1/firecrawl-first-b3.md --target firecrawl`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: Firecrawl Cloud, POST /v2/scrape (proxy auto, maxAge 0, storeInCache false) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Run: 2026-10-25T05:06:58.444Z → 2026-10-25T05:09:08.964Z
- Tasks: 23 (set `all`, only T073, T074, T075, T076, T077, T078, T079, T080, T081, B001, B002, B003, B004, B005, B006, B007, B008, B009, B010, B011, B012, B013, B014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 15 | 3 | 2221 | 5883 | unknown | unknown | 18 | 1200 |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T073 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownMatches, markdownMatches | 4621 |
| T074 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2759 |
| T075 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownMatches, markdownCountMin | 337 |
| T076 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1645 |
| T077 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1424 |
| T078 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownMatches, markdownMatches | 343 |
| T079 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownMatches | 10625 |
| T080 | cold | no | failed | Enrichment is not enabled for company profiles on this team. An organization admin can choose enrichment providers at https://www.firecrawl.dev/app/alexandria?enrichment=true |  | firecrawl | unknown | markdownMatches, markdownMatches | 544 |
| T081 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownMatches, markdownMatches | 343 |
| B001 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2474 |
| B002 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1020 |
| B003 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin, markdownMatches | 2488 |
| B004 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3426 |
| B005 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5757 |
| B006 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2228 |
| B007 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3583 |
| B008 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5883 |
| B009 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownMatches, markdownCountMin | 336 |
| B010 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2931 |
| B011 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2052 |
| B012 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 548 |
| B013 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2221 |
| B014 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1899 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
