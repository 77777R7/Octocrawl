# Real-site run 2026-10-21

Command: `node research/parity/run-sites.mjs --only M17 --record research/parity/runs/2026-10-22-pa-d6-split-branch-proxied-5a0910b4.md`
Source commit: `5a0910b44ff0a2a878d68db5f73a566ddef9254a` (working tree had uncommitted changes)
Engine: the API on 8793 ran this checkout, the PA D6 split-tables branch at `5a0910b4` (`extract-tf/36`; the third review fix: panes hidden by style or aria-hidden, and a wide table opening with names of its own, keep the halves apart), after `npx tsc --build`, started with `HTTPS_PROXY`/`HTTP_PROXY` set to the local Clash proxy (`http://127.0.0.1:7890`). Times are UTC; the local date (UTC+8) was 2026-10-22.
Run: 2026-10-21T17:48:16.402Z → 2026-10-21T17:48:22.261Z against http://127.0.0.1:8793
Network: NO_PROXY set in the runner's environment; 1 of 1 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 1/1; checks passing: 4/4.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| M17 | https://www.espn.com/nba/standings | 4/4 | — |

Note (written with the run): repeats the `7dc31e9a` run after the third review fix. M17 went to `browser_local` (plain HTTP escalated); each conference is one table of 14 columns and 15 teams. The first value column (W) holds numbers, so the new name-list check lets it through.
