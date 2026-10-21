# Real-site run 2026-10-21

Command: `node research/parity/run-sites.mjs --only M18 --record research/parity/runs/2026-10-22-pa-d6-leads-branch-proxied-63a84154.md`
Source commit: `63a841544563329b544e695714b8a8f07217a639`
Engine: the API on 8793 ran this checkout, the PA D6 collection-leads branch at `63a84154` (`extract-tf/37`), after `npx tsc --build`, started with `HTTPS_PROXY`/`HTTP_PROXY` set to the local Clash proxy (`http://127.0.0.1:7890`). Times are UTC; the local date (UTC+8) was 2026-10-22.
Run: 2026-10-21T18:06:01.048Z → 2026-10-21T18:06:05.170Z against http://127.0.0.1:8793
Network: NO_PROXY set in the runner's environment; 1 of 1 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 1/1; checks passing: 2/2.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| M18 | https://www.ft.com/technology | 2/2 | — |

Note (written with the run): M18 went to `browser_local` (plain HTTP escalated). The Markdown holds 36 distinct article links, under the page's own sections: Lead story in Technology, News, Opinion & Analysis, then More Technology (the stream); no Recommended, Most Read or Promoted section. `main` gave 25 the same night (the `rest-main` proxied record, in #672).
