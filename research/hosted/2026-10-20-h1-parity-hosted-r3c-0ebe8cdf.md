# Real-site run 2026-10-20

Command: `node research/parity/run-sites.mjs --only A31 --record research/hosted/2026-10-20-h1-parity-hosted-r3c-0ebe8cdf.md`
Source commit: `0ebe8cdfb520949b06595f304bf0888682d39416`
Run: 2026-10-20T03:09:54.947Z → 2026-10-20T03:11:01.418Z against https://api.octocrawl.dev
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 0 of 1 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 0/1; checks passing: 3/4.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| A31 | https://docs.python.org/3/ | 3/4 | field report.pagesFetched (7) |

Failed checks with the observed value:

- A31 [7] field `report.pagesFetched`: 23
