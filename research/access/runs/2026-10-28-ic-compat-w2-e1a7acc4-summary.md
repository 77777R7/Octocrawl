# installed_chrome with compatible_transport and no Steel, window 2: against installed_chrome alone and the combined grant, on K1's 92 tasks, 2026-10-28

- Item: ROADMAP.md, current phase (decision 17 in docs/pa-enhancement-tasks.md), stage L item 1: the candidate local default, `installed_chrome` with `compatible_transport` (http_compat/impit) and no Steel, which no earlier run measured; the combined grant of #716 is the reference arm. Exit: in both windows ic_compat verifies at least the combined arm's count minus 2, with no more false successes.
- Command: `node research/access/k1-window.mjs --window 2 --name ic-compat --arms installed_chrome,combined,ic_compat --ic-grant <K1 installed_chrome grant> --ic-compat-grant <ic_compat grant> --combined-grant <combined grant> --ports 8851,8852,8853 --steel-cap 1 --steel-probe`; report `node research/access/combinedReport.mjs .w2l/access/ic-compat/2026-10-28-w2 --label 2026-10-28-ic-compat-w2-e1a7acc4`.
- Runner commit: `e1a7acc4` (main `be55357b` plus research files only; packages/ is main's apart from tests (packages/runtime/test/combinedArms.test.ts)). `npx tsc --build` ran before the APIs started; run-set's stale-build check (each arm record's Engine build line): up to date in 15 local runs.
- Working tree: clean at every run's start.
- Task set: research/access/tasks.v1.json, 92 tasks (set `all`; frozen 50); SHA-256 as each run recorded it: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`.
- Arms: installed_chrome (the K1 grant `e3ec29ef05fd95b98be142e9d19a84be662ff501000fe595de7613259a910563`, installed_chrome); ic_compat (`bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`, installed_chrome, compatible_transport; the K1 grant's tier, budget, scope and tariffs by the engine's parser, checked by the driver; no W2L_VENDORS and no Steel key, so no route that spends money); combined (`0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`, installed_chrome, compatible_transport, vendor_remote_browser, vendor_stealth; W2L_VENDORS=steel; the Steel grant `67acb9bc515429e9c1258253f2da648bea1738a41dbcd77c8455526b323cd239`'s tier, budget, scope and tariffs by the engine's parser; no vendor_residential_proxy, decision 1). Every arm with access enhanced. No standard arm and no Firecrawl; Firecrawl's reference is #716's (below).
- Interleaving: 4 blocks of 23 in task-file order; in block b the 3 arms one after another, the list installed_chrome, combined, ic_compat rotated by b. Then one retry pass of each arm's first-call failures, reported apart.
- Network: proxied (the shell's proxy; Clash on this Mac). HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local; each local arm's exit address is in its arm record.
- Machine: Prechecks at 2026-10-28T00:00:24Z, before window 2 (ic-compat-no-steel session); window 2 restarted at 00:02:13Z after a first start (arm list combined,ic_compat,installed_chrome) was stopped about 50 s after launch because it ran combined before ic_compat in block 2 in both windows; that start is set aside in .w2l/access/ic-compat/2026-10-28-w2-stopped and in no report:; - Power: AC Power, battery 100%; charged (pmset -g batt).; - Lid: open (AppleClamshellState = No).; - Other measurements: none running (no captcha-window/k1-window/run-set/weekly/run-sites node process).; - Lock: ~/Code/w2l/.w2l/measure.lock taken 2026-10-28T00:00:08Z by this session.; - Ports 8851-8853 free. Build: npx tsc --build clean at e1a7acc4 (the same runner as window 1).; - Network: proxied through Clash (HTTPS_PROXY=http://127.0.0.1:7890).. Sleep check (pmset log after each block): block 0 none; block 1 none; block 2 none; block 3 none; the retry pass none.
- Window: 2026-10-28T00:02:13.400Z → 2026-10-28T00:57:57.798Z. Failures and caps: none. Steel cap: $1 by the ledger over the window, a page at most $0.0033 (the tariff's ceiling).
- Steel's API at the window's start: `GET /v1/sessions?limit=1` (read-only, through the shell's proxy) answered 200 in 1522 ms at 2026-10-28T00:02:05.860Z.

## First start of this window, stopped and not counted

- Launched 2026-10-28T00:00:24Z at runner `e1a7acc4`, the same commands and grants as this window, with the arm list combined, ic_compat, installed_chrome; block orders b0 combined → ic_compat → installed_chrome, b1 ic_compat → installed_chrome → combined, b2 installed_chrome → combined → ic_compat, b3 combined → ic_compat → installed_chrome. Its Steel probe answered 200 in 2121 ms at 00:00:30.807Z.
- Why it was stopped: in block 2 (T049–T072) it ran combined before ic_compat, as window 1 did, so the order of that pair did not flip against window 1; window 1's three combined-over-ic_compat tasks (T052, T053, T059) are all in block 2.
- It was stopped at about 00:01:14Z, about 50 s after launch (the decision was taken when its process had run 35 s; its run directory's last write was 00:01:13Z). It had made 4 attempts, all combined in block 0 (T001 and T002 verified, T003 http_error, T004 connection_error), with no Steel charge.
- None of its results are counted in this record or in the two-window record. Its raw output is kept under `.w2l/access/ic-compat/2026-10-28-w2-stopped/` and `.w2l/access/runs/2026-10-28T00-00-39-041Z/` (git-ignored).
- This window then ran from 00:02:13Z (its Steel probe at 00:02:05.860Z) with the arm list installed_chrome, combined, ic_compat, which puts ic_compat and combined in the opposite order to window 1 in all four blocks; installed_chrome's order against either other arm is opposite to window 1's in block 2 only.

## First calls, all 92 tasks (main metric)

| Arm | Planned | Attempted | Not run | Verified | False success | FS / delivered (N, 95% upper) | FS / all requests (N, 95% upper) | p50 verified | p95 verified | p50 all | p95 all |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| installed_chrome | 92 | 92 | 0 | 69 | 2 | 2/71, 8.6% | 2/92, 6.7% | 5782 | 14858 | 5684 | 18850 |
| ic_compat | 92 | 92 | 0 | 69 | 2 | 2/71, 8.6% | 2/92, 6.7% | 4914 | 14422 | 4914 | 25980 |
| combined | 92 | 92 | 0 | 69 | 2 | 2/71, 8.6% | 2/92, 6.7% | 5524 | 25229 | 5881 | 46418 |

## First calls, the 50 frozen tasks (main metric)

| Arm | Planned | Attempted | Not run | Verified | False success | FS / delivered (N, 95% upper) | FS / all requests (N, 95% upper) | p50 verified | p95 verified | p50 all | p95 all |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| installed_chrome | 50 | 50 | 0 | 31 | 2 | 2/33, 17.9% | 2/50, 12.1% | 7842 | 16173 | 7352 | 26332 |
| ic_compat | 50 | 50 | 0 | 32 | 2 | 2/34, 17.4% | 2/50, 12.1% | 7840 | 18531 | 6933 | 26669 |
| combined | 50 | 50 | 0 | 32 | 2 | 2/34, 17.4% | 2/50, 12.1% | 8158 | 46119 | 9262 | 59404 |

Not run counts as not verified. Latency in wall ms.

## Exit in this window

ic_compat verifies at least the combined arm's count minus 2, with no more false successes (unknown when tasks not run could decide it). The exit is read on all 92 tasks; the frozen 50 are shown beside it.

| Window | Set | ic_compat verified | Combined verified | At least | ic_compat FS | Combined FS | Verified | No more false successes | Met |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 (2026-10-28) | all 92 | 69 | 69 | 67 | 2 | 2 | yes | yes | yes |
| 2 (2026-10-28) | frozen 50 | 32 | 32 | 30 | 2 | 2 | yes | yes | yes |

## Cost (first calls, all 92)

| Arm | Cost | Cost per 1,000 verified |
| --- | --- | --- |
| installed_chrome | $0.0000 ledger | $0.00 |
| ic_compat | $0.0000 ledger | $0.00 |
| combined | $0.0168 ledger | $0.24 |

Cost per 1,000 verified divides the first calls' whole cost (failures included) by first-call verified tasks.

## Marginal gain (first calls)

| Arm | Against | Set | Gains | Regressions | Net |
| --- | --- | --- | --- | --- | --- |
| combined | installed_chrome | 92 | 3 (T014, T030, T050) | 3 (T001, T008, T071) | 0 |
| combined | installed_chrome | frozen 50 | 3 (T014, T030, T050) | 2 (T001, T071) | 1 |
| ic_compat | installed_chrome | 92 | 2 (T011, T059) | 2 (T008, T031) | 0 |
| ic_compat | installed_chrome | frozen 50 | 1 (T011) | 0 | 1 |
| ic_compat | combined | 92 | 4 (T001, T011, T059, T071) | 4 (T014, T030, T031, T050) | 0 |
| ic_compat | combined | frozen 50 | 3 (T001, T011, T071) | 3 (T014, T030, T050) | 0 |

## Which rung delivered each ic_compat-arm success (first calls)

| Delivering route (access.route/executor) | Verified tasks |
| --- | --- |
| browser/playwright | 22 (T006, T016, T017, T020, T026, T033, T034, T036, T051, T052, T055, T056, T059, T060, T062, T066, T070, T075, B002, B006, B010, B011) |
| installed_chrome/chrome | 21 (T001, T002, T003, T005, T011, T019, T021, T023, T025, T039, T047, T048, T049, T053, T067, T071, T073, T076, B001, B004, B008) |
| http/undici | 21 (T015, T022, T024, T035, T040, T041, T044, T058, T061, T063, T065, T072, T074, T077, T079, T080, B005, B007, B012, B013, B014) |
| http_compat/impit | 5 (T007, T009, T018, T029, T057) |

- ic_compat-arm answers that list a paid call: 0; of those, verified with a paid call as the answer: 0.
- ic_compat-arm gains over installed_chrome, by delivering route: T011 installed_chrome/chrome; T059 browser/playwright.
- The combined arm's gains over ic_compat in this window, by combined's delivering route: T014 vendor/steel; T030 vendor/steel; T031 vendor/steel; T050 vendor/steel; of those, delivered by Steel (vendor/steel), what dropping Steel lost: 4 (T014, T030, T031, T050).
- ic_compat-arm gains over combined, by delivering route: T001 installed_chrome/chrome; T011 installed_chrome/chrome; T059 browser/playwright; T071 installed_chrome/chrome.

## Which rung delivered each combined-arm success (first calls)

| Delivering route (access.route/executor) | Verified tasks |
| --- | --- |
| http/undici | 21 (T015, T022, T024, T035, T040, T041, T044, T058, T061, T063, T065, T072, T074, T077, T079, T080, B005, B007, B012, B013, B014) |
| installed_chrome/chrome | 20 (T002, T003, T005, T020, T021, T023, T025, T033, T039, T047, T048, T049, T053, T067, T070, T073, T076, B001, B004, B008) |
| browser/playwright | 19 (T006, T016, T017, T019, T026, T034, T036, T051, T052, T055, T056, T060, T062, T066, T075, B002, B006, B010, B011) |
| http_compat/impit | 5 (T007, T009, T018, T029, T057) |
| vendor/steel | 4 (T014, T030, T031, T050) |

- Combined-arm answers that list a Steel paid call: 16 (T001, T010, T012, T013, T014, T030, T031, T038, T043, T045, T046, T050, T068, T069, T071, B003); of those, verified with Steel as the answer: 4 (T014, T030, T031, T050).
- Combined-arm gains over installed_chrome, by delivering route: T014 vendor/steel; T030 vendor/steel; T050 vendor/steel.

## Firecrawl

Firecrawl was not run in this window. Its reference is #716's two windows (research/access/runs/2026-10-26-combined-two-windows-22bf90e7.md, first calls): 67 and 69 of 92 verified, 33 and 34 of the frozen 50, with 15 and 12 false successes (9 and 7 on the frozen 50). Those windows ran on 2026-10-25 and 2026-10-26, so a gap to them is not a same-window comparison.

## Retry pass (apart from the first calls)

| Arm | Retried | Verified on retry | False success on retry | Verified after retry | Retry cost |
| --- | --- | --- | --- | --- | --- |
| installed_chrome | 23 | 0 | 1 | 69 | $0.0000 ledger |
| ic_compat | 23 | 1 | 3 | 70 | $0.0000 ledger |
| combined | 23 | 3 | 2 | 72 | $0.0157 ledger |

## Steel calls

From each answer's ladder summary (the provider rungs, as run-set saved the response): a call whose session was never created, with the error the lane gave; each session's release, confirmed by a release call or, when none was, by Steel's own state (GET /v1/sessions/{id}, #725); and the ledger's basis for each call's charge. An answer without a ladder summary is counted as unread: its calls are unknown, not none, so with any unread answer the counts are lower bounds (≥) and the ledger total is unknown. Unknown session and release counts: an engine before the provider's step events (#723) traced neither.

| Arm | Phase | Answers | Unread | Steel calls | Refused | Sessions created | Create ms p50 / max | Create failed (error × n) | Created, no release event | Releases | Released, by | Unconfirmed (Steel's state) | Charge basis | Ledger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| installed_chrome | first | 92 | 0 | 0 | 0 | 0 | - | 0 | 0 | 0 | none | 0 | none | $0.0000 |
| installed_chrome | retry | 23 | 0 | 0 | 0 | 0 | - | 0 | 0 | 0 | none | 0 | none | $0.0000 |
| ic_compat | first | 92 | 0 | 0 | 0 | 0 | - | 0 | 0 | 0 | none | 0 | none | $0.0000 |
| ic_compat | retry | 23 | 0 | 0 | 0 | 0 | - | 0 | 0 | 0 | none | 0 | none | $0.0000 |
| combined | first | 92 | 0 | 16 | 0 | 15 | 3276 / 20849 | 1 (fetch failed × 1) | 0 | 15 | call × 14 | 1 (unread × 1) | measured × 14, ceiling × 2 | $0.0168 |
| combined | retry | 23 | 0 | 10 | 0 | 9 | 3510 / 28458 | 1 (fetch failed × 1) | 0 | 9 | call × 7 | 2 (unread × 2) | ceiling × 3, measured × 7 | $0.0157 |

## Per task (first calls)

yes = verified; FALSE = false success; no (reason) otherwise. Routes: each arm's access.route/executor.

| Task | Part | installed_chrome | ic_compat | combined | ic_compat route | Combined route |
| --- | --- | --- | --- | --- | --- | --- |
| T001 | frozen | yes | yes | no (captcha) | installed_chrome/chrome | vendor/steel |
| T002 | frozen | yes | yes | yes | installed_chrome/chrome | installed_chrome/chrome |
| T003 | frozen | yes | yes | yes | installed_chrome/chrome | installed_chrome/chrome |
| T004 | frozen | no (connection_error) | no (connection_error) | no (connection_error) | installed_chrome/chrome | installed_chrome/chrome |
| T005 | frozen | yes | yes | yes | installed_chrome/chrome | installed_chrome/chrome |
| T006 | frozen | yes | yes | yes | browser/playwright | browser/playwright |
| T007 | frozen | yes | yes | yes | http_compat/impit | http_compat/impit |
| T008 | unstable | yes | no (rate_limit) | no (rate_limit) | http/undici | http/undici |
| T009 | frozen | yes | yes | yes | http_compat/impit | http_compat/impit |
| T010 | frozen | FALSE | FALSE | FALSE | browser/playwright | installed_chrome/chrome |
| T011 | frozen | no (empty_unverified) | yes | FALSE | installed_chrome/chrome | browser/playwright |
| T012 | frozen | FALSE | FALSE | no (empty_unverified) | installed_chrome/chrome | vendor/steel |
| T013 | frozen | no (geo_restricted) | no (geo_restricted) | no (empty_unverified) | installed_chrome/chrome | vendor/steel |
| T014 | frozen | no (bot_detected_generic) | no (bot_detected_generic) | yes | installed_chrome/chrome | vendor/steel |
| T015 | healthy | yes | yes | yes | http/undici | http/undici |
| T016 | healthy | yes | yes | yes | browser/playwright | browser/playwright |
| T017 | frozen | yes | yes | yes | browser/playwright | browser/playwright |
| T018 | frozen | yes | yes | yes | http_compat/impit | http_compat/impit |
| T019 | frozen | yes | yes | yes | installed_chrome/chrome | browser/playwright |
| T020 | healthy | yes | yes | yes | browser/playwright | installed_chrome/chrome |
| T021 | frozen | yes | yes | yes | installed_chrome/chrome | installed_chrome/chrome |
| T022 | frozen | yes | yes | yes | http/undici | http/undici |
| T023 | frozen | yes | yes | yes | installed_chrome/chrome | installed_chrome/chrome |
| T024 | healthy | yes | yes | yes | http/undici | http/undici |
| T025 | frozen | yes | yes | yes | installed_chrome/chrome | installed_chrome/chrome |
| T026 | frozen | yes | yes | yes | browser/playwright | browser/playwright |
| T027 | healthy | no (http_error) | no (http_error) | no (http_error) | http/undici | http/undici |
| T029 | frozen | yes | yes | yes | http_compat/impit | http_compat/impit |
| T030 | frozen | no (login_wall) | no (empty_unverified) | yes | installed_chrome/chrome | vendor/steel |
| T031 | unstable | yes | no (captcha) | yes | installed_chrome/chrome | vendor/steel |
| T033 | healthy | yes | yes | yes | browser/playwright | installed_chrome/chrome |
| T034 | frozen | yes | yes | yes | browser/playwright | browser/playwright |
| T035 | healthy | yes | yes | yes | http/undici | http/undici |
| T036 | healthy | yes | yes | yes | browser/playwright | browser/playwright |
| T037 | frozen | no (captcha) | no (captcha) | no (captcha) | installed_chrome/chrome | installed_chrome/chrome |
| T038 | frozen | no (captcha) | no (captcha) | no (bot_detected_generic) | installed_chrome/chrome | vendor/steel |
| T039 | healthy | yes | yes | yes | installed_chrome/chrome | installed_chrome/chrome |
| T040 | healthy | yes | yes | yes | http/undici | http/undici |
| T041 | healthy | yes | yes | yes | http/undici | http/undici |
| T042 | frozen | no (bot_detected_generic) | no (bot_detected_generic) | no (bot_detected_generic) | installed_chrome/chrome | installed_chrome/chrome |
| T043 | frozen | no (bot_detected_generic) | no (bot_detected_generic) | no (bot_detected_generic) | installed_chrome/chrome | vendor/steel |
| T044 | healthy | yes | yes | yes | http/undici | http/undici |
| T045 | frozen | no (captcha) | no (captcha) | no (captcha) | installed_chrome/chrome | vendor/steel |
| T046 | frozen | no (captcha) | no (captcha) | no (captcha) | installed_chrome/chrome | vendor/steel |
| T047 | frozen | yes | yes | yes | installed_chrome/chrome | installed_chrome/chrome |
| T048 | frozen | yes | yes | yes | installed_chrome/chrome | installed_chrome/chrome |
| T049 | frozen | yes | yes | yes | installed_chrome/chrome | installed_chrome/chrome |
| T050 | frozen | no (http_error) | no (http_error) | yes | installed_chrome/chrome | vendor/steel |
| T051 | healthy | yes | yes | yes | browser/playwright | browser/playwright |
| T052 | healthy | yes | yes | yes | browser/playwright | browser/playwright |
| T053 | frozen | yes | yes | yes | installed_chrome/chrome | installed_chrome/chrome |
| T055 | frozen | yes | yes | yes | browser/playwright | browser/playwright |
| T056 | frozen | yes | yes | yes | browser/playwright | browser/playwright |
| T057 | frozen | yes | yes | yes | http_compat/impit | http_compat/impit |
| T058 | healthy | yes | yes | yes | http/undici | http/undici |
| T059 | healthy | no (captcha) | yes | no (captcha) | browser/playwright | installed_chrome/chrome |
| T060 | frozen | yes | yes | yes | browser/playwright | browser/playwright |
| T061 | healthy | yes | yes | yes | http/undici | http/undici |
| T062 | healthy | yes | yes | yes | browser/playwright | browser/playwright |
| T063 | healthy | yes | yes | yes | http/undici | http/undici |
| T064 | frozen | no (login_wall) | no (login_wall) | no (login_wall) | installed_chrome/chrome | installed_chrome/chrome |
| T065 | frozen | yes | yes | yes | http/undici | http/undici |
| T066 | frozen | yes | yes | yes | browser/playwright | browser/playwright |
| T067 | healthy | yes | yes | yes | installed_chrome/chrome | installed_chrome/chrome |
| T068 | frozen | no (bot_detected_generic) | no (bot_detected_generic) | no (cloudflare_challenge) | installed_chrome/chrome | vendor/steel |
| T069 | frozen | no (cloudflare_challenge) | no (cloudflare_challenge) | no (cloudflare_challenge) | installed_chrome/chrome | vendor/steel |
| T070 | frozen | yes | yes | yes | browser/playwright | installed_chrome/chrome |
| T071 | frozen | yes | yes | no (cloudflare_challenge) | installed_chrome/chrome | vendor/steel |
| T072 | healthy | yes | yes | yes | http/undici | http/undici |
| T073 | unstable | yes | yes | yes | installed_chrome/chrome | installed_chrome/chrome |
| T074 | healthy | yes | yes | yes | http/undici | http/undici |
| T075 | frozen | yes | yes | yes | browser/playwright | browser/playwright |
| T076 | frozen | yes | yes | yes | installed_chrome/chrome | installed_chrome/chrome |
| T077 | healthy | yes | yes | yes | http/undici | http/undici |
| T078 | frozen | no (rate_limit) | no (rate_limit) | no (rate_limit) | http/undici | http/undici |
| T079 | healthy | yes | yes | yes | http/undici | http/undici |
| T080 | healthy | yes | yes | yes | http/undici | http/undici |
| T081 | frozen | no (http_error) | no (http_error) | no (http_error) | http/undici | http/undici |
| B001 | blind | yes | yes | yes | installed_chrome/chrome | installed_chrome/chrome |
| B002 | blind | yes | yes | yes | browser/playwright | browser/playwright |
| B003 | blind | no (empty_unverified) | no (empty_unverified) | no (empty_unverified) | installed_chrome/chrome | installed_chrome/chrome |
| B004 | blind | yes | yes | yes | installed_chrome/chrome | installed_chrome/chrome |
| B005 | blind | yes | yes | yes | http/undici | http/undici |
| B006 | blind | yes | yes | yes | browser/playwright | browser/playwright |
| B007 | blind | yes | yes | yes | http/undici | http/undici |
| B008 | blind | yes | yes | yes | installed_chrome/chrome | installed_chrome/chrome |
| B009 | blind | no (http_error) | no (http_error) | no (http_error) | http/undici | http/undici |
| B010 | blind | yes | yes | yes | browser/playwright | browser/playwright |
| B011 | blind | yes | yes | yes | browser/playwright | browser/playwright |
| B012 | blind | yes | yes | yes | http/undici | http/undici |
| B013 | blind | yes | yes | yes | http/undici | http/undici |
| B014 | blind | yes | yes | yes | http/undici | http/undici |

Each arm's own records (run-set.mjs, per block and retry) are in `2026-10-28-ic-compat-w2-e1a7acc4-<arm>.md` beside this file; raw runs under `.w2l/access/ic-compat/2026-10-28-w2` and .w2l/access/runs/ (git-ignored).
