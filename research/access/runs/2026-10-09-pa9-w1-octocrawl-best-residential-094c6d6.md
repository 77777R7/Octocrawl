# Access task set run: all, 2026-10-09

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T008,T013,T014,T017,T021,T023,T025,T030,T034,T038,T042,T043,T046,T047,T048,T050,T051,T053,T056,T057,T060,T064,T066,T068,T069,T071,T076,B001,B002,B004,B008 --record research/access/runs/2026-10-09-pa9-w1-octocrawl-best-residential-094c6d6.md`
- Source commit: `094c6d6`
- Network: direct
- Target: the local Octocrawl API
- API: http://127.0.0.1:8798; access option: none
- Exit address: not recorded
- Run: 2026-10-09T03:25:23.624Z → 2026-10-09T03:32:42.257Z
- Tasks: 35 (set `all`, only T001, T002, T003, T004, T008, T013, T014, T017, T021, T023, T025, T030, T034, T038, T042, T043, T046, T047, T048, T050, T051, T053, T056, T057, T060, T064, T066, T068, T069, T071, T076, B001, B002, B004, B008); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 35 | 8 | 5 | 11839 | 24611 | 0 | unknown |

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 14117 |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 25784 |
| T003 | cold | yes | success |  | 200 | http | http |  | 6958 |
| T004 | cold | yes | success |  | 200 | http | http |  | 7512 |
| T008 | cold | yes | success |  | 200 | http | http |  | 7857 |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 16210 |
| T014 | cold | no | failed | http_error | 403 | http | http | markdownCountMin, markdownMatches | 4386 |
| T017 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 21775 |
| T021 | cold | no | failed | http_error | 403 | http | http | markdownCountMin, markdownMatches | 5539 |
| T023 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin | 15546 |
| T025 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13839 |
| T030 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 24611 |
| T034 | cold | no | blocked | bot_detected_generic | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 20460 |
| T038 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 13435 |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 4483 |
| T043 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 10026 |
| T046 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 11839 |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 11348 |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownMatches, markdownMatches | 10743 |
| T050 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownMatches, markdownMatches | 12745 |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 13436 |
| T053 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches | 11869 |
| T056 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 5225 |
| T057 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 21898 |
| T060 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 7519 |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 15974 |
| T066 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 6489 |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 15071 |
| T069 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 15841 |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 11797 |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin | 9584 |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 10697 |
| B002 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 11637 |
| B004 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 10015 |
| B008 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 12341 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes

- What this run changes against the best arm of the baseline (`2026-10-09-pa9-w1-octocrawl-best-3cde6e8.md`): the exit alone. The same API configuration (`compatible_transport` on its five default hosts), plus `egress_sessions` with `W2L_EGRESS_PROXIES` set to one rotating residential gateway (Webshare, United States, `p.webshare.io:80`, a new household IP per connection; three checks before the run gave Comcast, Buckeye Cablevision and BAM Broadband, none flagged as hosting) and `W2L_EGRESS_ECHO_URL=http://ip-api.com/json/?fields=query,countryCode`. The API ran with no proxy variable, so every page left through the gateway; the "Network: direct" line above is the driver's own environment, not the pages' route.
- The tasks: the 35 that Firecrawl verified and the best arm did not, in that baseline.
- Result: 8 of the 35 verified (6 of them frozen), so on the frozen set the best route would reach 12 of 50 with a residential exit, against Firecrawl's 35. Of the 27 still not verified: `blocked` 16 (`bot_detected_generic` 8, `cloudflare_challenge` 6, `rate_limit` 1, `login_wall` 1), `success` with a failing predicate 5, `failed` 6 (`empty_unverified` 3, `http_error` 2, `timeout` 1).
- Reading: the exit explains part of the gap; most of what remains is blocked with a clean residential IP (the browser's fingerprint or a challenge Octocrawl does not solve, not isolated here) or read wrong.
