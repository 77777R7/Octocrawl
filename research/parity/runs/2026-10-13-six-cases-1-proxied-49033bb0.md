# Real-site run 2026-10-13

Command: `node research/parity/run-sites.mjs --only A19,A22,A23,T01,CA11,AC02 --record research/parity/runs/2026-10-13-six-cases-1-proxied-49033bb0.md`
Source commit: `49033bb0e33bc6088b6c04005a54c02de10f8915`
Run: 2026-10-13T02:58:01.545Z → 2026-10-13T02:58:43.985Z against http://127.0.0.1:8797
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

- A22 field elapsedMs: 3016
- A23 field elapsedMs: 10948
- T01 field summary.attempts.0.result.usage.wallMs: 10304.358124999999
- T01 field elapsedMs: 10310
