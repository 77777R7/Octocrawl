# List handoff check, 2026-10-08

ROADMAP PA item 3, the last clause: a list stopped at a check at page N is handed to the person, verified at page N, and continues.

- Command: `node research/access/list-handoff-check.mjs --only T051 --batch 79cb5a5d-f900-4374-acb5-e8058858b3b5 --handoff --wait-ms 600000 --record research/access/runs/2026-10-09-list-handoff-fourth-ef13d80.md`
- Source commit: `ef13d80`
- API: http://127.0.0.1:8797. Network: the API process's own route, as each item's `access.egress` states (the driver's shell had HTTPS_PROXY=127.0.0.1:7890).
- Candidates: `research/access/list-challenge-candidates.v1.json`, 5 frozen before the run, 1 run; `maxPages` 5.
- Handoff: asked for every list stopped at a check at page 2 or later, `waitMs` 600000.

| Task | Host | Before: status / stop | Pages / items read | Check at page >= 2 | After the handoff | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| T051 | www.indeed.com | blocked (cloudflare_challenge) / challenge at page 2 (cloudflare_challenge) | 1 / 16 | yes | blocked, continued null, items 16, person's pages 0 | not verified |

An earlier run's batch handed off again (`--batch 79cb5a5d-f900-4374-acb5-e8058858b3b5`): "Before" is the item as that run left it.

Handoff answers (`POST /v1/batches/:id/handoff`): T051 `{"id":"79cb5a5d-f900-4374-acb5-e8058858b3b5","handedOff":1,"through":0,"notThrough":1,"items":[{"id":"b7787063-d62f-4535-b6ca-eafaf1eebcf0","url":"https://www.indeed.com/jobs?q=data+analyst&l=Remote","through":false,"status":"blocked","reason":"you got through the check at page 2, but did not page on in that tab in time: hand the batch over again to go on from there"}]}`.

Verified only as the driver's header states; a status alone never verifies. Raw items: `GET /v1/batches/<id>/items?debug=true` on the API's task root (not committed): T051 `79cb5a5d-f900-4374-acb5-e8058858b3b5`.

## Notes

- Run on 2026-10-08 UTC (2026-10-09 local), proxied as the earlier runs, on an API whose package code is `ef13d80` (the in-place address fix, `3a74da0`, and its hardening).
- The page was read this time: the answer says the person got through the check at page 2, so the reader took Indeed's rewritten address (`...&start=10&vjk=...`) for the page asked for, which the second run did not. That is the fix at work on the real site.
- Not through for another reason: after page 2 was read, no next page showed within the reader's 60 s (`idleMs`). The person was asking in the chat what to do next, after the page showed; the reader ended as `deadline` with only the check's page read, which keeps the item stopped for a later handoff to go on from page 2.
