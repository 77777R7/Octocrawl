# Weekly rerun: summary, 2026-11-16

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `summary`, week 2026-W47, run on 2026-11-16
- Source commit: `bbd04eae`
- Set: 47 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 6 (group 3 of 0–3, ISO week 47 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T066, T069, T070, T075, T078, T081
- Chrome: Google Chrome 157.0.8103.51 (previous weekly record: Google Chrome 156.0.8078.47; major version changed, the 16 tasks were run twice)
- Arms: free (run, [record](2026-11-16-weekly-free-bbd04eae.md)); firecrawl (not_run, [record](2026-11-16-weekly-firecrawl-bbd04eae.md)); arms not asked for: steel, zenrows
- Gap: the best competitor arm's verified count minus the arm's, on the same tasks; a negative gap is a lead. With no competitor arm run the gap is unknown, not 0.
- installed_chrome on the 16 tasks: 4 of 16 verified against the acceptance baseline (ADR 0005, 7b56397b: final runs 11 and 7 of 16, probe runs 12 and 12): **below the lower accepted run (7); stop the default recommendation, retest pending**
- installed_chrome on the 16 tasks: 3 of 16 verified against the acceptance baseline (ADR 0005, 7b56397b: final runs 11 and 7 of 16, probe runs 12 and 12): **below the lower accepted run (7); stop the default recommendation, retest pending**

| Arm | Status | Verified (of planned) | False success | p50 ms | p95 ms | Cost | Gap to best competitor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| free | run | 19 of 47 | 1 | 14066 | 1033955 | $0 | unknown (no competitor arm ran) |
| firecrawl | not_run (0 credits left, fewer than the 47 the arm needs (--min-credits); not started) | unknown of 47 | unknown | unknown | unknown | $0 | - |

| Arm | Healthy verified | Challenge16 verified | Rotation verified | Gap healthy | Gap challenge16 | Gap rotation |
| --- | --- | --- | --- | --- | --- | --- |
| free | 15 of 25 | 4 of 16 | 0 of 6 | unknown (no competitor arm ran) | unknown (no competitor arm ran) | unknown (no competitor arm ran) |
| firecrawl | 0 of 25 | 0 of 16 | 0 of 6 | - | - | - |

An arm not run keeps its planned tasks in the denominator (all not verified). Verified and false-success counts are the runner's (research/access/run-set.mjs, cold attempts); each arm's record has the per-task table.
