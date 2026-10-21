# Real-site run 2026-10-21

Command: `node research/parity/run-sites.mjs --only M17 --record research/parity/runs/2026-10-22-pa-d6-split-branch-direct-cd60c260.md`
Source commit: `cd60c260dca049afaf283ad920f1815d2c146fe5`
Engine: the API on 8793 ran this checkout, the PA D6 split-tables branch at `cd60c260` (`extract-tf/36`), after `npx tsc --build`, started with the proxy variables removed. Times are UTC; the local date (UTC+8) was 2026-10-22.
Run: 2026-10-21T17:36:51.638Z → 2026-10-21T17:36:54.308Z against http://127.0.0.1:8793
Network: NO_PROXY set in the runner's environment; 0 of 1 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 0/1; checks passing: 3/4.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| M17 | https://www.espn.com/nba/standings | 3/4 | table (scrape-formats.markdown) |

Failed checks with the observed value:

- M17 [scrape-formats.markdown] table `^$ ^W$ ^L$ ^PCT$ ^GB$ ^HOME$ ^AWAY$ ^DIV$ ^CONF$ ^PPG$ ^OPP PPG$ ^DIFF$ ^STRK$ ^L10$`: 0 tables with this header

Note (written with the run): the join worked (each conference one table, the team column beside W, L, PCT … L10, no one-column table left), but the case's first header check took each column name as plain text, and ESPN writes most of them as sort links (`[W](https://www.espn.com/nba/standings/_/sort/wins/dir/desc)`). The check was corrected in `5bd45799` and the case run again on `main` and on the branch; this failed run stays as it was.
