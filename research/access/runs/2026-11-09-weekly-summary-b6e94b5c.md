# Weekly rerun: summary, 2026-11-09

- Weekly rerun (docs/pa-enhancement-tasks.md P0.4, decision 7 of 2026-10-20): arm `summary`, week 2026-W46, run on 2026-11-09
- Source commit: `b6e94b5c`
- Set: 51 tasks = healthy 25 + challenge16 16 (research/access/subsets.v1.json) + rotation 10 (group 2 of 0–3, ISO week 46 mod 4, of the 36 frozen tasks outside the subset in tasks.v1.json order, cut 10/10/10/6)
- Rotation tasks this week: T037, T042, T043, T050, T055, T056, T057, T060, T064, T065
- Chrome: Google Chrome 156.0.8078.81 (previous weekly record: Google Chrome 156.0.8078.47)
- Arms: free (run, [record](2026-11-09-weekly-free-b6e94b5c.md)); firecrawl (run, [record](2026-11-09-weekly-firecrawl-b6e94b5c.md)); zenrows (run, [record](2026-11-09-weekly-zenrows-b6e94b5c.md)); arms not asked for: steel
- Gap: the best competitor arm's verified count minus the arm's, on the same tasks; a negative gap is a lead. With no competitor arm run the gap is unknown, not 0.
- installed_chrome on the 16 tasks: 13 of 16 verified against the acceptance baseline (ADR 0005, 7b56397b: final runs 11 and 7 of 16, probe runs 12 and 12): at or above both accepted runs

| Arm | Status | Verified (of planned) | False success | p50 ms | p95 ms | Cost | Gap to best competitor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| free | run | 38 of 51 | 0 | 4618 | 15617 | $0 | 3 |
| firecrawl | run | 41 of 51 | 6 | 3996 | 58753 | 76 credits by the account's usage before and after the arm | - |
| zenrows | run | 36 of 51 | 7 | 4426 | 83420 | 397 credits by the account's usage before and after the arm ($0.3970 as ZenRows prices them) | - |

| Arm | Healthy verified | Challenge16 verified | Rotation verified | Gap healthy | Gap challenge16 | Gap rotation |
| --- | --- | --- | --- | --- | --- | --- |
| free | 20 of 25 | 13 of 16 | 5 of 10 | 1 | 0 | 2 |
| firecrawl | 21 of 25 | 13 of 16 | 7 of 10 | - | - | - |
| zenrows | 20 of 25 | 11 of 16 | 5 of 10 | - | - | - |

An arm not run keeps its planned tasks in the denominator (all not verified). Verified and false-success counts are the runner's (research/access/run-set.mjs, cold attempts); each arm's record has the per-task table.
