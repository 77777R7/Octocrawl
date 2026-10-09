# Access task set run: all, 2026-10-09

- Command: `node research/access/run-set.mjs --set all --access "enhanced" --record research/access/runs/2026-10-09-pa4-steel-all-loading-76a1c70.md`
- Source commit: `76a1c701`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8798; access option: `"enhanced"`
- Exit address: 103.142.140.152
- Run: 2026-10-09T09:39:59.282Z → 2026-10-09T09:54:08.434Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 47 | 16 | 5271 | 23654 | unknown | unknown |

- Paid provider calls (cold): 30; tasks verified with a paid call's page as the answer: 6; charged by the spend ledger: $0.1000 (a provider that states no price is charged its price ceiling: an upper bound, not its bill)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 15832 | steel: blocked/bot_detected_generic (answer) |
| T002 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 16479 | steel: success (answer) |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 18991 | steel: success (answer) |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40327 |  |
| T005 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18254 | steel: blocked/bot_detected_generic (answer) |
| T006 | cold | no (false success) | success |  | 202 | provider | http → browser_local → provider | markdownCountMin | 19427 | steel: success (answer) |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 1626 |  |
| T008 | cold | yes | success |  | 200 | http | http |  | 2085 |  |
| T009 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3143 |  |
| T010 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 31420 | steel: success (answer) |
| T011 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 17966 | steel: success (answer) |
| T012 | cold | no | blocked | captcha | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19796 | steel: blocked/captcha (answer) |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 10504 |  |
| T014 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 20630 | steel: success (answer) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1571 |  |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6092 |  |
| T017 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 5063 |  |
| T018 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 10432 |  |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 4254 |  |
| T020 | cold | yes | success |  | 200 | http | http |  | 3655 |  |
| T021 | cold | no | failed | http_error | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18499 | steel: failed/http_error (answer) |
| T022 | cold | yes | success |  | 200 | http | http |  | 2269 |  |
| T023 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23946 | steel: success (answer) |
| T024 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7081 |  |
| T025 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 5269 |  |
| T026 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownMatches | 9765 |  |
| T027 | cold | yes | success |  | 200 | http | http |  | 3354 |  |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 2556 |  |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 20919 | steel: success (answer) |
| T031 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 3604 |  |
| T033 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 2462 |  |
| T034 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 26041 | steel: blocked/bot_detected_generic (answer) |
| T035 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4412 |  |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6425 |  |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 940 |  |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17976 | steel: blocked/bot_detected_generic (answer) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4744 |  |
| T040 | cold | yes | success |  | 200 | http | http |  | 2135 |  |
| T041 | cold | yes | success |  | 200 | http | http → browser_local |  | 3737 |  |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1779 |  |
| T043 | cold | no | blocked | bot_detected_generic | 405 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18120 | steel: blocked/bot_detected_generic (answer) |
| T044 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7680 |  |
| T045 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19284 | steel: blocked/bot_detected_generic (answer) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 14682 | steel: blocked/bot_detected_generic (answer) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16263 | steel: blocked/cloudflare_challenge (answer) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 14439 | steel: blocked/cloudflare_challenge (answer) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2716 |  |
| T050 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 16305 | steel: success (answer) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5724 |  |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | minTables, markdownMatches | 17455 | steel: blocked/cloudflare_challenge (answer) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 17270 | steel: blocked/bot_detected_generic (answer) |
| T055 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | minTables, markdownMatches | 12274 |  |
| T056 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 990 |  |
| T057 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3336 |  |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4584 |  |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2692 |  |
| T060 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 4409 |  |
| T061 | cold | yes | success |  | 200 | http | http |  | 2773 |  |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5271 |  |
| T063 | cold | yes | success |  | 200 | http | http |  | 953 |  |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2170 |  |
| T065 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 11295 |  |
| T066 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 2472 |  |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3730 |  |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 15525 | steel: blocked/cloudflare_challenge (answer) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 14206 | steel: blocked/cloudflare_challenge (answer) |
| T070 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin, markdownMatches | 1194 |  |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16751 | steel: blocked/cloudflare_challenge (answer) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3889 |  |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5894 |  |
| T074 | cold | yes | success |  | 200 | http | http → browser_local → provider |  | 16720 | steel: blocked/cloudflare_challenge |
| T075 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3822 |  |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 15950 | steel: blocked/cloudflare_challenge (answer) |
| T077 | cold | yes | success |  | 200 | http | http |  | 953 |  |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1683 |  |
| T079 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6110 |  |
| T080 | cold | yes | success |  | 200 | http | http |  | 2455 |  |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1374 |  |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20004 | steel: blocked/cloudflare_challenge (answer) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5858 |  |
| B003 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23654 | steel: success (answer) |
| B004 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 18441 | steel: success (answer) |
| B005 | cold | yes | success |  | 200 | http | http |  | 4214 |  |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5153 |  |
| B007 | cold | yes | success |  | 200 | http | http |  | 4532 |  |
| B008 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3240 |  |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 704 |  |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6185 |  |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3290 |  |
| B012 | cold | yes | success |  | 200 | http | http |  | 983 |  |
| B013 | cold | yes | success |  | 200 | http | http |  | 1860 |  |
| B014 | cold | yes | success |  | 200 | http | http |  | 1208 |  |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (the final loading wait: a replaced document counts as still loading)

**Set-up.**
- The set-up matches `2026-10-09-pa4-steel-all-06b9354.md`: the Steel grant (SHA-256 `b2e32cb817d763f758e5755d94a61932182f3bf1894c09df39fc65fab5da1259`), Steel's tariff, and the same proxied network.
- The server ran at `76a1c70`. In that build the narrowed probe also waits on through a document that the page replaces while it loads.
- `07c4e56`, which followed, changes a comment only.

**One more Steel call before this run.** A single scrape of B003 (`https://www.tesla.com/inventory/new/m3`, `access: "enhanced"`) at `76a1c70`, through the same server:
- Steel's attempt recorded `loading_wait {waitedMs: 5100, cleared: true}`.
- It ended `failed`/`empty_unverified`, with the page kept as evidence (22177 characters).

**Compared with the run before any loading wait** (`06b9354`):

| | Before | This run |
| --- | --- | --- |
| Verified, all 92 | 45 | 47 |
| Verified, frozen 50 | 11 | 12 |
| False successes | 16 | 16 |
| Paid calls | 31 | 30 |
| Ledger charge (at the ceiling) | $0.1033 | $0.1000 |
| p50 / p95 ms | 6120 / 23534 | 5271 / 23654 |

- On the 45 tasks both runs verified, the median was 4412 ms here and 5025 ms before.
- Newly verified: T008 and T018. Neither is credited to the wait: T008's earlier answers were rate limits, and T018 is local-browser variation.

**The false successes are not fewer in this run, and why.**
- **B003 was not read mid-load this time.**
  - Its answer was the page after loading (23.7 s on its Steel attempt).
  - That page has no vehicles through Steel. The extractor took one 43-character heading as its main content ("Don't see the Tesla you're looking for?") and answered `success`.
  - So this false success comes from a tiny main content being accepted as success, not from the wait.
  - In the single scrape above, the same page ended `empty_unverified`, so the extractor's verdict on it varies between loads.
- **T025's answer was Nordstrom's block page** ("We've noticed some unusual activity"). The local browser lane answered it as `success`: a block page that was not recognised, unrelated to loading.
- **T031** became a false success (local browser, `markdownCountMin`).
- **T021** stopped being a false success (`http_error`).
- Both of those are run-to-run variation.

**What the wait has shown across the runs at `004a107`, `4f791ae` and here.**
- B003 is no longer captured while it shows "Fetching...", when the wait reaches its loader.
- Its honest answer is a failure, because the page has no data through Steel.
- The wait does not change the other false-success causes in this set:
  - pages whose items are not in the page Steel rendered;
  - tiny main content accepted as success;
  - unrecognised block pages;
  - tasks whose data fails a count predicate on pages that loaded.
