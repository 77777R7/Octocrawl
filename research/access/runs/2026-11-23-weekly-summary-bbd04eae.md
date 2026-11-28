# Weekly rerun: summary, 2026-11-23

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `summary`, week 2026-W48, run on 2026-11-23
- Source commit: `bbd04eae`
- Set: 51 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 10 (group 0 of 0–3, ISO week 48 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T003, T004, T006, T007, T009, T010, T011, T012, T013, T014
- Chrome: Google Chrome 157.0.8103.79 (previous weekly record: Google Chrome 156.0.8078.47; major version changed, the 16 tasks were run twice)
- Arms: free (run, [record](2026-11-23-weekly-free-bbd04eae.md)); firecrawl (run, [record](2026-11-23-weekly-firecrawl-bbd04eae.md)); arms not asked for: steel, zenrows
- Gap: the best competitor arm's verified count minus the arm's, on the same tasks; a negative gap is a lead. With no competitor arm run the gap is unknown, not 0.
- installed_chrome on the 16 tasks: 10 of 16 verified against the acceptance baseline (ADR 0005, 7b56397b: final runs 11 and 7 of 16, probe runs 12 and 12): at or above the lower accepted run (7), below the higher (11)
- installed_chrome on the 16 tasks: 9 of 16 verified against the acceptance baseline (ADR 0005, 7b56397b: final runs 11 and 7 of 16, probe runs 12 and 12): at or above the lower accepted run (7), below the higher (11)

| Arm | Status | Verified (of planned) | False success | p50 ms | p95 ms | Cost | Gap to best competitor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| free | run | 38 of 51 | 1 | 8770 | 21313 | $0 | 4 |
| firecrawl | run | 42 of 51 | 5 | 4281 | 12332 | 60 credits by the account's usage before and after the arm | - |

| Arm | Healthy verified | Challenge16 verified | Rotation verified | Gap healthy | Gap challenge16 | Gap rotation |
| --- | --- | --- | --- | --- | --- | --- |
| free | 21 of 25 | 10 of 16 | 7 of 10 | 1 | 3 | 0 |
| firecrawl | 22 of 25 | 13 of 16 | 7 of 10 | - | - | - |

An arm not run keeps its planned tasks in the denominator (all not verified). Verified and false-success counts are the runner's (research/access/run-set.mjs, cold attempts); each arm's record has the per-task table.
