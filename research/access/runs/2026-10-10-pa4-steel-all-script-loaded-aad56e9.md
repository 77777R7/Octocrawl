# Access task set run: all, 2026-10-09

- Command: `node research/access/run-set.mjs --set all --access "enhanced" --record research/access/runs/2026-10-10-pa4-steel-all-script-loaded-aad56e9.md`
- Source commit: `aad56e9f`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8792; access option: `"enhanced"`
- Exit address: 103.142.140.156
- Run: 2026-10-09T16:01:39.271Z → 2026-10-09T16:16:39.964Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 54 | 6 | 5365 | 26961 | unknown | unknown |

- Paid provider calls (cold): 33; tasks verified with a paid call's page as the answer: 7; charged by the spend ledger: $0.1100 (a provider that states no price is charged its price ceiling: an upper bound, not its bill)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 17549 | steel: blocked/bot_detected_generic (answer) |
| T002 | cold | no | blocked | cloudflare_challenge | 200 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 15794 | steel: blocked/cloudflare_challenge (answer) |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 15539 | steel: success (answer) |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40253 |  |
| T005 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23610 | steel: blocked/bot_detected_generic (answer) |
| T006 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 16396 | steel: success (answer) |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 941 |  |
| T008 | cold | yes | success |  | 200 | http | http |  | 1734 |  |
| T009 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3531 |  |
| T010 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 27505 | steel: success (answer) |
| T011 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 19754 | steel: failed/empty_unverified (answer) |
| T012 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 19151 | steel: failed/empty_unverified (answer) |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 11003 |  |
| T014 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 20651 | steel: success (answer) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1327 |  |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5265 |  |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5648 |  |
| T018 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 9365 |  |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 3789 |  |
| T020 | cold | yes | success |  | 200 | http | http |  | 1329 |  |
| T021 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 26961 | steel: success (answer) |
| T022 | cold | yes | success |  | 200 | http | http |  | 1810 |  |
| T023 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17515 | steel: success (answer) |
| T024 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6812 |  |
| T025 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 21721 | steel: success (answer) |
| T026 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 12052 |  |
| T027 | cold | yes | success |  | 200 | http | http |  | 2356 |  |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 2562 |  |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 20186 | steel: success (answer) |
| T031 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23075 | steel: failed/empty_unverified (answer) |
| T033 | cold | yes | success |  | 200 | http | http |  | 3965 |  |
| T034 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 30347 | steel: blocked/bot_detected_generic (answer) |
| T035 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3421 |  |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5318 |  |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 583 |  |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16483 | steel: blocked/bot_detected_generic (answer) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4217 |  |
| T040 | cold | yes | success |  | 200 | http | http |  | 1156 |  |
| T041 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5565 |  |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1341 |  |
| T043 | cold | no | blocked | bot_detected_generic | 405 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 22344 | steel: blocked/bot_detected_generic (answer) |
| T044 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6520 |  |
| T045 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19937 | steel: blocked/bot_detected_generic (answer) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16987 | steel: blocked/bot_detected_generic (answer) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15138 | steel: blocked/cloudflare_challenge (answer) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 15425 | steel: blocked/cloudflare_challenge (answer) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2361 |  |
| T050 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 16771 | steel: success (answer) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4239 |  |
| T052 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5365 |  |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 20153 | steel: blocked/bot_detected_generic (answer) |
| T055 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | minTables | 32330 | steel: failed/empty_unverified (answer) |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2900 |  |
| T057 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3189 |  |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4014 |  |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2279 |  |
| T060 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 2895 |  |
| T061 | cold | yes | success |  | 200 | http | http |  | 2133 |  |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5119 |  |
| T063 | cold | yes | success |  | 200 | http | http |  | 846 |  |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2005 |  |
| T065 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 10857 |  |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6301 |  |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3664 |  |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 17252 | steel: blocked/cloudflare_challenge (answer) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 13071 | steel: blocked/cloudflare_challenge (answer) |
| T070 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 20358 | steel: success (answer) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16089 | steel: blocked/cloudflare_challenge (answer) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3496 |  |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4084 |  |
| T074 | cold | yes | success |  | 200 | http | http → browser_local → provider |  | 14670 | steel: blocked/cloudflare_challenge |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4105 |  |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 21133 | steel: blocked/cloudflare_challenge (answer) |
| T077 | cold | yes | success |  | 200 | http | http |  | 801 |  |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1680 |  |
| T079 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8603 |  |
| T080 | cold | yes | success |  | 200 | http | http |  | 2143 |  |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1246 |  |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 14272 | steel: blocked/cloudflare_challenge (answer) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5126 |  |
| B003 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 15896 | steel: failed/empty_unverified (answer) |
| B004 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 16976 | steel: success (answer) |
| B005 | cold | yes | success |  | 200 | http | http |  | 3971 |  |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3086 |  |
| B007 | cold | yes | success |  | 200 | http | http |  | 3689 |  |
| B008 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3130 |  |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 769 |  |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6074 |  |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3479 |  |
| B012 | cold | yes | success |  | 200 | http | http |  | 1112 |  |
| B013 | cold | yes | success |  | 200 | http | http |  | 885 |  |
| B014 | cold | yes | success |  | 200 | http | http |  | 1356 |  |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (script-filled pages and a declared product list)

**Set-up.**
- Server: `W2L_API_PORT=8792 W2L_VENDORS=steel W2L_ACCESS_GRANT=<main checkout>/.w2l/access/steel-grant.json npm run api` at `aad56e9`, with `STEEL_API_KEY` from the git-ignored `.w2l/access/competitors.env`, proxied as above. The port is 8792, not the 8798 of the earlier Steel records, because a public-preview server held 8798.
- Grant and tariff: the same as `2026-10-09-pa4-steel-all-remaining-72a5e3d.md` (grant SHA-256 `b2e32cb817d763f758e5755d94a61932182f3bf1894c09df39fc65fab5da1259`, Steel's tariff, `useProxy: false`, no captcha solving).
- The server includes #328 (merged as `8ba7387`) and three rules on top of it:
  - **Routing.** A page whose own top-level JSON-LD `ItemList` (not named for recommendations) lists three or more products is a listing. The exception is a page whose first h1 is followed by a price of its own. The extractor is `extract-tf/18`.
  - **`loading_text`.** A page of at most 4,000 visible characters whose own text holds a loading message, beside scripts, is client-rendered.
  - **Lower-case state.** Page state named in lower or camel case (`window.__data =`) counts as hydration state.

- After this run, a clean-context review found that two of the rules, as run, flag real pages whose content HTTP already holds. The branch narrowed both before its PR:
  - **`hydration_shell`.** The widened pattern read every lower- and camel-case `window._…state/config/data =` as page state. That flagged Substack posts (`window.__staticRouterHydrationData`, beside their noscript banner) and Chartbeat's `window._sf_async_config` on news homepages. It now adds only a bare `window.__data =` or `window.__state =`.
  - **`loading_text`.** The rule read a bare "Loading", and text no reader sees: a screen-reader-only "Loading" in ABC News's header, and an `aria-hidden` decoration on vercel.com. It now reads only the extracted region, skips `hidden`, `aria-hidden="true"` and screen-reader-only classes, and requires the ellipsis or "Please wait".
  - The narrowed rules still flag the saved HTML of T056 and T066, and the router still reads T017's as a listing. On the 61 pages of this set fetched on 2026-10-09 and the reviewer's pages (three Substack posts, an ABC News article, vercel.com, The Irish Times, The Boston Globe and Eurostat's home page), they changed no answer the earlier code gave. They were not run against the 92 tasks again.

**Compared with the run at `72a5e3d`:**

| | Before | This run |
| --- | --- | --- |
| Verified, all 92 | 49 | 54 |
| Verified, frozen 50 | 13 | 17 |
| False successes | 12 | 6 |
| Paid calls | 35 | 33 |
| Ledger charge (at the ceiling) | $0.1167 | $0.1100 |
| p50 / p95 ms | 5921 / 24784 | 5365 / 26961 |
| Firecrawl verified, Octocrawl not | 26 | 24 |

**What the rules moved (false success → verified, each answered by the local browser rung):**
- **T017 (www2.hm.com):** the browser's page answered with the product grid, 12,018 characters.
  - Before, the router read the page as a product page and kept only the category blurb (763 characters).
  - The http lane's page went to the browser first. The run does not record why.
  - Run outside the product on 2026-10-09 with the same extractor, the HTML as received already held the grid (86 prices). The router now reads it as a listing.
- **T056 (data.worldbank.org):** the http lane's page now reads as a hydration shell (`window.__data`, 1.2 MB, beside 779 visible characters). The browser's page held the figures: 26,946 characters.
- **T066 (www.wsj.com):** the http lane's page reads "Loading..." under each heading and now reads as `loading_text`. The browser's page held the figures (13,388 characters). robots.txt disallows the page; it was fetched as a URL the request named, on the record (`robots_overridden`).

**Not these rules, or not isolated:**
- **T006, T025, T052 and T073:** verified this time. T006 and T025 were verified on Steel's page. T052 and T073 were verified on the browser's page; T052 had been `cloudflare_challenge` and T073 a Steel timeout. These are run-to-run variation in what the sites served.
- **T002:** `cloudflare_challenge` on Steel's page, after being verified. Variation.
- **T031 (temu.com):** Steel's page was 3,510 zero-width characters, so the answer was `failed`/`empty_unverified`. Before it had been a 49,870-character page. Variation in what the site served.
- **T055 (Eurostat):** `failed`/`empty_unverified`. Steel's page holds the heading "Population on 1 January" but not the figures. The run at `e2fa0a4` answered a page of the same size `success`, a false success. This is an honest failure, from #328's rules or this page; which one is not isolated.
- **T021 (ebay.com):** a false success again. Steel's page (15,998 characters) was answered with its brand list and two prices. The runs at `f160f02`, `06b9354`, `004a107` and `6a4c456`, before the routing rule, answered Steel's page the same way (15,882 characters, false success). The local browser rung got eBay's error page, so the page could not be read again here.
- **T012 and B003:** `failed`/`empty_unverified` on Steel's page. Both have alternated between that and a block across the earlier Steel runs.
- **T026:** `failed`/`timeout` on the http lane, where it had been a false success. **T043:** `blocked` on Steel's page. Both are variation.

**False successes left (6):**
- the page lacks the data: T010, T014;
- the figures do not arrive in a browser:
  - T019 (costco.com): the local browser rung's page, read on 2026-10-09 outside this run, showed 2 prices, and Firecrawl's answer fails the same predicate.
  - T060 (nasdaq.com): the browser rung's page says "Data is currently not available". Plain Playwright with a Chrome User-Agent gets `ERR_HTTP2_PROTOCOL_ERROR` from the page itself, so the site refuses some automated browsers; that its data request was refused is not verified;
- the wrong region of Steel's page: T021;
- what the site served this time: T023.
