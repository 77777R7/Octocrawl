# Weekly rerun: summary, 2026-10-21

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `summary`, week 2026-W43, run on 2026-10-21
- Source commit: `db80379b`
- Set: 47 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 6 (group 3 of 0–3, ISO week 43 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T066, T069, T070, T075, T078, T081
- Chrome: Google Chrome 155.0.8059.85 (previous weekly record: Google Chrome 155.0.8059.80)
- Arms: free (run, [record](2026-10-21-weekly-free-db80379b.md)); steel (run, [record](2026-10-21-weekly-steel-db80379b.md)); firecrawl (run, [record](2026-10-21-weekly-firecrawl-db80379b.md)); zenrows (run, [record](2026-10-21-weekly-zenrows-db80379b.md)); arms not asked for: none
- Gap: the best competitor arm's verified count minus the arm's, on the same tasks; a negative gap is a lead. With no competitor arm run the gap is unknown, not 0.
- installed_chrome on the 16 tasks: 10 of 16 verified against the acceptance baseline (ADR 0005, 7b56397b: final runs 11 and 7 of 16, probe runs 12 and 12): at or above the lower accepted run (7), below the higher (11)

| Arm | Status | Verified (of planned) | False success | p50 ms | p95 ms | Cost | Gap to best competitor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| free | run | 35 of 47 | 0 | 5086 | 23725 | $0 | 2 |
| steel | run | 27 of 47 | 0 | 5007 | 28746 | $0.0356 | 10 |
| firecrawl | run | 37 of 47 | 4 | 4372 | 11494 | credits unknown (account not read after the arm) | - |
| zenrows | run | 30 of 47 | 5 | 5317 | 121143 | 390 credits by the account's usage before and after the arm ($0.3900 as ZenRows prices them) | - |

| Arm | Healthy verified | Challenge16 verified | Rotation verified | Gap healthy | Gap challenge16 | Gap rotation |
| --- | --- | --- | --- | --- | --- | --- |
| free | 23 of 25 | 10 of 16 | 2 of 6 | -2 | 4 | 0 |
| steel | 22 of 25 | 3 of 16 | 2 of 6 | -1 | 11 | 0 |
| firecrawl | 21 of 25 | 14 of 16 | 2 of 6 | - | - | - |
| zenrows | 19 of 25 | 9 of 16 | 2 of 6 | - | - | - |

An arm not run keeps its planned tasks in the denominator (all not verified). Verified and false-success counts are the runner's (research/access/run-set.mjs, cold attempts); each arm's record has the per-task table.
