# Access task set run: all, 2026-10-09

- Command: `node research/access/run-set.mjs --target firecrawl --set all --record research/access/runs/2026-10-09-pa9-w1-firecrawl-3cde6e8.md`
- Source commit: `3cde6e8`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: Firecrawl Cloud, POST /v2/scrape (proxy auto, maxAge 0, storeInCache false) (the network line is the driver's way to its API; the provider fetches from its own cloud)
- API: the provider's; access option: none
- Exit address: not recorded
- Run: 2026-10-09T01:56:33.189Z → 2026-10-09T02:05:52.399Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) | Credits (inferred) | Credits per 1,000 verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 70 | 12 | 3401 | 9606 | unknown | unknown | 82 | 1171 |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 2439 |
| T002 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 4741 |
| T003 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 2052 |
| T004 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 2736 |
| T005 | cold | no (false success) | success |  | 200 | firecrawl:basic |  | markdownCountMin | 2776 |
| T006 | cold | no (false success) | success |  | 200 | firecrawl:basic |  | markdownCountMin | 3321 |
| T007 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 3156 |
| T008 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 1794 |
| T009 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 1837 |
| T010 | cold | no (false success) | success |  | 200 | firecrawl:basic |  | minTables | 11413 |
| T011 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl |  | markdownMatches, markdownCountMin | 333 |
| T012 | cold | no (false success) | success |  | 200 | firecrawl:basic |  | markdownCountMin, markdownMatches | 3130 |
| T013 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 6661 |
| T014 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 6077 |
| T015 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 4054 |
| T016 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 3507 |
| T017 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 3244 |
| T018 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 8911 |
| T019 | cold | no (false success) | success |  | 200 | firecrawl:basic |  | markdownCountMin | 3401 |
| T020 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 4506 |
| T021 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 1087 |
| T022 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 3059 |
| T023 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 4071 |
| T024 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 7459 |
| T025 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 5863 |
| T026 | cold | no (false success) | success |  | 200 | firecrawl:basic |  | markdownCountMin, markdownMatches | 4338 |
| T027 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 6565 |
| T029 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 4334 |
| T030 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 7538 |
| T031 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 3650 |
| T033 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 1317 |
| T034 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 6782 |
| T035 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 6240 |
| T036 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 2771 |
| T037 | cold | no (false success) | success |  | 200 | firecrawl:basic |  | markdownCountMin | 8767 |
| T038 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 6115 |
| T039 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 5263 |
| T040 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 4667 |
| T041 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 5510 |
| T042 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 3830 |
| T043 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 572 |
| T044 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 3584 |
| T045 | cold | no | failed | All scraping engines failed to retrieve content from this URL. Engines tried: [fire-engine;chrome-cdp;stealth, fire-engine(retry);chrome-cdp;stealth, pdf, document, image]. This usually happens when: (1) The URL is invalid or the page doesn't exist (404), (2) The website is blocking automated access, (3) The website is down or unreachable, (4) The page requires authentication. Double check the URL is correct and accessible in a browser. If the issue persists, contact us at help@firecrawl.com with your request ID for investigation. |  | firecrawl |  | markdownCountMin, markdownMatches | 6627 |
| T046 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 5644 |
| T047 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 3427 |
| T048 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 9792 |
| T049 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl |  | markdownCountMin, markdownMatches | 400 |
| T050 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 4130 |
| T051 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 13246 |
| T052 | cold | no (false success) | success |  | 200 | firecrawl:basic |  | minTables | 1507 |
| T053 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 567 |
| T055 | cold | no (false success) | success |  | 200 | firecrawl:basic |  | minTables | 11863 |
| T056 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 2865 |
| T057 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 2366 |
| T058 | cold | no (false success) | success |  | 200 | firecrawl:basic |  | markdownMatches | 5024 |
| T059 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 3286 |
| T060 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 2651 |
| T061 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 3889 |
| T062 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 5830 |
| T063 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 6332 |
| T064 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 567 |
| T065 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 2809 |
| T066 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 3357 |
| T067 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 2286 |
| T068 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 3207 |
| T069 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 3337 |
| T070 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl |  | markdownCountMin, markdownMatches | 398 |
| T071 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 9606 |
| T072 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 5331 |
| T073 | cold | no | failed | All scraping engines failed to retrieve content from this URL. Engines tried: [fire-engine;chrome-cdp, fire-engine(retry);chrome-cdp]. This usually happens when: (1) The URL is invalid or the page doesn't exist (404), (2) The website is blocking automated access, (3) The website is down or unreachable, (4) The page requires authentication. Double check the URL is correct and accessible in a browser. If the issue persists, contact us at help@firecrawl.com with your request ID for investigation. |  | firecrawl |  | markdownMatches, markdownCountMin | 6074 |
| T074 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 566 |
| T075 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl |  | markdownMatches, markdownCountMin | 357 |
| T076 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 2704 |
| T077 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 1622 |
| T078 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl |  | markdownMatches, markdownMatches | 476 |
| T079 | cold | no (false success) | success |  | 200 | firecrawl:basic |  | markdownMatches | 8015 |
| T080 | cold | no | failed | Enrichment is not enabled for company profiles on this team. An organization admin can choose enrichment providers at https://www.firecrawl.dev/app/alexandria?enrichment=true |  | firecrawl |  | markdownMatches, markdownMatches | 1547 |
| T081 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl |  | markdownMatches, markdownMatches | 449 |
| B001 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 3024 |
| B002 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 5440 |
| B003 | cold | no (false success) | success |  | 200 | firecrawl:basic |  | markdownCountMin, markdownMatches | 333 |
| B004 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 6130 |
| B005 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 5498 |
| B006 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 2154 |
| B007 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 4116 |
| B008 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 6272 |
| B009 | cold | no | failed | We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales |  | firecrawl |  | markdownMatches, markdownCountMin | 350 |
| B010 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 2244 |
| B011 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 2216 |
| B012 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 1496 |
| B013 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 567 |
| B014 | cold | yes | success |  | 200 | firecrawl:basic |  |  | 1619 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
