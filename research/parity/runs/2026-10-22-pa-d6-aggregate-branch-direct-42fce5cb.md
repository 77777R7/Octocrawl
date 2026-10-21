# Real-site run 2026-10-21

Command: `node research/parity/run-sites.mjs --only M16 --record research/parity/runs/2026-10-22-pa-d6-aggregate-branch-direct-42fce5cb.md`
Source commit: `42fce5cbfdf3d99b5b0499d7988fb74dc768af3e` (working tree had uncommitted changes)
Engine: the API on 8793 ran this checkout, the PA D6 aggregate-offers branch at `42fce5cb` (`extract-tf/35`; the second review fix: the grid's heading must name the product, prices read text node by text node), after `npx tsc --build`, started with the proxy variables removed. Times are UTC; the local date (UTC+8) was 2026-10-22.
Run: 2026-10-21T17:15:53.850Z → 2026-10-21T17:15:58.136Z against http://127.0.0.1:8793
Network: NO_PROXY set in the runner's environment; 0 of 1 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 1/1; checks passing: 4/4.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| M16 | https://www.skyscanner.net/routes/lond/pari/london-to-paris.html | 4/4 | — |

Note (written with the run): repeats the `7aee862a` run after the second review fix. M16 went to `browser_local` (plain HTTP escalated) and got the full page; the Markdown keeps the deals section with its 14 cards (58 `£`). The three airport cards further down ("Paris Orly … from £22"), kept at `7aee862a`, are cut again as on `main`: the heading before them, "Alternative London to Paris routes", shares two of the five words of the product name ("Cheap Flights from London to Paris"), fewer than half.
