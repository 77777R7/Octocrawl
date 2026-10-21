# Real-site run 2026-10-21

Command: `node research/parity/run-sites.mjs --only M18 --record research/parity/runs/2026-10-22-pa-d6-leads-branch-proxied-1ec2b158.md`
Source commit: `1ec2b158c6f3698952c3f104284c26ec5a1f0ea2` (working tree had uncommitted changes)
Engine: the API on 8793 ran this checkout, the PA D6 collection-leads branch at `1ec2b158` (`extract-tf/37`; the review fix: one story per card, the page left untouched, more secondary sections left out), after `npx tsc --build`, started with `HTTPS_PROXY`/`HTTP_PROXY` set to the local Clash proxy (`http://127.0.0.1:7890`). Times are UTC; the local date (UTC+8) was 2026-10-22.
Run: 2026-10-21T18:19:24.415Z → 2026-10-21T18:19:28.028Z against http://127.0.0.1:8793
Network: NO_PROXY set in the runner's environment; 1 of 1 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 1/1; checks passing: 2/2.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| M18 | https://www.ft.com/technology | 2/2 | — |

Note (written with the run): repeats the `63a84154` run after the review fix. M18 went to `browser_local` (plain HTTP escalated); the Markdown holds 36 distinct article links under the page's own sections (Lead story in Technology, News, Opinion & Analysis, More Technology), no Recommended, Most Read or Promoted section.
