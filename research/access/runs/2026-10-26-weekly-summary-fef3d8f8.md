# Weekly rerun: summary, 2026-10-26

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `summary`, week 2026-W44, run on 2026-10-26
- Source commit: `fef3d8f8`
- Set: 51 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 10 (group 0 of 0–3, ISO week 44 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T003, T004, T006, T007, T009, T010, T011, T012, T013, T014
- Chrome: Google Chrome 156.0.8078.47 (previous weekly record: Google Chrome 155.0.8059.85; major version changed, the 16 tasks were run twice)
- Arms: free (run, [record](2026-10-26-weekly-free-fef3d8f8.md)); steel (run, [record](2026-10-26-weekly-steel-fef3d8f8.md)); firecrawl (run, [record](2026-10-26-weekly-firecrawl-fef3d8f8.md)); zenrows (run, [record](2026-10-26-weekly-zenrows-fef3d8f8.md)); arms not asked for: none
- Gap: the best competitor arm's verified count minus the arm's, on the same tasks; a negative gap is a lead. With no competitor arm run the gap is unknown, not 0.
- installed_chrome on the 16 tasks: 12 of 16 verified against the acceptance baseline (ADR 0005, 7b56397b: final runs 11 and 7 of 16, probe runs 12 and 12): at or above both accepted runs
- installed_chrome on the 16 tasks: 13 of 16 verified against the acceptance baseline (ADR 0005, 7b56397b: final runs 11 and 7 of 16, probe runs 12 and 12): at or above both accepted runs

| Arm | Status | Verified (of planned) | False success | p50 ms | p95 ms | Cost | Gap to best competitor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| free | run | 32 of 51 | 0 | 8302 | 37717 | $0 | 9 |
| steel | run | 28 of 51 | 1 | 8339 | 79875 | $0.0261 | 13 |
| firecrawl | run | 41 of 51 | 7 | 3065 | 12078 | 77 credits by the account's usage before and after the arm | - |
| zenrows | run | 34 of 51 | 9 | 4505 | 107098 | 437 credits by the account's usage before and after the arm ($0.4370 as ZenRows prices them) | - |

| Arm | Healthy verified | Challenge16 verified | Rotation verified | Gap healthy | Gap challenge16 | Gap rotation |
| --- | --- | --- | --- | --- | --- | --- |
| free | 19 of 25 | 12 of 16 | 1 of 10 | 2 | 2 | 5 |
| steel | 19 of 25 | 3 of 16 | 6 of 10 | 2 | 11 | 0 |
| firecrawl | 21 of 25 | 14 of 16 | 6 of 10 | - | - | - |
| zenrows | 20 of 25 | 10 of 16 | 4 of 10 | - | - | - |

An arm not run keeps its planned tasks in the denominator (all not verified). Verified and false-success counts are the runner's (research/access/run-set.mjs, cold attempts); each arm's record has the per-task table.
