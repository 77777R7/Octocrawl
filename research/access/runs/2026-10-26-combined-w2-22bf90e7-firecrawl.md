# Combined grant, window 2, arm firecrawl, 2026-10-26

The runner's own records of this arm's runs in the window, copied whole; the comparison is in `2026-10-26-combined-w2-22bf90e7-summary.md`.

## firecrawl-first-b0 (2026-10-26T00:06:16.187Z → 2026-10-26T00:08:47.263Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-26T00-06-16-290Z`.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T005,T006,T007,T008,T009,T010,T011,T012,T013,T014,T015,T016,T017,T018,T019,T020,T021,T022,T023 --save-responses --record .w2l/access/combined/2026-10-26-w2/firecrawl-first-b0.md --target firecrawl`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: Firecrawl Cloud, POST /v2/scrape (proxy auto, maxAge 0, storeInCache false) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Run: 2026-10-26T00:06:16.290Z → 2026-10-26T00:08:47.257Z
- Tasks: 23 (set `all`, only T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016, T017, T018, T019, T020, T021, T022, T023); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 17 | 4 | 3690 | 12226 | unknown | unknown | 22 | 1294 |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2818 |
| T002 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 11338 |
| T003 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2730 |
| T004 | cold | no | failed | Service Unavailable | 503 | firecrawl:basic | unknown | markdownMatches, markdownCountMin | 1494 |
| T005 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin | 2276 |
| T006 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3690 |
| T007 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2996 |
| T008 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1673 |
| T009 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2643 |
| T010 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | minTables, markdownMatches | 4769 |
| T011 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownMatches, markdownCountMin | 331 |
| T012 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin, markdownMatches | 3568 |
| T013 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 12729 |
| T014 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 10138 |
| T015 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 12226 |
| T016 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3760 |
| T017 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 6418 |
| T018 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 10213 |
| T019 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin | 3460 |
| T020 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 6734 |
| T021 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 10094 |
| T022 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3039 |
| T023 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5701 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## firecrawl-first-b1 (2026-10-26T00:18:43.118Z → 2026-10-26T00:21:02.637Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-26T00-18-43-240Z`.

- Command: `node research/access/run-set.mjs --set all --only T024,T025,T026,T027,T029,T030,T031,T033,T034,T035,T036,T037,T038,T039,T040,T041,T042,T043,T044,T045,T046,T047,T048 --save-responses --record .w2l/access/combined/2026-10-26-w2/firecrawl-first-b1.md --target firecrawl`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: Firecrawl Cloud, POST /v2/scrape (proxy auto, maxAge 0, storeInCache false) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Run: 2026-10-26T00:18:43.240Z → 2026-10-26T00:21:02.628Z
- Tasks: 23 (set `all`, only T024, T025, T026, T027, T029, T030, T031, T033, T034, T035, T036, T037, T038, T039, T040, T041, T042, T043, T044, T045, T046, T047, T048); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 19 | 3 | 4326 | 8741 | unknown | unknown | 22 | 1158 |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T024 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 8741 |
| T025 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 12730 |
| T026 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin | 7161 |
| T027 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 8137 |
| T029 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3262 |
| T030 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 6099 |
| T031 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin, markdownMatches | 1467 |
| T033 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5034 |
| T034 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5574 |
| T035 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3629 |
| T036 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2537 |
| T037 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin | 4326 |
| T038 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4073 |
| T039 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3479 |
| T040 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2681 |
| T041 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4884 |
| T042 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4226 |
| T043 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2894 |
| T044 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2938 |
| T045 | cold | no | failed | All scraping engines failed to retrieve content from this URL. Engines tried: [fire-engine;chrome-cdp;stealth, fire-engine(retry);chrome-cdp;stealth, pdf, document, image]. This usually happens when: (1) The URL is invalid or the page doesn't exist (404), (2) The website is blocking automated access, (3) The website is down or unreachable, (4) The page requires authentication. Double check the URL is correct and accessible in a browser. If the issue persists, contact us at help@firecrawl.com with your request ID for investigation. |  | firecrawl | unknown | markdownCountMin, markdownMatches | 4750 |
| T046 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 878 |
| T047 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 6496 |
| T048 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4656 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## firecrawl-first-b2 (2026-10-26T00:32:14.769Z → 2026-10-26T00:34:32.917Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-26T00-32-14-859Z`.

- Command: `node research/access/run-set.mjs --set all --only T049,T050,T051,T052,T053,T055,T056,T057,T058,T059,T060,T061,T062,T063,T064,T065,T066,T067,T068,T069,T070,T071,T072 --save-responses --record .w2l/access/combined/2026-10-26-w2/firecrawl-first-b2.md --target firecrawl`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: Firecrawl Cloud, POST /v2/scrape (proxy auto, maxAge 0, storeInCache false) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Run: 2026-10-26T00:32:14.859Z → 2026-10-26T00:34:32.909Z
- Tasks: 23 (set `all`, only T049, T050, T051, T052, T053, T055, T056, T057, T058, T059, T060, T061, T062, T063, T064, T065, T066, T067, T068, T069, T070, T071, T072); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 17 | 3 | 3514 | 8050 | unknown | unknown | 20 | 1176 |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T049 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownCountMin, markdownMatches | 1115 |
| T050 | cold | no | failed | All scraping engines failed to retrieve content from this URL. Engines tried: [fire-engine;chrome-cdp;stealth, fire-engine(retry);chrome-cdp;stealth, pdf, document, image]. This usually happens when: (1) The URL is invalid or the page doesn't exist (404), (2) The website is blocking automated access, (3) The website is down or unreachable, (4) The page requires authentication. Double check the URL is correct and accessible in a browser. If the issue persists, contact us at help@firecrawl.com with your request ID for investigation. |  | firecrawl | unknown | markdownMatches, markdownMatches | 6832 |
| T051 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3563 |
| T052 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | minTables | 1410 |
| T053 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 8050 |
| T055 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | minTables | 9618 |
| T056 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2276 |
| T057 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2164 |
| T058 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownMatches | 2448 |
| T059 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4269 |
| T060 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 564 |
| T061 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2298 |
| T062 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3705 |
| T063 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5659 |
| T064 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3453 |
| T065 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2433 |
| T066 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3514 |
| T067 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2188 |
| T068 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3643 |
| T069 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4555 |
| T070 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownCountMin, markdownMatches | 382 |
| T071 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 8050 |
| T072 | cold | yes | success |  | 200 | firecrawl:stealth | unknown |  | 6172 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## firecrawl-first-b3 (2026-10-26T00:41:42.797Z → 2026-10-26T00:43:52.670Z, exit 0)

Raw run: `.w2l/access/runs/2026-10-26T00-41-42-884Z`.

- Command: `node research/access/run-set.mjs --set all --only T073,T074,T075,T076,T077,T078,T079,T080,T081,B001,B002,B003,B004,B005,B006,B007,B008,B009,B010,B011,B012,B013,B014 --save-responses --record .w2l/access/combined/2026-10-26-w2/firecrawl-first-b3.md --target firecrawl`
- Source commit: `22bf90e7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: Firecrawl Cloud, POST /v2/scrape (proxy auto, maxAge 0, storeInCache false) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Run: 2026-10-26T00:41:42.884Z → 2026-10-26T00:43:52.665Z
- Tasks: 23 (set `all`, only T073, T074, T075, T076, T077, T078, T079, T080, T081, B001, B002, B003, B004, B005, B006, B007, B008, B009, B010, B011, B012, B013, B014); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 23, attempted 23, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 23 | 16 | 2 | 1717 | 6294 | unknown | unknown | 18 | 1125 |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T073 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 6024 |
| T074 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2538 |
| T075 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownMatches, markdownCountMin | 349 |
| T076 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1607 |
| T077 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1577 |
| T078 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownMatches, markdownMatches | 368 |
| T079 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownMatches | 8084 |
| T080 | cold | no | failed | Enrichment is not enabled for company profiles on this team. An organization admin can choose enrichment providers at https://www.firecrawl.dev/app/alexandria?enrichment=true |  | firecrawl | unknown | markdownMatches, markdownMatches | 506 |
| T081 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownMatches, markdownMatches | 387 |
| B001 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2533 |
| B002 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1085 |
| B003 | cold | no (false success) | success |  | 200 | firecrawl:basic | unknown | markdownCountMin, markdownMatches | 1717 |
| B004 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 6294 |
| B005 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 4814 |
| B006 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1642 |
| B007 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 3224 |
| B008 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 5660 |
| B009 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl | unknown | markdownMatches, markdownCountMin | 357 |
| B010 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2401 |
| B011 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 1637 |
| B012 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 571 |
| B013 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2535 |
| B014 | cold | yes | success |  | 200 | firecrawl:basic | unknown |  | 2212 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
