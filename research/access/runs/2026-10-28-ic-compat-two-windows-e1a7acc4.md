# installed_chrome with compatible_transport and no Steel, two windows: 2026-10-27 and 2026-10-28

- Item: ROADMAP.md, current phase (decision 17), stage L item 1. Windows `.w2l/access/ic-compat/2026-10-27-w1` (runner `e1a7acc4`) and `.w2l/access/ic-compat/2026-10-28-w2` (runner `e1a7acc4`); ic_compat grant `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5` / `bf5f2882e2e3a0a42dbc10aab8cfe4b5161fe8135448201b7f8147a1e78b32a5`, combined grant `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec` / `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`; arms listed installed_chrome, ic_compat, combined in window 1 and installed_chrome, combined, ic_compat in window 2. Each window's own record has its conditions.
- Command: `node research/access/combinedReport.mjs .w2l/access/ic-compat/2026-10-27-w1 .w2l/access/ic-compat/2026-10-28-w2 --out research/access/runs/2026-10-28-ic-compat-two-windows-e1a7acc4.md`. First calls only.
- Window 2's record carries a note on the window (First start of this window, stopped and not counted); nothing it describes is counted here.

## Verified per window and across both, all 92 tasks

| Arm | Window 1 | Window 2 | In both | In one only | In neither | False success w1 / w2 | Both windows (of 184, 95% upper) | p50 / p95 all w1 | p50 / p95 all w2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| installed_chrome | 67 | 69 | 64 | 8 | 20 | 1 / 2 | 3/184, 4.2% | 6202 / 28307 | 5684 / 18850 |
| ic_compat | 69 | 69 | 66 | 6 | 20 | 1 / 2 | 3/184, 4.2% | 5612 / 26239 | 4914 / 25980 |
| combined | 72 | 69 | 65 | 11 | 16 | 1 / 2 | 3/184, 4.2% | 6495 / 166619 | 5881 / 46418 |

## Verified per window and across both, the 50 frozen tasks

| Arm | Window 1 | Window 2 | In both | In one only | In neither | False success w1 / w2 | Both windows (of 100, 95% upper) | p50 / p95 all w1 | p50 / p95 all w2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| installed_chrome | 31 | 31 | 29 | 4 | 17 | 1 / 2 | 3/100, 7.6% | 8920 / 28443 | 7352 / 26332 |
| ic_compat | 33 | 32 | 31 | 3 | 16 | 1 / 2 | 3/100, 7.6% | 8305 / 26239 | 6933 / 26669 |
| combined | 34 | 32 | 29 | 8 | 13 | 1 / 2 | 3/100, 7.6% | 10299 / 168106 | 9262 / 59404 |

## Marginal gain held in both windows

A gain: the arm verified the task in both windows and the baseline in neither. A regression: the reverse. Any other disagreement is unstable.

| Arm | Against | Set | Gains in both | Regressions in both | Net | Unstable |
| --- | --- | --- | --- | --- | --- | --- |
| combined | installed_chrome | 92 | 0 | 0 | 0 | 14 (T001, T008, T011, T014, T025, T030, T031, T037, T038, T050, T052, T053, T059, T071) |
| combined | installed_chrome | frozen 50 | 0 | 0 | 0 | 10 (T001, T011, T014, T025, T030, T037, T038, T050, T053, T071) |
| ic_compat | installed_chrome | 92 | 1 (T011) | 0 | 1 | 8 (T008, T025, T031, T037, T038, T052, T053, T059) |
| ic_compat | installed_chrome | frozen 50 | 1 (T011) | 0 | 1 | 4 (T025, T037, T038, T053) |
| ic_compat | combined | 92 | 0 | 0 | 0 | 13 (T001, T008, T011, T014, T030, T031, T037, T038, T050, T052, T053, T059, T071) |
| ic_compat | combined | frozen 50 | 0 | 0 | 0 | 9 (T001, T011, T014, T030, T037, T038, T050, T053, T071) |

## The ic_compat arm's gains over installed_chrome that held, by delivering route

- T011: window 1 browser/playwright, window 2 installed_chrome/chrome

## What dropping Steel lost: the combined arm's gains over ic_compat that held, by combined's delivering route

- None.

## The ic_compat arm's gains over combined that held, by delivering route

- None.

## #716's held gains over installed_chrome, in these windows

The five tasks the combined grant gained over installed_chrome in both of #716's windows (research/access/runs/2026-10-26-combined-two-windows-22bf90e7.md), with the route #716 recorded.

| Task | #716 route | ic_compat w1 | ic_compat w2 | Combined w1 | Combined w2 | installed_chrome w1 / w2 |
| --- | --- | --- | --- | --- | --- | --- |
| T007 | http_compat/impit | yes (http_compat/impit) | yes (http_compat/impit) | yes (http_compat/impit) | yes (http_compat/impit) | yes / yes |
| T008 | w1 http/undici, w2 browser/playwright | yes (http/undici) | no (rate_limit) | yes (http/undici) | no (rate_limit) | no / yes |
| T014 | vendor/steel | no (bot_detected_generic) | no (bot_detected_generic) | no (http_error) | yes (vendor/steel) | no / no |
| T018 | http_compat/impit | yes (http_compat/impit) | yes (http_compat/impit) | yes (http_compat/impit) | yes (http_compat/impit) | yes / yes |
| T050 | vendor/steel | no (http_error) | no (http_error) | no (http_error) | yes (vendor/steel) | no / no |

## Exit

In both windows, ic_compat verifies at least the combined arm's count minus 2, with no more false successes (unknown when tasks not run could decide it). The exit is read on all 92 tasks; the frozen 50 are shown beside it.

| Window | Set | ic_compat verified | Combined verified | At least | ic_compat FS | Combined FS | Verified | No more false successes | Met |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 (2026-10-27) | all 92 | 69 | 72 | 70 | 1 | 1 | no | yes | no |
| 1 (2026-10-27) | frozen 50 | 33 | 34 | 32 | 1 | 1 | yes | yes | yes |
| 2 (2026-10-28) | all 92 | 69 | 69 | 67 | 2 | 2 | yes | yes | yes |
| 2 (2026-10-28) | frozen 50 | 32 | 32 | 30 | 2 | 2 | yes | yes | yes |

- Exit not met on all 92 tasks.

## The combined arm's gains over installed_chrome that held, by delivering route

- None.

## Cost, per window

| Arm | Cost w1 | Cost w2 | Per 1,000 verified w1 | Per 1,000 verified w2 |
| --- | --- | --- | --- | --- |
| installed_chrome | $0.0000 ledger | $0.0000 ledger | $0.00 | $0.00 |
| ic_compat | $0.0000 ledger | $0.0000 ledger | $0.00 | $0.00 |
| combined | $0.0250 ledger + unknown on 1 attempt(s) the ledger did not report | $0.0168 ledger | unknown | $0.24 |

Cost: Octocrawl arms, the spend ledger over first calls (the grant's tariff estimate). Clash bandwidth, compute, storage and delivery are not measured (unknown exposure).

Firecrawl was not run in these windows. Its reference is #716's two windows (research/access/runs/2026-10-26-combined-two-windows-22bf90e7.md, first calls): 67 and 69 of 92 verified, 33 and 34 of the frozen 50, with 15 and 12 false successes (9 and 7 on the frozen 50). Those windows ran on 2026-10-25 and 2026-10-26, so a gap to them is not a same-window comparison.

## Per task, first calls (w1/w2: y = verified, F = false success, n = not, - = not run)

| Task | Part | installed_chrome | ic_compat | combined |
| --- | --- | --- | --- | --- |
| T001 | frozen | y/y | y/y | y/n |
| T002 | frozen | y/y | y/y | y/y |
| T003 | frozen | y/y | y/y | y/y |
| T004 | frozen | n/n | n/n | n/n |
| T005 | frozen | y/y | y/y | y/y |
| T006 | frozen | y/y | y/y | y/y |
| T007 | frozen | y/y | y/y | y/y |
| T008 | unstable | n/y | y/n | y/n |
| T009 | frozen | y/y | y/y | y/y |
| T010 | frozen | F/F | F/F | F/F |
| T011 | frozen | n/n | y/y | y/F |
| T012 | frozen | n/F | n/F | n/n |
| T013 | frozen | n/n | n/n | n/n |
| T014 | frozen | n/n | n/n | n/y |
| T015 | healthy | y/y | y/y | y/y |
| T016 | healthy | y/y | y/y | y/y |
| T017 | frozen | y/y | y/y | y/y |
| T018 | frozen | y/y | y/y | y/y |
| T019 | frozen | y/y | y/y | y/y |
| T020 | healthy | y/y | y/y | y/y |
| T021 | frozen | y/y | y/y | y/y |
| T022 | frozen | y/y | y/y | y/y |
| T023 | frozen | y/y | y/y | y/y |
| T024 | healthy | y/y | y/y | y/y |
| T025 | frozen | n/y | y/y | y/y |
| T026 | frozen | y/y | y/y | y/y |
| T027 | healthy | n/n | n/n | n/n |
| T029 | frozen | y/y | y/y | y/y |
| T030 | frozen | n/n | n/n | n/y |
| T031 | unstable | n/y | n/n | n/y |
| T033 | healthy | y/y | y/y | y/y |
| T034 | frozen | y/y | y/y | y/y |
| T035 | healthy | y/y | y/y | y/y |
| T036 | healthy | y/y | y/y | y/y |
| T037 | frozen | y/n | y/n | y/n |
| T038 | frozen | y/n | y/n | y/n |
| T039 | healthy | y/y | y/y | y/y |
| T040 | healthy | y/y | y/y | y/y |
| T041 | healthy | y/y | y/y | y/y |
| T042 | frozen | n/n | n/n | n/n |
| T043 | frozen | n/n | n/n | n/n |
| T044 | healthy | y/y | y/y | y/y |
| T045 | frozen | n/n | n/n | n/n |
| T046 | frozen | n/n | n/n | n/n |
| T047 | frozen | y/y | y/y | y/y |
| T048 | frozen | y/y | y/y | y/y |
| T049 | frozen | y/y | y/y | y/y |
| T050 | frozen | n/n | n/n | n/y |
| T051 | healthy | y/y | y/y | y/y |
| T052 | healthy | n/y | n/y | y/y |
| T053 | frozen | n/y | n/y | y/y |
| T055 | frozen | y/y | y/y | y/y |
| T056 | frozen | y/y | y/y | y/y |
| T057 | frozen | y/y | y/y | y/y |
| T058 | healthy | y/y | y/y | y/y |
| T059 | healthy | y/n | n/y | y/n |
| T060 | frozen | y/y | y/y | y/y |
| T061 | healthy | y/y | y/y | y/y |
| T062 | healthy | y/y | y/y | y/y |
| T063 | healthy | y/y | y/y | y/y |
| T064 | frozen | n/n | n/n | n/n |
| T065 | frozen | y/y | y/y | y/y |
| T066 | frozen | y/y | y/y | y/y |
| T067 | healthy | y/y | y/y | y/y |
| T068 | frozen | n/n | n/n | n/n |
| T069 | frozen | n/n | n/n | n/n |
| T070 | frozen | y/y | y/y | y/y |
| T071 | frozen | y/y | y/y | y/n |
| T072 | healthy | y/y | y/y | y/y |
| T073 | unstable | y/y | y/y | y/y |
| T074 | healthy | y/y | y/y | y/y |
| T075 | frozen | y/y | y/y | y/y |
| T076 | frozen | y/y | y/y | y/y |
| T077 | healthy | y/y | y/y | y/y |
| T078 | frozen | n/n | n/n | n/n |
| T079 | healthy | y/y | y/y | y/y |
| T080 | healthy | y/y | y/y | y/y |
| T081 | frozen | n/n | n/n | n/n |
| B001 | blind | y/y | y/y | y/y |
| B002 | blind | y/y | y/y | y/y |
| B003 | blind | n/n | n/n | n/n |
| B004 | blind | y/y | y/y | y/y |
| B005 | blind | y/y | y/y | y/y |
| B006 | blind | y/y | y/y | y/y |
| B007 | blind | y/y | y/y | y/y |
| B008 | blind | y/y | y/y | y/y |
| B009 | blind | n/n | n/n | n/n |
| B010 | blind | y/y | y/y | y/y |
| B011 | blind | y/y | y/y | y/y |
| B012 | blind | y/y | y/y | y/y |
| B013 | blind | y/y | y/y | y/y |
| B014 | blind | y/y | y/y | y/y |
