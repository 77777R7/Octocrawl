# Access task set run: all, 2026-10-09

- Command: `node research/access/run-set.mjs --set all --access "enhanced" --record research/access/runs/2026-10-10-pa4-steel-all-collection-c44f632.md`
- Source commit: `c44f6328`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8792; access option: `"enhanced"`
- Exit address: 103.142.140.55
- Run: 2026-10-09T17:02:22.752Z → 2026-10-09T17:17:21.422Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 52 | 10 | 5558 | 26693 | unknown | unknown |

- Paid provider calls (cold): unknown; tasks verified with a paid call's page as the answer: unknown; charged by the spend ledger: unknown (a provider that states no price is charged its price ceiling: an upper bound, not its bill)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 17682 | steel: blocked/bot_detected_generic (answer) |
| T002 | cold | no | blocked | cloudflare_challenge | 200 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 16104 | steel: blocked/cloudflare_challenge (answer) |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 17526 | steel: success (answer) |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40239 |  |
| T005 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16473 | steel: blocked/bot_detected_generic (answer) |
| T006 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 20421 | steel: success (answer) |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 1443 |  |
| T008 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 498 |  |
| T009 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3757 |  |
| T010 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 29480 | steel: success (answer) |
| T011 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 21939 | steel: success (answer) |
| T012 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18877 | steel: success (answer) |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 11014 |  |
| T014 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 20270 | steel: success (answer) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1895 |  |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5437 |  |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7302 |  |
| T018 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 8928 |  |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 4071 |  |
| T020 | cold | yes | success |  | 200 | http | http |  | 3146 |  |
| T021 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 17731 | steel: success (answer) |
| T022 | cold | yes | success |  | 200 | http | http |  | 1970 |  |
| T023 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23051 | steel: success (answer) |
| T024 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6530 |  |
| T025 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18731 | steel: failed/empty_unverified (answer) |
| T026 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownMatches | 8823 |  |
| T027 | cold | yes | success |  | 200 | http | http |  | 3328 |  |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 2460 |  |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 21091 | steel: success (answer) |
| T031 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 16235 | steel: success (answer) |
| T033 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 1925 |  |
| T034 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 26693 | steel: blocked/bot_detected_generic (answer) |
| T035 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3516 |  |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5857 |  |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 583 |  |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15242 | steel: blocked/bot_detected_generic (answer) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4065 |  |
| T040 | cold | yes | success |  | 200 | http | http |  | 1119 |  |
| T041 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5558 |  |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1375 |  |
| T043 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 16986 | steel: success (answer) |
| T044 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6293 |  |
| T045 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16543 | steel: blocked/bot_detected_generic (answer) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15191 | steel: blocked/bot_detected_generic (answer) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 13521 | steel: blocked/cloudflare_challenge (answer) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 16306 | steel: blocked/cloudflare_challenge (answer) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2618 |  |
| T050 | cold | no | - |  |  |  |  | markdownMatches, markdownMatches | 32274 | unknown |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4081 |  |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | minTables, markdownMatches | 16683 | steel: blocked/cloudflare_challenge (answer) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 16816 | steel: blocked/bot_detected_generic (answer) |
| T055 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 30028 | steel: success (answer) |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2746 |  |
| T057 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3912 |  |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3948 |  |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2562 |  |
| T060 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 3025 |  |
| T061 | cold | yes | success |  | 200 | http | http |  | 3113 |  |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4978 |  |
| T063 | cold | yes | success |  | 200 | http | http |  | 899 |  |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2042 |  |
| T065 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 11548 |  |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4005 |  |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3492 |  |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 19575 | steel: blocked/cloudflare_challenge (answer) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 12761 | steel: blocked/cloudflare_challenge (answer) |
| T070 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 16452 | steel: success (answer) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17831 | steel: blocked/cloudflare_challenge (answer) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3238 |  |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4070 |  |
| T074 | cold | yes | success |  | 200 | http | http → browser_local → provider |  | 14310 | steel: blocked/cloudflare_challenge |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3902 |  |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 17783 | steel: blocked/cloudflare_challenge (answer) |
| T077 | cold | yes | success |  | 200 | http | http |  | 857 |  |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1444 |  |
| T079 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5441 |  |
| T080 | cold | yes | success |  | 200 | http | http |  | 3030 |  |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1076 |  |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17612 | steel: blocked/cloudflare_challenge (answer) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6899 |  |
| B003 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 15835 | steel: failed/empty_unverified (answer) |
| B004 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 20864 | steel: success (answer) |
| B005 | cold | yes | success |  | 200 | http | http |  | 3879 |  |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4812 |  |
| B007 | cold | yes | success |  | 200 | http | http |  | 3321 |  |
| B008 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3162 |  |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 777 |  |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5894 |  |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3541 |  |
| B012 | cold | yes | success |  | 200 | http | http |  | 833 |  |
| B013 | cold | yes | success |  | 200 | http | http |  | 1537 |  |
| B014 | cold | yes | success |  | 200 | http | http |  | 1166 |  |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (a CollectionPage's offered products, and role="main")

**Set-up.**
- Server: `W2L_API_PORT=8792 W2L_VENDORS=steel W2L_ACCESS_GRANT=<main checkout>/.w2l/access/steel-grant.json npm run api` at `c44f632`, with `STEEL_API_KEY` from the git-ignored `.w2l/access/competitors.env`, proxied as above.
- Grant and tariff: the same as `2026-10-10-pa4-steel-all-script-loaded-aad56e9.md` (grant SHA-256 `b2e32cb817d763f758e5755d94a61932182f3bf1894c09df39fc65fab5da1259`).
- The server includes #331 (merged as `841d28f`) and two rules on top of it:
  - Products under a `CollectionPage` or `SearchResultsPage` node are listed products, so such a page is a listing.
  - A region marked `role="main"` that holds half of the text blocks and every h1 is taken for the content.
  - The extractor is `extract-tf/19`.
- **Paid calls and ledger charge are `unknown` in the table above.** T050's request ended in an API 500, so its paid calls were not recorded. The other 91 tasks made 33 paid calls, which the ledger charged $0.1100. That figure leaves T050 out, so it is not the run's total.

**Compared with the run at `aad56e9`:**

| | Before | This run |
| --- | --- | --- |
| Verified, all 92 | 54 | 52 |
| Verified, frozen 50 | 17 | 17 |
| False successes | 6 | 10 |
| Firecrawl verified, Octocrawl not | 24 | 26 |
| p50 / p95 ms | 5365 / 26961 | 5558 / 26693 |

**What the rules moved:**
- **T021 (ebay.com): false success → verified.** Steel's page (108,694 characters) now reads as a listing, starting at its own heading "Laptops & Netbooks", with 150 prices.
  - Before, its `CollectionPage`'s `about.offers.itemOffered` products counted as the page's own, so it was routed as a product page and answered with the brand list and two prices.
  - Steel's page for this URL was saved once outside this run, on 2026-10-10 (one of two diagnostic Steel calls; the other got eBay's error page). On that page the extractor at `e6bd112` gives a product route and 2 prices; at this branch, a listing and 182 prices.

**Not these rules, or not isolated:**
- **T050 (similarweb.com): API 500 after 32,274 ms.** It had been verified on Steel's page in all 11 earlier Steel runs.
  - The API logged no error.
  - Rerun once outside this run on 2026-10-10 against the same code, through Steel, it answered `success` (20,027 characters, with "visits").
  - The earlier runs had the same 500 at about 32.5 s: T023 at `7c5dc6b` and T068 at `e2fa0a4`.
  - It is an intermittent failure of the enhanced lane, not isolated here.
- **T033 (amazon.com search): verified → false success.** The http lane's page listed results with no prices ("Check each product page for other buying options").
  - Fetched again on 2026-10-10, Amazon's search page held 16 results and no `a-price` element.
  - The extractors at `e6bd112` and at this branch give the same Markdown for it (0 prices).
  - This is what Amazon served.
- **T012, T026, T043 and T055:** false successes again. Each matches an earlier run:
  - T012's 867-character Walmart page, as at `e2fa0a4`;
  - T026's locale predicate;
  - T043's listing page let through by Steel, as at `72a5e3d`;
  - T055's 2,445-character page, as at `4f791ae`.
- **T011 and T031:** verified this time. **T008** (`rate_limit`, 429), **T025** (`empty_unverified` on Steel's page) and **T052** (`cloudflare_challenge`) were lost. All are run-to-run variation.

**False successes left (10):**
- the page lacks the data: T010, T014;
- the figures do not arrive in a browser: T019, T060;
- a predicate tied to locale: T026;
- what the site served this time: T012, T023, T033, T043, T055.
