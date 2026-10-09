# List handoff check, 2026-10-08

ROADMAP PA item 3, the last clause: a list stopped at a check at page N is handed to the person, verified at page N, and continues.

- Command: `node research/access/list-handoff-check.mjs --only T051 --batch 79cb5a5d-f900-4374-acb5-e8058858b3b5 --handoff --wait-ms 600000 --record research/access/runs/2026-10-09-list-handoff-retry-ec7c458.md`
- Source commit: `ec7c458`
- API: http://127.0.0.1:8797. Network: the API process's own route, as each item's `access.egress` states (the driver's shell had HTTPS_PROXY=127.0.0.1:7890).
- Candidates: `research/access/list-challenge-candidates.v1.json`, 5 frozen before the run, 1 run; `maxPages` 5.
- Handoff: asked for every list stopped at a check at page 2 or later, `waitMs` 600000.

| Task | Host | Before: status / stop | Pages / items read | Check at page >= 2 | After the handoff | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| T051 | www.indeed.com | blocked (cloudflare_challenge) / challenge at page 2 (cloudflare_challenge) | 1 / 16 | yes | blocked, continued null, items 16, person's pages 0 | not verified |

An earlier run's batch handed off again (`--batch 79cb5a5d-f900-4374-acb5-e8058858b3b5`): "Before" is the item as that run left it.

Handoff answers (`POST /v1/batches/:id/handoff`): T051 `{"id":"79cb5a5d-f900-4374-acb5-e8058858b3b5","handedOff":1,"through":0,"notThrough":1,"items":[{"id":"b7787063-d62f-4535-b6ca-eafaf1eebcf0","url":"https://www.indeed.com/jobs?q=data+analyst&l=Remote","through":false,"status":"blocked","reason":"https://www.indeed.com/jobs?q=data+analyst&l=Remote&radius=25&start=10&pp=gQAPAAAAAAAAAAAAAAACZU96rwAoAQAEe7KVDdo9YZYnEU7tUr6ROJ7cpc0j0kWDrNeZm7Kih-y7w9rRzAAA was not read: after you got through, the tab stayed on /jobs?q=data+analyst&l=Remote&radius=25&start=10&vjk=76ded92d4e1c0cb8, not the page asked for"}]}`.

Verified only as the driver's header states; a status alone never verifies. Raw items: `GET /v1/batches/<id>/items?debug=true` on the API's task root (not committed): T051 `79cb5a5d-f900-4374-acb5-e8058858b3b5`.

## Notes

- Run on 2026-10-08 UTC (2026-10-09 local), proxied as the first run (`2026-10-09-list-handoff-f3e382d.md`): the same API process on 8797, whose package code is that of `ec7c458` (unchanged since `eb1d81a`), the environment proxy `127.0.0.1:7890`. The person was signed in to Indeed from the first run.
- Why not through, from the answer: the reader read the tab at `/jobs?q=data+analyst&l=Remote&radius=25&start=10&vjk=76ded92d4e1c0cb8`, not the page asked for (`...&start=10&pp=<token>`), took the tab back twice, and gave up (`elsewhere`). Indeed's page rewrites its own address once it has come: it drops the paging token `pp` and adds the job it shows as `vjk`, with no new document. So the tab was on page 2 and the reader did not take it for page 2. This is the reader's limit, not the person's: the next commits reproduce it on a local fixture (`/rlist` in `packages/api/test/handoff.integration.test.ts`, which fails without the fix) and fix it.
- What the person saw (their account): page 2 of the list, with an Indeed "Updates to our Terms of Service" dialog over it; the handoff had already ended (the reader closes its tab when it gives up). The dialog is not why it ended. The person accepted Indeed's terms afterwards, on their own account; the test did not need it.
