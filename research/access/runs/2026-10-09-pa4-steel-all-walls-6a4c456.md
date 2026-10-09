# Access task set run: all, 2026-10-09

- Command: `node research/access/run-set.mjs --set all --access "enhanced" --record research/access/runs/2026-10-09-pa4-steel-all-walls-6a4c456.md`
- Source commit: `6a4c4563` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8798; access option: `"enhanced"`
- Exit address: 103.142.140.136
- Run: 2026-10-09T12:49:04.588Z → 2026-10-09T13:06:15.049Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 49 | 9 | 6196 | 26721 | unknown | unknown |

- Paid provider calls (cold): 36; tasks verified with a paid call's page as the answer: 8; charged by the spend ledger: $0.1200 (a provider that states no price is charged its price ceiling: an upper bound, not its bill)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 21126 | steel: blocked/cloudflare_challenge (answer) |
| T002 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 18616 | steel: success (answer) |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 21075 | steel: success (answer) |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40094 |  |
| T005 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 24985 | steel: blocked/bot_detected_generic (answer) |
| T006 | cold | no (false success) | success |  | 202 | provider | http → browser_local → provider | markdownCountMin | 22620 | steel: success (answer) |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 2492 |  |
| T008 | cold | yes | success |  | 200 | http | http |  | 1737 |  |
| T009 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3923 |  |
| T010 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 26721 | steel: success (answer) |
| T011 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider |  | 17409 | steel: failed/empty_unverified (answer) |
| T012 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 22241 | steel: failed/empty_unverified (answer) |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 11094 |  |
| T014 | cold | no | failed | http_error | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15969 | steel: failed/http_error (answer) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1938 |  |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5728 |  |
| T017 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 8290 |  |
| T018 | cold | yes | success |  | 200 | http | http_compat → browser_local → provider |  | 33913 | steel: success |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 3721 |  |
| T020 | cold | yes | success |  | 200 | http | http |  | 4603 |  |
| T021 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 25562 | steel: success (answer) |
| T022 | cold | yes | success |  | 200 | http | http |  | 2174 |  |
| T023 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin | 18562 | steel: blocked/bot_detected_generic (answer) |
| T024 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 39034 | steel: success (answer) |
| T025 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23902 | steel: failed/empty_unverified (answer) |
| T026 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownMatches | 10670 |  |
| T027 | cold | yes | success |  | 200 | http | http |  | 3380 |  |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 3127 |  |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 22314 | steel: success (answer) |
| T031 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 18532 | steel: failed/empty_unverified (answer) |
| T033 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3503 |  |
| T034 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17924 | steel: blocked/bot_detected_generic (answer) |
| T035 | cold | yes | success |  | 200 | http | http |  | 2100 |  |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5379 |  |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 963 |  |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16293 | steel: blocked/bot_detected_generic (answer) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4297 |  |
| T040 | cold | yes | success |  | 200 | http | http |  | 1596 |  |
| T041 | cold | yes | success |  | 200 | http | http → browser_local |  | 3778 |  |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1773 |  |
| T043 | cold | no | blocked | bot_detected_generic | 405 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17774 | steel: blocked/bot_detected_generic (answer) |
| T044 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6953 |  |
| T045 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16071 | steel: blocked/bot_detected_generic (answer) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19135 | steel: blocked/bot_detected_generic (answer) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15166 | steel: blocked/cloudflare_challenge (answer) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 14433 | steel: blocked/cloudflare_challenge (answer) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2590 |  |
| T050 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 19879 | steel: success (answer) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6301 |  |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | minTables, markdownMatches | 20803 | steel: blocked/cloudflare_challenge (answer) |
| T053 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 21416 | steel: success (answer) |
| T055 | cold | no | failed | empty_unverified | 200 | http | http → browser_local | minTables, markdownMatches | 26678 |  |
| T056 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 1216 |  |
| T057 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3982 |  |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4371 |  |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3340 |  |
| T060 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 4442 |  |
| T061 | cold | yes | success |  | 200 | http | http |  | 2931 |  |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5255 |  |
| T063 | cold | yes | success |  | 200 | http | http |  | 1098 |  |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2060 |  |
| T065 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 11994 |  |
| T066 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 2314 |  |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3771 |  |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 20944 | steel: blocked/cloudflare_challenge (answer) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17878 | steel: blocked/cloudflare_challenge (answer) |
| T070 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 27401 | steel: success (answer) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16873 | steel: blocked/cloudflare_challenge (answer) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3524 |  |
| T073 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → provider |  | 20436 | steel: failed/provider_error |
| T074 | cold | yes | success |  | 200 | http | http → browser_local → provider |  | 21211 | steel: blocked/cloudflare_challenge |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3972 |  |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 20103 | steel: blocked/cloudflare_challenge (answer) |
| T077 | cold | yes | success |  | 200 | http | http |  | 1279 |  |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1461 |  |
| T079 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6196 |  |
| T080 | cold | yes | success |  | 200 | http | http |  | 2171 |  |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1229 |  |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16918 | steel: blocked/cloudflare_challenge (answer) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6112 |  |
| B003 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 16756 | steel: failed/empty_unverified (answer) |
| B004 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 21973 | steel: success (answer) |
| B005 | cold | yes | success |  | 200 | http | http |  | 4702 |  |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5644 |  |
| B007 | cold | yes | success |  | 200 | http | http |  | 3876 |  |
| B008 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3832 |  |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 1224 |  |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6697 |  |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4465 |  |
| B012 | cold | yes | success |  | 200 | http | http |  | 1398 |  |
| B013 | cold | yes | success |  | 200 | http | http |  | 3057 |  |
| B014 | cold | yes | success |  | 200 | http | http |  | 1193 |  |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (recognising short pages that refuse automated visitors)

**Set-up.**
- The setup matches `2026-10-09-pa4-steel-all-headings-7c5dc6b.md`: the Steel grant (SHA-256 `b2e32cb817d763f758e5755d94a61932182f3bf1894c09df39fc65fab5da1259`), Steel's tariff, and the proxied network.
- The server ran at `6a4c456`. In that build, the gate names a short page (at most 1,500 characters of visible text) `bot_detected_generic` when either:
  - its text carries Akamai's reference to the refused request;
  - a heading reports unusual or suspicious activity and its copy refuses automated traffic.

  The gate reads the whole body for this.
- Before this run, the two pages that motivated it were scraped once each through a local API without a grant (port 8792) at the same commit. Both answered `blocked`/`bot_detected_generic` with these signals:
  - T070: `akamai_reference`, `short_page`.
  - T025: `heading_unusual_activity`, `text_automated_traffic`, `short_page`.

**Compared with the run at `7c5dc6b`:**

| | Before | This run |
| --- | --- | --- |
| Verified, all 92 | 47 | 49 |
| Verified, frozen 50 | 12 | 14 |
| False successes | 13 | 9 |
| Paid calls | 33 | 36 |
| Ledger charge (at the ceiling) | $0.1033 | $0.1200 |
| p50 / p95 ms | 5502 / 27468 | 6196 / 26721 |

**Moved by the rule:**
- **T070 (autotrader.com).** It had answered `success` with Akamai's page. This time the local rungs named the block, the ladder went on to Steel, and Steel's page was verified.
- **T025 (nordstrom.com).** It had answered `success` with Nordstrom's wall. This time the local rungs named the block and the ladder went on to Steel. Steel's page ended `failed`/`empty_unverified`: an honest failure in place of a false success.

**Not the rule, and why:**
- **T043 (redfin.com)** ended `blocked`. Steel's page this time was Redfin's own human check ("Let's confirm you are human", HTTP 405). That is a correct block of a page that varies between runs.
- **T051, T053 and T075 were verified.** Their earlier answers were blocks or 403s that vary.
- **T011 and T031 were not verified**: `empty_unverified` through Steel. Both vary between runs.
- **T014 and T055 stopped being false successes.** They ended `http_error` and `empty_unverified`.
- **T021 became a false success.** Steel's eBay page varies.
- **T023 has no status.** The API did not answer before the runner's 180 s timeout.
