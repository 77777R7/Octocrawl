# Combined grant, window 1: installed_chrome and the Steel routes in one grant, on K1's 92 tasks, 2026-10-25

- Item: ROADMAP.md, PA bar, the first item to measure next (written by K5, #687): one grant holding `installed_chrome` together with the enhanced arm's routes, which K1 ran under separate grants. Asked for by Howard on 2026-10-25.
- Command: `node research/access/k1-window.mjs --window 1 --name combined --arms standard,installed_chrome,combined,firecrawl --ic-grant <K1 installed_chrome grant> --combined-grant <combined grant> --ports 8831,8832,8833 --firecrawl-cap 120`; report `node research/access/combinedReport.mjs .w2l/access/combined/2026-10-25-w1 --label 2026-10-25-combined-w1-22bf90e7`.
- Runner commit: `22bf90e7` (main `4dc53ac0` plus research files only; packages/ is main's). `npx tsc --build` ran before the APIs started; run-set's stale-build check (each arm record's Engine build line): up to date in 15 local runs.
- Working tree: run-set recorded uncommitted changes at the start of installed_chrome-first-b0, combined-first-b0. The one change was this report script, research/access/combinedReport.mjs, written untracked at 04:35:54Z while the window ran and moved out of the checkout at 04:41Z; no run executes it, and every later run started clean.
- Task set: research/access/tasks.v1.json, 92 tasks (set `all`; frozen 50); SHA-256 as each run recorded it: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`.
- Arms: standard (no grant, access standard); installed_chrome (the K1 grant `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`, installed_chrome); combined (`0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`, installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth; W2L_VENDORS=steel; run budget $1, $0.05 per request, Steel at $0.10 per browser hour, the same settings as the Steel grant `67acb9bc515429e9c1258253f2da648bea1738a41dbcd77c8455526b323cd239`; no vendor_residential_proxy, decision 1); Firecrawl Cloud (markdown, its own strongest route, maxAge 0, storeInCache false). Octocrawl arms with access enhanced except standard.
- Interleaving: 4 blocks of 23 in task-file order; in block b the three local arms one after another, order rotated by b; Firecrawl on the same block at the same time. Then one retry pass of each local arm's first-call failures, reported apart; Firecrawl's retry runs only within the window's 120-credit cap.
- Network: proxied (the shell's proxy; Clash on this Mac). HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local; each local arm's exit address is in its arm record. Firecrawl fetches from its own cloud (region not pinned).
- Machine: checked at 2026-10-25T04:33:57Z, before the window started (04:34:11Z); pmset -g batt: Now drawing from 'AC Power'; InternalBattery-0 100%; charged; ioreg -r -k AppleClamshellState: AppleClamshellState = No (lid open); AppleClamshellCausesSleep = No; npx tsc --build: run immediately before the driver started the APIs; the window ran under caffeinate -dims. Sleep check (pmset log after each block): block 0 none; block 1 none; block 2 none; block 3 none; the retry pass none.
- Window: 2026-10-25T04:34:18.947Z → 2026-10-25T05:28:36.200Z. Failures and caps: firecrawl not started for the retry pass: 112 credits spent in this window, +37.5 expected would pass the cap 120.
- Firecrawl account: before {"at":"2026-10-25T04:34:11.829Z","status":200,"remainingCredits":713,"planCredits":1000,"billingPeriodStart":"2026-10-22T17:13:36.213Z","billingPeriodEnd":"2026-11-22T17:13:36.213Z"}, after first calls {"at":"2026-10-25T05:12:51.034Z","status":200,"remainingCredits":601,"planCredits":1000,"billingPeriodStart":"2026-10-22T17:13:36.213Z","billingPeriodEnd":"2026-11-22T17:13:36.213Z"}, after {"at":"2026-10-25T05:28:36.200Z","status":200,"remainingCredits":601,"planCredits":1000,"billingPeriodStart":"2026-10-22T17:13:36.213Z","billingPeriodEnd":"2026-11-22T17:13:36.213Z"}.
- Firecrawl spend against the 120-credit cap: 83 by the credits each call reported (92 calls), 112 by the account's readings; within the cap.

## First calls, all 92 tasks (main metric)

| Arm | Planned | Attempted | Not run | Verified | False success | FS / delivered (N, 95% upper) | FS / all requests (N, 95% upper) | p50 verified | p95 verified | p50 all | p95 all |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| standard | 92 | 92 | 0 | 43 | 2 | 2/45, 13.3% | 2/92, 6.7% | 3731 | 15273 | 2989 | 15273 |
| installed_chrome | 92 | 92 | 0 | 66 | 2 | 2/68, 9.0% | 2/92, 6.7% | 6764 | 17933 | 6386 | 26880 |
| combined | 92 | 92 | 0 | 71 | 1 | 1/72, 6.4% | 1/92, 5.1% | 5736 | 28419 | 6994 | 45618 |
| firecrawl | 92 | 92 | 0 | 67 | 15 | 15/82, 26.8% | 15/92, 24.0% | 3426 | 10564 | 3232 | 10989 |

## First calls, the 50 frozen tasks (main metric)

| Arm | Planned | Attempted | Not run | Verified | False success | FS / delivered (N, 95% upper) | FS / all requests (N, 95% upper) | p50 verified | p95 verified | p50 all | p95 all |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| standard | 50 | 50 | 0 | 14 | 2 | 2/16, 34.4% | 2/50, 12.1% | 6700 | 20124 | 3116 | 17897 |
| installed_chrome | 50 | 50 | 0 | 30 | 2 | 2/32, 18.4% | 2/50, 12.1% | 8623 | 23114 | 7961 | 27015 |
| combined | 50 | 50 | 0 | 34 | 1 | 1/35, 12.9% | 1/50, 9.1% | 9465 | 32636 | 9674 | 53612 |
| firecrawl | 50 | 50 | 0 | 33 | 9 | 9/42, 34.4% | 9/50, 29.3% | 3522 | 11286 | 3232 | 11160 |

Not run counts as not verified. Latency in wall ms.

## Cost (first calls, all 92)

| Arm | Cost | Cost per 1,000 verified |
| --- | --- | --- |
| standard | $0 (no grant: no paid route) | $0.00 |
| installed_chrome | $0.0000 ledger | $0.00 |
| combined | $0.0384 ledger | $0.54 |
| firecrawl | 112 credits (Free plan: not priced in USD) | 1672 credits |

Cost per 1,000 verified divides the first calls' whole cost (failures included) by first-call verified tasks.

## Marginal gain (first calls)

| Arm | Against | Set | Gains | Regressions | Net |
| --- | --- | --- | --- | --- | --- |
| installed_chrome | standard | 92 | 25 (T001, T002, T003, T005, T011, T019, T020, T021, T023, T025, T038, T039, T047, T049, T052, T053, T057, T059, T070, T071, T073, T076, B001, B004, B008) | 2 (T008, T037) | 23 |
| installed_chrome | standard | frozen 50 | 17 (T001, T002, T003, T005, T011, T019, T021, T023, T025, T038, T047, T049, T053, T057, T070, T071, T076) | 1 (T037) | 16 |
| combined | standard | 92 | 30 (T001, T002, T003, T005, T007, T011, T014, T018, T019, T020, T021, T023, T025, T038, T039, T047, T049, T050, T051, T052, T053, T057, T059, T070, T071, T073, T076, B001, B004, B008) | 2 (T037, T062) | 28 |
| combined | standard | frozen 50 | 21 (T001, T002, T003, T005, T007, T011, T014, T018, T019, T021, T023, T025, T038, T047, T049, T050, T053, T057, T070, T071, T076) | 1 (T037) | 20 |
| combined | installed_chrome | 92 | 6 (T007, T008, T014, T018, T050, T051) | 1 (T062) | 5 |
| combined | installed_chrome | frozen 50 | 4 (T007, T014, T018, T050) | 0 | 4 |

## Which rung delivered each combined-arm success (first calls)

| Delivering route (access.route/executor) | Verified tasks |
| --- | --- |
| installed_chrome/chrome | 25 (T001, T002, T003, T005, T011, T019, T020, T021, T023, T025, T038, T039, T047, T049, T051, T052, T053, T055, T070, T071, T073, T076, B001, B004, B008) |
| http/undici | 23 (T008, T015, T022, T024, T033, T035, T040, T041, T044, T058, T061, T063, T065, T072, T074, T077, T079, T080, B005, B007, B012, B013, B014) |
| browser/playwright | 16 (T006, T016, T017, T026, T034, T036, T056, T059, T060, T066, T067, T075, B002, B006, B010, B011) |
| http_compat/impit | 5 (T007, T009, T018, T029, T057) |
| vendor/steel | 2 (T014, T050) |

- Combined-arm answers that list a Steel paid call: 13 (T010, T012, T014, T030, T031, T043, T045, T046, T048, T050, T068, T069, B003); of those, verified with Steel as the answer: 2 (T014, T050).
- Combined-arm gains over installed_chrome, by delivering route: T007 http_compat/impit; T008 http/undici; T014 vendor/steel; T018 http_compat/impit; T050 vendor/steel; T051 installed_chrome/chrome.

## Gap to Firecrawl (first calls, same window)

| Arm | All 92 | Gap | Frozen 50 | Gap |
| --- | --- | --- | --- | --- |
| standard | 43 vs 67 | 24 | 14 vs 33 | 19 |
| installed_chrome | 66 vs 67 | 1 | 30 vs 33 | 3 |
| combined | 71 vs 67 | -4 | 34 vs 33 | -1 |

## Retry pass (apart from the first calls)

| Arm | Retried | Verified on retry | False success on retry | Verified after retry | Retry cost |
| --- | --- | --- | --- | --- | --- |
| standard | 49 | 5 | 2 | 48 | $0 (no grant: no paid route) |
| installed_chrome | 26 | 3 | 2 | 69 | $0.0000 ledger |
| combined | 21 | 3 | 2 | 74 | $0.0282 ledger |
| firecrawl | 0 | 0 | 0 | 67 | - |

## Per task (first calls)

yes = verified; FALSE = false success; no (reason) otherwise. Route: the combined arm's access.route/executor.

| Task | Part | standard | installed_chrome | combined | firecrawl | Combined route |
| --- | --- | --- | --- | --- | --- | --- |
| T001 | frozen | no (cloudflare_challenge) | yes | yes | yes | installed_chrome/chrome |
| T002 | frozen | no (cloudflare_challenge) | yes | yes | yes | installed_chrome/chrome |
| T003 | frozen | no (cloudflare_challenge) | yes | yes | yes | installed_chrome/chrome |
| T004 | frozen | no (geo_restricted) | no (connection_error) | no (connection_error) | no (Service Unavailable) | installed_chrome/chrome |
| T005 | frozen | no (bot_detected_generic) | yes | yes | FALSE | installed_chrome/chrome |
| T006 | frozen | yes | yes | yes | yes | browser/playwright |
| T007 | frozen | no (rate_limit) | no (rate_limit) | yes | yes | http_compat/impit |
| T008 | unstable | yes | no (rate_limit) | yes | yes | http/undici |
| T009 | frozen | yes | yes | yes | yes | http_compat/impit |
| T010 | frozen | FALSE | FALSE | FALSE | FALSE | browser/playwright |
| T011 | frozen | no (empty_unverified) | yes | yes | no (We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales) | installed_chrome/chrome |
| T012 | frozen | no (empty_unverified) | FALSE | no (empty_unverified) | FALSE | vendor/steel |
| T013 | frozen | no (geo_restricted) | no (geo_restricted) | no (geo_restricted) | yes | browser/playwright |
| T014 | frozen | no (bot_detected_generic) | no (bot_detected_generic) | yes | FALSE | vendor/steel |
| T015 | healthy | yes | yes | yes | FALSE | http/undici |
| T016 | healthy | yes | yes | yes | yes | browser/playwright |
| T017 | frozen | yes | yes | yes | yes | browser/playwright |
| T018 | frozen | no (captcha) | no (captcha) | yes | yes | http_compat/impit |
| T019 | frozen | FALSE | yes | yes | FALSE | installed_chrome/chrome |
| T020 | healthy | no (cloudflare_challenge) | yes | yes | yes | installed_chrome/chrome |
| T021 | frozen | no (http_error) | yes | yes | yes | installed_chrome/chrome |
| T022 | frozen | yes | yes | yes | FALSE | http/undici |
| T023 | frozen | no (bot_detected_generic) | yes | yes | yes | installed_chrome/chrome |
| T024 | healthy | yes | yes | yes | yes | http/undici |
| T025 | frozen | no (bot_detected_generic) | yes | yes | yes | installed_chrome/chrome |
| T026 | frozen | yes | yes | yes | FALSE | browser/playwright |
| T027 | healthy | no (http_error) | no (http_error) | no (http_error) | yes | http/undici |
| T029 | frozen | yes | yes | yes | yes | http_compat/impit |
| T030 | frozen | no (login_wall) | no (login_wall) | no (empty_unverified) | yes | installed_chrome/chrome |
| T031 | unstable | no (captcha) | no (captcha) | no (provider_error) | yes | vendor/steel |
| T033 | healthy | yes | yes | yes | yes | http/undici |
| T034 | frozen | yes | yes | yes | yes | browser/playwright |
| T035 | healthy | yes | yes | yes | yes | http/undici |
| T036 | healthy | yes | yes | yes | yes | browser/playwright |
| T037 | frozen | yes | no (rate_limit) | no (rate_limit) | FALSE | http/undici |
| T038 | frozen | no (bot_detected_generic) | yes | yes | yes | installed_chrome/chrome |
| T039 | healthy | no (captcha) | yes | yes | yes | installed_chrome/chrome |
| T040 | healthy | yes | yes | yes | yes | http/undici |
| T041 | healthy | yes | yes | yes | yes | http/undici |
| T042 | frozen | no (rate_limit) | no (rate_limit) | no (rate_limit) | yes | http/undici |
| T043 | frozen | no (bot_detected_generic) | no (bot_detected_generic) | no (http_error) | yes | http/undici |
| T044 | healthy | yes | yes | yes | yes | http/undici |
| T045 | frozen | no (captcha) | no (captcha) | no (captcha) | no (All scraping engines failed to retrieve content from this URL. Engines tried: [fire-engine;chrome-cdp;stealth, fire-engine(retry);chrome-cdp;stealth, pdf, document, image]. This usually happens when: (1) The URL is invalid or the page doesn't exist (404), (2) The website is blocking automated access, (3) The website is down or unreachable, (4) The page requires authentication. Double check the URL is correct and accessible in a browser. If the issue persists, contact us at help@firecrawl.com with your request ID for investigation.) | vendor/steel |
| T046 | frozen | no (captcha) | no (captcha) | no (provider_error) | yes | vendor/steel |
| T047 | frozen | no (cloudflare_challenge) | yes | yes | yes | installed_chrome/chrome |
| T048 | frozen | no (cloudflare_challenge) | no (cloudflare_challenge) | no (provider_error) | yes | vendor/steel |
| T049 | frozen | no (bot_detected_generic) | yes | yes | no (We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales) | installed_chrome/chrome |
| T050 | frozen | no (http_error) | no (http_error) | yes | yes | vendor/steel |
| T051 | healthy | no (cloudflare_challenge) | no (cloudflare_challenge) | yes | yes | installed_chrome/chrome |
| T052 | healthy | no (cloudflare_challenge) | yes | yes | FALSE | installed_chrome/chrome |
| T053 | frozen | no (bot_detected_generic) | yes | yes | yes | installed_chrome/chrome |
| T055 | frozen | yes | yes | yes | FALSE | installed_chrome/chrome |
| T056 | frozen | yes | yes | yes | yes | browser/playwright |
| T057 | frozen | no (http_error) | yes | yes | yes | http_compat/impit |
| T058 | healthy | yes | yes | yes | FALSE | http/undici |
| T059 | healthy | no (captcha) | yes | yes | yes | browser/playwright |
| T060 | frozen | yes | yes | yes | yes | browser/playwright |
| T061 | healthy | yes | yes | yes | yes | http/undici |
| T062 | healthy | yes | yes | no (timeout) | yes | browser/playwright |
| T063 | healthy | yes | yes | yes | yes | http/undici |
| T064 | frozen | no (login_wall) | no (login_wall) | no (login_wall) | yes | installed_chrome/chrome |
| T065 | frozen | yes | yes | yes | yes | http/undici |
| T066 | frozen | yes | yes | yes | yes | browser/playwright |
| T067 | healthy | yes | yes | yes | yes | browser/playwright |
| T068 | frozen | no (cloudflare_challenge) | no (bot_detected_generic) | no (provider_error) | yes | vendor/steel |
| T069 | frozen | no (cloudflare_challenge) | no (cloudflare_challenge) | no (cloudflare_challenge) | yes | vendor/steel |
| T070 | frozen | no (bot_detected_generic) | yes | yes | no (We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales) | installed_chrome/chrome |
| T071 | frozen | no (cloudflare_challenge) | yes | yes | yes | installed_chrome/chrome |
| T072 | healthy | yes | yes | yes | yes | http/undici |
| T073 | unstable | no (bot_detected_generic) | yes | yes | FALSE | installed_chrome/chrome |
| T074 | healthy | yes | yes | yes | yes | http/undici |
| T075 | frozen | yes | yes | yes | no (We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales) | browser/playwright |
| T076 | frozen | no (cloudflare_challenge) | yes | yes | yes | installed_chrome/chrome |
| T077 | healthy | yes | yes | yes | yes | http/undici |
| T078 | frozen | no (rate_limit) | no (rate_limit) | no (rate_limit) | no (We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales) | http/undici |
| T079 | healthy | yes | yes | yes | FALSE | http/undici |
| T080 | healthy | yes | yes | yes | no (Enrichment is not enabled for company profiles on this team. An organization admin can choose enrichment providers at https://www.firecrawl.dev/app/alexandria?enrichment=true) | http/undici |
| T081 | frozen | no (http_error) | no (http_error) | no (http_error) | no (We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales) | http/undici |
| B001 | blind | no (cloudflare_challenge) | yes | yes | yes | installed_chrome/chrome |
| B002 | blind | yes | yes | yes | yes | browser/playwright |
| B003 | blind | no (bot_detected_generic) | no (empty_unverified) | no (bot_detected_generic) | FALSE | vendor/steel |
| B004 | blind | no (bot_detected_generic) | yes | yes | yes | installed_chrome/chrome |
| B005 | blind | yes | yes | yes | yes | http/undici |
| B006 | blind | yes | yes | yes | yes | browser/playwright |
| B007 | blind | yes | yes | yes | yes | http/undici |
| B008 | blind | no (bot_detected_generic) | yes | yes | yes | installed_chrome/chrome |
| B009 | blind | no (http_error) | no (http_error) | no (http_error) | no (We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales) | http/undici |
| B010 | blind | yes | yes | yes | yes | browser/playwright |
| B011 | blind | yes | yes | yes | yes | browser/playwright |
| B012 | blind | yes | yes | yes | yes | http/undici |
| B013 | blind | yes | yes | yes | yes | http/undici |
| B014 | blind | yes | yes | yes | yes | http/undici |

Each arm's own records (run-set.mjs, per block and retry) are in `2026-10-25-combined-w1-22bf90e7-<arm>.md` beside this file; raw runs under `.w2l/access/combined/2026-10-25-w1` and .w2l/access/runs/ (git-ignored).
