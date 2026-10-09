# Access task set run: all, 2026-10-09

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T003,T004,T008,T013,T014,T017,T021,T023,T025,T030,T034,T038,T042,T043,T046,T047,T048,T050,T051,T053,T056,T057,T060,T064,T066,T068,T069,T071,T076,B001,B002,B004,B008 --access "enhanced" --record research/access/runs/2026-10-09-pa4-steel-gap-escalation-f160f02.md`
- Source commit: `f160f02`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8798; access option: `"enhanced"`
- Exit address: 103.142.140.156
- Run: 2026-10-09T06:08:59.517Z → 2026-10-09T06:19:13.767Z
- Tasks: 35 (set `all`, only T001, T002, T003, T004, T008, T013, T014, T017, T021, T023, T025, T030, T034, T038, T042, T043, T046, T047, T048, T050, T051, T053, T056, T057, T060, T064, T066, T068, T069, T071, T076, B001, B002, B004, B008); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 35 | 7 | 8 | 19863 | 32809 | unknown | unknown |

- Paid provider calls (cold): 23; tasks verified with a paid call's page as the answer: 5; charged by the spend ledger: $0.0767 (a provider that states no price is charged its price ceiling: an upper bound, not its bill)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 18632 | steel: blocked/bot_detected_generic (answer) |
| T002 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 17114 | steel: success (answer) |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 17024 | steel: success (answer) |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40256 |  |
| T008 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 6971 |  |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 11592 |  |
| T014 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 25829 | steel: success (answer) |
| T017 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 11915 |  |
| T021 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 27658 | steel: success (answer) |
| T023 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 22545 | steel: success (answer) |
| T025 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 26206 | steel: failed/empty_unverified (answer) |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 29498 | steel: success (answer) |
| T034 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 22005 | steel: blocked/bot_detected_generic (answer) |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 24526 | steel: blocked/bot_detected_generic (answer) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1561 |  |
| T043 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin | 32809 | steel: success (answer) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20667 | steel: blocked/bot_detected_generic (answer) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20977 | steel: blocked/cloudflare_challenge (answer) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 19434 | steel: blocked/cloudflare_challenge (answer) |
| T050 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 19863 | steel: success (answer) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5534 |  |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 18564 | steel: blocked/bot_detected_generic (answer) |
| T056 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 885 |  |
| T057 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 4498 |  |
| T060 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 2068 |  |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3863 |  |
| T066 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 2681 |  |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 24520 | steel: blocked/cloudflare_challenge (answer) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 21610 | steel: blocked/cloudflare_challenge (answer) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18747 | steel: blocked/cloudflare_challenge (answer) |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 21258 | steel: blocked/cloudflare_challenge (answer) |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20222 | steel: blocked/cloudflare_challenge (answer) |
| B002 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 22548 | steel: blocked/bot_detected_generic (answer) |
| B004 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 25049 | steel: success (answer) |
| B008 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 4083 |  |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (ROADMAP PA item 4, step 3: the Steel lane after the ladder steps past more failures)

**Setup.** The run used the same 35 tasks, the same grant and server set-up as `2026-10-09-pa4-steel-gap-5a01e8b.md` (grant SHA-256 `b2e32cb817d763f758e5755d94a61932182f3bf1894c09df39fc65fab5da1259`, Steel's Launch tariff, a ceiling of $0.00333 a call, `useProxy: false`, stealth on, no solving). It also used the same proxied network. The server ran at `f160f02`. In that build the ladder goes on to the next rung after a 403 or 405 answered without a gate it recognises, after a page a browser rendered with no main content it could verify, and after an http rung's refused connection (to the browser only).

**Against the run before the change**, at `5a01e8b`:

| | Before | After |
| --- | --- | --- |
| Verified | 3 | 7 |
| Verified with a paid call's page as the answer | 2 | 5 |
| Tasks that reached Steel | 16 | 23 |
| Paid calls | 16 | 23 |
| Ledger charge (at the ceiling) | $0.0533 | $0.0767 |
| False successes | 6 | 8 |
| p50 / p95 ms | 11522 / 20345 | 19863 / 32809 |

**Tasks the change moved:**
- T050 (403): it went on to Steel and was verified.
- T057 (403 on `http_compat`): it went on to the local browser and was verified, with no paid call.
- T030 (empty browser page): it went on to Steel and was verified.
- T021 (403) and T043 (405): they went on to Steel, whose pages were the real listing pages (an eBay category page and a Redfin city page). They failed `markdownCountMin`, so the items were not in the Markdown. That is an extraction gap, not access. They count as false successes.
- T025 and B002 (empty browser pages): Steel's page was empty too on T025, and blocked (`bot_detected_generic`) on B002.
- T004 (refused connection, robots.txt set aside): it went on to the local browser, which timed out. By design it did not go on to Steel.

**Changes that are run-to-run variation, not the rule:**
- B004: Steel's page was blocked before and verified now.
- T023: the local browser's answer did not stand this time. It went on to Steel, whose main content was a 96-byte promotion banner, a false success as before.
- T001: the block reason changed, from Cloudflare to bot detection.

**Unchanged by design.**
- These ended where they did before: T008 and T042 (429), and T013 (timeout).
- T056, T060 and T066 are http successes with failing data.
- T017 is a browser success with failing data.
- T064 is `login_wall` with robots.txt set aside.
- B008 is a block with robots.txt set aside.

**Cost.** Steel states no price per call, so every call is charged at its ceiling: an upper bound, not Steel's bill. Steel's own usage figures are not compared here.
