# Access task set run: all, 2026-10-09

- Command: `node research/access/run-set.mjs --set all --access "enhanced" --record research/access/runs/2026-10-09-pa4-steel-all-walls-f16072c.md`
- Source commit: `f16072c5` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8798; access option: `"enhanced"`
- Exit address: 103.142.140.133
- Run: 2026-10-09T13:18:06.782Z → 2026-10-09T13:33:11.031Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 48 | 11 | 5261 | 25118 | unknown | unknown |

- Paid provider calls (cold): 34; tasks verified with a paid call's page as the answer: 7; charged by the spend ledger: $0.1133 (a provider that states no price is charged its price ceiling: an upper bound, not its bill)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 16680 | steel: blocked/cloudflare_challenge (answer) |
| T002 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 16098 | steel: success (answer) |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 13777 | steel: success (answer) |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40570 |  |
| T005 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19951 | steel: blocked/bot_detected_generic (answer) |
| T006 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 4505 |  |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 882 |  |
| T008 | cold | yes | success |  | 200 | http | http |  | 1640 |  |
| T009 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3453 |  |
| T010 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 25118 | steel: success (answer) |
| T011 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider |  | 29609 | steel: failed/empty_unverified (answer) |
| T012 | cold | no | blocked | captcha | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 27645 | steel: blocked/captcha (answer) |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 10505 |  |
| T014 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 21224 | steel: success (answer) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1718 |  |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6889 |  |
| T017 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 6837 |  |
| T018 | cold | yes | success |  | 200 | http | http_compat → browser_local → provider |  | 28933 | steel: success |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 3656 |  |
| T020 | cold | yes | success |  | 200 | http | http |  | 4268 |  |
| T021 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3758 |  |
| T022 | cold | yes | success |  | 200 | http | http |  | 1748 |  |
| T023 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin | 18259 | steel: blocked/bot_detected_generic (answer) |
| T024 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6602 |  |
| T025 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18725 | steel: failed/empty_unverified (answer) |
| T026 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownMatches | 8827 |  |
| T027 | cold | yes | success |  | 200 | http | http |  | 3351 |  |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 3152 |  |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 19486 | steel: success (answer) |
| T031 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3594 |  |
| T033 | cold | yes | success |  | 200 | http | http |  | 2437 |  |
| T034 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20122 | steel: blocked/bot_detected_generic (answer) |
| T035 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3580 |  |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5261 |  |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 666 |  |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15143 | steel: blocked/bot_detected_generic (answer) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3894 |  |
| T040 | cold | yes | success |  | 200 | http | http |  | 1211 |  |
| T041 | cold | yes | success |  | 200 | http | http → browser_local |  | 3233 |  |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1385 |  |
| T043 | cold | no | blocked | bot_detected_generic | 405 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18788 | steel: blocked/bot_detected_generic (answer) |
| T044 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7566 |  |
| T045 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18412 | steel: blocked/bot_detected_generic (answer) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 14857 | steel: blocked/bot_detected_generic (answer) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17519 | steel: blocked/cloudflare_challenge (answer) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 17335 | steel: blocked/cloudflare_challenge (answer) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2385 |  |
| T050 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 20694 | steel: success (answer) |
| T051 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin | 16401 | steel: blocked/cloudflare_challenge (answer) |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | minTables, markdownMatches | 17692 | steel: blocked/cloudflare_challenge (answer) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 16454 | steel: blocked/bot_detected_generic (answer) |
| T055 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | minTables, markdownMatches | 15642 |  |
| T056 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 865 |  |
| T057 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 2808 |  |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3683 |  |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2178 |  |
| T060 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 4264 |  |
| T061 | cold | yes | success |  | 200 | http | http |  | 2725 |  |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4917 |  |
| T063 | cold | yes | success |  | 200 | http | http |  | 1081 |  |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2420 |  |
| T065 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 21674 |  |
| T066 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 2836 |  |
| T067 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 15316 | steel: blocked/cloudflare_challenge (answer) |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 17218 | steel: blocked/cloudflare_challenge (answer) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15744 | steel: blocked/cloudflare_challenge (answer) |
| T070 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 24074 | steel: success (answer) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 14395 | steel: blocked/cloudflare_challenge (answer) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3413 |  |
| T073 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 15289 | steel: success (answer) |
| T074 | cold | yes | success |  | 200 | http | http → browser_local → provider |  | 14128 | steel: blocked/cloudflare_challenge |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4055 |  |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 15981 | steel: blocked/cloudflare_challenge (answer) |
| T077 | cold | yes | success |  | 200 | http | http |  | 843 |  |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1659 |  |
| T079 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5628 |  |
| T080 | cold | yes | success |  | 200 | http | http |  | 2198 |  |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1135 |  |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15229 | steel: blocked/cloudflare_challenge (answer) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5212 |  |
| B003 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 17990 | steel: failed/empty_unverified (answer) |
| B004 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 20342 | steel: success (answer) |
| B005 | cold | yes | success |  | 200 | http | http |  | 3946 |  |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4876 |  |
| B007 | cold | yes | success |  | 200 | http | http |  | 4033 |  |
| B008 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3130 |  |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 791 |  |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7000 |  |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3391 |  |
| B012 | cold | yes | success |  | 200 | http | http |  | 1207 |  |
| B013 | cold | yes | success |  | 200 | http | http |  | 1527 |  |
| B014 | cold | yes | success |  | 200 | http | http |  | 1944 |  |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (the short-wall rule as reviewed)

**Set-up.**
- Same set-up as `2026-10-09-pa4-steel-all-walls-6a4c456.md`: the Steel grant (SHA-256 `b2e32cb817d763f758e5755d94a61932182f3bf1894c09df39fc65fab5da1259`), Steel's tariff, and the proxied network.
- The server ran at `f16072c`, where the rule:
  - reads only a 2xx page;
  - reads it in one linear pass;
  - on a page not read as content, checks for a captcha or a login form first.
- One later commit changes only how the scan matches tags, so that a character whose lowercase is longer (Turkish "İ") does not shift it. That can only let the rule see walls this run might miss on such pages, and none of the 92 changed answers below involves one.

**Compared with the run at `7c5dc6b`, before the rule:**

| | Before | This run |
| --- | --- | --- |
| Verified, all 92 | 47 | 48 |
| Verified, frozen 50 | 12 | 13 |
| False successes | 13 | 11 |
| Paid calls | 33 | 34 |
| Ledger charge (at the ceiling) | $0.1033 | $0.1133 |
| p50 / p95 ms | 5502 / 27468 | 5261 / 25118 |

**Moved by the rule, as in the run at `6a4c456`:**
- **T070 (autotrader.com):** its Akamai page was named a block on the local rungs, and Steel's page was verified.
- **T025 (nordstrom.com):** its wall was named a block on the local rungs. Steel's page ended `failed`/`empty_unverified`, an honest failure in place of a false success.

**Not the rule:**
- **T043 (redfin.com):** `blocked` on Steel's page, which was Redfin's human check at HTTP 405. The rule reads only a 2xx page; the classifier's other checks named it.
- **T067:** `blocked` (`cloudflare_challenge`). It had been verified, and this is run-to-run variation.
- **T011:** `empty_unverified` through Steel, as in earlier runs.
- **T073 and T075:** verified. Both vary between runs.
- **T021:** a false success again.
- **T023:** no status; the API did not answer before the runner's 180 s timeout.
