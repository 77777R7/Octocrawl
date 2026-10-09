# Access task set run: all, 2026-10-09

- Command: `node research/access/run-set.mjs --set all --access "enhanced" --record research/access/runs/2026-10-09-pa4-steel-all-remaining-72a5e3d.md`
- Source commit: `72a5e3d2`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8798; access option: `"enhanced"`
- Exit address: 103.142.140.132
- Run: 2026-10-09T14:33:14.704Z → 2026-10-09T14:50:21.408Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 49 | 12 | 5921 | 24784 | unknown | unknown |

- Paid provider calls (cold): 35; tasks verified with a paid call's page as the answer: 7; charged by the spend ledger: $0.1167 (a provider that states no price is charged its price ceiling: an upper bound, not its bill)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 15138 | steel: blocked/cloudflare_challenge (answer) |
| T002 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 14238 | steel: success (answer) |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 15102 | steel: success (answer) |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40202 |  |
| T005 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 14635 | steel: blocked/bot_detected_generic (answer) |
| T006 | cold | no (false success) | success |  | 202 | provider | http → browser_local → provider | markdownCountMin | 15950 | steel: success (answer) |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 1578 |  |
| T008 | cold | yes | success |  | 200 | http | http |  | 2274 |  |
| T009 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3505 |  |
| T010 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 24784 | steel: success (answer) |
| T011 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider |  | 16597 | steel: failed/empty_unverified (answer) |
| T012 | cold | no | blocked | captcha | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19480 | steel: blocked/captcha (answer) |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 10504 |  |
| T014 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 30507 | steel: success (answer) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1988 |  |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4375 |  |
| T017 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 7208 |  |
| T018 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 9597 |  |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 4399 |  |
| T020 | cold | yes | success |  | 200 | http | http |  | 4534 |  |
| T021 | cold | no | failed | http_error | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15131 | steel: failed/http_error (answer) |
| T022 | cold | yes | success |  | 200 | http | http |  | 1759 |  |
| T023 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19386 | steel: success (answer) |
| T024 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8437 |  |
| T025 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20385 | steel: failed/empty_unverified (answer) |
| T026 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownMatches | 8701 |  |
| T027 | cold | yes | success |  | 200 | http | http |  | 3442 |  |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 3125 |  |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 21867 | steel: success (answer) |
| T031 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 23752 | steel: success (answer) |
| T033 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5921 |  |
| T034 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 21149 | steel: blocked/bot_detected_generic (answer) |
| T035 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3616 |  |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4615 |  |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 651 |  |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17436 | steel: blocked/bot_detected_generic (answer) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4272 |  |
| T040 | cold | yes | success |  | 200 | http | http |  | 1105 |  |
| T041 | cold | yes | success |  | 200 | http | http → browser_local |  | 3021 |  |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1363 |  |
| T043 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 23005 | steel: success (answer) |
| T044 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6456 |  |
| T045 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16775 | steel: blocked/bot_detected_generic (answer) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15558 | steel: blocked/bot_detected_generic (answer) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15074 | steel: blocked/cloudflare_challenge (answer) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 15742 | steel: blocked/cloudflare_challenge (answer) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2372 |  |
| T050 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 18055 | steel: success (answer) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4418 |  |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | minTables, markdownMatches | 20354 | steel: blocked/cloudflare_challenge (answer) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 16508 | steel: blocked/bot_detected_generic (answer) |
| T055 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 32818 | steel: success (answer) |
| T056 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 845 |  |
| T057 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3149 |  |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4575 |  |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3385 |  |
| T060 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 4861 |  |
| T061 | cold | yes | success |  | 200 | http | http |  | 3108 |  |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5342 |  |
| T063 | cold | yes | success |  | 200 | http | http |  | 1081 |  |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2065 |  |
| T065 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 11360 |  |
| T066 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 2261 |  |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3470 |  |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 17493 | steel: blocked/cloudflare_challenge (answer) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15601 | steel: blocked/cloudflare_challenge (answer) |
| T070 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 20816 | steel: success (answer) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17254 | steel: blocked/cloudflare_challenge (answer) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3218 |  |
| T073 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → provider |  | 125170 | steel: failed/timeout |
| T074 | cold | yes | success |  | 200 | http | http → browser_local → provider |  | 18343 | steel: blocked/cloudflare_challenge |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3976 |  |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 18006 | steel: blocked/cloudflare_challenge (answer) |
| T077 | cold | yes | success |  | 200 | http | http |  | 1229 |  |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1551 |  |
| T079 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5319 |  |
| T080 | cold | yes | success |  | 200 | http | http |  | 2209 |  |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1122 |  |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15234 | steel: blocked/cloudflare_challenge (answer) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5323 |  |
| B003 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16779 | steel: blocked/bot_detected_generic (answer) |
| B004 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 23174 | steel: success (answer) |
| B005 | cold | yes | success |  | 200 | http | http |  | 4182 |  |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6130 |  |
| B007 | cold | yes | success |  | 200 | http | http |  | 3599 |  |
| B008 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3255 |  |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 796 |  |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5992 |  |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3270 |  |
| B012 | cold | yes | success |  | 200 | http | http |  | 1104 |  |
| B013 | cold | yes | success |  | 200 | http | http |  | 1935 |  |
| B014 | cold | yes | success |  | 200 | http | http |  | 5440 |  |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (three more false-success rules)

**Set-up.**
- Same set-up as `2026-10-09-pa4-steel-all-walls-f16072c.md`: the Steel grant (SHA-256 `b2e32cb817d763f758e5755d94a61932182f3bf1894c09df39fc65fab5da1259`), Steel's tariff, and the proxied network.
- The server ran at `72a5e3d`, which adds three rules:
  - a short 2xx page whose heading or title names a refusal or a browser check is a block (T021);
  - an HTTP table whose cells hold no text is an empty shell, and the http lane offers the page to the browser (T060);
  - a main region the page hides (`hidden`, `aria-hidden`, an inline `display:none` on it or around it) is no main content (T055). The extractor is `extract-tf/17`.
- After this run, a clean-context review found that the last two rules fail real pages, and the branch changed them before its PR:
  - **The empty-cell rule was dropped.** It counts the one empty cell of Hacker News's footer bar, Paul Graham's essays and Slashdot's empty ad table, so each such page would cost a browser render. It did not change T060's answer either (see below).
  - **The hidden-region rule now reads only `hidden`.** A modal sets `aria-hidden` on the page behind it (Radix's dialog), which the browser lane would have failed. React streams a part of the page hidden (`<div hidden id="S:5">` on vercel.com/templates) and its script moves it into place; that is exempt, and so is `hidden="until-found"`. Eurostat's dropdown carries `hidden=""`, so the narrowed rule still escalates its saved page.
  - Neither change was run against the 92 tasks again. Both can only keep as content a page that this run's rules failed or sent on. The run does not record which rule escalated a page. Of the two answers here that end `empty_unverified`, T011 ended so in the run at `f16072c`, and T073 in the run at `7c5dc6b`, whose saved home page has no main region under `extract-tf/14` either.

**Compared with the run at `f16072c`, before these rules:**

| | Before | This run |
| --- | --- | --- |
| Verified, all 92 | 48 | 49 |
| Verified, frozen 50 | 13 | 13 |
| False successes | 11 | 12 |
| Paid calls | 34 | 35 |
| Ledger charge (at the ceiling) | $0.1133 | $0.1167 |
| p50 / p95 ms | 5261 / 25118 | 5921 / 24784 |

**What the rules moved:**
- **T021 (ebay.com):** before, the http lane answered `success` with eBay's "Checking your browser before you access eBay … Please wait" (181 characters). This time no local rung answered, and Steel's page was eBay's 403 error page, so the task ended `failed`/`http_error`. That is an honest failure in place of a false success. The run keeps only the answering page, so which local rung named the check is not recorded. The page from the earlier run is a unit test that the rule names a block.
- **T055 (ec.europa.eu, Eurostat):** before, the answer was the EU banner's hidden dropdown (239 characters). This time the local rungs escalated and Steel's page was the dataset page: its title, codes, description and the population figures (3335 characters). It is still a false success, because `minTables` asks for a Markdown table and the figures are not in one. Firecrawl's answer to T055 fails the same predicate.
- **T060 (nasdaq.com):** the http lane offered the page to the browser as the empty-cell rule intends. The browser's page had the same empty table, with "Data is currently not available", and it answered `success`. The browser lane does not apply the empty-shell rule, so T060 is still a false success, and the rule was dropped after review.

**Not these rules, or not isolated:**
- **T023 (sephora.com) and T043 (redfin.com):** Steel's pages were `blocked` before and were let through this time. T023's page was a 94-character promotion, and T043's was a listing page that fails `markdownCountMin`. The rules only turn answers into failures or blocks, so they cannot have made these successes. This is run-to-run variation in what the sites served.
- **B003 (tesla.com), not isolated:** `blocked` (`bot_detected_generic`) on Steel's page, where the run before ended `empty_unverified`. The runner keeps neither a blocked page nor its signals, so whether the new heading rule or an older check named it is not recorded. Neither outcome is a success.
- **T051 and T067:** verified. Both were `cloudflare_challenge` before; this is run-to-run variation.
- **T073 (stubhub.com):** lost to a Steel timeout, `failed`/`empty_unverified`. It varies between runs.

**False successes left (12):**
- the page lacks the data: T010, T014;
- data loaded by script or scrolling: T017, T019, T056, T066, and T060 above;
- the wrong region: T006;
- a predicate tied to locale: T026, whose English page lacks "schuh";
- data present but not as a table: T055;
- what the sites served this time: T023, T043.
