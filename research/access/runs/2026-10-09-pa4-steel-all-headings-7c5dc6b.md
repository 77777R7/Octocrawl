# Access task set run: all, 2026-10-09

- Command: `node research/access/run-set.mjs --set all --access "enhanced" --record research/access/runs/2026-10-09-pa4-steel-all-headings-7c5dc6b.md`
- Source commit: `7c5dc6b6`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8798; access option: `"enhanced"`
- Exit address: 103.142.140.58
- Run: 2026-10-09T10:53:44.833Z → 2026-10-09T11:08:56.829Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 47 | 13 | 5502 | 27468 | unknown | unknown |

- Paid provider calls (cold): unknown; tasks verified with a paid call's page as the answer: unknown; charged by the spend ledger: unknown (a provider that states no price is charged its price ceiling: an upper bound, not its bill)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 16788 | steel: blocked/cloudflare_challenge (answer) |
| T002 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 16971 | steel: success (answer) |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 18144 | steel: success (answer) |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40537 |  |
| T005 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 14627 | steel: blocked/bot_detected_generic (answer) |
| T006 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 15923 | steel: success (answer) |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 1860 |  |
| T008 | cold | yes | success |  | 200 | http | http |  | 1793 |  |
| T009 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3606 |  |
| T010 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 27468 | steel: success (answer) |
| T011 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 25360 | steel: success (answer) |
| T012 | cold | no | blocked | captcha | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 25667 | steel: blocked/captcha (answer) |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 10501 |  |
| T014 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 32320 | steel: success (answer) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1710 |  |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5502 |  |
| T017 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 5561 |  |
| T018 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 10492 |  |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 4495 |  |
| T020 | cold | yes | success |  | 200 | http | http |  | 3792 |  |
| T021 | cold | no | failed | http_error | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17371 | steel: failed/http_error (answer) |
| T022 | cold | yes | success |  | 200 | http | http |  | 2904 |  |
| T023 | cold | no | - |  |  |  |  | markdownCountMin, markdownMatches | 32590 | unknown |
| T024 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6624 |  |
| T025 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 4661 |  |
| T026 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownMatches | 9075 |  |
| T027 | cold | yes | success |  | 200 | http | http |  | 3551 |  |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 2462 |  |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 20451 | steel: success (answer) |
| T031 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4693 |  |
| T033 | cold | yes | success |  | 200 | http | http |  | 2010 |  |
| T034 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20872 | steel: blocked/bot_detected_generic (answer) |
| T035 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3616 |  |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6258 |  |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 720 |  |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15209 | steel: blocked/bot_detected_generic (answer) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4897 |  |
| T040 | cold | yes | success |  | 200 | http | http |  | 1150 |  |
| T041 | cold | yes | success |  | 200 | http | http → browser_local |  | 3031 |  |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1357 |  |
| T043 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 24268 | steel: success (answer) |
| T044 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7713 |  |
| T045 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20614 | steel: blocked/bot_detected_generic (answer) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18534 | steel: blocked/bot_detected_generic (answer) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20433 | steel: blocked/cloudflare_challenge (answer) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 17316 | steel: blocked/cloudflare_challenge (answer) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 3033 |  |
| T050 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 19081 | steel: success (answer) |
| T051 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin | 18844 | steel: blocked/cloudflare_challenge (answer) |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | minTables, markdownMatches | 18880 | steel: blocked/cloudflare_challenge (answer) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 17299 | steel: blocked/bot_detected_generic (answer) |
| T055 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | minTables, markdownMatches | 12198 |  |
| T056 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 1047 |  |
| T057 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 4247 |  |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3987 |  |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2797 |  |
| T060 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 2008 |  |
| T061 | cold | yes | success |  | 200 | http | http |  | 2698 |  |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5427 |  |
| T063 | cold | yes | success |  | 200 | http | http |  | 1111 |  |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2284 |  |
| T065 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 11868 |  |
| T066 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 2768 |  |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4330 |  |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 20350 | steel: blocked/cloudflare_challenge (answer) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15358 | steel: blocked/cloudflare_challenge (answer) |
| T070 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin, markdownMatches | 923 |  |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15179 | steel: blocked/cloudflare_challenge (answer) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3551 |  |
| T073 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider |  | 19150 | steel: failed/empty_unverified (answer) |
| T074 | cold | yes | success |  | 200 | http | http → browser_local → provider |  | 16249 | steel: blocked/cloudflare_challenge |
| T075 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3253 |  |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 17879 | steel: blocked/cloudflare_challenge (answer) |
| T077 | cold | yes | success |  | 200 | http | http |  | 1235 |  |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1534 |  |
| T079 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6204 |  |
| T080 | cold | yes | success |  | 200 | http | http |  | 2269 |  |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1275 |  |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15770 | steel: blocked/cloudflare_challenge (answer) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5692 |  |
| B003 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 17789 | steel: failed/empty_unverified (answer) |
| B004 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 27477 | steel: success (answer) |
| B005 | cold | yes | success |  | 200 | http | http |  | 4388 |  |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4717 |  |
| B007 | cold | yes | success |  | 200 | http | http |  | 3392 |  |
| B008 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 4150 |  |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 926 |  |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6447 |  |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3156 |  |
| B012 | cold | yes | success |  | 200 | http | http |  | 1440 |  |
| B013 | cold | yes | success |  | 200 | http | http |  | 838 |  |
| B014 | cold | yes | success |  | 200 | http | http |  | 989 |  |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (the narrowed heading-only rule)

**Set-up.**
- The same set-up as `2026-10-09-pa4-steel-all-loading-76a1c70.md`: the Steel grant (SHA-256 `b2e32cb817d763f758e5755d94a61932182f3bf1894c09df39fc65fab5da1259`), Steel's tariff and the proxied network.
- The server ran at `7c5dc6b`. Its rule judges only an article region, and only one whose headings hold fewer than 100 characters with fewer than 3 characters beside them.
- After this run, review found that a heading over images alone (a chart, a gallery) was also judged to have no content. The next commit counts an image beside the headings as content, when the Markdown carries it (a canvas, a video or an iframe leaves nothing in the Markdown, so it does not count). By the code, that can only keep pages as content. None of this run's changed answers involved such a page: see T073 and B003 below.

**Compared with the run at `76a1c70`, before any heading rule:**

| | Before | This run |
| --- | --- | --- |
| Verified, all 92 | 47 | 47 |
| Verified, frozen 50 | 12 | 12 |
| False successes | 16 | 13 |
| Ledger charge (at the ceiling) | $0.1000 | $0.1033, one task's charge unknown |
| p50 / p95 ms | 5271 / 23654 | 5502 / 27468 |

**False successes no longer:**
- **B003 (Tesla inventory):** `failed`/`empty_unverified`, with the page kept as evidence (22175 characters). It had answered `success` with a 43-character heading.
- **T031 and T033:** verified this time. Both vary between runs.
- **T023:** no status. The API did not answer before the runner's 180 s timeout, so its charge is unknown.

**New false success:** T043, a Steel page that varies between runs.

**Verified before, not here:**
- **T051:** `blocked` (`cloudflare_challenge`), as it was in earlier runs.
- **T073 (stubhub.com):** `failed`/`empty_unverified` through Steel, whereas it was verified before. It is not caused by the rule. After the run, StubHub's home page was saved from a Steel session (103649 characters of HTML) and extracted by three extractors:
  - `extract-tf/14`, before any rule;
  - this run's;
  - the media-aware one.

  All three found no main region (`escalate` true, empty main). The page StubHub serves differs between loads.
