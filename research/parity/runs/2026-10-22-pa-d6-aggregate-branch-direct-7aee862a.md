# Real-site run 2026-10-21

Command: `node research/parity/run-sites.mjs --only M16 --record research/parity/runs/2026-10-22-pa-d6-aggregate-branch-direct-7aee862a.md`
Source commit: `7aee862ad18658bcf5d757e82356f2a070013236`
Engine: the API on 8793 ran this checkout, the PA D6 aggregate-offers branch at `7aee862a` (`extract-tf/35`; the review fix that keeps an offer grid only when its prices fill the declared range), after `npx tsc --build`, started with the proxy variables removed. Times are UTC; the local date (UTC+8) was 2026-10-22.
Run: 2026-10-21T17:12:02.265Z → 2026-10-21T17:12:05.842Z against http://127.0.0.1:8793
Network: NO_PROXY set in the runner's environment; 0 of 1 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 1/1; checks passing: 4/4.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| M16 | https://www.skyscanner.net/routes/lond/pari/london-to-paris.html | 4/4 | — |

Note (written with the run): repeats the `81adf9c3` run after the review fix. M16 went to `browser_local` (plain HTTP escalated), got the full page, and the Markdown keeps the deals section with its cards (14 "per passenger" prices, 61 `£`); the grid's lowest card price is the declared lowPrice.
