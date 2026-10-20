# Real-site run 2026-10-20

Command: `node research/parity/run-sites.mjs --only L11,A30,A31 --record research/hosted/2026-10-20-h1-parity-hosted-r3b-0ebe8cdf.md`
Source commit: `0ebe8cdfb520949b06595f304bf0888682d39416`
Run: 2026-10-20T03:09:21.818Z → 2026-10-20T03:09:46.058Z against https://api.octocrawl.dev
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 0 of 3 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 2/3; checks passing: 8/11.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| L11 | https://www.data.gov.uk/search?q=energy | 3/3 | — |
| A30 | https://docs.python.org/3/ | 4/4 | — |
| A31 | https://docs.python.org/3/ | 1/4 | field status (7); field report.pagesFetched (7); itemUrls (7) |

Recorded values:

- L11 fetchSpacing: 3 fetches, smallest gap 252 ms, required 0 ms; robots.txt HTTP 200, Crawl-delay none, seed allowed

Failed checks with the observed value:

- A31 [7] field `status`: absent
- A31 [7] field `report.pagesFetched`: absent
- A31 [7] itemUrls `^https://docs\.python\.org/(?!3/whatsnew/)`: 0 pages, 0 outside the pattern
