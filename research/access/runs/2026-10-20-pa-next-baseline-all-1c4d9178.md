# Access task set run: all, 2026-10-19

- Command: `node research/access/run-set.mjs --set all --access "enhanced" --save-responses --record research/access/runs/2026-10-20-pa-next-baseline-all-1c4d9178.md`
- Source commit: `1c4d9178`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8796; access option: `"enhanced"`
- Exit address: not recorded
- Grant: SHA-256 `67acb9bc515429e9c1258253f2da648bea1738a41dbcd77c8455526b323cd239`; capabilities: compatible_transport, vendor_remote_browser, vendor_stealth (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-19T17:07:00.737Z → 2026-10-19T17:22:41.476Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 92, attempted 92, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 58 | 2 | 6251 | 31203 | unknown | unknown |

- Paid provider calls (cold): 31; tasks verified with a paid call's page as the answer: 8; charged by the spend ledger: $0.0251 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 58, not_loaded 2, not_extracted 0, not_served 32, unknown 0; region waits: 40 (held on 33; scrolled on 5, held on 3 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): robots_override on T049 (provider, steel), T064 (provider, steel), B008 (provider, steel)

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 87 (time left at its start: median 300000 ms, least 299998 ms); browser_local on 61 (time left at its start: median 298944 ms, least 30000 ms); provider on 31 (time left at its start: median 297243 ms, least 281215 ms); http_compat on 5 (time left at its start: median 300000 ms, least 299999 ms)
- Verified answers by the route that delivered them (cold): vendor 8, browser 26, http_compat 4, http 20
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 12 (T004: unreachable, timeout, set aside; T041: rule /homes/, set aside; T042: unreachable, timeout, set aside; T049: rule /, set aside; T059: rule /, set aside; T064: rule /, set aside; T066: rule /, set aside; T075: rule /, set aside; T079: rule /, set aside; T080: rule /, set aside; T081: rule /, set aside; B008: rule /, set aside); not known on 2 attempts without a robots check

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 18837 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T002 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 15775 | steel: success (answer) | ready (verified); region held in 1179 ms |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 16732 | steel: success (answer) | ready (verified); region held in 1193 ms |
| T004 | cold | no | blocked | geo_restricted | 451 | browser_local | http → browser_local → provider | markdownMatches, markdownCountMin | 29012 | steel: failed/policy_denied | not_served (geo_restricted) |
| T005 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 20429 | steel: success (answer) | ready (verified); region held in 3406 ms, 1 screen scrolled |
| T006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7708 |  | ready (verified); region held in 3028 ms |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 2014 |  | ready (verified) |
| T008 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 593 |  | not_served (rate_limit) |
| T009 | cold | yes | success |  | 200 | http | http_compat |  | 1265 |  | ready (verified) |
| T010 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → provider | minTables | 42808 | steel: success | not_served (checks_failed, region_absent); region not held in 9897 ms |
| T011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6251 |  | ready (verified); region held in 1634 ms |
| T012 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 36943 | steel: failed/empty_unverified (answer) | not_served (source_data_error); region not held in 9707 ms, 1 screen scrolled |
| T013 | cold | no | blocked | geo_restricted | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 12701 |  | not_served (geo_restricted) |
| T014 | cold | no | failed | http_error | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19218 | steel: failed/http_error (answer) | not_served (http_error) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1841 |  | ready (verified) |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8939 |  | ready (verified); region held in 1041 ms |
| T017 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7431 |  | ready (verified); region held in 734 ms |
| T018 | cold | yes | success |  | 200 | http | http_compat |  | 3931 |  | ready (verified) |
| T019 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14055 |  | ready (verified); region held in 8989 ms, 9 screens scrolled |
| T020 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 9282 |  | ready (verified); region held in 949 ms |
| T021 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 20334 | steel: success (answer) | ready (verified); region held in 2439 ms |
| T022 | cold | yes | success |  | 200 | http | http |  | 2240 |  | ready (verified) |
| T023 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 19073 | steel: success (answer) | ready (verified); region held in 1831 ms |
| T024 | cold | yes | success |  | 200 | http | http |  | 2749 |  | ready (verified) |
| T025 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 30972 | steel: failed/empty_unverified (answer) | not_loaded (empty_unverified, little_text); region not held in 9961 ms |
| T026 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 10818 |  | ready (verified); region held in 646 ms |
| T027 | cold | no | failed | http_error | 400 | http | http | markdownCountMin, markdownMatches | 2387 |  | not_served (http_error) |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 2990 |  | ready (verified) |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 32483 | steel: success (answer) | ready (verified); region held in 1597 ms |
| T031 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → provider | markdownCountMin | 35378 | steel: failed/empty_unverified | not_served (checks_failed, region_absent); region not held in 9462 ms, 1 screen scrolled |
| T033 | cold | yes | success |  | 200 | http | http |  | 1602 |  | ready (verified) |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5960 |  | ready (verified); region held in 770 ms |
| T035 | cold | yes | success |  | 200 | http | http |  | 2102 |  | ready (verified) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5166 |  | ready (verified); region held in 644 ms |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 815 |  | not_served (rate_limit) |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 14711 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4903 |  | ready (verified); region held in 674 ms |
| T040 | cold | yes | success |  | 200 | http | http |  | 1733 |  | ready (verified) |
| T041 | cold | yes | success |  | 200 | http | http |  | 1576 |  | ready (verified) |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 5997 |  | not_served (rate_limit) |
| T043 | cold | no | blocked | bot_detected_generic | 405 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17774 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T044 | cold | yes | success |  | 200 | http | http |  | 3252 |  | ready (verified) |
| T045 | cold | no | blocked | captcha | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23176 | steel: blocked/captcha (answer) | not_served (captcha) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 12651 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15821 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 12362 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local; passed over: provider (steel, robots_override) | markdownCountMin, markdownMatches | 2454 |  | not_served (bot_detected_generic) |
| T050 | cold | no | failed | http_error | 403 | browser_local | http → browser_local → provider | markdownMatches, markdownMatches | 13056 | steel: failed/provider_error | not_served (http_error) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5706 |  | ready (verified); region held in 711 ms |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | minTables, markdownMatches | 24504 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 15967 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T055 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 14219 |  | ready (verified); region held in 2560 ms |
| T056 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4162 |  | ready (verified); region held in 704 ms |
| T057 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 4530 |  | ready (verified); region held in 672 ms |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4414 |  | ready (verified); region held in 1296 ms |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4156 |  | ready (verified); region held in 656 ms |
| T060 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 15771 |  | ready (verified); region not held in 9995 ms |
| T061 | cold | yes | success |  | 200 | http | http |  | 2941 |  | ready (verified) |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5818 |  | ready (verified); region held in 901 ms |
| T063 | cold | yes | success |  | 200 | http | http |  | 1084 |  | ready (verified) |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local; passed over: provider (steel, robots_override) | markdownMatches, markdownCountMin | 1941 |  | not_served (login_wall) |
| T065 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 24615 | steel: success (answer) | ready (verified); region held in 1965 ms |
| T066 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6840 |  | ready (verified); region held in 1272 ms |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4295 |  | ready (verified); region held in 606 ms |
| T068 | cold | no | failed | provider_error |  | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 13122 | steel: failed/provider_error (answer) | not_served (provider_error) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15423 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T070 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8225 |  | ready (verified); region held in 809 ms |
| T071 | cold | no | failed | provider_error |  | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 12640 | steel: failed/provider_error (answer) | not_served (provider_error) |
| T072 | cold | yes | success |  | 200 | http | http |  | 3662 |  | ready (verified) |
| T073 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin, markdownMatches | 15714 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T074 | cold | yes | success |  | 200 | http | http |  | 735 |  | ready (verified) |
| T075 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5456 |  | ready (verified); region held in 1274 ms |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 15065 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T077 | cold | yes | success |  | 200 | http | http |  | 995 |  | ready (verified) |
| T078 | cold | no | blocked | rate_limit | 429 | http | http | markdownMatches, markdownMatches | 1514 |  | not_served (rate_limit) |
| T079 | cold | yes | success |  | 200 | http | http |  | 2671 |  | ready (verified) |
| T080 | cold | yes | success |  | 200 | http | http |  | 2290 |  | ready (verified) |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1178 |  | not_served (http_error) |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15895 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6449 |  | ready (verified); region held in 849 ms |
| B003 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin | 31203 | steel: failed/empty_unverified (answer) | not_loaded (empty_unverified, little_text); region not held in 9137 ms |
| B004 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 19368 | steel: success (answer) | ready (verified); region held in 1575 ms |
| B005 | cold | yes | success |  | 200 | http | http |  | 4409 |  | ready (verified) |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6130 |  | ready (verified); region held in 655 ms |
| B007 | cold | yes | success |  | 200 | http | http |  | 3776 |  | ready (verified) |
| B008 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local; passed over: provider (steel, robots_override) | markdownMatches, markdownCountMin | 13770 |  | not_served (bot_detected_generic); region not held in 9776 ms |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 1130 |  | not_served (http_error) |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8449 |  | ready (verified); region held in 2306 ms, 2 screens scrolled |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5038 |  | ready (verified); region held in 570 ms |
| B012 | cold | yes | success |  | 200 | http | http |  | 1213 |  | ready (verified) |
| B013 | cold | yes | success |  | 200 | http | http |  | 2442 |  | ready (verified) |
| B014 | cold | yes | success |  | 200 | http | http |  | 1364 |  | ready (verified) |
- Task contract (cold): the product's verification agreed with the runner on 92 of 92 attempts that carry one (58 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## The 25 healthy tasks (cut from this run, not run separately)

The `healthy` part of `tasks.v1.json` (25 tasks) is included in the 92 above; this section lists its rows from the same run, as P0.1 asks (`docs/pa-enhancement-tasks.md`). Result: 23 verified, 2 not (T027 failed, T052 blocked); no false success among them.

| Task | Verified | Status | Reason | HTTP | Lane | Wall ms |
| --- | --- | --- | --- | --- | --- | --- |
| T015 | yes | success |  | 200 | http | 1841 |
| T016 | yes | success |  | 200 | browser_local | 8939 |
| T020 | yes | success |  | 200 | browser_local | 9282 |
| T024 | yes | success |  | 200 | http | 2749 |
| T027 | no | failed | http_error | 400 | http | 2387 |
| T033 | yes | success |  | 200 | http | 1602 |
| T035 | yes | success |  | 200 | http | 2102 |
| T036 | yes | success |  | 200 | browser_local | 5166 |
| T039 | yes | success |  | 200 | browser_local | 4903 |
| T040 | yes | success |  | 200 | http | 1733 |
| T041 | yes | success |  | 200 | http | 1576 |
| T044 | yes | success |  | 200 | http | 3252 |
| T051 | yes | success |  | 200 | browser_local | 5706 |
| T052 | no | blocked | cloudflare_challenge | 403 | provider | 24504 |
| T058 | yes | success |  | 200 | browser_local | 4414 |
| T059 | yes | success |  | 200 | browser_local | 4156 |
| T061 | yes | success |  | 200 | http | 2941 |
| T062 | yes | success |  | 200 | browser_local | 5818 |
| T063 | yes | success |  | 200 | http | 1084 |
| T067 | yes | success |  | 200 | browser_local | 4295 |
| T072 | yes | success |  | 200 | http | 3662 |
| T074 | yes | success |  | 200 | http | 735 |
| T077 | yes | success |  | 200 | http | 995 |
| T079 | yes | success |  | 200 | http | 2671 |
| T080 | yes | success |  | 200 | http | 2290 |

## Notes for P0.1

- **Server.** `W2L_VENDORS=steel W2L_ACCESS_GRANT=.w2l/access/steel-grant.json npm run api -- --port 8796` at `1c4d9178` (the worktree's copy of the main checkout's `.w2l/access/steel-grant.json`, same SHA-256 as the Grant line; it does not name `vendor_residential_proxy`), with `STEEL_API_KEY` from the git-ignored `.w2l/access/competitors.env`, proxied through Clash as in the Network line. The API was stopped after the run.
- **Cost.** $0.0251 charged by the spend ledger for 31 paid Steel calls (the grant's tariff on measured session time, not Steel's bill). Clash exit bandwidth: unknown (not metered).
- **T060** (ROADMAP item 4: a false success in every arm of the 2026-10-11/12 runs) is verified in this run, on `browser_local`, so it is not a false success here. Why it changed between the runs: unknown (the page, the ladder and the main commit all differ from 2026-10-12; nothing in this run isolates the cause).
- **False successes** this run: T010 (`minTables`) and T031 (`markdownCountMin`), both on `browser_local` after a Steel call that did not become the answer.
- **Raw run.** `.w2l/access/runs/2026-10-19T17-07-00-737Z/` of the worktree (git-ignored), with `--save-responses`.
- This record is the "before" value for the contract verification of Phase 2/4 only; it says nothing about field correctness (see R1b).
