# Real-site run 2026-10-04

Command: `node research/parity/run-sites.mjs --batch actions-real --record research/parity/runs/2026-10-04-actions-real-direct-82d166b.md`
Source commit: `82d166b3b0c00dd164549dee2ec22f7e4b314e55`
Run: 2026-10-04T09:08:36.844Z → 2026-10-04T09:10:44.904Z against http://127.0.0.1:8787
Network: NO_PROXY set in the runner's environment; 0 of 10 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 6/10; checks passing: 30/42.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| AR01 | https://ourworldindata.org/grapher/life-expectancy | 4/4 | — |
| AR02 | https://hub.docker.com/_/nginx | 1/4 | field status (action-step); traceEvent (action-step); markdownIncludes "linux/amd64" (action-tab-table) |
| AR03 | https://www.npmjs.com/package/react | 4/4 | — |
| AR04 | https://www.jsdelivr.com/package/npm/react | 4/4 | — |
| AR05 | https://github.com/topics/javascript | 1/4 | field status (action-step); traceEvent (action-step); field actions.lists.0.items (action-load-more) |
| AR06 | https://www.aljazeera.com/news/ | 1/4 | field status (action-step); traceEvent (action-step); field actions.lists.0.items (action-load-more) |
| AR07 | https://www.npr.org/sections/news/ | 1/4 | field status (action-step); traceEvent (action-step); field actions.lists.0.items (action-load-more) |
| AR08 | https://dev.to/ | 4/4 | — |
| AR09 | https://www.gov.uk/find-local-council | 5/5 | — |
| AR10 | https://hn.algolia.com/ | 5/5 | — |

Failed checks with the observed value:

- AR02 [action-step] field `status`: failed
- AR02 [action-step] traceEvent: 0 of 4 events match
- AR02 [action-tab-table] markdownIncludes `linux/amd64`: no markdown
- AR05 [action-step] field `status`: failed
- AR05 [action-step] traceEvent: 0 of 4 events match
- AR05 [action-load-more] field `actions.lists.0.items`: undefined vs undefined
- AR06 [action-step] field `status`: failed
- AR06 [action-step] traceEvent: 0 of 4 events match
- AR06 [action-load-more] field `actions.lists.0.items`: undefined vs undefined
- AR07 [action-step] field `status`: failed
- AR07 [action-step] traceEvent: 0 of 10 events match
- AR07 [action-load-more] field `actions.lists.0.items`: undefined vs 24
