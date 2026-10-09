# Access task set run: all, 2026-10-09

- Command: `node research/access/run-set.mjs --set all --access "enhanced" --record research/access/runs/2026-10-10-pa4-steel-all-errors-86c3b19.md`
- Source commit: `86c3b19d`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8792; access option: `"enhanced"`
- Exit address: 103.142.140.137
- Run: 2026-10-09T17:47:12.700Z → 2026-10-09T18:03:18.815Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 53 | 5 | 5650 | 30317 | unknown | unknown |

- Paid provider calls (cold): 34; tasks verified with a paid call's page as the answer: 7; charged by the spend ledger: $0.1133 (a provider that states no price is charged its price ceiling: an upper bound, not its bill)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 18088 | steel: blocked/cloudflare_challenge (answer) |
| T002 | cold | no | blocked | cloudflare_challenge | 200 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 17780 | steel: blocked/cloudflare_challenge (answer) |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 16305 | steel: success (answer) |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40216 |  |
| T005 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 24913 | steel: blocked/bot_detected_generic (answer) |
| T006 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 19620 | steel: success (answer) |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 1222 |  |
| T008 | cold | yes | success |  | 200 | http | http |  | 2041 |  |
| T009 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3328 |  |
| T010 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 26444 | steel: success (answer) |
| T011 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider |  | 16900 | steel: failed/empty_unverified (answer) |
| T012 | cold | no | blocked | captcha | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 30317 | steel: blocked/captcha (answer) |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 11011 |  |
| T014 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 13647 | steel: failed/empty_unverified (answer) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1849 |  |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5198 |  |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5730 |  |
| T018 | cold | yes | success |  | 200 | provider | http_compat → browser_local → provider |  | 33824 | steel: success (answer) |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 3656 |  |
| T020 | cold | yes | success |  | 200 | http | http |  | 4119 |  |
| T021 | cold | no | failed | http_error | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18343 | steel: failed/http_error (answer) |
| T022 | cold | yes | success |  | 200 | http | http |  | 1799 |  |
| T023 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19449 | steel: success (answer) |
| T024 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6931 |  |
| T025 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16712 | steel: failed/empty_unverified (answer) |
| T026 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownMatches | 9587 |  |
| T027 | cold | yes | success |  | 200 | http | http |  | 3350 |  |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 2423 |  |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 20581 | steel: success (answer) |
| T031 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 25652 | steel: failed/empty_unverified (answer) |
| T033 | cold | yes | success |  | 200 | http | http |  | 1682 |  |
| T034 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20609 | steel: blocked/bot_detected_generic (answer) |
| T035 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3451 |  |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4497 |  |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 707 |  |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16929 | steel: blocked/bot_detected_generic (answer) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3843 |  |
| T040 | cold | yes | success |  | 200 | http | http |  | 1136 |  |
| T041 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5757 |  |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1440 |  |
| T043 | cold | no | blocked | bot_detected_generic | 405 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16627 | steel: blocked/bot_detected_generic (answer) |
| T044 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6350 |  |
| T045 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18962 | steel: blocked/bot_detected_generic (answer) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19797 | steel: blocked/bot_detected_generic (answer) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16195 | steel: blocked/cloudflare_challenge (answer) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 20424 | steel: blocked/cloudflare_challenge (answer) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2376 |  |
| T050 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 23194 | steel: success (answer) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4236 |  |
| T052 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5294 |  |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 18154 | steel: blocked/bot_detected_generic (answer) |
| T055 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | minTables | 42521 | steel: failed/empty_unverified (answer) |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2766 |  |
| T057 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3014 |  |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4205 |  |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2305 |  |
| T060 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 3751 |  |
| T061 | cold | yes | success |  | 200 | http | http |  | 3079 |  |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5064 |  |
| T063 | cold | yes | success |  | 200 | http | http |  | 1117 |  |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2122 |  |
| T065 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 11340 |  |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5901 |  |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3494 |  |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 18708 | steel: blocked/cloudflare_challenge (answer) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16411 | steel: blocked/cloudflare_challenge (answer) |
| T070 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 19177 | steel: success (answer) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18198 | steel: blocked/cloudflare_challenge (answer) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3040 |  |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3671 |  |
| T074 | cold | yes | success |  | 200 | http | http → browser_local → provider |  | 17310 | steel: blocked/cloudflare_challenge |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3878 |  |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 18998 | steel: blocked/cloudflare_challenge (answer) |
| T077 | cold | yes | success |  | 200 | http | http |  | 805 |  |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1457 |  |
| T079 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5820 |  |
| T080 | cold | yes | success |  | 200 | http | http |  | 2291 |  |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1183 |  |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20114 | steel: blocked/cloudflare_challenge (answer) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5650 |  |
| B003 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 24404 | steel: failed/empty_unverified (answer) |
| B004 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 30496 | steel: success (answer) |
| B005 | cold | yes | success |  | 200 | http | http |  | 4121 |  |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4558 |  |
| B007 | cold | yes | success |  | 200 | http | http |  | 4074 |  |
| B008 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3232 |  |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 753 |  |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5823 |  |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3629 |  |
| B012 | cold | yes | success |  | 200 | http | http |  | 1067 |  |
| B013 | cold | yes | success |  | 200 | http | http |  | 1766 |  |
| B014 | cold | yes | success |  | 200 | http | http |  | 1339 |  |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (looking for the enhanced lane's 500 at about 32 s)

**Why this run.** In each of three earlier Steel runs, one request ended in an API 500 at about 32 s and left no record of what threw:
- T023 at `7c5dc6b`, 32,590 ms;
- T068 at `e2fa0a4`, 32,520 ms;
- T050 at `c44f632`, 32,274 ms.

This run is the same set-up as `2026-10-10-pa4-steel-all-collection-c44f632.md` (Steel grant SHA-256 `b2e32cb817d763f758e5755d94a61932182f3bf1894c09df39fc65fab5da1259`, proxied, API on 8792). It ran against `86c3b19`, where:
- the server logs every unexpected error;
- the runner keeps an error answer's code and message.

**What it showed.**
- No request ended in a 500, and the server logged no error.
- Before it, 15 requests outside this run, five each to T023's, T068's and T050's URLs through Steel, all answered 200.
- The 500 did not reproduce on demand.

**The cause, found in the code and reproduced in a unit test.**
- **Where the error escapes:** a Steel call first opens a session: a session create through the vendor API helper, which caps every call at 30 s, then a CDP connect and a probe of the browser's User-Agent. In `buildChannels` (`packages/bench/src/ladderCli.ts`) that connect ran outside the provider subject, whose own failures become a `failed`/`provider_error` result. A connect that threw escaped the rung, and the ladder rethrows a rung's error unless the request's deadline has passed. The API answered 500, and the page's other rungs and the call's charge went unrecorded.
- **Why about 32 s, inferred:** all three tasks reach Steel only after both local rungs are refused. A provider rung that began about 2.4 s in, followed by a session create that hung to the 30 s cap, ends at about 32.4 s. The runs record no per-rung times, so the 2.4 s is not measured.
- **Not verified on the live failure:** that Steel's session create hung in those three requests is inferred from the timing and the code path; their errors were not recorded.

**Compared with the run at `c44f632`:**
- **Verified: 52 → 53. False successes: 10 → 5.**
- Verified this time: T008, T033, T050, T052.
- Lost this time: T011, T021 (eBay's error page, `http_error` on Steel's page), T031.
- These are run-to-run variation in what the sites served; this commit changes no extraction or routing.
