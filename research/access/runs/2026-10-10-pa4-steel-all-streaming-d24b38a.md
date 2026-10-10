# Access task set run: all, 2026-10-10

- Command: `node research/access/run-set.mjs --set all --access "enhanced" --record research/access/runs/2026-10-10-pa4-steel-all-streaming-d24b38a.md`
- Source commit: `d24b38a7`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8792; access option: `"enhanced"`
- Exit address: 116.87.8.235
- Run: 2026-10-10T10:21:12.706Z → 2026-10-10T10:40:11.654Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 52 | 6 | 5707 | 30811 | unknown | unknown |

- Paid provider calls (cold): 36; tasks verified with a paid call's page as the answer: 10; charged by the spend ledger: $0.0215 (a provider that states no price is charged its sessions' measured time under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 23313 | steel: blocked/cloudflare_challenge (answer) |
| T002 | cold | no | failed | provider_error |  | provider | http → browser_local → provider | markdownMatches, markdownMatches | 65525 | steel: failed/provider_error (answer) |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 21196 | steel: success (answer) |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40268 |  |
| T005 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 21715 | steel: blocked/bot_detected_generic (answer) |
| T006 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 24970 | steel: success (answer) |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 2088 |  |
| T008 | cold | yes | success |  | 200 | http | http |  | 1918 |  |
| T009 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 4219 |  |
| T010 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 75326 | steel: success (answer) |
| T011 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 17652 | steel: success (answer) |
| T012 | cold | no | blocked | captcha | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 21340 | steel: blocked/captcha (answer) |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 11113 |  |
| T014 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 23809 | steel: success (answer) |
| T015 | cold | yes | success |  | 200 | http | http |  | 2050 |  |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6331 |  |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8221 |  |
| T018 | cold | yes | success |  | 200 | http | http_compat |  | 3701 |  |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 5382 |  |
| T020 | cold | yes | success |  | 200 | http | http |  | 4159 |  |
| T021 | cold | no | failed | http_error | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20137 | steel: failed/http_error (answer) |
| T022 | cold | yes | success |  | 200 | http | http |  | 2226 |  |
| T023 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 26926 | steel: success (answer) |
| T024 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6056 |  |
| T025 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 22117 | steel: failed/empty_unverified (answer) |
| T026 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownMatches | 8982 |  |
| T027 | cold | yes | success |  | 200 | http | http |  | 3644 |  |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 2958 |  |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 25886 | steel: success (answer) |
| T031 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 29429 | steel: failed/empty_unverified (answer) |
| T033 | cold | yes | success |  | 200 | http | http |  | 1680 |  |
| T034 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 30849 | steel: blocked/bot_detected_generic (answer) |
| T035 | cold | yes | success |  | 200 | http | http |  | 1629 |  |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4735 |  |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1201 |  |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20469 | steel: blocked/bot_detected_generic (answer) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4800 |  |
| T040 | cold | yes | success |  | 200 | http | http |  | 1356 |  |
| T041 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5707 |  |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1530 |  |
| T043 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 21186 | steel: success (answer) |
| T044 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6315 |  |
| T045 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 21036 | steel: blocked/bot_detected_generic (answer) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19470 | steel: blocked/bot_detected_generic (answer) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 22255 | steel: blocked/cloudflare_challenge (answer) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 21140 | steel: blocked/cloudflare_challenge (answer) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2379 |  |
| T050 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 15696 | steel: success (answer) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4467 |  |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | minTables, markdownMatches | 23552 | steel: blocked/cloudflare_challenge (answer) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 15051 | steel: blocked/bot_detected_generic (answer) |
| T055 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | minTables, markdownMatches | 30811 | steel: failed/empty_unverified (answer) |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3071 |  |
| T057 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3690 |  |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4242 |  |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2482 |  |
| T060 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 3428 |  |
| T061 | cold | yes | success |  | 200 | http | http |  | 3135 |  |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5329 |  |
| T063 | cold | yes | success |  | 200 | http | http |  | 882 |  |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2352 |  |
| T065 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 29931 | steel: success (answer) |
| T066 | cold | no (false success) | success |  | 200 | http | http → browser_local | markdownCountMin | 5401 |  |
| T067 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 22452 | steel: blocked/cloudflare_challenge (answer) |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 21062 | steel: blocked/cloudflare_challenge (answer) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 14658 | steel: blocked/cloudflare_challenge (answer) |
| T070 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 19735 | steel: success (answer) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16705 | steel: blocked/cloudflare_challenge (answer) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3309 |  |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4371 |  |
| T074 | cold | yes | success |  | 200 | http | http → browser_local → provider |  | 17997 | steel: blocked/cloudflare_challenge |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4333 |  |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 20255 | steel: blocked/cloudflare_challenge (answer) |
| T077 | cold | yes | success |  | 200 | http | http |  | 3510 |  |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1475 |  |
| T079 | cold | yes | success |  | 200 | http | http |  | 2545 |  |
| T080 | cold | yes | success |  | 200 | http | http |  | 2827 |  |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1239 |  |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 21427 | steel: blocked/cloudflare_challenge (answer) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 10326 |  |
| B003 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 23885 | steel: failed/empty_unverified (answer) |
| B004 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 25440 | steel: success (answer) |
| B005 | cold | yes | success |  | 200 | http | http |  | 4089 |  |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6245 |  |
| B007 | cold | yes | success |  | 200 | http | http |  | 3233 |  |
| B008 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3398 |  |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 791 |  |
| B010 | cold | no | failed | connection_error |  | browser_local | http → browser_local | minTables, markdownMatches | 3042 |  |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3136 |  |
| B012 | cold | yes | success |  | 200 | http | http |  | 894 |  |
| B013 | cold | yes | success |  | 200 | http | http |  | 809 |  |
| B014 | cold | yes | success |  | 200 | http | http |  | 980 |  |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (React-streamed pages put together on the HTTP lane)

**Set-up.**
- The Steel grant with the per-millisecond tariff (SHA-256 `67acb9bc515429e9c1258253f2da648bea1738a41dbcd77c8455526b323cd239`), proxied, the API on 8792. The ledger charges measured session time (#346).
- The server ran at `d24b38a`: main `d74e17d` plus the streaming resolver. The extractor applies a React 18/19 page's `$RS`/`$RC`/`$RR` calls after parsing, so the HTTP lane reads the page as its scripts put it together. The extractor is `extract-tf/21`.
- The exit address was 116.87.8.235. The earlier runs today left from 103.142.140.137.

**Compared with the runs at `fdc924d` (the `<main>` and listing rules, ceiling ledger) and `d5d6c2c` (measured ledger, before those rules):**

| | `fdc924d` | `d5d6c2c` | This run |
| --- | --- | --- | --- |
| Verified, all 92 | 55 | 51 | 52 |
| Verified, frozen 50 | 20 | 15 | 18 |
| Verified, healthy 25 | 23 | 23 | 23 |
| Verified, blind 14 | 10 | 10 | 9 |
| False successes | 7 | 11 | 6 |
| Paid calls | 34 | 32 | 36 |
| Ledger charge | $0.1133 (ceiling) | $0.0140 (measured) | $0.0215 (measured) |
| API 500s | 0 | 0 | 0 |

**What the resolver moved:**
- **T079 (x.com/NASA): false success → verified, on the http lane in 2,545 ms.** At `fdc924d` and `d5d6c2c` the http lane had answered the posts timeline without the profile's follower count, because the posts sat in a hidden streamed part outside the `<main>`.
- **T018 (wayfair.com sofas): verified on the http lane (`http_compat`) in 3,701 ms.** At `d5d6c2c` it went http → browser_local (9,531 ms). Put together, the page no longer reads as a shell.

**Lost against one of those runs, none traced to this change:**
- **T067 (ft.com) and T052 (census.gov): `blocked`/`cloudflare_challenge` on every lane.**
  - From this exit address, `curl` of ft.com/technology got a 403 Cloudflare challenge page, and that page had no streaming calls.
  - T067 had been verified on browser_local in every run but one since 2026-10-09. T052 had already been blocked in 9 of 14 runs.
- **B010 (espn.com): `failed`/`connection_error` on browser_local.** It was verified on the rerun below.
- **T066 (wsj.com market data): false success on the http lane.**
  - The ladder went http → browser_local and kept the http answer, as at `d5d6c2c`, before this change. The cause is not isolated.
  - A `curl` of the page (30,726 bytes) had no streaming calls, so the resolver has nothing to apply on it.
  - On the rerun it ended `failed`/`timeout` on the http lane.
- **T021, T025, T031:** each has gone both ways across today's and yesterday's runs: eBay `http_error`, Nordstrom and Temu `empty_unverified` on Steel's page.

**Rerun of four tasks**, against the same server, with no record written:
- Command: `node research/access/run-set.mjs --set all --only T067,B010,T066,T079 --access "enhanced"`. Raw output in `.w2l/access/runs/2026-10-10T11-16-46-545Z/`.
- T079 verified (http) and B010 verified (browser_local).
- T066 `failed`/`timeout` (http).
- T067 `failed`/`provider_error` after http → browser_local → provider: one Steel call, $0.0033 at its ceiling.

**False successes left (6):**
- **The page lacks the data:** T010; and T014, whose Steel page (2,840 characters) holds no price.
- **The figures do not arrive in a browser:** T019, T060.
- **Not isolated:** T026 (zalando.de: 88 prices on browser_local, but no "schuh") and T066.
