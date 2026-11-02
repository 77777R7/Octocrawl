# Weekly rerun: summary, 2026-11-02

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `summary`, week 2026-W45, run on 2026-11-02
- Source commit: `b93c766a`
- Set: 51 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 10 (group 1 of 0–3, ISO week 45 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T017, T018, T019, T021, T022, T023, T025, T026, T029, T030
- Chrome: Google Chrome 156.0.8078.79 (previous weekly record: Google Chrome 156.0.8078.47)
- Arms: free (run, [record](2026-11-02-weekly-free-b93c766a.md)); firecrawl (run, [record](2026-11-02-weekly-firecrawl-b93c766a.md)); zenrows (run, [record](2026-11-02-weekly-zenrows-b93c766a.md)); arms not asked for: steel
- Gap: the best competitor arm's verified count minus the arm's, on the same tasks; a negative gap is a lead. With no competitor arm run the gap is unknown, not 0.
- installed_chrome on the 16 tasks: 14 of 16 verified against the acceptance baseline (ADR 0005, 7b56397b: final runs 11 and 7 of 16, probe runs 12 and 12): at or above both accepted runs

| Arm | Status | Verified (of planned) | False success | p50 ms | p95 ms | Cost | Gap to best competitor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| free | run | 43 of 51 | 1 | 6711 | 15500 | $0 | 0 |
| firecrawl | run | 43 of 51 | 6 | 3612 | 11627 | 78 credits by the account's usage before and after the arm | - |
| zenrows | run | 42 of 51 | 2 | 8424 | 80013 | 448 credits by the account's usage before and after the arm ($0.4480 as ZenRows prices them) | - |

| Arm | Healthy verified | Challenge16 verified | Rotation verified | Gap healthy | Gap challenge16 | Gap rotation |
| --- | --- | --- | --- | --- | --- | --- |
| free | 23 of 25 | 14 of 16 | 6 of 10 | -2 | 0 | 3 |
| firecrawl | 21 of 25 | 14 of 16 | 8 of 10 | - | - | - |
| zenrows | 20 of 25 | 13 of 16 | 9 of 10 | - | - | - |

An arm not run keeps its planned tasks in the denominator (all not verified). Verified and false-success counts are the runner's (research/access/run-set.mjs, cold attempts); each arm's record has the per-task table.
