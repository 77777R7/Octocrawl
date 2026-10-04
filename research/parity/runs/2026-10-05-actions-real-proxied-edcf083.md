# Real-site run 2026-10-04

Command: `node research/parity/run-sites.mjs --batch actions-real --record research/parity/runs/2026-10-05-actions-real-proxied-edcf083.md`
Source commit: `edcf0835e37f01c450e166766c8b9a9748817682`
Run: 2026-10-04T19:19:03.206Z → 2026-10-04T19:20:30.458Z against http://127.0.0.1:8787
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 13 of 13 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 11/13; checks passing: 53/57.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| AR01 | https://ourworldindata.org/grapher/life-expectancy | 4/4 | — |
| AR02 | https://hub.docker.com/_/nginx | 4/4 | — |
| AR03 | https://www.npmjs.com/package/react | 4/4 | — |
| AR04 | https://www.jsdelivr.com/package/npm/react | 4/4 | — |
| AR05 | https://github.com/topics/javascript | 4/4 | — |
| AR06 | https://www.aljazeera.com/news/ | 4/4 | — |
| AR07 | https://www.npr.org/sections/news/ | 1/4 | field status (action-step); traceEvent (action-step); field actions.lists.0.items (action-load-more) |
| AR08 | https://dev.to/ | 4/4 | — |
| AR09 | https://www.gov.uk/find-local-council | 5/5 | — |
| AR10 | https://hn.algolia.com/ | 4/5 | field actions.javascriptReturns.1.value (action-write) |
| AR11 | https://www.gov.uk/find-local-council | 5/5 | — |
| AR12 | https://hn.algolia.com/ | 5/5 | — |
| AR13 | https://dev.to/ | 5/5 | — |

Failed checks with the observed value:

- AR07 [action-step] field `status`: failed
- AR07 [action-step] traceEvent: 0 of 11 events match
- AR07 [action-load-more] field `actions.lists.0.items`: undefined vs 24
- AR10 [action-write] field `actions.javascriptReturns.1.value`: 30 vs 30
