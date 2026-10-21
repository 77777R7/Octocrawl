# Real-site run 2026-10-21

Command: `node research/parity/run-sites.mjs --only M17 --record research/parity/runs/2026-10-22-pa-d6-split-branch-direct-5bd45799.md`
Source commit: `5bd45799b93c697a437b2435a95defe8f5236bcf`
Engine: the API on 8793 ran this checkout, the PA D6 split-tables branch at `5bd45799` (`extract-tf/36`; the engine as at `cd60c260`, the case's header check corrected), after `npx tsc --build`, started with the proxy variables removed. Times are UTC; the local date (UTC+8) was 2026-10-22.
Run: 2026-10-21T17:38:48.412Z → 2026-10-21T17:38:51.575Z against http://127.0.0.1:8793
Network: NO_PROXY set in the runner's environment; 0 of 1 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 1/1; checks passing: 4/4.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| M17 | https://www.espn.com/nba/standings | 4/4 | — |

Note (written with the run): M17 went to `browser_local` (plain HTTP escalated). Each conference is one table of 14 columns and 15 teams, every team cell beside its statistics.
