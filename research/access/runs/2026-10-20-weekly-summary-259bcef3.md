# Weekly rerun: summary, 2026-10-20

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `summary`, week 2026-W43, run on 2026-10-20
- Source commit: `259bcef3`
- Set: 47 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 6 (group 3 of 0–3, ISO week 43 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T066, T069, T070, T075, T078, T081
- Chrome: Google Chrome 155.0.8059.80 (previous weekly record: Google Chrome 155.0.8059.80 (the P0.1 baseline, research/access/runs/2026-10-20-pa-next-baseline-ic16-1c4d9178.md))
- Arms: free (run, [record](2026-10-20-weekly-free-259bcef3.md)); steel (run, [record](2026-10-20-weekly-steel-259bcef3.md)); firecrawl (run, [record](2026-10-20-weekly-firecrawl-259bcef3.md)); zenrows (run, [record](2026-10-20-weekly-zenrows-259bcef3.md)); arms not asked for: none
- Gap: the best competitor arm's verified count minus the arm's, on the same tasks; a negative gap is a lead. With no competitor arm run the gap is unknown, not 0.
- installed_chrome on the 16 tasks: 10 of 16 verified against the acceptance baseline (ADR 0005, 7b56397b: final runs 11 and 7 of 16, probe runs 12 and 12): at or above the lower accepted run (7), below the higher (11)

| Arm | Status | Verified (of planned) | False success | p50 ms | p95 ms | Cost | Gap to best competitor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| free | run | 36 of 47 | 0 | 5066 | 24186 | $0 | 1 |
| steel | run | 28 of 47 | 1 | 5230 | 15390 | $0.0049 | 9 |
| firecrawl | run | 37 of 47 | 4 | 3420 | 11789 | 70 credits by the account's usage before and after the arm | - |
| zenrows | run | 34 of 47 | 3 | 4619 | 94452 | 338 credits by the account's usage before and after the arm ($0.3380 as ZenRows prices them) | - |

| Arm | Healthy verified | Challenge16 verified | Rotation verified | Gap healthy | Gap challenge16 | Gap rotation |
| --- | --- | --- | --- | --- | --- | --- |
| free | 23 of 25 | 10 of 16 | 3 of 6 | -2 | 4 | -1 |
| steel | 23 of 25 | 2 of 16 | 3 of 6 | -2 | 12 | -1 |
| firecrawl | 21 of 25 | 14 of 16 | 2 of 6 | - | - | - |
| zenrows | 21 of 25 | 11 of 16 | 2 of 6 | - | - | - |

An arm not run keeps its planned tasks in the denominator (all not verified). Verified and false-success counts are the runner's (research/access/run-set.mjs, cold attempts); each arm's record has the per-task table.
