# List handoff check, 2026-10-08

ROADMAP PA item 3, the last clause: a list stopped at a check at page N is handed to the person, verified at page N, and continues.

- Command: `node research/access/list-handoff-check.mjs --only T051 --batch 79cb5a5d-f900-4374-acb5-e8058858b3b5 --handoff --wait-ms 600000 --record research/access/runs/2026-10-09-list-handoff-fifth-b47eb2f.md`
- Source commit: `b47eb2f`
- API: http://127.0.0.1:8797. Network: the API process's own route, as each item's `access.egress` states (the driver's shell had HTTPS_PROXY=127.0.0.1:7890).
- Candidates: `research/access/list-challenge-candidates.v1.json`, 5 frozen before the run, 1 run; `maxPages` 5.
- Handoff: asked for every list stopped at a check at page 2 or later, `waitMs` 600000.

| Task | Host | Before: status / stop | Pages / items read | Check at page >= 2 | After the handoff | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| T051 | www.indeed.com | blocked (cloudflare_challenge) / challenge at page 2 (cloudflare_challenge) | 1 / 16 | yes | success, continued {"from":2,"pages":4,"by":"user_browser"}, items —, person's pages 4 | not verified |

An earlier run's batch handed off again (`--batch 79cb5a5d-f900-4374-acb5-e8058858b3b5`): "Before" is the item as that run left it.

Handoff answers (`POST /v1/batches/:id/handoff`): T051 `{"id":"79cb5a5d-f900-4374-acb5-e8058858b3b5","handedOff":1,"through":1,"notThrough":0,"items":[{"id":"b7787063-d62f-4535-b6ca-eafaf1eebcf0","url":"https://www.indeed.com/jobs?q=data+analyst&l=Remote","through":true,"status":"success"}]}`.

Verified only as the driver's header states; a status alone never verifies. Raw items: `GET /v1/batches/<id>/items?debug=true` on the API's task root (not committed): T051 `79cb5a5d-f900-4374-acb5-e8058858b3b5`.

## Notes

- Run on 2026-10-08 UTC (2026-10-09 local), proxied as the earlier runs, on the same API as the fourth (package code `ef13d80`). The person did the whole handoff without stopping to ask: Allow, a click on the list's margin, then Next three times.
- The handoff went through (`through: 1`, `success`): `actions.lists[0]` is `{ stoppedBy: "max", rounds: 5, continued: { from: 2, pages: 4, by: "user_browser" } }`, `access.completion` is `handed_to_person`, the `list_continued` trace keeps page 1 from `browser_local`.
- The verdict stays "not verified": the driver's rule, set before the run, needs `itemsRead` to grow, and after the continuation `items` and `itemsRead` are both `null`, although the step has an `itemSelector`. That is a gap of the continuation (its list run is not recounted), not of this site; the next commits reproduce it on the local fixture and fix it.
- Read apart from that rule, from the stored pages (`actions.scrapes`, the batch's own HTML, counting the step's `itemSelector` class `job_seen_beacon`): page 1 by Octocrawl's browser, 16 cards, no `start`; pages 2 to 5 shown by the person, 16 cards each, at `start=10`, `20`, `30` and `40`, each with Indeed's rewritten `vjk`. Five distinct result pages, 80 cards, 64 of them from the person's pages. This count is mine, from the HTML, not a field Octocrawl wrote.
- `list_not_exhausted` is warned: the step stopped at its `maxPages` (5), not at the list's end.
