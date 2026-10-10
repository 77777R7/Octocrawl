# Access task set run: all, 2026-10-10

- Command: `node research/access/run-set.mjs --set all --access "enhanced" --record research/access/runs/2026-10-10-pa4-steel-all-remaining2-fdc924d.md`
- Source commit: `fdc924dc`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8792; access option: `"enhanced"`
- Exit address: 103.142.140.136
- Run: 2026-10-10T03:23:11.343Z → 2026-10-10T03:44:48.369Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 55 | 7 | 6456 | 34372 | unknown | unknown |

- Paid provider calls (cold): 34; tasks verified with a paid call's page as the answer: 11; charged by the spend ledger: $0.1133 (a provider that states no price is charged its price ceiling: an upper bound, not its bill)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 27474 | steel: blocked/cloudflare_challenge (answer) |
| T002 | cold | no | blocked | cloudflare_challenge | 200 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 26615 | steel: blocked/cloudflare_challenge (answer) |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 24431 | steel: success (answer) |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40563 |  |
| T005 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 31778 | steel: blocked/bot_detected_generic (answer) |
| T006 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 28487 | steel: success (answer) |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 2069 |  |
| T008 | cold | yes | success |  | 200 | http | http |  | 1814 |  |
| T009 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 4117 |  |
| T010 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 34693 | steel: success (answer) |
| T011 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 32978 | steel: success (answer) |
| T012 | cold | no | blocked | captcha | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 30555 | steel: blocked/captcha (answer) |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 11007 |  |
| T014 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 24846 | steel: success (answer) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1877 |  |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8093 |  |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6456 |  |
| T018 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 9050 |  |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 4991 |  |
| T020 | cold | yes | success |  | 200 | http | http |  | 4654 |  |
| T021 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 30396 | steel: success (answer) |
| T022 | cold | yes | success |  | 200 | http | http |  | 2766 |  |
| T023 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 26641 | steel: success (answer) |
| T024 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6903 |  |
| T025 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 34372 | steel: failed/empty_unverified (answer) |
| T026 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 12559 |  |
| T027 | cold | yes | success |  | 200 | http | http |  | 3747 |  |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 2876 |  |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 26475 | steel: success (answer) |
| T031 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 30188 | steel: failed/empty_unverified (answer) |
| T033 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 1610 |  |
| T034 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 26018 | steel: blocked/bot_detected_generic (answer) |
| T035 | cold | yes | success |  | 200 | http | http |  | 2980 |  |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5965 |  |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1257 |  |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 26554 | steel: blocked/bot_detected_generic (answer) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5305 |  |
| T040 | cold | yes | success |  | 200 | http | http |  | 1741 |  |
| T041 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5379 |  |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1976 |  |
| T043 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 24169 | steel: success (answer) |
| T044 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6549 |  |
| T045 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 27261 | steel: blocked/bot_detected_generic (answer) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23171 | steel: blocked/bot_detected_generic (answer) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23560 | steel: blocked/cloudflare_challenge (answer) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 21594 | steel: blocked/cloudflare_challenge (answer) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3201 |  |
| T050 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 27117 | steel: success (answer) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4969 |  |
| T052 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6597 |  |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 25297 | steel: blocked/bot_detected_generic (answer) |
| T055 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 40613 | steel: success (answer) |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4211 |  |
| T057 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 4557 |  |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4441 |  |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3863 |  |
| T060 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 3447 |  |
| T061 | cold | yes | success |  | 200 | http | http |  | 3807 |  |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6456 |  |
| T063 | cold | yes | success |  | 200 | http | http |  | 3082 |  |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3217 |  |
| T065 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 34342 | steel: success (answer) |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7290 |  |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3122 |  |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 23292 | steel: blocked/cloudflare_challenge (answer) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 21739 | steel: blocked/cloudflare_challenge (answer) |
| T070 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 23400 | steel: success (answer) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 22256 | steel: blocked/cloudflare_challenge (answer) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3764 |  |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5330 |  |
| T074 | cold | yes | success |  | 200 | http | http → browser_local → provider |  | 23205 | steel: blocked/cloudflare_challenge |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4080 |  |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 22884 | steel: blocked/cloudflare_challenge (answer) |
| T077 | cold | yes | success |  | 200 | http | http |  | 1221 |  |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1543 |  |
| T079 | cold | no (false success) | success |  | 200 | http | http | markdownMatches | 2175 |  |
| T080 | cold | yes | success |  | 200 | http | http |  | 2268 |  |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1208 |  |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 24614 | steel: blocked/cloudflare_challenge (answer) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8176 |  |
| B003 | cold | no | failed | timeout |  | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 124241 | steel: failed/timeout (answer) |
| B004 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 17735 | steel: success (answer) |
| B005 | cold | yes | success |  | 200 | http | http |  | 4635 |  |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5902 |  |
| B007 | cold | yes | success |  | 200 | http | http |  | 3807 |  |
| B008 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3311 |  |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 1400 |  |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6469 |  |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3469 |  |
| B012 | cold | yes | success |  | 200 | http | http |  | 1645 |  |
| B013 | cold | yes | success |  | 200 | http | http |  | 2318 |  |
| B014 | cold | yes | success |  | 200 | http | http |  | 1783 |  |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (top-level products as a listing, and `<main>` over chrome)

**Set-up.**
- The same set-up as `2026-10-10-pa4-steel-all-errors-86c3b19.md`: the Steel grant (SHA-256 `b2e32cb817d763f758e5755d94a61932182f3bf1894c09df39fc65fab5da1259`), proxied, the API on 8792.
- The server ran at `fdc924d`, which has two rules on top of main `2650a4d`:
  - Three or more distinct top-level JSON-LD Products are a listing's cards. Not those in a recommendation section, and not when the h1 names one.
  - A region the cascade finds outside `<main>` gives way to `<main>` when every h1 is in it, unless the region is inside a hidden element.
  - The extractor is `extract-tf/20`.

**Compared with the run at `86c3b19`:**

| | Before | This run |
| --- | --- | --- |
| Verified, all 92 | 53 | 55 |
| Verified, frozen 50 | 16 | 20 |
| False successes | 5 | 7 |
| Paid calls | 34 | 34 |
| Ledger charge (at the ceiling) | $0.1133 | $0.1133 |
| p50 / p95 ms | 5650 / 30317 | 6456 / 34372 |
| API 500s | 0 | 0 |

**What the rules moved, both now verified on Steel's page:**
- **T043 (redfin.com).** The answer is 47,770 characters, read as a listing.
  - Before, its 41 per-home Product scripts counted as the page's own product, and the answer kept 2 of its 112 prices. That was on Steel's page saved on 2026-10-10.
  - The page is verified only when Steel is let through. In the run before, it had been `blocked`.
- **T023 (sephora.com).** The answer is 2,450 characters: the `<main>` with "Moisturizers", "726 Results" and the product tiles. Before, it was the header's 94-character promotion.

**Not these rules, or not isolated:**
- **T079 (x.com/NASA): verified → false success.**
  - This time the http lane answered the posts timeline (5,012 characters) and did not hand the page to the browser. The three earlier runs had all gone http → browser_local and been verified.
  - The timeline is the region the extractor before these rules takes on the saved page `scratchpad/br/raw/T079.html`. The new `<main>` rule leaves a region inside a hidden element as it is, so it did not apply to it there.
  - This run's http page was not kept, so it is **not isolated** why the page did not read as a shell this time. The likely reason is that X served more text than on the saved page.
- **T033 (amazon.com): false success.** Amazon served no prices again, as at `c44f632`.
- **T011 and T021: verified this time.** T021 got Steel's real eBay page, read as a listing by #332.
- **Variation:**
  - T014 and T055 are false successes again;
  - T026 ended `failed`/`timeout` on the http lane;
  - B003 ended `failed`/`timeout`.

**False successes left (7):**
- **The page lacks the data:** T010; and T014, whose Steel page holds 1 price.
- **The figures do not arrive in a browser:** T019, T060.
- **The data is not a table:** T055.
- **What the site served this time:** T033; and T079, not isolated.
