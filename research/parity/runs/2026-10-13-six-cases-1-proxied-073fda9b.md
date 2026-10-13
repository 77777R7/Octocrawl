# Real-site run 2026-10-13

Command: `node research/parity/run-sites.mjs --only A19,A22,A23,T01,CA11,AC02 --record research/parity/runs/2026-10-13-six-cases-1-proxied-073fda9b.md`
Source commit: `073fda9b3509dedf707e7d7872af41cc9a77a53f`
Run: 2026-10-13T02:59:44.833Z → 2026-10-13T03:00:23.523Z against http://127.0.0.1:8797
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 5 of 6 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 6/6; checks passing: 31/31.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| A19 | https://httpbin.org/status/404 | 4/4 | — |
| A22 | https://httpbin.org/delay/10 | 5/5 | — |
| A23 | https://httpbin.org/delay/10 | 4/4 | — |
| T01 | https://httpbin.org/delay/10 | 7/7 | — |
| CA11 | https://httpbin.org/headers | 7/7 | — |
| AC02 | https://the-internet.herokuapp.com/dynamic_loading/2 | 4/4 | — |

Recorded values:

- A22 field elapsedMs: 3013
- A23 field elapsedMs: 11245
- T01 field summary.attempts.0.result.usage.wallMs: 10335.896875000002
- T01 field elapsedMs: 10342
