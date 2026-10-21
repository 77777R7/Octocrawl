# Real-site run 2026-10-21

Command: `node research/parity/run-sites.mjs --only M17 --record research/parity/runs/2026-10-22-pa-d6-split-branch-direct-ca915262.md`
Source commit: `ca91526229302597e950b80e06cfa92c9e6645b0` (working tree had uncommitted changes)
Engine: the API on 8793 ran this checkout, the PA D6 split-tables branch at `ca915262` (`extract-tf/36`; the review fix: pairs found on the page as received, only empty div/span wrappers between the halves, structure checked first), after `npx tsc --build`, started with the proxy variables removed. Times are UTC; the local date (UTC+8) was 2026-10-22.
Run: 2026-10-21T17:42:58.163Z → 2026-10-21T17:43:01.816Z against http://127.0.0.1:8793
Network: NO_PROXY set in the runner's environment; 0 of 1 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 1/1; checks passing: 4/4.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| M17 | https://www.espn.com/nba/standings | 4/4 | — |

Note (written with the run): repeats the `5bd45799` run after the review fix. M17 went to `browser_local` (plain HTTP escalated); each conference is one table of 14 columns and 15 teams, every team cell beside its statistics.
