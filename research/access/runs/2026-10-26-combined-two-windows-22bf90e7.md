# Combined grant, two windows: 2026-10-25 and 2026-10-26

- Item: ROADMAP.md, PA bar, the first item to measure next. Windows `.w2l/access/combined/2026-10-25-w1` (runner `22bf90e7`) and `.w2l/access/combined/2026-10-26-w2` (runner `22bf90e7`); combined grant `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec` / `0671de738caa095d61d2aefecf86b300bed072abe4c4ebe3e166658ae0ff8fec`. Each window's own record has its conditions.
- Command: `node research/access/combinedReport.mjs .w2l/access/combined/2026-10-25-w1 .w2l/access/combined/2026-10-26-w2 --out research/access/runs/2026-10-26-combined-two-windows-22bf90e7.md`. First calls only.

## Verified per window and across both, all 92 tasks

| Arm | Window 1 | Window 2 | In both | In one only | In neither | False success w1 / w2 | Both windows (of 184, 95% upper) | p50 / p95 all w1 | p50 / p95 all w2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| standard | 43 | 44 | 40 | 7 | 45 | 2 / 0 | 2/184, 3.4% | 2989 / 15273 | 2645 / 14795 |
| installed_chrome | 66 | 61 | 60 | 7 | 25 | 2 / 1 | 3/184, 4.2% | 6386 / 26880 | 6612 / 26636 |
| combined | 71 | 73 | 69 | 6 | 17 | 1 / 2 | 3/184, 4.2% | 6994 / 45618 | 6620 / 53826 |
| firecrawl | 67 | 69 | 65 | 6 | 21 | 15 / 12 | 27/184, 19.7% | 3232 / 10989 | 3479 / 10213 |

## Verified per window and across both, the 50 frozen tasks

| Arm | Window 1 | Window 2 | In both | In one only | In neither | False success w1 / w2 | Both windows (of 100, 95% upper) | p50 / p95 all w1 | p50 / p95 all w2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| standard | 14 | 15 | 12 | 5 | 33 | 2 / 0 | 2/100, 6.2% | 3116 / 17897 | 2703 / 16643 |
| installed_chrome | 30 | 25 | 25 | 5 | 20 | 2 / 1 | 3/100, 7.6% | 7961 / 27015 | 8991 / 26636 |
| combined | 34 | 35 | 32 | 5 | 13 | 1 / 2 | 3/100, 7.6% | 9674 / 53612 | 9076 / 55866 |
| firecrawl | 33 | 34 | 32 | 3 | 15 | 9 / 7 | 16/100, 23.3% | 3232 / 11160 | 3643 / 11338 |

## Marginal gain held in both windows

A gain: the arm verified the task in both windows and the baseline in neither. A regression: the reverse. Any other disagreement is unstable.

| Arm | Against | Set | Gains in both | Regressions in both | Net | Unstable |
| --- | --- | --- | --- | --- | --- | --- |
| installed_chrome | standard | 92 | 16 (T001, T002, T003, T021, T023, T039, T047, T049, T052, T070, T071, T073, T076, B001, B004, B008) | 1 (T008) | 15 | 13 (T005, T011, T019, T020, T025, T034, T037, T038, T051, T053, T057, T059, T067) |
| installed_chrome | standard | frozen 50 | 10 (T001, T002, T003, T021, T023, T047, T049, T070, T071, T076) | 0 | 10 | 9 (T005, T011, T019, T025, T034, T037, T038, T053, T057) |
| combined | standard | 92 | 25 (T001, T002, T003, T005, T007, T014, T018, T021, T023, T025, T039, T047, T049, T050, T051, T052, T053, T059, T070, T071, T073, T076, B001, B004, B008) | 0 | 25 | 12 (T011, T019, T020, T030, T034, T037, T038, T043, T048, T057, T062, T067) |
| combined | standard | frozen 50 | 17 (T001, T002, T003, T005, T007, T014, T018, T021, T023, T025, T047, T049, T050, T053, T070, T071, T076) | 0 | 17 | 9 (T011, T019, T030, T034, T037, T038, T043, T048, T057) |
| combined | installed_chrome | 92 | 5 (T007, T008, T014, T018, T050) | 0 | 5 | 12 (T005, T011, T025, T030, T034, T038, T043, T048, T051, T053, T059, T062) |
| combined | installed_chrome | frozen 50 | 4 (T007, T014, T018, T050) | 0 | 4 | 9 (T005, T011, T025, T030, T034, T038, T043, T048, T053) |

## The combined arm's gains over installed_chrome that held, by delivering route

- T007: window 1 http_compat/impit, window 2 http_compat/impit
- T008: window 1 http/undici, window 2 browser/playwright
- T014: window 1 vendor/steel, window 2 vendor/steel
- T018: window 1 http_compat/impit, window 2 http_compat/impit
- T050: window 1 vendor/steel, window 2 vendor/steel

## Cost and gap to Firecrawl, per window

| Arm | Cost w1 | Cost w2 | Per 1,000 verified w1 | Per 1,000 verified w2 | Gap to Firecrawl, 92: w1 / w2 | Gap, frozen 50: w1 / w2 |
| --- | --- | --- | --- | --- | --- | --- |
| standard | $0 (no grant: no paid route) | $0 (no grant: no paid route) | $0.00 | $0.00 | 24 / 25 | 19 / 19 |
| installed_chrome | $0.0000 ledger | $0.0000 ledger | $0.00 | $0.00 | 1 / 8 | 3 / 9 |
| combined | $0.0384 ledger | $0.0342 ledger | $0.54 | $0.47 | -4 / -4 | -1 / -1 |
| firecrawl | 112 credits (Free plan: not priced in USD) | 111 credits (Free plan: not priced in USD) | 1672 credits | 1609 credits | - | - |

Cost: Octocrawl arms, the spend ledger over first calls (the grant's tariff estimate); Firecrawl, the change in remaining credits over its first calls. Clash bandwidth, compute, storage and delivery are not measured (unknown exposure).

## Per task, first calls (w1/w2: y = verified, F = false success, n = not, - = not run)

| Task | Part | standard | installed_chrome | combined | firecrawl |
| --- | --- | --- | --- | --- | --- |
| T001 | frozen | n/n | y/y | y/y | y/y |
| T002 | frozen | n/n | y/y | y/y | y/y |
| T003 | frozen | n/n | y/y | y/y | y/y |
| T004 | frozen | n/n | n/n | n/n | n/n |
| T005 | frozen | n/n | y/n | y/y | F/F |
| T006 | frozen | y/y | y/y | y/y | y/y |
| T007 | frozen | n/n | n/n | y/y | y/y |
| T008 | unstable | y/y | n/n | y/y | y/y |
| T009 | frozen | y/y | y/y | y/y | y/y |
| T010 | frozen | F/n | F/n | F/F | F/F |
| T011 | frozen | n/y | y/y | y/n | n/n |
| T012 | frozen | n/n | F/F | n/F | F/F |
| T013 | frozen | n/n | n/n | n/n | y/y |
| T014 | frozen | n/n | n/n | y/y | F/y |
| T015 | healthy | y/y | y/y | y/y | F/y |
| T016 | healthy | y/y | y/y | y/y | y/y |
| T017 | frozen | y/y | y/y | y/y | y/y |
| T018 | frozen | n/n | n/n | y/y | y/y |
| T019 | frozen | F/y | y/y | y/y | F/F |
| T020 | healthy | n/y | y/y | y/y | y/y |
| T021 | frozen | n/n | y/y | y/y | y/y |
| T022 | frozen | y/y | y/y | y/y | F/y |
| T023 | frozen | n/n | y/y | y/y | y/y |
| T024 | healthy | y/y | y/y | y/y | y/y |
| T025 | frozen | n/n | y/n | y/y | y/y |
| T026 | frozen | y/y | y/y | y/y | F/F |
| T027 | healthy | n/n | n/n | n/n | y/y |
| T029 | frozen | y/y | y/y | y/y | y/y |
| T030 | frozen | n/n | n/n | n/y | y/y |
| T031 | unstable | n/n | n/n | n/n | y/F |
| T033 | healthy | y/y | y/y | y/y | y/y |
| T034 | frozen | y/n | y/n | y/y | y/y |
| T035 | healthy | y/y | y/y | y/y | y/y |
| T036 | healthy | y/y | y/y | y/y | y/y |
| T037 | frozen | y/n | n/n | n/n | F/F |
| T038 | frozen | n/n | y/n | y/n | y/y |
| T039 | healthy | n/n | y/y | y/y | y/y |
| T040 | healthy | y/y | y/y | y/y | y/y |
| T041 | healthy | y/y | y/y | y/y | y/y |
| T042 | frozen | n/n | n/n | n/n | y/y |
| T043 | frozen | n/n | n/n | n/y | y/y |
| T044 | healthy | y/y | y/y | y/y | y/y |
| T045 | frozen | n/n | n/n | n/n | n/n |
| T046 | frozen | n/n | n/n | n/n | y/y |
| T047 | frozen | n/n | y/y | y/y | y/y |
| T048 | frozen | n/n | n/n | n/y | y/y |
| T049 | frozen | n/n | y/y | y/y | n/n |
| T050 | frozen | n/n | n/n | y/y | y/n |
| T051 | healthy | n/n | n/y | y/y | y/y |
| T052 | healthy | n/n | y/y | y/y | F/F |
| T053 | frozen | n/n | y/n | y/y | y/y |
| T055 | frozen | y/y | y/y | y/y | F/F |
| T056 | frozen | y/y | y/y | y/y | y/y |
| T057 | frozen | n/y | y/y | y/y | y/y |
| T058 | healthy | y/y | y/y | y/y | F/F |
| T059 | healthy | n/n | y/n | y/y | y/y |
| T060 | frozen | y/y | y/y | y/y | y/y |
| T061 | healthy | y/y | y/y | y/y | y/y |
| T062 | healthy | y/y | y/y | n/y | y/y |
| T063 | healthy | y/y | y/y | y/y | y/y |
| T064 | frozen | n/n | n/n | n/n | y/y |
| T065 | frozen | y/y | y/y | y/y | y/y |
| T066 | frozen | y/y | y/y | y/y | y/y |
| T067 | healthy | y/n | y/y | y/y | y/y |
| T068 | frozen | n/n | n/n | n/n | y/y |
| T069 | frozen | n/n | n/n | n/n | y/y |
| T070 | frozen | n/n | y/y | y/y | n/n |
| T071 | frozen | n/n | y/y | y/y | y/y |
| T072 | healthy | y/y | y/y | y/y | y/y |
| T073 | unstable | n/n | y/y | y/y | F/y |
| T074 | healthy | y/y | y/y | y/y | y/y |
| T075 | frozen | y/y | y/y | y/y | n/n |
| T076 | frozen | n/n | y/y | y/y | y/y |
| T077 | healthy | y/y | y/y | y/y | y/y |
| T078 | frozen | n/n | n/n | n/n | n/n |
| T079 | healthy | y/y | y/y | y/y | F/F |
| T080 | healthy | y/y | y/y | y/y | n/n |
| T081 | frozen | n/n | n/n | n/n | n/n |
| B001 | blind | n/n | y/y | y/y | y/y |
| B002 | blind | y/y | y/y | y/y | y/y |
| B003 | blind | n/n | n/n | n/n | F/F |
| B004 | blind | n/n | y/y | y/y | y/y |
| B005 | blind | y/y | y/y | y/y | y/y |
| B006 | blind | y/y | y/y | y/y | y/y |
| B007 | blind | y/y | y/y | y/y | y/y |
| B008 | blind | n/n | y/y | y/y | y/y |
| B009 | blind | n/n | n/n | n/n | n/n |
| B010 | blind | y/y | y/y | y/y | y/y |
| B011 | blind | y/y | y/y | y/y | y/y |
| B012 | blind | y/y | y/y | y/y | y/y |
| B013 | blind | y/y | y/y | y/y | y/y |
| B014 | blind | y/y | y/y | y/y | y/y |
