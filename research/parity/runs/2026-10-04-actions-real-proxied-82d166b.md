# Real-site run 2026-10-04

Command: `node research/parity/run-sites.mjs --batch actions-real --record research/parity/runs/2026-10-04-actions-real-proxied-82d166b.md`
Source commit: `82d166b3b0c00dd164549dee2ec22f7e4b314e55`
Run: 2026-10-04T09:23:07.680Z → 2026-10-04T09:25:07.189Z against http://127.0.0.1:8787
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 10 of 10 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 6/10; checks passing: 34/42.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| AR01 | https://ourworldindata.org/grapher/life-expectancy | 4/4 | — |
| AR02 | https://hub.docker.com/_/nginx | 4/4 | — |
| AR03 | https://www.npmjs.com/package/react | 1/4 | field status (action-step); traceEvent (action-step); markdownIncludes "Downloads (Last 7 Days)" (action-tab-table) |
| AR04 | https://www.jsdelivr.com/package/npm/react | 4/4 | — |
| AR05 | https://github.com/topics/javascript | 4/4 | — |
| AR06 | https://www.aljazeera.com/news/ | 4/4 | — |
| AR07 | https://www.npr.org/sections/news/ | 1/4 | field status (action-step); traceEvent (action-step); field actions.lists.0.items (action-load-more) |
| AR08 | https://dev.to/ | 4/4 | — |
| AR09 | https://www.gov.uk/find-local-council | 4/5 | traceEvent (action-write-press) |
| AR10 | https://hn.algolia.com/ | 4/5 | field actions.javascriptReturns.1.value (action-write) |

Failed checks with the observed value:

- AR03 [action-step] field `status`: blocked
- AR03 [action-step] traceEvent: 0 of 9 events match
- AR03 [action-tab-table] markdownIncludes `Downloads (Last 7 Days)`: absent
- AR07 [action-step] field `status`: failed
- AR07 [action-step] traceEvent: 0 of 11 events match
- AR07 [action-load-more] field `actions.lists.0.items`: undefined vs 24
- AR09 [action-write-press] traceEvent: 0 of 11 events match
- AR10 [action-write] field `actions.javascriptReturns.1.value`: 30 vs 30
