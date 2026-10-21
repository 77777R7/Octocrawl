# Real-site run 2026-10-21

Command: `node research/parity/run-sites.mjs --only M16 --record research/parity/runs/2026-10-22-pa-d6-aggregate-branch-proxied-81adf9c3.md`
Source commit: `81adf9c3e4c5832abf431452230350a8c71071b9`
Engine: the API on 8793 ran this checkout, the PA D6 aggregate-offers branch at `81adf9c3` (`extract-tf/35`), after `npx tsc --build`, started with `HTTPS_PROXY`/`HTTP_PROXY` set to the local Clash proxy (`http://127.0.0.1:7890`). Times are UTC; the local date (UTC+8) was 2026-10-22.
Run: 2026-10-21T17:08:56.287Z → 2026-10-21T17:09:01.144Z against http://127.0.0.1:8793
Network: NO_PROXY set in the runner's environment; 1 of 1 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 1/1; checks passing: 4/4.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| M16 | https://www.skyscanner.net/routes/lond/pari/london-to-paris.html | 4/4 | — |

Note (written with the run): M16 went to `browser_local` (plain HTTP escalated) and got the full page; the Markdown keeps the deals section with its cards (14 "per passenger" prices, 61 `£` in all, against 4 on `main`).
