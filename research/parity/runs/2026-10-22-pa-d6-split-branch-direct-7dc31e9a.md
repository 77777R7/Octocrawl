# Real-site run 2026-10-21

Command: `node research/parity/run-sites.mjs --only M17 --record research/parity/runs/2026-10-22-pa-d6-split-branch-direct-7dc31e9a.md`
Source commit: `7dc31e9aeafa0a7f9bd447a2cf450dbda8d05c37` (working tree had uncommitted changes)
Engine: the API on 8793 ran this checkout, the PA D6 split-tables branch at `7dc31e9a` (`extract-tf/36`; the second review fix: a tab panel or other region of its own between the halves keeps them apart), after `npx tsc --build`, started with the proxy variables removed. Times are UTC; the local date (UTC+8) was 2026-10-22.
Run: 2026-10-21T17:46:08.199Z → 2026-10-21T17:46:10.975Z against http://127.0.0.1:8793
Network: NO_PROXY set in the runner's environment; 0 of 1 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 1/1; checks passing: 4/4.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| M17 | https://www.espn.com/nba/standings | 4/4 | — |

Note (written with the run): repeats the `ca915262` run after the second review fix. M17 went to `browser_local` (plain HTTP escalated); each conference is one table of 14 columns and 15 teams. ESPN's scroller is a `role="region"`, which the rule allows.
