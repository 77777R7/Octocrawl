# List handoff check, 2026-10-08

ROADMAP PA item 3, the last clause: a list stopped at a check at page N is handed to the person, verified at page N, and continues.

- Command: `node research/access/list-handoff-check.mjs --only T051 --batch 79cb5a5d-f900-4374-acb5-e8058858b3b5 --handoff --wait-ms 600000 --record research/access/runs/2026-10-09-list-handoff-third-3a74da0.md`
- Source commit: `3a74da0`
- API: http://127.0.0.1:8797. Network: the API process's own route, as each item's `access.egress` states (the driver's shell had HTTPS_PROXY=127.0.0.1:7890).
- Candidates: `research/access/list-challenge-candidates.v1.json`, 5 frozen before the run, 1 run; `maxPages` 5.
- Handoff: asked for every list stopped at a check at page 2 or later, `waitMs` 600000.

| Task | Host | Before: status / stop | Pages / items read | Check at page >= 2 | After the handoff | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| T051 | www.indeed.com | blocked (cloudflare_challenge) / challenge at page 2 (cloudflare_challenge) | 1 / 16 | yes | blocked, continued null, items 16, person's pages 0 | not verified |

An earlier run's batch handed off again (`--batch 79cb5a5d-f900-4374-acb5-e8058858b3b5`): "Before" is the item as that run left it.

Handoff answers (`POST /v1/batches/:id/handoff`): T051 `{"error":"Chrome did not accept the connection (Allow not clicked, or remote debugging is off): open chrome://inspect/#remote-debugging in Chrome (144 or later), turn on \"Allow remote debugging for this browser instance\", then run this again (while it is on, every page sees navigator.webdriver true: turn it off when you are done)","code":"conflict"}`.

Verified only as the driver's header states; a status alone never verifies. Raw items: `GET /v1/batches/<id>/items?debug=true` on the API's task root (not committed): T051 `79cb5a5d-f900-4374-acb5-e8058858b3b5`.

## Notes

- Run on 2026-10-08 UTC (2026-10-09 local), proxied as the earlier two, on a restarted API whose package code is `3a74da0` (the fix for a page that rewrites its own address).
- Not a read of the page: the handoff never reached the person's tab. Chrome closed the connection before accepting it (`Chrome did not accept the connection (Allow not clicked, or remote debugging is off)`, answered 409), with its debugging port 9222 open. The restarted API made a new connection, which Chrome asks the person to allow; it was not allowed. The handoff was started before the person was at Chrome. This attempt says nothing about the fix.
