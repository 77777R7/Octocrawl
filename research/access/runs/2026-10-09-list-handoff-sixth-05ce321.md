# List handoff check, 2026-10-08

ROADMAP PA item 3, the last clause: a list stopped at a check at page N is handed to the person, verified at page N, and continues.

- Command: `node research/access/list-handoff-check.mjs --only T051 --handoff --wait-ms 600000 --record research/access/runs/2026-10-09-list-handoff-sixth-05ce321.md`
- Source commit: `05ce321`
- API: http://127.0.0.1:8797. Network: the API process's own route, as each item's `access.egress` states (the driver's shell had HTTPS_PROXY=127.0.0.1:7890).
- Candidates: `research/access/list-challenge-candidates.v1.json`, 5 frozen before the run, 1 run; `maxPages` 5.
- Handoff: asked for every list stopped at a check at page 2 or later, `waitMs` 600000.

| Task | Host | Before: status / stop | Pages / items read | Check at page >= 2 | After the handoff | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| T051 | www.indeed.com | blocked (cloudflare_challenge) / challenge at page 2 (cloudflare_challenge) | 1 / 16 | yes | success, continued {"from":2,"pages":4,"by":"user_browser"}, items 80, person's pages 4 | verified |

Handoff answers (`POST /v1/batches/:id/handoff`): T051 `{"id":"0ec219ef-e615-476c-8ad9-5037a7ea7452","handedOff":1,"through":1,"notThrough":0,"items":[{"id":"22403e63-5c9f-4e54-955e-5d7eff5da786","url":"https://www.indeed.com/jobs?q=data+analyst&l=Remote","through":true,"status":"success"}]}`.

Verified only as the driver's header states; a status alone never verifies. Raw items: `GET /v1/batches/<id>/items?debug=true` on the API's task root (not committed): T051 `0ec219ef-e615-476c-8ad9-5037a7ea7452`.

## Notes

- Run on 2026-10-08 UTC (2026-10-09 local), proxied as the earlier runs (the API on 8797 with the environment proxy `127.0.0.1:7890`, Clash with TUN on), on package code `05ce321`: the in-place address fix (`3a74da0`, `ef13d80`) and the continued list's item counts. A fresh batch: the earlier one's item had already gone through in the fifth run.
- Octocrawl's own browser read page 1 (16 items) and stopped at Indeed's Cloudflare check at page 2, as in every run before. The person, signed in to Indeed in their own Chrome, allowed the connection, clicked the list's margin, and clicked Next three times without stopping.
- Verified by the driver's rule, set before the first run: `continued.from` is 2 (the check's page), four pages are the person's (`by: "user_browser"`), the item is `success`, and `itemsRead` went from 16 to 80. `access.completion` is `handed_to_person`; `stoppedBy` is `max` (the candidate file's `maxPages` 5), so `list_not_exhausted` is warned.
- Cross-check from the stored pages (`actions.scrapes`, counting the step's `itemSelector` class `job_seen_beacon` in each page's HTML): 16 cards on each of five distinct result pages (no `start`, then `start=10`, `20`, `30`, `40`), 80 in all, equal to `itemsRead`.
- The denominator of this check is every run and candidate recorded on 2026-10-09: five candidates in the first run (four never reached a handoff, recorded there), and six handoffs of indeed's list: not through (cause unrecorded), not through (the address rewrite), no connection, not through (the 60 s wait), through but unverifiable (`itemsRead` null), and this one, through and verified. One site, one machine, one window.
